import type { VoidOfCourseScheduleRequest } from "../../src/index.js";

// Invented range and explicit contact policy, not astronomical accuracy evidence.
export const voidRequest: VoidOfCourseScheduleRequest = {
  namespace: "synthetic-void.calendar.invalid", clock: "utc",
  startUtc: "2026-02-01T00:00:00.000Z", endUtc: "2026-02-04T00:00:00.000Z",
  stepMs: 3_600_000, maxEvaluations: 100_000,
  policy: { bodies: ["Sun", "Venus"],
    aspects: [{ id: "conjunction", angleDegrees: 0 }, { id: "sextile", angleDegrees: 60 },
      { id: "square", angleDegrees: 90 }, { id: "trine", angleDegrees: 120 }, { id: "opposition", angleDegrees: 180 }] }
};
export const revisionUtc = "2026-01-01T00:00:00.000Z";
