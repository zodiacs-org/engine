import { describe, expect, it } from "vitest";
import type { Vec3 } from "../../src/calc-frames.js";
import { aberrate, AU_KM, C_AU_PER_DAY, catalogueState, JULIAN_YEAR_DAYS,
  propagateAstrometry } from "../src/astrometry.js";
import type { Astrometry } from "../src/astrometry.js";

const MAS = Math.PI / (180 * 3600 * 1000);
const zero: Vec3 = [0, 0, 0];
const base: Astrometry = {
  raDegrees: 0, decDegrees: 0, epochJulianYear: 2000, frame: "ICRS",
  raCosDecMasPerYear: 0, decMasPerYear: 0, parallaxMas: null, radialVelocityKmPerSecond: null
};

describe("stellar propagation analytic geometry", () => {
  it("advances signed epochs with tangent motion and wraps RA geometrically", () => {
    const moving = { ...base, raCosDecMasPerYear: 1000, decMasPerYear: -2000 };
    for (const years of [-100, -1, 0, 1, 100]) {
      const p = propagateAstrometry(moving, years * JULIAN_YEAR_DAYS, zero);
      expect(p[1] / p[0]).toBeCloseTo(years * 1000 * MAS, 14);
      expect(p[2] / p[0]).toBeCloseTo(years * -2000 * MAS, 14);
      expect(Math.hypot(...p)).toBeCloseTo(1, 15);
    }
    const shiftedEpoch = { ...moving, epochJulianYear: 1991.25 };
    expect(propagateAstrometry(shiftedEpoch, 0, zero)).toEqual(
      propagateAstrometry(moving, 8.75 * JULIAN_YEAR_DAYS, zero));
  });

  it("uses cos(dec)-weighted RA motion without a second cosine factor", () => {
    const state = catalogueState({ ...base, decDegrees: 60, raCosDecMasPerYear: 1000 });
    expect(state.motionPerYear[1]).toBe(1000 * MAS);
    expect(Math.hypot(...state.motionPerYear)).toBe(1000 * MAS);
    expect(state.motionPerYear[0]).toBe(0);
  });

  it("stays defined at a pole and can move across it", () => {
    const star = { ...base, decDegrees: 90, decMasPerYear: 1000 };
    const p = propagateAstrometry(star, JULIAN_YEAR_DAYS, zero);
    expect(p.every(Number.isFinite)).toBe(true);
    expect(p[0]).toBeLessThan(0);
    expect(p[2]).toBeGreaterThan(0);
    expect(Math.atan2(-p[0], p[2])).toBeCloseTo(Math.atan(1000 * MAS), 14);
  });

  it("subtracts observer parallax with the correct sign and inverse-distance units", () => {
    const near = { ...base, parallaxMas: 1000 };
    for (const baseline of [1, -1, 4.2e-5]) {
      const p = propagateAstrometry(near, 0, [0, baseline, 0]);
      expect(Math.atan2(p[1], p[0])).toBeCloseTo(-Math.atan(baseline * 1000 * MAS), 15);
    }
    expect(propagateAstrometry(base, 0, [0, 1, 0])).toEqual([1, 0, 0]);
    // Missing distance is an omission. It does not mutate the source into zero.
    expect(base.parallaxMas).toBeNull();
  });

  it("includes perspective motion only with a supplied distance and radial velocity", () => {
    const star = { ...base, parallaxMas: 1000, raCosDecMasPerYear: 1000, radialVelocityKmPerSecond: 30 };
    const years = 100;
    const p = propagateAstrometry(star, years * JULIAN_YEAR_DAYS, zero);
    const radial = 30 * 86400 * JULIAN_YEAR_DAYS / AU_KM * 1000 * MAS;
    expect(p[1] / p[0]).toBeCloseTo(years * 1000 * MAS / (1 + years * radial), 15);
    expect(p[1]).toBeLessThan(propagateAstrometry({ ...star, radialVelocityKmPerSecond: null }, years * JULIAN_YEAR_DAYS, zero)[1]);
    expect(propagateAstrometry({ ...star, parallaxMas: null }, years * JULIAN_YEAR_DAYS, zero)).toEqual(
      propagateAstrometry({ ...star, parallaxMas: null, radialVelocityKmPerSecond: null }, years * JULIAN_YEAR_DAYS, zero));
  });

  it("uses observer Rømer delay even when catalogue parallax is absent", () => {
    const star = { ...base, raCosDecMasPerYear: 1000 };
    const p = propagateAstrometry(star, 0, [1, 0, 0]);
    const years = 1 / (C_AU_PER_DAY * JULIAN_YEAR_DAYS);
    expect(p[1] / p[0]).toBeCloseTo(years * 1000 * MAS, 18);
    expect(p[1]).toBeGreaterThan(0);
  });

  it.each([
    { raDegrees: 360 }, { decDegrees: 91 }, { decDegrees: Number.NaN },
    { raCosDecMasPerYear: null }, { decMasPerYear: Number.POSITIVE_INFINITY },
    { frame: "FK5-J2000", epochJulianYear: 1991.25 }, { frame: "FK4" },
    { parallaxMas: -1 }, { radialVelocityKmPerSecond: Number.NaN }
  ])("refuses invalid or unsupported internal astrometry %#", (change) => {
    expect(() => propagateAstrometry({ ...base, ...change } as Astrometry, 0, zero)).toThrow(RangeError);
  });
});

describe("aberration analytic geometry", () => {
  it("does not move a direction without velocity or with parallel velocity", () => {
    expect(aberrate([1, 0, 0], zero)).toEqual([1, 0, 0]);
    expect(aberrate([1, 0, 0], [0.01, 0, 0])).toEqual([1, 0, 0]);
  });

  it("moves a perpendicular ray toward the observer velocity", () => {
    const beta = 0.001;
    const p = aberrate([1, 0, 0], [0, C_AU_PER_DAY * beta, 0]);
    expect(p[0]).toBeCloseTo(Math.sqrt(1 - beta * beta), 15);
    expect(p[1]).toBeCloseTo(beta, 15);
    expect(p[2]).toBe(0);
  });

  it("rejects degenerate vectors and unphysical or nonfinite observer velocities", () => {
    expect(() => aberrate(zero, zero)).toThrow(RangeError);
    expect(() => aberrate([1, 0, 0], [C_AU_PER_DAY, 0, 0])).toThrow(RangeError);
    expect(() => aberrate([1, 0, 0], [Number.NaN, 0, 0])).toThrow(RangeError);
  });
});
