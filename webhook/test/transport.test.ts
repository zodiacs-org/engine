import { randomBytes } from "node:crypto";
import { EventEmitter } from "node:events";
import { createServer, request as httpRequest, type ClientRequest, type IncomingMessage, type ServerResponse } from "node:http";
import type { RequestOptions } from "node:https";
import { PassThrough } from "node:stream";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { testCertificate } from "./tls-fixture.js";
import { signWebhook, verifyWebhook, MAX_WEBHOOK_BODY_BYTES } from "../src/signatures.js";
import {
  HttpsTransport, TransportError, TRANSPORT_LIMITS,
  type TransportDependencies, type TransportPolicy, type TransportRequest, type ResolvedAddress,
} from "../src/transport.js";

const policy: TransportPolicy = { deadlineMs: 1000, maxResponseBytes: 128, maxResponseHeaderBytes: 1024, maxAddresses: 4 };
const publicAddress: ResolvedAddress = { address: "8.8.8.8", family: 4 };
function signed(): { input: TransportRequest; secret: Buffer } {
  const body = Buffer.from('{"schema":"test.synthetic.v1","event":{"at":"2000-01-01T00:00:00Z"}}');
  const secret = randomBytes(32);
  return { secret, input: {
    callbackUrl: "https://receiver.example:8443/hooks/%E2%98%83?topic=synthetic&v=1",
    body, headers: { ...signWebhook({ body, secret, keyId: "receiver_primary", idempotencyKey: "synthetic:occurrence", timestamp: 946684800 }) },
  } };
}

interface MockReply extends PassThrough {
  statusCode: number;
  complete: boolean;
  rawHeaders: string[];
  rawTrailers: string[];
  headers: Record<string, string>;
}
function fakeNetwork(
  reply: (response: MockReply) => void = response => { response.complete = true; response.end(); },
  prepare: (response: MockReply) => void = () => {},
) {
  const socket = Object.assign(new EventEmitter(), { encrypted: true, authorized: true, remoteAddress: publicAddress.address });
  let response: MockReply | undefined;
  let receive: ((response: IncomingMessage) => void) | undefined;
  const request = Object.assign(new EventEmitter(), {
    end: vi.fn((_body: Uint8Array) => {
      response = Object.assign(new PassThrough(), {
        statusCode: 204, complete: false, rawHeaders: [], rawTrailers: [], headers: {},
      });
      prepare(response);
      receive!(response as unknown as IncomingMessage);
      queueMicrotask(() => reply(response!));
    }),
    destroy: vi.fn(() => response?.destroy()),
  });
  const dependencies: TransportDependencies = {
    resolve: vi.fn(async () => [publicAddress]),
    request: vi.fn((_options, callback) => {
      receive = callback;
      queueMicrotask(() => { request.emit("socket", socket); socket.emit("secureConnect"); });
      return request as unknown as ClientRequest;
    }),
  };
  return { dependencies, socket, request };
}

afterEach(() => vi.useRealTimers());

