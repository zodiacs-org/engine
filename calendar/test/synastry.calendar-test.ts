import { readFileSync } from "node:fs";
import ICAL from "ical.js";
import { describe, expect, it } from "vitest";
import { calc } from "../../src/calc.js";
import { natalChart, progressedBodies, progressedInstant, PROGRESSION_DAYS_PER_YEAR } from "../../src/index.js";
import { createNatalEnvelope, parseNatalEnvelope, serializeNatalEnvelope } from "../../src/receipt.js";
import { searchExactAspects } from "../.cache/events-source/events/src/aspects.js";
import { EvaluationContext } from "../.cache/events-source/events/src/context.js";
import { analyzeStaticSynastry, createCalendarTimeZone, searchSynastrySchedule, serializeCalendar } from "../src/index.js";
import type { JsonObject, SynastryScheduleRequest } from "../src/index.js";
import { syntheticSynastryRequest as request, syntheticSynastryDtstamp as dtstamp } from "./fixtures/synthetic-synastry.js";

// Engine delegation and wire-format regression only, not astronomical accuracy.
const dayMs = 86_400_000;
const complete = (input: SynastryScheduleRequest = request) => {
  const result = searchSynastrySchedule(input);
  expect(result.status).toBe("complete");
  if (result.status !== "complete") throw new Error(result.reason);
  return result;
};

