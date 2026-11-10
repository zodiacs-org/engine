import type { EclipseScheduleRequest } from "../../src/eclipses.js";
import type { StationScheduleRequest } from "../../src/stations.js";

// Invented schedule windows and explicitly chosen spherical test radii in au.
// These are regression inputs, not physical radii defaults or accuracy evidence.
export const eclipseRequest: EclipseScheduleRequest = {
  namespace: "synthetic-eclipse.calendar.invalid", kind: "solar", clock: "utc",
  startUtc: "2026-08-11T00:00:00.000Z", endUtc: "2026-08-14T00:00:00.000Z",
  stepMs: 3_600_000, derivativeStepMs: 60_000, maxEvaluations: 100_000,
  model: { sunRadiusAu: 0.00465, moonRadiusAu: 0.0000116, earthRadiusAu: 0.0000426 }
};
export const lunarRequest: EclipseScheduleRequest = {
  ...eclipseRequest, kind: "lunar",
  startUtc: "2026-08-27T00:00:00.000Z", endUtc: "2026-08-30T00:00:00.000Z"
};
export const stationRequest: StationScheduleRequest = {
  namespace: "synthetic-station.calendar.invalid", body: "Mercury", clock: "utc",
  startUtc: "2026-02-24T00:00:00.000Z", endUtc: "2026-02-28T00:00:00.000Z",
  stepMs: 3_600_000, maxEvaluations: 100_000
};
export const revisionUtc = "2026-01-01T00:00:00.000Z";
