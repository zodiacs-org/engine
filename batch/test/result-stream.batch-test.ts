import { getEventListeners, once } from "node:events";
import { Writable } from "node:stream";
import { pipeline, finished } from "node:stream/promises";
import { setImmediate as turn } from "node:timers/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ResultRow } from "../src/execution.js";
import { QUEUE_LIMITS, QueueError, RETRY_DEFAULTS } from "../src/queue.js";
import type { JobSnapshot, ResultPage, ResultPageOptions } from "../src/queue.js";
import {
  createResultStream, resultLines, RESULT_STREAM_DEFAULTS,
} from "../src/result-stream.js";
import type { ResultLinesOptions, ResultStreamOptions } from "../src/result-stream.js";

// Synthetic storage/transport rows, not astronomy fixtures. This reader creates
// only the requested page and the counting sinks never collect a full export.
function row(index: number, note = "synthetic row"): ResultRow {
  return {
    version: 1, kind: "charts", index, nextCursor: index + 1,
    personId: `synthetic-${index}`, value: { note },
  } as unknown as ResultRow;
}

function snapshot(total: number, completed = total): JobSnapshot {
  return {
    id: "synthetic-job", kind: "charts", status: completed === total ? "completed" : "queued",
    totalTasks: total, completedTasks: completed, nextCursor: completed, claimCount: 0,
    retry: RETRY_DEFAULTS, failureCount: 0, retryAt: null, lastFailure: null,
    createdAt: 0, updatedAt: 0, finishedAt: completed === total ? 0 : null, lease: null,
  };
}

