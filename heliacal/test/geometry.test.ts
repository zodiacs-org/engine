import { describe, expect, it } from "vitest";

import { HORIZONS_2020 } from "../../src/fixtures/horizons-2020.js";
import {
  VISIBILITY_BODIES, angularSeparation, enginePosition, equatorialToHorizontal, sunBodyGeometry
} from "../src/index.js";
import type { SphericalDirection } from "../src/index.js";

const direction = (longitudeDeg: number, latitudeDeg = 0): SphericalDirection => ({ longitudeDeg, latitudeDeg });
const SITE = { latitude: 13, longitude: -42, height: 120 };
const AT = "2001-02-03T04:05:06.007Z";

describe("angular separation of spherical directions", () => {
  it.each([
    [direction(0), direction(0), 0],
    [direction(0), direction(90), 90],
    [direction(0), direction(180), 180],
    [direction(359), direction(1), 2],
    [direction(29, 90), direction(312, 90), 0],
    [direction(29, -90), direction(312, 90), 180],
    [direction(0, 30), direction(0, -30), 60],
    [direction(0, 60), direction(180, 60), 60]
  ])("matches the exact geometric identity %j %j -> %s degrees", (a, b, expected) => {
    expect(angularSeparation(a, b)).toBeCloseTo(expected, 12);
    expect(angularSeparation(b, a)).toBeCloseTo(expected, 12);
  });

  it("keeps small angles and small departures from opposition", () => {
    expect(angularSeparation(direction(0), direction(1e-12))).toBeCloseTo(1e-12, 24);
    expect(angularSeparation(direction(0), direction(180 - 1e-9))).toBeCloseTo(180 - 1e-9, 12);
    expect(angularSeparation(direction(0, 0), direction(0, 1e-12))).toBeCloseTo(1e-12, 24);
  });

  it.each([
    null, undefined, [], {}, { longitudeDeg: 0 }, direction(-1), direction(360), direction(NaN),
    direction(0, Infinity), direction(0, -91), direction(0, 91), { ...direction(0), units: "radians" }
  ])("rejects invalid direction %j", (value) => {
    expect(() => angularSeparation(value as never, direction(0))).toThrow(RangeError);
    expect(() => angularSeparation(direction(0), value as never)).toThrow(RangeError);
  });

  it("refuses accessor coordinates without invoking them", () => {
    let read = false;
    const input = { get longitudeDeg() { read = true; return 0; }, latitudeDeg: 0 };
    expect(() => angularSeparation(input, direction(0))).toThrow(RangeError);
    expect(read).toBe(false);
  });
});

