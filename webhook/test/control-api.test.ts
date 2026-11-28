import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createControlServer, CONTROL_DEFAULTS, CONTROL_LIMITS, ControlApiError } from "../src/control-api.js";
import { verifyWebhook } from "../src/signatures.js";
import { controlFixture } from "./control-fixture.js";
import { claimed, EVENT, NOW, POLICY } from "./delivery-fixture.js";

let f: Awaited<ReturnType<typeof controlFixture>>;
beforeEach(async () => { f = await controlFixture({ defaultPageSize: 2, maxPageSize: 3 }); });
afterEach(async () => { vi.restoreAllMocks(); await f.cleanup(); });
const items = (data: Record<string, unknown>) => data.items as Array<Record<string, unknown>>;

async function provision(reference: string) {
  const secret = randomBytes(32);
  const response = await f.call("POST", "/v1/signing-keys", { secretRef: reference, secret: secret.toString("base64url") });
  expect(response.status).toBe(201);
  expect(response.json).toEqual({ secretRef: reference, status: "available" });
  expect(response.body).not.toContain(secret.toString("base64url"));
  return secret;
}

describe("control authentication and configuration", () => {
  it("copies runtime tokens, starts unbound, rejects invalid settings and respects limits", async () => {
    const options = { store: f.store, vault: f.vault, bearerToken: f.token };
    for (const token of [undefined, "not-a-runtime-key", Buffer.alloc(31), Buffer.alloc(33)]) {
      expect(() => createControlServer({ ...options, bearerToken: token } as never)).toThrow(ControlApiError);
    }
    for (const [key, cap] of Object.entries({ maxRequestBytes: CONTROL_LIMITS.requestBytes,
      maxHeaderBytes: CONTROL_LIMITS.headerBytes, requestTimeoutMs: CONTROL_LIMITS.requestTimeoutMs,
      defaultPageSize: CONTROL_LIMITS.pageSize, maxPageSize: CONTROL_LIMITS.pageSize })) {
      for (const value of [0, -1, 1.5, NaN, Infinity, cap + 1, undefined]) {
        expect(() => createControlServer({ ...options, policy: { [key]: value } })).toThrow(ControlApiError);
      }
    }
    expect(() => createControlServer({ ...options, policy: { maxPageSize: 1 } })).toThrow(ControlApiError);
    expect(() => createControlServer({ ...options, policy: { typo: true } } as never)).toThrow(ControlApiError);
    expect(() => createControlServer({ ...options, now: 1 } as never)).toThrow(ControlApiError);
    const upperPolicy = { maxRequestBytes: 65536, maxHeaderBytes: 16384, requestTimeoutMs: 60000,
      defaultPageSize: 100, maxPageSize: 100 };
    const upper = createControlServer({ ...options, policy: upperPolicy });
    expect(upper.listening).toBe(false); upper.close();
    expect(CONTROL_DEFAULTS).toEqual({ maxRequestBytes: 16384, maxHeaderBytes: 8192, requestTimeoutMs: 5000,
      defaultPageSize: 25, maxPageSize: 100 });
    const token = randomBytes(32);
    const authorization = `Bearer ${token.toString("base64url")}`;
    const { port } = await f.start({ bearerToken: token }); token.fill(0);
    expect((await f.call("GET", "/v1/subscriptions", undefined, { authorization }, false, port)).status).toBe(200);
  });

  it("authenticates every route before reading a body or accessing persistence", async () => {
    const read = vi.spyOn(f.store, "listSubscriptions");
    const write = vi.spyOn(f.store, "createSubscription");
    const keyWrite = vi.spyOn(f.vault, "provision");
    const paths = ["/v1/subscriptions", "/v1/subscriptions/synthetic-subscription", "/v1/signing-keys",
      "/v1/signing-keys/runtime_key", "/v1/deliveries", "/v1/deliveries/synthetic-event/attempts", "/v1/dead-letters", "/unknown"];
    for (const path of paths) {
      const result = await f.call("POST", path, Buffer.from("malformed-runtime-body"), {}, false);
      expect(result.status).toBe(401);
      expect(result.json).toEqual({ error: { code: "unauthorized" } });
      expect(result.headers["www-authenticate"]).toBe("Bearer");
      expect(result.headers["cache-control"]).toBe("no-store");
      expect(result.headers["x-content-type-options"]).toBe("nosniff");
    }
    for (const authorization of [randomBytes(32).toString("base64url"), `Bearer ${randomBytes(32).toString("base64url")}`,
      `${f.auth}=`, `${f.auth}, ${f.auth}`]) {
      expect((await f.call("GET", "/v1/subscriptions", undefined, { authorization }, false)).status).toBe(401);
    }
    const duplicate = await f.raw(`GET /v1/subscriptions HTTP/1.1\r\nHost: localhost\r\nAuthorization: ${f.auth}\r\nAuthorization: ${f.auth}\r\n\r\n`);
    expect(duplicate).toContain("401 Unauthorized");
    const response = await f.raw(`POST /v1/signing-keys HTTP/1.1\r\nHost: localhost\r\nContent-Length: 10000\r\n\r\n`);
    expect(response).toContain("401 Unauthorized");
    expect(read).not.toHaveBeenCalled(); expect(write).not.toHaveBeenCalled(); expect(keyWrite).not.toHaveBeenCalled();
    const origin = await f.call("GET", "/v1/subscriptions", undefined, { origin: "https://browser.example" });
    expect(origin.status).toBe(403); expect(origin.headers["access-control-allow-origin"]).toBeUndefined();
    expect(read).not.toHaveBeenCalled();
  });
});

