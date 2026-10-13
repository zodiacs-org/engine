import ICAL from "ical.js";
import { describe, expect, it } from "vitest";
import { createCalendarTimeZone, serializeCalendar } from "../src/index.js";
import type { ScheduleEvent } from "../src/types.js";
import { fixtureOptions, syntheticEvents } from "./fixtures/synthetic-events.js";

// The event receipts are invented formatting records. Expected civil offsets
// below come from the public-domain IANA tzdb 2026e zone/rule definitions:
// https://data.iana.org/time-zones/tzdb-2026e/australasia (Pacific/Apia, WS)
// https://data.iana.org/time-zones/tzdb-2026e/asia (Asia/Kathmandu)
// https://data.iana.org/time-zones/tzdb-2026e/europe (Europe/Paris, Dublin, Eire)
// https://data.iana.org/time-zones/tzdb-2026e/africa (Africa/Casablanca, Morocco)
// These test timezone interoperability, not astronomical accuracy or atlas law.
const at = (utc: string): ScheduleEvent => ({
  ...syntheticEvents[0]!,
  uid: `synthetic-history-${utc}@calendar.invalid`,
  receipt: { ...syntheticEvents[0]!.receipt, utc }
});

function parseInZone(tzid: string, startUtc: string, endUtc: string, events: readonly ScheduleEvent[]) {
  const timeZone = createCalendarTimeZone(tzid, startUtc, endUtc);
  const value = serializeCalendar(events, { ...fixtureOptions, timeZone });
  const calendar = new ICAL.Component(ICAL.parse(value));
  const components = calendar.getAllSubcomponents("vevent");
  return { calendar, components, value };
}

function assertLocalEvent(component: ICAL.Component, tzid: string, utc: string, local: string) {
  const event = new ICAL.Event(component);
  expect(component.getFirstProperty("dtstart")!.getParameter("tzid")).toBe(tzid);
  // Component-local resolution reads the emitted VTIMEZONE; no global timezone
  // registration, host Intl conversion, or exporter projection is used here.
  expect(event.startDate.zone.tzid).toBe(tzid);
  expect(event.startDate.toString()).toBe(local);
  expect(event.startDate.toJSDate().toISOString()).toBe(utc);
  expect(component.getFirstPropertyValue("x-zodiacs-utc")).toBe(utc);
  expect(JSON.parse(event.description).utc).toBe(utc);
  expect(component.hasProperty("x-zodiacs-time-fallback")).toBe(false);
}

function assertObservance(
  calendar: ICAL.Component,
  name: "standard" | "daylight",
  beforeLocal: string,
  offsetFromSeconds: number,
  offsetToSeconds: number
) {
  const zones = calendar.getAllSubcomponents("vtimezone");
  expect(zones).toHaveLength(1);
  const observance = zones[0]!.getAllSubcomponents().find((component) =>
    component.getFirstPropertyValue("dtstart")?.toString() === beforeLocal
  );
  expect(observance, `Missing observance at ${beforeLocal}`).toBeDefined();
  expect(observance!.name).toBe(name);
  const offsetFrom = observance!.getFirstPropertyValue("tzoffsetfrom");
  const offsetTo = observance!.getFirstPropertyValue("tzoffsetto");
  expect(offsetFrom).toBeInstanceOf(ICAL.UtcOffset);
  expect(offsetTo).toBeInstanceOf(ICAL.UtcOffset);
  expect((offsetFrom as ICAL.UtcOffset).toSeconds()).toBe(offsetFromSeconds);
  expect((offsetTo as ICAL.UtcOffset).toSeconds()).toBe(offsetToSeconds);
}

