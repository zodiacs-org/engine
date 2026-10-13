import { randomBytes } from "node:crypto";
import { connect } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CONTROL_DEFAULTS, CONTROL_LIMITS } from "../src/control-api.js";
import { controlFixture } from "./control-fixture.js";

let f: Awaited<ReturnType<typeof controlFixture>>;
beforeEach(async () => { f = await controlFixture(); });
afterEach(async () => { vi.restoreAllMocks(); await f.cleanup(); });

describe("control HTTP data boundaries", () => {
  it("bounds Content-Length and chunked bodies by encoded bytes, accepting the exact boundary", async () => {
    const text = JSON.stringify({ secretRef: "boundary_key", secret: randomBytes(32).toString("base64url") });
    const padded = Buffer.from(text + " ".repeat(CONTROL_DEFAULTS.maxRequestBytes - Buffer.byteLength(text)));
    expect(padded.length).toBe(16384);
    expect((await f.call("POST", "/v1/signing-keys", padded)).status).toBe(201);
    const over = await f.call("POST", "/v1/signing-keys", Buffer.concat([padded, Buffer.from(" ")]));
    expect(over.status).toBe(413); expect(over.json).toEqual({ error: { code: "request-too-large" } });
    const refusedLength = await f.raw(`POST /v1/signing-keys HTTP/1.1\r\nHost: localhost\r\nAuthorization: ${f.auth}\r\nContent-Length: 16385\r\nContent-Type: application/json\r\n\r\n`);
    expect(refusedLength).toContain("413 Payload Too Large");
    const chunk = Buffer.from("é".repeat(8193));
    const chunked = await f.raw(`POST /v1/signing-keys HTTP/1.1\r\nHost: localhost\r\nAuthorization: ${f.auth}\r\nTransfer-Encoding: chunked\r\nContent-Type: application/json\r\n\r\n${chunk.length.toString(16)}\r\n${chunk.toString()}\r\n0\r\n\r\n`);
    expect(chunked).toContain("413 Payload Too Large");
    expect(f.vault.inspect("boundary_key")?.status).toBe("available");
    expect((await f.call("GET", "/v1/subscriptions", Buffer.from("{}"))).status).toBe(400);
    expect((await f.call("DELETE", "/v1/signing-keys/boundary_key", Buffer.from("{}"))).status).toBe(400);
    expect(f.vault.inspect("boundary_key")?.status).toBe("available");
  });

  it("rejects malformed JSON, UTF-8, media types and secret encodings with fixed errors", async () => {
    const marker = randomBytes(24).toString("base64url");
    for (const body of [Buffer.from(`{${marker}`), Buffer.from([0x7b, 0x22, 0xff, 0x22, 0x3a, 0x31, 0x7d])]) {
      const response = await f.call("POST", "/v1/subscriptions", body);
      expect(response.status).toBe(400); expect(response.json).toEqual({ error: { code: "invalid-json" } });
      expect(response.body).not.toContain(marker);
    }
    for (const contentType of ["text/plain", "application/json; charset=iso-8859-1", "application/json; arbitrary=yes"]) {
      expect((await f.call("POST", "/v1/subscriptions", f.spec, { "content-type": contentType })).status).toBe(415);
    }
    expect((await f.call("POST", "/v1/subscriptions", f.spec, { "content-encoding": "gzip" })).status).toBe(415);
    const malformed: unknown[] = [null, [], {}, { secretRef: "bad key", secret: randomBytes(32).toString("base64url") },
      { secretRef: "unknown_key", secret: marker }, { secretRef: "unknown_key", secret: randomBytes(32).toString("base64") },
      { secretRef: "unknown_key", secret: randomBytes(32).toString("base64url"), wrappingKey: marker }];
    const canonical = randomBytes(32).toString("base64url");
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    malformed.push({ secretRef: "unknown_key", secret: canonical.slice(0, -1) + alphabet[alphabet.indexOf(canonical.at(-1)!) + 1] });
    for (const input of malformed) {
      const response = await f.call("POST", "/v1/signing-keys", input);
      expect(response.status).toBe(400); expect(response.json).toEqual({ error: { code: "invalid-request" } });
      expect(response.body).not.toContain(marker);
    }
    expect(f.vault.inspect("unknown_key")).toBeUndefined();
    expect((await f.call("POST", "/v1/subscriptions", { ...f.spec, secret: marker })).json).toEqual({ error: { code: "invalid-subscription", field: "subscription" } });
  });

  it("rejects unexpected methods, route forms, targets, parameters and oversized headers", async () => {
    expect((await f.call("PATCH", "/v1/subscriptions/synthetic-subscription")).status).toBe(405);
    const method = await f.call("POST", "/v1/deliveries", {});
    expect(method.status).toBe(405); expect(method.headers.allow).toBe("GET");
    for (const path of ["/v1/subscriptions/", "/v1/subscriptions/id/extra", "/v1/signing-keys/", "/v1/dead-letters/id", "/v2/subscriptions"]) {
      expect((await f.call("GET", path)).status).toBe(404);
    }
    for (const path of ["/v1/subscriptions/%2e%2e", "/v1/subscriptions?after=%", "/v1/subscriptions?limit=2&extra=1",
      "/v1/subscriptions/synthetic-subscription?after=a", "https://ignored.example/v1/subscriptions", "//ignored.example/v1/subscriptions"]) {
      expect((await f.call("GET", path)).status).toBe(400);
    }
    expect((await f.call("GET", "/" + "a".repeat(CONTROL_LIMITS.targetBytes))).status).toBe(414);
    const headers = await f.raw(`GET /v1/subscriptions HTTP/1.1\r\nHost: localhost\r\nAuthorization: ${f.auth}\r\nX-Large: ${"a".repeat(8192)}\r\n\r\n`);
    expect(headers).toContain("431 Request Header Fields Too Large");
    const expected = await f.raw(`POST /v1/signing-keys HTTP/1.1\r\nHost: localhost\r\nAuthorization: ${f.auth}\r\nExpect: 100-continue\r\nContent-Length: 100\r\nContent-Type: application/json\r\n\r\n`);
    expect(expected).toContain("417 Expectation Failed"); expect(expected).not.toContain("100 Continue");
  });

  it("returns fixed service errors and bounds response serialization without exposing runtime diagnostics", async () => {
    const marker = randomBytes(24).toString("base64url");
    vi.spyOn(f.store, "listSubscriptions").mockImplementationOnce(() => { throw new Error(marker); });
    const response = await f.call("GET", "/v1/subscriptions");
    expect(response.status).toBe(503); expect(response.json).toEqual({ error: { code: "service-unavailable" } });
    expect(response.body).not.toContain(marker); expect(response.body).not.toContain(f.auth);
    // Simulate a future repository response exceeding the independent response boundary.
    vi.spyOn(f.store, "listDeliveryLogs").mockReturnValueOnce([{ eventId: marker.repeat(50000) } as never]);
    const large = await f.call("GET", "/v1/deliveries");
    expect(large.status).toBe(503); expect(large.json).toEqual({ error: { code: "response-too-large" } });
    expect(Buffer.byteLength(large.body)).toBeLessThan(CONTROL_LIMITS.responseBytes);
    f.store.close();
    expect((await f.call("GET", "/v1/deliveries")).json).toEqual({ error: { code: "service-unavailable" } });
  });
});