describe("HTTPS attempt validation and destination checks", () => {
  let certificate: ReturnType<typeof testCertificate>;
  beforeAll(() => { certificate = testCertificate(); });
  afterAll(() => { certificate.key.fill(0); });
  it("enforces policy caps and snapshots settings", async () => {
    expect(TRANSPORT_LIMITS).toEqual({ deadlineMs: 60000, responseBytes: 65536, responseHeaderBytes: 16384, addresses: 64 });
    const fields = { deadlineMs: 60000, maxResponseBytes: 65536, maxResponseHeaderBytes: 16384, maxAddresses: 64 };
    for (const [field, cap] of Object.entries(fields)) {
      for (const value of [0, -1, 1.5, NaN, Infinity, cap + 1, undefined, "1"]) {
        expect(() => new HttpsTransport({ ...policy, [field]: value } as TransportPolicy)).toThrow(TransportError);
      }
      expect(() => new HttpsTransport({ ...policy, [field]: cap })).not.toThrow();
    }
    for (const value of [null, undefined, {}, "marker"]) {
      expect(() => new HttpsTransport(value as TransportPolicy)).toThrow("Invalid webhook transport input.");
    }
    const mutable = { ...policy };
    const { dependencies } = fakeNetwork();
    const transport = new HttpsTransport(mutable, dependencies);
    mutable.maxAddresses = 0;
    expect(await transport.send(signed().input)).toEqual({ kind: "http", status: 204 });
  });

  it("rejects malformed URL, body, signature and cancellation inputs before I/O", () => {
    const network = fakeNetwork();
    const transport = new HttpsTransport(policy, network.dependencies);
    const { input } = signed();
    for (const callbackUrl of ["http://receiver.example", "https://user:marker@receiver.example", "https://receiver.example/#", "https://receiver.example/\n", "file:///tmp/marker", "https://receiver.example:0"]) {
      expect(() => transport.send({ ...input, callbackUrl })).toThrow(TransportError);
    }
    for (const body of [null, "marker", [], new ArrayBuffer(32), Buffer.alloc(MAX_WEBHOOK_BODY_BYTES + 1)]) {
      expect(() => transport.send({ ...input, body } as TransportRequest)).toThrow(TransportError);
    }
    for (const headers of [null, {}, { ...input.headers, authorization: "marker" },
      { ...input.headers, "x-webhook-signature": "marker" }, { ...input.headers, "x-webhook-timestamp": "8640000000001" },
      { ...input.headers, "idempotency-key": "marker\r\n" }]) {
      expect(() => transport.send({ ...input, headers } as TransportRequest)).toThrow(TransportError);
    }
    expect(() => transport.send({ ...input, signal: {} } as TransportRequest)).toThrow(TransportError);
    expect(network.dependencies.resolve).not.toHaveBeenCalled();
    expect(network.dependencies.request).not.toHaveBeenCalled();
  });

  it("accepts the signing body limit without altering bytes", async () => {
    const body = Buffer.alloc(MAX_WEBHOOK_BODY_BYTES, 0x78);
    const { input, secret } = signed();
    const headers = signWebhook({ body, secret, keyId: "receiver_primary", idempotencyKey: "synthetic:max-body", timestamp: 946684800 });
    const network = fakeNetwork();
    expect(await new HttpsTransport(policy, network.dependencies).send({ ...input, body, headers })).toEqual({ kind: "http", status: 204 });
    expect(network.request.end).toHaveBeenCalledWith(body);
  });

  it.each([
    [], [{ address: "127.0.0.1", family: 4 }], [publicAddress, { address: "10.0.0.1", family: 4 }],
    [publicAddress, { address: "::1", family: 6 }], [{ address: "8.8.8.8", family: 6 }],
    [{ address: "not-an-address", family: 4 }], Array<ResolvedAddress>(5).fill(publicAddress), null,
  ])("refuses empty, oversized, invalid or mixed DNS answers %#", async answers => {
    const network = fakeNetwork();
    const transport = new HttpsTransport(policy, { ...network.dependencies, resolve: vi.fn(async () => answers as ResolvedAddress[]) });
    expect(await transport.send(signed().input)).toEqual({ kind: "destination-rejected" });
    expect(network.dependencies.request).not.toHaveBeenCalled();
  });

  it("rechecks DNS for every attempt and never resolves a redirect", async () => {
    const network = fakeNetwork(response => { response.end(); }, response => { response.statusCode = 302; response.headers.location = "https://127.0.0.1/marker"; });
    const resolve = vi.fn().mockResolvedValueOnce([publicAddress]).mockResolvedValueOnce([{ address: "127.0.0.1", family: 4 }]);
    const transport = new HttpsTransport(policy, { ...network.dependencies, resolve });
    const { input } = signed();
    expect(await transport.send(input)).toEqual({ kind: "http", status: 302 });
    expect(await transport.send(input)).toEqual({ kind: "destination-rejected" });
    expect(resolve.mock.calls.map(call => call[0])).toEqual(["receiver.example", "receiver.example"]);
    expect(network.dependencies.request).toHaveBeenCalledTimes(1);
  });

  it("pins direct IPv4 and IPv6 literals without DNS or SNI", async () => {
    for (const [hostname, address] of [["8.8.8.8", "8.8.8.8"], ["[2606:4700:4700::1111]", "2606:4700:4700::1111"]]) {
      const network = fakeNetwork();
      network.socket.remoteAddress = address!;
      expect(await new HttpsTransport(policy, network.dependencies).send({ ...signed().input, callbackUrl: `https://${hostname}/events` }))
        .toEqual({ kind: "http", status: 204 });
      expect(network.dependencies.resolve).not.toHaveBeenCalled();
      const options = vi.mocked(network.dependencies.request).mock.calls[0]![0];
      expect(options.hostname).toBe(address);
      expect(options.servername).toBe("");
      expect(options.checkServerIdentity!("ignored", { raw: certificate.raw } as never)).toBeUndefined();
      expect(options.checkServerIdentity!("ignored", { subjectaltname: "DNS:receiver.example" } as never)).toBeInstanceOf(Error);
    }
    for (const callbackUrl of ["https://127.1", "https://2130706433", "https://0x7f000001", "https://[::ffff:8.8.8.8]", "https://[::1]"]) {
      const network = fakeNetwork();
      expect(await new HttpsTransport(policy, network.dependencies).send({ ...signed().input, callbackUrl })).toEqual({ kind: "destination-rejected" });
      expect(network.dependencies.request).not.toHaveBeenCalled();
      expect(network.dependencies.resolve).not.toHaveBeenCalled();
    }
  });

  it("pins the connection and original TLS identity; copies signed bytes before resolution", async () => {
    const network = fakeNetwork();
    let release!: (value: ResolvedAddress[]) => void;
    const resolve = vi.fn(() => new Promise<ResolvedAddress[]>(done => { release = done; }));
    const { input } = signed();
    const expectedBody = Buffer.from(input.body);
    const expectedHeaders = { ...input.headers };
    const pending = new HttpsTransport(policy, { ...network.dependencies, resolve }).send(input);
    input.body.fill(0);
    Object.assign(input.headers, { "x-webhook-signature": "changed" });
    release([publicAddress]);
    expect(await pending).toEqual({ kind: "http", status: 204 });
    const options = vi.mocked(network.dependencies.request).mock.calls[0]![0];
    expect(options).toMatchObject({ hostname: "8.8.8.8", family: 4, port: 8443, method: "POST", protocol: "https:",
      path: "/hooks/%E2%98%83?topic=synthetic&v=1", agent: false, autoSelectFamily: false,
      rejectUnauthorized: true, minVersion: "TLSv1.2", servername: "receiver.example", maxHeaderSize: 1024,
      headers: { ...expectedHeaders, host: "receiver.example:8443", "content-type": "application/json", "content-length": String(expectedBody.length), connection: "close" },
    });
    expect(options.checkServerIdentity!("8.8.8.8", { subjectaltname: "DNS:receiver.example" } as never)).toBeUndefined();
    expect(options.checkServerIdentity!("8.8.8.8", { subjectaltname: "DNS:other.example" } as never)).toBeInstanceOf(Error);
    expect(network.request.end).toHaveBeenCalledWith(expectedBody);
  });

  it("sends nothing when TLS is unauthenticated or the socket peer differs", async () => {
    for (const patch of [{ remoteAddress: "127.0.0.1" }, { remoteAddress: "8.8.4.4" }, { authorized: false }, { encrypted: false }]) {
      const network = fakeNetwork();
      Object.assign(network.socket, patch);
      expect(await new HttpsTransport(policy, network.dependencies).send(signed().input))
        .toEqual({ kind: "remoteAddress" in patch ? "destination-rejected" : "network-error" });
      expect(network.request.end).not.toHaveBeenCalled();
      expect(network.request.destroy).toHaveBeenCalledTimes(1);
    }
    const network = fakeNetwork();
    network.socket.remoteAddress = "::ffff:8.8.8.8";
    expect(await new HttpsTransport(policy, network.dependencies).send(signed().input)).toEqual({ kind: "http", status: 204 });
  });
});

