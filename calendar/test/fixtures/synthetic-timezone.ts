import type { ScheduleEvent } from "../../src/types.js";
import { syntheticEvents } from "./synthetic-events.js";

// Invented event records placed around real timezone boundaries, not predictions.
function event(uid: string, utc: string, endUtc?: string): ScheduleEvent {
  const base = syntheticEvents[1]!;
  return {
    uid: `${uid}@calendar.invalid`, summary: `Synthetic ${uid}`,
    receipt: { ...base.receipt, utc },
    ...(endUtc === undefined ? {} : { endUtc })
  };
}

export const timezoneStart = "2026-03-08T06:59:59.000Z";
export const timezoneEnd = "2026-11-01T07:00:00.000Z";
export const syntheticTimezoneEvents: readonly ScheduleEvent[] = [
  event("spring-interval", timezoneStart, "2026-03-08T07:00:01.456Z"),
  event("first-fold", "2026-11-01T05:30:00.123Z"),
  event("second-fold", "2026-11-01T06:30:00.789Z"),
  event("after-fold", timezoneEnd)
];
