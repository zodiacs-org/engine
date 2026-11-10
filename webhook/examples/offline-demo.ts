import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { createServer, request, type Server } from "node:http";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { setTimeout as pause } from "node:timers/promises";
import { startService, type WebhookService } from "../src/service.js";
import { MAX_WEBHOOK_BODY_BYTES, verifyWebhook } from "../src/signatures.js";
import type { TransportRequest, TransportResult } from "../src/transport.js";

/** Offline teaching example. The loopback transport and in-memory inbox are demo-only. */
export async function runOfflineDemo(projectDirectory: string): Promise<void> {
  const credentials = { adminToken: randomBytes(32), wrappingKey: randomBytes(32) };
  const secret = randomBytes(32);
  const cache = join(projectDirectory, ".cache");
  mkdirSync(cache, { recursive: true });
  const directory = mkdtempSync(join(cache, "offline-demo-"));
  const effects = new Map<string, Buffer>();
  let requests = 0;
  let service: WebhookService | undefined;
  const receiver = createServer((incoming, response) => {
    const chunks: Buffer[] = [];
    let bytes = 0;
    incoming.on("error", () => undefined);
    incoming.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > MAX_WEBHOOK_BODY_BYTES) incoming.destroy();
      else chunks.push(chunk);
    });
    incoming.on("end", () => {
      const body = Buffer.concat(chunks);
      // Preserve duplicate headers so verification rejects them.
      const headers = Object.fromEntries(Object.entries(incoming.headersDistinct)
        .map(([name, values]) => [name, values?.length === 1 ? values[0] : values]));
      if (!verifyWebhook({ body, headers, secret, expectedKeyId: "demo_receiver",
        now: Math.floor(Date.now() / 1000) })) {
        response.writeHead(401); response.end(); return;
      }
      const identity = String(headers["idempotency-key"]);
      const previous = effects.get(identity);
      if (previous && !previous.equals(body)) { response.writeHead(409); response.end(); return; }
      // Production: commit inbox identity and business effects together in durable storage.
      if (!previous) {
        const payload = JSON.parse(body.toString("utf8"));
        assert.equal(payload.schema, "zodiacs.webhook-event.v1");
        assert.equal(payload.idempotencyKey, identity);
        assert.equal(payload.event.kind, "ingress");
        assert(payload.event.positions.every((position: { receipt: { schema: string } }) =>
          position.receipt.schema === "zodiacs.calc-receipt.v1"));
        effects.set(identity, body);
      }
      requests++;
      // Simulate an effect that committed before its acknowledgement was lost.
      if (requests === 1) incoming.socket.destroy();
      else { response.writeHead(204); response.end(); }
    });
  });
  receiver.requestTimeout = 3000;
  receiver.headersTimeout = 3000;
  const close = async (server: Server) => {
    if (!server.listening) return;
    server.closeAllConnections();
    await new Promise<void>(done => server.close(() => done()));
  };
  try {
    await new Promise<void>((done, reject) => {
      receiver.once("error", reject); receiver.listen(0, "127.0.0.1", done);
    });
    const address = receiver.address();
    assert(address && typeof address !== "string");
    // Fixed loopback destination: callbackUrl is never resolved or connected here.
    // The production CLI always constructs HttpsTransport instead of this seam.
    const transport = { send: (input: TransportRequest): Promise<TransportResult> => new Promise(done => {
      const outgoing = request({ hostname: "127.0.0.1", port: address.port, path: "/events",
        method: "POST", agent: false, ...(input.signal ? { signal: input.signal } : {}),
        headers: { ...input.headers, "content-type": "application/json", "content-length": input.body.byteLength } }, response => {
        response.resume();
        response.on("error", () => done({ kind: "network-error" }));
        response.on("end", () => done({ kind: "http", status: response.statusCode! }));
      });
      outgoing.setTimeout(1000, () => outgoing.destroy());
      outgoing.on("error", () => done({ kind: "network-error" }));
      outgoing.end(input.body);
    }) };
    service = await startService({ stateDirectory: "state", port: 0, pollIntervalMs: 10,
      scan: { maxWindowMs: 31 * 86_400_000 },
      delivery: { maxAttempts: 2, baseDelayMs: 20, maxDelayMs: 20 } }, credentials, directory, { transport });
    const base = `http://127.0.0.1:${service.address.port}`;
    const call = async (method: string, path: string, body?: unknown) => {
      const response = await fetch(base + path, { method, signal: AbortSignal.timeout(3000),
        headers: { authorization: `Bearer ${credentials.adminToken.toString("base64url")}`,
          ...(body === undefined ? {} : { "content-type": "application/json" }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      assert(response.ok, "Local control request failed.");
      return response.json();
    };
    await call("POST", "/v1/signing-keys", { secretRef: "demo_receiver", secret: secret.toString("base64url") });
    await call("POST", "/v1/subscriptions", {
      callbackUrl: "https://receiver.example/events", secretRef: "demo_receiver",
      filter: { kind: "ingress", body: "Sun", sign: "aquarius" },
      window: { start: "2000-01-01T00:00:00Z", end: "2000-02-01T00:00:00Z" },
    });
    const deadline = performance.now() + 5000;
    while (true) {
      const logs = await call("GET", "/v1/deliveries") as { items: { status: string }[] };
      if (logs.items.some((item: { status: string }) => item.status === "delivered")) break;
      assert(performance.now() < deadline, "Local delivery did not finish.");
      await pause(10);
    }
    assert.equal(requests, 2);
    assert.equal(effects.size, 1);
  } finally {
    try { await service?.stop(); await close(receiver); }
    finally {
      credentials.adminToken.fill(0); credentials.wrappingKey.fill(0); secret.fill(0);
      rmSync(directory, { recursive: true, force: true });
    }
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    await runOfflineDemo(fileURLToPath(new URL("../../../", import.meta.url)));
    process.stdout.write('{"status":"delivered","verifiedRequests":2,"receiverEffects":1}\n');
  } catch {
    process.stderr.write('{"error":{"code":"offline-demo-failed"}}\n'); process.exitCode = 1;
  }
}
