import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, expectTypeOf, it } from "vitest";
import * as nutationReference from "../../src/nutation.js";
import * as frameReference from "../../src/frame.js";
import * as equatorReference from "../../src/equator.js";
import { meanObliquity } from "../../src/houses.js";
import { gastHours } from "../../src/ephemeris.js";
import { timeBasis } from "../../src/time-scale.js";
import * as rust from "../ts/index.js";
import * as wasm from "../pkg/zodiacs_rustcore.js";
import { expectSameError, expectSameNumber, neighbors, outcome, randomUint32 } from "./parity-helpers.js";
import type { EclipticFrame } from "../../src/frame.js";
import type { Rows } from "../../src/equator.js";
import type { Tilt } from "../../src/nutation.js";

beforeAll(() => {
  rust.initRustCore(readFileSync(new URL("../pkg/zodiacs_rustcore_bg.wasm", import.meta.url)));
});

// Fixed before running the port. The transcendental functions can round
// differently in V8 and Rust/WASM; surrounding arithmetic keeps its order.
const NUTATION_ARCSEC = 1e-12;
const OBLIQUITY_ARCSEC = 1e-10;
const SIDEREAL_ARCSEC = 1e-8;
const COORDINATE_ARCSEC = 1e-8;
const MATRIX_ABSOLUTE = 2e-15;
const VECTOR_SCALED_ABSOLUTE = 8e-15;
// These limits apply only to the separately constructed near-pole corpus.
// Longitude is ill-conditioned as hypot(x,y) approaches zero; asin also
// amplifies rounding near +/-1. Exact pole longitudes have no angular claim.
const NEAR_POLE_LONGITUDE_ARCSEC = 0.05;
const NEAR_POLE_LATITUDE_ARCSEC = 0.02;
const DEG = Math.PI / 180;
const J2000_MS = Date.UTC(2000, 0, 1, 12);

