import { describe, expect, it } from "vitest";
import { CALC_SPAN } from "../../src/calc.js";
import { timeBasis } from "../../src/time-scale.js";
import { CONTACT_LIMITS, OCCULTATION_RADII, positionAt, searchLunarContacts, starCatalogue, starPositionAt } from "../src/index.js";
import type { LunarContactRequest, LunarContactResult, OccultationPlanet } from "../src/index.js";

const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();
const SATURN: LunarContactRequest = { target: "Saturn", observer: { latitude: -20, longitude: 0 },
  window: { from: "2024-05-31", to: "2024-06-01" } };
const ALDEBARAN: LunarContactRequest = { target: "sao:94027",
  observer: { latitude: 42.349444444444444, longitude: -71.07916666666667 },
  window: { from: "1923-01-27", to: "1923-01-29" } };
function complete(result: LunarContactResult) {
  expect(result.status).toBe("complete");
  if (result.status !== "complete") throw new Error(`Unexpected refusal ${result.reason}`);
  return result;
}
function frozen(value: unknown): void {
  if (value !== null && typeof value === "object") {
    expect(Object.isFrozen(value)).toBe(true);
    for (const child of Object.values(value)) frozen(child);
  }
}
function clearance(request: LunarContactRequest, at: string, internal: boolean) {
  const moon = positionAt({ body: "Moon", time: at, observer: request.observer });
  const target = request.target.startsWith("sao:") ? starPositionAt({ star: request.target, time: at, observer: request.observer }) :
    positionAt({ body: request.target as OccultationPlanet, time: at, observer: request.observer });
  if (moon.status !== "ok" || target.status !== "ok" || moon.dist === null) throw new Error("position refused");
  const r = Math.PI / 180;
  // Independent haversine on adapter outputs tests integration, not ephemeris accuracy.
  const h = Math.sin((moon.lat - target.lat) * r / 2) ** 2 + Math.cos(moon.lat * r) * Math.cos(target.lat * r) *
    Math.sin((moon.lon - target.lon) * r / 2) ** 2;
  const separation = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)) / r;
  const moonSemi = Math.asin(OCCULTATION_RADII.moonKm / (moon.dist * OCCULTATION_RADII.auKm)) / r;
  const targetSemi = "dist" in target && target.dist !== null
    ? Math.asin(OCCULTATION_RADII.planetKm[request.target as OccultationPlanet] / (target.dist * OCCULTATION_RADII.auKm)) / r : 0;
  return { value: separation - moonSemi + (internal ? targetSemi : -targetSemi), moonSemi, targetSemi, separation, moon, target };
}

