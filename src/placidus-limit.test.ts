import { describe, expect, it } from "vitest";

import { computeChart } from "./ephemeris.js";
import { normalizeLongitude } from "./signs.js";

// The preregistered Placidus ladder in zodiacs.org's repository (brief v1 rule
// 1h; docs/platform/evidence/engine-beyond-swiss/corpora/, grid L): every three
// hours on 21 June 1800, 2000 and 2200, at ±66.05° to ±66.55°, longitude 0.
// Beside each instant, ERFA's limit from angle-grid-erfa.json: 90° − ε, with ε
// the true obliquity (obl06 plus the Δε of nut06a) on this engine's clock. The
// limit allows Placidus on 320 of the 336 cases, the count Swiss Ephemeris
// computes.
const LIMITS: ReadonlyArray<readonly [utc: string, limit: number]> = [
  ["1800-06-21T00:00:00Z", 66.532631398],
  ["1800-06-21T03:00:00Z", 66.532632224],
  ["1800-06-21T06:00:00Z", 66.532632978],
  ["1800-06-21T09:00:00Z", 66.532633659],
  ["1800-06-21T12:00:00Z", 66.532634264],
  ["1800-06-21T15:00:00Z", 66.532634791],
  ["1800-06-21T18:00:00Z", 66.532635238],
  ["1800-06-21T21:00:00Z", 66.532635604],
  ["2000-06-21T00:00:00Z", 66.562049745],
  ["2000-06-21T03:00:00Z", 66.56204832],
  ["2000-06-21T06:00:00Z", 66.562046878],
  ["2000-06-21T09:00:00Z", 66.56204542],
  ["2000-06-21T12:00:00Z", 66.562043951],
  ["2000-06-21T15:00:00Z", 66.562042474],
  ["2000-06-21T18:00:00Z", 66.562040992],
  ["2000-06-21T21:00:00Z", 66.562039508],
  ["2200-06-21T00:00:00Z", 66.589210414],
  ["2200-06-21T03:00:00Z", 66.589210855],
  ["2200-06-21T06:00:00Z", 66.589211354],
  ["2200-06-21T09:00:00Z", 66.589211913],
  ["2200-06-21T12:00:00Z", 66.58921253],
  ["2200-06-21T15:00:00Z", 66.589213204],
  ["2200-06-21T18:00:00Z", 66.589213936],
  ["2200-06-21T21:00:00Z", 66.589214725]
];
const LATITUDES = [66.05, 66.1, 66.2, 66.3, 66.4, 66.5, 66.55];

describe("the Placidus limit against the ERFA arbiter (brief v1 rule 1h)", () => {
  const cases = LIMITS.flatMap(([utc, limit]) =>
    LATITUDES.flatMap((magnitude) =>
      [magnitude, -magnitude].map((latitude) => ({ utc, latitude, limit }))
    )
  );

  it("computes Placidus exactly where the arbiter's limit allows it", () => {
    let computed = 0;
    for (const { utc, latitude, limit } of cases) {
      const chart = computeChart({
        utc: new Date(utc),
        latitude,
        longitude: 0,
        houseSystem: "placidus",
        timeKnown: true
      });
      const allowed = Math.abs(latitude) < limit;
      expect(chart.houses?.system).toBe(allowed ? "placidus" : "whole");
      expect(chart.flags.includes("polar-fallback")).toBe(!allowed);
      if (!allowed) continue;
      computed += 1;
      // Twelve distinct cusps in zodiacal order: the forward gaps go once round.
      const cusps = chart.houses!.cusps;
      const gaps = cusps.map((cusp, index) => normalizeLongitude(cusps[(index + 1) % 12]! - cusp));
      expect(gaps.every((gap) => gap > 0)).toBe(true);
      expect(gaps.reduce((sum, gap) => sum + gap, 0)).toBeCloseTo(360, 9);
    }
    expect([cases.length, computed]).toEqual([336, 320]);
  });
});
