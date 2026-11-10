import { createEventIdentity, eventUid } from "../../src/index.js";
import type { EventIdentity, ScheduleEvent } from "../../src/types.js";
import { syntheticEvents } from "./synthetic-events.js";

// Invented durable chart/configuration and occurrence keys, not real birth data.
export const syntheticIdentities: readonly EventIdentity[] = [
  createEventIdentity({
    schema: "zodiacs-calendar-event/1",
    namespace: "https://calendar.invalid/fixtures",
    eventType: "natal-transit",
    bodies: ["Moon", "Sun"],
    chartIds: ["synthetic-chart-a/config-1"],
    aspectAngleDegrees: 90,
    definition: {
      id: "synthetic-transit/1",
      parameters: { zodiac: "tropical", branch: 90, direction: "direct" }
    },
    occurrence: { scheme: "source-key/1", key: "synthetic-pass-a" }
  }),
  createEventIdentity({
    schema: "zodiacs-calendar-event/1",
    namespace: "https://calendar.invalid/fixtures",
    eventType: "void-of-course",
    bodies: ["Moon"],
    chartIds: [],
    aspectAngleDegrees: null,
    definition: {
      id: "synthetic-void/1",
      parameters: { bodies: ["Sun", "Mercury"], angles: [0, 90, 180] }
    },
    occurrence: { scheme: "source-key/1", key: "synthetic-lunar-segment-a" }
  })
];

export const identifiedSyntheticEvents: readonly ScheduleEvent[] = syntheticEvents.map((event, index) => {
  const identity = syntheticIdentities[index]!;
  return { ...event, identity, uid: eventUid(identity) };
});
