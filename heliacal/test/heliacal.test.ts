import { afterEach, describe, expect, it, vi } from "vitest";
import {
  HELIACAL_APPEARANCES, HELIACAL_SEARCH_LIMITS, VISIBILITY_BODIES, heliacalEvents, horizonArcusVisionis,
  sunBodyGeometry
} from "../src/index.js";
import type { HorizonArcusModel } from "../src/index.js";
import * as geometry from "../src/geometry.js";
import * as windows from "../src/windows.js";

const SITE = { latitude: 13, longitude: -42, height: 120 };
const MODEL = { model: "horizon-arcus-visionis/1", thresholds: { "first-morning": 10.5, "last-evening": 9.5 } } as const;
const MOON_MODEL = { model: "horizon-arcus-visionis/1", thresholds: { "first-evening": 10.5, "last-morning": 9.5 } } as const;
afterEach(() => vi.restoreAllMocks());

// These are engine integration checks, not independent sighting references.
describe("heliacal engine integration", () => {
  it("returns lunar geometric brackets with unchanged engine positions and distinct source epochs", () => {
    const result = heliacalEvents("Moon", SITE, "2001-02-01", "2001-03-15", MOON_MODEL);
    expect(result.status).toBe("complete");
    if (result.status !== "complete") throw new Error("Expected completion");
    expect(result.events.length).toBeGreaterThan(0);
    expect(result.diagnostics).toContainEqual({ code: "lunar-geometric-extension" });
    expect(result.geometrySamples).toBe(result.opportunities.filter((row) => row.status === "evaluated").length);
    for (const event of result.events) {
      const { before, after } = event.bracket;
      const first = event.appearance.startsWith("first-");
      expect(before.criteria[event.appearance]?.passesCriterion).toBe(!first);
      expect(after.criteria[event.appearance]?.passesCriterion).toBe(first);
      expect(event.at).toBe((first ? after : before).crossing.at.toISOString());
      expect(event.interpretation).toBe("lunar-geometric-arcus-only");
      expect(event.receiptScope).toBe("positions");
      expect(Date.parse(event.bracket.from)).toBeLessThan(Date.parse(event.bracket.to));
      expect(Date.parse(event.bracket.from)).toBeGreaterThanOrEqual(Date.parse(result.from));
      expect(Date.parse(event.bracket.to)).toBeLessThan(Date.parse(result.to));
      for (const opportunity of [before, after]) {
        const fresh = sunBodyGeometry("Moon", opportunity.crossing.at, SITE);
        expect(opportunity.geometry).toEqual(fresh);
        expect(opportunity.criteria[event.appearance]).toEqual(horizonArcusVisionis(
          opportunity.geometry.topocentric.sun.horizontal.altitudeDeg, MOON_MODEL.thresholds[event.appearance as keyof typeof MOON_MODEL.thresholds]
        ));
        expect(result.observing.horizons.target?.events).toContain(opportunity.crossing);
        expect(result.observing.horizons.sun?.events).toContain(opportunity.solarHalf.start);
        expect(result.observing.horizons.sun?.events).toContain(opportunity.solarHalf.end);
      }
    }
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.events)).toBe(true);
    expect(Object.isFrozen(result.model.thresholds)).toBe(true);
  });

  it.each(VISIBILITY_BODIES)("evaluates %s crossings on the engine's airless horizon", (body) => {
    const result = heliacalEvents(body, SITE, "2001-02-03", "2001-02-06", body === "Moon" ? MOON_MODEL : MODEL);
    expect(result.status).toBe("complete");
    if (result.status !== "complete") throw new Error("Expected completion");
    expect(result.opportunities.length).toBeGreaterThan(0);
    for (const support of [result.observing.horizons.sun, result.observing.horizons.target]) {
      expect(support?.conventions).toEqual({ limb: "centre", refraction: "none", refractionArcmin: 0 });
    }
    for (const opportunity of result.opportunities) {
      if (opportunity.status !== "evaluated") continue;
      expect(opportunity.crossing.kind).toBe(opportunity.period === "morning" ? "rise" : "set");
      expect(opportunity.geometry.at).toBe(opportunity.crossing.at.toISOString());
      expect(opportunity.geometry.body).toBe(body);
      expect(opportunity.crossing.position.status).toBe("ok");
    }
  });

  it("retains daylight failures even though they have no observing window", () => {
    const result = heliacalEvents("Venus", SITE, "2024-06-01", "2024-06-10", {
      model: "horizon-arcus-visionis/1", thresholds: { "first-morning": 5, "last-evening": 5 }
    });
    expect(result.status).toBe("complete");
    if (result.status !== "complete") throw new Error("Expected completion");
    expect(result.opportunities.some((row) => row.status === "evaluated"
      && row.geometry.topocentric.sun.horizontal.altitudeDeg > 0)).toBe(true);
  });

  it("does not fabricate polar crossings or skip their unavailable opportunities", () => {
    const result = heliacalEvents("Venus", { latitude: 80, longitude: 0 }, "2024-06-20", "2024-06-23", MODEL);
    expect(result.status).toBe("complete");
    if (result.status !== "complete") throw new Error("Expected completion");
    expect(result.events).toEqual([]);
    expect(result.opportunities.length).toBeGreaterThan(0);
    expect(result.opportunities.every((row) => row.status === "unavailable" && row.reason === "missing-crossing")).toBe(true);
    expect(result.geometrySamples).toBe(0);
    expect(result.observing.diagnostics).toContainEqual({ body: "Venus", code: "above-throughout-support", scope: "support-search" });
  });
});

