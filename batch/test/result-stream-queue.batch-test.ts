import { Buffer } from "node:buffer";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { executeSerial } from "../src/execution.js";
import type { ResultRow } from "../src/execution.js";
import { MemoryQueue } from "../src/memory-queue.js";
import type { JobSpec, Person } from "../src/model.js";
import type { ClaimedJob, QueueBackend } from "../src/queue.js";
import { createResultStream, resultLines } from "../src/result-stream.js";
import { SqliteQueue } from "../src/sqlite-queue.js";
import { validateJob } from "../src/validation.js";

const generated = fileURLToPath(new URL("../.generated/result-stream-tests/", import.meta.url));
const owner = { owner: "synthetic-stream-worker", leaseMs: 1_000 };

// Invented inputs. Engine rows establish transport parity, not accuracy.
const people: readonly Person[] = [
  { id: "synthetic-a", birth: { utc: "2001-02-03T04:05:06Z", timeKnown: false } },
  { id: "synthetic-b", birth: { utc: "1998-07-08T09:10:11Z", latitude: 12, longitude: 34 } },
  { id: "synthetic-c", birth: { utc: "1904-05-06T07:08:09Z", latitude: -23, longitude: 45 } },
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
const chartRows = workloadRows[0]!;

function required<T>(value: T | null): T {
  if (value === null) throw new Error("Expected a synthetic test job.");
  return value;
}

async function lines(iterator: AsyncIterable<string>): Promise<string[]> {
  const output: string[] = [];
  for await (const line of iterator) output.push(line);
  return output;
}

for (const backend of ["memory", "sqlite"] as const) {
  describe(`${backend} queue NDJSON integration`, () => {
    let clock: number;
    let queue: QueueBackend;
    let peer: QueueBackend;
    let dir: string | undefined;
    let filename: string;
    let controllers: AbortController[];

    beforeEach(async () => {
      clock = 1_700_000_000_000;
      controllers = [];
      dir = undefined;
      if (backend === "memory") {
        queue = new MemoryQueue({ now: () => clock });
        peer = queue;
      } else {
        await mkdir(generated, { recursive: true });
        dir = await mkdtemp(join(generated, "queue-"));
        filename = join(dir, "queue.sqlite");
        queue = new SqliteQueue(filename, { now: () => clock });
        peer = new SqliteQueue(filename, { now: () => clock });
      }
    });

    afterEach(async () => {
      for (const controller of controllers) controller.abort();
      await queue?.close();
      await peer?.close();
      if (dir) await rm(dir, { recursive: true, force: true });
    });

    function controller(): AbortController {
      const control = new AbortController();
      controllers.push(control);
      return control;
    }

    async function start(spec: JobSpec = charts): Promise<ClaimedJob> {
      await queue.submit(spec);
      return required(await peer.claim(owner));
    }

    it.each(workloads.map((spec, index) => ({ spec, index })))
      ("streams exact $spec.kind engine JSON and resumes at every complete-line cursor", async ({ spec, index }) => {
        const claimed = await start(spec);
        const rows = workloadRows[index]!;
        for (const row of rows) await peer.commit(claimed.lease, [row]);
        const expected = rows.map((row) => `${JSON.stringify(row)}\n`);

        for (let cursor = 0; cursor <= rows.length; cursor++) {
          expect(await lines(resultLines(queue, claimed.snapshot.id, { cursor, pageSize: 2 })))
            .toEqual(expected.slice(cursor));
        }

        const received: string[] = [];
        let reconnectCursor = 0;
        for await (const line of resultLines(queue, claimed.snapshot.id, { pageSize: 2 })) {
          received.push(line);
          reconnectCursor = (JSON.parse(line) as ResultRow).nextCursor;
          break;
        }
        expect(reconnectCursor).toBe(1);
        const resumed = await lines(resultLines(peer, claimed.snapshot.id, { cursor: reconnectCursor }));
        expect([...received, ...resumed]).toEqual(expected);

        const stream = createResultStream(queue, claimed.snapshot.id, { pageSize: 2, highWaterMark: 17 });
        expect(stream.readableObjectMode).toBe(false);
        const chunks: Buffer[] = [];
        for await (const chunk of stream) {
          expect(Buffer.isBuffer(chunk)).toBe(true);
          chunks.push(chunk as Buffer);
        }
        expect(Buffer.concat(chunks).toString("utf8")).toBe(expected.join(""));
      });

    it("freezes a finite export at its first atomic snapshot while later results commit", async () => {
      const claimed = await start();
      await peer.commit(claimed.lease, chartRows.slice(0, 2));
      const iterator = resultLines(queue, claimed.snapshot.id, { pageSize: 1 });
      expect(await iterator.next()).toEqual({ value: `${JSON.stringify(chartRows[0])}\n`, done: false });
      await peer.commit(claimed.lease, chartRows.slice(2));
      expect(await iterator.next()).toEqual({ value: `${JSON.stringify(chartRows[1])}\n`, done: false });
      expect(await iterator.next()).toEqual({ value: undefined, done: true });
      expect(await lines(resultLines(queue, claimed.snapshot.id, { cursor: 2 })))
        .toEqual([`${JSON.stringify(chartRows[2])}\n`]);
      expect(await queue.getJob(claimed.snapshot.id)).toMatchObject({ status: "completed", nextCursor: 3 });
    });

    it("ends finite exports of empty queued and running prefixes without modifying the job", async () => {
      const submitted = await queue.submit(charts);
      expect(await lines(resultLines(queue, submitted.id))).toEqual([]);
      expect(await queue.getJob(submitted.id)).toEqual(submitted);
      const claimed = required(await peer.claim(owner));
      expect(await lines(resultLines(queue, submitted.id))).toEqual([]);
      expect(await queue.getJob(submitted.id)).toEqual(claimed.snapshot);
    });

    it("follows initially empty queued jobs and new commits through completion", async () => {
      const submitted = await queue.submit(charts);
      const signal = controller().signal;
      const readResults = vi.fn(queue.readResults.bind(queue));
      const iterator = resultLines({ readResults }, submitted.id, { follow: true, pollMs: 1, signal });
      const first = iterator.next();
      void first.catch(() => {});
      await vi.waitFor(() => expect(readResults).toHaveBeenCalled(), { interval: 1 });
      expect(await queue.getJob(submitted.id)).toEqual(submitted);
      const claimed = required(await peer.claim(owner));
      await peer.commit(claimed.lease, chartRows.slice(0, 1));
      expect(await first).toEqual({ value: `${JSON.stringify(chartRows[0])}\n`, done: false });
      await peer.commit(claimed.lease, chartRows.slice(1));
      expect(await lines(iterator)).toEqual(chartRows.slice(1).map((row) => `${JSON.stringify(row)}\n`));
      expect(await queue.getJob(submitted.id)).toMatchObject({ status: "completed", nextCursor: 3 });
    });

    it("follows a retry delay without replaying the prefix and ends at terminal failure", async () => {
      const submitted = await queue.submit(charts, { retry: { maxAttempts: 2, delayMs: 20 } });
      const claimed = required(await peer.claim(owner));
      await peer.commit(claimed.lease, chartRows.slice(0, 1));
      const states: string[] = [];
      const readResults: QueueBackend["readResults"] = async (id, options) => {
        const page = await queue.readResults(id, options);
        if (page) states.push(page.snapshot.status);
        return page;
      };
      const iterator = resultLines({ readResults }, submitted.id, {
        follow: true, pollMs: 1, signal: controller().signal,
      });
      expect(await iterator.next()).toEqual({ value: `${JSON.stringify(chartRows[0])}\n`, done: false });
      await peer.fail(claimed.lease);
      const next = iterator.next();
      void next.catch(() => {});
      await vi.waitFor(() => expect(states).toContain("queued"), { interval: 1 });
      expect(await peer.claim(owner)).toBeNull();
      clock += 20;
      const replacement = required(await peer.claim(owner));
      expect(replacement.snapshot.nextCursor).toBe(1);
      await peer.commit(replacement.lease, chartRows.slice(1, 2));
      expect(await next).toEqual({ value: `${JSON.stringify(chartRows[1])}\n`, done: false });
      await peer.fail(replacement.lease);
      expect(await iterator.next()).toEqual({ value: undefined, done: true });
      expect(await queue.getJob(submitted.id)).toMatchObject({ status: "failed", nextCursor: 2, failureCount: 2 });
    });

    it("drains every stored row of a failed prefix before finishing a follow export", async () => {
      const submitted = await queue.submit(charts, { retry: { maxAttempts: 1 } });
      const claimed = required(await peer.claim(owner));
      await peer.commit(claimed.lease, chartRows.slice(0, 2));
      const terminal = await peer.fail(claimed.lease);
      expect(await lines(resultLines(queue, submitted.id, {
        follow: true, pageSize: 1, pollMs: 1, signal: controller().signal,
      }))).toEqual(chartRows.slice(0, 2).map((row) => `${JSON.stringify(row)}\n`));
      expect(await queue.getJob(submitted.id)).toEqual(terminal);
    });

    it("preserves JSON escaping, Unicode and arbitrary stored object keys in one line", async () => {
      const claimed = await start({ version: 1, kind: "charts", births: people.slice(0, 1) });
      // The queue validates JSON storage and row routing, not engine result truth.
      const value: unknown = {
        message: 'synthetic "quoted" \\ slash\nnew line\rcarriage\ttab\u0000nul',
        unicode: "synthetic café 星 🌌 \u2028 separator \u2029 paragraph",
        loneSurrogates: "\ud800x\udfff",
        nested: JSON.parse('{"__proto__":{"synthetic":"data"},"constructor":"data"}') as unknown,
      };
      const row = { ...chartRows[0]!, value } as ResultRow;
      await peer.commit(claimed.lease, [row]);
      const output = await lines(resultLines(queue, claimed.snapshot.id));
      expect(output).toEqual([`${JSON.stringify(row)}\n`]);
      expect(output[0]!.split("\n")).toHaveLength(2);
      expect(output[0]).not.toContain("\r");
      expect(output[0]).not.toContain("\u0000");
      expect(JSON.parse(output[0]!)).toEqual(row);
    });

    it("reports missing jobs and refuses cursors ahead of committed progress", async () => {
      await expect(resultLines(queue, "synthetic-missing").next())
        .rejects.toMatchObject({ name: "ResultStreamError", code: "not-found" });
      const claimed = await start();
      await peer.commit(claimed.lease, chartRows.slice(0, 1));
      await expect(resultLines(queue, claimed.snapshot.id, { cursor: 2 }).next())
        .rejects.toMatchObject({ name: "QueueError", code: "invalid-argument" });
      expect(await queue.getJob(claimed.snapshot.id)).toMatchObject({ status: "running", nextCursor: 1 });
    });

    it("stops a disconnected follower without releasing or closing its queue", async () => {
      const claimed = await start();
      const control = controller();
      const readResults = vi.fn(queue.readResults.bind(queue));
      const iterator = resultLines({ readResults }, claimed.snapshot.id, {
        follow: true, pollMs: 1, signal: control.signal,
      });
      const pending = iterator.next();
      const rejected = expect(pending).rejects.toMatchObject({ name: "ResultStreamError", code: "aborted" });
      await vi.waitFor(() => expect(readResults).toHaveBeenCalled(), { interval: 1 });
      control.abort();
      await rejected;
      const calls = readResults.mock.calls.length;
      expect(await iterator.next()).toEqual({ value: undefined, done: true });
      expect(readResults).toHaveBeenCalledTimes(calls);
      expect(await queue.getJob(claimed.snapshot.id)).toEqual(claimed.snapshot);
      expect(await peer.commit(claimed.lease, chartRows)).toMatchObject({ status: "completed" });
    });

    if (backend === "sqlite") {
      it("reconnects from a complete-line cursor after all SQLite connections reopen", async () => {
        const claimed = await start();
        await peer.commit(claimed.lease, chartRows);
        let cursor = 0;
        const received: string[] = [];
        for await (const line of resultLines(queue, claimed.snapshot.id, { pageSize: 2 })) {
          received.push(line);
          cursor = (JSON.parse(line) as ResultRow).nextCursor;
          break;
        }
        expect(cursor).toBe(1);
        await queue.close();
        await peer.close();
        queue = new SqliteQueue(filename, { now: () => clock });
        peer = new SqliteQueue(filename, { now: () => clock });
        received.push(...await lines(resultLines(peer, claimed.snapshot.id, { cursor })));
        expect(received).toEqual(chartRows.map((row) => `${JSON.stringify(row)}\n`));
        expect(await queue.getJob(claimed.snapshot.id)).toMatchObject({ status: "completed", nextCursor: 3 });
      });
    }
  });
}
