import { readFileSync } from "node:fs";
import ICAL from "ical.js";
import { describe, expect, it } from "vitest";
import { calc } from "../../src/calc.js";
import { natalChart } from "../../src/index.js";
import { createNatalEnvelope, parseNatalEnvelope, serializeNatalEnvelope } from "../../src/receipt.js";
import { searchExactAspects } from "../.cache/events-source/events/src/aspects.js";
import { EvaluationContext } from "../.cache/events-source/events/src/context.js";
import { createCalendarTimeZone, searchNatalTransitSchedule, serializeCalendar } from "../src/index.js";
import type { NatalTransitScheduleRequest, ScheduleEvent } from "../src/index.js";
import type { JsonObject } from "../src/types.js";

// Invented birth and schedules. Engine parity and the golden file are regression
// checks, not independent astronomical accuracy or search completeness evidence.
const request: NatalTransitScheduleRequest = {
  namespace: "synthetic-natal-transit.calendar.invalid",
  body: "Sun", natalBody: "Sun", clock: "utc",
  startUtc: "2026-02-01T00:00:00.000Z", endUtc: "2026-02-06T00:00:00.000Z",
  stepMs: 3_600_000, maxEvaluations: 100_000,
  policy: { aspects: [{ id: "conjunction", angleDegrees: 0 }] },
  natal: {
    id: "synthetic-chart-a", synthetic: true,
    birth: {
      utc: "2001-02-03T04:05:06.789Z", timeScale: "utc",
      latitude: 12.5, longitude: 34.25, houseSystem: "whole", timeKnown: true
    }
  }
};
const dtstamp = "2026-01-01T00:00:00.000Z";
const dayMs = 86_400_000;
const complete = (input: NatalTransitScheduleRequest = request) => {
  const result = searchNatalTransitSchedule(input);
  expect(result.status).toBe("complete");
  if (result.status !== "complete") throw new Error(result.reason);
  return result;
};
const eventKey = (event: ScheduleEvent) => `${event.receipt.utc}/${event.receipt.aspect!.angleDegrees}`;

