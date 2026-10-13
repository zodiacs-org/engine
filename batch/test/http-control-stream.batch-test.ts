import { request } from "node:http";
import type { ClientRequest, IncomingMessage, RequestOptions } from "node:http";
import { setImmediate as turn, setTimeout as delay } from "node:timers/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ResultRow } from "../src/execution.js";
import { createControlServer } from "../src/http-control.js";
import { MemoryQueue } from "../src/memory-queue.js";
import type { JobSpec } from "../src/model.js";
import { QueueError, RETRY_DEFAULTS } from "../src/queue.js";
import type { JobSnapshot, ResultPage, ResultPageOptions } from "../src/queue.js";

// Invented inputs and transport values. Queue commits check routing and JSON,
// not astronomical accuracy; these tests do not introduce ephemeris fixtures.
const job: JobSpec = {
  version: 1, kind: "charts",
  births: Array.from({ length: 3 }, (_, index) => ({
    id: `synthetic-${index}`, birth: { utc: "2001-02-03T04:05:06Z", timeKnown: false },
  })),
};
const owner = { owner: "synthetic-http-worker", leaseMs: 60_000 };

function row(index: number, note = "synthetic transport 星🌙"): ResultRow {
  return {
    version: 1, kind: "charts", index, nextCursor: index + 1,
    personId: `synthetic-${index}`, value: { note },
  } as unknown as ResultRow;
}