describe("explicit progressed-to-natal synastry schedule", () => {
  it("delegates mapping and search, preserving two natal receipts and a separate progressed epoch", () => {
    const result = complete();
    expect(result.events).toHaveLength(1);
    const event = result.events[0]!;
    const source = event.receipt.source!;
    const firstChart = natalChart(request.first.birth);
    const secondChart = natalChart(request.second.birth);
    const progressedUtc = progressedInstant(request.first.birth.utc, event.receipt.utc).toISOString();
    expect(progressedUtc).toBe(request.second.birth.utc);
    expect(progressedUtc).not.toBe(event.receipt.utc);
    const target = secondChart.bodies.find(body => body.body === request.secondBody)!.lon;
    const occurrence = event.identity!.occurrence;
    if (occurrence.scheme !== "utc-day-ordinal/1") throw new Error("Expected day identity.");
    const context = new EvaluationContext({ startMs: Date.parse(occurrence.startUtc),
      endMs: Date.parse(occurrence.startUtc) + 2 * dayMs, clock: "utc"
    }, { maxEvaluations: request.maxEvaluations });
    const upstream = searchExactAspects(context, request.firstBody,
      { kind: "fixed", longitude: target }, request.policy, { stepMs: request.stepMs }, {
        context, sample: (body, atMs) => context.evaluate(() => ({
          longitude: progressedBodies(request.first.birth.utc, atMs).find(row => row.body === body)!.lon
        }))
      });
    expect(upstream.status).toBe("complete");
    expect(source.event).toEqual(upstream.events.find(item => item.atMs === Date.parse(event.receipt.utc)));
    expect(source.adapter).toBe("calendar-synastry/1");
    expect(source.convention).toBe(request.convention);
    expect(source.policy).toEqual(request.policy);
    expect(source.first).toEqual({ chartId: request.first.id, synthetic: true,
      calculation: createNatalEnvelope(firstChart, { sourceInstant: request.first.birth.utc }) });
    expect(source.second).toEqual({ chartId: request.second.id, synthetic: true,
      calculation: createNatalEnvelope(secondChart, { sourceInstant: request.second.birth.utc }) });
    for (const chart of [firstChart, secondChart]) {
      expect(parseNatalEnvelope(serializeNatalEnvelope(createNatalEnvelope(chart))).ok).toBe(true);
    }
    const position = calc({ body: request.firstBody, time: progressedUtc, flags: { speeds: false } });
    if (position.status !== "ok") throw new Error("Synthetic progressed calculation refused.");
    expect(source.calculation).toEqual(position.receipt);
    expect(source.progression).toEqual({
      method: "engine.progressedInstant", daysPerYear: PROGRESSION_DAYS_PER_YEAR,
      birthUtc: request.first.birth.utc, scheduleUtc: event.receipt.utc, calculationUtc: progressedUtc,
      deltaT: "engine-default-at-progressed-instant", precision: "integer-millisecond-progressed-epoch"
    });
    expect(event.receipt.engine).toEqual(position.receipt.engine);
    expect(event.receipt.bodies).toEqual([request.firstBody, request.secondBody]);
    expect(event.receipt.eventType).toBe("synastry-exact");
    expect(event.receipt.orbDegrees).toBe(Math.abs((source.event as JsonObject).residualDegrees as number));
    expect(event.identity!.chartIds).toEqual([request.first.id, request.second.id]);
    expect(event.identity!.definition.id).toBe(request.convention);
    const staticPair = analyzeStaticSynastry({ first: request.first, second: request.second });
    expect(staticPair.timing).toBe("undated");
    expect(staticPair.exactAspects.find(aspect => aspect.a === "Sun" && aspect.b === "Sun")).toBeUndefined();
  });

  it("matches the small golden feed and round-trips UTC and TZID starts, identities and receipts", () => {
    const result = complete();
    const golden = readFileSync(new URL("./fixtures/synthetic-synastry.ics", import.meta.url));
    expect(Buffer.from(serializeCalendar(result.events, { dtstamp }))).toEqual(golden);
    expect(golden.toString("utf8")).not.toMatch(/(?<!\r)\n|\r(?!\n)/u);
    for (const line of golden.toString("utf8").split("\r\n")) {
      expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);
    }
    const timeZone = createCalendarTimeZone("Asia/Bangkok", request.startUtc, request.endUtc);
    const expected = result.events[0]!;
    for (const options of [{ dtstamp }, { dtstamp, timeZone }]) {
      const feed = new ICAL.Component(ICAL.parse(serializeCalendar(result.events, options)));
      const component = feed.getFirstSubcomponent("vevent")!;
      const parsed = new ICAL.Event(component);
      const zone = feed.getFirstSubcomponent("vtimezone");
      if (zone) parsed.startDate.zone = new ICAL.Timezone(zone);
      expect(component.getFirstProperty("dtstart")!.getParameter("tzid"))
        .toBe("timeZone" in options ? "Asia/Bangkok" : undefined);
      expect(parsed.uid).toBe(expected.uid);
      expect(parsed.summary).toBe(expected.summary);
      expect(parsed.startDate.toJSDate().toISOString()).toBe(expected.receipt.utc.replace(/\.\d{3}Z$/u, ".000Z"));
      expect(JSON.parse(parsed.description)).toEqual(expected.receipt);
      expect(component.getFirstPropertyValue("x-zodiacs-utc")).toBe(expected.receipt.utc);
      expect(component.getFirstPropertyValue("x-zodiacs-event-type")).toBe("synastry-exact");
      expect(JSON.parse(component.getFirstPropertyValue("x-zodiacs-bodies") as string)).toEqual(["Sun", "Sun"]);
      expect(JSON.parse(component.getFirstPropertyValue("x-zodiacs-aspect") as string)).toEqual(expected.receipt.aspect);
      expect(JSON.parse(component.getFirstPropertyValue("x-zodiacs-identity") as string)).toEqual(expected.identity);
      expect(JSON.parse(component.getFirstPropertyValue("x-zodiacs-orb-degrees") as string)).toBe(expected.receipt.orbDegrees);
    }
  });

  it("retains events and UIDs across repeat requests, overlaps and exact-instant partitions", () => {
    const whole = complete();
    expect(complete().events).toEqual(whole.events);
    const split = whole.events[0]!.receipt.utc;
    expect([...complete({ ...request, endUtc: split }).events,
      ...complete({ ...request, startUtc: split }).events]).toEqual(whole.events);
    expect(complete({ ...request, startUtc: "2026-02-02T12:00:00.000Z",
      endUtc: "2026-02-04T12:00:00.000Z" }).events).toEqual(whole.events);
    expect(complete({ ...request, endUtc: "2026-02-02T00:00:00.000Z" }).events).toEqual([]);
  });

  it("includes both ordered chart configurations while normalizing defaults and excluding labels", () => {
    const original = complete().events[0]!;
    for (const participant of ["first", "second"] as const) {
      const changedId = complete({ ...request, [participant]: { ...request[participant], id: "synthetic-other" } }).events[0]!;
      expect(changedId.receipt.utc).toBe(original.receipt.utc);
      expect(changedId.uid).not.toBe(original.uid);
      const changedPlace = complete({ ...request, [participant]: { ...request[participant],
        birth: { ...request[participant].birth, longitude: 40 }
      } }).events[0]!;
      expect(changedPlace.receipt.utc).toBe(original.receipt.utc);
      expect(changedPlace.uid).not.toBe(original.uid);
      expect(complete({ ...request, [participant]: { ...request[participant],
        birth: { ...request[participant].birth, houseSystem: "whole", timeKnown: true }
      } }).events[0]!.uid).toBe(original.uid);
    }
    const swappedIds = complete({ ...request,
      first: { ...request.first, id: request.second.id }, second: { ...request.second, id: request.first.id }
    }).events[0]!;
    expect(swappedIds.uid).not.toBe(original.uid);
    expect(swappedIds.identity!.chartIds).toEqual([request.second.id, request.first.id]);
    const relabelled = complete({ ...request, policy: { aspects: [{ id: "renamed", angleDegrees: 0 }] } }).events[0]!;
    expect(relabelled.uid).toBe(original.uid);
    expect(relabelled.receipt.aspect!.name).toBe("renamed");
    const policy = { aspects: [{ id: "renamed", angleDegrees: 0 }, { id: "opposition", angleDegrees: 180 }] };
    const expanded = complete({ ...request, policy }).events[0]!;
    expect(expanded.uid).not.toBe(original.uid);
    expect(complete({ ...request, policy: { aspects: [...policy.aspects].reverse() } }).events[0]!.uid).toBe(expanded.uid);
  });

  it("preserves each natal Delta T pin and unknown time while progressing on the default engine clock", () => {
    const unpinned = complete().events[0]!;
    const pinnedFirst: SynastryScheduleRequest = { ...request, first: { ...request.first,
      birth: { ...request.first.birth, timeKnown: false, deltaT: 75 }
    } };
    const event = complete(pinnedFirst).events[0]!;
    expect(event.receipt.utc).toBe(unpinned.receipt.utc);
    expect(event.uid).not.toBe(unpinned.uid);
    expect(event.receipt.source!.calculation).toEqual(unpinned.receipt.source!.calculation);
    const first = createNatalEnvelope(natalChart(pinnedFirst.first.birth), { sourceInstant: pinnedFirst.first.birth.utc });
    expect((event.receipt.source!.first as JsonObject).calculation).toEqual(first);
    expect(first.result.houses).toBeNull();
    expect(first.result.deltaT).toMatchObject({ seconds: 75, model: "pinned" });
    const pinnedSecond: SynastryScheduleRequest = { ...request, second: { ...request.second,
      birth: { ...request.second.birth, timeKnown: false, deltaT: 75 }
    } };
    const secondEvent = complete(pinnedSecond).events[0]!;
    const second = createNatalEnvelope(natalChart(pinnedSecond.second.birth), { sourceInstant: pinnedSecond.second.birth.utc });
    expect((secondEvent.receipt.source!.second as JsonObject).calculation).toEqual(second);
    expect((secondEvent.receipt.source!.event as JsonObject).target).toEqual({ kind: "fixed",
      longitude: second.result.bodies.find(body => body.body === request.secondBody)!.lon });
    expect(secondEvent.uid).not.toBe(unpinned.uid);
  });
});
