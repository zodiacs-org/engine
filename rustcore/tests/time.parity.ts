import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, expectTypeOf, it } from "vitest";
import * as delta from "../../src/deltat.js";
import type { DeltaT } from "../../src/deltat.js";
import * as reference from "../../src/time-scale.js";
import type { TimeBasis, TimeScaleName, Ut1MinusUtc } from "../../src/time-scale.js";
import {
  LEAP_SECONDS_EXPIRE_MS, UT1_FINALS_FROM_MS, UT1_FROM_MS, UT1_GRID_BEFORE,
  UT1_OBSERVED_TO_MS, UT1_TO_MS
} from "../../src/time-scale-data.js";
import * as rust from "../ts/index.js";
import { expectSameError, expectSameNumber, expectSameNumberCall, neighbors, outcome, randomUint32 } from "./parity-helpers.js";

beforeAll(() => {
  rust.initRustCore(readFileSync(new URL("../pkg/zodiacs_rustcore_bg.wasm", import.meta.url)));
});

const DAY_MS = 86_400_000;
const J2000_MS = Date.UTC(2000, 0, 1, 12);
const scales: readonly TimeScaleName[] = ["utc", "ut1", "tt"];
const utOfYear = (year: number): number => (year - 2000) * 365.25;
const yearOfMjd = (mjd: number): number => 2000 + (mjd - 51544.5) / 365.25;
const msOfMjd = (mjd: number): number => (mjd - 40_587) * DAY_MS;
const observedYear = yearOfMjd(delta.DELTA_T_TABLE.observedTo);
const predictedYear = yearOfMjd(delta.DELTA_T_TABLE.predictedTo);
// Rust libm and V8 can round pow, sin, cos and exp differently. These limits
// apply only to the model branches that call them, not arithmetic-only paths.
const MODEL_SECONDS_TOLERANCE = 1e-12;
const MODEL_SIGMA_TOLERANCE = 1e-14;

// These are branch/knot locations of the reference algorithms, not expected
// output values or an independent accuracy fixture.
const modelYears = [
  -720, 400, 1000, 1500, 1600, 1650, 1720, 1800, 1810, 1820, 1830, 1840,
  ...Array.from({ length: 20 }, (_, index) => 1850 + index * 5),
  640, 900, 1240, 1400, 1420, 1440, 1560, 1620, 1670, 1710, 1760, 1956,
  ...Array.from({ length: delta.DELTA_T_TABLE.knots.length - 5 }, (_, index) => delta.DELTA_T_TABLE.from + index),
  ...Array.from({ length: 5 }, (_, index) => observedYear + index * (predictedYear - observedYear) / 4),
  observedYear + 1, observedYear + 10
];

const syntheticMs = [Date.UTC(1800, 0, 1), Date.UTC(2200, 11, 31, 23, 59, 59, 999)];
for (let year = 1800; year <= 2200; year++) {
  for (let month = 0; month < 12; month++) {
    syntheticMs.push(Date.UTC(year, month, 1 + (year + month) % 28, (year + month) % 24, 17, 43, 219));
  }
}
const next = randomUint32(0x74696d65);
for (let index = 0; index < 2048; index++) {
  syntheticMs.push(syntheticMs[0]! + Math.floor(next() / 0x1_0000_0000 * (syntheticMs[1]! - syntheticMs[0]!)));
}

function expectSeconds(actual: number, expected: number, tolerance: number, context: string): void {
  if (tolerance === 0 || !Number.isFinite(expected) || expected === 0) {
    expectSameNumber(actual, expected, context);
  } else {
    expect(Number.isFinite(actual), context).toBe(true);
    expect(Math.abs(actual - expected), context).toBeLessThanOrEqual(tolerance);
  }
}

function secondsTolerance(ut: number): number {
  const year = 2000 + ut / 365.25;
  return year < 1941 || year > predictedYear ? MODEL_SECONDS_TOLERANCE : 0;
}

