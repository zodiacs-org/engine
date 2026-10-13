import { readFileSync } from "node:fs";
import ICAL from "ical.js";
import { describe, expect, it } from "vitest";
import {
  compareScheduleEvents, createCalendarTimeZone, searchEclipseSchedule, searchIngressSchedule,
  searchNatalTransitSchedule, searchStationSchedule, searchSynastrySchedule, searchVoidOfCourseSchedule,
  serializeCalendar, streamCalendar, streamSchedule
} from "../src/index.js";
import type { ScheduleEvent, ScheduleSelection, ScheduleStreamRequest, ScheduleStreamSummary } from "../src/index.js";
import { fixtureOptions, syntheticEvents } from "./fixtures/synthetic-events.js";
import { voidRequest } from "./fixtures/synthetic-void-of-course.js";
import { syntheticSynastryRequest } from "./fixtures/synthetic-synastry.js";
import { eclipseRequest, lunarRequest, stationRequest } from "./fixtures/synthetic-stations-eclipses.js";

const { startUtc, endUtc, maxEvaluations: _singleSearchBudget, ...voidOptions } = voidRequest;
const selection: ScheduleSelection = { kind: "void-of-course", request: voidOptions };
const request: ScheduleStreamRequest = {
  startUtc, endUtc, maxEvaluations: 1_000_000, windowDays: 1, maxBufferedEvents: 100,
  schedules: [selection]
};
async function collect(input: ScheduleStreamRequest) {
  const events: ScheduleEvent[] = [];
  const iterator = streamSchedule(input);
  while (true) {
    const next = await iterator.next();
    if (next.done) return { events, summary: next.value };
    events.push(next.value);
  }
}
async function text(chunks: AsyncIterable<string>): Promise<string> {
  let output = "";
  for await (const chunk of chunks) output += chunk;
  return output;
}
function unchunked(input: ScheduleStreamRequest): ScheduleEvent[] {
  const bounds = { startUtc: input.startUtc, endUtc: input.endUtc, maxEvaluations: input.maxEvaluations };
  const events = input.schedules.flatMap(item => {
    const result = (() => {
      switch (item.kind) {
        case "ingress": return searchIngressSchedule({ ...item.request, ...bounds });
        case "station": return searchStationSchedule({ ...item.request, ...bounds });
        case "eclipse": return searchEclipseSchedule({ ...item.request, ...bounds });
        case "synastry-exact": return searchSynastrySchedule({ ...item.request, ...bounds });
        case "natal-transit": return searchNatalTransitSchedule({ ...item.request, ...bounds });
        case "void-of-course": return searchVoidOfCourseSchedule({ ...item.request, ...bounds });
      }
    })();
    expect(result.status).toBe("complete");
    if (result.status !== "complete") throw new Error(result.reason);
    return result.events;
  });
  return [...new Map(events.map(event => [event.uid, event])).values()].sort(compareScheduleEvents);
}

