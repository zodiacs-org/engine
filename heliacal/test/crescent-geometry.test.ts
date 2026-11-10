import { describe, expect, it } from "vitest";

import { SKY_RADII_KM } from "../../src/sky/riseset.js";
import {
  CRESCENT_GEOMETRY_CONSTANTS, CRESCENT_GEOMETRY_CONVENTIONS, crescentGeometry
} from "../src/crescent-geometry.js";
import type { SunBodyGeometry } from "../src/geometry.js";

// Independent right-triangle inputs: a range twice the relevant radius gives
// a 30-degree angular radius. These invented distances are deliberately not
// lunar ephemeris predictions. Constants are checked against the cited sources.
const AU_KM = 149_597_870.7;
const EARTH_RADIUS_KM = 6_378.1366;
const MOON_RADIUS_KM = 1_737.4;

function sample(geoDistance: unknown = 2 * EARTH_RADIUS_KM / AU_KM,
  topoDistance: unknown = 2 * MOON_RADIUS_KM / AU_KM, topoElongation: unknown = 60): SunBodyGeometry {
  // Only fields consumed by this pure adapter are supplied. No invented
  // engine receipt is constructed or presented as authenticated geometry.
  return {
    status: "ok", body: "Moon",
    geocentric: {
      target: { equatorial: { dist: geoDistance }, horizontal: { altitudeDeg: 4 } },
      sun: { horizontal: { altitudeDeg: -6 } }, elongationDeg: 30
    },
    topocentric: {
      target: { equatorial: { dist: topoDistance }, horizontal: { altitudeDeg: 3 } },
      sun: { horizontal: { altitudeDeg: -6.001 } }, elongationDeg: topoElongation
    }
  } as unknown as SunBodyGeometry;
}

describe("crescent geometry adapter", () => {
  it("records source-backed constants and reuses the engine's lunar radius", () => {
    // IERS TN36 Table 1.1 p.18; JPL satellite physical parameters Moon row;
    // JPL astrodynamic parameters astronomical-unit row. See SOURCES.md.
    expect(CRESCENT_GEOMETRY_CONSTANTS).toEqual({
      earthEquatorialRadiusKm: EARTH_RADIUS_KM,
      moonMeanRadiusKm: MOON_RADIUS_KM,
      kilometresPerAu: AU_KM
    });
    expect(CRESCENT_GEOMETRY_CONSTANTS.moonMeanRadiusKm).toBe(SKY_RADII_KM.Moon);
    expect(Object.isFrozen(CRESCENT_GEOMETRY_CONSTANTS)).toBe(true);
  });

  it("matches exact right-triangle parallax and width arithmetic at distinct origins", () => {
    const result = crescentGeometry(sample());
    // asin(1/2)=30 degrees; 1-cos(60 degrees)=1/2. The gates allow
    // floating arithmetic rounding, not any ephemeris or visibility error.
    expect(result.moonHorizontalParallaxArcmin).toBeCloseTo(1800, 10);
    expect(result.moonTopocentricSemidiameterArcmin).toBeCloseTo(1800, 10);
    expect(result.crescentWidthTopocentricArcmin).toBeCloseTo(900, 10);
    expect(result.yallop).toEqual({
      moonAltitudeGeocentricDeg: 4, sunAltitudeGeocentricDeg: -6,
      elongationGeocentricDeg: 30, moonHorizontalParallaxArcmin: result.moonHorizontalParallaxArcmin
    });
    expect(result.odeh).toEqual({
      moonAltitudeTopocentricDeg: 3, sunAltitudeTopocentricDeg: -6.001,
      crescentWidthTopocentricArcmin: result.crescentWidthTopocentricArcmin
    });
    expect(result.conventions).toBe(CRESCENT_GEOMETRY_CONVENTIONS);
    expect(result.conventions.widthApproximation).toContain("library-distant-sun");
    expect(result.conventions.widthApproximation).toContain("not-finite-sun-phase");
  });

  it.each([[0, 0], [90, 1800], [180, 3600]])(
    "retains the width identity for topocentric elongation %s degrees", (elongation, expected) => {
      expect(crescentGeometry(sample(undefined, undefined, elongation)).crescentWidthTopocentricArcmin)
        .toBeCloseTo(expected, 10);
    }
  );

  it("retains narrow crescents without cancellation in one minus cosine", () => {
    const elongation = 1e-6;
    const result = crescentGeometry(sample(undefined, undefined, elongation));
    // Leading small-angle term. Relative truncation is bounded by e^2/12,
    // below the floating gate for this invented angle.
    const expected = 1800 * (elongation * Math.PI / 180) ** 2 / 2;
    expect(result.crescentWidthTopocentricArcmin).toBeGreaterThan(0);
    expect(Math.abs(result.crescentWidthTopocentricArcmin / expected - 1)).toBeLessThan(1e-14);
  });

  it("copies inputs into frozen model geometries", () => {
    const input = sample();
    const result = crescentGeometry(input);
    (input.geocentric.target.horizontal as { altitudeDeg: number }).altitudeDeg = 50;
    (input.topocentric.target.horizontal as { altitudeDeg: number }).altitudeDeg = 40;
    expect(result.yallop.moonAltitudeGeocentricDeg).toBe(4);
    expect(result.odeh.moonAltitudeTopocentricDeg).toBe(3);
    for (const value of [result, result.yallop, result.odeh, result.constants, result.conventions]) {
      expect(Object.isFrozen(value)).toBe(true);
    }
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it.each([null, undefined, {}, { ...sample(), body: "Venus" }, { ...sample(), status: "refused" }])(
    "requires successful Moon geometry %j", (input) => {
      expect(() => crescentGeometry(input as never)).toThrow(RangeError);
    }
  );

  it.each([null, NaN, Infinity, -Infinity, 0, -1, "1", Number.MIN_VALUE])(
    "rejects invalid or interior ranges %j at both origins", (range) => {
      expect(() => crescentGeometry(sample(range))).toThrow(RangeError);
      expect(() => crescentGeometry(sample(undefined, range))).toThrow(RangeError);
    }
  );

  it("rejects ranges on the reference surface", () => {
    expect(() => crescentGeometry(sample(EARTH_RADIUS_KM / AU_KM))).toThrow(RangeError);
    expect(() => crescentGeometry(sample(undefined, MOON_RADIUS_KM / AU_KM))).toThrow(RangeError);
  });

  it.each([NaN, Infinity, null, -1, 181])("rejects invalid topocentric elongation %j", (elongation) => {
    expect(() => crescentGeometry(sample(undefined, undefined, elongation))).toThrow(RangeError);
  });

  it("validates each copied altitude and the geocentric elongation", () => {
    for (const origin of ["geocentric", "topocentric"] as const) {
      for (const body of ["sun", "target"] as const) {
        const input = sample();
        (input[origin][body].horizontal as { altitudeDeg: number }).altitudeDeg = 91;
        expect(() => crescentGeometry(input)).toThrow(RangeError);
      }
    }
    const input = sample();
    (input.geocentric as { elongationDeg: number }).elongationDeg = -1;
    expect(() => crescentGeometry(input)).toThrow(RangeError);
  });
});