describe("topocentric contact integration, not independent timing evidence", () => {
  it.each([SATURN, ALDEBARAN])("solves the adapter sphere equation and records raw numerical brackets %#", (request) => {
    const result = complete(searchLunarContacts(request));
    expect(result.contacts.length).toBe(request === SATURN ? 4 : 2);
    expect(result.overlapIntervals).toHaveLength(1);
    expect(result.fullCoverageIntervals).toHaveLength(1);
    for (const contact of result.contacts) {
      const internal = contact.boundary === "internal";
      const actual = clearance(request, contact.at, internal);
      expect(contact.clearanceDegrees).toBeCloseTo(actual.value, 11);
      expect(contact.separationDegrees).toBeCloseTo(actual.separation, 11);
      expect(contact.moonSemidiameterDegrees).toBeCloseTo(actual.moonSemi, 12);
      expect(contact.targetSemidiameterDegrees).toBeCloseTo(actual.targetSemi, 12);
      expect(contact.receipt.moon).toEqual(actual.moon.receipt);
      expect(contact.receipt.target).toEqual(actual.target.receipt);
      expect(contact.receipt.search).toBe(result.receipt);
      expect(contact.receipt.timeBasis).toEqual(timeBasis(Date.parse(contact.at)));
      expect(contact.receipt.moon.request.observer).toEqual(result.receipt.request.observer);
      const low = Date.parse(contact.bracket.from), high = Date.parse(contact.bracket.to);
      expect(high - low).toBeLessThanOrEqual(1);
      expect(high).toBe(Date.parse(contact.at));
      const before = clearance(request, iso(low - 1), internal).value;
      const after = clearance(request, iso(high + 1), internal).value;
      expect(contact.direction === "disappearing" ? before > 0 && after < 0 : before < 0 && after > 0).toBe(true);
    }
    for (const interval of [...result.overlapIntervals, ...result.fullCoverageIntervals]) {
      expect(interval.receipt.search).toBe(result.receipt);
      expect(interval.start).toBe("contact");
      expect(interval.end).toBe("contact");
    }
    expect(result.receipt.search.evaluationWindow).toEqual({
      from: iso(new Date(request.window.from).getTime() - 1), to: iso(new Date(request.window.to).getTime() + 1)
    });
    expect(result.receipt.search.stepMilliseconds).toBe(300_000);
    expect(result.receipt.search.completeness).toBe("sampled;not-proven");
  });

  it.each([SATURN, ALDEBARAN])("assigns each contact once when it divides adjacent windows %#", (request) => {
    const original = complete(searchLunarContacts(request));
    for (const contact of original.contacts) {
      const left = complete(searchLunarContacts({ ...request, window: { from: request.window.from, to: contact.at } }));
      const right = complete(searchLunarContacts({ ...request, window: { from: contact.at, to: request.window.to } }));
      expect([...left.contacts, ...right.contacts].map(({ at, kind }) => ({ at, kind })))
        .toEqual(original.contacts.map(({ at, kind }) => ({ at, kind })));
      expect(left.contacts.at(-1)?.at).toBe(contact.at);
      expect(right.contacts.some((row) => row.at === contact.at)).toBe(false);
    }
  });

  it("retains fully clipped occultation without manufacturing any contacts", () => {
    const result = complete(searchLunarContacts(SATURN));
    const middle = Math.floor((Date.parse(result.contacts[1]!.at) + Date.parse(result.contacts[2]!.at)) / 2);
    const window = { from: iso(middle - 1000), to: iso(middle + 1000) };
    const clipped = complete(searchLunarContacts({ ...SATURN, window }));
    expect(clipped.contacts).toEqual([]);
    for (const intervals of [clipped.overlapIntervals, clipped.fullCoverageIntervals]) {
      expect(intervals).toHaveLength(1);
      expect(intervals[0]).toMatchObject({ ...window, start: "window", end: "window" });
    }
  });

  it("records clipped partial disk coverage and only the owned inner contact", () => {
    const result = complete(searchLunarContacts(SATURN));
    const start = Math.floor((Date.parse(result.contacts[0]!.at) + Date.parse(result.contacts[1]!.at)) / 2);
    const end = Date.parse(result.contacts[1]!.at) + 1000;
    const clipped = complete(searchLunarContacts({ ...SATURN, window: { from: iso(start), to: iso(end) } }));
    expect(clipped.contacts.map((row) => row.kind)).toEqual(["full-disappearance"]);
    expect(clipped.overlapIntervals[0]).toMatchObject({ start: "window", end: "window" });
    expect(clipped.fullCoverageIntervals[0]).toMatchObject({ start: "contact", end: "window" });
  });

  it("returns empty receipted searches, including at exact geographic poles", () => {
    for (const latitude of [-90, 0, 90]) {
      const result = complete(searchLunarContacts({ ...SATURN, observer: { latitude, longitude: 180, elevationMeters: 1000 },
        window: { from: "2024-01-01", to: "2024-01-01T00:01:00Z" } }));
      expect(result.contacts).toEqual([]);
      expect(result.overlapIntervals).toEqual([]);
      expect(result.fullCoverageIntervals).toEqual([]);
      frozen(result);
    }
  });

  it("preserves immutable JSON receipts, star provenance and caller objects", () => {
    const observer = { ...ALDEBARAN.observer }, from = new Date(ALDEBARAN.window.from), to = new Date(ALDEBARAN.window.to);
    const request = { ...ALDEBARAN, observer, window: { from, to } };
    const result = complete(searchLunarContacts(request));
    frozen(result);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    expect(searchLunarContacts(result.receipt.request)).toEqual(result);
    expect(result.receipt.catalogue).toEqual(starCatalogue().receipt);
    expect(result.receipt.star?.id).toBe(ALDEBARAN.target);
    for (const value of [observer, from, to, request, request.window]) expect(Object.isFrozen(value)).toBe(false);
    expect(result.receipt.conventions).toContain("star:infinite-distance-point-source-model;distance-unknown");
    expect(result.receipt.limitations).toContain("spherical-contact-does-not-establish-visibility;horizon-not-filtered");
  });
});