describe("subscription CRUD and signing-key custody", () => {
  it("provisions runtime keys without export and validates availability before activation", async () => {
    const secret = await provision("control_key");
    const inspect = await f.call("GET", "/v1/signing-keys/control_key");
    expect(inspect.json).toEqual({ secretRef: "control_key", status: "available" });
    const body = Buffer.from('{"synthetic":true}');
    const signed = f.vault.sign("control_key", { body, timestamp: 946684800, idempotencyKey: "control-synthetic" });
    expect(verifyWebhook({ body, headers: signed, secret, expectedKeyId: "control_key", now: 946684800 })).toBe(true);
    const duplicate = await f.call("POST", "/v1/signing-keys", { secretRef: "control_key", secret: randomBytes(32).toString("base64url") });
    expect(duplicate.status).toBe(409); expect(duplicate.json).toEqual({ error: { code: "key-conflict" } });
    expect((await f.call("GET", "/v1/signing-keys/absent_key")).status).toBe(404);
    const enabled = await f.call("POST", "/v1/subscriptions", { ...f.spec, secretRef: "absent_key" });
    expect(enabled.status).toBe(409); expect(enabled.json).toEqual({ error: { code: "key-unavailable" } });
    const draft = await f.call("POST", "/v1/subscriptions", { ...f.spec, enabled: false, secretRef: "absent_key" });
    expect(draft.status).toBe(201);
    expect((await f.call("PUT", `/v1/subscriptions/${draft.json.id}`, { ...f.spec, secretRef: "absent_key" }, { "if-match": '"1"' })).status).toBe(409);
    expect(f.store.getSubscription(draft.json.id as string)?.revision).toBe(1);
    expect((await f.call("DELETE", "/v1/signing-keys/control_key")).json).toEqual({ secretRef: "control_key", status: "revoked" });
    expect((await f.call("DELETE", "/v1/signing-keys/control_key")).status).toBe(200);
    expect((await f.call("POST", "/v1/subscriptions", { ...f.spec, secretRef: "control_key" })).status).toBe(409);
    expect(f.vault.inspect("control_key")?.status).toBe("revoked");
    secret.fill(0);
  });

  it("creates, reads, replaces and tombstones subscriptions while retaining queued snapshots", async () => {
    f.enqueue();
    const savedEvent = f.store.getEvent(EVENT.id);
    const savedDelivery = f.store.getDelivery(EVENT.id);
    const created = await f.call("POST", "/v1/subscriptions", f.spec);
    expect(created.status).toBe(201); expect(created.headers.etag).toBe('"1"');
    expect(created.headers.location).toBe(`/v1/subscriptions/${created.json.id}`);
    expect(created.json).toMatchObject({ revision: 1, spec: { enabled: true }, createdAt: NOW + 200, deletedAt: null });
    expect(f.store.getCursor(created.json.id as string)?.nextAt).toBe(NOW);
    const path = "/v1/subscriptions/synthetic-subscription";
    const read = await f.call("GET", path);
    expect(read.status).toBe(200); expect(read.headers.etag).toBe('"1"');
    const secret = await provision("rotation_key");
    const replacement = { ...f.spec, callbackUrl: "https://changed.example/runtime-query?private=yes", secretRef: "rotation_key",
      window: { start: new Date(NOW + 1000).toISOString(), end: new Date(NOW + 2000).toISOString() }, enabled: false };
    const updated = await f.call("PUT", path, replacement, { "if-match": '"1"' });
    expect(updated.status).toBe(200); expect(updated.headers.etag).toBe('"2"');
    expect(updated.json).toMatchObject({ revision: 2, spec: replacement });
    expect(f.store.getCursor("synthetic-subscription")).toEqual({ subscriptionId: "synthetic-subscription", revision: 2, nextAt: NOW + 1000 });
    const deleted = await f.call("DELETE", path, undefined, { "if-match": '"2"' });
    expect(deleted.status).toBe(200); expect(deleted.headers.etag).toBe('"3"');
    expect(deleted.json).toMatchObject({ revision: 3, deletedAt: NOW + 200 });
    expect((await f.call("GET", path)).json).toEqual(deleted.json);
    expect(items((await f.call("GET", "/v1/subscriptions?limit=3")).json).map(record => record.id)).not.toContain("synthetic-subscription");
    expect((await f.call("DELETE", path, undefined, { "if-match": '"3"' })).status).toBe(404);
    expect((await f.call("PUT", path, f.spec, { "if-match": '"3"' })).status).toBe(404);
    expect(f.store.getEvent(EVENT.id)).toEqual(savedEvent); expect(f.store.getDelivery(EVENT.id)).toEqual(savedDelivery);
    const claim = claimed(f.store.claimDelivery(NOW + 200, POLICY));
    expect(claim.delivery.secretRef).toBe("runtime_key"); expect(claim.delivery.callbackUrl).toBe(f.spec.callbackUrl);
    secret.fill(0);
  });

  it("requires an exact revision and prevents lost updates across concurrent requests", async () => {
    const path = "/v1/subscriptions/synthetic-subscription";
    for (const method of ["PUT", "DELETE"]) {
      const input = method === "PUT" ? f.spec : undefined;
      expect((await f.call(method, path, input)).status).toBe(428);
      for (const match of ['*', 'W/"1"', '"0"', '"01"', '1', '"1", "2"', '"9007199254740992"']) {
        expect((await f.call(method, path, input, { "if-match": match })).status).toBe(400);
      }
      expect((await f.call(method, path, input, { "if-match": '"2"' })).status).toBe(412);
    }
    const results = await Promise.all([
      f.call("PUT", path, { ...f.spec, enabled: false }, { "if-match": '"1"' }),
      f.call("PUT", path, { ...f.spec, callbackUrl: "https://changed.example/events" }, { "if-match": '"1"' }),
    ]);
    expect(results.map(result => result.status).sort()).toEqual([200, 412]);
    expect(f.store.getSubscription("synthetic-subscription")?.revision).toBe(2);
    const snapshot = f.store.getSubscription("synthetic-subscription");
    const bad = await f.call("PUT", path, { ...f.spec, filter: { kind: "custom", expression: "next Moon ingress" } }, { "if-match": '"2"' });
    expect(bad.status).toBe(400); expect(bad.json).toEqual({ error: { code: "invalid-subscription", field: "filter.expression" } });
    expect(f.store.getSubscription("synthetic-subscription")).toEqual(snapshot);
    expect((await f.call("DELETE", "/v1/subscriptions/unknown", undefined, { "if-match": '"1"' })).status).toBe(404);
  });

  it("persists API writes and permanent revocation after reopening independent connections", async () => {
    const secret = await provision("persisted_key"); secret.fill(0);
    const created = await f.call("POST", "/v1/subscriptions", { ...f.spec, secretRef: "persisted_key" });
    await f.call("DELETE", "/v1/signing-keys/persisted_key");
    f.store.close(); f.vault.close();
    const { port } = await f.start({ store: f.open(), vault: f.openVault() });
    expect((await f.call("GET", `/v1/subscriptions/${created.json.id}`, undefined, {}, true, port)).json).toEqual(created.json);
    expect((await f.call("GET", "/v1/signing-keys/persisted_key", undefined, {}, true, port)).json).toEqual({ secretRef: "persisted_key", status: "revoked" });
  });
});

