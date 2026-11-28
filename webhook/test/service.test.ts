import { createServer, request as httpRequest } from "node:http";
import { connect } from "node:net";
import { mkdirSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startService, type ServiceDependencies, type ServiceNotice } from "../src/service.js";
import { ServiceError } from "../src/service-config.js";
import { WebhookStore } from "../src/storage.js";
import { SigningKeyVault } from "../src/secrets.js";
import { HttpsTransport, type TransportDependencies, type TransportRequest } from "../src/transport.js";
import { verifyWebhook } from "../src/signatures.js";
import { runReplayCli } from "../src/replay-cli.js";
import { describeEventSearch } from "../src/event-search.js";
import { eventually, serviceFixture, START, END } from "./service-fixture.js";

let fixture: ReturnType<typeof serviceFixture>;
beforeEach(() => { fixture = serviceFixture(); });
afterEach(async () => { await fixture.cleanup(); });
async function start(dependencies: ServiceDependencies = {}, config: unknown = fixture.config) {
  const service = await startService(config, fixture.credentials, fixture.directory, { now: () => START, ...dependencies });
  fixture.services.push(service); return service;
}
async function provision(service: Awaited<ReturnType<typeof start>>) {
  expect((await fixture.call(service, "POST", "/v1/signing-keys", {
    secretRef: "runtime_key", secret: fixture.secret.toString("base64url"),
  })).status).toBe(201);
  const response = await fixture.call(service, "POST", "/v1/subscriptions", fixture.spec);
  expect(response.status).toBe(201);
  return response.json.id as string;
}

