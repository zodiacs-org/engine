import { Buffer } from "node:buffer";
import { Readable } from "node:stream";
import { setImmediate as nextTurn, setTimeout as delay } from "node:timers/promises";
import type { ResultRow } from "./execution.js";
import { queueFields, queueIdentifier, queueInteger } from "./queue-data.js";
import { QUEUE_LIMITS, QueueError } from "./queue.js";
import type { QueueBackend, ResultPage } from "./queue.js";

export const RESULT_STREAM_DEFAULTS = Object.freeze({
  pageSize: 1,
  pollMs: 250,
  highWaterMark: 16_384,
  maxHighWaterMark: 1_048_576,
  maxPollMs: 2_147_483_647,
  yieldEveryRows: 64,
});

export interface ResultLinesOptions {
  /** First row to include, at or behind the queue's committed cursor. */
  readonly cursor?: number;
  readonly pageSize?: number;
  /** Poll for new commits until the job completes or fails. Default: false. */
  readonly follow?: boolean;
  readonly pollMs?: number;
  readonly signal?: AbortSignal;
}

export interface ResultStreamOptions extends ResultLinesOptions {
  /** Byte-buffer threshold, not a hard memory cap. A row may exceed it. */
  readonly highWaterMark?: number;
}

export type ResultReader = Pick<QueueBackend, "readResults">;
export type ResultStreamErrorCode = "not-found" | "aborted" | "read-failed" | "invalid-page";

const MESSAGES: Record<ResultStreamErrorCode, string> = {
  "not-found": "The result job does not exist.",
  aborted: "Result streaming was aborted.",
  "read-failed": "Reading job results failed.",
  "invalid-page": "The result backend returned an invalid page.",
};

/** Does not copy result data, backend diagnostics or abort reasons. */
export class ResultStreamError extends Error {
  override readonly name = "ResultStreamError";

  constructor(readonly code: ResultStreamErrorCode) {
    super(MESSAGES[code]);
  }
}

interface Options {
  readonly cursor: number;
  readonly pageSize: number;
  readonly follow: boolean;
  readonly pollMs: number;
  readonly highWaterMark: number;
  readonly signal: AbortSignal | undefined;
}

function captureOptions(value: ResultLinesOptions, stream: boolean): Options {
  const fields = queueFields(value, ["cursor", "pageSize", "follow", "pollMs", "signal", ...(stream ? ["highWaterMark"] : [])]);
  const follow = "follow" in fields ? fields.follow : false;
  if (typeof follow !== "boolean" || ("signal" in fields && !(fields.signal instanceof AbortSignal))) {
    throw new QueueError("invalid-argument");
  }
  return {
    cursor: queueInteger("cursor" in fields ? fields.cursor : 0, 0),
    pageSize: queueInteger("pageSize" in fields ? fields.pageSize : RESULT_STREAM_DEFAULTS.pageSize, 1, QUEUE_LIMITS.maxPageRows),
    follow,
    pollMs: queueInteger("pollMs" in fields ? fields.pollMs : RESULT_STREAM_DEFAULTS.pollMs, 1, RESULT_STREAM_DEFAULTS.maxPollMs),
    highWaterMark: queueInteger("highWaterMark" in fields ? fields.highWaterMark : RESULT_STREAM_DEFAULTS.highWaterMark, 1, RESULT_STREAM_DEFAULTS.maxHighWaterMark),
    signal: fields.signal as AbortSignal | undefined,
  };
}

function checkAbort(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new ResultStreamError("aborted");
}

/** QueueBackend has no cancellation API. Abandon the wait, observing late errors. */
async function readPage(reader: ResultReader, id: string, cursor: number, limit: number, signal: AbortSignal | undefined): Promise<ResultPage> {
  checkAbort(signal);
  let onAbort: (() => void) | undefined;
  try {
    const interrupted = new Promise<never>((_resolve, reject) => {
      onAbort = () => reject(new ResultStreamError("aborted"));
      signal?.addEventListener("abort", onAbort, { once: true });
    });
    const pending = Promise.resolve().then(() => {
      checkAbort(signal);
      return reader.readResults(id, { cursor, limit });
    });
    const page = await Promise.race([pending, interrupted]);
    checkAbort(signal);
    if (page === null) throw new ResultStreamError("not-found");
    return page;
  } catch (error) {
    checkAbort(signal);
    if (error instanceof QueueError || error instanceof ResultStreamError) throw error;
    throw new ResultStreamError("read-failed");
  } finally {
    if (onAbort) signal?.removeEventListener("abort", onAbort);
  }
}