describe("control cancellation and absolute deadlines", () => {
  it("times out an incomplete body even when chunks arrive, without provisioning or storing work", async () => {
    await f.cleanup(); f = await controlFixture({ requestTimeoutMs: 150 });
    const provision = vi.spyOn(f.vault, "provision");
    const response = await f.raw(`POST /v1/signing-keys HTTP/1.1\r\nHost: localhost\r\nAuthorization: ${f.auth}\r\nTransfer-Encoding: chunked\r\nContent-Type: application/json\r\n\r\n1\r\n{\r\n`, socket => {
      const timer = setInterval(() => socket.write("1\r\n \r\n"), 20);
      socket.once("close", () => clearInterval(timer));
    });
    expect(response).toContain("408 Request Timeout"); expect(provision).not.toHaveBeenCalled();
    expect(f.store.listSubscriptions()).toHaveLength(1);
    expect((await f.call("GET", "/v1/subscriptions")).status).toBe(200);
  });

  it("bounds incomplete headers through the HTTP parser timeout", async () => {
    await f.cleanup(); f = await controlFixture({ requestTimeoutMs: 100 });
    const response = await f.raw("GET /v1/subscriptions HTTP/1.1\r\nHost: localhost\r\n");
    expect(response).toContain("408 Request Timeout");
    expect(f.store.listSubscriptions()).toHaveLength(1);
  });

  it("abandons a disconnected partial write and remains available", async () => {
    const provision = vi.spyOn(f.vault, "provision");
    await new Promise<void>(resolve => {
      const socket = connect(f.port, "127.0.0.1", () => {
        socket.write(`POST /v1/signing-keys HTTP/1.1\r\nHost: localhost\r\nAuthorization: ${f.auth}\r\nContent-Length: 1000\r\nContent-Type: application/json\r\n\r\n{`);
        setTimeout(() => socket.destroy(), 10);
      });
      socket.once("close", resolve);
    });
    expect((await f.call("GET", "/v1/subscriptions")).status).toBe(200);
    expect(provision).not.toHaveBeenCalled();
  });
});
