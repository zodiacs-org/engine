import { readFileSync } from "node:fs";
import ICAL from "ical.js";
import { describe, expect, it } from "vitest";
import { createCalendarTimeZone, serializeCalendar } from "../src/index.js";
import type { CalendarTimeZone, ScheduleEvent } from "../src/types.js";
import { syntheticEvents, fixtureOptions } from "./fixtures/synthetic-events.js";
import { identifiedSyntheticEvents } from "./fixtures/synthetic-identities.js";
import { syntheticTimezoneEvents, timezoneStart, timezoneEnd } from "./fixtures/synthetic-timezone.js";

const zone = (tzid = "America/New_York") => createCalendarTimeZone(tzid, timezoneStart, timezoneEnd);
const parse = (text: string) => new ICAL.Component(ICAL.parse(text));
const second = (utc: string) => utc.replace(/\.\d{3}Z$/u, ".000Z");
const at = (utc: string, endUtc?: string): ScheduleEvent => ({
  ...syntheticEvents[0]!, uid: `${utc}@calendar.invalid`,
  receipt: { ...syntheticEvents[0]!.receipt, utc },
  ...(endUtc === undefined ? {} : { endUtc })
});

function roundTrip(events: readonly ScheduleEvent[], timeZone: CalendarTimeZone) {
  const text = serializeCalendar(events, { ...fixtureOptions, timeZone });
  const calendar = parse(text);
  const components = calendar.getAllSubcomponents("vevent");
  expect(components).toHaveLength(events.length);
  components.forEach((component, index) => {
    const original = events[index]!;
    const parsed = new ICAL.Event(component);
    expect(parsed.startDate.toJSDate().toISOString()).toBe(second(original.receipt.utc));
    expect(parsed.endDate.toJSDate().toISOString()).toBe(second(original.endUtc ?? original.receipt.utc));
    expect(parsed.uid).toBe(original.uid);
    expect(JSON.parse(parsed.description)).toEqual(original.receipt);
    expect(component.getFirstPropertyValue("x-zodiacs-utc")).toBe(original.receipt.utc);
    expect(component.getFirstPropertyValue("dtstamp")!.toString()).toBe("2026-01-01T00:00:00Z");
    expect(component.getFirstPropertyValue("x-zodiacs-tzid")).toBe(timeZone.tzid);
    expect(component.getFirstPropertyValue("x-zodiacs-tzdb")).toBe("2026e");
    expect(component.getFirstPropertyValue("x-zodiacs-tzdb-form")).toBe("rearguard");
  });
  return { text, calendar, components };
}