function snapshot(id: string, total: number): JobSnapshot {
  return {
    id, kind: "charts", status: "completed", totalTasks: total,
    completedTasks: total, nextCursor: total, claimCount: 1,
    retry: RETRY_DEFAULTS, failureCount: 0, retryAt: null, lastFailure: null,
    createdAt: 0, updatedAt: 0, finishedAt: 0, lease: null,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

const requests: ClientRequest[] = [];
const queues: MemoryQueue[] = [];
const services: ReturnType<typeof createControlServer>[] = [];

async function start(options: Parameters<typeof createControlServer>[1] = {}) {
  const queue = new MemoryQueue();
  queues.push(queue);
  const service = createControlServer(queue, options);
  services.push(service);
  await new Promise<void>((resolve, reject) => {
    service.server.once("error", reject);
    service.server.listen(0, "127.0.0.1", () => {
      service.server.off("error", reject);
      resolve();
    });
  });
  const address = service.server.address();
  if (!address || typeof address === "string") throw new Error("Expected a loopback TCP listener.");
  return { queue, service, base: `http://127.0.0.1:${address.port}` };
}

function open(url: string, options: RequestOptions = {}, end = true) {
  const result = deferred<IncomingMessage>();
  const client = request(url, { agent: false, ...options }, (response) => {
    // Abrupt socket closure is an expected outcome in several tests. Observe
    // errors even when that test intentionally never consumes a response body.
    response.on("error", () => {});
    result.resolve(response);
  });
  client.on("error", result.reject);
  void result.promise.catch(() => {});
  requests.push(client);
  if (end) client.end();
  return { client, response: result.promise };
}

function collect(response: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    response.on("data", (chunk: Buffer) => chunks.push(chunk));
    response.once("close", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
}

function responseClosed(service: ReturnType<typeof createControlServer>): Promise<void> {
  return new Promise((resolve) => {
    service.server.once("request", (_request, response) => response.once("close", resolve));
  });
}

afterEach(async () => {
  for (const client of requests.splice(0)) client.destroy();
  await Promise.all(services.splice(0).map((service) => service.close()));
  await Promise.all(queues.splice(0).map((queue) => queue.close()));
  vi.restoreAllMocks();
});

describe("HTTP result streaming over loopback sockets", () => {
  it("flushes headers for an empty active prefix, then follows commits through completion", async () => {
    const { queue, base } = await start({ streamPollMs: 5 });
    const submitted = await queue.submit(job);
    const read = vi.spyOn(queue, "readResults");
    const response = await open(`${base}/v1/jobs/${submitted.id}/results?follow=true`).response;
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("application/x-ndjson");
    expect(response.complete).toBe(false);
    const received = collect(response);
    await vi.waitFor(() => expect(read.mock.calls.length).toBeGreaterThan(1), { interval: 5 });
    expect(await queue.getJob(submitted.id)).toEqual(submitted);
    const claimed = (await queue.claim(owner))!;
    await queue.commit(claimed.lease, [row(0)]);
    await queue.commit(claimed.lease, [row(1), row(2)]);
    expect(await received).toBe([row(0), row(1), row(2)].map((value) => JSON.stringify(value) + "\n").join(""));
    expect(response.complete).toBe(true);
  });

  it("stops polling after a client disconnect without closing or releasing the queue", async () => {
    const { queue, service, base } = await start({ streamPollMs: 5 });
    const submitted = await queue.submit(job);
    const claimed = (await queue.claim(owner))!;
    const read = vi.spyOn(queue, "readResults");
    const close = vi.spyOn(queue, "close");
    const ended = responseClosed(service);
    const connection = open(`${base}/v1/jobs/${submitted.id}/results?follow=true`);
    const response = await connection.response;
    await vi.waitFor(() => expect(read.mock.calls.length).toBeGreaterThan(1), { interval: 5 });
    response.destroy();
    connection.client.destroy();
    await ended;
    await turn();
    const calls = read.mock.calls.length;
    await delay(30);
    expect(read).toHaveBeenCalledTimes(calls);
    expect(close).not.toHaveBeenCalled();
    expect(await queue.getJob(submitted.id)).toEqual(claimed.snapshot);
    expect(await queue.commit(claimed.lease, [row(0), row(1), row(2)]))
      .toMatchObject({ status: "completed", nextCursor: 3 });
  });

  it("abandons a following read in progress when its socket disconnects", async () => {
    const { queue, service, base } = await start({ streamPollMs: 5, maxConcurrentRequests: 1 });
    const submitted = await queue.submit(job);
    const firstPage = (await queue.readResults(submitted.id, { limit: 1 }))!;
    const pending = deferred<ResultPage>();
    const began = deferred<void>();
    const read = vi.spyOn(queue, "readResults").mockResolvedValueOnce(firstPage).mockImplementation(() => {
      began.resolve();
      return pending.promise;
    });
    const ended = responseClosed(service);
    const response = await open(`${base}/v1/jobs/${submitted.id}/results?follow=true`).response;
    await began.promise;
    response.destroy();
    await ended;
    await turn();
    const progress = await open(`${base}/v1/jobs/${submitted.id}/progress`).response;
    expect(progress.statusCode).toBe(200);
    await collect(progress);
    pending.reject(new Error("private late following read failure"));
    await turn();
    await turn();
    expect(read).toHaveBeenCalledTimes(2);
    expect(await queue.getJob(submitted.id)).toEqual(submitted);
  });

  it("freezes finite exports at the initial atomic page even when progress advances before headers", async () => {
    const { queue, base } = await start();
    const submitted = await queue.submit(job);
    const claimed = (await queue.claim(owner))!;
    await queue.commit(claimed.lease, [row(0), row(1)]);
    const original = queue.readResults.bind(queue);
    const read = vi.spyOn(queue, "readResults").mockImplementationOnce(async (id, options) => {
      const page = await original(id, options);
      await queue.commit(claimed.lease, [row(2)]);
      return page;
    });
    const response = await open(`${base}/v1/jobs/${submitted.id}/results`).response;
    expect(await collect(response)).toBe(JSON.stringify(row(0)) + "\n" + JSON.stringify(row(1)) + "\n");
    expect(response.complete).toBe(true);
    expect(read.mock.calls.filter(([, options]) => (options?.cursor ?? 0) === 0)).toHaveLength(1);
    expect(await queue.getJob(submitted.id)).toMatchObject({ status: "completed", nextCursor: 3 });
  });

  it.each([
    { failure: new QueueError("invalid-argument"), status: 400, code: "invalid-argument" },
    { failure: new QueueError("storage-busy"), status: 503, code: "unavailable" },
    { failure: new QueueError("storage-failure"), status: 500, code: "internal-error" },
    { failure: new Error("private backend details"), status: 500, code: "internal-error" },
  ])("returns JSON for a preflight $code failure before any NDJSON headers", async ({ failure, status, code }) => {
    const { queue, base } = await start();
    vi.spyOn(queue, "readResults").mockRejectedValue(failure);
    const response = await open(`${base}/v1/jobs/synthetic-job/results?follow=true`).response;
    expect(response.statusCode).toBe(status);
    expect(response.headers["content-type"]).toContain("application/json");
    const body = await collect(response);
    expect(JSON.parse(body)).toEqual({ error: { code, message: expect.any(String) } });
    expect(body).not.toContain("private backend details");
    expect(response.complete).toBe(true);
  });

  it("returns a missing-job error before starting a following response", async () => {
    const { base } = await start();
    const response = await open(`${base}/v1/jobs/synthetic-missing/results?follow=true`).response;
    expect(response.statusCode).toBe(404);
    expect(JSON.parse(await collect(response))).toMatchObject({ error: { code: "not-found" } });
  });

  it("destroys a response after a later read fails without writing an error as a result row", async () => {
    const { queue, base } = await start();
    const pending = deferred<ResultPage>();
    const first = row(0);
    vi.spyOn(queue, "readResults")
      .mockResolvedValueOnce({ rows: [first], nextCursor: 1, snapshot: snapshot("synthetic-job", 3) })
      .mockImplementation(() => pending.promise);
    const response = await open(`${base}/v1/jobs/synthetic-job/results`).response;
    const firstChunk = deferred<void>();
    response.once("data", () => firstChunk.resolve());
    const received = collect(response);
    await firstChunk.promise;
    pending.reject(new Error("private backend details"));
    expect(response.statusCode).toBe(200);
    expect(await received).toBe(JSON.stringify(first) + "\n");
    expect(response.complete).toBe(false);
  });

  it("bounds page reads while the socket consumer is paused", async () => {
    const { queue, service, base } = await start();
    let reads = 0;
    const never = deferred<ResultPage>();
    const largeNote = "s".repeat(800_000);
    // The safety fence keeps a broken implementation from generating an entire
    // workload. The assertion allows kernel TCP buffers as well as JS buffers;
    // it checks read-ahead behavior, not a portable heap-byte bound.
    vi.spyOn(queue, "readResults").mockImplementation(async (id, options: ResultPageOptions = {}) => {
      if (++reads >= 128) return never.promise;
      const cursor = options.cursor ?? 0;
      expect(options.limit).toBe(1);
      return { rows: [row(cursor, largeNote)], nextCursor: cursor + 1, snapshot: snapshot(id, 100_000) };
    });
    const ended = responseClosed(service);
    const response = await open(`${base}/v1/jobs/synthetic-job/results`).response;
    response.pause();
    await delay(150);
    expect(reads).toBeGreaterThan(0);
    expect(reads).toBeLessThan(64);
    response.destroy();
    await ended;
    await turn();
    const stopped = reads;
    await delay(30);
    expect(reads).toBe(stopped);
  });

  it("reconnects from the last retained complete line after discarding a partial UTF-8 line", async () => {
    const { queue, base } = await start();
    const submitted = await queue.submit(job);
    const claimed = (await queue.claim(owner))!;
    const rows = [row(0), row(1, "s".repeat(100_000) + "🌙"), row(2)];
    await queue.commit(claimed.lease, rows);
    const response = await open(`${base}/v1/jobs/${submitted.id}/results`).response;
    const retained = deferred<Buffer>();
    const chunks: Buffer[] = [];
    const cutoff = Buffer.byteLength(JSON.stringify(rows[0]) + "\n")
      + Buffer.from(JSON.stringify(rows[1])).indexOf(Buffer.from("🌙")) + 2;
    let bytes = 0;
    response.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
      bytes += chunk.length;
      if (bytes >= cutoff) {
        retained.resolve(Buffer.concat(chunks).subarray(0, cutoff));
        response.destroy();
      }
    });
    const partial = await retained.promise;
    const whole = partial.subarray(0, partial.lastIndexOf(10) + 1).toString("utf8");
    const last = JSON.parse(whole.trimEnd()) as ResultRow;
    expect(last.index).toBe(0);
    const resumed = await open(`${base}/v1/jobs/${submitted.id}/results?cursor=${last.nextCursor}`).response;
    const body = await collect(resumed);
    expect(whole + body).toBe(rows.map((value) => JSON.stringify(value) + "\n").join(""));
    expect(body).not.toContain("�");
  });
});

describe("HTTP lifecycle and upload bounds over loopback sockets", () => {
  it("abandons a disconnected preflight read, frees admission and observes its late rejection", async () => {
    const { queue, service, base } = await start({ maxConcurrentRequests: 1 });
    const submitted = await queue.submit(job);
    const pending = deferred<ResultPage>();
    const began = deferred<void>();
    const read = vi.spyOn(queue, "readResults").mockImplementation(() => {
      began.resolve();
      return pending.promise;
    });
    const ended = responseClosed(service);
    const connection = open(`${base}/v1/jobs/${submitted.id}/results`);
    await began.promise;
    connection.client.destroy();
    await ended;
    await turn();
    const progress = await open(`${base}/v1/jobs/${submitted.id}/progress`).response;
    expect(progress.statusCode).toBe(200);
    expect(JSON.parse(await collect(progress))).toMatchObject({ id: submitted.id, nextCursor: 0 });
    pending.reject(new Error("private late read failure"));
    await turn();
    await turn();
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("closes idle followers and pending preflight reads while retaining queue ownership", async () => {
    const { queue, service, base } = await start({ streamPollMs: 60_000 });
    const submitted = await queue.submit(job);
    const pending = deferred<ResultPage>();
    const began = deferred<void>();
    const original = queue.readResults.bind(queue);
    const read = vi.spyOn(queue, "readResults").mockImplementation((id, options) => {
      if (id === "synthetic-pending") { began.resolve(); return pending.promise; }
      return original(id, options);
    });
    const close = vi.spyOn(queue, "close");
    const response = await open(`${base}/v1/jobs/${submitted.id}/results?follow=true`).response;
    const received = collect(response);
    const preflight = open(`${base}/v1/jobs/synthetic-pending/results`);
    await began.promise;
    await service.close();
    await service.close();
    expect(await received).toBe("");
    expect(response.complete).toBe(false);
    await expect(preflight.response).rejects.toBeInstanceOf(Error);
    expect(service.server.listening).toBe(false);
    expect(close).not.toHaveBeenCalled();
    expect(await queue.getJob(submitted.id)).toEqual(submitted);
    const calls = read.mock.calls.length;
    pending.reject(new Error("private late shutdown failure"));
    await turn();
    await turn();
    expect(read).toHaveBeenCalledTimes(calls);
  });

  it("rejects admission while a follower is active and admits requests after it disconnects", async () => {
    const { queue, service, base } = await start({ maxConcurrentRequests: 1, streamPollMs: 60_000 });
    const submitted = await queue.submit(job);
    const ended = responseClosed(service);
    const follower = await open(`${base}/v1/jobs/${submitted.id}/results?follow=true`).response;
    const rejected = await open(`${base}/v1/jobs/${submitted.id}/progress`).response;
    expect(rejected.statusCode).toBe(503);
    expect(JSON.parse(await collect(rejected))).toMatchObject({ error: { code: "unavailable" } });
    follower.destroy();
    await ended;
    await turn();
    const admitted = await open(`${base}/v1/jobs/${submitted.id}/progress`).response;
    expect(admitted.statusCode).toBe(200);
    await collect(admitted);
  });

  it("does not submit an upload that disconnects before its declared body finishes", async () => {
    const { queue, service, base } = await start();
    const submit = vi.spyOn(queue, "submit");
    const data = deferred<void>();
    service.server.once("request", (incoming) => incoming.once("data", () => data.resolve()));
    const ended = responseClosed(service);
    const upload = open(`${base}/v1/jobs`, {
      method: "POST", headers: { "Content-Type": "application/json", "Content-Length": "1000" },
    }, false);
    upload.client.write('{"job":');
    await data.promise;
    upload.client.destroy();
    await ended;
    await turn();
    expect(submit).not.toHaveBeenCalled();
    expect(await queue.claim(owner)).toBeNull();
  });

  it("enforces a total upload deadline even while body bytes continue arriving", async () => {
    const { queue, base } = await start({ requestTimeoutMs: 60 });
    const submit = vi.spyOn(queue, "submit");
    const upload = open(`${base}/v1/jobs`, {
      method: "POST", headers: { "Content-Type": "application/json", "Content-Length": "1000" },
    }, false);
    upload.client.write('{"job":');
    const trickle = setInterval(() => upload.client.write(" "), 5);
    try {
      const response = await upload.response;
      clearInterval(trickle);
      expect(response.statusCode).toBe(408);
      expect(JSON.parse(await collect(response))).toMatchObject({ error: { code: "request-timeout" } });
      expect(submit).not.toHaveBeenCalled();
      expect(await queue.claim(owner)).toBeNull();
    } finally {
      clearInterval(trickle);
      upload.client.destroy();
    }
  });
});
