import { createServer, request as httpsRequest, type Server, type RequestOptions } from "node:https";
import { randomBytes } from "node:crypto";
import { createServer as createTcpServer } from "node:net";
import type { TLSSocket } from "node:tls";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { signWebhook, verifyWebhook } from "../src/signatures.js";
import { HttpsTransport, type TransportDependencies } from "../src/transport.js";
import { testCertificate } from "./tls-fixture.js";

const policy = { deadlineMs: 1000, maxResponseBytes: 128, maxResponseHeaderBytes: 1024, maxAddresses: 4 };
const publicIp = "8.8.8.8";

describe("real TLS over a trusted loopback connection seam", () => {
  let certificate: ReturnType<typeof testCertificate>;
  let server: Server;
  let port: number;
  let requests = 0;
  let receivedBody: Buffer;
  let receivedSni: string | false | null | undefined;
  let receivedHost: string | undefined;
  let authenticated = false;
  const secret = randomBytes(32);

  beforeAll(async () => {
    certificate = testCertificate();
    server = createServer({ key: certificate.key, cert: certificate.cert }, (request, response) => {
      requests++;
      receivedHost = request.headers.host;
      receivedSni = (request.socket as TLSSocket).servername;
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.on("end", () => {
        receivedBody = Buffer.concat(chunks);
        authenticated = verifyWebhook({ body: receivedBody, secret, headers: request.headers, expectedKeyId: "local_receiver", now: 946684800 });
        response.writeHead(202); response.end("ack");
      });
    });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing TLS receiver port.");
    port = address.port;
  });
  afterAll(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    certificate.key.fill(0);
    secret.fill(0);
  });

  function input(callbackUrl: string) {
    const body = Buffer.from('{"schema":"test.synthetic.v1","receipt":{"marker":"preserved"}}');
    return { callbackUrl, body, headers: signWebhook({ body, secret, keyId: "local_receiver", idempotencyKey: "synthetic:tls", timestamp: 946684800 }) };
  }
  function dependencies(trustCertificate = true, changePeer = false): TransportDependencies {
    return {
      resolve: vi.fn(async () => [{ address: publicIp, family: 4 as const }]),
      request: vi.fn((options: RequestOptions, receive) => {
        // No address policy override in production. Only this test redirects TCP to loopback.
        const request = httpsRequest({ ...options, hostname: "127.0.0.1", port,
          ...(trustCertificate ? { ca: certificate.cert } : {}),
        }, receive);
        request.once("socket", socket => {
          if (!changePeer) Object.defineProperty(socket, "remoteAddress", { value: options.hostname });
        });
        return request;
      }),
    };
  }

  it("authenticates the original DNS name and sends signed bytes after the handshake", async () => {
    const request = input("https://receiver.example/events?synthetic=1");
    expect(await new HttpsTransport(policy, dependencies()).send(request)).toEqual({ kind: "http", status: 202 });
    expect(receivedBody).toEqual(request.body);
    expect(receivedHost).toBe("receiver.example");
    expect(receivedSni).toBe("receiver.example");
    expect(authenticated).toBe(true);
  });

  it("checks real IP SANs for IPv4 and IPv6 literals without DNS or SNI", async () => {
    for (const host of [publicIp, "[2606:4700:4700::1111]"]) {
      const deps = dependencies();
      expect(await new HttpsTransport(policy, deps).send(input(`https://${host}/events`))).toEqual({ kind: "http", status: 202 });
      expect(deps.resolve).not.toHaveBeenCalled();
      expect(receivedHost).toBe(host);
      expect(receivedSni).toBe(false);
      expect(authenticated).toBe(true);
    }
  });

  it("sends no HTTP request on DNS/IP identity mismatch, untrusted CA or wrong peer", async () => {
    const before = requests;
    const cases = [
      { url: "https://other.example/events", deps: dependencies(), result: "network-error" },
      { url: "https://1.1.1.1/events", deps: dependencies(), result: "network-error" },
      { url: "https://[2606:4700:4700::1001]/events", deps: dependencies(), result: "network-error" },
      { url: "https://receiver.example/events", deps: dependencies(false), result: "network-error" },
      { url: "https://receiver.example/events", deps: dependencies(true, true), result: "destination-rejected" },
    ];
    for (const test of cases) {
      expect(await new HttpsTransport(policy, test.deps).send(input(test.url))).toEqual({ kind: test.result });
    }
    expect(requests).toBe(before);
  });

  it("ends an actual stalled TLS handshake at the whole-attempt deadline", async () => {
    const sockets = new Set<import("node:net").Socket>();
    const stalled = createTcpServer(socket => { sockets.add(socket); socket.on("close", () => sockets.delete(socket)); });
    await new Promise<void>(resolve => stalled.listen(0, "127.0.0.1", resolve));
    const address = stalled.address();
    if (!address || typeof address === "string") throw new Error("Missing stalled port.");
    const deps: TransportDependencies = {
      resolve: vi.fn(async () => [{ address: publicIp, family: 4 as const }]),
      request: (options, receive) => httpsRequest({ ...options, hostname: "127.0.0.1", port: address.port }, receive),
    };
    try {
      expect(await new HttpsTransport({ ...policy, deadlineMs: 50 }, deps).send(input("https://receiver.example/events")))
        .toEqual({ kind: "timeout" });
    } finally {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve, reject) => stalled.close(error => error ? reject(error) : resolve()));
    }
  });
});
