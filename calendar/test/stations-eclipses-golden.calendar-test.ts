import { readFileSync } from "node:fs";
import ICAL from "ical.js";
import { expect, it } from "vitest";
import { searchEclipseSchedule, searchStationSchedule, serializeCalendar } from "../src/index.js";
import { eclipseRequest, lunarRequest, stationRequest, revisionUtc } from "./fixtures/synthetic-stations-eclipses.js";

it("matches the station and solar/lunar eclipse golden and independently parses every receipt", () => {
  const results = [searchStationSchedule(stationRequest), searchEclipseSchedule(eclipseRequest), searchEclipseSchedule(lunarRequest)];
  for (const result of results) {
    expect(result.status).toBe("complete");
    expect(result.events).toHaveLength(1);
  }
  const events = results.flatMap(result => [...result.events]);
  const output = serializeCalendar(events, { dtstamp: revisionUtc });
  const golden = readFileSync(new URL("./fixtures/synthetic-stations-eclipses.ics", import.meta.url));
  expect(Buffer.from(output)).toEqual(golden);
  expect(output).not.toMatch(/(?<!\r)\n|\r(?!\n)/u);
  for (const line of output.split("\r\n")) expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);
  const feed = new ICAL.Component(ICAL.parse(output));
  const parsed = feed.getAllSubcomponents("vevent");
  expect(parsed).toHaveLength(events.length);
  parsed.forEach((component, index) => {
    const event = new ICAL.Event(component);
    expect(event.uid).toBe(events[index]!.uid);
    expect(JSON.parse(event.description)).toEqual(events[index]!.receipt);
    expect(component.getFirstPropertyValue("x-zodiacs-orb-degrees")).toBe("null");
    expect(event.startDate.toJSDate().toISOString())
      .toBe(events[index]!.receipt.utc.replace(/\.\d{3}Z$/u, ".000Z"));
  });
});
