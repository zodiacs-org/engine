import ICAL from "ical.js";
import { describe, expect, it } from "vitest";
import { calc } from "../../src/calc.js";
import { eclipseGeometry } from "../.cache/events-source/events/src/eclipses.js";
import type { EclipseEvent, EclipseVector } from "../.cache/events-source/events/src/eclipses.js";
import { executeQuery } from "../.cache/events-source/events/src/search.js";
import { createCalendarTimeZone, searchEclipseSchedule, serializeCalendar } from "../src/index.js";
import type { EclipseScheduleRequest, JsonObject } from "../src/index.js";
import { eclipseRequest, lunarRequest, revisionUtc } from "./fixtures/synthetic-stations-eclipses.js";

const DAY_MS = 86_400_000;
const complete = (request: EclipseScheduleRequest = eclipseRequest) => {
  const result = searchEclipseSchedule(request);
  expect(result.status).toBe("complete");
  if (result.status !== "complete") throw new Error(result.reason);
  return result;
};

// Engine parity verifies delegation and preserved data, not astronomical accuracy.
describe("eclipses from the pinned shadow search and parent engine", () => {
  it.each([eclipseRequest, lunarRequest])("preserves the $kind geometry and both full vector receipts", request => {
    const result = complete(request);
    expect(result.events).toHaveLength(1);
    const event = result.events[0]!;
    const source = event.receipt.source!;
    const occurrence = event.identity!.occurrence;
    if (occurrence.scheme !== "utc-day-ordinal/1") throw new Error("Expected a day identity.");
    const day = Date.parse(occurrence.startUtc);
    const upstream = executeQuery({
      mode: "all", clock: "utc", event: { kind: "eclipse", eclipse: request.kind },
      range: { startMs: day - DAY_MS, endMs: day + 2 * DAY_MS }
    }, { stepMs: request.stepMs, maxEvaluations: request.maxEvaluations,
      eclipse: { model: request.model, derivativeStepMs: request.derivativeStepMs } });
    expect(upstream.status).toBe("complete");
    expect(source.event).toEqual(upstream.events.find(item => "atMs" in item && item.atMs === Date.parse(event.receipt.utc)));
    const found = source.event as unknown as EclipseEvent;
    expect(found).toMatchObject({ kind: request.kind, definition: "minimum-shadow-axis-distance", model: request.model });
    const vectors: Partial<Record<"Sun" | "Moon", EclipseVector>> = {};
    for (const body of ["Sun", "Moon"] as const) {
      const calculation = calc({ body, time: event.receipt.utc, flags: { speeds: false, cartesian: true } });
      if (calculation.status !== "ok" || !calculation.cartesian) throw new Error("Fixture calculation refused.");
      expect((source.calculations as JsonObject)[body]).toEqual({ receipt: calculation.receipt, cartesian: calculation.cartesian });
      expect(event.receipt.engine).toEqual(calculation.receipt.engine);
      expect(calculation.receipt.instants[0]).toMatchObject({ utc: event.receipt.utc, timeScale: { input: "utc" } });
      vectors[body] = [calculation.cartesian.x, calculation.cartesian.y, calculation.cartesian.z];
    }
    const geometry = eclipseGeometry(request.kind, { sun: vectors.Sun!, moon: vectors.Moon! }, request.model);
    expect(found).toMatchObject(geometry);
    expect(found.forward).toBe(true);
    expect(found.bracket[1] - found.bracket[0]).toBeLessThanOrEqual(1);
    expect(event.receipt).toMatchObject({ eventType: "eclipse", bodies: ["Sun", "Moon", "Earth"], aspect: null, orbDegrees: null });
    expect(event.identity!.definition.parameters).toMatchObject({
      kind: request.kind, model: request.model, derivativeStepMs: request.derivativeStepMs
    });
    // Class and numerical geometry are search outputs, not series configuration.
    expect(event.identity!.definition.parameters).not.toHaveProperty("classification");
    expect(event.identity!.definition.parameters).not.toHaveProperty("axisDistanceAu");
    expect(complete(request).events).toEqual(result.events);
  });

  it.each([eclipseRequest, lunarRequest])("round-trips the $kind instant, model, receipts and null angular orb in UTC and TZID", request => {
    const result = complete(request);
    const timeZone = createCalendarTimeZone("America/New_York", request.startUtc, request.endUtc);
    for (const options of [{ dtstamp: revisionUtc }, { dtstamp: revisionUtc, timeZone }]) {
      const feed = new ICAL.Component(ICAL.parse(serializeCalendar(result.events, options)));
      const component = feed.getFirstSubcomponent("vevent")!;
      const parsed = new ICAL.Event(component);
      const zone = feed.getFirstSubcomponent("vtimezone");
      if (zone) parsed.startDate.zone = new ICAL.Timezone(zone);
      const expected = result.events[0]!;
      expect(component.getFirstProperty("dtstart")!.getParameter("tzid"))
        .toBe("timeZone" in options ? "America/New_York" : undefined);
      expect(parsed.uid).toBe(expected.uid);
      expect(parsed.summary).toBe(expected.summary);
      expect(JSON.parse(parsed.description)).toEqual(expected.receipt);
      expect(parsed.startDate.toJSDate().toISOString()).toBe(expected.receipt.utc.replace(/\.\d{3}Z$/u, ".000Z"));
      expect(component.getFirstPropertyValue("x-zodiacs-utc")).toBe(expected.receipt.utc);
      expect(component.getFirstPropertyValue("x-zodiacs-event-type")).toBe("eclipse");
      expect(component.getFirstPropertyValue("x-zodiacs-orb-degrees")).toBe("null");
      expect(component.getFirstPropertyValue("x-zodiacs-aspect")).toBe("null");
      expect(JSON.parse(component.getFirstPropertyValue("x-zodiacs-identity") as string)).toEqual(expected.identity);
    }
  });

  it.each([eclipseRequest, lunarRequest])("keeps $kind identities and full receipts across overlap and exact-instant partitions", request => {
    const whole = complete(request);
    const split = whole.events[0]!.receipt.utc;
    const left = complete({ ...request, endUtc: split });
    const right = complete({ ...request, startUtc: split });
    expect([...left.events, ...right.events]).toEqual(whole.events);
    expect(left.events).toEqual(whole.events);
    expect(right.events).toEqual([]);
    const overlap = complete({ ...request,
      startUtc: new Date(Date.parse(split) - 30_000).toISOString(),
      endUtc: new Date(Date.parse(split) + 30_000).toISOString() });
    expect(overlap.events).toEqual(whole.events);
  });

  it("separates model and derivative policies while keeping range and budget outside the UID", () => {
    const event = complete().events[0]!;
    const same = complete({ ...eclipseRequest, maxEvaluations: 200_000 }).events[0]!;
    expect(same.uid).toBe(event.uid);
    for (const change of [
      { model: { ...eclipseRequest.model, earthRadiusAu: eclipseRequest.model.earthRadiusAu * 1.01 } },
      { derivativeStepMs: 120_000 }, { stepMs: 1_800_000 }
    ]) {
      const changed = complete({ ...eclipseRequest, ...change }).events[0]!;
      expect(changed.uid).not.toBe(event.uid);
    }
  });

  it("distinguishes empty completion, cancellation, scan budget and engine coverage refusal", () => {
    expect(complete({ ...eclipseRequest, startUtc: "2026-08-13T00:00:00.000Z" }).events).toEqual([]);
    expect(searchEclipseSchedule({ ...eclipseRequest, signal: AbortSignal.abort() })).toEqual({
      status: "refused", reason: "cancelled", events: [], evaluations: 0
    });
    expect(searchEclipseSchedule({ ...eclipseRequest, maxEvaluations: 1 })).toEqual({
      status: "refused", reason: "evaluation-budget", events: [], evaluations: 1
    });
    expect(searchEclipseSchedule({ ...eclipseRequest,
      startUtc: "1700-01-02T00:00:00.000Z", endUtc: "1700-01-03T00:00:00.000Z" })).toEqual({
      status: "refused", reason: "engine-refused", events: [], evaluations: 1
    });
  });
});