/** Detect broken paging/routing without calculating astronomy or rereading a job. */
function checkPage(page: ResultPage, id: string, cursor: number, limit: number, previousProgress: number): void {
  const { snapshot, rows } = page;
  if (!snapshot || snapshot.id !== id || !["charts", "transit-grid", "synastry-matrix"].includes(snapshot.kind)
    || !["queued", "running", "completed", "failed"].includes(snapshot.status)
    || !Number.isSafeInteger(snapshot.totalTasks) || snapshot.totalTasks < 1
    || !Number.isSafeInteger(snapshot.nextCursor) || snapshot.nextCursor < cursor
    || snapshot.nextCursor < previousProgress || snapshot.nextCursor > snapshot.totalTasks
    || snapshot.completedTasks !== snapshot.nextCursor
    || (snapshot.status === "completed") !== (snapshot.nextCursor === snapshot.totalTasks)
    || !Array.isArray(rows) || rows.length > limit
    || page.nextCursor !== cursor + rows.length || page.nextCursor > snapshot.nextCursor
    || (rows.length === 0 && cursor < snapshot.nextCursor)) {
    throw new ResultStreamError("invalid-page");
  }
  for (const [offset, row] of rows.entries()) {
    if (!row || row.version !== 1 || row.kind !== snapshot.kind || row.index !== cursor + offset
      || row.nextCursor !== row.index + 1) throw new ResultStreamError("invalid-page");
  }
}

function encodeRow(row: ResultRow): string {
  try {
    // Conforming backends return detached, bounded JSON, with no hooks to run.
    const encoded = JSON.stringify(row);
    if (Buffer.byteLength(encoded) > QUEUE_LIMITS.maxBatchBytes) throw new Error();
    return encoded + "\n";
  } catch {
    throw new ResultStreamError("invalid-page");
  }
}

async function* lines(reader: ResultReader, id: string, options: Options, signal: AbortSignal | undefined): AsyncGenerator<string, void, unknown> {
  let cursor = options.cursor;
  let end: number | undefined;
  let previousProgress = cursor;
  let sinceYield = 0;
  for (;;) {
    checkAbort(signal);
    const limit = end === undefined ? options.pageSize : Math.min(options.pageSize, end - cursor);
    const page = await readPage(reader, id, cursor, limit, signal);
    try { checkPage(page, id, cursor, limit, previousProgress); } catch {
      throw new ResultStreamError("invalid-page");
    }
    previousProgress = page.snapshot.nextCursor;
    if (!options.follow && end === undefined) end = page.snapshot.nextCursor;
    for (const row of page.rows) {
      checkAbort(signal);
      yield encodeRow(row);
      cursor = row.nextCursor;
      if (++sinceYield === RESULT_STREAM_DEFAULTS.yieldEveryRows) {
        // Already-resolved reads and fast consumers can otherwise starve IO,
        // disconnect notifications and the scheduler's lease-renewal timers.
        try { await nextTurn(undefined, signal ? { signal } : {}); } catch {
          checkAbort(signal);
          throw new ResultStreamError("read-failed");
        }
        sinceYield = 0;
      }
    }
    checkAbort(signal);
    if (cursor === end || (cursor === page.snapshot.nextCursor
      && (page.snapshot.status === "completed" || page.snapshot.status === "failed"))) return;
    if (cursor === page.snapshot.nextCursor) {
      try { await delay(options.pollMs, undefined, signal ? { signal } : {}); } catch {
        checkAbort(signal);
        throw new ResultStreamError("read-failed");
      }
    }
  }
}

/**
 * Pull complete NDJSON lines without read-ahead beyond the current bounded page.
 * A finite export freezes the committed prefix observed by its first page read.
 * Save a row's nextCursor only after retaining its complete newline-ended line.
 */
export function resultLines(reader: ResultReader, jobId: string, options: ResultLinesOptions = {}): AsyncGenerator<string, void, unknown> {
  const id = queueIdentifier(jobId);
  const captured = captureOptions(options, false);
  return lines(reader, id, captured, captured.signal);
}

/**
 * UTF-8 byte stream for node:stream/promises pipeline. Destruction interrupts
 * polling or an outstanding page wait. The caller retains ownership of queue.
 */
export function createResultStream(reader: ResultReader, jobId: string, options: ResultStreamOptions = {}): Readable {
  const id = queueIdentifier(jobId);
  const captured = captureOptions(options, true);
  const controller = new AbortController();
  const iterator = lines(reader, id, captured, controller.signal);
  let reading = false;
  const onAbort = (): void => { source.destroy(new ResultStreamError("aborted")); };
  const source = new Readable({
    objectMode: false,
    highWaterMark: captured.highWaterMark,
    autoDestroy: true,
    emitClose: true,
    read() {
      if (reading || this.destroyed) return;
      reading = true;
      void iterator.next().then((next) => {
        reading = false;
        if (!this.destroyed) this.push(next.done ? null : Buffer.from(next.value, "utf8"));
      }, (error: Error) => {
        reading = false;
        this.destroy(error);
      });
    },
    destroy(error, callback) {
      captured.signal?.removeEventListener("abort", onAbort);
      controller.abort();
      void iterator.return(undefined).then(() => callback(error), () => callback(error ?? new ResultStreamError("read-failed")));
    },
  });
  captured.signal?.addEventListener("abort", onAbort, { once: true });
  if (captured.signal?.aborted) {
    controller.abort();
    queueMicrotask(onAbort);
  }
  return source;
}