describe("local contact input, clocks and bounded work", () => {
  it("refuses budget exhaustion before sampling or during output without partial events", () => {
    const full = complete(searchLunarContacts(SATURN));
    const finalBudget = full.receipt.search.samples - 1;
    for (const budget of [1, 600, finalBudget]) {
      const refused = searchLunarContacts({ ...SATURN, maxSamples: budget });
      expect(refused).toMatchObject({ status: "refused", reason: "sample-budget", contacts: [], overlapIntervals: [], fullCoverageIntervals: [] });
      expect(refused.receipt.search.samples).toBe(budget === 1 ? 0 : budget);
      frozen(refused);
      expect(JSON.parse(JSON.stringify(refused))).toEqual(refused);
    }
    const exact = complete(searchLunarContacts({ ...SATURN, maxSamples: full.receipt.search.samples }));
    expect(exact.contacts.map((row) => row.at)).toEqual(full.contacts.map((row) => row.at));
    expect(exact.receipt.search.samples).toBe(full.receipt.search.samples);
  });

  it.each([
    { from: "2016-12-31T23:59:59.000Z", to: "2016-12-31T23:59:59.999Z" },
    { from: "2017-01-01T00:00:00Z", to: "2017-01-01T00:00:01Z" },
    { from: "1940-12-31T17:59:59Z", to: "1940-12-31T18:00:01Z" },
    { from: "2027-10-02T00:00:00Z", to: "2027-10-02T00:00:01Z" }
  ])("refuses clock seams anywhere in the classification support %#", (window) => {
    const result = searchLunarContacts({ ...SATURN, window });
    expect(result).toMatchObject({ status: "refused", reason: "time-discontinuity", contacts: [], receipt: { search: { samples: 0 } } });
    expect(result.receipt.seams).toHaveLength(1);
  });

  it.each([
    { from: CALC_SPAN.from, to: "1800-01-01T00:00:01Z" },
    { from: "2199-12-31T23:59:59Z", to: CALC_SPAN.to },
    { from: new Date(-8_640_000_000_000_000), to: new Date(8_640_000_000_000_000) }
  ])("refuses unsupported evaluation range before sampling %#", (window) => {
    const result = searchLunarContacts({ ...SATURN, window });
    expect(result).toMatchObject({ status: "refused", reason: "out-of-range", contacts: [], receipt: { search: { samples: 0 } } });
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it("captures request and observer getters once", () => {
    let targetReads = 0, latitudeReads = 0;
    const result = searchLunarContacts({ ...SATURN, get target() { targetReads++; return "Saturn" as const; },
      observer: { get latitude() { latitudeReads++; return -20; }, longitude: 0 } });
    expect(targetReads).toBe(1);
    expect(latitudeReads).toBe(1);
    expect(result).toEqual(searchLunarContacts(SATURN));
  });

  it.each([
    null, [], {}, Object.create(SATURN), { ...SATURN, observer: undefined },
    ...["Sun", "Moon", "Earth", "saturn", "Aldebaran", "sao:0", null].map((target) => ({ ...SATURN, target })),
    ...[null, {}, { latitude: 91, longitude: 0 }, { latitude: 0, longitude: 181 },
      { latitude: 0, longitude: 0, elevationMeters: Infinity }].map((observer) => ({ ...SATURN, observer })),
    ...[0, -1, Infinity, NaN, null, "10", 1.5, CONTACT_LIMITS.maximumMaxSamples + 1].map((maxSamples) => ({ ...SATURN, maxSamples })),
    ...[0, -1, Infinity, NaN, null, "0.001", 0.5 / DAY, CONTACT_LIMITS.maximumStepDays + 0.001].map((stepDays) => ({ ...SATURN, stepDays })),
    { ...SATURN, window: { from: "2024-02-30", to: "2024-03-01" } },
    { ...SATURN, window: { from: "2024-05-31", to: "2024-05-31" } },
    { ...SATURN, frame: "ecliptic-true-of-date" }, { ...SATURN, [Symbol("unknown")]: true }
  ])("rejects malformed requests %#", (request) => {
    expect(() => searchLunarContacts(request as LunarContactRequest)).toThrow(RangeError);
  });
});
