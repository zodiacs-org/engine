import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as engine from "../src/engine.js";
import { OCCULTATION_RADII, searchLunarContacts } from "../src/index.js";
import type { LunarContactRequest, LunarContactResult } from "../src/index.js";

// Constructed adapter trajectories check API semantics, not sky accuracy.
const DAY = 86_400_000, ORIGIN = Date.parse("2024-01-02T00:00:00Z");
const RAD = Math.PI / 180, observer = { latitude: 13, longitude: -27, elevationMeters: 123 };
const baseline = engine.positionAt({ body: "Moon", time: new Date(ORIGIN), observer });
if (baseline.status !== "ok") throw new Error("test position unavailable");
let moonDistanceKm: number, targetDistanceKm: number, sunDistanceKm: number;
let longitude: (seconds: number) => number, latitude: (seconds: number) => number;
let evaluated: { time: number; body: string }[];
let refusedBody: string | null;
const request = (from = -600, to = 600): LunarContactRequest => ({ target: "Jupiter", observer,
  window: { from: new Date(ORIGIN + from * 1000), to: new Date(ORIGIN + to * 1000) }, stepDays: 60_000 / DAY });
function complete(result: LunarContactResult) {
  if (result.status !== "complete") throw new Error(`Unexpected contact refusal: ${result.reason}`);
  return result;
}
const seconds = (at: string) => (Date.parse(at) - ORIGIN) / 1000;
const radiusAngle = (radius: number, distance: number) => Math.asin(radius / distance) / RAD;

beforeEach(() => {
  moonDistanceKm = 400_000;
  targetDistanceKm = 100_000_000;
  sunDistanceKm = 150_000_000;
  longitude = (time) => 0.001 * time;
  latitude = () => 0;
  evaluated = [];
  refusedBody = null;
  vi.spyOn(engine, "positionAt").mockImplementation((input) => {
    const ms = new Date(input.time).getTime(), moon = input.body === "Moon";
    evaluated.push({ time: ms, body: input.body });
    expect(input.observer).toEqual(observer);
    expect(input.frame).toBe("equatorial-true-of-date");
    const receipt = { ...baseline.receipt, request: { ...baseline.receipt.request,
      body: input.body, time: new Date(ms).toISOString(), frame: input.frame! } };
    if (input.body === refusedBody) return { status: "refused", reason: "unsupported-combination",
      detail: "Synthetic refused adapter sample.", receipt };
    const time = (ms - ORIGIN) / 1000;
    return { ...baseline, body: input.body, lon: moon ? (longitude(time) % 360 + 360) % 360 : 0,
      lat: moon ? latitude(time) : 0,
      dist: (moon ? moonDistanceKm : input.body === "Sun" ? sunDistanceKm : targetDistanceKm) / OCCULTATION_RADII.auKm, receipt };
  });
});
afterEach(() => vi.restoreAllMocks());