describe("deadlines, cleanup and response bounds", () => {
  it.each([200, 201, 204, 400, 429, 500, 599])("returns only the completed HTTP status %i", async status => {
    const network = fakeNetwork(response => { response.complete = true; response.end("marker"); }, response => { response.statusCode = status; });
    expect(await new HttpsTransport(policy, network.dependencies).send(signed().input)).toEqual({ kind: "http", status });
    expect(network.request.destroy).toHaveBeenCalledTimes(1);
  });

  it("accepts exactly the response byte limit and refuses overflow or oversized Content-Length", async () => {
    for (const [size, expected] of [[128, "http"], [129, "network-error"]] as const) {
      const network = fakeNetwork(response => { response.complete = true; response.end(Buffer.alloc(size)); });
      expect((await new HttpsTransport(policy, network.dependencies).send(signed().input)).kind).toBe(expected);
    }
    const network = fakeNetwork();
    const request = vi.mocked(network.dependencies.request);
    request.mockImplementation((_options, receive) => {
      queueMicrotask(() => {
        network.request.emit("socket", network.socket);
        network.socket.emit("secureConnect");
      });
      network.request.end.mockImplementation(() => {
        const response = Object.assign(new PassThrough(), { statusCode: 200, headers: { "content-length": "129" }, rawHeaders: [], complete: false });
        receive(response as unknown as IncomingMessage);
      });
      return network.request as unknown as ClientRequest;
    });
    expect(await new HttpsTransport(policy, network.dependencies).send(signed().input)).toEqual({ kind: "network-error" });
  });

  it("refuses truncated responses, response errors, upgrades and excessive headers or trailers", async () => {
    const replies: ((response: MockReply) => void)[] = [
      response => response.end(), response => { response.emit("aborted"); },
      response => { response.emit("error", new Error("receiver-marker")); },
      response => { response.rawTrailers = ["x-marker", "x".repeat(1024)]; response.complete = true; response.end(); },
    ];
    for (const reply of replies) {
      const network = fakeNetwork(reply);
      expect(await new HttpsTransport(policy, network.dependencies).send(signed().input)).toEqual({ kind: "network-error" });
    }
    const network = fakeNetwork();
    const destroy = vi.fn();
    network.request.end.mockImplementation(() => { network.request.emit("upgrade", {}, { destroy }); });
    expect(await new HttpsTransport(policy, network.dependencies).send(signed().input)).toEqual({ kind: "network-error" });
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it("enforces combined header and trailer bytes at the boundary", async () => {
    for (const extra of [0, 1]) {
      const network = fakeNetwork(response => {
        response.complete = true;
        response.rawTrailers = ["x-t", "x".repeat(999 + extra)];
        response.end();
      }, response => { response.rawHeaders = ["x-h", "12345678901"]; });
      // rawHeaders: 18 bytes; rawTrailers: 1006 (+ extra).
      expect(await new HttpsTransport(policy, network.dependencies).send(signed().input))
        .toEqual(extra === 0 ? { kind: "http", status: 204 } : { kind: "network-error" });
    }
    const exact = fakeNetwork(response => { response.complete = true; response.end(); }, response => { response.rawHeaders = ["x-h", "x".repeat(1017)]; });
    expect(await new HttpsTransport(policy, exact.dependencies).send(signed().input)).toEqual({ kind: "http", status: 204 });
    const overflow = fakeNetwork(response => response.end(), response => { response.rawHeaders = ["x-h", "x".repeat(1018)]; });
    expect(await new HttpsTransport(policy, overflow.dependencies).send(signed().input)).toEqual({ kind: "network-error" });
  });

  it("expires stalled DNS and ignores late results without connecting", async () => {
    vi.useFakeTimers();
    const network = fakeNetwork();
    let release!: (answers: ResolvedAddress[]) => void;
    let resolutionSignal!: AbortSignal;
    const resolve = vi.fn((_hostname: string, signal: AbortSignal) => { resolutionSignal = signal; return new Promise<ResolvedAddress[]>(done => { release = done; }); });
    const pending = new HttpsTransport(policy, { ...network.dependencies, resolve }).send(signed().input);
    await vi.advanceTimersByTimeAsync(999);
    expect(resolutionSignal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toEqual({ kind: "timeout" });
    expect(resolutionSignal.aborted).toBe(true);
    release([publicAddress]);
    await Promise.resolve();
    expect(network.dependencies.request).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("bounds connect/TLS stalls and slow-drip responses by the same whole deadline", async () => {
    vi.useFakeTimers();
    for (const stage of ["connect", "response"]) {
      const network = fakeNetwork(response => { response.write("x"); });
      if (stage === "connect") vi.mocked(network.dependencies.request).mockReturnValue(network.request as unknown as ClientRequest);
      const pending = new HttpsTransport(policy, network.dependencies).send(signed().input);
      await vi.advanceTimersByTimeAsync(1000);
      expect(await pending).toEqual({ kind: "timeout" });
      expect(network.request.destroy).toHaveBeenCalledTimes(1);
      network.request.emit("error", new Error("late-marker"));
      network.socket.emit("secureConnect");
      expect(vi.getTimerCount()).toBe(0);
    }
  });

  it("cancels before DNS, during DNS and during I/O without exposing abort reasons", async () => {
    const { input } = signed();
    for (const stage of ["before", "dns", "response"]) {
      const controller = new AbortController();
      const network = fakeNetwork(() => controller.abort("private-marker"));
      const resolve = stage === "dns" ? vi.fn(async () => { controller.abort("private-marker"); return [publicAddress]; }) : network.dependencies.resolve;
      if (stage === "before") controller.abort("private-marker");
      expect(await new HttpsTransport(policy, { ...network.dependencies, resolve }).send({ ...input, signal: controller.signal })).toEqual({ kind: "cancelled" });
      if (stage === "before") expect(resolve).not.toHaveBeenCalled();
      if (stage !== "response") expect(network.dependencies.request).not.toHaveBeenCalled();
      else expect(network.request.destroy).toHaveBeenCalledTimes(1);
    }
  });

  it("redacts DNS, request and TLS/network failure diagnostics", async () => {
    for (const stage of ["resolve", "request", "connection"]) {
      const network = fakeNetwork();
      const dependencies = { ...network.dependencies };
      if (stage === "resolve") dependencies.resolve = vi.fn(async () => { throw new Error("private-marker"); });
      if (stage === "request") dependencies.request = vi.fn(() => { throw new Error("private-marker"); });
      if (stage === "connection") {
        vi.mocked(dependencies.request).mockImplementation(() => {
          queueMicrotask(() => network.request.emit("error", new Error("private-marker")));
          return network.request as unknown as ClientRequest;
        });
      }
      expect(await new HttpsTransport(policy, dependencies).send(signed().input)).toEqual({ kind: "network-error" });
    }
  });
});

describe("local mock HTTP receiver seam", () => {
  async function receiver(handler: (request: IncomingMessage, response: ServerResponse) => void, run: (dependencies: TransportDependencies) => Promise<void>) {
    const server = createServer(handler);
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing local port.");
    const dependencies: TransportDependencies = {
      resolve: vi.fn(async () => [publicAddress]),
      // Trusted test seam: HTTP goes only to loopback, simulating authenticated TLS and the peer pin.
      request: (options, receive) => {
        const request = httpRequest({ ...options, protocol: "http:", hostname: "127.0.0.1", port: address.port, agent: false }, receive);
        request.once("socket", socket => {
          Object.defineProperties(socket, { encrypted: { value: true }, authorized: { value: true }, remoteAddress: { value: publicAddress.address } });
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

  it("receives exact signed JSON and stable idempotency headers over loopback", async () => {
    const { input, secret } = signed();
    let received = 0;
    await receiver((request, response) => {
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.on("end", () => {
        const body = Buffer.concat(chunks);
        expect(request.method).toBe("POST");
        expect(request.url).toBe("/hooks/%E2%98%83?topic=synthetic&v=1");
        expect(request.headers.host).toBe("receiver.example:8443");
        expect(request.headers["content-type"]).toBe("application/json");
        expect(body).toEqual(input.body);
        expect(verifyWebhook({ body, secret, headers: request.headers, expectedKeyId: "receiver_primary", now: 946684800 })).toBe(true);
        received++;
        response.writeHead(200); response.end("ignored receiver-marker");
      });
    }, async dependencies => {
      const transport = new HttpsTransport(policy, dependencies);
      expect(await transport.send(input)).toEqual({ kind: "http", status: 200 });
      expect(await transport.send(input)).toEqual({ kind: "http", status: 200 });
    });
    expect(received).toBe(2);
  });

  it("refuses real HTTP header overflow, chunked body overflow and abrupt response EOF", async () => {
    const handlers: ((request: IncomingMessage, response: ServerResponse) => void)[] = [
      (_request, response) => { response.setHeader("x-marker", "x".repeat(2048)); response.end(); },
      (_request, response) => { response.write(Buffer.alloc(128)); response.end("x"); },
      (_request, response) => { response.writeHead(200, { "content-length": "64" }); response.write("short"); response.socket!.destroy(); },
    ];
    for (const handler of handlers) {
      await receiver(handler, async dependencies => {
        expect(await new HttpsTransport(policy, dependencies).send(signed().input)).toEqual({ kind: "network-error" });
      });
    }
  });
});
