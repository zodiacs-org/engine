import { Buffer } from "node:buffer";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { request } from "node:http";
import type { IncomingHttpHeaders, OutgoingHttpHeaders } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { executeSerial } from "../src/execution.js";
import { createControlServer, HTTP_CONTROL_DEFAULTS } from "../src/http-control.js";
import type { HttpControlOptions } from "../src/http-control.js";
import { MemoryQueue } from "../src/memory-queue.js";
import { DEFAULT_LIMITS } from "../src/model.js";
import type { JobSpec, Person } from "../src/model.js";
import { QUEUE_LIMITS, QueueError, RETRY_DEFAULTS } from "../src/queue.js";
import type { JobSnapshot, QueueBackend } from "../src/queue.js";
import { SqliteQueue } from "../src/sqlite-queue.js";
import { validateJob } from "../src/validation.js";

const generated = fileURLToPath(new URL("../.generated/http-control-tests/", import.meta.url));
const owner = { owner: "synthetic-http-worker", leaseMs: 10_000 };

// Invented inputs. Engine output checks transport parity, not accuracy.
const people: readonly Person[] = [
  { id: "synthetic-http-a", birth: { utc: "2001-02-03T04:05:06Z", timeKnown: false } },
  { id: "synthetic-http-b", birth: { utc: "1998-07-08T09:10:11Z", latitude: 12, longitude: 34 } },
  { id: "synthetic-http-c", birth: { utc: "1904-05-06T07:08:09Z", latitude: -23, longitude: 45 } },
];
const charts: JobSpec = { version: 1, kind: "charts", births: people };
const workloads: readonly JobSpec[] = [
  charts,
  {
    version: 1, kind: "transit-grid", births: people.slice(0, 2),
    start: "2007-08-09T10:11:12Z", end: "2007-08-09T10:11:12.002Z", stepMs: 1,
  },
  { version: 1, kind: "synastry-matrix", people },
];
const workloadRows = workloads.map((spec) => [...executeSerial(validateJob(spec))]);

interface Reply {
  status: number;
  headers: IncomingHttpHeaders;
  text: string;
}

interface RequestOptions {
  method?: string;
  headers?: OutgoingHttpHeaders | readonly string[];
  body?: string | Buffer;
  chunks?: readonly (string | Buffer)[];
  setHost?: boolean;
}

function call(base: string, path: string, options: RequestOptions = {}): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const req = request(`${base}${path}`, {
      method: options.method ?? "GET", headers: options.headers, agent: false, setHost: options.setHost ?? true,
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("error", reject);
      res.on("end", () => resolve({
        status: res.statusCode!, headers: res.headers, text: Buffer.concat(chunks).toString("utf8"),
      }));
    });
    req.on("error", reject);
    if (options.chunks) {
      for (const chunk of options.chunks) req.write(chunk);
      req.end();
    } else req.end(options.body);
  });
}

function post(base: string, value: unknown, key?: string): Promise<Reply> {
  return call(base, "/v1/jobs", {
    method: "POST", body: JSON.stringify(value),
    headers: { "content-type": "application/json", ...(key === undefined ? {} : { "idempotency-key": key }) },
  });
}

function snapshot(reply: Reply): JobSnapshot {
  expect(reply.headers["content-type"]).toMatch(/^application\/json\b/);
  expect(reply.headers["cache-control"]).toBe("no-store");
  expect(reply.headers["x-content-type-options"]).toBe("nosniff");
  const parsed = JSON.parse(reply.text) as { job: JobSnapshot };
  expect(Object.keys(parsed)).toEqual(["job"]);
  return parsed.job;
}

function expectError(reply: Reply, status: number, code: string): string {
  expect(reply.status).toBe(status);
  expect(reply.headers["content-type"]).toMatch(/^application\/json\b/);
  expect(reply.headers["cache-control"]).toBe("no-store");
  expect(reply.headers["x-content-type-options"]).toBe("nosniff");
  const parsed = JSON.parse(reply.text) as { error: { code: string; message: string } };
  expect(parsed).toEqual({ error: { code, message: expect.any(String) } });
  expect(parsed.error.message.length).toBeGreaterThan(0);
  return parsed.error.message;
}

function required<T>(value: T | null): T {
  if (value === null) throw new Error("Expected a synthetic test job.");
  return value;
}