const firstMs = Date.UTC(1800, 0, 1);
const lastMs = Date.UTC(2200, 11, 31, 23, 59, 59, 999);
const syntheticMs = [firstMs, lastMs, J2000_MS];
for (let year = 1800; year <= 2200; year++) {
  for (const month of [0, 3, 6, 9]) {
    syntheticMs.push(Date.UTC(year, month, 1 + (year + month) % 28, (year + month) % 24, 17, 43, 219));
  }
}
const next = randomUint32(0x6672616d);
for (let index = 0; index < 512; index++) {
  syntheticMs.push(firstMs + Math.floor(next() / 0x1_0000_0000 * (lastMs - firstMs)));
}
const ttInputs = syntheticMs.map((ms) => timeBasis(ms).ttDays);
const vectors: readonly (readonly [number, number, number])[] = [
  [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
  [0.31, -0.72, 0.19], [-0.125, 0.375, -0.75], [7, -11, 13], [-19, -23, 29]
];

const maxima: Record<string, number> = {};
function bounded(actual: number, expected: number, tolerance: number, quantity: string, context: string): void {
  if (!Number.isFinite(expected)) {
    expectSameNumber(actual, expected, `${quantity}: ${context}`);
    return;
  }
  const difference = Math.abs(actual - expected);
  maxima[quantity] = Math.max(maxima[quantity] ?? 0, difference);
  expect(Number.isFinite(actual), `${quantity}: ${context}`).toBe(true);
  expect(difference, `${quantity}: ${context}`).toBeLessThanOrEqual(tolerance);
}

function angular(actual: number, expected: number, tolerance: number, quantity: string, context: string, wrap = false): void {
  let difference = actual - expected;
  if (wrap) {
    // Do not add a full turn before subtracting: that would erase differences
    // smaller than one ulp at 360 degrees.
    difference %= 360;
    if (difference > 180) difference -= 360;
    if (difference < -180) difference += 360;
  }
  bounded(difference * 3600, 0, tolerance, quantity, context);
}

function compareTilt(actual: Tilt, expected: Tilt, context: string): void {
  expect(Object.keys(actual), context).toEqual(Object.keys(expected));
  for (const key of ["dpsi", "deps", "ee"] as const)
    bounded(actual[key], expected[key], NUTATION_ARCSEC, `${key} arcsec`, context);
  for (const key of ["mobl", "tobl"] as const)
    angular(actual[key], expected[key], OBLIQUITY_ARCSEC, `${key} arcsec`, context);
}

function compareRows(actual: readonly number[], expected: readonly number[], context: string): void {
  expect(actual.length, context).toBe(9);
  for (let index = 0; index < 9; index++)
    bounded(actual[index]!, expected[index]!, MATRIX_ABSOLUTE, "matrix entry absolute", `${context}, entry=${index}`);
}

function compareVector(actual: readonly number[], expected: readonly number[], vector: readonly number[], context: string): void {
  const scale = Math.max(1, vector.reduce((sum, value) => sum + Math.abs(value), 0));
  expect(actual.length, context).toBe(3);
  for (let index = 0; index < 3; index++)
    bounded((actual[index]! - expected[index]!) / scale, 0, VECTOR_SCALED_ABSOLUTE,
      "Cartesian scaled absolute", `${context}, component=${index}`);
}

afterAll(() => {
  // Opt-in summary only: no per-case fixture or generated output is committed.
  if (process.env.RUSTCORE_PARITY_REPORT === "1") console.log(JSON.stringify({ frameParityMaxima: maxima }));
});

describe("nutation, frame rotations and apparent sidereal time through WASM", () => {
  it("pins the locally translated reference source bytes", () => {
    const hashes = {
      "nutation.ts": "c11af594d4e8ad64e0a7ff1097505063c70812d2da84e14a6c0280d4841e62b0",
      "frame.ts": "98d0bee44839b23d3ec64dac470e31ab8e366c6907d325a4259f8f37285a7c50",
      "equator.ts": "1789e14344ef83839aea20624d16bb3def70d41e574f412faec87b89e6a79ef7",
      "houses.ts": "e97ea80f5f225fadf0bfcb051f0afcce820678f31ff1013cc0ebce3035cc8ceb",
      "ephemeris.ts": "b530dbd0463b886fe1b8e99a095dc9cf9ef0cf614b6854e78ad206a27913cc7e"
    };
    for (const [file, expected] of Object.entries(hashes)) {
      const bytes = readFileSync(new URL(`../../src/${file}`, import.meta.url));
      expect(createHash("sha256").update(bytes).digest("hex"), file).toBe(expected);
    }
  });

  it("retains the TypeScript numeric signatures and copies each nutation table value exactly", () => {
    expectTypeOf(rust.nutation).toEqualTypeOf<typeof nutationReference.nutation>();
    expectTypeOf(rust.coefficients).toEqualTypeOf<typeof nutationReference.coefficients>();
    expectTypeOf(rust.tilt).toEqualTypeOf<typeof nutationReference.tilt>();
    expectTypeOf(rust.meanObliquity).toEqualTypeOf<typeof meanObliquity>();
    expectTypeOf(rust.gastHours).toEqualTypeOf<typeof gastHours>();
    expectTypeOf(rust.eclipticFrame).toEqualTypeOf<typeof frameReference.eclipticFrame>();
    expectTypeOf(rust.meanEcliptic).toEqualTypeOf<typeof frameReference.meanEcliptic>();
    expectTypeOf(rust.eclipticOfDate).toEqualTypeOf<typeof frameReference.eclipticOfDate>();
    expectTypeOf(rust.eclipticRows).toEqualTypeOf<typeof equatorReference.eclipticRows>();
    expectTypeOf(rust.equatorRows).toEqualTypeOf<typeof equatorReference.equatorRows>();
    expectTypeOf(rust.turn).toEqualTypeOf<typeof equatorReference.turn>();
    expect(rust.NUTATION_TERMS).toBe(nutationReference.NUTATION_TERMS);
    expect(rust.MULTIPLIERS).toBe(nutationReference.MULTIPLIERS);
    expect(wasm.nutationTerms()).toBe(nutationReference.NUTATION_TERMS);
    expect(wasm.nutationMultipliers()).toBe(nutationReference.MULTIPLIERS);
    for (const [name, actual, expected] of [
      ["ARGUMENTS", rust.ARGUMENTS, nutationReference.ARGUMENTS],
      ["OFFSETS", rust.OFFSETS, nutationReference.OFFSETS],
      ["coefficients", rust.coefficients(), nutationReference.coefficients()]
    ] as const) {
      expect(actual.length, name).toBe(expected.length);
      for (let index = 0; index < expected.length; index++)
        expectSameNumber(actual[index]!, expected[index]!, `${name}[${index}]`);
      expect(Object.isFrozen(actual), name).toBe(true);
    }
    for (const [name, actual, expected] of [
      ["native ARGUMENTS", wasm.nutationArguments(), nutationReference.ARGUMENTS],
      ["native OFFSETS", wasm.nutationOffsets(), nutationReference.OFFSETS],
      ["native coefficients", wasm.coefficients(), nutationReference.coefficients()]
    ] as const) {
      expect(actual.length, name).toBe(expected.length);
      for (let index = 0; index < expected.length; index++)
        expectSameNumber(actual[index]!, expected[index]!, `${name}[${index}]`);
    }
    expect(rust.coefficients()).toBe(rust.coefficients());
  });

  it("retains immediate frame cache reuse with immutable snapshots and mean-row identity", () => {
    const first = rust.eclipticFrame(1);
    expect(rust.eclipticFrame(1)).toBe(first);
    expect(rust.eclipticRows(1, "mean")).toBe(first.rows);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.rows)).toBe(true);
    expect(Object.isFrozen(first.tilt)).toBe(true);
    expect(() => { (first.rows as number[])[0] = 0; }).toThrow(TypeError);
    const second = rust.eclipticFrame(2);
    expect(second).not.toBe(first);
    expect(rust.eclipticFrame(2)).toBe(second);
    expect(rust.eclipticFrame(1)).not.toBe(first);
    const zero = rust.eclipticFrame(-0);
    expect(rust.eclipticFrame(0)).toBe(zero);
    expectSameNumber(zero.tt, -0, "first signed-zero cache key");
    expect(rust.eclipticFrame(NaN)).not.toBe(rust.eclipticFrame(NaN));
  });

  it("compares obliquity, complete nutation and tilt on quarterly and seeded dates from 1800 through 2200", () => {
    for (const tt of [...ttInputs, ...neighbors(0)]) {
      const t = tt / 36525;
      const context = `tt=${tt}`;
      angular(rust.meanObliquity(t), meanObliquity(t), OBLIQUITY_ARCSEC, "mean obliquity arcsec", context);
      const expected = nutationReference.nutation(t);
      const actual = rust.nutation(t);
      expect(Object.keys(actual), context).toEqual(Object.keys(expected));
      expectSameNumber(actual.om, expected.om, `${context}, omega argument radians`);
      for (const key of ["dpsi", "deps"] as const)
        bounded(actual[key], expected[key], NUTATION_ARCSEC, `${key} arcsec`, context);
      compareTilt(rust.tilt(tt), nutationReference.tilt(tt), context);
    }
    // Integer powers of these dyadic inputs are exact. They do not need the
    // libm/V8 exponentiation allowance used by the general corpus.
    for (const t of [-2, -1, -0.5, -0, 0, 0.5, 1, 2])
      expectSameNumber(rust.meanObliquity(t), meanObliquity(t), `dyadic t=${t}`);
  });

  it("compares every nutation truncation from zero through all terms", () => {
    for (let year = 1800; year <= 2200; year += 5) {
      const t = timeBasis(Date.UTC(year, 6, 13, 11, 7, 31, 127)).ttDays / 36525;
      for (let terms = 0; terms <= nutationReference.NUTATION_TERMS; terms++) {
        const expected = nutationReference.nutation(t, terms);
        const actual = rust.nutation(t, terms);
        const context = `year=${year}, terms=${terms}`;
        expectSameNumber(actual.om, expected.om, context);
        for (const key of ["dpsi", "deps"] as const) {
          if (terms === 0) expectSameNumber(actual[key], expected[key], `${context}, ${key}`);
          else bounded(actual[key], expected[key], NUTATION_ARCSEC, `${key} arcsec`, context);
        }
      }
    }
  });

  it("preserves the reference's unchecked fractional and nonfinite term-count behavior", () => {
    for (const t of [-2, -0.125, 0, 0.75, 2]) {
      for (const terms of [-Infinity, -1, -0, 0, Number.MIN_VALUE, 0.5, 1.5, 2.5, 5.25,
        1 + 1 / 6, 2 + 1 / 3, 76.5, 77.5, 78, 79, NaN]) {
        const expected = nutationReference.nutation(t, terms);
        const actual = rust.nutation(t, terms);
        const context = `t=${t}, terms=${terms}`;
        expectSameNumber(actual.om, expected.om, context);
        for (const key of ["dpsi", "deps"] as const) {
          if (terms < 1 || Number.isNaN(terms)) expectSameNumber(actual[key], expected[key], `${context}, ${key}`);
          else bounded(actual[key], expected[key], NUTATION_ARCSEC, `${key} arcsec`, context);
        }
      }
      // The TS loop never terminates for positive Infinity. Refusal here is
      // explicit port behavior; never call the reference on that input.
      expect(() => rust.nutation(t, Infinity)).toThrow(RangeError);
      for (const terms of [2 ** 54, Number.MAX_VALUE]) {
        // Floating decrements at these magnitudes stall the reference loop.
        // Rust returns its already-determined out-of-table NaN sums promptly.
        const result = rust.nutation(t, terms);
        expect(Number.isNaN(result.dpsi)).toBe(true);
        expect(Number.isNaN(result.deps)).toBe(true);
        expectSameNumber(result.om, nutationReference.nutation(t, 0).om, `oversized terms=${terms}`);
      }
    }
  });

  it("preserves signed zeros and arithmetic order in caller-supplied matrix products", () => {
    const matrices: readonly Rows[] = [
      [1, 0, 0, 0, 1, 0, 0, 0, 1],
      [-0, -0, -0, 0, 0, 0, -0, 0, -0],
      [1e16, 1, -1e16, 0.125, -0.25, 0.5, -11, 7, 13],
      [Number.MIN_VALUE, -Number.MIN_VALUE, 1, -1, 0, -0, 0.31, -0.72, 0.19],
      [Number.MAX_VALUE, Number.MAX_VALUE, -Number.MAX_VALUE, 1, -1, 0, 0, 0, -0]
    ];
    const inputs: readonly (readonly [number, number, number])[] = [
      ...vectors, [1, 1, 1], [0, -0, 0], [-0, -0, -0], [1e-100, -1e-100, 1e-100], [2, 2, 2]
    ];
    for (const rows of matrices) {
      const frame: EclipticFrame = { tt: 0, rows, tilt: { dpsi: 0, deps: 0, mobl: 0, tobl: 0, ee: 0 } };
      for (const vector of inputs) {
        const expected = equatorReference.turn(rows, ...vector);
        const actual = rust.turn(rows, ...vector);
        const actualMean = rust.meanEcliptic(frame, ...vector);
        const expectedMean = frameReference.meanEcliptic(frame, ...vector);
        for (let index = 0; index < 3; index++) {
          expectSameNumber(actual[index]!, expected[index]!, `turn component=${index}, vector=${vector}`);
          expectSameNumber(actualMean[index]!, expectedMean[index]!, `meanEcliptic component=${index}, vector=${vector}`);
        }
      }
    }
  });

  it("compares mean/true ecliptic and equator rows and their action on column vectors", () => {
    for (const tt of ttInputs) {
      const context = `tt=${tt}`;
      const expected = frameReference.eclipticFrame(tt);
      const actual = rust.eclipticFrame(tt);
      expectSameNumber(actual.tt, expected.tt, context);
      compareTilt(actual.tilt, expected.tilt, context);
      compareRows(actual.rows, expected.rows, context);
      expect(rust.eclipticFrame(tt), context).toBe(actual);
      for (const kind of ["mean", "true"] as const) {
        for (const [name, implementation, reference] of [
          ["eclipticRows", rust.eclipticRows, equatorReference.eclipticRows],
          ["equatorRows", rust.equatorRows, equatorReference.equatorRows]
        ] as const) {
          const expectedRows = reference(tt, kind);
          const actualRows = implementation(tt, kind);
          compareRows(actualRows, expectedRows, `${name}, ${kind}, ${context}`);
          for (const vector of vectors)
            compareVector(rust.turn(actualRows, ...vector), equatorReference.turn(expectedRows, ...vector), vector,
              `${name}, ${kind}, ${context}, vector=${vector}`);
          // Turning a basis vector selects a matrix column, not a row.
          for (let column = 0; column < 3; column++) {
            const vector: [number, number, number] = [0, 0, 0];
            vector[column] = 1;
            const result = rust.turn(actualRows, ...vector);
            for (let row = 0; row < 3; row++)
              expect(result[row], `${name}, column=${column}, row=${row}`).toBe(actualRows[3 * row + column]);
          }
        }
      }
      for (const vector of vectors) {
        compareVector(rust.meanEcliptic(actual, ...vector), frameReference.meanEcliptic(expected, ...vector), vector, context);
        const sharedRows = expected.rows as Rows;
        const sharedActual = rust.turn(sharedRows, ...vector);
        const sharedExpected = equatorReference.turn(sharedRows, ...vector);
        for (let index = 0; index < 3; index++)
          expectSameNumber(sharedActual[index]!, sharedExpected[index]!, `shared frame ${context}, component=${index}`);
      }
    }
  }, 30_000);

  it("compares longitude and latitude for axes and general vectors away from ecliptic poles", () => {
    for (const tt of ttInputs) {
      for (const vector of vectors) {
        const expected = frameReference.eclipticOfDate(...vector, tt);
        const actual = rust.eclipticOfDate(...vector, tt);
        const context = `tt=${tt}, vector=${vector}`;
        expect(Math.abs(expected.lat), context).toBeLessThan(89);
        expect(Object.keys(actual), context).toEqual(Object.keys(expected));
        angular(actual.lon, expected.lon, COORDINATE_ARCSEC, "longitude arcsec", context, true);
        angular(actual.lat, expected.lat, COORDINATE_ARCSEC, "latitude arcsec", context);
      }
    }
  }, 30_000);

  it("preserves coordinate reduction for very small and large finite vector magnitudes", () => {
    for (const tt of [ttInputs[0]!, 0, ttInputs[1]!]) {
      for (const scale of [1e-300, 1e-200, 1e-100, 1, 1e100, 1e200, 1e300]) {
        const vector: [number, number, number] = [3 * scale, -4 * scale, 12 * scale];
        const expected = frameReference.eclipticOfDate(...vector, tt);
        const actual = rust.eclipticOfDate(...vector, tt);
        const context = `tt=${tt}, scale=${scale}`;
        angular(actual.lon, expected.lon, COORDINATE_ARCSEC, "longitude arcsec", context, true);
        angular(actual.lat, expected.lat, COORDINATE_ARCSEC, "latitude arcsec", context);
      }
    }
  });

  it("applies separate angular allowances to explicitly constructed near-pole vectors", () => {
    for (const year of [1800, 1900, 2000, 2100, 2200]) {
      const tt = timeBasis(Date.UTC(year, 0, 1)).ttDays;
      const frame = frameReference.eclipticFrame(tt);
      const m = frame.rows;
      for (const latitude of [-89.999999, -89.999, 89.999, 89.999999]) {
        for (const longitude of [0, 47, 123, 271]) {
          const x = Math.cos(latitude * DEG) * Math.cos(longitude * DEG);
          const y = Math.cos(latitude * DEG) * Math.sin(longitude * DEG);
          const z = Math.sin(latitude * DEG);
          // Transpose maps the requested synthetic ecliptic direction into EQJ.
          // Both implementations receive the identical rounded input vector.
          const vector: [number, number, number] = [
            m[0]! * x + m[3]! * y + m[6]! * z,
            m[1]! * x + m[4]! * y + m[7]! * z,
            m[2]! * x + m[5]! * y + m[8]! * z
          ];
          const expected = frameReference.eclipticOfDate(...vector, tt);
          const actual = rust.eclipticOfDate(...vector, tt);
          const context = `year=${year}, lon=${longitude}, lat=${latitude}`;
          compareVector(rust.meanEcliptic(rust.eclipticFrame(tt), ...vector), frameReference.meanEcliptic(frame, ...vector), vector, context);
          angular(actual.lon, expected.lon, NEAR_POLE_LONGITUDE_ARCSEC, "near-pole longitude arcsec", context, true);
          angular(actual.lat, expected.lat, NEAR_POLE_LATITUDE_ARCSEC, "near-pole latitude arcsec", context);
        }
      }
    }
  });

  it("keeps UT1 rotation distinct from TT precession/nutation, including pinned and split clocks", () => {
    const compareGast = (ut: number, tt: number, context: string): void => {
      // gastHours reads only these AstroTime fields. Avoid a constructor that
      // would recompute TT from a process-global Delta T function.
      const time = { ut, tt } as Parameters<typeof gastHours>[0];
      const actual = rust.gastHours(time);
      const expected = gastHours(time);
      expect(actual, context).toBeGreaterThanOrEqual(0);
      expect(actual, context).toBeLessThan(24);
      let difference = (actual - expected) % 24;
      if (difference > 12) difference -= 24;
      if (difference < -12) difference += 24;
      bounded(difference * 15 * 3600, 0, SIDEREAL_ARCSEC, "sidereal angle arcsec", context);
    };
    for (const ms of syntheticMs) {
      for (const scale of ["utc", "ut1", "tt"] as const) {
        const basis = timeBasis(ms, scale);
        compareGast(basis.ut1Days, basis.ttDays, `ms=${ms}, scale=${scale}`);
      }
    }
    for (const ms of [firstMs, J2000_MS, lastMs, Date.UTC(1972, 0, 1), Date.UTC(2017, 0, 1)]) {
      for (const scale of ["utc", "ut1", "tt"] as const) {
        for (const pin of [-86400.25, -70, -0, 0, 69.184, 86400.25]) {
          const basis = timeBasis(ms, scale, pin);
          compareGast(basis.ut1Days, basis.ttDays, `ms=${ms}, scale=${scale}, pin=${pin}`);
        }
      }
      const basis = timeBasis(ms);
      // Same TT with different UT1 must never reuse a sidereal result cached
      // solely by TT; reverse the order too to expose stale-cache mistakes.
      for (const shift of [0, 0.25, -0.25, 1, 0])
        compareGast(basis.ut1Days + shift, basis.ttDays, `split UT1 shift=${shift}, ms=${ms}`);
      for (const shift of [0, 0.25, -0.25, 1, 0])
        compareGast(basis.ut1Days, basis.ttDays + shift, `split TT shift=${shift}, ms=${ms}`);
    }
    for (const ut of [-73048.5, -36525, -1, ...neighbors(0), 1, 36525, 73048.5]) {
      for (const tt of [0, ut, ut + 1 / 86400]) compareGast(ut, tt, `raw split ut=${ut}, tt=${tt}`);
    }
  }, 30_000);

  it("retains numeric nonfinite classifications and zero-vector behavior", () => {
    for (const tt of [NaN, -Infinity, Infinity]) {
      expectSameNumber(rust.meanObliquity(tt), meanObliquity(tt), `nonfinite obliquity=${tt}`);
      const actualTilt = rust.tilt(tt);
      const expectedTilt = nutationReference.tilt(tt);
      for (const key of ["dpsi", "deps", "mobl", "tobl", "ee"] as const)
        expectSameNumber(actualTilt[key], expectedTilt[key], `nonfinite tilt=${tt}, ${key}`);
      const actualFrame = rust.eclipticFrame(tt);
      const expectedFrame = frameReference.eclipticFrame(tt);
      for (let index = 0; index < 9; index++)
        expectSameNumber(actualFrame.rows[index]!, expectedFrame.rows[index]!, `nonfinite frame=${tt}, ${index}`);
      const time = { ut: tt, tt } as Parameters<typeof gastHours>[0];
      expectSameNumber(rust.gastHours(time), gastHours(time), `nonfinite sidereal=${tt}`);
    }
    for (const tt of [0, ttInputs[0]!, ttInputs[1]!]) {
      for (const vector of [[0, 0, 0], [-0, -0, -0], [0, -0, 0], [-0, 0, -0]] as const) {
        const zero = rust.eclipticOfDate(...vector, tt);
        const expectedZero = frameReference.eclipticOfDate(...vector, tt);
        angular(zero.lon, expectedZero.lon, COORDINATE_ARCSEC, "zero-vector longitude arcsec", `tt=${tt}`, true);
        expectSameNumber(zero.lat, expectedZero.lat, `zero-vector latitude tt=${tt}`);
      }
      for (const bad of [NaN, Infinity, -Infinity]) {
        const expected = outcome(() => frameReference.eclipticOfDate(bad, 0, 1, tt));
        const actual = outcome(() => rust.eclipticOfDate(bad, 0, 1, tt));
        expect(actual.ok).toBe(expected.ok);
        if (!actual.ok && !expected.ok) expectSameError(actual.error, expected.error, `vector x=${bad}, tt=${tt}`);
      }
    }
  });
});
