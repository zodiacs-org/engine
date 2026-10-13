import { createRequire } from "node:module";
import { ZoneRulesProvider } from "@js-joda/core";
import { expect, it } from "vitest";
import { createCalendarTimeZone, serializeCalendar } from "../src/index.js";
import { fixtureOptions, syntheticEvents } from "./fixtures/synthetic-events.js";

it("refuses a shortened same-version provider while preserving already captured timezone rules", () => {
  const provider = ZoneRulesProvider as typeof ZoneRulesProvider & {
    getTzdbData(): { version: string };
    loadTzdbData(data: unknown): void;
  };
  const fullData = provider.getTzdbData();
  const utc = "2499-07-01T00:00:00.000Z";
  const timeZone = createCalendarTimeZone("America/New_York", utc, utc);
  const event = { ...syntheticEvents[0]!, receipt: { ...syntheticEvents[0]!.receipt, utc } };
  const before = serializeCalendar([event], { ...fixtureOptions, timeZone });
  expect(before).toContain("DTSTART;TZID=America/New_York:24990630T200000");
  try {
    // This is a supported upstream operation, but drops future transitions.
    const require = createRequire(import.meta.url);
    require("@js-joda/timezone/dist/js-joda-timezone-10-year-range.js");
    expect(provider.getTzdbData()).not.toBe(fullData);
    expect(provider.getTzdbData().version).toBe(fullData.version);
    expect(() => createCalendarTimeZone("America/New_York", utc, utc))
      .toThrow("pinned full 2026e bundle");
    expect(serializeCalendar([event], { ...fixtureOptions, timeZone })).toBe(before);
  } finally {
    provider.loadTzdbData(fullData);
  }
  const restored = createCalendarTimeZone("America/New_York", utc, utc);
  expect(serializeCalendar([event], { ...fixtureOptions, timeZone: restored })).toBe(before);
});
