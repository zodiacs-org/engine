import type { SynastryScheduleRequest } from "../../src/index.js";

// Invented births. Second's epoch is the engine progression mapping of first at
// 2026-02-03T12:00Z, constructing a contact to exercise the export plumbing.
export const syntheticSynastryRequest: SynastryScheduleRequest = {
  namespace: "synthetic-synastry.calendar.invalid",
  convention: "secondary-progressed-first-to-natal-second/1",
  firstBody: "Sun", secondBody: "Sun", clock: "utc",
  startUtc: "2026-02-01T00:00:00.000Z", endUtc: "2026-02-06T00:00:00.000Z",
  stepMs: 3_600_000, maxEvaluations: 100_000,
  policy: { aspects: [{ id: "conjunction", angleDegrees: 0 }] },
  first: { id: "synthetic-synastry-a", synthetic: true, birth: {
    utc: "2001-02-03T04:05:06.789Z", timeScale: "utc", latitude: 12.5, longitude: 34.25
  } },
  second: { id: "synthetic-synastry-b", synthetic: true, birth: {
    utc: "2001-02-28T04:06:11.790Z", timeScale: "utc", latitude: -23.5, longitude: 45.25
  } }
};
export const syntheticSynastryDtstamp = "2026-01-01T00:00:00.000Z";