describe("historical timezone serialization through an independent calendar parser", () => {
  it("preserves instants across Apia's skipped civil day", () => {
    const tzid = "Pacific/Apia";
    const instants = ["2011-12-30T09:59:59.000Z", "2011-12-30T10:00:00.000Z"];
    const { calendar, components } = parseInZone(
      tzid, "2011-12-29T00:00:00.000Z", "2012-01-01T00:00:00.000Z", instants.map(at)
    );
    assertLocalEvent(components[0]!, tzid, instants[0]!, "2011-12-29T23:59:59");
    assertLocalEvent(components[1]!, tzid, instants[1]!, "2011-12-31T00:00:00");
    // This is a date-line change during daylight time, not a DST start.
    assertObservance(calendar, "daylight", "2011-12-30T00:00:00", -10 * 3600, 14 * 3600);
    expect(new ICAL.Event(components[1]!).startDate.toUnixTime()
      - new ICAL.Event(components[0]!).startDate.toUnixTime()).toBe(1);
  });

  it("preserves Kathmandu's quarter-hour clock advance at the UTC boundary", () => {
    const tzid = "Asia/Kathmandu";
    const instants = ["1985-12-31T18:29:59.000Z", "1985-12-31T18:30:00.000Z"];
    const { calendar, components } = parseInZone(
      tzid, "1985-12-30T00:00:00.000Z", "1986-01-02T00:00:00.000Z", instants.map(at)
    );
    assertLocalEvent(components[0]!, tzid, instants[0]!, "1985-12-31T23:59:59");
    assertLocalEvent(components[1]!, tzid, instants[1]!, "1986-01-01T00:15:00");
    assertObservance(calendar, "standard", "1986-01-01T00:00:00", 330 * 60, 345 * 60);
  });

  it("uses UTC throughout a Paris projection containing a seconds-valued offset", () => {
    // Paris Mean Time was +00:09:21, ending at 1911-03-10T23:50:39Z.
    // The final sample is beyond that era but shares its requested projection.
    const tzid = "Europe/Paris";
    const instants = [
      "1911-03-10T23:50:38.000Z", "1911-03-10T23:50:39.000Z", "1911-03-11T12:00:00.000Z"
    ];
    const { calendar, components, value } = parseInZone(
      tzid, "1911-03-09T00:00:00.000Z", "1911-03-13T00:00:00.000Z", instants.map(at)
    );
    expect(calendar.getAllSubcomponents("vtimezone")).toHaveLength(0);
    expect(value).not.toContain("DTSTART;TZID=");
    components.forEach((component, index) => {
      const event = new ICAL.Event(component);
      expect(event.startDate.zone).toBe(ICAL.Timezone.utcTimezone);
      expect(event.startDate.toJSDate().toISOString()).toBe(instants[index]);
      expect(component.getFirstPropertyValue("x-zodiacs-tzid")).toBe(tzid);
      expect(component.getFirstPropertyValue("x-zodiacs-time-fallback")).toBe("sub-minute-offset");
      expect(JSON.parse(event.description).utc).toBe(instants[index]);
    });
  });

  it("represents Dublin's clocks with the rearguard daylight/standard convention", () => {
    const tzid = "Europe/Dublin";
    const samples = [
      ["2024-03-31T00:59:59.000Z", "2024-03-31T00:59:59"],
      ["2024-03-31T01:00:00.000Z", "2024-03-31T02:00:00"],
      ["2024-10-26T23:59:59.000Z", "2024-10-27T00:59:59"],
      ["2024-10-27T02:00:00.000Z", "2024-10-27T02:00:00"]
    ] as const;
    const { calendar, components } = parseInZone(
      tzid, "2024-01-01T00:00:00.000Z", "2024-12-31T23:59:59.000Z", samples.map(([utc]) => at(utc))
    );
    samples.forEach(([utc, local], index) => assertLocalEvent(components[index]!, tzid, utc, local));
    // IANA's main Eire rules describe winter as negative DST; rearguard keeps
    // these same UTC offsets while representing summer as DAYLIGHT.
    assertObservance(calendar, "daylight", "2024-03-31T01:00:00", 0, 3600);
    assertObservance(calendar, "standard", "2024-10-27T02:00:00", 3600, 0);
  });

  it("represents Casablanca's Ramadan pause without reversing clock changes", () => {
    const tzid = "Africa/Casablanca";
    const samples = [
      ["2024-03-10T00:59:59.000Z", "2024-03-10T01:59:59"],
      ["2024-03-10T03:00:00.000Z", "2024-03-10T03:00:00"],
      ["2024-04-14T01:59:59.000Z", "2024-04-14T01:59:59"],
      ["2024-04-14T02:00:00.000Z", "2024-04-14T03:00:00"]
    ] as const;
    const { calendar, components } = parseInZone(
      tzid, "2024-01-01T00:00:00.000Z", "2024-12-31T23:59:59.000Z", samples.map(([utc]) => at(utc))
    );
    samples.forEach(([utc, local], index) => assertLocalEvent(components[index]!, tzid, utc, local));
    assertObservance(calendar, "standard", "2024-03-10T03:00:00", 3600, 0);
    assertObservance(calendar, "daylight", "2024-04-14T02:00:00", 0, 3600);
  });

  it.each([
    ["Europe/Dublin", "2024-10-27T00:30:00.000Z", "2024-10-27T01:30:00.000Z"],
    ["Africa/Casablanca", "2024-03-10T01:30:00.000Z", "2024-03-10T02:30:00.000Z"]
  ])("retains both UTC instants for ambiguous wall times in %s", (tzid, firstUtc, secondUtc) => {
    const instants = [firstUtc!, secondUtc!];
    const { components } = parseInZone(
      tzid!, "2024-01-01T00:00:00.000Z", "2024-12-31T23:59:59.000Z", instants.map(at)
    );
    components.forEach((component, index) => {
      const event = new ICAL.Event(component);
      expect(event.startDate.zone).toBe(ICAL.Timezone.utcTimezone);
      expect(event.startDate.toJSDate().toISOString()).toBe(instants[index]);
      expect(component.getFirstProperty("dtstart")!.getParameter("tzid")).toBeUndefined();
      expect(component.getFirstPropertyValue("x-zodiacs-tzid")).toBe(tzid);
      expect(component.hasProperty("x-zodiacs-time-fallback")).toBe(true);
    });
  });
});