describe("timezone calendar export", () => {
  it("matches the reviewed timezone golden bytes and preserves receipts through an independent parser", () => {
    const { text, calendar, components } = roundTrip(syntheticTimezoneEvents, zone());
    const golden = readFileSync(new URL("./fixtures/synthetic-timezone.ics", import.meta.url));
    expect(Buffer.from(text)).toEqual(golden);
    expect(text).not.toMatch(/(?<!\r)\n|\r(?!\n)/u);
    for (const line of text.split("\r\n")) expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);
    expect(calendar.getAllSubcomponents("vtimezone")).toHaveLength(1);
    expect(components[0]!.getFirstProperty("dtstart")!.getParameter("tzid")).toBe("America/New_York");
    expect(components[0]!.getFirstProperty("dtend")!.getParameter("tzid")).toBe("America/New_York");
    expect(components[0]!.getFirstPropertyValue("dtstart")!.toString()).toBe("2026-03-08T01:59:59");
    expect(components[0]!.getFirstPropertyValue("dtend")!.toString()).toBe("2026-03-08T03:00:01");
    expect(new ICAL.Event(components[0]!).duration.toSeconds()).toBe(2);
  });

  it("writes a transition onset on the pre-transition clock and a finite offset baseline", () => {
    const { calendar } = roundTrip(syntheticTimezoneEvents, zone());
    const definition = calendar.getFirstSubcomponent("vtimezone")!;
    expect(definition.getFirstPropertyValue("tzid")).toBe("America/New_York");
    const observances = definition.getAllSubcomponents();
    expect(observances.map((item) => item.name)).toEqual(["standard", "daylight", "standard"]);
    expect(observances.map((item) => item.getFirstPropertyValue("dtstart")!.toString()))
      .toEqual(["2026-03-06T01:59:59", "2026-03-08T02:00:00", "2026-11-01T02:00:00"]);
    expect(observances.map((item) => item.getFirstPropertyValue("tzoffsetfrom")!.toString()))
      .toEqual(["-05:00", "-05:00", "-04:00"]);
    expect(observances.map((item) => item.getFirstPropertyValue("tzoffsetto")!.toString()))
      .toEqual(["-05:00", "-04:00", "-05:00"]);
    expect(definition.getFirstPropertyValue("x-zodiacs-coverage-start-utc")).toBe(timezoneStart);
    expect(definition.getFirstPropertyValue("x-zodiacs-coverage-end-utc")).toBe(timezoneEnd);
    expect(observances.every((item) => !item.hasProperty("rrule"))).toBe(true);
  });

  it("uses UTC for both occurrences of a repeated local time including exact fold edges", () => {
    const instants = [
      "2026-11-01T04:59:59.999Z", "2026-11-01T05:00:00.000Z",
      "2026-11-01T05:59:59.999Z", "2026-11-01T06:00:00.000Z",
      "2026-11-01T06:59:59.999Z", "2026-11-01T07:00:00.000Z"
    ];
    const { components } = roundTrip(instants.map((utc) => at(utc)), zone());
    expect(components.map((item) => item.getFirstProperty("dtstart")!.getParameter("tzid")))
      .toEqual(["America/New_York", undefined, undefined, undefined, undefined, "America/New_York"]);
    for (const component of components.slice(1, -1)) {
      expect(component.getFirstPropertyValue("x-zodiacs-time-fallback")).toBe("ambiguous-local-time");
    }
  });

  it.each([
    ["2026-11-01T04:59:59.000Z", "2026-11-01T06:15:00.999Z"],
    ["2026-11-01T05:45:00.000Z", "2026-11-01T07:00:00.000Z"],
    ["2026-11-01T05:45:00.000Z", "2026-11-01T06:15:00.000Z"]
  ])("keeps both interval endpoints in UTC when either folds: %s to %s", (start, end) => {
    const { components } = roundTrip([at(start, end)], zone());
    for (const name of ["dtstart", "dtend"]) {
      expect(components[0]!.getFirstProperty(name)!.getParameter("tzid")).toBeUndefined();
    }
    expect(components[0]!.getFirstPropertyValue("x-zodiacs-end-utc")).toBe(end);
  });

  it.each([
    ["Asia/Kathmandu", "2026-07-01T18:30:00.123Z", "2026-07-02T00:15:00", "+05:45"],
    ["Asia/Kolkata", "2026-07-01T00:00:00.000Z", "2026-07-01T05:30:00", "+05:30"],
    ["Etc/GMT+3", "2026-07-01T00:00:00.000Z", "2026-06-30T21:00:00", "-03:00"],
    ["UTC", "2026-07-01T00:00:00.000Z", "2026-07-01T00:00:00", "+00:00"]
  ])("embeds a fixed offset for %s", (tzid, utc, wall, offset) => {
    const { calendar, components } = roundTrip([at(utc)], zone(tzid));
    const definition = calendar.getFirstSubcomponent("vtimezone")!;
    expect(definition.getAllSubcomponents()).toHaveLength(1);
    expect(definition.getFirstSubcomponent()!.getFirstPropertyValue("tzoffsetto")!.toString()).toBe(offset);
    expect(components[0]!.getFirstPropertyValue("dtstart")!.toString()).toBe(wall);
  });

  it("supports a southern-hemisphere half-hour fold and gap", () => {
    const instants = [
      "2026-04-04T14:29:59.000Z", "2026-04-04T14:30:00.000Z",
      "2026-04-04T15:00:00.000Z", "2026-04-04T15:30:00.000Z",
      "2026-10-03T15:29:59.000Z", "2026-10-03T15:30:00.000Z"
    ];
    const { components } = roundTrip(instants.map((utc) => at(utc)), zone("Australia/Lord_Howe"));
    expect(components[1]!.getFirstPropertyValue("x-zodiacs-time-fallback")).toBe("ambiguous-local-time");
    expect(components[2]!.getFirstPropertyValue("x-zodiacs-time-fallback")).toBe("ambiguous-local-time");
    expect(components[3]!.getFirstPropertyValue("dtstart")!.toString()).toBe("2026-04-05T02:00:00");
    expect(components[4]!.getFirstPropertyValue("dtstart")!.toString()).toBe("2026-10-04T01:59:59");
    expect(components[5]!.getFirstPropertyValue("dtstart")!.toString()).toBe("2026-10-04T02:30:00");
  });

  it("pads a single instant so that a fold remains detected at either coverage boundary", () => {
    for (const utc of ["2026-11-01T05:30:00.000Z", "2026-11-01T06:30:00.000Z"]) {
      const timeZone = createCalendarTimeZone("America/New_York", utc, utc);
      const { components } = roundTrip([at(utc)], timeZone);
      expect(components[0]!.getFirstPropertyValue("x-zodiacs-time-fallback")).toBe("ambiguous-local-time");
    }
  });

  it("round-trips a daylight-only baseline and summer dates near the future coverage limit", () => {
    for (const utc of ["2026-07-01T00:00:00.000Z", "2499-07-01T00:00:00.000Z"]) {
      const timeZone = createCalendarTimeZone("America/New_York", utc, utc);
      const { calendar, components } = roundTrip([at(utc)], timeZone);
      expect(calendar.getFirstSubcomponent("vtimezone")!.getAllSubcomponents().map((item) => item.name))
        .toEqual(["daylight"]);
      expect(components[0]!.getFirstPropertyValue("dtstart")!.toString()).toBe(utc.slice(0, 4) + "-06-30T20:00:00");
    }
  });

  it("preserves UIDs and input order across timezone display settings and one-shot iterables", () => {
    const utc = syntheticEvents[0]!.receipt.utc;
    const timeZone = createCalendarTimeZone("Asia/Kathmandu", utc, syntheticEvents[1]!.endUtc!);
    function* once() { yield* identifiedSyntheticEvents; }
    expect(serializeCalendar(once(), { ...fixtureOptions, timeZone }))
      .toBe(serializeCalendar(identifiedSyntheticEvents, { ...fixtureOptions, timeZone }));
    const local = roundTrip(identifiedSyntheticEvents, timeZone).components;
    const universal = parse(serializeCalendar(identifiedSyntheticEvents, fixtureOptions)).getAllSubcomponents("vevent");
    expect(local.map((item) => item.getFirstPropertyValue("uid")))
      .toEqual(universal.map((item) => item.getFirstPropertyValue("uid")));
  });
});

