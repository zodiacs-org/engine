import type { CalendarOptions, EngineIdentity, ScheduleEvent } from "../../src/types.js";

// Invented formatting records, not calculated events or astronomical accuracy evidence.
const fixtureEngine: EngineIdentity = {
  name: "@zodiacs/engine",
  version: "1.0.0",
  ephemeris: { name: "astronomy-engine", version: "2.1.19" }
};

export const fixtureOptions: CalendarOptions = { dtstamp: "2026-01-01T00:00:00.000Z" };

export const syntheticEvents: readonly ScheduleEvent[] = [
  {
    uid: "synthetic-transit@calendar.invalid",
    summary: "Synthetic Moon square Sun; café, 月 🌙\nPath \\ fixture",
    receipt: {
      schema: "zodiacs-calendar-receipt/1",
      utc: "2026-02-03T04:05:06.789Z",
      eventType: "natal-transit",
      bodies: ["Moon", "Sun"],
      aspect: { name: "square", angleDegrees: 90 },
      orbDegrees: 0.0000125,
      engine: fixtureEngine,
      source: {
        synthetic: true,
        note: "Formatting; only, not an ephemeris result.\nPath \\ fixture",
        settings: { zodiac: "tropical", timeScale: "utc" }
      }
    }
  },
  {
    uid: "synthetic-void@calendar.invalid",
    summary: "Synthetic void-of-course Moon",
    endUtc: "2026-02-04T06:30:00.456Z",
    receipt: {
      schema: "zodiacs-calendar-receipt/1",
      utc: "2026-02-04T02:15:00.123Z",
      eventType: "void-of-course",
      bodies: ["Moon"],
      aspect: null,
      orbDegrees: null,
      engine: fixtureEngine
    }
  }
];