function expectDelta(actual: DeltaT, expected: DeltaT, context: string, ut: number): void {
  const model = expected.model === delta.DELTA_T_MODEL;
  expectSeconds(actual.seconds, expected.seconds, model ? secondsTolerance(ut) : 0, `${context}, deltaT.seconds`);
  if (expected.sigma === null) expect(actual.sigma, context).toBeNull();
  else {
    expect(actual.sigma, context).not.toBeNull();
    const h = 2000 + ut / 365.25 - observedYear;
    expectSeconds(actual.sigma!, expected.sigma, model && h > 0 && h <= 10 ? MODEL_SIGMA_TOLERANCE : 0, `${context}, deltaT.sigma`);
  }
  const { seconds: _actualSeconds, sigma: _actualSigma, ...actualMetadata } = actual;
  const { seconds: _expectedSeconds, sigma: _expectedSigma, ...expectedMetadata } = expected;
  expect(actualMetadata, context).toEqual(expectedMetadata);
}

function expectUt1(actual: Ut1MinusUtc | null, expected: Ut1MinusUtc | null, context: string): void {
  if (expected === null) {
    expect(actual, context).toBeNull();
    return;
  }
  expect(actual, context).not.toBeNull();
  expectSameNumber(actual!.seconds, expected.seconds, `${context}, UT1.seconds`);
  expectSameNumber(actual!.sigma, expected.sigma, `${context}, UT1.sigma`);
  expect(actual!.source, context).toBe(expected.source);
  expect(Object.keys(actual!), context).toEqual(Object.keys(expected));
}

function expectBasis(actual: TimeBasis, expected: TimeBasis, context: string): void {
  for (const field of ["utcMs", "ut1Days", "ttDays"] as const)
    expectSameNumber(actual[field], expected[field], `${context}, ${field}`);
  expectDelta(actual.deltaT, expected.deltaT, context, expected.ut1Days);
  expectUt1(actual.timeScale.ut1MinusUtc, expected.timeScale.ut1MinusUtc, context);
  const { ut1MinusUtc: _actualUt1, ...actualRecord } = actual.timeScale;
  const { ut1MinusUtc: _expectedUt1, ...expectedRecord } = expected.timeScale;
  expect(actualRecord, context).toEqual(expectedRecord);
  expect(Object.keys(actual), context).toEqual(Object.keys(expected));
}

function compareBasis(ms: number, scale: TimeScaleName, pin?: number): void {
  const context = `ms=${ms}, scale=${scale}, pin=${Object.is(pin, -0) ? "-0" : pin}`;
  const expected = outcome(() => reference.timeBasis(ms, scale, pin));
  const actual = outcome(() => rust.timeBasis(ms, scale, pin));
  expect(actual.ok, context).toBe(expected.ok);
  if (actual.ok && expected.ok) expectBasis(actual.value, expected.value, context);
  else if (!actual.ok && !expected.ok) expectSameError(actual.error, expected.error, context);
}

function compareDelta(ut: number): void {
  const context = `UT=${ut}, year=${2000 + ut / 365.25}`;
  const expected = delta.deltaTAt(ut);
  expectDelta(rust.deltaTAt(ut), expected, context, ut);
  expectSeconds(rust.deltaT(ut), expected.seconds, secondsTolerance(ut), `${context}, deltaT`);
  expectSameNumber(rust.deltaT(ut), rust.deltaTAt(ut).seconds, `${context}, scalar/record`);
}

function compareFrozenMetadata(actual: unknown, expected: unknown, context: string): void {
  expect(actual, context).toEqual(expected);
  if (typeof expected !== "object" || expected === null) return;
  // The Rust build snapshots the reference data. Its wrapper explicitly freezes
  // these two arrays too; reference mutation is not a supported configuration.
  const frozenSnapshot = context === "UT1_DATA.observedErrors" || context === "UT1_DATA.predictedErrors";
  expect(Object.isFrozen(actual), context).toBe(frozenSnapshot || Object.isFrozen(expected));
  for (const key of Object.keys(expected)) {
    compareFrozenMetadata(
      (actual as Record<string, unknown>)[key],
      (expected as Record<string, unknown>)[key],
      `${context}.${key}`
    );
  }
}