describe("local contact API on constructed spherical trajectories", () => {
  it("reports four ordered phases for a fully hidden planet disk", () => {
    const result = complete(searchLunarContacts(request()));
    expect(result.contacts.map((contact) => contact.kind)).toEqual([
      "partial-disappearance-start", "full-disappearance", "full-reappearance-start", "partial-reappearance-end"
    ]);
    expect(result.contacts.map((contact) => contact.boundary)).toEqual(["external", "internal", "internal", "external"]);
    expect(result.contacts.map((contact) => contact.direction)).toEqual([
      "disappearing", "disappearing", "reappearing", "reappearing"
    ]);
    const moon = radiusAngle(OCCULTATION_RADII.moonKm, moonDistanceKm);
    const planet = radiusAngle(OCCULTATION_RADII.planetKm.Jupiter, targetDistanceKm);
    // Along the equator the separation is exactly |0.001 * elapsed seconds|.
    const expected = [-(moon + planet), -(moon - planet), moon - planet, moon + planet].map((angle) => angle / 0.001);
    for (const [index, contact] of result.contacts.entries()) {
      expect(Math.abs(seconds(contact.at) - expected[index]!)).toBeLessThanOrEqual(0.0011);
      expect(Date.parse(contact.bracket.to) - Date.parse(contact.bracket.from)).toBeLessThanOrEqual(1);
      expect(contact.receipt.search).toBe(result.receipt);
      expect(contact.receipt.moon.request.observer).toEqual(observer);
    }
    expect(result.overlapIntervals).toHaveLength(1);
    expect(result.fullCoverageIntervals).toHaveLength(1);
    expect(result.overlapIntervals[0]).toMatchObject({ from: result.contacts[0]!.at,
      to: result.contacts[3]!.at, start: "contact", end: "contact", coverage: "overlap" });
    expect(result.fullCoverageIntervals[0]).toMatchObject({ from: result.contacts[1]!.at,
      to: result.contacts[2]!.at, start: "contact", end: "contact", coverage: "full" });
    expect(result.receipt.search.skyEvaluations).toBe(result.contacts.length);
    expect(evaluated.length).toBe(2 * result.receipt.search.samples - result.receipt.search.skyEvaluations);
    expect(Math.min(...evaluated.map(({ time }) => time))).toBeGreaterThanOrEqual(ORIGIN - 600_001);
    expect(Math.max(...evaluated.map(({ time }) => time))).toBeLessThanOrEqual(ORIGIN + 600_001);
  });

  it("retains a partial-only event without inventing full disappearance", () => {
    latitude = () => 0.23;
    const result = complete(searchLunarContacts(request()));
    expect(result.contacts.map((contact) => contact.kind)).toEqual([
      "partial-disappearance-start", "partial-reappearance-end"
    ]);
    expect(result.overlapIntervals).toHaveLength(1);
    expect(result.fullCoverageIntervals).toEqual([]);
    const sum = radiusAngle(OCCULTATION_RADII.moonKm, moonDistanceKm) +
      radiusAngle(OCCULTATION_RADII.planetKm.Jupiter, targetDistanceKm);
    // Independent spherical cosine law: cos(separation) = cos(latitude) cos(longitude).
    const offset = Math.acos(Math.cos(sum * RAD) / Math.cos(0.23 * RAD)) / RAD / 0.001;
    expect(Math.abs(seconds(result.contacts[0]!.at) + offset)).toBeLessThanOrEqual(0.0011);
    expect(Math.abs(seconds(result.contacts[1]!.at) - offset)).toBeLessThanOrEqual(0.0011);
  });

  it("does not call reverse containment full coverage when the target disk is larger", () => {
    targetDistanceKm = 5_000_000;
    const result = complete(searchLunarContacts(request(-1500, 1500)));
    expect(result.contacts.map((contact) => contact.kind)).toEqual([
      "partial-disappearance-start", "partial-reappearance-end"
    ]);
    expect(result.fullCoverageIntervals).toEqual([]);
    expect(result.overlapIntervals).toHaveLength(1);
    expect(result.contacts.every((contact) => contact.targetSemidiameterDegrees > contact.moonSemidiameterDegrees)).toBe(true);
  });

  it("keeps an already covered clipped window without fabricating contacts", () => {
    const result = complete(searchLunarContacts(request(-10, 10)));
    expect(result.contacts).toEqual([]);
    for (const interval of [...result.overlapIntervals, ...result.fullCoverageIntervals]) {
      expect(interval).toMatchObject({ from: new Date(ORIGIN - 10_000).toISOString(),
        to: new Date(ORIGIN + 10_000).toISOString(), start: "window", end: "window" });
      expect(interval.receipt.search).toBe(result.receipt);
    }
    expect(result.overlapIntervals).toHaveLength(1);
    expect(result.fullCoverageIntervals).toHaveLength(1);
    expect(result.receipt.search.skyEvaluations).toBe(0);
    expect(evaluated.some(({ body }) => body === "Sun")).toBe(false);
  });

  it.each(["tangent", "plateau"] as const)("refuses a sampled external %s instead of claiming an empty complete search", (shape) => {
    // Each disk has exactly half a degree radius after the adapter AU round trip.
    moonDistanceKm = OCCULTATION_RADII.moonKm / Math.sin(0.5 * RAD);
    targetDistanceKm = OCCULTATION_RADII.planetKm.Jupiter / Math.sin(0.5 * RAD);
    longitude = () => 0;
    latitude = shape === "tangent" ? (time) => 1 + 0.01 * (time / 300) ** 2 :
      (time) => 1 + 0.01 * (Math.max(0, Math.abs(time) - 100) / 300) ** 2;
    expect(searchLunarContacts(request())).toMatchObject({ status: "refused", reason: "unresolved-contact",
      contacts: [], overlapIntervals: [], fullCoverageIntervals: [] });
  });

  it("discards all contacts if the last output sample exceeds the shared budget", () => {
    const full = complete(searchLunarContacts(request()));
    const budget = full.receipt.search.samples - 1;
    evaluated = [];
    const result = searchLunarContacts({ ...request(), maxSamples: budget });
    expect(result).toMatchObject({ status: "refused", reason: "sample-budget",
      contacts: [], overlapIntervals: [], fullCoverageIntervals: [],
      receipt: { search: { samples: budget, maxSamples: budget } } });
    expect(evaluated.length).toBe(2 * budget - result.receipt.search.skyEvaluations);
    expect(result.receipt.search.skyEvaluations).toBe(full.contacts.length - 1);
    expect(evaluated.at(-1)?.body).toBe("Jupiter");
  });

  it("discards solved contacts when the first Sun output position is refused", () => {
    refusedBody = "Sun";
    const result = searchLunarContacts(request());
    expect(result).toMatchObject({ status: "refused", reason: "position-refused", contacts: [],
      overlapIntervals: [], fullCoverageIntervals: [],
      failure: { position: { request: { body: "Sun" } }, positionReason: "unsupported-combination" },
      receipt: { search: { skyEvaluations: 1 } } });
    expect(evaluated.at(-1)?.body).toBe("Sun");
  });

  it.each([NaN, 1_000_000])("refuses invalid Sun output geometry: %s km", (distance) => {
    sunDistanceKm = distance;
    expect(searchLunarContacts(request())).toMatchObject({ status: "refused", reason: "invalid-geometry",
      contacts: [], overlapIntervals: [], fullCoverageIntervals: [], receipt: { search: { skyEvaluations: 1 } } });
  });

  it.each(["Moon", "Jupiter"])("preserves the %s position refusal without partial contacts", (body) => {
    refusedBody = body;
    const result = searchLunarContacts(request());
    expect(result).toMatchObject({ status: "refused", reason: "position-refused",
      contacts: [], overlapIntervals: [], fullCoverageIntervals: [],
      failure: { position: { request: { body } }, positionReason: "unsupported-combination" },
      receipt: { search: { samples: 1 } } });
    expect(evaluated).toHaveLength(body === "Moon" ? 1 : 2);
  });
});
