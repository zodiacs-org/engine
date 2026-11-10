import { readFileSync } from "node:fs";
import ICAL from "ical.js";
import { describe, expect, it } from "vitest";
import { calc } from "../../src/calc.js";
import { EvaluationContext } from "../.cache/events-source/events/src/context.js";
import { searchVoidOfCourseMoon } from "../.cache/events-source/events/src/void.js";
import { searchVoidOfCourseSchedule, serializeCalendar, createCalendarTimeZone } from "../src/index.js";
import type { JsonObject, VoidOfCourseScheduleRequest } from "../src/index.js";
import { voidRequest as request, revisionUtc } from "./fixtures/synthetic-void-of-course.js";

const complete = (input: VoidOfCourseScheduleRequest = request) => {
  const result = searchVoidOfCourseSchedule(input);
  if (result.status !== "complete") throw new Error(result.reason);
  expect(result.status).toBe("complete");
  return result;
};

describe("void-of-course schedules through the pinned search and parent calc", () => {
  it("preserves interval definitions, contacts, policy and both full boundary receipts", () => {
    const result = complete();
    expect(result.events.length).toBeGreaterThan(0);
    for (const event of result.events) {
      const source = event.receipt.source!;
      const window = (source.search as JsonObject).window as unknown as { startMs: number; endMs: number; clock: "utc" };
      const upstream = searchVoidOfCourseMoon(new EvaluationContext(window, { maxEvaluations: request.maxEvaluations }),
        source.policy as unknown as VoidOfCourseScheduleRequest["policy"], { stepMs: request.stepMs });
      expect(upstream.status).toBe("complete");
      expect(upstream.events).toContainEqual(source.event);
      const calculations = source.calculations as JsonObject;
      for (const [at, key] of [[event.receipt.utc, "start"], [event.endUtc!, "end"]]) {
        const calculated = calc({ body: "Moon", time: at!, flags: { speeds: false } });
        expect(calculated.status).toBe("ok");
        if (calculated.status !== "ok") throw new Error("Synthetic window calculation refused.");
        expect(calculations[key!]).toEqual(calculated.receipt);
        expect(event.receipt.engine).toEqual(calculated.receipt.engine);
      }
      const contact = (source.event as JsonObject).lastContact as JsonObject | null;
      if (contact) {
        const body = (contact.target as JsonObject).body as "Sun";
        const target = calc({ body, time: event.receipt.utc, flags: { speeds: false } });
        if (target.status !== "ok") throw new Error("Synthetic target calculation refused.");
        expect(calculations.lastContactTarget).toEqual(target.receipt);
        expect(source.lastContactOrbDegrees).toBe(Math.abs(contact.residualDegrees as number));
      }
      expect(event.receipt.orbDegrees).toBeNull();
      expect(event.receipt.aspect).toBeNull();
      expect(event.identity?.occurrence.scheme).toBe("source-key/1");
    }
  }, 30_000);

  it("matches a small golden feed and round-trips UTC and TZID interval endpoints", () => {
    const events = complete().events;
    const output = serializeCalendar(events, { dtstamp: revisionUtc });
    expect(Buffer.from(output)).toEqual(readFileSync(new URL("./fixtures/synthetic-void-of-course.ics", import.meta.url)));
    for (const line of output.split("\r\n")) expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);
    const coverageStart = events[0]!.receipt.utc < request.startUtc ? events[0]!.receipt.utc : request.startUtc;
    const coverageEnd = events.at(-1)!.endUtc! > request.endUtc ? events.at(-1)!.endUtc! : request.endUtc;
    const timeZone = createCalendarTimeZone("Asia/Bangkok", coverageStart, coverageEnd);
    for (const options of [{ dtstamp: revisionUtc }, { dtstamp: revisionUtc, timeZone }]) {
      const feed = new ICAL.Component(ICAL.parse(serializeCalendar(events, options)));
      const zone = feed.getFirstSubcomponent("vtimezone");
      const parsed = feed.getAllSubcomponents("vevent");
      expect(parsed).toHaveLength(events.length);
      parsed.forEach((component, index) => {
        const event = new ICAL.Event(component);
        if (zone) {
          event.startDate.zone = new ICAL.Timezone(zone);
          event.endDate.zone = new ICAL.Timezone(zone);
        }
        const expected = events[index]!;
        expect(event.uid).toBe(expected.uid);
        expect(JSON.parse(event.description)).toEqual(expected.receipt);
        expect(event.startDate.toJSDate().toISOString()).toBe(expected.receipt.utc.replace(/\.\d{3}Z$/u, ".000Z"));
        expect(event.endDate.toJSDate().toISOString()).toBe(expected.endUtc!.replace(/\.\d{3}Z$/u, ".000Z"));
        expect(component.getFirstPropertyValue("x-zodiacs-end-utc")).toBe(expected.endUtc);
        expect(component.getFirstPropertyValue("x-zodiacs-event-type")).toBe("void-of-course");
        expect(component.getFirstPropertyValue("x-zodiacs-orb-degrees")).toBe("null");
      });
    }
  });

  it("preserves engine-backed UIDs and full intervals for clipped display ranges", () => {
    const whole = complete();
    expect(complete().events).toEqual(whole.events);
    const event = whole.events[0]!;
    const middle = new Date(Math.floor((Date.parse(event.receipt.utc) + Date.parse(event.endUtc!)) / 2)).toISOString();
    const narrow = complete({ ...request, startUtc: middle, endUtc: event.endUtc! });
    expect(narrow.events).toEqual([event]);
    expect(complete({ ...request, startUtc: event.receipt.utc, endUtc: middle }).events).toEqual([event]);
    expect(complete({ ...request, startUtc: event.endUtc! }).events.some(row => row.uid === event.uid)).toBe(false);
  }, 30_000);

  it("distinguishes budget, cancellation, unsupported coverage and complete empty ranges", () => {
    expect(searchVoidOfCourseSchedule({ ...request, maxEvaluations: 1 }))
      .toEqual({ status: "refused", reason: "evaluation-budget", events: [], evaluations: 1 });
    expect(searchVoidOfCourseSchedule({ ...request, signal: AbortSignal.abort() }))
      .toEqual({ status: "refused", reason: "cancelled", events: [], evaluations: 0 });
    expect(searchVoidOfCourseSchedule({ ...request, startUtc: "1700-01-01T00:00:00.000Z", endUtc: "1700-01-02T00:00:00.000Z" }))
      .toEqual({ status: "refused", reason: "engine-refused", events: [], evaluations: 1 });
    const first = complete().events.find(event => (event.receipt.source!.event as JsonObject).lastContact !== null)!;
    const startUtc = new Date(Date.parse(first.receipt.utc) - 60_000).toISOString();
    expect(complete({ ...request, startUtc, endUtc: first.receipt.utc }).events).toEqual([]);
  });
});