describe("natal transit schedules from the pinned aspect search and parent engine", () => {
  it("uses the natal body's fixed longitude and retains both full engine receipts", () => {
    const result = complete();
    expect(result.events).toHaveLength(1);
    const event = result.events[0]!;
    const source = event.receipt.source!;
    const natal = natalChart(request.natal.birth);
    const target = natal.bodies.find(body => body.body === request.natalBody)!;
    expect(target).toBeDefined();
    const occurrence = event.identity!.occurrence;
    expect(occurrence.scheme).toBe("utc-day-ordinal/1");
    if (occurrence.scheme !== "utc-day-ordinal/1") throw new Error("Expected a canonical-day identity.");
    const context = new EvaluationContext({
      startMs: Date.parse(occurrence.startUtc),
      endMs: Date.parse(occurrence.startUtc) + 2 * dayMs, clock: "utc"
    }, { maxEvaluations: request.maxEvaluations });
    const upstream = searchExactAspects(context, request.body,
      { kind: "fixed", longitude: target.lon }, request.policy, { stepMs: request.stepMs });
    expect(upstream.status).toBe("complete");
    expect(source.event).toEqual(upstream.events.find(item => item.atMs === Date.parse(event.receipt.utc)));
    expect((source.event as JsonObject).target).toEqual({ kind: "fixed", longitude: target.lon });
    expect(source.adapter).toBe("calendar-natal-transit/1");
    expect(source.policy).toEqual(request.policy);
    expect(source.natal).toEqual({
      chartId: request.natal.id, synthetic: true,
      calculation: createNatalEnvelope(natal, { sourceInstant: request.natal.birth.utc })
    });
    const calculation = calc({ body: request.body, time: event.receipt.utc, flags: { speeds: false } });
    expect(calculation.status).toBe("ok");
    if (calculation.status !== "ok") throw new Error("Synthetic fixture calculation refused.");
    expect(source.calculation).toEqual(calculation.receipt);
    expect(event.receipt.engine).toEqual(calculation.receipt.engine);
    expect(event.receipt.eventType).toBe("natal-transit");
    expect(event.receipt.bodies).toEqual([request.body, request.natalBody]);
    expect(event.receipt.aspect).toEqual({ name: "conjunction", angleDegrees: 0 });
    expect(event.receipt.orbDegrees).toBe(Math.abs((source.event as JsonObject).residualDegrees as number));
    expect(event.identity!.chartIds).toEqual([request.natal.id]);
    expect(complete().events).toEqual(result.events);
  });

  it("matches the small engine-generated UTC golden feed byte for byte", () => {
    const golden = readFileSync(new URL("./fixtures/synthetic-natal-transits.ics", import.meta.url));
    expect(Buffer.from(serializeCalendar(complete().events, { dtstamp }))).toEqual(golden);
    expect(golden.toString("utf8")).not.toMatch(/(?<!\r)\n|\r(?!\n)/u);
    for (const line of golden.toString("utf8").split("\r\n")) {
      expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);
    }
  });

  it("round-trips UTC and TZID dates, exact receipts, aspects and stable UIDs", () => {
    const result = complete();
    const timeZone = createCalendarTimeZone("Asia/Bangkok", request.startUtc, request.endUtc);
    const expected = result.events[0]!;
    for (const options of [{ dtstamp }, { dtstamp, timeZone }]) {
      const feed = new ICAL.Component(ICAL.parse(serializeCalendar(result.events, options)));
      const zone = feed.getFirstSubcomponent("vtimezone");
      const component = feed.getFirstSubcomponent("vevent")!;
      const parsed = new ICAL.Event(component);
      if (zone) parsed.startDate.zone = new ICAL.Timezone(zone);
      expect(component.getFirstProperty("dtstart")!.getParameter("tzid"))
        .toBe("timeZone" in options ? "Asia/Bangkok" : undefined);
      expect(parsed.uid).toBe(expected.uid);
      expect(parsed.summary).toBe(expected.summary);
      expect(parsed.startDate.toJSDate().toISOString())
        .toBe(expected.receipt.utc.replace(/\.\d{3}Z$/u, ".000Z"));
      expect(JSON.parse(parsed.description)).toEqual(expected.receipt);
      expect(component.getFirstPropertyValue("x-zodiacs-utc")).toBe(expected.receipt.utc);
      expect(component.getFirstPropertyValue("x-zodiacs-event-type")).toBe("natal-transit");
      expect(JSON.parse(component.getFirstPropertyValue("x-zodiacs-bodies") as string)).toEqual(["Sun", "Sun"]);
      expect(JSON.parse(component.getFirstPropertyValue("x-zodiacs-aspect") as string)).toEqual(expected.receipt.aspect);
      expect(JSON.parse(component.getFirstPropertyValue("x-zodiacs-orb-degrees") as string))
        .toBe(expected.receipt.orbDegrees);
    }
  });

  it("keeps all events and UIDs across regeneration, overlapping windows and exact-instant partitions", () => {
    const input: NatalTransitScheduleRequest = {
      ...request, body: "Moon", endUtc: "2026-02-28T00:00:00.000Z",
      policy: { aspects: [{ id: "square", angleDegrees: 90 }, { id: "custom", angleDegrees: 37.5 }] }
    };
    const whole = complete(input);
    expect(whole.events.length).toBeGreaterThan(2);
    expect(complete(input).events).toEqual(whole.events);
    expect(new Set(whole.events.map(event => event.uid)).size).toBe(whole.events.length);
    expect(new Set(whole.events.map(event => event.receipt.aspect!.angleDegrees))).toEqual(new Set([90, 37.5]));
    const split = whole.events[1]!.receipt.utc;
    const left = complete({ ...input, endUtc: split });
    const right = complete({ ...input, startUtc: split });
    expect([...left.events, ...right.events]).toEqual(whole.events);
    const startUtc = "2026-02-05T06:00:00.000Z";
    const endUtc = "2026-02-23T12:00:00.000Z";
    expect(complete({ ...input, startUtc, endUtc }).events).toEqual(whole.events.filter(event =>
      event.receipt.utc > startUtc && event.receipt.utc <= endUtc));
    const branches = whole.events.map(event => (event.receipt.source!.event as JsonObject).relativeLongitude);
    expect(new Set(branches)).toEqual(new Set([90, 270, 37.5, 322.5]));
  });

  it("keeps label and policy-order changes out of UIDs while preserving them in receipts", () => {
    const input: NatalTransitScheduleRequest = {
      ...request, body: "Moon", endUtc: "2026-02-28T00:00:00.000Z",
      policy: { aspects: [{ id: "square", angleDegrees: 90 }, { id: "custom", angleDegrees: 37.5 }] }
    };
    const original = complete(input).events;
    const relabelled = complete({
      ...input, policy: { aspects: [{ id: "renamedCustom", angleDegrees: 37.5 }, { id: "renamedSquare", angleDegrees: 90 }] }
    }).events;
    expect(relabelled.map(event => [eventKey(event), event.uid]))
      .toEqual(original.map(event => [eventKey(event), event.uid]));
    expect(relabelled.every(event => event.receipt.aspect!.name.startsWith("renamed"))).toBe(true);
    const changedPolicy = complete({ ...input, policy: { aspects: [{ id: "square", angleDegrees: 90 }] } }).events;
    expect(changedPolicy.length).toBeGreaterThan(0);
    for (const event of changedPolicy) {
      expect(event.uid).not.toBe(original.find(item => eventKey(item) === eventKey(event))!.uid);
    }
  });

  it("includes chart configuration and durable chart ID in event identities", () => {
    const original = complete().events[0]!;
    const renamedChart = complete({ ...request, natal: { ...request.natal, id: "synthetic-chart-b" } }).events[0]!;
    expect(renamedChart.receipt.utc).toBe(original.receipt.utc);
    expect(renamedChart.uid).not.toBe(original.uid);
    const changedPlace = complete({
      ...request, natal: { ...request.natal, birth: { ...request.natal.birth, longitude: 35 } }
    }).events[0]!;
    expect(changedPlace.receipt.utc).toBe(original.receipt.utc);
    expect(changedPlace.uid).not.toBe(original.uid);
    const { houseSystem: _houseSystem, timeKnown: _timeKnown, ...withoutDefaults } = request.natal.birth;
    const defaulted = complete({ ...request, natal: { ...request.natal, birth: withoutDefaults } }).events[0]!;
    expect(defaulted.uid).toBe(original.uid);
  });

  it("preserves an unknown birth time and pinned natal DeltaT without changing the moving clock", () => {
    const input: NatalTransitScheduleRequest = {
      ...request, natal: { ...request.natal, birth: { ...request.natal.birth, timeKnown: false, deltaT: 75 } }
    };
    const event = complete(input).events[0]!;
    const chart = natalChart(input.natal.birth);
    expect(chart.input.utc.toISOString()).toBe(input.natal.birth.utc);
    expect(chart.houses).toBeNull();
    expect(chart.flags).toContain("no-time");
    expect(chart.deltaT).toMatchObject({ seconds: 75, model: "pinned" });
    const envelope = createNatalEnvelope(chart, { sourceInstant: input.natal.birth.utc });
    expect((event.receipt.source!.natal as JsonObject).calculation).toEqual(envelope);
    expect(parseNatalEnvelope(serializeNatalEnvelope(envelope)).ok).toBe(true);
    const moving = calc({ body: input.body, time: event.receipt.utc, flags: { speeds: false } });
    if (moving.status !== "ok") throw new Error("Synthetic moving calculation refused.");
    expect(event.receipt.source!.calculation).toEqual(moving.receipt);
    expect(event.uid).not.toBe(complete().events[0]!.uid);
  });
});
