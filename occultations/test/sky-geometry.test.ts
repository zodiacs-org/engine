import { describe, expect, it } from "vitest";
import type { Vec3 } from "../../src/calc-frames.js";
import { SKY_RADII_KM, STANDARD_REFRACTION_ARCMIN } from "../../src/sky.js";
import { CONTACT_SKY_MODEL, equatorialDirection, horizontalFacts, limbGeometry, positionAngleDegrees } from "../src/sky-geometry.js";

const RAD = Math.PI / 180;
const X: Vec3 = [1, 0, 0], Y: Vec3 = [0, 1, 0], Z: Vec3 = [0, 0, 1];
const direction = (lon: number, lat = 0) => equatorialDirection({ lon, lat });

describe("independent analytic sky geometry, not ephemeris accuracy", () => {
  it.each([
    [0, 1, 0], [1, 0, 90], [0, -1, 180], [-1, 0, 270]
  ])("measures north through east toward RA %s, Dec %s", (lon, lat, expected) => {
    expect(positionAngleDegrees(X, direction(lon!, lat!))).toBeCloseTo(expected!, 10);
  });

  it("handles RA wrap, poles and collinear directions without fabricated angles", () => {
    expect(positionAngleDegrees(direction(359), direction(1))).toBeCloseTo(90, 10);
    expect(positionAngleDegrees(direction(1), direction(359))).toBeCloseTo(270, 10);
    for (const source of [Z, [0, 0, -1] as Vec3]) expect(positionAngleDegrees(source, X)).toBeNull();
    expect(positionAngleDegrees(X, X)).toBeNull();
    expect(positionAngleDegrees(X, [-1, 0, 0])).toBeNull();
    expect(positionAngleDegrees(X, [1, 1e-14, 0])).toBeNull();
    expect(equatorialDirection({ lon: 145, lat: 90 })).toEqual(Z);
    expect(equatorialDirection({ lon: 212, lat: -90 })).toEqual([0, 0, -1]);
  });

  it("matches an independently constructed tangent point and sunlight normal", () => {
    const d = 400_000, D = 150_000_000, a = Math.asin(SKY_RADII_KM.Moon / d);
    // Observer at origin; Moon center (d,0,0). Ray is tangent because P dot n=0.
    const q: Vec3 = [Math.cos(a), Math.sin(a), 0];
    const n: Vec3 = [-Math.sin(a), Math.cos(a), 0];
    const P = q.map((x) => d * Math.cos(a) * x);
    for (const [elevation, expected] of [[80, "bright"], [-80, "dark"], [0, "terminator"]] as const) {
      const S = P.map((p, i) => p + D * (Math.cos(elevation * RAD) * q[i]! + Math.sin(elevation * RAD) * n[i]!)) as unknown as Vec3;
      const sky = limbGeometry(X, Y, S, d, Math.hypot(...S));
      expect(sky.contactDirection![0]).toBeCloseTo(q[0], 14);
      expect(sky.contactDirection![1]).toBeCloseTo(q[1], 14);
      expect(sky.solarAltitudeAtLimbDegrees).toBeCloseTo(elevation, 10);
      expect(sky.solarSemidiameterAtLimbDegrees).toBeCloseTo(Math.asin(SKY_RADII_KM.Sun / D) / RAD, 12);
      expect(sky.limb).toBe(expected);
      expect(sky.positionAngleDegrees).toBe(90);
    }
  });

  it("uses the finite solar disk on both sides of the local terminator", () => {
    const d = 400_000, D = 150_000_000, a = Math.asin(SKY_RADII_KM.Moon / d);
    const r = Math.asin(SKY_RADII_KM.Sun / D);
    for (const [factor, expected] of [[-1.001, "dark"], [-0.999, "terminator"], [0, "terminator"],
      [0.999, "terminator"], [1.001, "bright"]] as const) {
      const e = factor * r;
      const S: Vec3 = [d * Math.cos(a) ** 2 + D * Math.cos(a + e),
        d * Math.cos(a) * Math.sin(a) + D * Math.sin(a + e), 0];
      expect(limbGeometry(X, Y, S, d, Math.hypot(...S)).limb).toBe(expected);
    }
  });

  it("does not use undefined Sun position angle to classify new/full illumination", () => {
    for (const [sun, expected] of [[X, "dark"], [[-1, 0, 0] as Vec3, "bright"]] as const) {
      const sky = limbGeometry(X, Y, sun, 300_000, 150_000_000);
      expect(sky.brightLimbPositionAngleDegrees).toBeNull();
      expect(sky.limb).toBe(expected);
    }
    // A solar disk wider than the lunar disk straddles the tangent plane here.
    expect(limbGeometry(X, Y, [-1, 0, 0], 450_000, 150_000_000).limb).toBe("terminator");
    const polar = limbGeometry(Z, X, X, 300_000, 150_000_000);
    expect(polar.positionAngleDegrees).toBeNull();
    expect(polar.limb).toBe("bright");
    for (const target of [X, [-1, 0, 0] as Vec3]) {
      expect(limbGeometry(X, target, Y, 400_000, 150_000_000)).toMatchObject({
        limb: "undefined", contactDirection: null, positionAngleDegrees: null,
        solarAltitudeAtLimbDegrees: null, solarSemidiameterAtLimbDegrees: null
      });
    }
  });

  it("rotates cardinal directions into the local horizontal plane", () => {
    expect(horizontalFacts(X, 0, 0, 0)).toMatchObject({ geometricAltitudeDegrees: 90,
      aboveGeometricHorizon: true, azimuthDegrees: null, refractedAltitudeDegrees: 90 });
    expect(horizontalFacts([-1, 0, 0], 0, 0, 0)).toMatchObject({ geometricAltitudeDegrees: -90,
      aboveGeometricHorizon: false, azimuthDegrees: null, refractedAltitudeDegrees: null });
    expect(horizontalFacts(Y, 0, 0, 0)).toMatchObject({ geometricAltitudeDegrees: 0,
      aboveGeometricHorizon: false, azimuthDegrees: 90 });
    expect(horizontalFacts(Z, 0, 0, 0)).toMatchObject({ geometricAltitudeDegrees: 0, azimuthDegrees: 0 });
    expect(horizontalFacts([0, -1, 0], 0, 0, 0).azimuthDegrees).toBe(270);
    expect(horizontalFacts([0, 0, -1], 0, 0, 0).azimuthDegrees).toBe(180);
  });

  it("has longitude-independent polar altitude and no geographical polar azimuth", () => {
    for (const latitude of [-90, 90]) for (const lst of [0, 13, 180, 360]) {
      const sky = horizontalFacts(direction(18, 23), latitude, lst, 0);
      expect(sky.geometricAltitudeDegrees).toBeCloseTo(Math.sign(latitude) * 23, 12);
      expect(sky.azimuthDegrees).toBeNull();
    }
  });

  it("distinguishes contact point from lunar center at the horizon", () => {
    const d = 400_000, m = Math.asin(SKY_RADII_KM.Moon / d) / RAD;
    const limb = limbGeometry(direction(0, m / 2), direction(0, -1), Y, d, 150_000_000);
    // North pole: altitude equals declination. A southern limb is below the plane.
    const center = horizontalFacts(direction(0, m / 2), 90, 0, m);
    const contact = horizontalFacts(limb.contactDirection!, 90, 0, 0);
    expect(center.geometricAltitudeDegrees).toBeCloseTo(m / 2, 12);
    expect(contact.geometricAltitudeDegrees).toBeCloseTo(-m / 2, 12);
    expect(center.aboveGeometricHorizon).toBe(true);
    expect(contact.aboveGeometricHorizon).toBe(false);
    expect(contact.aboveStandardHorizon).toBe(true);
  });

  it("separates standard horizon threshold, vacuum altitude and refracted altitude", () => {
    const h = -0.4;
    const sky = horizontalFacts(direction(0, h), 90, 0, 0);
    expect(sky.geometricAltitudeDegrees).toBeCloseTo(h, 12);
    expect(sky.aboveGeometricHorizon).toBe(false);
    expect(sky.aboveStandardHorizon).toBe(true);
    expect(sky.standardHorizonMarginDegrees).toBeCloseTo(h + STANDARD_REFRACTION_ARCMIN / 60, 12);
    expect(sky.refractedAltitudeDegrees).toBeGreaterThan(h);
    // Constant horizon allowance is not used as refraction at arbitrary altitude.
    expect(sky.refractedAltitudeDegrees).not.toBeCloseTo(h + STANDARD_REFRACTION_ARCMIN / 60, 5);
    expect(CONTACT_SKY_MODEL.standardHorizonRefractionArcminutes).toBe(STANDARD_REFRACTION_ARCMIN);
    expect(CONTACT_SKY_MODEL.refractionMinimumAltitudeDegrees).toBe(-1);
    expect(CONTACT_SKY_MODEL.directionTolerance).toBe(1e-12);
    expect(horizontalFacts(direction(0, -1), 90, 0, 0).refractedAltitudeDegrees).not.toBeNull();
    expect(horizontalFacts(direction(0, -1.00001), 90, 0, 0).refractedAltitudeDegrees).toBeNull();
    expect(horizontalFacts(direction(0, 89.999), 90, 0, 0).refractedAltitudeDegrees).toBeCloseTo(89.999, 10);
  });

  it("rejects invalid geometry instead of serializing nonfinite facts", () => {
    for (const input of [{ lon: NaN, lat: 0 }, { lon: 0, lat: 91 }, { lon: Infinity, lat: 0 }]) {
      expect(() => equatorialDirection(input)).toThrow(RangeError);
    }
    expect(() => positionAngleDegrees([0, 0, 0], X)).toThrow(RangeError);
    for (const [lat, lst, radius] of [[91, 0, 0], [0, NaN, 0], [0, 0, -1], [0, 0, 90]]) {
      expect(() => horizontalFacts(X, lat!, lst!, radius!)).toThrow(RangeError);
    }
    for (const [moon, sun] of [[NaN, 150_000_000], [1700, 150_000_000], [400_000, 1_000_000]]) {
      expect(() => limbGeometry(X, Y, Z, moon!, sun!)).toThrow(RangeError);
    }
  });
});
