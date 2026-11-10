import { setImmediate as yieldToHost } from "node:timers/promises";
import { Readable, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as ingress from "../src/ingresses.js";
import * as voidOfCourse from "../src/void-of-course.js";
import {
  compareScheduleEvents, ScheduleStreamError, serializeCalendar, streamCalendar, streamSchedule
} from "../src/index.js";
import type { ScheduleEvent, ScheduleStreamRequest } from "../src/index.js";
import { fixtureOptions, syntheticEvents } from "./fixtures/synthetic-events.js";

const request: ScheduleStreamRequest = {
  startUtc: "2026-02-01T00:00:00.000Z", endUtc: "2026-02-06T00:00:00.000Z",
  maxEvaluations: 100, windowDays: 1, maxBufferedEvents: 10,
  schedules: [{ kind: "ingress", request: {
    namespace: "synthetic-stream-control.calendar.invalid", body: "Moon", clock: "utc", stepMs: 3_600_000
  } }]
};
const point = (utc: string, uid = "synthetic-point@calendar.invalid"): ScheduleEvent => ({
  ...syntheticEvents[0]!, uid, receipt: { ...syntheticEvents[0]!.receipt, utc }
});
const at = (startUtc: string) => new Date(Date.parse(startUtc) + 3_600_000).toISOString();
const install = () => vi.spyOn(ingress, "searchIngressSchedule").mockImplementation(input => ({
  status: "complete", evaluations: 7, events: [point(at(input.startUtc), `${input.startUtc}@calendar.invalid`)]
}));
const drain = async (iterator: AsyncIterable<unknown>) => { for await (const _item of iterator) { /* Pull to completion. */ } };
afterEach(() => vi.restoreAllMocks());

describe("stream work and consumer control with invented adapter results", () => {
  it("is lazy, respects pull backpressure and does no more search after early return", async () => {
    const search = install();
    const stream = streamSchedule(request);
    expect(search).not.toHaveBeenCalled();
    expect((await stream.next()).done).toBe(false);
    expect(search).toHaveBeenCalledTimes(1);
    await yieldToHost();
    await yieldToHost();
    expect(search).toHaveBeenCalledTimes(1);
    expect((await stream.next()).done).toBe(false);
    expect(search).toHaveBeenCalledTimes(2);
    await stream.return({ status: "complete", emitted: 0, evaluations: 0, windows: 0 });
    expect((await stream.next()).done).toBe(true);
    expect(search).toHaveBeenCalledTimes(2);
  });

  it("counts a shared evaluation budget across windows and selections, including a late refusal", async () => {
    const search = install().mockImplementation(input => input.maxEvaluations < 7 ?
      { status: "refused", reason: "evaluation-budget", events: [], evaluations: input.maxEvaluations } :
      { status: "complete", events: [point(at(input.startUtc), `${input.startUtc}@calendar.invalid`)], evaluations: 7 });
    const stream = streamSchedule({ ...request, maxEvaluations: 15 });
    await stream.next();
    await stream.next();
    const failure = await stream.next().catch(error => error as ScheduleStreamError);
    expect(failure).toBeInstanceOf(ScheduleStreamError);
    expect(failure).toMatchObject({ reason: "evaluation-budget", evaluations: 15, emitted: 2, selectionIndex: 0 });
    expect(search.mock.calls.map(([input]) => input.maxEvaluations)).toEqual([15, 8, 1]);
    expect((await stream.next()).done).toBe(true);
    search.mockClear();
    await expect(drain(streamSchedule({ ...request, maxEvaluations: 7 })))
      .rejects.toMatchObject({ reason: "evaluation-budget", evaluations: 7, emitted: 1 });
    expect(search).toHaveBeenCalledTimes(1);
    search.mockClear();
    await expect(drain(streamSchedule({ ...request, maxEvaluations: 10, schedules: [...request.schedules, ...request.schedules] })))
      .rejects.toMatchObject({ reason: "evaluation-budget", evaluations: 10, emitted: 0, selectionIndex: 1 });
    expect(search.mock.calls.map(([input]) => input.maxEvaluations)).toEqual([10, 3]);
  });

  it("yields to host tasks so disconnect cancellation can interrupt hot iteration", async () => {
    const search = install();
    const controller = new AbortController();
    const iterator = streamSchedule({ ...request, signal: controller.signal });
    await iterator.next();
    setImmediate(() => controller.abort());
    await expect(iterator.next()).rejects.toMatchObject({ reason: "cancelled", emitted: 1, evaluations: 7 });
    expect(search).toHaveBeenCalledTimes(1);
    search.mockClear();
    await expect(drain(streamSchedule({ ...request, signal: controller.signal })))
      .rejects.toMatchObject({ reason: "cancelled", emitted: 0, evaluations: 0 });
    expect(search).not.toHaveBeenCalled();
  });

  it("passes the original cancellation signal and remaining budget to the adapter", async () => {
    const controller = new AbortController();
    const search = install().mockImplementation(input => {
      expect(input.signal).toBe(controller.signal);
      controller.abort();
      return { status: "refused", reason: "cancelled", evaluations: 3, events: [] };
    });
    await expect(drain(streamSchedule({ ...request, signal: controller.signal })))
      .rejects.toMatchObject({ reason: "cancelled", emitted: 0, evaluations: 3 });
    expect(search).toHaveBeenCalledTimes(1);
  });

  it("refuses an overflowing window before emitting it and handles exact buffer limits", async () => {
    const search = install().mockImplementation(input => ({ status: "complete", evaluations: 7,
      events: [point(at(input.startUtc), "a@calendar.invalid"), point(at(input.startUtc), "b@calendar.invalid")] }));
    await expect(drain(streamSchedule({ ...request, maxBufferedEvents: 1 })))
      .rejects.toMatchObject({ reason: "buffer-budget", emitted: 0, evaluations: 7 });
    const input = { ...request, endUtc: "2026-02-02T00:00:00.000Z", maxBufferedEvents: 2 };
    const actual: ScheduleEvent[] = [];
    for await (const event of streamSchedule(input)) actual.push(event);
    expect(actual.map(event => event.uid)).toEqual(["a@calendar.invalid", "b@calendar.invalid"]);
    search.mockClear();
    await expect(drain(streamSchedule({ ...input, maxBufferedEvents: 3, schedules: [...input.schedules, ...input.schedules] })))
      .rejects.toMatchObject({ reason: "buffer-budget", emitted: 0, evaluations: 14 });
  });

  it("merges equal timestamps by code-unit UID order and deduplicates identical selections", async () => {
    install().mockImplementation(input => ({ status: "complete", evaluations: 7,
      events: [point(at(input.startUtc), "z@calendar.invalid"), point(at(input.startUtc), "A@calendar.invalid"),
        point(at(input.startUtc), "a@calendar.invalid")] }));
    const input = { ...request, endUtc: "2026-02-02T00:00:00.000Z", schedules: [...request.schedules, ...request.schedules] };
    const events: ScheduleEvent[] = [];
    for await (const event of streamSchedule(input)) events.push(event);
    expect(events.map(event => event.uid)).toEqual(["A@calendar.invalid", "a@calendar.invalid", "z@calendar.invalid"]);
    expect(events).toEqual([...events].sort(compareScheduleEvents));
  });

  it("keeps long intervals across otherwise empty windows without mutating or clipping them", async () => {
    const interval = { ...syntheticEvents[1]!, receipt: { ...syntheticEvents[1]!.receipt, utc: "2026-01-31T12:00:00.000Z" },
      endUtc: "2026-02-05T00:00:00.000Z" };
    const search = vi.spyOn(voidOfCourse, "searchVoidOfCourseSchedule").mockImplementation(input => ({
      status: "complete", evaluations: 7, events: input.startUtc < interval.endUtc ? [structuredClone(interval)] : []
    }));
    const iterator = streamSchedule({ ...request, schedules: [{ kind: "void-of-course", request: {
      namespace: "synthetic-stream-interval.calendar.invalid", clock: "utc", stepMs: 3_600_000,
      policy: { bodies: ["Sun"], aspects: [{ id: "conjunction", angleDegrees: 0 }] }
    } }] });
    const first = await iterator.next();
    expect(first.value).toEqual(interval);
    if (first.done) throw new Error("Expected an interval.");
    (first.value as { uid: string }).uid = "consumer-mutated@calendar.invalid";
    const final = await iterator.next();
    expect(final.done).toBe(true);
    expect(final.value).toMatchObject({ status: "complete", emitted: 1, windows: 5, evaluations: 35 });
    expect(search).toHaveBeenCalledTimes(5);
  });

  it("never silently deduplicates conflicting records or accepts out-of-window events", async () => {
    const search = install().mockImplementation(input => ({ status: "complete", evaluations: 7,
      events: [point(at(input.startUtc)), { ...point(at(input.startUtc)), summary: "Conflicting receipt" }] }));
    await expect(drain(streamSchedule(request))).rejects.toThrow("Conflicting records");
    search.mockImplementation(input => ({ status: "complete", evaluations: 7, events: [point(input.startUtc)] }));
    await expect(drain(streamSchedule(request))).rejects.toThrow("outside its display window");
  });

  it("captures nested request data at construction and validates all selections before searching", async () => {
    const search = install();
    const input = structuredClone(request);
    const iterator = streamSchedule(input);
    (input.schedules[0]!.request as { body: string }).body = "Sun";
    (input as { endUtc: string }).endUtc = input.startUtc;
    await iterator.next();
    expect(search.mock.calls[0]![0].body).toBe("Moon");
    await iterator.return({ status: "complete", emitted: 0, evaluations: 0, windows: 0 });
    search.mockClear();
    expect(() => streamSchedule({ ...request, schedules: [...request.schedules, {
      kind: "ingress", request: { ...request.schedules[0]!.request, clock: "tt" }
    }] } as unknown as ScheduleStreamRequest)).toThrow("UTC clock");
    expect(search).not.toHaveBeenCalled();
  });

  it("streams a long invented range with a single-record buffer and releases finished windows", async () => {
    const search = install();
    const windows = 512;
    const input = { ...request, endUtc: new Date(Date.parse(request.startUtc) + windows * 86_400_000).toISOString(),
      maxBufferedEvents: 1, maxEvaluations: windows * 7 };
    const stream = streamSchedule(input);
    let count = 0;
    while (true) {
      const next = await stream.next();
      if (next.done) {
        expect(next.value).toEqual({ status: "complete", emitted: windows, evaluations: windows * 7, windows });
        break;
      }
      count++;
      expect(search).toHaveBeenCalledTimes(count);
    }
    expect(count).toBe(windows);
  });

  it("preserves unresolved interval diagnostics and withholds the refused mixed window", async () => {
    install();
    const unresolved = [{ reason: "next-ingress-outside-window" as const,
      startUtc: request.startUtc, endUtc: request.endUtc, sign: "Synthetic sign",
      identityWindow: { startUtc: request.startUtc, endUtc: "2026-02-02T00:00:00.000Z" },
      searchWindow: { startMs: Date.parse(request.startUtc), endMs: Date.parse(request.endUtc), clock: "utc" as const }
    }];
    vi.spyOn(voidOfCourse, "searchVoidOfCourseSchedule").mockReturnValue({ status: "refused",
      reason: "unresolved-interval", events: [], evaluations: 3, unresolved });
    const iterator = streamSchedule({ ...request, schedules: [...request.schedules, {
      kind: "void-of-course", request: { namespace: "synthetic-unresolved.calendar.invalid", clock: "utc", stepMs: 3_600_000,
        policy: { bodies: ["Sun"], aspects: [{ id: "conjunction", angleDegrees: 0 }] } }
    }] });
    await expect(iterator.next()).rejects.toMatchObject({ reason: "unresolved-interval", emitted: 0,
      evaluations: 10, selectionIndex: 1, cause: { unresolved } });
  });

  it.each([
    { windowDays: 0 }, { windowDays: 32 }, { windowDays: 1.5 }, { maxEvaluations: 0 },
    { maxBufferedEvents: 0 }, { schedules: [] }, { signal: {} }, { startUtc: "2026-02-30T00:00:00.000Z" },
    { endUtc: request.startUtc }, { surprise: true },
    { schedules: [{ kind: "other", request: {} }] },
    { schedules: [{ ...request.schedules[0], request: { ...request.schedules[0]!.request, maxEvaluations: 5 } }] }
  ])("refuses malformed stream controls before work: %j", patch => {
    const search = install();
    expect(() => streamSchedule({ ...request, ...patch } as unknown as ScheduleStreamRequest)).toThrow();
    expect(search).not.toHaveBeenCalled();
  });
});

describe("incremental calendar wire output", () => {
  it("honors a slow Node Writable through a bounded byte-stream pipeline", async () => {
    let pulls = 0, closed = false;
    const chunks: Buffer[] = [];
    let release: (() => void) | undefined;
    let notifyStarted!: () => void;
    const started = new Promise<void>(resolve => { notifyStarted = resolve; });
    async function* source() {
      try { for (const event of syntheticEvents) { pulls++; yield event; } }
      finally { closed = true; }
    }
    const sink = new Writable({ highWaterMark: 1, write(chunk: Buffer, _encoding, callback) {
      chunks.push(chunk);
      if (chunks.length === 1) { release = callback; notifyStarted(); }
      else callback();
    } });
    const completion = pipeline(Readable.from(streamCalendar(source(), fixtureOptions), {
      objectMode: false, highWaterMark: 1
    }), sink);
    try {
      await started;
      await yieldToHost();
      await yieldToHost();
      expect(chunks).toHaveLength(1);
      expect(pulls).toBe(1);
    } finally { release?.(); }
    await completion;
    expect(pulls).toBe(syntheticEvents.length);
    expect(closed).toBe(true);
    expect(Buffer.concat(chunks).toString("utf8")).toBe(serializeCalendar(syntheticEvents, fixtureOptions));
  });

  it("closes the event source when a pipeline destination fails", async () => {
    let pulls = 0, closed = false;
    const failure = new Error("Synthetic destination failure");
    async function* source() {
      try { for (const event of syntheticEvents) { pulls++; yield event; } }
      finally { closed = true; }
    }
    const sink = new Writable({ write(_chunk, _encoding, callback) { callback(failure); } });
    await expect(pipeline(Readable.from(streamCalendar(source(), fixtureOptions), {
      objectMode: false, highWaterMark: 1
    }), sink)).rejects.toBe(failure);
    expect(closed).toBe(true);
    expect(pulls).toBe(1);
  });

  it("pulls one event at a time and closes upstream iterators on consumer return", async () => {
    let pulls = 0, closed = false;
    async function* source() {
      try { for (const event of syntheticEvents) { pulls++; yield event; } }
      finally { closed = true; }
    }
    const stream = streamCalendar(source(), fixtureOptions);
    expect(pulls).toBe(0);
    expect((await stream.next()).value).toMatch(/^BEGIN:VCALENDAR/);
    expect(pulls).toBe(1);
    expect((await stream.next()).value).toMatch(/^BEGIN:VEVENT/);
    expect(pulls).toBe(1);
    await stream.return();
    expect(closed).toBe(true);
    expect(pulls).toBe(1);
  });

  it("stops after cancellation between header and first event", async () => {
    const controller = new AbortController();
    const stream = streamCalendar(syntheticEvents, { ...fixtureOptions, signal: controller.signal });
    await stream.next();
    controller.abort();
    await expect(stream.next()).rejects.toMatchObject({ name: "AbortError" });
    expect((await stream.next()).done).toBe(true);
  });

  it("lets host cancellation stop a synchronous event source before another pull", async () => {
    let pulls = 0;
    const controller = new AbortController();
    function* source() { for (const event of syntheticEvents) { pulls++; yield event; } }
    const stream = streamCalendar(source(), { ...fixtureOptions, signal: controller.signal });
    await stream.next();
    await stream.next();
    setImmediate(() => controller.abort());
    await expect(stream.next()).rejects.toMatchObject({ name: "AbortError" });
    expect(pulls).toBe(1);
  });

  it("does not close a refused or failed source as a successful calendar", async () => {
    const outputs: string[] = [];
    const error = new Error("Synthetic upstream failure");
    async function* source() { yield syntheticEvents[0]!; throw error; }
    try { for await (const chunk of streamCalendar(source(), fixtureOptions)) outputs.push(chunk); }
    catch (failure) { expect(failure).toBe(error); }
    expect(outputs.join("")).toContain("END:VEVENT\r\n");
    expect(outputs.join("")).not.toContain("END:VCALENDAR");
    expect(outputs).toHaveLength(2);
  });

  it("propagates a late engine refusal with diagnostics and no calendar footer", async () => {
    const search = install();
    search.mockImplementationOnce(input => ({ status: "complete", evaluations: 7, events: [point(at(input.startUtc))] }));
    search.mockImplementationOnce(() => ({ status: "refused", reason: "engine-refused", evaluations: 2, events: [] }));
    const outputs: string[] = [];
    let failure: unknown;
    try { for await (const chunk of streamCalendar(streamSchedule(request), fixtureOptions)) outputs.push(chunk); }
    catch (error) { failure = error; }
    expect(failure).toMatchObject({ reason: "engine-refused", emitted: 1, evaluations: 9 });
    expect(outputs.join("")).not.toContain("END:VCALENDAR");
    expect(search).toHaveBeenCalledTimes(2);
  });

  it("refuses malformed or unordered records without a successful footer", async () => {
    for (const events of [[...syntheticEvents].reverse(), [syntheticEvents[0]!, syntheticEvents[0]!],
      [{ ...syntheticEvents[0]!, uid: "bad\nUID" }]]) {
      const outputs: string[] = [];
      let failure: unknown;
      try { for await (const chunk of streamCalendar(events, fixtureOptions)) outputs.push(chunk); }
      catch (error) { failure = error; }
      expect(failure).toBeInstanceOf(RangeError);
      expect(outputs.join("")).not.toContain("END:VCALENDAR");
    }
  });
});
