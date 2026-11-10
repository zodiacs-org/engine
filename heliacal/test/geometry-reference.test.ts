import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { equatorialToHorizontal, sunBodyGeometry } from "../src/index.js";
import type { Observer } from "../src/index.js";

interface ReferenceCase {
  body: "Sun" | "Moon";
  center: "geocentric" | "topocentric";
  expected: {
    rightAscensionDegrees: number;
    declinationDegrees: number;
    longitudeDegrees: number;
    latitudeDegrees: number;
    distanceAu: number;
    azimuthDegrees?: number;
    altitudeDegrees?: number;
    sunSeparationDegrees?: number;
  };
}

const fixture = JSON.parse(readFileSync(new URL("./fixtures/geometry-reference.json", import.meta.url), "utf8")) as {
  horizons: {
    at: string;
    observer: Observer;
    tolerance: {
      directionArcsec: Record<"Sun" | "Moon", number>;
      sunSeparationArcsec: number;
      relativeDistance: Record<"Sun" | "Moon", number>;
    };
    cases: ReferenceCase[];
  };
  erfa: {
    inputRadians: { hourAngle: number; declination: number; latitude: number };
    expectedRadians: { azimuth: number; altitude: number };
    toleranceDegrees: number;
  };
};

const RAD = Math.PI / 180;

// Independent haversine metric for small reference differences. The library's
// angular-separation implementation uses Cartesian cross and dot products.
function errorArcsec(lon: number, lat: number, expectedLon: number, expectedLat: number): number {
  const haversine = Math.sin((lat - expectedLat) * RAD / 2) ** 2
    + Math.cos(lat * RAD) * Math.cos(expectedLat * RAD) * Math.sin((lon - expectedLon) * RAD / 2) ** 2;
  return 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, haversine)))) / RAD * 3600;
}

describe("independent published geometry examples", () => {
  it("matches ERFA's hd2ae worked transform with degree inputs", () => {
    const { inputRadians: input, expectedRadians: expected, toleranceDegrees: tolerance } = fixture.erfa;
    const result = equatorialToHorizontal(0, input.declination / RAD, input.latitude / RAD, input.hourAngle / RAD);
    expect(result.azimuthDeg).not.toBeNull();
    expect(Math.abs(result.azimuthDeg! - expected.azimuth / RAD)).toBeLessThanOrEqual(tolerance);
    expect(Math.abs(result.altitudeDeg - expected.altitude / RAD)).toBeLessThanOrEqual(tolerance);
  });

  it.each(fixture.horizons.cases)("compares $center $body with JPL Horizons at the recorded epoch", (row) => {
    const { at, observer, tolerance } = fixture.horizons;
    const result = sunBodyGeometry("Moon", at, observer);
    if (result.status !== "ok") throw new Error(result.detail);
    const pair = result[row.center];
    const body = row.body === "Sun" ? pair.sun : pair.target;
    const expected = row.expected;
    const directionGate = tolerance.directionArcsec[row.body];
    expect(errorArcsec(
      body.equatorial.lon, body.equatorial.lat, expected.rightAscensionDegrees, expected.declinationDegrees
    ), "equatorial direction error in arcseconds").toBeLessThanOrEqual(directionGate);
    expect(errorArcsec(
      body.ecliptic.lon, body.ecliptic.lat, expected.longitudeDegrees, expected.latitudeDegrees
    ), "ecliptic direction error in arcseconds").toBeLessThanOrEqual(directionGate);
    for (const frame of [body.ecliptic, body.equatorial]) {
      expect(frame.dist).not.toBeNull();
      expect(Math.abs(frame.dist! / expected.distanceAu - 1), "relative distance error")
        .toBeLessThanOrEqual(tolerance.relativeDistance[row.body]);
    }
    if (expected.azimuthDegrees !== undefined && expected.altitudeDegrees !== undefined) {
      expect(body.horizontal.azimuthDeg).not.toBeNull();
      expect(errorArcsec(
        body.horizontal.azimuthDeg!, body.horizontal.altitudeDeg, expected.azimuthDegrees, expected.altitudeDegrees
      ), "horizontal direction error in arcseconds").toBeLessThanOrEqual(directionGate);
    }
    if (expected.sunSeparationDegrees !== undefined) {
      expect(Math.abs(pair.elongationDeg - expected.sunSeparationDegrees) * 3600, "Sun/body separation error in arcseconds")
        .toBeLessThanOrEqual(tolerance.sunSeparationArcsec);
    }
  });
});