describe("service integration with synthetic schedules (not event accuracy evidence)", () => {
  it("discovers with the engine, signs a local POST, retries across restart, dead-letters and replays identical bytes", async () => {
    let now = START;
    const received: { body: Buffer; identity: string; timestamp: string; valid: boolean }[] = [];
    const effects = new Set<string>();
    const receiver = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on("data", chunk => chunks.push(chunk));
      request.on("end", () => {
        const body = Buffer.concat(chunks), identity = String(request.headers["idempotency-key"]);
        const valid = verifyWebhook({ body, headers: request.headers, secret: fixture.secret,
          expectedKeyId: "runtime_key", now: Math.floor(now / 1000) });
        received.push({ body, identity, timestamp: String(request.headers["x-webhook-timestamp"]), valid });
        if (!valid) { response.writeHead(401); response.end(); return; }
        effects.add(identity);
        if (received.length === 1) { request.socket.destroy(); return; } // Processed, acknowledgement lost.
        response.writeHead(received.length === 2 ? 503 : 204); response.end();
      });
    });
    fixture.servers.push(receiver);
    await new Promise<void>(resolve => receiver.listen(0, "127.0.0.1", resolve));
    const address = receiver.address();
    if (!address || typeof address === "string") throw new Error("Missing mock receiver address.");
    const transportDependencies: TransportDependencies = {
      resolve: vi.fn(async () => [{ address: "8.8.8.8", family: 4 as const }]),
      // Local HTTP receiver seam simulates authenticated TLS; no actual public connection or DNS.
      request: (options, receive) => {
        const request = httpRequest({ ...options, protocol: "http:", hostname: "127.0.0.1", port: address.port, agent: false }, receive);
        request.once("socket", socket => {
          Object.defineProperties(socket, { encrypted: { value: true }, authorized: { value: true }, remoteAddress: { value: "8.8.8.8" } });
          socket.once("connect", () => socket.emit("secureConnect"));
        });
        return request;
      },
    };
    const transport = new HttpsTransport({ deadlineMs: 1000, maxResponseBytes: 1024,
      maxResponseHeaderBytes: 8192, maxAddresses: 2 }, transportDependencies);
    const dependencies = { now: () => now, transport };
    const first = await start(dependencies);
    const id = await provision(first);
    const inspect = new WebhookStore(fixture.path);
    try {
      await eventually(() => inspect.getCursor(id)?.nextAt === END);
      const events = inspect.listEvents(id);
      expect(events).toHaveLength(1);
      const event = events[0]!;
      const payload = JSON.parse(event.payload);
      expect(payload.event.kind).toBe("ingress");
      expect(payload.event.positions.every((position: { receipt: { schema: string } }) =>
        position.receipt.schema === "zodiacs.calc-receipt.v1")).toBe(true);
      expect(received).toHaveLength(0); // Discovery ahead does not deliver before occurrence.
      now = event.occurredAt;
      await eventually(() => inspect.getDelivery(event.id)?.attemptCount === 1);
      expect(inspect.getDelivery(event.id)).toMatchObject({ status: "pending", availableAt: now + 1000 });
      expect(inspect.listAttempts(event.id)[0]?.result).toEqual({ kind: "network-error" });
      await first.stop(); await first.done;
      expect(inspect.getDelivery(event.id)?.attemptCount).toBe(1);
      now += 1000;
      const second = await start(dependencies);
      await eventually(() => inspect.getDelivery(event.id)?.status === "dead-letter");
      expect(inspect.listAttempts(event.id)[1]?.result).toEqual({ kind: "http", status: 503 });
      expect(inspect.getDeadLetter(event.id)).toMatchObject({ attemptNumber: 2, reason: "attempts-exhausted" });
      expect((await fixture.call(second, "GET", "/v1/dead-letters")).json.items).toHaveLength(1);
      await second.stop();
      now += 1000;
      const replay = runReplayCli(["requeue", "--db", fixture.path, "--event", event.id, "--attempt", "2",
        "--request", "synthetic-service-replay", "--apply"], () => now);
      expect(replay.exitCode).toBe(0);
      const third = await start(dependencies);
      await eventually(() => inspect.getDelivery(event.id)?.status === "delivered");
      const detail = await fixture.call(third, "GET", `/v1/deliveries/${event.id}`);
      expect(detail.json).toMatchObject({ status: "delivered", attemptCount: 3, deadLetter: null });
      expect(inspect.getEvent(event.id)).toEqual(event);
      expect(inspect.listEvents(id)).toHaveLength(1);
      expect(inspect.getCursor(id)?.nextAt).toBe(END);
      expect(inspect.listReplays(event.id)).toHaveLength(1);
      expect(received).toHaveLength(3);
      expect(received.every(item => item.valid && item.body.equals(Buffer.from(event.payload)) && item.identity === event.idempotencyKey)).toBe(true);
      expect(new Set(received.map(item => item.timestamp)).size).toBe(3);
      expect(effects.size).toBe(1); // Receiver deduplication, not service exactly-once semantics.
      expect(transportDependencies.resolve).toHaveBeenCalledTimes(3);
    } finally { inspect.close(); }
  });

  it("cancels an in-flight send, fences new work, closes partial control sockets and can reopen", async () => {
    let sent: TransportRequest | undefined;
    const transport = { send: vi.fn((request: TransportRequest) => { sent = request; return new Promise<never>(() => undefined); }) };
    let now = END;
    const service = await start({ now: () => now, transport });
    const id = await provision(service);
    const inspect = new WebhookStore(fixture.path);
    let socket: ReturnType<typeof connect> | undefined;
    try {
      await eventually(() => sent !== undefined);
      socket = connect(service.address.port, service.address.host);
      await new Promise<void>(resolve => socket!.once("connect", resolve));
      socket.write("POST /v1/subscriptions HTTP/1.1\r\nHost: localhost\r\n");
      const closed = new Promise<void>(resolve => socket!.once("close", () => resolve()));
      const firstStop = service.stop();
      expect(service.stop()).toBe(firstStop);
      await firstStop; await closed; await service.done;
      expect(sent?.signal?.aborted).toBe(true);
      expect(transport.send).toHaveBeenCalledTimes(1);
      const event = inspect.listEvents(id)[0]!;
      expect(inspect.listAttempts(event.id)[0]?.result).toEqual({ kind: "cancelled" });
      expect(inspect.getDelivery(event.id)?.status).toBe("pending");
      now += 1000;
      const restarted = await start({ now: () => now, transport: { send: async () => ({ kind: "http", status: 204 }) } });
      await eventually(() => inspect.getDelivery(event.id)?.status === "delivered");
      await restarted.stop();
      const vault = new SigningKeyVault(join(fixture.directory, "state/signing.sqlite"), fixture.credentials.wrappingKey);
      try { expect(vault.inspect("runtime_key")?.status).toBe("available"); } finally { vault.close(); }
    } finally { socket?.destroy(); inspect.close(); }
  });

  it("continues paginated polling past refused subscriptions and redacts observer failures", async () => {
    const notices: ServiceNotice[] = [];
    const search = vi.fn((input: Parameters<typeof describeEventSearch>[0]) => ({
      status: "refused" as const, reason: "evaluation-budget" as const, events: [] as [], evaluations: 0,
      search: describeEventSearch(input),
    }));
    const service = await start({ search, report: notice => { notices.push(notice); throw new Error("observer-private-marker"); } });
    const first = await provision(service);
    const second = (await fixture.call(service, "POST", "/v1/subscriptions", {
      ...fixture.spec, filter: { ...fixture.spec.filter, sign: "taurus" },
    })).json.id;
    const inspect = new WebhookStore(fixture.path);
    try {
      await eventually(() => ["aquarius", "taurus"].every(sign => search.mock.calls.filter(([input]) =>
        input.filter.kind === "ingress" && input.filter.sign === sign).length >= 2));
      expect(inspect.getCursor(first)?.nextAt).toBe(START);
      expect(inspect.getCursor(second)?.nextAt).toBe(START);
      expect(notices.every(item => JSON.stringify(item) === '{"kind":"scan-refused","reason":"evaluation-budget"}')).toBe(true);
      expect(inspect.listEvents(first)).toEqual([]);
      expect(inspect.listEvents(second)).toEqual([]);
      await service.stop();
      const count = search.mock.calls.length;
      await new Promise(resolve => setTimeout(resolve, 20));
      expect(search).toHaveBeenCalledTimes(count);
    } finally { inspect.close(); }
  });

  it("reports a fixed worker error and continues after a transient search exception", async () => {
    const notices: ServiceNotice[] = [];
    let calls = 0;
    const service = await start({ report: notice => notices.push(notice), search: input => {
      if (++calls === 1) throw new Error("untrusted-search-detail");
      return { status: "refused", reason: "evaluation-budget", events: [], evaluations: 0, search: describeEventSearch(input) };
    } });
    await provision(service);
    await eventually(() => notices.some(notice => notice.kind === "scan-refused"));
    expect(notices[0]).toEqual({ kind: "worker-error", worker: "scan" });
    expect(JSON.stringify(notices)).not.toContain("untrusted-search-detail");
  });

  it("drains a control write already in progress before closing storage", async () => {
    const service = await start({}, { ...fixture.config, shutdownGraceMs: 1000 });
    const socket = connect(service.address.port, service.address.host);
    socket.on("error", () => undefined);
    try {
      await new Promise<void>(resolve => socket.once("connect", resolve));
      const body = JSON.stringify({ ...fixture.spec, enabled: false });
      let response = "";
      socket.on("data", data => { response += data.toString(); });
      const closed = new Promise<void>(resolve => socket.once("close", () => resolve()));
      socket.write(`POST /v1/subscriptions HTTP/1.1\r\nHost: localhost\r\nAuthorization: Bearer ${fixture.credentials.adminToken.toString("base64url")}\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(body)}\r\n\r\n${body.slice(0, 1)}`);
      // Let Node enter the body reader; complete the write while shutdown drains.
      await new Promise(resolve => setTimeout(resolve, 20));
      const stopped = service.stop(); socket.end(body.slice(1));
      await stopped; await closed;
      expect(response).toContain("201 Created");
      const store = new WebhookStore(fixture.path);
      try { expect(store.listSubscriptions()).toHaveLength(1); } finally { store.close(); }
    } finally { socket.destroy(); }
  });

  it("cleans up failed startup and rejects symlinked state and invalid credentials with fixed errors", async () => {
    await expect(startService(fixture.config, { ...fixture.credentials, wrappingKey: new Uint8Array(0) }, fixture.directory))
      .rejects.toThrow("invalid-credentials");
    const occupied = createServer(); fixture.servers.push(occupied);
    await new Promise<void>(resolve => occupied.listen(0, "127.0.0.1", resolve));
    const address = occupied.address();
    if (!address || typeof address === "string") throw new Error("Missing occupied address.");
    await expect(start({}, { ...fixture.config, port: address.port })).rejects.toThrow("Webhook service: startup-failed.");
    const valid = await start(); await valid.stop();
    const wrong = { ...fixture.credentials, wrappingKey: Buffer.alloc(32) };
    await expect(startService(fixture.config, wrong, fixture.directory)).rejects.toThrow("startup-failed");
    const validAgain = await start(); await validAgain.stop();
    mkdirSync(join(fixture.directory, "real-state"));
    symlinkSync(join(fixture.directory, "real-state"), join(fixture.directory, "link-state"));
    await expect(start({}, { ...fixture.config, stateDirectory: "link-state" })).rejects.toThrow(ServiceError);
    symlinkSync(join(fixture.directory, "state/service.sqlite"), join(fixture.directory, "real-state/service.sqlite"));
    await expect(start({}, { ...fixture.config, stateDirectory: "real-state" })).rejects.toThrow(ServiceError);
  });
});
