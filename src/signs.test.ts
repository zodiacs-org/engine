/**
 * The root's sign helpers at the cusps. The arbiter is the definition: sign
 * k (0 = Aries) covers ecliptic longitudes [30k, 30k + 30) degrees, and a
 * longitude is taken modulo 360 into [0, 360).
 *
 * Known deviation, recorded with `it.fails` below: normalizeLongitude
 * computes ((lon % 360) + 360) % 360, and the addition of 360 rounds, so a
 * longitude already in [0, 360) can move by up to 2^-44 degrees (about
 * 5.7e-14 degrees, 2e-10 arcseconds). A longitude within that distance below
 * a cusp therefore reads as the next sign. Fixing it changes packed output,
 * so it waits for a release candidate; when it is fixed, the `it.fails`
 * cases start to fail and become plain `it`.
 */
import { describe, expect, it } from "vitest";
import { SIGN_SLUGS, degreeInSign, normalizeLongitude, signForLongitude, signIndexForLongitude } from "./index.js";

/** The adjacent double toward +Infinity (up) or -Infinity (down), for finite non-zero x. */
function step(x: number, direction: 1 | -1): number {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, x);
  const bits = view.getBigUint64(0);
  view.setBigUint64(0, (x > 0) === (direction > 0) ? bits + 1n : bits - 1n);
  return view.getFloat64(0);
}

/** A deterministic spread of longitudes in [0, 360). */
const SPREAD = Array.from({ length: 2000 }, (_, i) => (i * 360) / 2000 + ((i * 7919) % 1000) * 1e-7);

describe("normalizeLongitude", () => {
  it("maps every finite longitude into [0, 360), including the doubles just below 0 and 360", () => {
    const cases = [0, -0, 360, -360, 720, 359, -1, step(360, -1), step(-360, 1), -Number.MIN_VALUE, -1e-14, -3e-14, 1e20, -1e20, Number.MAX_VALUE, -Number.MAX_VALUE];
    for (const lon of cases) {
      const value = normalizeLongitude(lon);
      expect(value, String(lon)).toBeGreaterThanOrEqual(0);
      expect(value, String(lon)).toBeLessThan(360);
    }
  });

  it("returns +0 for 0, -0 and whole turns", () => {
    for (const lon of [0, -0, 360, -360, 3600]) expect(Object.is(normalizeLongitude(lon), 0), String(lon)).toBe(true);
  });

  it("subtracts whole turns, and moves a longitude already in range by at most 2^-44 degrees", () => {
    expect(normalizeLongitude(370.25)).toBe(10.25);
    expect(normalizeLongitude(-90.5)).toBe(269.5);
    for (const lon of SPREAD) {
      expect(Math.abs(normalizeLongitude(lon) - lon), String(lon)).toBeLessThanOrEqual(2 ** -44);
      expect(Math.abs(normalizeLongitude(lon + 720) - lon), String(lon + 720)).toBeLessThanOrEqual(2 ** -43);
      expect(Math.abs(normalizeLongitude(lon - 360) - lon), String(lon - 360)).toBeLessThanOrEqual(2 ** -44);
    }
  });

  it.fails("known deviation: keeps a longitude already in [0, 360) exactly", () => {
    for (const lon of [0.1, 29.999999, 123.456789, step(360, -1)]) expect(normalizeLongitude(lon), String(lon)).toBe(lon);
  });

  it("refuses NaN and the infinities, as do the helpers built on it", () => {
    for (const lon of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(() => normalizeLongitude(lon)).toThrow(new RangeError("Longitude must be finite."));
      expect(() => signIndexForLongitude(lon)).toThrow(RangeError);
      expect(() => signForLongitude(lon)).toThrow(RangeError);
      expect(() => degreeInSign(lon)).toThrow(RangeError);
    }
  });
});

describe("the sign of a longitude at each cusp", () => {
  for (let k = 0; k < 12; k += 1) {
    const cusp = 30 * k;
    it(`puts ${cusp}° in ${SIGN_SLUGS[k]} at 0°, a nanodegree below it in the previous sign, and a nanodegree above it in ${SIGN_SLUGS[k]}`, () => {
      expect(signIndexForLongitude(cusp)).toBe(k);
      expect(signForLongitude(cusp).slug).toBe(SIGN_SLUGS[k]);
      expect(degreeInSign(cusp)).toBe(0);

      const previous = (k + 11) % 12;
      const below = cusp - 1e-9;
      expect(signIndexForLongitude(below)).toBe(previous);
      expect(signForLongitude(below).slug).toBe(SIGN_SLUGS[previous]);
      expect(degreeInSign(below)).toBeCloseTo(30 - 1e-9, 9);
      expect(degreeInSign(below)).toBeLessThan(30);

      const above = cusp + 1e-9;
      expect(signIndexForLongitude(above)).toBe(k);
      expect(degreeInSign(above)).toBeGreaterThan(0);
      expect(degreeInSign(above)).toBeCloseTo(1e-9, 9);
    });
  }

  it.fails("known deviation: puts the double just below each cusp in the previous sign", () => {
    for (let k = 0; k < 12; k += 1) {
      const below = k === 0 ? step(360, -1) : step(30 * k, -1);
      expect(signIndexForLongitude(below), String(below)).toBe((k + 11) % 12);
    }
  });

  it("gives the same sign and degree one or more whole turns away, in either direction", () => {
    for (let k = 0; k < 12; k += 1) {
      for (const turns of [-3, -1, 1, 5]) {
        const lon = 30 * k + 15 + 360 * turns;
        expect(signIndexForLongitude(lon), String(lon)).toBe(k);
        expect(degreeInSign(lon), String(lon)).toBe(15);
      }
    }
  });

  it("never reads a longitude as 360: one too small to survive the turn is Aries 0°", () => {
    // -1e-14 + 360 rounds to 360, which the second remainder makes 0.
    expect(signIndexForLongitude(-1e-14)).toBe(0);
    expect(degreeInSign(-1e-14)).toBe(0);
    expect(signIndexForLongitude(-1e-9)).toBe(11);
  });
});