describe("heliacal validation and bounds", () => {
  it("exposes the supported names and work limit", () => {
    expect(HELIACAL_APPEARANCES).toEqual(["first-morning", "last-evening", "first-evening", "last-morning"]);
    expect(HELIACAL_SEARCH_LIMITS).toEqual({ defaultMaxGeometrySamples: 800 });
    expect(Object.isFrozen(HELIACAL_SEARCH_LIMITS)).toBe(true);
  });

  it.each([
    null, {}, { ...MODEL, model: "arcus-visionis-altitude/1" }, { ...MODEL, thresholds: {} },
    { ...MODEL, thresholds: { "first-morning": -1 } }, { ...MODEL, thresholds: { "first-morning": 91 } },
    { ...MODEL, thresholds: { "first-morning": NaN } }, { ...MODEL, thresholds: { "first-morning": Infinity } },
    { ...MODEL, thresholds: { "first-morning": "10" } }, { ...MODEL, thresholds: { typo: 10 } },
    { ...MODEL, photometry: null }, { ...MODEL, thresholds: null }
  ])("rejects an invalid model before horizon work: %j", (model) => {
    const search = vi.spyOn(windows, "observingWindows");
    expect(() => heliacalEvents("Venus", SITE, "2001-02-03", "2001-02-06", model as HorizonArcusModel)).toThrow(RangeError);
    expect(search).not.toHaveBeenCalled();
  });

  it("rejects accessor parameters without executing them", () => {
    const get = vi.fn(() => 5);
    expect(() => heliacalEvents("Venus", SITE, "2001-02-03", "2001-02-06", {
      model: "horizon-arcus-visionis/1", thresholds: Object.defineProperty({}, "first-morning", { get })
    })).toThrow(RangeError);
    expect(get).not.toHaveBeenCalled();
  });

  it.each(["Moon", "Mars", "Jupiter", "Saturn"] as const)("rejects inapplicable appearances for %s", (body) => {
    const thresholds = body === "Moon" ? { "first-morning": 10 } : { "first-evening": 10 };
    expect(() => heliacalEvents(body, SITE, "2001-02-03", "2001-02-06", {
      model: "horizon-arcus-visionis/1", thresholds
    })).toThrow(/not an available heliacal appearance/);
  });

  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, null, "5"])("rejects invalid geometry budget %s", (value) => {
    expect(() => heliacalEvents("Venus", SITE, "2001-02-03", "2001-02-06", MODEL, { maxGeometrySamples: value as number })).toThrow(RangeError);
  });

  it.each([
    [SITE, "2001-02-03", "2002-02-05", {}, "range-budget"],
    [{ latitude: 90, longitude: 0 }, "2001-02-03", "2001-02-06", {}, "geographic-pole"],
    [SITE, "1800-01-01", "1800-01-02", {}, "support-outside-reference-span"],
    [SITE, "2001-02-03", "2001-02-06", { maxSamples: 1 }, "sample-budget"]
  ] as const)("propagates bounded support refusal %s %s", (site, from, to, options, reason) => {
    const positions = vi.spyOn(geometry, "sunBodyGeometry");
    const result = heliacalEvents("Venus", site, from, to, MODEL, options);
    expect(result).toMatchObject({ status: "refused", reason, events: [], opportunities: [], geometrySamples: 0 });
    expect(positions).not.toHaveBeenCalled();
  });

  it("preflights the exact geometry budget and allows an exact budget fit", () => {
    const baseline = heliacalEvents("Moon", SITE, "2001-02-01", "2001-03-15", MOON_MODEL);
    expect(baseline.status).toBe("complete");
    expect(baseline.geometrySamples).toBeGreaterThan(1);
    const solve = vi.spyOn(windows, "observingWindows").mockReturnValue(baseline.observing);
    const positions = vi.spyOn(geometry, "sunBodyGeometry");
    const refused = heliacalEvents("Moon", SITE, "2001-02-01", "2001-03-15", MOON_MODEL, {
      maxGeometrySamples: baseline.geometrySamples - 1
    });
    expect(refused).toMatchObject({ status: "refused", reason: "geometry-budget", events: [], opportunities: [], geometrySamples: 0 });
    expect(positions).not.toHaveBeenCalled();
    const complete = heliacalEvents("Moon", SITE, "2001-02-01", "2001-03-15", MOON_MODEL, {
      maxGeometrySamples: baseline.geometrySamples
    });
    expect(complete.status).toBe("complete");
    expect(complete.geometrySamples).toBe(complete.maxGeometrySamples);
    expect(solve).toHaveBeenCalledTimes(2);
  });
});