describe("streaming adapter integration (regression and plumbing, not accuracy evidence)", () => {
  it("deduplicates full void intervals across midnight and non-midnight windows", async () => {
    for (const input of [request, { ...request, startUtc: "2026-02-01T12:34:56.789Z", endUtc: "2026-02-05T03:00:00.000Z" }]) {
      const expected = unchunked(input);
      expect(expected.length).toBeGreaterThan(0);
      if (input.startUtc === request.startUtc) expect(expected[0]!.receipt.utc < input.startUtc).toBe(true);
      for (const windowDays of [1, 2, 31]) {
        const actual = await collect({ ...input, windowDays });
        expect(actual.events).toEqual(expected);
        expect(new Set(actual.events.map(event => event.uid)).size).toBe(actual.events.length);
        expect(actual.summary).toMatchObject({ status: "complete", emitted: expected.length });
        expect(actual.summary.evaluations).toBeGreaterThan(0);
        expect(actual.summary.evaluations).toBeLessThanOrEqual(input.maxEvaluations);
      }
    }
  }, 60_000);

  it("merges ingress, transit, progressed synastry and void schedules in deterministic order", async () => {
    const { startUtc: _start, endUtc: _end, maxEvaluations: _budget, ...synastry } = syntheticSynastryRequest;
    const mixed: ScheduleStreamRequest = { ...request, endUtc: "2026-02-06T00:00:00.000Z", schedules: [
      selection,
      { kind: "ingress", request: { namespace: "synthetic-stream.calendar.invalid", clock: "utc", body: "Moon", stepMs: 3_600_000 } },
      { kind: "synastry-exact", request: synastry },
      { kind: "natal-transit", request: {
        namespace: "synthetic-stream.calendar.invalid", clock: "utc", body: "Sun", natalBody: "Sun", stepMs: 3_600_000,
        natal: synastry.first, policy: synastry.policy
      } }
    ] };
    const expected = unchunked(mixed);
    expect(new Set(expected.map(event => event.receipt.eventType)))
      .toEqual(new Set(["void-of-course", "ingress", "synastry-exact", "natal-transit"]));
    for (const windowDays of [1, 3, 31]) {
      const result = await collect({ ...mixed, windowDays });
      expect(result.events).toEqual(expected);
      expect(await text(streamCalendar(streamSchedule({ ...mixed, windowDays }), fixtureOptions)))
        .toBe(serializeCalendar(expected, fixtureOptions));
    }
    expect((await collect({ ...mixed, schedules: [...mixed.schedules].reverse() })).events).toEqual(expected);
  }, 60_000);

  it.each([stationRequest, eclipseRequest, lunarRequest])("delegates station/eclipse windows: $namespace $kind", async (input) => {
    const { startUtc, endUtc, maxEvaluations: _budget, ...options } = input;
    const item: ScheduleSelection = "kind" in options ? { kind: "eclipse", request: options } : { kind: "station", request: options };
    const testRequest = { ...request, startUtc, endUtc, schedules: [item] };
    const expected = unchunked(testRequest);
    expect(expected.length).toBeGreaterThan(0);
    expect((await collect(testRequest)).events).toEqual(expected);
    expect((await collect({ ...testRequest, windowDays: 31 })).events).toEqual(expected);
  });

  it("owns an instantaneous event exactly at a streaming split once", async () => {
    const point: ScheduleSelection = { kind: "ingress", request: {
      namespace: "synthetic-stream-boundary.calendar.invalid", body: "Moon", clock: "utc", stepMs: 3_600_000
    } };
    const base = { ...request, schedules: [point] };
    const exact = unchunked(base)[0]!.receipt.utc;
    const atMs = Date.parse(exact);
    const input = { ...base, startUtc: new Date(atMs - 86_400_000).toISOString(), endUtc: new Date(atMs + 86_400_000).toISOString() };
    const expected = unchunked(input);
    const actual = await collect(input);
    expect(actual.events).toEqual(expected);
    expect(actual.events.filter(event => event.receipt.utc === exact)).toHaveLength(1);
  });

  it("preserves the small committed golden and parses UTC and TZID streamed feeds", async () => {
    expect(Buffer.from(await text(streamCalendar(syntheticEvents, fixtureOptions))))
      .toEqual(readFileSync(new URL("./fixtures/synthetic-events.ics", import.meta.url)));
    const expected = unchunked(request);
    const options = { ...fixtureOptions, timeZone: createCalendarTimeZone("Asia/Bangkok", expected[0]!.receipt.utc, expected.at(-1)!.endUtc!) };
    for (const settings of [fixtureOptions, options]) {
      const output = await text(streamCalendar(streamSchedule(request), settings));
      expect(output).toBe(serializeCalendar(expected, settings));
      const parsed = new ICAL.Component(ICAL.parse(output));
      const zoneComponent = parsed.getFirstSubcomponent("vtimezone");
      const zone = zoneComponent ? new ICAL.Timezone(zoneComponent) : undefined;
      const events = parsed.getAllSubcomponents("vevent");
      expect(events).toHaveLength(expected.length);
      events.forEach((component, index) => {
        const event = new ICAL.Event(component);
        if (zone) { event.startDate.zone = zone; event.endDate.zone = zone; }
        expect(event.uid).toBe(expected[index]!.uid);
        expect(JSON.parse(event.description)).toEqual(expected[index]!.receipt);
        expect(event.startDate.toJSDate().toISOString()).toBe(expected[index]!.receipt.utc.replace(/\.\d{3}Z$/u, ".000Z"));
        expect(event.endDate.toJSDate().toISOString()).toBe(expected[index]!.endUtc!.replace(/\.\d{3}Z$/u, ".000Z"));
      });
    }
  }, 30_000);

  it("returns a complete empty stream with work evidence but refuses an empty calendar", async () => {
    const input: ScheduleStreamRequest = { ...request, schedules: [{ kind: "ingress", request: {
      namespace: "synthetic-empty.calendar.invalid", body: "Sun", clock: "utc", stepMs: 3_600_000
    } }] };
    const actual = await collect(input);
    expect(actual.events).toEqual([]);
    expect(actual.summary).toMatchObject({ status: "complete", emitted: 0, windows: 3 } satisfies Partial<ScheduleStreamSummary>);
    expect(actual.summary.evaluations).toBeGreaterThan(0);
    await expect(text(streamCalendar(streamSchedule(input), fixtureOptions))).rejects.toThrow("at least one event");
  });
});