describe("timezone input validation", () => {
  it.each(["", " America/New_York", "America/New_York ", "america/new_york", "SYSTEM", "+05:30",
    "No/Such_Zone", "UTC;VALUE=DATE", "UTC\r\nBEGIN:VEVENT", "UTC\"", null, 42])(
    "refuses invalid zone identifiers: %j", (tzid) => {
      expect(() => zone(tzid as string)).toThrow(RangeError);
    }
  );

  it.each([
    ["2026-11-02T00:00:00.000Z", timezoneEnd],
    ["2026-02-30T00:00:00.000Z", timezoneEnd],
    ["2026-03-08T02:30:00.000", timezoneEnd],
    ["0099-07-01T00:00:00.000Z", timezoneEnd],
    ["0100-01-03T23:59:59.999Z", timezoneEnd],
    [timezoneStart, "2499-12-30T00:00:00.000Z"],
    [timezoneStart, "2500-07-01T00:00:00.000Z"]
  ])("refuses malformed, reversed or unsupported coverage: %s to %s", (start, end) => {
    expect(() => createCalendarTimeZone("America/New_York", start, end)).toThrow(RangeError);
  });

  it("requires factory projections and validates every endpoint against exact inclusive coverage", () => {
    const timeZone = zone();
    expect(Object.isFrozen(timeZone)).toBe(true);
    expect(() => serializeCalendar([at(timezoneStart)], { ...fixtureOptions, timeZone: { ...timeZone } })).toThrow(RangeError);
    expect(() => serializeCalendar([at("2026-03-08T06:59:58.999Z")], { ...fixtureOptions, timeZone })).toThrow(RangeError);
    expect(() => serializeCalendar([at(timezoneStart, "2026-11-01T07:00:00.001Z")], { ...fixtureOptions, timeZone })).toThrow(RangeError);
    roundTrip([at(timezoneStart, timezoneEnd)], timeZone);
  });

  it("supports the inclusive coverage limits without calendar-year overflow", () => {
    for (const utc of ["0100-01-04T00:00:00.000Z", "2499-12-29T23:59:59.999Z"]) {
      const timeZone = createCalendarTimeZone("Etc/GMT+3", utc, utc);
      roundTrip([at(utc)], timeZone);
    }
  });

  it("still rejects reversed or subsecond intervals before formatting local times", () => {
    const timeZone = zone();
    for (const end of ["2026-07-01T11:59:59.999Z", "2026-07-01T12:00:00.999Z"]) {
      expect(() => serializeCalendar([at("2026-07-01T12:00:00.123Z", end)], { ...fixtureOptions, timeZone })).toThrow(RangeError);
    }
  });
});
