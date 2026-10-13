import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DELIVERY_LIMITS, parseDeliveryPolicy } from "../src/delivery-policy.js";
import { STORAGE_SCHEMA_VERSION } from "../src/storage-db.js";
import { StorageError } from "../src/storage.js";
import { claimed, deliveryFixture, EVENT, NOW, POLICY } from "./delivery-fixture.js";

const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
let fixture: ReturnType<typeof deliveryFixture>;
beforeEach(() => { fixture = deliveryFixture(); });
afterEach(() => fixture.cleanup());
function failure(operation: () => unknown, code = "conflict") {
  expect(operation).toThrowError(new StorageError(code as StorageError["code"]));
}
function sql(statement: string) {
  const db = new DatabaseSync(fixture.path);
  try { db.exec(statement); } finally { db.close(); }
}

describe("exclusive durable delivery leases", () => {
  it("orders due records, skips active leases and never sends before the occurrence", () => {
    fixture.enqueue([EVENT, { ...EVENT, id: "event-b", occurrenceKey: "occurrence-b", idempotencyKey: "key-b", occurredAt: NOW + 200 }]);
    expect(fixture.store.claimDelivery(NOW, POLICY)).toEqual({ status: "idle" });
    const first = claimed(fixture.store.claimDelivery(NOW + 100, POLICY));
    expect(first.lease).toMatchObject({ eventId: EVENT.id, number: 1, startedAt: NOW + 100, expiresAt: NOW + 5100 });
    expect(first.event.payload).toBe(EVENT.payload);
    const other = fixture.open();
    expect(other.claimDelivery(NOW + 199, POLICY)).toEqual({ status: "idle" });
    expect(claimed(other.claimDelivery(NOW + 200, POLICY)).lease.eventId).toBe("event-b");
    expect(fixture.store.claimDelivery(NOW + 200, POLICY)).toEqual({ status: "idle" });
    fixture.store.close();
    expect(fixture.open().claimDelivery(NOW + 5000, POLICY)).toEqual({ status: "idle" });
  });

  it("fences expired, forged and completed tokens and prevents legacy writes from bypassing leases", () => {
    fixture.enqueue();
    const { lease } = claimed(fixture.store.claimDelivery(NOW + 100, POLICY));
    const finish = (token: string, at: number) => fixture.store.finishDelivery(EVENT.id, token, { kind: "http", status: 204 }, at);
    failure(() => finish("forged-token", NOW + 101));
    failure(() => finish(lease.token, lease.expiresAt));
    failure(() => finish(lease.token, lease.startedAt - 1), "invalid-input");
    failure(() => fixture.store.recordAttempt({ eventId: EVENT.id, number: 1, startedAt: NOW + 100,
      finishedAt: NOW + 101, result: { kind: "http", status: 204 } }, { status: "delivered" }));
    expect(finish(lease.token, NOW + 101).status).toBe("delivered");
    failure(() => finish(lease.token, NOW + 102));
    expect(fixture.store.claimDelivery(lease.expiresAt, POLICY)).toEqual({ status: "idle" });
    expect(fixture.store.listAttempts(EVENT.id)).toHaveLength(1);
  });

  it("recovers a crash after reopening with persisted policy, bytes, identity and bounded backoff", () => {
    fixture.enqueue();
    const { lease } = claimed(fixture.store.claimDelivery(NOW + 100, POLICY));
    const saved = fixture.store.getEvent(EVENT.id);
    fixture.store.close();
    const store = fixture.open();
    const changed = { ...POLICY, maxAttempts: 100, baseDelayMs: 1, maxDelayMs: 1, leaseMs: 10 };
    expect(store.claimDelivery(lease.expiresAt + 10_000, changed)).toMatchObject({ status: "recovered",
      delivery: { status: "pending", attemptCount: 1, availableAt: lease.expiresAt + 1000 } });
    expect(store.listAttempts(EVENT.id)).toEqual([{ eventId: EVENT.id, number: 1, startedAt: lease.startedAt,
      finishedAt: lease.expiresAt, result: { kind: "interrupted" } }]);
    const retry = claimed(store.claimDelivery(lease.expiresAt + 10_000, changed));
    expect(retry.lease.number).toBe(2);
    expect(retry.lease.expiresAt - retry.lease.startedAt).toBe(POLICY.leaseMs);
    expect(retry.event).toEqual(saved);
    failure(() => store.finishDelivery(EVENT.id, lease.token, { kind: "http", status: 200 }, retry.lease.startedAt));
    const failed = store.finishDelivery(EVENT.id, retry.lease.token, { kind: "timeout" }, retry.lease.startedAt + 1);
    expect(failed.availableAt).toBe(retry.lease.startedAt + 2001);
    const third = claimed(store.claimDelivery(failed.availableAt, changed));
    const next = store.finishDelivery(EVENT.id, third.lease.token, { kind: "network-error" }, failed.availableAt);
    expect(next.availableAt).toBe(failed.availableAt + 2500);
    const final = claimed(store.claimDelivery(next.availableAt, changed));
    expect(store.finishDelivery(EVENT.id, final.lease.token, { kind: "http", status: 429 }, next.availableAt).status).toBe("dead-letter");
    expect(store.getDeadLetter(EVENT.id)).toMatchObject({ reason: "attempts-exhausted", attemptNumber: 4 });
    expect(store.getEvent(EVENT.id)).toEqual(saved);
    expect(store.claimDelivery(next.availableAt + 100_000, POLICY)).toEqual({ status: "idle" });
  });

  it("counts repeated crashes toward exhaustion, including a crash before any request", () => {
    fixture.enqueue();
    const policy = { ...POLICY, maxAttempts: 2 };
    const first = claimed(fixture.store.claimDelivery(NOW + 100, policy));
    expect(fixture.store.claimDelivery(first.lease.expiresAt - 1, policy).status).toBe("idle");
    expect(fixture.store.claimDelivery(first.lease.expiresAt, policy).status).toBe("recovered");
    expect(fixture.store.claimDelivery(first.lease.expiresAt + 999, policy).status).toBe("idle");
    const second = claimed(fixture.store.claimDelivery(first.lease.expiresAt + 1000, policy));
    expect(fixture.store.claimDelivery(second.lease.expiresAt, POLICY)).toMatchObject({ status: "recovered", delivery: { status: "dead-letter" } });
    expect(fixture.store.listAttempts(EVENT.id).map(attempt => attempt.result)).toEqual([{ kind: "interrupted" }, { kind: "interrupted" }]);
    expect(fixture.store.getDeadLetter(EVENT.id)?.attemptNumber).toBe(2);
  });

  it("keeps the original destination and key reference after edits, disable and deletion", () => {
    fixture.enqueue();
    fixture.store.updateSubscription("synthetic-subscription", 1,
      { ...fixture.spec, enabled: false, secretRef: "other_key", callbackUrl: "https://other.example/" }, NOW + 101);
    fixture.store.deleteSubscription("synthetic-subscription", 2, NOW + 102);
    const claim = claimed(fixture.store.claimDelivery(NOW + 103, POLICY));
    expect(claim.delivery.callbackUrl).toBe(fixture.spec.callbackUrl);
    expect(claim.delivery.secretRef).toBe(fixture.spec.secretRef);
    expect(claim.event.subscriptionRevision).toBe(1);
  });

  it.each(["claim", "finish", "recovery", "dead-letter"])("rolls back the entire %s transaction on injected SQLite failure", stage => {
    fixture.enqueue();
    let lease = stage === "claim" ? undefined : claimed(fixture.store.claimDelivery(NOW + 100, { ...POLICY, maxAttempts: 1 })).lease;
    const before = fixture.store.getDelivery(EVENT.id);
    const table = stage === "claim" ? "delivery_leases" : stage === "dead-letter" ? "dead_letters" : "attempts";
    sql(`CREATE TRIGGER injected_failure BEFORE INSERT ON ${table} BEGIN SELECT RAISE(ABORT, 'private-marker'); END;`);
    const run = () => stage === "claim" ? fixture.store.claimDelivery(NOW + 100, POLICY)
      : stage === "recovery" ? fixture.store.claimDelivery(lease!.expiresAt, POLICY)
      : fixture.store.finishDelivery(EVENT.id, lease!.token,
        stage === "dead-letter" ? { kind: "timeout" } : { kind: "http", status: 204 }, NOW + 101);
    failure(run);
    expect(fixture.store.getDelivery(EVENT.id)).toEqual(before);
    expect(fixture.store.listAttempts(EVENT.id)).toEqual([]);
    expect(fixture.store.getDeadLetter(EVENT.id)).toBeUndefined();
    sql("DROP TRIGGER injected_failure");
    if (stage === "claim") lease = claimed(fixture.store.claimDelivery(NOW + 100, POLICY)).lease;
    expect(lease).toBeDefined();
    if (stage === "recovery") expect(run().status).toBe("recovered");
    else expect(fixture.store.finishDelivery(EVENT.id, lease!.token, { kind: "http", status: 204 }, NOW + 101).status).toBe("delivered");
  });

  it("pins only validated policies and refuses invalid clocks/outcomes without losing a lease", () => {
    expect(DELIVERY_LIMITS).toEqual({ maxAttempts: 100, baseDelayMs: 86400000, maxDelayMs: 604800000, leaseMs: 300000, deadlineMs: 60000 });
    for (const field of ["maxAttempts", "baseDelayMs", "maxDelayMs", "leaseMs"] as const) {
      expect(() => parseDeliveryPolicy({ ...POLICY, maxDelayMs: DELIVERY_LIMITS.maxDelayMs,
        [field]: DELIVERY_LIMITS[field] })).not.toThrow();
      for (const value of [0, -1, 0.1, NaN, Infinity, DELIVERY_LIMITS[field] + 1, "1", undefined]) {
        failure(() => fixture.store.claimDelivery(NOW, { ...POLICY, [field]: value } as never), "invalid-input");
      }
    }
    expect(() => parseDeliveryPolicy({ ...POLICY, baseDelayMs: 100, maxDelayMs: 99 })).toThrow();
    expect(() => parseDeliveryPolicy({ ...POLICY, leaseMs: 1 })).toThrow();
    expect(() => parseDeliveryPolicy({ ...POLICY, leaseMs: 2 })).not.toThrow();
    fixture.enqueue();
    for (const now of [NaN, Infinity, NOW + 0.1, 8640000000000000]) failure(() => fixture.store.claimDelivery(now, POLICY), "invalid-input");
    const { lease } = claimed(fixture.store.claimDelivery(NOW + 100, POLICY));
    for (const outcome of [{ kind: "interrupted" }, { kind: "http", status: 999 }, { kind: "private-marker" }]) {
      failure(() => fixture.store.finishDelivery(EVENT.id, lease.token, outcome as never, NOW + 101), "invalid-input");
    }
    expect(fixture.store.finishDelivery(EVENT.id, lease.token, { kind: "http", status: 200 }, NOW + 101).status).toBe("delivered");
  });

  it("migrates a deployed schema without changing retained bytes or attempt history", () => {
    fixture.enqueue();
    fixture.store.recordAttempt({ eventId: EVENT.id, number: 1, startedAt: NOW + 100,
      finishedAt: NOW + 101, result: { kind: "timeout" } }, { status: "pending", availableAt: NOW + 200 });
    const event = fixture.store.getEvent(EVENT.id);
    const attempts = fixture.store.listAttempts(EVENT.id);
    fixture.store.close();
    sql(`DROP TRIGGER delivery_policies_no_update; DROP TRIGGER delivery_policies_no_delete;
      DROP TRIGGER delivery_leases_no_update; DROP TABLE delivery_leases; DROP TABLE delivery_policies;
      DELETE FROM schema_migrations WHERE version = 3; PRAGMA user_version = 2;`);
    const source = readFileSync(new URL("../src/storage-db.ts", import.meta.url), "utf8");
    const migration = /version: 2,\s+sql: `([^`]+)`/u.exec(source)![1]!;
    expect(createHash("sha256").update(migration).digest("hex"))
      .toBe("0ea1bc8781d2bd5e7ae0a41be9f8be46e39e0df3132bab90f2e61228a4956851");
    const store = fixture.open();
    expect(store.getEvent(EVENT.id)).toEqual(event);
    expect(store.listAttempts(EVENT.id)).toEqual(attempts);
    expect(claimed(store.claimDelivery(NOW + 200, POLICY)).lease.number).toBe(2);
    const db = new DatabaseSync(fixture.path);
    try { expect(db.prepare("PRAGMA user_version").get()?.user_version).toBe(STORAGE_SCHEMA_VERSION); } finally { db.close(); }
  });

  it("moves already exhausted unmanaged history to dead letters without another send", () => {
    fixture.enqueue();
    fixture.store.recordAttempt({ eventId: EVENT.id, number: 1, startedAt: NOW + 100,
      finishedAt: NOW + 101, result: { kind: "timeout" } }, { status: "pending", availableAt: NOW + 101 });
    expect(fixture.store.claimDelivery(NOW + 101, { ...POLICY, maxAttempts: 1 })).toMatchObject({ status: "recovered", delivery: { status: "dead-letter" } });
    expect(fixture.store.listAttempts(EVENT.id)).toHaveLength(1);
    expect(fixture.store.getDeadLetter(EVENT.id)?.reason).toBe("attempts-exhausted");
  });

  it("allows acknowledgement on the final attempt and permanently protects the policy pin", () => {
    fixture.enqueue();
    const { lease } = claimed(fixture.store.claimDelivery(NOW + 100, { ...POLICY, maxAttempts: 1 }));
    for (const statement of [
      "UPDATE delivery_policies SET policy_json = '{}'",
      "DELETE FROM delivery_policies",
      "INSERT OR REPLACE INTO delivery_policies SELECT * FROM delivery_policies",
      "UPDATE delivery_leases SET expires_at = expires_at + 1",
    ]) {
      const db = new DatabaseSync(fixture.path, { enableForeignKeyConstraints: true });
      try {
        db.exec("PRAGMA recursive_triggers = ON");
        expect(() => db.exec(statement)).toThrow();
      } finally { db.close(); }
    }
    expect(fixture.store.finishDelivery(EVENT.id, lease.token, { kind: "http", status: 204 }, NOW + 101).status).toBe("delivered");
    expect(fixture.store.getDeadLetter(EVENT.id)).toBeUndefined();
    failure(() => fixture.store.recordAttempt({ eventId: EVENT.id, number: 2, startedAt: NOW + 102,
      finishedAt: NOW + 103, result: { kind: "http", status: 200 } }, { status: "delivered" }));
  });
});