describe("Delta T and time bases through WASM", () => {
  it("retains TypeScript function signatures and table metadata", () => {
    expectTypeOf(rust.deltaT).toEqualTypeOf<typeof delta.deltaT>();
    expectTypeOf(rust.deltaTAt).toEqualTypeOf<typeof delta.deltaTAt>();
    expectTypeOf(rust.taiMinusUtcAt).toEqualTypeOf<typeof reference.taiMinusUtcAt>();
    expectTypeOf(rust.ut1MinusUtcAt).toEqualTypeOf<typeof reference.ut1MinusUtcAt>();
    expectTypeOf(rust.timeBasis).toEqualTypeOf<typeof reference.timeBasis>();
    expectTypeOf(rust.elapsedDays).toEqualTypeOf<typeof reference.elapsedDays>();
    expect(rust.DELTA_T_MODEL).toBe(delta.DELTA_T_MODEL);
    expect(rust.DELTA_T_IERS_MODEL).toBe(reference.DELTA_T_IERS_MODEL);
    expectSameNumber(rust.LEAP_SECONDS_FROM, reference.LEAP_SECONDS_FROM, "LEAP_SECONDS_FROM");
    expectSameNumber(rust.UT1_FALLBACK_BAND, reference.UT1_FALLBACK_BAND, "UT1_FALLBACK_BAND");
    compareFrozenMetadata(rust.DELTA_T_TABLE, delta.DELTA_T_TABLE, "DELTA_T_TABLE");
    for (const key of ["TIME_SCALE_NAMES", "LEAP_SECOND_LIST", "UT1_DATA"] as const)
      compareFrozenMetadata(rust[key], reference[key], key);
    for (const key of ["observedErrors", "predictedErrors"] as const) {
      expect(() => { (rust.UT1_DATA[key] as unknown as number[])[0] = 0; }).toThrow(TypeError);
    }
  });

  it("compares the Delta T model on monthly and seeded synthetic dates from 1800 through 2200", () => {
    for (const ms of syntheticMs) compareDelta((ms - J2000_MS) / DAY_MS);
  }, 30_000);

  it("compares every spline, table, uncertainty and model seam and its neighbors", () => {
    for (const year of modelYears) {
      const ut = utOfYear(year);
      for (const input of [...neighbors(ut), ut - 1 / DAY_MS, ut + 1 / DAY_MS, ut - 0.25, ut + 0.25])
        compareDelta(input);
    }
    for (const year of [-5000, -721, -719, 0, 3998]) compareDelta(utOfYear(year));
    for (const ut of [-Number.MIN_VALUE, -0, 0, Number.MIN_VALUE]) compareDelta(ut);
  });

  it("rejects nonfinite or non-number Delta T input without coercion", () => {
    const invalid: unknown[] = [NaN, Infinity, -Infinity, undefined, null, true, "0", 0n, [], {},
      new Number(0), Symbol("synthetic"), { valueOf() { throw new Error("Must not coerce"); } }];
    for (const value of invalid) {
      for (const key of ["deltaT", "deltaTAt"] as const) {
        const expected = outcome(() => delta[key](value as number));
        const actual = outcome(() => rust[key](value as number));
        expect(expected.ok).toBe(false);
        expect(actual.ok).toBe(false);
        if (!actual.ok && !expected.ok) expectSameError(actual.error, expected.error, key);
      }
    }
  });

  it("compares all scales on the monthly and seeded synthetic date corpus", () => {
    for (const ms of syntheticMs) {
      for (const scale of scales) compareBasis(ms, scale);
      expectSameNumber(rust.taiMinusUtcAt(ms), reference.taiMinusUtcAt(ms), `TAI at ${ms}`);
      expectUt1(rust.ut1MinusUtcAt(ms), reference.ut1MinusUtcAt(ms), `UT1 at ${ms}`);
    }
    const ms = Date.UTC(2000, 0, 1, 12);
    expectBasis(rust.timeBasis(ms), reference.timeBasis(ms), "default UTC scale");
  }, 30_000);

  it("compares every UT1 grid knot, adjacent doubles, interpolation and sigma seam exactly", () => {
    const { UT1_DATA } = reference;
    const seams = [UT1_FROM_MS, UT1_FINALS_FROM_MS, UT1_OBSERVED_TO_MS, UT1_TO_MS];
    for (let mjd = UT1_DATA.finalsFrom - UT1_GRID_BEFORE * UT1_DATA.step; mjd < UT1_DATA.to; mjd += UT1_DATA.step)
      seams.push(msOfMjd(mjd));
    for (let year = UT1_DATA.firstYear; year <= UT1_DATA.firstYear + UT1_DATA.observedErrors.length; year++)
      seams.push(Date.UTC(year, 0, 1));
    for (let index = 0; index < UT1_DATA.predictedErrors.length; index++)
      seams.push(msOfMjd(Math.min(UT1_DATA.to, UT1_DATA.observedTo + 1 + index * 10)));
    for (const ms of seams) {
      for (const input of [...neighbors(ms), ms - 1, ms + 1, ms + DAY_MS * 0.37]) {
        const context = `UT1 grid/sigma ms=${input}`;
        expectUt1(rust.ut1MinusUtcAt(input), reference.ut1MinusUtcAt(input), context);
        expectSameNumber(rust.taiMinusUtcAt(input), reference.taiMinusUtcAt(input), context);
      }
      // Each decoded interval reaches the full WASM time-basis path too.
      for (const scale of scales) compareBasis(ms + DAY_MS * 0.37, scale);
    }
  }, 30_000);

  it("preserves basis selection at model, table, expiry and leap boundaries", () => {
    const seams = [
      J2000_MS + utOfYear(1941) * DAY_MS,
      UT1_FROM_MS, UT1_FINALS_FROM_MS, UT1_OBSERVED_TO_MS, UT1_TO_MS, LEAP_SECONDS_EXPIRE_MS,
      ...reference.LEAP_SECOND_LIST.changes.map(([mjd]) => msOfMjd(mjd))
    ];
    for (const seam of seams) {
      for (const ms of [...neighbors(seam), seam - 1001, seam - 1, seam + 1, seam + 1001]) {
        for (const scale of scales) compareBasis(ms, scale);
      }
    }
    // TT basis selection subtracts model Delta T before choosing IERS. Scan
    // the switch on both table edges, including the final fractional interval.
    for (const edge of [UT1_FROM_MS, UT1_TO_MS]) {
      const approximate = edge + delta.deltaT((edge - J2000_MS) / DAY_MS) * 1000;
      for (let offset = -1000; offset <= 1000; offset++) compareBasis(approximate + offset, "tt");
    }
  }, 30_000);

  it("compares TT and UT1 input inside every leap second and at both sides", () => {
    for (let index = 1; index < reference.LEAP_SECOND_LIST.changes.length; index++) {
      const [mjd, after] = reference.LEAP_SECOND_LIST.changes[index]!;
      const before = reference.LEAP_SECOND_LIST.changes[index - 1]![1];
      const at = msOfMjd(mjd);
      expect(after).toBe(before + 1);
      for (const offset of [-1, 0, 0.25, 250, 500, 999, 1000, 1001]) {
        const ttMs = at + before * 1000 + 32_184 + offset;
        compareBasis(ttMs, "tt");
        const tt = reference.timeBasis(ttMs, "tt");
        const ut1Ms = J2000_MS + tt.ut1Days * DAY_MS;
        for (const input of neighbors(ut1Ms)) compareBasis(input, "ut1");
      }
      for (const utc of [at - 1500, at - 500, at - 1, at + 1, at + 500, at + 1500]) {
        const basis = reference.timeBasis(utc);
        compareBasis(J2000_MS + basis.ttDays * DAY_MS, "tt");
        compareBasis(J2000_MS + basis.ut1Days * DAY_MS, "ut1");
      }
    }
  });

  it("preserves negative, positive, signed-zero and subnormal pinned Delta T", () => {
    const instants = [syntheticMs[0]!, syntheticMs[1]!, -0, 0, J2000_MS,
      UT1_FROM_MS - 1, UT1_FROM_MS, UT1_TO_MS, UT1_TO_MS + 1, LEAP_SECONDS_EXPIRE_MS,
      ...reference.LEAP_SECOND_LIST.changes.map(([mjd]) => msOfMjd(mjd))];
    for (const ms of instants) {
      for (const scale of scales) {
        for (const pin of [-86400.25, -70, -Number.MIN_VALUE, -0, 0, Number.MIN_VALUE, 69.184, 86400.25])
          compareBasis(ms, scale, pin);
      }
    }
  });

  it("preserves unchecked numeric time-helper behavior for nonfinite inputs", () => {
    for (const ms of [NaN, -Infinity, Infinity]) {
      expectSameNumber(rust.taiMinusUtcAt(ms), reference.taiMinusUtcAt(ms), `TAI at ${ms}`);
      expectUt1(rust.ut1MinusUtcAt(ms), reference.ut1MinusUtcAt(ms), `UT1 at ${ms}`);
      for (const scale of scales) {
        for (const pin of [undefined, -0, 0, NaN, -Infinity, Infinity]) compareBasis(ms, scale, pin);
      }
    }
    for (const ms of [syntheticMs[0]!, J2000_MS, syntheticMs[1]!]) {
      for (const scale of scales) {
        for (const pin of [NaN, -Infinity, Infinity]) compareBasis(ms, scale, pin);
      }
    }
  });

  it("preserves elapsedDays branch decisions and caller-supplied interval bits", () => {
    const seams = [
      J2000_MS + utOfYear(1941) * DAY_MS, UT1_FROM_MS, UT1_TO_MS, LEAP_SECONDS_EXPIRE_MS,
      ...reference.LEAP_SECOND_LIST.changes.map(([mjd]) => msOfMjd(mjd))
    ];
    for (const seam of seams) {
      for (const scale of scales) {
        for (const pin of [undefined, -70, -0, 0, 70]) {
          for (const [beforeMs, afterMs] of [[seam - 1000, seam], [seam, seam + 1000], [seam - 1000, seam + 1000], [seam, seam]] as const) {
            const before = reference.timeBasis(beforeMs, scale, pin);
            const after = reference.timeBasis(afterMs, scale, pin);
            for (const days of [(afterMs - beforeMs) / DAY_MS, -0, 0, Number.MIN_VALUE, -1, 0.25, NaN, Infinity]) {
              const context = `elapsedDays seam=${seam}, scale=${scale}, pin=${pin}, days=${days}`;
              // Shared reference records isolate the elapsedDays port itself.
              expectSameNumberCall(() => rust.elapsedDays(before, after, days), () => reference.elapsedDays(before, after, days), context);
              expectSameNumberCall(() => rust.elapsedDays(after, before, -days), () => reference.elapsedDays(after, before, -days), context);
            }
            const actualBefore = rust.timeBasis(beforeMs, scale, pin);
            const actualAfter = rust.timeBasis(afterMs, scale, pin);
            const days = (afterMs - beforeMs) / DAY_MS;
            expectSameNumber(rust.elapsedDays(actualBefore, actualAfter, days), reference.elapsedDays(before, after, days), "elapsedDays with WASM records");
          }
        }
      }
    }
  }, 30_000);

  it("compares elapsedDays with mixed scales, model pieces and pin provenance", () => {
    const records = [
      reference.timeBasis(J2000_MS + utOfYear(1941) * DAY_MS - 1),
      reference.timeBasis(J2000_MS + utOfYear(1941) * DAY_MS),
      reference.timeBasis(UT1_FROM_MS - 1), reference.timeBasis(UT1_FROM_MS),
      reference.timeBasis(UT1_TO_MS), reference.timeBasis(UT1_TO_MS + 1),
      ...scales.flatMap((scale) => [undefined, -70, -0, 0, 70].map((pin) => reference.timeBasis(J2000_MS, scale, pin)))
    ];
    for (const before of records) {
      for (const after of records) {
        for (const days of [-0, 0, Number.MIN_VALUE, -0.25, 0.25, Infinity, NaN]) {
          expectSameNumberCall(
            () => rust.elapsedDays(before, after, days),
            () => reference.elapsedDays(before, after, days),
            `mixed elapsedDays ${before.timeScale.input}/${before.timeScale.basis} to ${after.timeScale.input}/${after.timeScale.basis}`
          );
        }
      }
    }
  });
});
