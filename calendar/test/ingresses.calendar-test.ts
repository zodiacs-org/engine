import ICAL from "ical.js";
import { describe, expect, it } from "vitest";
import { calc } from "../../src/calc.js";
import { executeQuery } from "../.cache/events-source/events/src/search.js";
import { createCalendarTimeZone, searchIngressSchedule, serializeCalendar } from "../src/index.js";
import type { IngressScheduleRequest } from "../src/index.js";
import type { JsonObject } from "../src/types.js";

// Invented schedule windows without personal data. These check delegation and
// serialization, not physical accuracy or completeness of the engine's search.
const request: IngressScheduleRequest = {
  namespace: "synthetic-ingress.calendar.invalid", body: "Sun", clock: "utc",
  startUtc: "2026-03-19T12:00:00.000Z", endUtc: "2026-03-22T12:00:00.000Z",
  stepMs: 3_600_000, maxEvaluations: 10_000
};
const dtstamp = "2026-01-01T00:00:00.000Z";
const complete = (input = request) => {
  const result = searchIngressSchedule(input);
  expect(result.status).toBe("complete");
  if (result.status !== "complete") throw new Error(result.reason);
  return result;
};

describe("ingresses from the pinned events DSL and parent calc", () => {
  it("retains the upstream search event and full engine calculation receipt", () => {
    const result = complete();
    expect(result.events).toHaveLength(1);
    const event = result.events[0]!;
    const source = event.receipt.source!;
    const upstream = executeQuery("all Sun ingresses from 2026-03-20 to 2026-03-22 clock utc", {
      stepMs: request.stepMs, maxEvaluations: request.maxEvaluations
    });
    expect(upstream.status).toBe("complete");
    expect(source.event).toEqual(upstream.events[0]);
    const calculation = calc({ body: "Sun", time: event.receipt.utc, flags: { speeds: false } });
    expect(calculation.status).toBe("ok");
    if (calculation.status !== "ok") throw new Error("Fixture calculation refused.");
    expect(source.calculation).toEqual(calculation.receipt);
    expect(event.receipt.engine).toEqual(calculation.receipt.engine);
    expect((source.calculation as JsonObject).instants).toEqual(calculation.receipt.instants);
    expect(event.receipt.orbDegrees).toBe(Math.abs((source.event as JsonObject).residualDegrees as number));
    expect(event.summary).toBe("Sun enters Aries");
    expect(event.identity?.occurrence).toEqual({
      scheme: "utc-day-ordinal/1", startUtc: "2026-03-20T00:00:00.000Z", ordinal: 0
    });
    expect(complete().events).toEqual(result.events);
  });

  it("round-trips UTC and TZID feeds while retaining exact receipt data and UID", () => {
    const result = complete();
    const timeZone = createCalendarTimeZone("Asia/Bangkok", request.startUtc, request.endUtc);
    for (const options of [{ dtstamp }, { dtstamp, timeZone }]) {
      const feed = new ICAL.Component(ICAL.parse(serializeCalendar(result.events, options)));
      // Supply the embedded definition to this parser without global registration.
      const zone = feed.getFirstSubcomponent("vtimezone");
      const parsed = new ICAL.Event(feed.getFirstSubcomponent("vevent")!);
      if (zone) parsed.startDate.zone = new ICAL.Timezone(zone);
      const expected = result.events[0]!;
      expect(parsed.uid).toBe(expected.uid);
      expect(JSON.parse(parsed.description)).toEqual(expected.receipt);
      expect(parsed.startDate.toJSDate().toISOString()).toBe(expected.receipt.utc.replace(/\.\d{3}Z$/u, ".000Z"));
      expect(feed.getFirstSubcomponent("vevent")!.getFirstPropertyValue("x-zodiacs-utc")).toBe(expected.receipt.utc);
    }
  });

  it("keeps engine-backed UIDs and receipts across overlapping and partitioned requests", () => {
    const input: IngressScheduleRequest = {
      ...request, body: "Moon", startUtc: "2026-02-01T00:00:00.000Z", endUtc: "2026-02-06T00:00:00.000Z"
    };
    const whole = complete(input);
    expect(whole.events.length).toBeGreaterThan(1);
    const split = whole.events[0]!.receipt.utc;
    const left = complete({ ...input, endUtc: split });
    const right = complete({ ...input, startUtc: split });
    expect([...left.events, ...right.events]).toEqual(whole.events);
    expect(new Set(whole.events.map(event => event.uid)).size).toBe(whole.events.length);
    const overlap = complete({ ...input, startUtc: "2026-02-02T06:00:00.000Z", endUtc: "2026-02-05T12:00:00.000Z" });
    expect(overlap.events).toEqual(whole.events.filter(event =>
      event.receipt.utc > "2026-02-02T06:00:00.000Z" && event.receipt.utc <= "2026-02-05T12:00:00.000Z"));
  });

  it("shares the evaluation budget across days and receipt requests, dropping partial output", () => {
    const done = complete();
    expect(complete({ ...request, maxEvaluations: done.evaluations })).toEqual(done);
    const refused = searchIngressSchedule({ ...request, maxEvaluations: done.evaluations - 1 });
    expect(refused).toEqual({
      status: "refused", reason: "evaluation-budget", events: [], evaluations: done.evaluations - 1
    });
    expect(searchIngressSchedule({ ...request, maxEvaluations: 1 })).toEqual({
      status: "refused", reason: "evaluation-budget", events: [], evaluations: 1
    });
  });

  it("distinguishes a completed empty schedule, cancellation and engine refusal", () => {
    expect(complete({ ...request, startUtc: "2026-03-21T00:00:00.000Z" }).events).toEqual([]);
    expect(searchIngressSchedule({ ...request, signal: AbortSignal.abort() })).toEqual({
      status: "refused", reason: "cancelled", evaluations: 0, events: []
    });
    expect(searchIngressSchedule({
      ...request, startUtc: "1700-01-01T00:00:00.000Z", endUtc: "1700-01-02T00:00:00.000Z"
    })).toEqual({ status: "refused", reason: "engine-refused", evaluations: 1, events: [] });
  });
});