describe("redacted delivery inspection and pagination", () => {
  it("exposes a fixed log projection without fetching payloads, key references, destinations or lease tokens", async () => {
    const marker = randomBytes(32).toString("base64url");
    f.enqueue([{ ...EVENT, payload: JSON.stringify({ privateMarker: marker, receipt: { privateMarker: marker } }) }]);
    const event = vi.spyOn(f.store, "getEvent");
    const original = f.store.getDelivery(EVENT.id);
    const claim = claimed(f.store.claimDelivery(NOW + 200, POLICY));
    event.mockClear();
    const list = await f.call("GET", "/v1/deliveries");
    const detail = await f.call("GET", `/v1/deliveries/${EVENT.id}`);
    expect(list.json).toEqual({ items: [{ eventId: EVENT.id, subscriptionId: "synthetic-subscription",
      subscriptionRevision: 1, occurredAt: NOW + 100, status: "pending", availableAt: NOW + 100,
      attemptCount: 0, updatedAt: NOW }], nextAfter: null });
    expect(detail.json).toEqual({ ...items(list.json)[0], deadLetter: null });
    expect(event).not.toHaveBeenCalled();
    for (const value of [marker, f.auth, f.secret.toString("base64url"), claim.lease.token, original!.callbackUrl,
      original!.secretRef, original!.idempotencyKey, "payload", "payloadSha256", "occurrenceKey", "token", "signature"]) {
      expect(list.body).not.toContain(value); expect(detail.body).not.toContain(value);
    }
    f.store.finishDelivery(EVENT.id, claim.lease.token, { kind: "http", status: 503 }, NOW + 210);
    const again = claimed(f.store.claimDelivery(NOW + 1210, POLICY));
    f.store.finishDelivery(EVENT.id, again.lease.token, { kind: "destination-rejected" }, NOW + 1220);
    const attempts = await f.call("GET", `/v1/deliveries/${EVENT.id}/attempts?limit=1`);
    expect(attempts.json).toEqual({ items: [{ eventId: EVENT.id, number: 1, startedAt: NOW + 200,
      finishedAt: NOW + 210, result: { kind: "http", status: 503 } }], nextAfter: 1 });
    const remaining = await f.call("GET", `/v1/deliveries/${EVENT.id}/attempts?limit=2&after=1`);
    expect(items(remaining.json)).toHaveLength(1); expect(items(remaining.json)[0]?.result).toEqual({ kind: "destination-rejected" });
    expect(remaining.json.nextAfter).toBeNull();
    const dead = await f.call("GET", "/v1/dead-letters");
    expect(items(dead.json)[0]).toEqual({ eventId: EVENT.id, attemptNumber: 2, reason: "destination-rejected", createdAt: NOW + 1220 });
    expect((await f.call("GET", `/v1/deliveries/${EVENT.id}`)).json).toMatchObject({ status: "dead-letter", deadLetter: items(dead.json)[0] });
    expect((await f.call("GET", "/v1/deliveries/missing/attempts")).status).toBe(404);
  });

  it("paginates every listing exclusively with bounded limits and tombstones omitted", async () => {
    for (const id of ["sub-c", "sub-a", "sub-b"]) f.store.createSubscription(id, f.spec, NOW);
    f.store.deleteSubscription("synthetic-subscription", 1, NOW + 1);
    const first = await f.call("GET", "/v1/subscriptions");
    expect(items(first.json).map(record => record.id)).toEqual(["sub-a", "sub-b"]); expect(first.json.nextAfter).toBe("sub-b");
    expect((await f.call("GET", "/v1/subscriptions?after=sub-b")).json).toMatchObject({ items: [{ id: "sub-c" }], nextAfter: null });
    const events = ["event-c", "event-a", "event-b"].map(id => ({ ...EVENT, id, occurrenceKey: id, idempotencyKey: id }));
    f.store.commitScan({ subscriptionId: "sub-a", expectedRevision: 1, from: NOW, to: NOW + 60000, now: NOW, events });
    for (const event of events) f.store.recordAttempt({ eventId: event.id, number: 1, startedAt: NOW + 100,
      finishedAt: NOW + 101, result: { kind: "timeout" } }, { status: "dead-letter", reason: "operator" });
    for (const path of ["/v1/deliveries", "/v1/dead-letters"]) {
      const page = await f.call("GET", path);
      expect(items(page.json).map(record => record.eventId)).toEqual(["event-a", "event-b"]); expect(page.json.nextAfter).toBe("event-b");
      expect(items((await f.call("GET", `${path}?after=event-b`)).json).map(record => record.eventId)).toEqual(["event-c"]);
      const full = await f.call("GET", `${path}?limit=3`); expect(full.json.nextAfter).toBe("event-c");
      expect((await f.call("GET", `${path}?after=event-c`)).json).toEqual({ items: [], nextAfter: null });
    }
    for (const path of ["/v1/subscriptions", "/v1/deliveries", "/v1/dead-letters", "/v1/deliveries/event-a/attempts"]) {
      for (const query of ["limit=0", "limit=4", "limit=1.5", "limit=01", "limit=Infinity", "limit=", "limit=1&limit=2",
        "after=a&after=b", "after=", "after=bad%20value", "token=runtime-query-only"]) {
        expect((await f.call("GET", `${path}?${query}`)).status).toBe(400);
      }
    }
    expect((await f.call("GET", "/v1/deliveries/event-a/attempts?after=9007199254740992")).status).toBe(400);
  });
});