describe("airless equatorial to horizontal projection", () => {
  it.each([
    [90, 0, 0, 0, 90, -90],
    [270, 0, 0, 0, 270, 90],
    [0, 0, 45, 45, 180, 0],
    [0, 0, -45, 45, 0, 0],
    [0, 0, 0, 90, null, 0],
    [180, 0, 0, -90, null, -180]
  ] as const)("projects RA %s dec %s latitude %s at LST zero", (ra, dec, latitude, altitude, azimuth, hourAngle) => {
    const result = equatorialToHorizontal(ra, dec, latitude, 0);
    expect(result.altitudeDeg).toBeCloseTo(altitude, 12);
    if (azimuth === null) expect(result.azimuthDeg).toBeNull();
    else expect(result.azimuthDeg).toBeCloseTo(azimuth, 12);
    expect(result.hourAngleDeg).toBe(hourAngle);
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("marks undefined azimuths and hour angles explicitly", () => {
    for (const latitude of [-90, 90]) {
      const atPole = equatorialToHorizontal(57, 20, latitude, 123);
      expect(atPole.azimuthDeg).toBeNull();
      expect(atPole.altitudeDeg).toBeCloseTo(Math.sign(latitude) * 20, 12);
    }
    for (const ra of [0, 123, 359]) {
      expect(equatorialToHorizontal(ra, 90, 13, 42)).toEqual({ altitudeDeg: 13, azimuthDeg: 0, hourAngleDeg: null });
      expect(equatorialToHorizontal(ra, -90, 13, 42)).toEqual({ altitudeDeg: -13, azimuthDeg: 180, hourAngleDeg: null });
    }
  });

  it("wraps the meridian without losing a small hour angle", () => {
    expect(equatorialToHorizontal(359, 0, 13, 1).hourAngleDeg).toBe(2);
    expect(equatorialToHorizontal(1, 0, 13, 359).hourAngleDeg).toBe(-2);
    expect(equatorialToHorizontal(0, 0, 13, 1e-12).hourAngleDeg).toBe(1e-12);
  });

  it("preserves angular separation under the local rotation", () => {
    const a = direction(57, 23);
    const b = direction(189, -42);
    for (const latitude of [-89.9, -45, 0, 45, 89.9]) {
      for (const lst of [0, 90, 180, 270, 359.9]) {
        const h1 = equatorialToHorizontal(a.longitudeDeg, a.latitudeDeg, latitude, lst);
        const h2 = equatorialToHorizontal(b.longitudeDeg, b.latitudeDeg, latitude, lst);
        expect(h1.azimuthDeg).not.toBeNull();
        expect(h2.azimuthDeg).not.toBeNull();
        const rotated = angularSeparation(direction(h1.azimuthDeg!, h1.altitudeDeg), direction(h2.azimuthDeg!, h2.altitudeDeg));
        expect(rotated).toBeCloseTo(angularSeparation(a, b), 12);
      }
    }
  });

  it.each([
    [-1, 0, 0, 0], [360, 0, 0, 0], [NaN, 0, 0, 0], [0, -91, 0, 0],
    [0, 91, 0, 0], [0, 0, -91, 0], [0, 0, 91, 0], [0, 0, 0, 360],
    [0, 0, 0, -1], [0, 0, 0, Infinity], [0, null, 0, 0], ["0", 0, 0, 0]
  ])("rejects malformed angles %j %j %j %j", (ra, dec, latitude, lst) => {
    expect(() => equatorialToHorizontal(ra as number, dec as number, latitude!, lst!)).toThrow(RangeError);
  });
});

// Integration and identities below are not independent ephemeris evidence.
describe("Sun/body geometry from engine positions", () => {
  it.each(VISIBILITY_BODIES)("preserves positions, frames, receipts and units for %s", (body) => {
    const geometry = sunBodyGeometry(body, AT, SITE);
    if (geometry.status !== "ok") throw new Error(geometry.detail);
    expect(geometry.body).toBe(body);
    expect(geometry.at).toBe(AT);
    expect(geometry.observer).toEqual(SITE);
    expect(geometry.units).toEqual({ angles: "degrees", distances: "au", observerHeight: "metres" });
    expect(geometry.receiptScope).toBe("positions");
    expect(geometry.conventions.horizontal).toBe("geodetic-tangent-plane;centre;no-refraction;no-dip");
    expect(geometry.localApparentSiderealTimeDeg).toBeGreaterThanOrEqual(0);
    expect(geometry.localApparentSiderealTimeDeg).toBeLessThan(360);
    for (const center of ["geocentric", "topocentric"] as const) {
      const pair = geometry[center];
      for (const [target, name] of [[pair.sun, "Sun"], [pair.target, body]] as const) {
        for (const frame of ["equatorial", "ecliptic"] as const) {
          const position = target[frame];
          const expected = enginePosition(name, AT, {
            frame: `${frame}-true-of-date`, ...(center === "topocentric" ? { observer: SITE } : {})
          });
          expect(position).toEqual(expected);
          expect(position.receipt.instants[0]?.utc).toBe(AT);
          expect(position.receipt.request.center).toEqual(center === "topocentric" ? { topocentric: SITE } : "geocentric");
        }
        expect(target.horizontal.altitudeDeg).toBeGreaterThanOrEqual(-90);
        expect(target.horizontal.altitudeDeg).toBeLessThanOrEqual(90);
        expect(Object.isFrozen(target)).toBe(true);
      }
      const eclipticSeparation = angularSeparation(
        direction(pair.sun.ecliptic.lon, pair.sun.ecliptic.lat),
        direction(pair.target.ecliptic.lon, pair.target.ecliptic.lat)
      );
      expect(pair.elongationDeg).toBeCloseTo(eclipticSeparation, 11);
    }
    expect(Object.isFrozen(geometry)).toBe(true);
  });

  it("keeps geocentric geometry independent of observer position while topocentric geometry changes", () => {
    const a = sunBodyGeometry("Moon", AT, SITE);
    const b = sunBodyGeometry("Moon", AT, { latitude: -13, longitude: 138, height: 3000 });
    if (a.status !== "ok" || b.status !== "ok") throw new Error("Unexpected engine refusal");
    expect(a.geocentric.target.equatorial).toEqual(b.geocentric.target.equatorial);
    expect(a.geocentric.elongationDeg).toBe(b.geocentric.elongationDeg);
    expect(a.topocentric.target.equatorial.lon).not.toBe(b.topocentric.target.equatorial.lon);
    expect(a.topocentric.elongationDeg).not.toBe(b.topocentric.elongationDeg);
  });

  it("uses east-positive longitude and equivalent dateline endpoints", () => {
    const west = sunBodyGeometry("Moon", AT, { latitude: 13, longitude: -180 });
    const east = sunBodyGeometry("Moon", AT, { latitude: 13, longitude: 180 });
    const greenwich = sunBodyGeometry("Moon", AT, { latitude: 13, longitude: 0 });
    if (west.status !== "ok" || east.status !== "ok" || greenwich.status !== "ok") throw new Error("Unexpected refusal");
    expect(west.localApparentSiderealTimeDeg).toBeCloseTo(east.localApparentSiderealTimeDeg, 12);
    expect(Math.abs(west.localApparentSiderealTimeDeg - greenwich.localApparentSiderealTimeDeg)).toBeCloseTo(180, 12);
    expect(west.topocentric.target.horizontal.altitudeDeg).toBeCloseTo(east.topocentric.target.horizontal.altitudeDeg, 12);
  });

  it("copies inputs and returns serializable explicit values at the geographic poles", () => {
    const date = new Date(AT);
    const site = { latitude: 90, longitude: 0 };
    const geometry = sunBodyGeometry("Moon", date, site);
    date.setTime(0);
    site.latitude = 0;
    if (geometry.status !== "ok") throw new Error(geometry.detail);
    expect(geometry.at).toBe(AT);
    expect(geometry.observer.latitude).toBe(90);
    expect(geometry.topocentric.target.horizontal.azimuthDeg).toBeNull();
    expect(JSON.parse(JSON.stringify(geometry))).toEqual(geometry);
  });

  it.each(["1750-02-03", "2200-01-01", "+030000-01-01"])("returns the intact engine refusal at %s", (at) => {
    const expected = enginePosition("Sun", at, { frame: "equatorial-true-of-date" });
    expect(expected.status).toBe("refused");
    expect(sunBodyGeometry("Moon", at, SITE)).toEqual(expected);
  });

  it("rejects invalid bodies, sites and instants before returning geometry", () => {
    expect(() => sunBodyGeometry("Sun" as never, AT, SITE)).toThrow(RangeError);
    expect(() => sunBodyGeometry("Uranus" as never, AT, SITE)).toThrow(RangeError);
    expect(() => sunBodyGeometry("Moon", AT, { ...SITE, pressure: 1000 } as never)).toThrow(RangeError);
    expect(() => sunBodyGeometry("Moon", "2001-02-03T04:05:06", SITE)).toThrow(RangeError);
  });
});

// Independent JPL Horizons quantity 31, committed before this project existed.
// Gates fixed before execution, based on the existing calc comparison's maxima
// plus allowance for frame/correction conventions. See fixtures/README.md.
describe("published Horizons geocentric longitudes on 2020-01-01", () => {
  it.each(VISIBILITY_BODIES)("compares the Sun and %s with the existing public reference", (body) => {
    const geometry = sunBodyGeometry(body, "2020-01-01T00:00:00Z", SITE);
    if (geometry.status !== "ok") throw new Error(geometry.detail);
    for (const [name, actual, gate] of [
      ["Sun", geometry.geocentric.sun.ecliptic.lon, 5],
      [body, geometry.geocentric.target.ecliptic.lon, body === "Moon" ? 15 : 30]
    ] as const) {
      const error = Math.abs(((actual - HORIZONS_2020[name]! + 540) % 360) - 180) * 3600;
      expect(error, `${name} longitude error in arcseconds`).toBeLessThanOrEqual(gate);
    }
  });
});