for (const backend of ["memory", "sqlite"] as const) {
  describe(`${backend} HTTP control routes`, () => {
    let clock: number;
    let queue: QueueBackend;
    let peer: QueueBackend;
    let directory: string | undefined;
    let filename: string;
    let controls: ReturnType<typeof createControlServer>[];
    let base: string;

    async function listen(options: Parameters<typeof createControlServer>[1] = {}): Promise<string> {
      const control = createControlServer(queue, options);
      controls.push(control);
      expect(control.server.listening).toBe(false);
      await new Promise<void>((resolve, reject) => {
        control.server.once("error", reject);
        control.server.listen(0, "127.0.0.1", () => {
          control.server.off("error", reject);
          resolve();
        });
      });
      return `http://127.0.0.1:${(control.server.address() as AddressInfo).port}`;
    }

    beforeEach(async () => {
      clock = 1_700_000_000_000;
      controls = [];
      directory = undefined;
      if (backend === "memory") {
        queue = new MemoryQueue({ now: () => clock });
        peer = queue;
      } else {
        await mkdir(generated, { recursive: true });
        directory = await mkdtemp(join(generated, "queue-"));
        filename = join(directory, "queue.sqlite");
        queue = new SqliteQueue(filename, { now: () => clock });
        peer = new SqliteQueue(filename, { now: () => clock });
      }
      base = await listen();
    });

    afterEach(async () => {
      vi.restoreAllMocks();
      for (const control of controls) await control.close();
      await queue?.close();
      await peer?.close();
      if (directory) await rm(directory, { recursive: true, force: true });
    });

    async function assertStatus(job: JobSnapshot): Promise<void> {
      const status = await call(base, `/v1/jobs/${job.id}`);
      expect(status.status).toBe(200);
      expect(snapshot(status)).toEqual(job);
      const progress = await call(base, `/v1/jobs/${job.id}/progress`);
      expect(progress.status).toBe(200);
      expect(JSON.parse(progress.text)).toEqual({
        id: job.id, status: job.status, totalTasks: job.totalTasks,
        completedTasks: job.completedTasks, nextCursor: job.nextCursor,
      });
    }

    it("rejects the rebinding probe and checks Host and Origin independently before submission", async () => {
      const submit = vi.spyOn(queue, "submit");
      const foreign = "review-attacker.example";
      for (const headers of [
        { host: foreign, origin: `http://${foreign}` },
        { host: foreign, origin: base },
        { host: foreign },
        { origin: `http://${foreign}` },
        { host: new URL(base).host, origin: `http://${foreign}` },
        { host: foreign, "x-forwarded-host": new URL(base).host, "x-forwarded-proto": "http" },
      ]) {
        const reply = await call(base, "/v1/jobs", {
          method: "POST", headers: { "content-type": "application/json", ...headers },
          body: JSON.stringify({ job: charts }),
        });
        expectError(reply, 403, "forbidden");
        expect(reply.text).not.toContain(foreign);
      }
      expect(submit).not.toHaveBeenCalled();
      expect(await peer.claim(owner)).toBeNull();
    });

    it("allows loopback names with the listening port and absent or local Origin", async () => {
      const port = new URL(base).port;
      for (const name of ["localhost", "LOCALHOST", "127.0.0.1", "[::1]"]) {
        for (const source of [undefined, `http://${name}:${port}`]) {
          const reply = await call(base, "/v1/jobs", {
            method: "POST", body: JSON.stringify({ job: charts }),
            headers: { "content-type": "application/json", host: `${name}:${port}`,
              ...(source === undefined ? {} : { origin: source }) },
          });
          expect(reply.status).toBe(202);
        }
      }
    });

    it("rejects other ports, loopback lookalikes and alternate IP spellings", async () => {
      const port = new URL(base).port;
      for (const host of ["localhost", "localhost:1", "127.0.0.1:1", "[::1]:1",
        `localhost.attacker.example:${port}`, `127.1:${port}`, `2130706433:${port}`,
        `127.0.0.2:${port}`, `0.0.0.0:${port}`, `[::ffff:7f00:1]:${port}`]) {
        expectError(await call(base, "/v1/jobs", { headers: { host } }), 403, "forbidden");
      }
      for (const source of ["http://localhost", "http://localhost:1", `https://localhost:${port}`,
        `http://localhost.attacker.example:${port}`, `http://127.1:${port}`]) {
        expectError(await call(base, "/v1/jobs", { headers: { origin: source } }), 403, "forbidden");
      }
      expect(await peer.claim(owner)).toBeNull();
    });

    it("rejects missing, malformed and duplicate boundary headers", async () => {
      // Node's wire parser can reject missing Host before the JSON handler.
      expect((await call(base, "/v1/jobs", { setHost: false })).status).toBe(400);
      expect((await call(base, "/v1/jobs", { setHost: false, headers: { host: "" } })).status).toBe(400);
      for (const host of ["localhost.", "localhost:0", "localhost:65536", "localhost:01",
        "user@localhost", "localhost/path", "localhost\\path", "local%68ost", "[::bogus]",
        "localhost,127.0.0.1"]) {
        expectError(await call(base, "/v1/jobs", { headers: { host } }), 400, "invalid-request");
      }
      for (const source of ["", "null", `${base}/`, `${base}/path`, `${base}?q=1`, `${base}#hash`,
        `http://user@${new URL(base).host}`, `http://local%68ost:${new URL(base).port}`,
        `${base} http://review-attacker.example`]) {
        expectError(await call(base, "/v1/jobs", { headers: { origin: source } }), 400, "invalid-request");
      }
      for (const headers of [
        ["Host", new URL(base).host, "Host", "review-attacker.example"],
        ["Host", new URL(base).host, "Origin", base, "Origin", base],
      ]) expectError(await call(base, "/v1/jobs", { headers }), 400, "invalid-request");
      expect(await peer.claim(owner)).toBeNull();
    });

    it("protects status, progress and result reads before touching storage", async () => {
      const job = snapshot(await post(base, { job: charts }));
      const get = vi.spyOn(queue, "getJob");
      const read = vi.spyOn(queue, "readResults");
      for (const suffix of ["", "/progress", "/results?follow=true"]) {
        for (const headers of [{ host: "review-attacker.example" }, { origin: "http://review-attacker.example" }]) {
          expectError(await call(base, `/v1/jobs/${job.id}${suffix}`, { headers }), 403, "forbidden");
        }
      }
      expect(get).not.toHaveBeenCalled();
      expect(read).not.toHaveBeenCalled();
      expect(await queue.getJob(job.id)).toEqual(job);
    });

    it("captures exact gateway allowlists without widening either default implicitly", async () => {
      const allowedHosts = ["SYNTHETIC-GATEWAY.EXAMPLE:443"];
      const allowedOrigins = ["https://synthetic-client.example"];
      const gateway = await listen({ allowedHosts, allowedOrigins });
      allowedHosts.push("review-attacker.example");
      allowedOrigins.push("http://review-attacker.example");
      const headers = { host: "synthetic-gateway.example:443", origin: "https://synthetic-client.example:443" };
      const reply = await call(gateway, "/v1/jobs", {
        method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify({ job: charts }),
      });
      expect(reply.status).toBe(202);
      const job = snapshot(reply);
      expect((await call(gateway, `/v1/jobs/${job.id}`, { headers })).status).toBe(200);
      expect((await call(gateway, `/v1/jobs/${job.id}`, { headers: { host: headers.host } })).status).toBe(200);
      for (const rejected of [
        { host: "synthetic-gateway.example:444", origin: headers.origin },
        { host: "review-attacker.example", origin: headers.origin },
        { host: headers.host, origin: "http://review-attacker.example" },
        { host: headers.host, origin: "https://synthetic-client.example:444" },
        { host: new URL(gateway).host, origin: headers.origin },
      ]) expectError(await call(gateway, `/v1/jobs/${job.id}`, { headers: rejected }), 403, "forbidden");
      const hostOnly = await listen({ allowedHosts: [headers.host] });
      expectError(await call(hostOnly, "/v1/jobs", { headers }), 403, "forbidden");
      const originOnly = await listen({ allowedOrigins: [headers.origin] });
      expectError(await call(originOnly, "/v1/jobs", { headers }), 403, "forbidden");
    });

    it("treats empty allowlists as deny lists", async () => {
      const noHosts = await listen({ allowedHosts: [] });
      expectError(await call(noHosts, "/v1/jobs"), 403, "forbidden");
      const noOrigins = await listen({ allowedOrigins: [] });
      expectError(await call(noOrigins, "/v1/jobs", { headers: { origin: noOrigins } }), 403, "forbidden");
      expect((await post(noOrigins, { job: charts })).status).toBe(202);
    });

    it.each(workloads.map((spec, index) => ({ spec, index })))
      ("submits $spec.kind and exposes exact committed status, progress and resumable NDJSON", async ({ spec, index }) => {
        const submitted = await post(base, { job: spec });
        expect(submitted.status).toBe(202);
        const job = snapshot(submitted);
        expect(submitted.headers.location).toBe(`/v1/jobs/${job.id}`);
        expect(job).toEqual(await queue.getJob(job.id));
        expect(job).toMatchObject({ status: "queued", totalTasks: workloadRows[index]!.length, nextCursor: 0 });
        await assertStatus(job);
        const queued = await call(base, `/v1/jobs/${job.id}/results`);
        expect(queued.status).toBe(200);
        expect(queued.headers["content-type"]).toMatch(/^application\/x-ndjson\b/);
        expect(queued.headers["cache-control"]).toBe("no-store");
        expect(queued.headers["x-content-type-options"]).toBe("nosniff");
        expect(queued.text).toBe("");

        const claimed = required(await peer.claim(owner));
        await assertStatus(claimed.snapshot);
        expect((await call(base, `/v1/jobs/${job.id}`)).text).not.toContain(claimed.lease.token);
        const rows = workloadRows[index]!;
        const partial = await peer.commit(claimed.lease, rows.slice(0, 1));
        await assertStatus(partial);
        const prefix = await call(base, `/v1/jobs/${job.id}/results?cursor=0&follow=false`);
        expect(prefix.status).toBe(200);
        expect(prefix.text).toBe(`${JSON.stringify(rows[0])}\n`);
        const complete = await peer.commit(claimed.lease, rows.slice(1));
        await assertStatus(complete);

        for (let cursor = 0; cursor <= rows.length; cursor++) {
          const result = await call(base, `/v1/jobs/${job.id}/results?cursor=${cursor}`);
          expect(result.status).toBe(200);
          expect(result.headers["content-type"]).toMatch(/^application\/x-ndjson\b/);
          expect(result.text).toBe(rows.slice(cursor).map((row) => `${JSON.stringify(row)}\n`).join(""));
        }
        const terminalFollow = await call(base, `/v1/jobs/${job.id}/results?follow=true`);
        expect(terminalFollow.text).toBe(rows.map((row) => `${JSON.stringify(row)}\n`).join(""));
      });

    it("reports retry delay and terminal failure while retaining the committed result prefix", async () => {
      const response = await post(base, { job: charts, retry: { maxAttempts: 2, delayMs: 17 } });
      expect(response.status).toBe(202);
      const job = snapshot(response);
      expect(job.retry).toEqual({ maxAttempts: 2, delayMs: 17 });
      const claimed = required(await peer.claim(owner));
      await peer.commit(claimed.lease, workloadRows[0]!.slice(0, 1));
      const retry = await peer.fail(claimed.lease);
      expect(retry).toMatchObject({ status: "queued", nextCursor: 1, retryAt: clock + 17 });
      await assertStatus(retry);
      expect(await peer.claim(owner)).toBeNull();
      clock += 17;
      const reclaimed = required(await peer.claim(owner));
      const failed = await peer.fail(reclaimed.lease);
      await assertStatus(failed);
      expect(failed).toMatchObject({ status: "failed", nextCursor: 1, failureCount: 2 });
      const result = await call(base, `/v1/jobs/${job.id}/results?follow=true`);
      expect(result.status).toBe(200);
      expect(result.text).toBe(`${JSON.stringify(workloadRows[0]![0])}\n`);
    });

    it("deduplicates concurrent canonical submissions and returns Location for every replay", async () => {
      const canonical = validateJob(charts).spec;
      const replies = await Promise.all(Array.from({ length: 6 }, (_, index) => post(base,
        index % 2 === 0 ? { job: charts } : { job: canonical, retry: RETRY_DEFAULTS }, "synthetic-concurrent")));
      const jobs = replies.map((reply) => {
        expect(reply.status).toBe(202);
        const job = snapshot(reply);
        expect(reply.headers.location).toBe(`/v1/jobs/${job.id}`);
        return job;
      });
      expect(new Set(jobs.map((job) => job.id)).size).toBe(1);
      const claimed = required(await peer.claim(owner));
      expect(await peer.claim(owner)).toBeNull();
      await peer.commit(claimed.lease, workloadRows[0]!);
      const replay = await post(base, { job: canonical, retry: {} }, "synthetic-concurrent");
      expect(replay.status).toBe(202);
      expect(snapshot(replay)).toEqual(await queue.getJob(claimed.snapshot.id));
      expect(replay.headers.location).toBe(`/v1/jobs/${claimed.snapshot.id}`);
      expectError(await post(base, { job: charts, retry: { delayMs: 1 } }, "synthetic-concurrent"), 409, "idempotency-conflict");
      expectError(await post(base, { job: { ...charts, births: people.slice(0, 1) } }, "synthetic-concurrent"), 409, "idempotency-conflict");
    });

    it("arbitrates simultaneous conflicting keyed submissions without creating a second job", async () => {
      const replies = await Promise.all([
        post(base, { job: charts }, "synthetic-conflict"),
        post(base, { job: workloads[1] }, "synthetic-conflict"),
      ]);
      expect(replies.map((reply) => reply.status).sort()).toEqual([202, 409]);
      expectError(replies.find((reply) => reply.status === 409)!, 409, "idempotency-conflict");
      const claimed = required(await peer.claim(owner));
      expect(claimed.snapshot.id).toBe(snapshot(replies.find((reply) => reply.status === 202)!).id);
      expect(await peer.claim(owner)).toBeNull();
    });

    it("creates independent jobs when the optional idempotency header is absent", async () => {
      const a = snapshot(await post(base, { job: charts }));
      const b = snapshot(await post(base, { job: charts }));
      expect(a.id).not.toBe(b.id);
      expect(await peer.claim(owner)).not.toBeNull();
      expect(await peer.claim(owner)).not.toBeNull();
      expect(await peer.claim(owner)).toBeNull();
    });

    it.each([
      { name: "missing job", value: {} },
      { name: "null job", value: { job: null } },
      { name: "unknown envelope field", value: { job: charts, extra: true } },
      { name: "array envelope", value: [] },
      { name: "null envelope", value: null },
      { name: "unknown workload", value: { job: { ...charts, kind: "synthetic-unknown" } } },
      { name: "empty births", value: { job: { ...charts, births: [] } } },
      { name: "duplicate identifiers", value: { job: { ...charts, births: [people[0], people[0]] } } },
      { name: "invalid instant", value: { job: { ...charts, births: [{ id: "synthetic-invalid", birth: { utc: "2001-02-30T04:05:06Z" } }] } } },
      { name: "missing longitude", value: { job: { ...charts, births: [{ id: "synthetic-invalid", birth: { utc: "2001-02-03T04:05:06Z", latitude: 12 } }] } } },
      { name: "unknown person field", value: { job: { ...charts, births: [{ ...people[0], extra: true }] } } },
    ])("rejects $name without adding work", async ({ value }) => {
      expectError(await post(base, value), 400, "invalid-input");
      expect(await peer.claim(owner)).toBeNull();
    });

    it("reports an unsupported schema version and refuses an excessive grid without expanding it", async () => {
      expectError(await post(base, { job: { ...charts, version: 2 } }), 400, "unsupported-version");
      expectError(await post(base, { job: {
        ...workloads[1], start: "2000-01-01T00:00:00Z", end: "2000-01-02T00:00:00Z", stepMs: 1,
      } }), 413, "limit-exceeded");
      expect(await peer.claim(owner)).toBeNull();
    });

    it.each([
      null, [], { maxAttempts: 0 }, { maxAttempts: QUEUE_LIMITS.maxAttempts + 1 },
      { maxAttempts: 1.5 }, { maxAttempts: "2" }, { delayMs: -1 },
      { delayMs: QUEUE_LIMITS.maxRetryDelayMs + 1 }, { delayMs: null }, { extra: true },
    ].map((retry) => ({ retry })))("rejects invalid retry policy without reserving the idempotency key: $retry", async ({ retry }) => {
      expectError(await post(base, { job: charts, retry }, "synthetic-invalid-retry"), 400, "invalid-argument");
      expect(await peer.claim(owner)).toBeNull();
      const accepted = await post(base, { job: charts }, "synthetic-invalid-retry");
      expect(accepted.status).toBe(202);
      expect(snapshot(accepted).retry).toEqual(RETRY_DEFAULTS);
    });

    it.each(["", "synthetic invalid", "x".repeat(QUEUE_LIMITS.maxIdempotencyKeyLength + 1)])
      ("rejects invalid idempotency headers: %j", async (key) => {
        expectError(await post(base, { job: charts }, key), 400, "invalid-argument");
        expect(await peer.claim(owner)).toBeNull();
      });

    it("rejects duplicate idempotency headers instead of choosing one", async () => {
      const reply = await call(base, "/v1/jobs", {
        method: "POST", body: JSON.stringify({ job: charts }),
        headers: { "content-type": "application/json", "idempotency-key": ["synthetic-a", "synthetic-b"] },
      });
      expectError(reply, 400, "invalid-request");
      expect(await peer.claim(owner)).toBeNull();
    });

    it.each(["", "{", '{"job":', '{"synthetic-private": invalid}', "\"unterminated"])
      ("rejects invalid JSON with a fixed diagnostic: %j", async (body) => {
        const reply = await call(base, "/v1/jobs", { method: "POST", headers: { "content-type": "application/json" }, body });
        expectError(reply, 400, "invalid-json");
        expect(reply.text).not.toContain("synthetic-private");
        expect(await peer.claim(owner)).toBeNull();
      });

    it("rejects invalid UTF-8 before schema validation", async () => {
      const body = Buffer.concat([
        Buffer.from('{"job":{"version":1,"kind":"charts","births":[{"id":"synthetic-'),
        Buffer.from([0xc3, 0x28]),
        Buffer.from('","birth":{"utc":"2001-02-03T04:05:06Z"}}]}}'),
      ]);
      expectError(await call(base, "/v1/jobs", {
        method: "POST", headers: { "content-type": "application/json" }, body,
      }), 400, "invalid-json");
      expect(await peer.claim(owner)).toBeNull();
    });

    it("does not copy unknown keys or submitted values into validation diagnostics", async () => {
      const marker = "synthetic-private-submitted-value";
      const invalid = [
        { job: charts, [marker]: marker },
        { job: { ...charts, [marker]: marker } },
        { job: { ...charts, births: [{ id: marker, birth: { utc: marker } }] } },
      ];
      for (const value of invalid) {
        const reply = await post(base, value);
        expectError(reply, 400, "invalid-input");
        expect(reply.text).not.toContain(marker);
      }
      expect(await peer.claim(owner)).toBeNull();
    });

    it.each([
      {}, { "content-type": "text/plain" }, { "content-type": "application/problem+json" },
      { "content-type": "application/json; charset=iso-8859-1" },
      { "content-type": "application/json", "content-encoding": "gzip" },
    ])("requires supported JSON media and identity encoding: %j", async (headers) => {
      expectError(await call(base, "/v1/jobs", { method: "POST", headers, body: JSON.stringify({ job: charts }) }), 415, "unsupported-media-type");
      expect(await peer.claim(owner)).toBeNull();
    });

    it.each(["application/json; charset=utf-8", 'APPLICATION/JSON; CHARSET="UTF-8"'])
      ("accepts supported UTF-8 media type %s and identity encoding", async (type) => {
      const accepted = await call(base, "/v1/jobs", {
        method: "POST", body: JSON.stringify({ job: charts }),
        headers: { "content-type": type, "content-encoding": "identity" },
      });
      expect(accepted.status).toBe(202);
      expect(snapshot(accepted).kind).toBe("charts");
    });

    it.each([false, true])("enforces the exact body byte ceiling with chunked=%s", async (chunked) => {
      const body = JSON.stringify({ job: charts });
      const bounded = await listen({ maxBodyBytes: Buffer.byteLength(body) });
      const accepted = await call(bounded, "/v1/jobs", {
        method: "POST", headers: { "content-type": "application/json" },
        ...(chunked ? { chunks: [body.slice(0, 20), body.slice(20)] } : { body }),
      });
      expect(accepted.status).toBe(202);
      const rejected = await call(bounded, "/v1/jobs", {
        method: "POST", headers: { "content-type": "application/json" },
        ...(chunked ? { chunks: [body, " "] } : { body: `${body} ` }),
      });
      expectError(rejected, 413, "body-too-large");
      expect(await peer.claim(owner)).not.toBeNull();
      expect(await peer.claim(owner)).toBeNull();
    });

    it("counts UTF-8 bytes before parsing and refuses bodies above the default ceiling", async () => {
      const bounded = await listen({ maxBodyBytes: 3 });
      expectError(await call(bounded, "/v1/jobs", {
        method: "POST", headers: { "content-type": "application/json" }, chunks: [Buffer.from("😀")],
      }), 413, "body-too-large");
      expectError(await call(base, "/v1/jobs", {
        method: "POST", headers: { "content-type": "application/json" }, body: " ".repeat(DEFAULT_LIMITS.maxInputBytes + 1),
      }), 413, "body-too-large");
      expect(await peer.claim(owner)).toBeNull();
    });

    it.each(["/", "/v2/jobs", "/v1/jobs/", "/v1/jobs/synthetic-missing/unknown"])
      ("returns not-found for unknown route %s", async (path) => {
        expectError(await call(base, path), 404, "not-found");
      });

    it.each(["", "/progress", "/results"])("returns not-found for a missing job at %s", async (suffix) => {
      expectError(await call(base, `/v1/jobs/synthetic-missing${suffix}`), 404, "not-found");
    });

    it("rejects malformed percent-encoded paths and bodies on GET routes", async () => {
      expectError(await call(base, "/v1/jobs/%E0%A4%A"), 400, "invalid-request");
      const job = snapshot(await post(base, { job: charts }));
      for (const suffix of ["", "/progress", "/results"]) {
        expectError(await call(base, `/v1/jobs/${job.id}${suffix}`, {
          body: "{}", headers: { "content-length": "2" },
        }), 400, "invalid-request");
      }
    });

    it("rejects 100-continue before reading a submission body", async () => {
      const reply = await call(base, "/v1/jobs", {
        method: "POST",
        headers: { "content-type": "application/json", "content-length": "17", expect: "100-continue" },
      });
      expectError(reply, 417, "invalid-request");
      expect(await peer.claim(owner)).toBeNull();
    });

    it.each([
      { path: "/v1/jobs", method: "GET", allow: "POST" },
      { path: "/v1/jobs", method: "DELETE", allow: "POST" },
      { path: "/v1/jobs/synthetic-missing", method: "POST", allow: "GET" },
      { path: "/v1/jobs/synthetic-missing/progress", method: "PATCH", allow: "GET" },
      { path: "/v1/jobs/synthetic-missing/results", method: "POST", allow: "GET" },
    ])("returns method-not-allowed for $method $path", async ({ path, method, allow }) => {
      const reply = await call(base, path, { method });
      expectError(reply, 405, "method-not-allowed");
      expect(reply.headers.allow).toBe(allow);
    });

    it.each([
      "cursor=", "cursor=-1", "cursor=%2B1", "cursor=1.0", "cursor=1e0", "cursor=0x1", "cursor=00",
      "cursor=9007199254740992", "cursor=0&cursor=0", "follow=", "follow=1",
      "follow=True", "follow=false&follow=false", "limit=1", "unknown=synthetic-private",
    ])("strictly validates result query parameters: %s", async (query) => {
      const job = snapshot(await post(base, { job: charts }));
      const reply = await call(base, `/v1/jobs/${job.id}/results?${query}`);
      expectError(reply, 400, query === "cursor=9007199254740992" ? "invalid-argument" : "invalid-request");
      expect(reply.text).not.toContain("synthetic-private");
    });

    it("refuses cursors ahead of committed progress and query parameters on other routes", async () => {
      const job = snapshot(await post(base, { job: charts }));
      expectError(await call(base, `/v1/jobs/${job.id}/results?cursor=1`), 400, "invalid-argument");
      for (const path of [`/v1/jobs/${job.id}?cursor=0`, `/v1/jobs/${job.id}/progress?follow=false`]) {
        expectError(await call(base, path), 400, "invalid-request");
      }
      expectError(await call(base, "/v1/jobs?extra=true", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ job: charts }),
      }), 400, "invalid-request");
      expect(await peer.claim(owner)).not.toBeNull();
      expect(await peer.claim(owner)).toBeNull();
    });

    it("returns unavailable for closed queue handles across all supported operations", async () => {
      const job = snapshot(await post(base, { job: charts }));
      await queue.close();
      expectError(await post(base, { job: charts }), 503, "unavailable");
      for (const suffix of ["", "/progress", "/results"]) {
        expectError(await call(base, `/v1/jobs/${job.id}${suffix}`), 503, "unavailable");
      }
    });

    it("maps busy storage and unexpected backend failures without leaking diagnostics", async () => {
      const marker = "synthetic-private-backend-message";
      const spy = vi.spyOn(queue, "getJob");
      spy.mockRejectedValueOnce(new QueueError("storage-busy"));
      expectError(await call(base, "/v1/jobs/synthetic-id"), 503, "unavailable");
      const diagnostics: string[] = [];
      for (const error of [new Error(marker), marker, { message: marker, code: marker }]) {
        spy.mockRejectedValueOnce(error);
        const response = await call(base, "/v1/jobs/synthetic-id");
        diagnostics.push(expectError(response, 500, "internal-error"));
        expect(response.text).not.toContain(marker);
      }
      expect(new Set(diagnostics).size).toBe(1);
      spy.mockRestore();
      const submit = vi.spyOn(queue, "submit").mockRejectedValueOnce(new Error(marker));
      expectError(await post(base, { job: charts }), 500, "internal-error");
      submit.mockRestore();
      const read = vi.spyOn(queue, "readResults").mockRejectedValueOnce(new Error(marker));
      expectError(await call(base, "/v1/jobs/synthetic-id/results"), 500, "internal-error");
      read.mockRestore();
    });

    if (backend === "sqlite") {
      it("retains keyed replay and resumable HTTP results after reopening the database", async () => {
        const submitted = await post(base, { job: charts }, "synthetic-persisted");
        const job = snapshot(submitted);
        const claimed = required(await peer.claim(owner));
        await peer.commit(claimed.lease, workloadRows[0]!);
        const first = await call(base, `/v1/jobs/${job.id}/results?cursor=0`);
        const retainedCursor = (JSON.parse(first.text.split("\n")[0]!) as { nextCursor: number }).nextCursor;
        for (const control of controls) await control.close();
        await queue.close();
        await peer.close();
        queue = new SqliteQueue(filename, { now: () => clock });
        peer = new SqliteQueue(filename, { now: () => clock });
        base = await listen();
        const replay = await post(base, { job: charts }, "synthetic-persisted");
        expect(replay.status).toBe(202);
        expect(snapshot(replay)).toMatchObject({ id: job.id, status: "completed", nextCursor: 3 });
        const resumed = await call(base, `/v1/jobs/${job.id}/results?cursor=${retainedCursor}`);
        expect(resumed.text).toBe(workloadRows[0]!.slice(retainedCursor).map((row) => `${JSON.stringify(row)}\n`).join(""));
        expect(await peer.claim(owner)).toBeNull();
      });
    }
  });
}

