import { createServer, request as httpRequest, type IncomingMessage, type ServerResponse } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DeliveryWorker, DeliveryWorkerError, type DeliveryTransport } from "../src/delivery-worker.js";
import { verifyWebhook } from "../src/signatures.js";
import { StorageError } from "../src/storage.js";
import { HttpsTransport, type TransportDependencies, type TransportRequest, type TransportResult } from "../src/transport.js";
import { claimed, deliveryFixture, EVENT, NOW, POLICY } from "./delivery-fixture.js";

let fixture: ReturnType<typeof deliveryFixture>;
let now: number;
beforeEach(() => { fixture = deliveryFixture(); now = NOW + 100; });
afterEach(() => { vi.useRealTimers(); fixture.cleanup(); });
function worker(transport: DeliveryTransport, policy = POLICY) {
  return new DeliveryWorker(fixture.store, fixture.vault, transport, policy, () => now);
}
function controlled() {
  let resolve!: (result: TransportResult) => void;
  const send = vi.fn((_input: TransportRequest) => new Promise<TransportResult>(done => { resolve = done; }));
  return { send, resolve: (result: TransportResult) => resolve(result) };
}
async function started() { await Promise.resolve(); await Promise.resolve(); }
async function receiver(handler: (request: IncomingMessage, response: ServerResponse) => void,
  run: (dependencies: TransportDependencies) => Promise<void>) {
  const server = createServer(handler);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing receiver address.");
  const dependencies: TransportDependencies = {
    resolve: vi.fn(async () => [{ address: "8.8.8.8", family: 4 as const }]),
    // Trusted seam sends only to loopback and simulates the authenticated TLS peer.
    request: (options, receive) => {
      const request = httpRequest({ ...options, protocol: "http:", hostname: "127.0.0.1", port: address.port, agent: false }, receive);
      request.once("socket", socket => {
        Object.defineProperties(socket, { encrypted: { value: true }, authorized: { value: true }, remoteAddress: { value: "8.8.8.8" } });
        socket.once("connect", () => socket.emit("secureConnect"));
      });
      return request;
    },
  };
  try { await run(dependencies); } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

describe("delivery worker policy and lifecycle", () => {
  it("validates and copies policy, rejects malformed inputs, and starts no background work", async () => {
    const transport = { send: vi.fn(async (): Promise<TransportResult> => ({ kind: "http", status: 204 })) };
    for (const value of [0, -1, 1.5, NaN, Infinity, POLICY.leaseMs, 60001, undefined]) {
      expect(() => worker(transport, { ...POLICY, deadlineMs: value } as never)).toThrow(DeliveryWorkerError);
    }
    expect(() => worker(transport, { ...POLICY, leaseMs: 60001, deadlineMs: 60000 })).not.toThrow();
    expect(() => worker(transport, { ...POLICY, leaseMs: 2, deadlineMs: 1 })).not.toThrow();
    for (const policy of [null, undefined, {}, { ...POLICY, maxAttempts: 0 }]) {
      expect(() => new DeliveryWorker(fixture.store, fixture.vault, transport, policy as never)).toThrow(DeliveryWorkerError);
    }
    const mutable = { ...POLICY };
    const instance = worker(transport, mutable);
    mutable.maxAttempts = 0;
    mutable.leaseMs = 0;
    expect(transport.send).not.toHaveBeenCalled();
    await expect(instance.deliverNext({ signal: {} } as never)).rejects.toThrow(DeliveryWorkerError);
    expect(await instance.deliverNext()).toEqual({ status: "idle" });
    fixture.enqueue();
    const controller = new AbortController(); controller.abort();
    expect(await instance.deliverNext({ signal: controller.signal })).toEqual({ status: "cancelled" });
    expect(fixture.store.listAttempts(EVENT.id)).toEqual([]);
    expect(await instance.deliverNext()).toMatchObject({ status: "attempted", delivery: { status: "delivered" } });
  });

  it("uses independent connections to exclude overlapping workers and persists across vault/store reopen", async () => {
    fixture.enqueue();
    const transport = controlled();
    const first = worker(transport).deliverNext();
    await started();
    const secondStore = fixture.open();
    const secondTransport = { send: vi.fn(async (): Promise<TransportResult> => ({ kind: "http", status: 200 })) };
    const second = new DeliveryWorker(secondStore, fixture.openVault(), secondTransport, POLICY, () => now);
    expect(await second.deliverNext()).toEqual({ status: "idle" });
    expect(secondTransport.send).not.toHaveBeenCalled();
    transport.resolve({ kind: "http", status: 204 });
    expect(await first).toMatchObject({ status: "attempted", delivery: { attemptCount: 1, status: "delivered" } });
    fixture.store.close(); fixture.vault.close();
    expect(await second.deliverNext()).toEqual({ status: "idle" });
    expect(secondStore.getDelivery(EVENT.id)?.status).toBe("delivered");
  });

  it("does not call the transport if cancellation arrives before its queued send", async () => {
    fixture.enqueue();
    const transport = controlled();
    const controller = new AbortController();
    const pending = worker(transport).deliverNext({ signal: controller.signal });
    controller.abort();
    expect(await pending).toMatchObject({ status: "attempted", delivery: { status: "pending", attemptCount: 1 } });
    expect(transport.send).not.toHaveBeenCalled();
    expect(fixture.store.listAttempts(EVENT.id)[0]?.result).toEqual({ kind: "cancelled" });
  });

  it("ignores a late acknowledgement after recovery grants a newer attempt", async () => {
    fixture.enqueue();
    const transport = controlled();
    const first = worker(transport).deliverNext();
    await started();
    const other = fixture.open();
    now += POLICY.leaseMs;
    expect(other.claimDelivery(now, POLICY).status).toBe("recovered");
    now += POLICY.baseDelayMs;
    const newer = claimed(other.claimDelivery(now, POLICY));
    transport.resolve({ kind: "http", status: 200 });
    expect(await first).toEqual({ status: "lease-lost", eventId: EVENT.id });
    expect(other.getDelivery(EVENT.id)).toMatchObject({ status: "pending", attemptCount: 1 });
    expect(other.finishDelivery(EVENT.id, newer.lease.token, { kind: "http", status: 204 }, now).status).toBe("delivered");
    expect(other.listAttempts(EVENT.id).map(attempt => attempt.result)).toEqual([{ kind: "interrupted" }, { kind: "http", status: 204 }]);
  });

  it.each(["cancel", "timeout"])("counts %s as an ambiguous attempt, aborts transport and discards late success", async action => {
    vi.useFakeTimers();
    fixture.enqueue();
    const transport = controlled();
    const controller = new AbortController();
    const instance = worker(transport);
    const pending = instance.deliverNext({ signal: controller.signal });
    await started();
    if (action === "cancel") controller.abort();
    else await vi.advanceTimersByTimeAsync(POLICY.deadlineMs);
    expect(await pending).toMatchObject({ status: "attempted", delivery: { status: "pending", attemptCount: 1,
      availableAt: now + POLICY.baseDelayMs } });
    expect(transport.send.mock.calls[0]![0].signal!.aborted).toBe(true);
    expect(fixture.store.listAttempts(EVENT.id)[0]?.result).toEqual({ kind: action === "cancel" ? "cancelled" : "timeout" });
    transport.resolve({ kind: "http", status: 200 });
    await started();
    expect(fixture.store.getDelivery(EVENT.id)?.status).toBe("pending");
    expect(await instance.deliverNext()).toEqual({ status: "idle" });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("uses the retained shorter lease and skips requests when signing consumed the deadline", async () => {
    vi.useFakeTimers();
    fixture.enqueue();
    const claim = claimed(fixture.store.claimDelivery(now, { ...POLICY, leaseMs: 10 }));
    now = claim.lease.expiresAt;
    fixture.store.claimDelivery(now, POLICY);
    now += POLICY.baseDelayMs;
    const transport = controlled();
    const pending = worker(transport).deliverNext();
    await started();
    await vi.advanceTimersByTimeAsync(9);
    expect(await pending).toMatchObject({ status: "attempted", delivery: { attemptCount: 2, status: "pending" } });
    expect(transport.send.mock.calls[0]![0].signal!.aborted).toBe(true);
    now = fixture.store.getDelivery(EVENT.id)!.availableAt;
    const slowSigner = { sign: fixture.vault.sign.bind(fixture.vault) };
    const sign = slowSigner.sign;
    slowSigner.sign = (ref, input) => { const headers = sign(ref, input); now += POLICY.leaseMs; return headers; };
    const instance = new DeliveryWorker(fixture.store, slowSigner, transport, POLICY, () => now);
    expect(await instance.deliverNext()).toEqual({ status: "lease-lost", eventId: EVENT.id });
    expect(transport.send).toHaveBeenCalledTimes(1);
  });

  it.each(["missing", "revoked", "vault-error"])("dead-letters a %s signing key without network or secret diagnostics", async condition => {
    fixture.enqueue();
    if (condition === "revoked") fixture.vault.revoke("runtime_key");
    if (condition === "missing") {
      const sign = fixture.vault.sign.bind(fixture.vault);
      vi.spyOn(fixture.vault, "sign").mockImplementation((_ref, input) => sign("unprovisioned_key", input));
    }
    if (condition === "vault-error") fixture.vault.close();
    const transport = { send: vi.fn(async (): Promise<TransportResult> => ({ kind: "http", status: 200 })) };
    expect(await worker(transport).deliverNext()).toMatchObject({ status: "attempted", delivery: { status: "dead-letter" } });
    expect(transport.send).not.toHaveBeenCalled();
    expect(fixture.store.listAttempts(EVENT.id)[0]?.result).toEqual({ kind: "signing-error" });
    expect(fixture.store.getDeadLetter(EVENT.id)?.reason).toBe("operator");
    expect(JSON.stringify(fixture.store.listAttempts(EVENT.id))).not.toContain("private-key-marker");
  });

  it.each(["throw", "reject", "invalid", "destination"])("normalizes %s transport outcomes and persists only fixed diagnostics", async condition => {
    fixture.enqueue();
    const transport: DeliveryTransport = { send: () => {
      if (condition === "throw") throw new Error("private-url-marker");
      if (condition === "reject") return Promise.reject(new Error("private-body-marker"));
      if (condition === "invalid") return Promise.resolve({ kind: "http", status: 999 } as never);
      return Promise.resolve({ kind: "destination-rejected" });
    } };
    const result = await worker(transport).deliverNext();
    expect(result).toMatchObject({ status: "attempted", delivery: { status: condition === "destination" ? "dead-letter" : "pending" } });
    expect(fixture.store.listAttempts(EVENT.id)[0]?.result).toEqual({ kind: condition === "destination" ? "destination-rejected" : "network-error" });
    if (condition === "destination") expect(fixture.store.getDeadLetter(EVENT.id)?.reason).toBe("destination-rejected");
  });

  it("does not resend on failed completion storage and leaves lease recovery in charge", async () => {
    fixture.enqueue();
    const send = vi.fn(async (): Promise<TransportResult> => ({ kind: "http", status: 204 }));
    const finish = vi.spyOn(fixture.store, "finishDelivery").mockImplementationOnce(() => { throw new StorageError("storage-failure"); });
    const instance = worker({ send });
    await expect(instance.deliverNext()).rejects.toThrowError(new StorageError("storage-failure"));
    expect(await instance.deliverNext()).toEqual({ status: "idle" });
    expect(send).toHaveBeenCalledTimes(1);
    finish.mockRestore();
    now += POLICY.leaseMs;
    expect(await instance.deliverNext()).toMatchObject({ status: "recovered", delivery: { attemptCount: 1, status: "pending" } });
    expect(send).toHaveBeenCalledTimes(1);
    now += POLICY.baseDelayMs;
    expect(await instance.deliverNext()).toMatchObject({ status: "attempted", delivery: { status: "delivered", attemptCount: 2 } });
  });

  it("keeps a backward clock from creating decreasing attempt timestamps", async () => {
    fixture.enqueue();
    const startedAt = now;
    const instance = worker({ send: async () => { now -= 100; return { kind: "http", status: 204 }; } });
    expect(await instance.deliverNext()).toMatchObject({ status: "attempted", delivery: { updatedAt: startedAt } });
    expect(fixture.store.listAttempts(EVENT.id)[0]).toMatchObject({ startedAt, finishedAt: startedAt });
    for (const value of [NaN, -1, Infinity, now + 0.1]) {
      now = value;
      await expect(instance.deliverNext()).rejects.toThrow(DeliveryWorkerError);
    }
  });
});

describe("at-least-once delivery to a loopback receiver", () => {
  it("retries a lost acknowledgement with identical signed bytes and deduplicable identity after restart", async () => {
    fixture.enqueue();
    const received: { body: Buffer; key: string; timestamp: string }[] = [];
    const effects = new Set<string>();
    await receiver((request, response) => {
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.on("end", () => {
        const body = Buffer.concat(chunks);
        const key = request.headers["idempotency-key"] as string;
        expect(verifyWebhook({ body, secret: fixture.secret, headers: request.headers, expectedKeyId: "runtime_key", now: Math.floor(now / 1000) })).toBe(true);
        received.push({ body, key, timestamp: request.headers["x-webhook-timestamp"] as string });
        effects.add(key);
        if (received.length === 1) response.destroy(); // Side effect happened; acknowledgement was lost.
        else response.writeHead(204).end();
      });
    }, async dependencies => {
      const transport = new HttpsTransport({ deadlineMs: 1000, maxResponseBytes: 128, maxResponseHeaderBytes: 1024, maxAddresses: 4 }, dependencies);
      const first = worker(transport);
      expect(await first.deliverNext()).toMatchObject({ status: "attempted", delivery: { status: "pending", attemptCount: 1 } });
      expect(await first.deliverNext()).toEqual({ status: "idle" });
      now = fixture.store.getDelivery(EVENT.id)!.availableAt;
      const store = fixture.open(); const vault = fixture.openVault();
      fixture.store.close(); fixture.vault.close();
      const restarted = new DeliveryWorker(store, vault, transport, POLICY, () => now);
      expect(await restarted.deliverNext()).toMatchObject({ status: "attempted", delivery: { status: "delivered", attemptCount: 2 } });
      expect(await restarted.deliverNext()).toEqual({ status: "idle" });
      expect(store.getEvent(EVENT.id)?.payload).toBe(EVENT.payload);
      expect(store.listAttempts(EVENT.id).map(attempt => attempt.result)).toEqual([{ kind: "network-error" }, { kind: "http", status: 204 }]);
    });
    expect(received).toHaveLength(2);
    expect(received.every(item => item.body.toString("utf8") === EVENT.payload && item.key === EVENT.idempotencyKey)).toBe(true);
    expect(received[0]!.timestamp).not.toBe(received[1]!.timestamp);
    expect(effects.size).toBe(1);
  });

  it("retries redirects, client errors, rate limits and server errors to exhaustion without following locations", async () => {
    fixture.enqueue();
    const statuses = [302, 400, 429, 503];
    let requests = 0;
    await receiver((_request, response) => {
      response.setHeader("location", "https://127.0.0.1/private");
      response.writeHead(statuses[requests++]!).end();
    }, async dependencies => {
      const transport = new HttpsTransport({ deadlineMs: 1000, maxResponseBytes: 128, maxResponseHeaderBytes: 1024, maxAddresses: 4 }, dependencies);
      const instance = worker(transport);
      for (let index = 0; index < statuses.length; index++) {
        expect(await instance.deliverNext()).toMatchObject({ status: "attempted", delivery: { attemptCount: index + 1,
          status: index === 3 ? "dead-letter" : "pending" } });
        now = fixture.store.getDelivery(EVENT.id)!.availableAt;
      }
      expect(fixture.store.getDeadLetter(EVENT.id)?.reason).toBe("attempts-exhausted");
      expect(await instance.deliverNext()).toEqual({ status: "idle" });
      expect(dependencies.resolve).toHaveBeenCalledTimes(4);
      expect(fixture.store.listAttempts(EVENT.id).map(attempt => attempt.result)).toEqual(statuses.map(status => ({ kind: "http", status })));
    });
    expect(requests).toBe(4);
  });

  it("records real timeout ambiguity and rechecks destination policy on the retry", async () => {
    fixture.enqueue();
    let requests = 0;
    await receiver((request, _response) => { request.resume(); requests++; }, async dependencies => {
      const resolve = vi.fn().mockResolvedValueOnce([{ address: "8.8.8.8", family: 4 }])
        .mockResolvedValueOnce([{ address: "127.0.0.1", family: 4 }]);
      const transport = new HttpsTransport({ deadlineMs: 50, maxResponseBytes: 128, maxResponseHeaderBytes: 1024, maxAddresses: 4 }, { ...dependencies, resolve });
      const instance = worker(transport);
      expect(await instance.deliverNext()).toMatchObject({ status: "attempted", delivery: { status: "pending" } });
      now = fixture.store.getDelivery(EVENT.id)!.availableAt;
      expect(await instance.deliverNext()).toMatchObject({ status: "attempted", delivery: { status: "dead-letter" } });
      expect(fixture.store.listAttempts(EVENT.id).map(attempt => attempt.result)).toEqual([{ kind: "timeout" }, { kind: "destination-rejected" }]);
      expect(resolve).toHaveBeenCalledTimes(2);
    });
    expect(requests).toBe(1);
  });
});