function source(total = 3, note?: string) {
  const readResults = vi.fn(async (id: string, { cursor = 0, limit = 1 }: ResultPageOptions = {}): Promise<ResultPage> => {
    const count = Math.min(limit, total - cursor);
    return {
      rows: Array.from({ length: count }, (_, i) => row(cursor + i, note)),
      nextCursor: cursor + count, snapshot: { ...snapshot(total), id },
    };
  });
  return { readResults };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

async function collect(iterator: AsyncIterable<string>): Promise<string[]> {
  const result = [];
  for await (const line of iterator) result.push(line);
  return result;
}

afterEach(() => { vi.useRealTimers(); });

describe("NDJSON pull and option boundaries", () => {
  it("is lazy, holds one page and seeks without reading earlier rows", async () => {
    const reader = source(10);
    const iterator = resultLines(reader, "synthetic-job", { cursor: 5, pageSize: 2 });
    expect(reader.readResults).not.toHaveBeenCalled();
    expect((await iterator.next()).value).toBe(JSON.stringify(row(5)) + "\n");
    expect(reader.readResults.mock.calls).toEqual([["synthetic-job", { cursor: 5, limit: 2 }]]);
    await turn();
    expect(reader.readResults).toHaveBeenCalledTimes(1);
    expect((await iterator.next()).value).toBe(JSON.stringify(row(6)) + "\n");
    expect(reader.readResults).toHaveBeenCalledTimes(1);
    await iterator.return(undefined);
    expect(reader.readResults).toHaveBeenCalledTimes(1);
  });

  it("exports the default bounds and uses a small default page", async () => {
    expect(RESULT_STREAM_DEFAULTS).toEqual({
      pageSize: 1, pollMs: 250, highWaterMark: 16_384,
      maxHighWaterMark: 1_048_576, maxPollMs: 2_147_483_647,
      yieldEveryRows: 64,
    });
    expect(Object.isFrozen(RESULT_STREAM_DEFAULTS)).toBe(true);
    const reader = source(1);
    expect(await collect(resultLines(reader, "synthetic-job"))).toEqual([JSON.stringify(row(0)) + "\n"]);
    expect(reader.readResults.mock.calls).toEqual([["synthetic-job", { cursor: 0, limit: 1 }]]);
    const stream = createResultStream(source(), "synthetic-job");
    expect(stream.readableHighWaterMark).toBe(RESULT_STREAM_DEFAULTS.highWaterMark);
    expect(stream.readableObjectMode).toBe(false);
    const closed = once(stream, "close");
    stream.destroy();
    await closed;
  });

  it.each([
    null, [], 7, { unexpected: true }, { cursor: undefined }, { cursor: -1 },
    { cursor: 0.5 }, { cursor: Infinity }, { cursor: Number.MAX_SAFE_INTEGER + 1 },
    { cursor: "1" }, { pageSize: 0 }, { pageSize: QUEUE_LIMITS.maxPageRows + 1 },
    { pageSize: 1.1 }, { pageSize: null }, { follow: 1 }, { follow: null },
    { pollMs: 0 }, { pollMs: NaN }, { pollMs: RESULT_STREAM_DEFAULTS.maxPollMs + 1 },
    { signal: null }, { signal: {} }, { highWaterMark: 1 },
  ])("rejects invalid iterator options immediately: %j", (options) => {
    const reader = source();
    expect(() => resultLines(reader, "synthetic-job", options as ResultLinesOptions)).toThrow(
      expect.objectContaining({ name: "QueueError", code: "invalid-argument" }),
    );
    expect(reader.readResults).not.toHaveBeenCalled();
  });

  it.each([0, -1, 0.1, NaN, Infinity, "1", null, undefined, RESULT_STREAM_DEFAULTS.maxHighWaterMark + 1])(
    "rejects invalid stream highWaterMark %j", (value) => {
      expect(() => createResultStream(source(), "synthetic-job", { highWaterMark: value } as ResultStreamOptions))
        .toThrow(expect.objectContaining({ code: "invalid-argument" }));
    },
  );

  it("accepts option boundaries, captures options and does not invoke getters", async () => {
    const read = vi.fn();
    const options = { cursor: 0, pageSize: QUEUE_LIMITS.maxPageRows, follow: false, pollMs: RESULT_STREAM_DEFAULTS.maxPollMs };
    const reader = source(1);
    const iterator = resultLines(reader, "synthetic-job", options);
    options.cursor = 8;
    expect(await collect(iterator)).toHaveLength(1);
    expect(reader.readResults.mock.calls).toEqual([["synthetic-job", { cursor: 0, limit: QUEUE_LIMITS.maxPageRows }]]);
    expect(() => resultLines(reader, "synthetic-job", { get cursor() { read(); return 1; } })).toThrow(QueueError);
    expect(read).not.toHaveBeenCalled();
    const stream = createResultStream(source(1), "synthetic-job", { highWaterMark: RESULT_STREAM_DEFAULTS.maxHighWaterMark });
    expect(stream.readableHighWaterMark).toBe(RESULT_STREAM_DEFAULTS.maxHighWaterMark);
    stream.resume();
    await finished(stream, { cleanup: true });
  });

  it.each(["", "x".repeat(QUEUE_LIMITS.maxIdentifierLength + 1), null, 1])("rejects invalid job identifiers %j", (id) => {
    expect(() => resultLines(source(), id as string)).toThrow(QueueError);
    expect(() => createResultStream(source(), id as string)).toThrow(QueueError);
  });
});

describe("NDJSON read failures and cancellation", () => {
  it("reports unknown jobs without emitting a status or diagnostic line", async () => {
    const iterator = resultLines({ readResults: async () => null }, "synthetic-job");
    await expect(iterator.next()).rejects.toMatchObject({ code: "not-found" });
    expect(await iterator.next()).toEqual({ done: true, value: undefined });
  });

  it.each([new QueueError("storage-busy"), new QueueError("closed"), new Error("private backend diagnostic")])(
    "ends a partial export when the next read fails", async (error) => {
      const reader = source();
      reader.readResults.mockImplementationOnce(async () => ({ rows: [row(0)], nextCursor: 1, snapshot: snapshot(3) }));
      reader.readResults.mockRejectedValue(error);
      const iterator = resultLines(reader, "synthetic-job");
      expect((await iterator.next()).value).toBe(JSON.stringify(row(0)) + "\n");
      const expected = error instanceof QueueError ? error : expect.objectContaining({ code: "read-failed" });
      await expect(iterator.next()).rejects.toEqual(expected);
      expect(await iterator.next()).toEqual({ done: true, value: undefined });
      expect(reader.readResults).toHaveBeenCalledTimes(2);
    },
  );

  it("sanitizes synchronous backend throws including an abort during that call", async () => {
    const controller = new AbortController();
    const reader = { readResults: () => { controller.abort("private"); throw new Error("private"); } };
    await expect(resultLines(reader, "synthetic-job", { signal: controller.signal }).next())
      .rejects.toMatchObject({ code: "aborted", message: "Result streaming was aborted." });
    await turn(); // Late promise rejection must remain observed.
    expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
  });

  it.each(["resolve", "reject"] as const)("abandons a pending read and observes its late %s", async (settlement) => {
    const controller = new AbortController();
    const pending = deferred<ResultPage | null>();
    const started = deferred<void>();
    const reader = { readResults: vi.fn(() => { started.resolve(); return pending.promise; }) };
    const iterator = resultLines(reader, "synthetic-job", { signal: controller.signal });
    const first = iterator.next();
    await started.promise;
    const rejected = expect(first).rejects.toMatchObject({ code: "aborted" });
    controller.abort(new Error("private"));
    await rejected;
    await iterator.return(undefined);
    expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
    if (settlement === "resolve") pending.resolve({ rows: [row(0)], nextCursor: 1, snapshot: snapshot(3) });
    else pending.reject(new Error("private late failure"));
    await turn();
    expect(reader.readResults).toHaveBeenCalledTimes(1);
  });

  it("aborts a long polling timer promptly and removes its listener", async () => {
    vi.useFakeTimers();
    const reader = source(2);
    reader.readResults.mockResolvedValue({ rows: [], nextCursor: 0, snapshot: snapshot(2, 0) });
    const controller = new AbortController();
    const iterator = resultLines(reader, "synthetic-job", { signal: controller.signal, follow: true, pollMs: 60_000 });
    const pending = iterator.next();
    await vi.advanceTimersByTimeAsync(0);
    expect(reader.readResults).toHaveBeenCalledTimes(1);
    const rejected = expect(pending).rejects.toMatchObject({ code: "aborted" });
    controller.abort("private");
    await rejected;
    expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(reader.readResults).toHaveBeenCalledTimes(1);
  });

  it("polls only empty current prefixes at the configured interval", async () => {
    vi.useFakeTimers();
    const reader = source(2);
    reader.readResults.mockResolvedValueOnce({ rows: [], nextCursor: 0, snapshot: snapshot(2, 0) });
    const iterator = resultLines(reader, "synthetic-job", { follow: true, pollMs: 25 });
    const pending = iterator.next();
    await vi.advanceTimersByTimeAsync(24);
    expect(reader.readResults).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect((await pending).value).toBe(JSON.stringify(row(0)) + "\n");
    expect((await iterator.next()).value).toBe(JSON.stringify(row(1)) + "\n");
    expect((await iterator.next()).done).toBe(true);
    expect(reader.readResults).toHaveBeenCalledTimes(3);
  });

  it("does not read a pre-aborted iterator or readable", async () => {
    const signal = AbortSignal.abort("private");
    const reader = source();
    await expect(resultLines(reader, "synthetic-job", { signal }).next()).rejects.toMatchObject({ code: "aborted" });
    const stream = createResultStream(reader, "synthetic-job", { signal });
    const end = finished(stream, { cleanup: true });
    stream.resume();
    await expect(end).rejects.toMatchObject({ code: "aborted" });
    expect(reader.readResults).not.toHaveBeenCalled();
    expect(getEventListeners(signal, "abort")).toHaveLength(0);
  });

  it.each([
    { nextCursor: 2 },
    { rows: [] },
    { rows: [row(1)] },
    { rows: [row(0), row(1)] },
    { rows: [{ ...row(0), nextCursor: 9 }] },
    { rows: [{ ...row(0), kind: "transit-grid" }] },
    { snapshot: { ...snapshot(3), id: "another-job" } },
    { snapshot: { ...snapshot(3), completedTasks: 2 } },
    { snapshot: { ...snapshot(3), status: "queued" } },
    { snapshot: { ...snapshot(3), nextCursor: 4 } },
    { snapshot: { ...snapshot(3), nextCursor: NaN } },
    { snapshot: null },
  ])("refuses broken backend page framing %j", async (patch) => {
    const page = { rows: [row(0)], nextCursor: 1, snapshot: snapshot(3), ...patch } as ResultPage;
    await expect(resultLines({ readResults: async () => page }, "synthetic-job").next())
      .rejects.toMatchObject({ code: "invalid-page" });
  });

  it("refuses an oversized serialized row", async () => {
    const reader = source(1, "s".repeat(QUEUE_LIMITS.maxBatchBytes));
    await expect(resultLines(reader, "synthetic-job").next()).rejects.toMatchObject({ code: "invalid-page" });
  });
});

describe("byte-stream backpressure and disconnects", () => {
  it.each(["iterator", "readable"])("yields the event loop so an always-ready %s export can be interrupted", async (mode) => {
    const controller = new AbortController();
    const reader = source(20_000);
    let emitted = 0;
    const abort = setImmediate(() => controller.abort("synthetic disconnect"));
    try {
      if (mode === "iterator") {
        const consuming = (async () => {
          for await (const _line of resultLines(reader, "synthetic-job", { signal: controller.signal })) emitted++;
        })();
        await expect(consuming).rejects.toMatchObject({ code: "aborted" });
      } else {
        const sink = new Writable({ write(_chunk, _encoding, callback) { emitted++; callback(); } });
        await expect(pipeline(createResultStream(reader, "synthetic-job", { signal: controller.signal }), sink))
          .rejects.toMatchObject({ code: "aborted" });
      }
      expect(emitted).toBeGreaterThan(0);
      expect(emitted).toBeLessThanOrEqual(RESULT_STREAM_DEFAULTS.yieldEveryRows);
      expect(reader.readResults.mock.calls.length).toBeLessThanOrEqual(RESULT_STREAM_DEFAULTS.yieldEveryRows);
      expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
    } finally { clearImmediate(abort); }
  });

  it("stops page reads behind a stalled sink and closes on disconnect", async () => {
    const reader = source(100_000);
    const stream = createResultStream(reader, "synthetic-job", { highWaterMark: 1 });
    const writeStarted = deferred<void>();
    const sink = new Writable({ highWaterMark: 1, write(_chunk, _encoding, _callback) { writeStarted.resolve(); } });
    const piping = pipeline(stream, sink);
    const failed = expect(piping).rejects.toThrow("synthetic disconnect");
    await writeStarted.promise;
    await turn();
    const reads = reader.readResults.mock.calls.length;
    expect(reads).toBeLessThanOrEqual(2); // One sink row plus one source-buffer row.
    expect(reads).toBeGreaterThan(0);
    await turn();
    expect(reader.readResults).toHaveBeenCalledTimes(reads);
    sink.destroy(new Error("synthetic disconnect"));
    await failed;
    expect(stream.destroyed).toBe(true);
    expect(stream.closed).toBe(true);
    await turn();
    expect(reader.readResults).toHaveBeenCalledTimes(reads);
  });

  it("aborts while backpressured without waiting for the sink callback", async () => {
    const controller = new AbortController();
    const reader = source(100_000);
    const stream = createResultStream(reader, "synthetic-job", { highWaterMark: 1, signal: controller.signal });
    const writeStarted = deferred<void>();
    const sink = new Writable({ highWaterMark: 1, write() { writeStarted.resolve(); } });
    const piping = pipeline(stream, sink);
    const rejected = expect(piping).rejects.toMatchObject({ code: "aborted" });
    await writeStarted.promise;
    await turn();
    controller.abort("private abort reason");
    await rejected;
    const reads = reader.readResults.mock.calls.length;
    await turn();
    expect(reader.readResults).toHaveBeenCalledTimes(reads);
    expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
    expect(stream.closed).toBe(true);
    expect(sink.destroyed).toBe(true);
  });

  it("destroy interrupts an outstanding backend wait even if it never settles", async () => {
    const pending = deferred<ResultPage>();
    const started = deferred<void>();
    const reader = { readResults: () => { started.resolve(); return pending.promise; } };
    const stream = createResultStream(reader, "synthetic-job");
    stream.resume();
    await started.promise;
    const closed = once(stream, "close");
    stream.destroy();
    await closed;
    expect(stream.closed).toBe(true);
  });

  it("destroy interrupts a following stream's timer without additional reads", async () => {
    vi.useFakeTimers();
    const reader = source(2);
    reader.readResults.mockResolvedValue({ rows: [], nextCursor: 0, snapshot: snapshot(2, 0) });
    const stream = createResultStream(reader, "synthetic-job", { follow: true, pollMs: 60_000 });
    stream.resume();
    await vi.advanceTimersByTimeAsync(0);
    const closed = once(stream, "close");
    stream.destroy();
    await closed;
    await vi.advanceTimersByTimeAsync(120_000);
    expect(reader.readResults).toHaveBeenCalledTimes(1);
  });

  it("removes external abort listeners on normal completion and early destruction", async () => {
    const controller = new AbortController();
    for (let i = 0; i < 20; i++) {
      const stream = createResultStream(source(1), "synthetic-job", { signal: controller.signal });
      expect(getEventListeners(controller.signal, "abort")).toHaveLength(1);
      if (i % 2) {
        const closed = once(stream, "close");
        stream.destroy();
        await closed;
      } else {
        stream.resume();
        await finished(stream, { cleanup: true });
      }
      expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
    }
  });

  it("reconnects after a partial Unicode line using only the last complete row", async () => {
    const reader = source(4, "synthetic \"\\\r\n\t\u0000 星🌙");
    const parts: Buffer[] = [];
    let writes = 0;
    const sink = new Writable({
      highWaterMark: 1,
      write(chunk: Buffer, _encoding, callback) {
        if (++writes === 2) {
          const moon = chunk.indexOf(Buffer.from("🌙"));
          expect(moon).toBeGreaterThan(0);
          parts.push(chunk.subarray(0, moon + 2)); // Split the UTF-8 sequence.
          callback(new Error("synthetic disconnect"));
        } else { parts.push(chunk); callback(); }
      },
    });
    await expect(pipeline(createResultStream(reader, "synthetic-job", { highWaterMark: 1 }), sink)).rejects.toThrow("synthetic disconnect");
    const prefix = Buffer.concat(parts);
    const complete = prefix.subarray(0, prefix.lastIndexOf(10) + 1).toString("utf8");
    const received = complete.trimEnd().split("\n").map((line) => JSON.parse(line) as ResultRow);
    expect(received.map((value) => value.index)).toEqual([0]);
    const last = received.at(-1)!;
    const remainder = await collect(resultLines(reader, "synthetic-job", { cursor: last.nextCursor }));
    expect([...received, ...remainder.map((line) => JSON.parse(line) as ResultRow)].map((value) => value.index)).toEqual([0, 1, 2, 3]);
    expect(remainder.join("")).not.toContain("�");
  });

  it("streams a large lazy workload into a counting sink with bounded read-ahead", async () => {
    const total = 20_000;
    const note = "s".repeat(2_048);
    let emitted = 0;
    let readCount = 0;
    let largestLead = 0;
    let bytes = 0;
    // No spy here: retaining every page promise in mock.results would itself
    // collect the export and invalidate this bounded-retention exercise.
    const reader = {
      async readResults(id: string, { cursor = 0, limit = 1 }: ResultPageOptions = {}): Promise<ResultPage> {
        expect(id).toBe("synthetic-job");
        expect(cursor).toBe(readCount);
        expect(limit).toBe(1);
        readCount++;
        largestLead = Math.max(largestLead, readCount - emitted);
        return { rows: [row(cursor, note)], nextCursor: cursor + 1, snapshot: snapshot(total) };
      },
    };
    const stream = createResultStream(reader, "synthetic-job", { highWaterMark: 1 });
    const sink = new Writable({
      highWaterMark: 1,
      write(chunk: Buffer, _encoding, callback) {
        const text = chunk.toString("utf8");
        expect(text.endsWith("\n")).toBe(true);
        const parsed = JSON.parse(text) as ResultRow;
        expect(parsed.index).toBe(emitted++);
        expect(parsed.nextCursor).toBe(emitted);
        bytes += chunk.length;
        // Regular asynchronous stalls exercise backpressure without sleeps.
        if (emitted % 251 === 0) setImmediate(callback);
        else callback();
      },
    });
    await pipeline(stream, sink);
    expect(emitted).toBe(total);
    expect(readCount).toBe(total);
    expect(largestLead).toBeLessThanOrEqual(2);
    expect(bytes).toBeGreaterThan(total * note.length);
    expect(stream.closed).toBe(true);
  }, 15_000);
});
