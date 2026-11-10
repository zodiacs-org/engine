import ICAL from "ical.js";
import { describe, expect, it } from "vitest";
import { calc } from "../../src/calc.js";
import { executeQuery } from "../.cache/events-source/events/src/search.js";
import { createCalendarTimeZone, serializeCalendar } from "../src/index.js";
import { searchStationSchedule } from "../src/stations.js";
import type { StationScheduleRequest } from "../src/stations.js";
import type { JsonObject } from "../src/types.js";

// Invented schedule windows without personal data. These test delegation and
// serialization, not physical accuracy or completeness of the engine's search.
const request: StationScheduleRequest = {
  namespace: "synthetic-station.calendar.invalid", body: "Mercury", clock: "utc",
  startUtc: "2026-03-18T12:00:00.000Z", endUtc: "2026-03-23T12:00:00.000Z",
  stepMs: 3_600_000, maxEvaluations: 10_000
};
const dtstamp = "2026-01-01T00:00:00.000Z";
const complete = (input = request) => {
  const result = searchStationSchedule(input);
  expect(result.status).toBe("complete");
  if (result.status !== "complete") throw new Error(result.reason);
  return result;
};

describe("stations from the pinned events DSL and parent calc", () => {
  it("retains the full search station, speed-enabled calc receipt and calculated longitude and speed", () => {
    const result = complete();
    expect(result.events).toHaveLength(1);
    const event = result.events[0]!;
    const source = event.receipt.source!;
    const window = (source.search as JsonObject).window as JsonObject;
    const startDay = new Date(window.startMs as number).toISOString().slice(0, 10);
    const endDay = new Date(window.endMs as number).toISOString().slice(0, 10);
    const upstream = executeQuery(`all Mercury stations from ${startDay} to ${endDay} clock utc`, {
      stepMs: request.stepMs, maxEvaluations: request.maxEvaluations
    });
    expect(upstream.status).toBe("complete");
    expect(source.event).toEqual(upstream.events[0]);
    const calculation = calc({ body: "Mercury", time: event.receipt.utc, flags: { speeds: true } });
    expect(calculation.status).toBe("ok");
    if (calculation.status !== "ok") throw new Error("Fixture calculation refused.");
    expect(source.calculation).toEqual(calculation.receipt);
    expect(event.receipt.engine).toEqual(calculation.receipt.engine);
    expect(source.result).toEqual({ longitudeDegrees: calculation.lon, speedDegreesPerDay: calculation.speeds!.lon });
    expect(event.receipt.orbDegrees).toBeNull();
    expect(event.receipt.aspect).toBeNull();
    expect(event.summary).toBe("Mercury stations direct");
    expect(complete().events).toEqual(result.events);
    expect(complete({ ...request, direction: "direct" }).events).toEqual(result.events);
    expect(complete({ ...request, direction: "retrograde" }).events).toEqual([]);
  });

  it("round-trips UTC and TZID feeds with exact receipt data and UID", () => {
    const result = complete();
    const timeZone = createCalendarTimeZone("Asia/Bangkok", request.startUtc, request.endUtc);
    for (const options of [{ dtstamp }, { dtstamp, timeZone }]) {
      const feed = new ICAL.Component(ICAL.parse(serializeCalendar(result.events, options)));
      const zone = feed.getFirstSubcomponent("vtimezone");
      const component = feed.getFirstSubcomponent("vevent")!;
      const parsed = new ICAL.Event(component);
      if (zone) parsed.startDate.zone = new ICAL.Timezone(zone);
      const expected = result.events[0]!;
      expect(parsed.uid).toBe(expected.uid);
      expect(JSON.parse(parsed.description)).toEqual(expected.receipt);
      expect(parsed.startDate.toJSDate().toISOString()).toBe(expected.receipt.utc.replace(/\.\d{3}Z$/u, ".000Z"));
      expect(component.getFirstPropertyValue("x-zodiacs-utc")).toBe(expected.receipt.utc);
      expect(component.getFirstPropertyValue("x-zodiacs-event-type")).toBe("station");
      expect(component.getFirstPropertyValue("x-zodiacs-orb-degrees")).toBe("null");
    }
  });

  it("preserves engine-backed UIDs and receipts across overlaps and exact-instant partitions", () => {
    const whole = complete();
    const split = whole.events[0]!.receipt.utc;
    const left = complete({ ...request, endUtc: split });
    const right = complete({ ...request, startUtc: split });
    expect(left.events).toEqual(whole.events);
    expect(right.events).toEqual([]);
    const overlap = complete({ ...request, startUtc: "2026-03-19T06:00:00.000Z", endUtc: "2026-03-22T12:00:00.000Z" });
    expect(overlap.events).toEqual(whole.events);
  });

  it("shares one evaluation budget across padded days and receipts", () => {
    const done = complete();
    expect(complete({ ...request, maxEvaluations: done.evaluations })).toEqual(done);
    expect(searchStationSchedule({ ...request, maxEvaluations: done.evaluations - 1 })).toEqual({
      status: "refused", reason: "evaluation-budget", events: [], evaluations: done.evaluations - 1
    });
    expect(searchStationSchedule({ ...request, maxEvaluations: 1 })).toEqual({
      status: "refused", reason: "evaluation-budget", events: [], evaluations: 1
    });
  });

  it("distinguishes complete empty output, cancellation and engine refusal", () => {
    expect(complete({ ...request, startUtc: "2026-03-22T00:00:00.000Z" }).events).toEqual([]);
    expect(searchStationSchedule({ ...request, signal: AbortSignal.abort() })).toEqual({
      status: "refused", reason: "cancelled", evaluations: 0, events: []
    });
    expect(searchStationSchedule({
      ...request, startUtc: "1700-01-01T00:00:00.000Z", endUtc: "1700-01-02T00:00:00.000Z"
    })).toEqual({ status: "refused", reason: "engine-refused", evaluations: 1, events: [] });
  });
});
