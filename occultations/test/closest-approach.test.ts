import { describe, expect, it } from "vitest";
import { timeBasis } from "../../src/time-scale.js";
import { LOCAL_CLOSEST_APPROACH_LIMITS, positionAt, searchLocalClosestApproaches,
  searchLunarContacts, starCatalogue } from "../src/index.js";
import type { LocalClosestApproachRequest, LocalClosestApproachResult } from "../src/index.js";

const DAY = 86_400_000;
const SATURN: LocalClosestApproachRequest = { target: "Saturn", observer: { latitude: -20, longitude: 0 },
  window: { from: "2024-05-31", to: "2024-06-01" } };
function complete(result: LocalClosestApproachResult) {
  expect(result.status).toBe("complete");
  if (result.status !== "complete") throw new Error(`Unexpected refusal: ${result.reason}`);
  return result;
}
function frozen(value: unknown): void {
  if (value !== null && typeof value === "object") {
    expect(Object.isFrozen(value)).toBe(true);
    for (const child of Object.values(value)) frozen(child);
  }
}
function separation(at: string): number {
  const a = positionAt({ body: "Moon", time: at, observer: SATURN.observer, frame: "equatorial-true-of-date" });
  const b = positionAt({ body: "Saturn", time: at, observer: SATURN.observer, frame: "equatorial-true-of-date" });
  if (a.status !== "ok" || b.status !== "ok") throw new Error("Unexpected position refusal");
  // Independent haversine reduction of the same adapter output checks integration.
  const r = Math.PI / 180;
  const h = Math.sin((a.lat - b.lat) * r / 2) ** 2 +
    Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin((a.lon - b.lon) * r / 2) ** 2;
  return 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)) / r;
}

describe("local closest approach engine integration, not physical accuracy", () => {
  it("calculates local angular minimum separately from contact midpoints", () => {
    const result = complete(searchLocalClosestApproaches(SATURN));
    expect(result.events).toHaveLength(1);
    const event = result.events[0]!, ms = Date.parse(event.at);
    expect(event.separationDegrees).toBeCloseTo(separation(event.at), 10);
    for (const offset of [-300_000, 300_000]) {
      expect(event.separationDegrees).toBeLessThan(separation(new Date(ms + offset).toISOString()));
    }
    const contacts = searchLunarContacts(SATURN);
    expect(contacts.status).toBe("complete");
    expect(contacts.contacts).toHaveLength(4);
    for (const [first, last] of [[0, 3], [1, 2]]) {
      const midpoint = (Date.parse(contacts.contacts[first!]!.at) + Date.parse(contacts.contacts[last!]!.at)) / 2;
      expect(ms).not.toBe(midpoint);
      expect(event.separationDegrees).toBeLessThan(separation(new Date(midpoint).toISOString()));
    }
    expect(event.receipt.timeBasis).toEqual(timeBasis(ms));
    expect(event.receipt.search).toBe(result.receipt);
    expect(event.receipt.moon.request).toMatchObject({ body: "Moon", time: event.at,
      observer: result.receipt.request.observer, frame: "equatorial-true-of-date" });
    expect(event.receipt.target.request).toMatchObject({ body: "Saturn", time: event.at });
    expect(result.receipt.search).toMatchObject({ samples: expect.any(Number), stepMilliseconds: 300_000,
      stencilHalfWidthMilliseconds: 60_000, completeness: "sampled;not-proven",
      evaluationWindow: { from: "2024-05-30T23:58:59.999Z", to: "2024-06-01T00:01:00.001Z" } });
    expect(result.receipt.search.samples).toBeLessThanOrEqual(result.receipt.search.maxSamples);
    frozen(result);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it("supports a catalogue target with source receipts without mutating caller objects", () => {
    const observer = { latitude: 42.349444444444444, longitude: -71.07916666666667 };
    const request = { target: "sao:94027" as const, observer, window: { from: "1923-01-27", to: "1923-01-29" } };
    const result = complete(searchLocalClosestApproaches(request));
    expect(result.events).toHaveLength(1);
    expect(result.receipt.star?.id).toBe(request.target);
    expect(result.receipt.catalogue).toEqual(starCatalogue().receipt);
    expect(result.events[0]!.receipt.target.request).toMatchObject({ star: request.target });
    frozen(result);
    for (const value of [request, observer, request.window]) expect(Object.isFrozen(value)).toBe(false);
    expect(searchLocalClosestApproaches(result.receipt.request)).toEqual(result);
  });

  it.each([
    { from: "2016-12-31T23:59:30Z", to: "2016-12-31T23:59:45Z" },
    { from: "2017-01-01T00:00:30Z", to: "2017-01-01T00:00:45Z" }
  ])("refuses time seams in the derivative halo %#", (window) => {
    const result = searchLocalClosestApproaches({ ...SATURN, window });
    expect(result).toMatchObject({ status: "refused", reason: "time-discontinuity", events: [],
      receipt: { search: { samples: 0 } } });
    frozen(result);
  });

  it.each([
    { from: "1800-01-01T00:00:30Z", to: "1800-01-01T00:00:45Z" },
    { from: "2199-12-31T23:59:30Z", to: "2199-12-31T23:59:45Z" },
    { from: new Date(-8_640_000_000_000_000), to: new Date(8_640_000_000_000_000) }
  ])("refuses unsupported range before any position work %#", (window) => {
    expect(searchLocalClosestApproaches({ ...SATURN, window })).toMatchObject({ status: "refused",
      reason: "out-of-range", events: [], receipt: { search: { samples: 0 } } });
  });

  it.each([
    null, [], {}, Object.create(SATURN), { ...SATURN, observer: undefined },
    ...["Sun", "Moon", "Earth", "saturn", "Aldebaran", "sao:0", null].map((target) => ({ ...SATURN, target })),
    ...[null, {}, { latitude: 91, longitude: 0 }, { latitude: 0, longitude: 181 }].map((observer) => ({ ...SATURN, observer })),
    ...[0, -1, Infinity, NaN, null, "10", 1.5, 100_001].map((maxSamples) => ({ ...SATURN, maxSamples })),
    ...[0, -1, Infinity, NaN, null, "0.001", 0.5 / DAY, LOCAL_CLOSEST_APPROACH_LIMITS.maximumStepDays + 0.001]
      .map((stepDays) => ({ ...SATURN, stepDays })),
    { ...SATURN, window: { from: "2024-02-30", to: "2024-03-01" } },
    { ...SATURN, window: { from: "2024-05-31", to: "2024-05-31" } },
    { ...SATURN, maximumSeparationDegrees: 1 }, { ...SATURN, [Symbol("unknown")]: true }
  ])("rejects malformed input %#", (request) => {
    expect(() => searchLocalClosestApproaches(request as LocalClosestApproachRequest)).toThrow(RangeError);
  });
});