describe("HTTP control configuration", () => {
  it.each([
    { maxBodyBytes: 0 }, { maxBodyBytes: DEFAULT_LIMITS.maxInputBytes + 1 },
    { requestTimeoutMs: -1 }, { requestTimeoutMs: 2_147_483_648 },
    { streamPollMs: 0 }, { streamPollMs: 2_147_483_648 },
    { maxConcurrentRequests: 0 }, { maxConcurrentRequests: 1.5 },
    { maxBodyBytes: "100" }, { streamPollMs: null }, { extra: true }, null,
    { allowedHosts: "localhost" }, { allowedHosts: null }, { allowedHosts: ["*"] },
    { allowedHosts: ["localhost:0"] }, { allowedHosts: ["localhost:65536"] },
    { allowedHosts: ["http://localhost"] }, { allowedHosts: ["localhost."] },
    { allowedHosts: ["localhost\n"] }, { allowedHosts: [undefined] }, { allowedHosts: Array(1) },
    { allowedOrigins: "http://localhost" }, { allowedOrigins: ["*"] }, { allowedOrigins: ["null"] },
    { allowedOrigins: ["http://localhost/"] }, { allowedOrigins: ["https://user@localhost"] },
    { allowedOrigins: ["http://localhost\n"] }, { allowedOrigins: [1] },
  ].map((options) => ({ options })))("rejects invalid options $options before listening", async ({ options }) => {
    const queue = new MemoryQueue();
    try {
      expect(() => createControlServer(queue, options as unknown as HttpControlOptions))
        .toThrowError(new QueueError("invalid-argument"));
      expect(await queue.submit(charts)).toMatchObject({ status: "queued" });
    } finally { await queue.close(); }
  });

  it("accepts inclusive configuration bounds without acquiring queue ownership", async () => {
    const queue = new MemoryQueue();
    const minimum = createControlServer(queue, {
      maxBodyBytes: 1, requestTimeoutMs: 1, streamPollMs: 1, maxConcurrentRequests: 1,
    });
    const maximum = createControlServer(queue, {
      maxBodyBytes: DEFAULT_LIMITS.maxInputBytes, requestTimeoutMs: 2_147_483_647,
      streamPollMs: 2_147_483_647, maxConcurrentRequests: Number.MAX_SAFE_INTEGER,
    });
    try {
      expect(HTTP_CONTROL_DEFAULTS.maxBodyBytes).toBe(DEFAULT_LIMITS.maxInputBytes);
      expect(minimum.server.listening).toBe(false);
      expect(maximum.server.listening).toBe(false);
      await minimum.close();
      await maximum.close();
      expect(await queue.submit(charts)).toMatchObject({ status: "queued" });
    } finally {
      await minimum.close();
      await maximum.close();
      await queue.close();
    }
  });
});
