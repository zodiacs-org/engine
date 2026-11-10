import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, expectTypeOf, it } from "vitest";
import * as reference from "../../src/houses.js";
import { gastHours } from "../../src/ephemeris.js";
import { tilt } from "../../src/nutation.js";
import { timeBasis } from "../../src/time-scale.js";
import type { AngleInput } from "../../src/houses.js";
import type { Angles, HouseSystem } from "../../src/types.js";
import * as rust from "../ts/index.js";
import { expectSameError, expectSameNumber, neighbors, outcome, randomUint32 } from "./parity-helpers.js";

beforeAll(() => {
  rust.initRustCore(readFileSync(new URL("../pkg/zodiacs_rustcore_bg.wasm", import.meta.url)));
});

// Retain the M8 bounds for ordinary shared geometry and independent clocks.
const SHARED_INPUT_ARCSEC = 1e-8;
const END_TO_END_ARCSEC = 1e-6;
// Chosen before comparison, only for adjacent-double polar-limit inputs.
// src/houses.ts documents 6.5e-7 degree rounding in one Placidus path there;
// both runtimes' asin roundoff and its propagation need a separate contract.
const NEAR_LIMIT_ARCSEC = 0.01;
const MIN_PROJECTION_NORM = 1e-6;
const SINGULAR_CIRCLE_RESIDUAL = 2e-15;
const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;
const systems = ["placidus", "koch", "regiomontanus", "campanus", "topocentric", "alcabitius"] as const;
const pairs = [
  ["placidus", rust.placidusCusps, reference.placidusCusps],
  ["koch", rust.kochCusps, reference.kochCusps],
  ["regiomontanus", rust.regiomontanusCusps, reference.regiomontanusCusps],
  ["campanus", rust.campanusCusps, reference.campanusCusps],
  ["topocentric", rust.topocentricCusps, reference.topocentricCusps],
  ["alcabitius", rust.alcabitiusCusps, reference.alcabitiusCusps]
] as const;
const maxima: Record<string, number> = {};
let bisectionCases = 0;
let fallbacks = 0;
let singularCircleCases = 0;
let multipleWindingCases = 0;

function distance(actual: number, expected: number): number {
  let difference = (actual - expected) % 360;
  if (difference > 180) difference -= 360;
  if (difference < -180) difference += 360;
  return Math.abs(difference);
}

function compareCusps(actual: readonly number[] | null, expected: readonly number[] | null,
  tolerance: number, quantity: string, context: string): void {
  expect(actual === null, context).toBe(expected === null);
  if (actual === null || expected === null) return;
  expect(actual.length, context).toBe(12);
  for (let index = 0; index < 12; index++)
    compareAngle(actual[index]!, expected[index]!, tolerance, quantity, `${context}, cusp=${index + 1}`);
}

function compareAngle(actual: number, expected: number, tolerance: number, quantity: string, context: string): void {
  if (!Number.isFinite(expected)) expectSameNumber(actual, expected, context);
  else {
    expect(Number.isFinite(actual), context).toBe(true);
    const difference = distance(actual, expected) * 3600;
    maxima[quantity] = Math.max(maxima[quantity] ?? 0, difference);
    expect(difference, context).toBeLessThanOrEqual(tolerance);
  }
}

function compareCall(actual: () => number[] | null, expected: () => number[] | null, context: string): void {
  const a = outcome(actual);
  const b = outcome(expected);
  expect(a.ok, context).toBe(b.ok);
  if (a.ok && b.ok) compareCusps(a.value, b.value, SHARED_INPUT_ARCSEC, "invalid acceptance arcsec", context);
  else if (!a.ok && !b.ok) expectSameError(a.error, b.error, context);
}

function compareResult(actual: ReturnType<typeof rust.computeHouses>, expected: ReturnType<typeof reference.computeHouses>,
  tolerance: number, quantity: string, context: string): void {
  expect(Object.keys(actual), context).toEqual(Object.keys(expected));
  expect(Object.keys(actual.houses), context).toEqual(Object.keys(expected.houses));
  expect(actual.houses.system, context).toBe(expected.houses.system);
  expect(actual.fellBack, context).toBe(expected.fellBack);
  expect(actual.fallbackSystem, context).toBe(expected.fallbackSystem);
  if (expected.fellBack) {
    fallbacks++;
    for (let index = 0; index < 12; index++)
      expectSameNumber(actual.houses.cusps[index]!, expected.houses.cusps[index]!, `${context}, fallback cusp=${index + 1}`);
  } else compareCusps(actual.houses.cusps, expected.houses.cusps, tolerance, quantity, context);
}

// A source-shaped diagnostic proves that the chosen synthetic cases reach
// the reference's bisection path. It supplies no expected cusp coordinate.
function referenceNeedsBisection(input: AngleInput): boolean {
  const ramc = reference.ramcOf(input);
  for (const [offset, multiplier] of [[30, 1 / 3], [60, 2 / 3], [120, 2 / 3], [150, 1 / 3]]) {
    let ra = ramc + offset!;
    let converged = false;
    for (let step = 0; step < 64; step++) {
      const a = referenceNormalize(ra) * DEG;
      const lon = referenceNormalize(Math.atan2(Math.sin(a), Math.cos(a) * Math.cos(input.obliquity * DEG)) * RAD);
      const declination = Math.asin(Math.sin(input.obliquity * DEG) * Math.sin(lon * DEG)) * RAD;
      const argument = Math.tan(input.latitude * DEG) * Math.tan(declination * DEG);
      if (Math.abs(argument) >= 1) break;
      const ascensionalDifference = Math.asin(argument) * RAD;
      const next = ramc + offset! + multiplier! * ascensionalDifference;
      if (Math.abs(referenceNormalize(next - ra + 180) - 180) < 1e-9) { converged = true; break; }
      ra = next;
    }
    if (!converged) return true;
  }
  return false;
}

function referenceNormalize(value: number): number { return ((value % 360) + 360) % 360; }

function projection(ascension: number, pole: number, obliquity: number): readonly [number, number] {
  const a = ascension * DEG;
  const e = obliquity * DEG;
  return [Math.sin(a), Math.cos(a) * Math.cos(e) - Math.tan(pole * DEG) * Math.sin(e)];
}

function circles(input: AngleInput, system: "regiomontanus" | "campanus" | "topocentric"): readonly (readonly [number, number])[] {
  const tangent = Math.tan(input.latitude * DEG);
  if (system === "campanus") {
    const sine = Math.sin(input.latitude * DEG);
    const cosine = Math.cos(input.latitude * DEG);
    const near = Math.asin(sine / 2) * RAD;
    const far = Math.asin((Math.sqrt(3) / 2) * sine) * RAD;
    const wide = Math.atan(Math.sqrt(3) / cosine) * RAD;
    const narrow = Math.atan(1 / (Math.sqrt(3) * cosine)) * RAD;
    return [[90 - wide, near], [90 - narrow, far], [90 + narrow, far], [90 + wide, near]];
  }
  const near = Math.atan(system === "regiomontanus" ? tangent * 0.5 : tangent / 3) * RAD;
  const far = Math.atan(system === "regiomontanus" ? tangent * Math.cos(30 * DEG) : (tangent * 2) / 3) * RAD;
  return [[30, near], [60, far], [120, far], [150, near]];
}

function checkOrdinaryProjectionNorms(input: AngleInput, system: typeof systems[number]): void {
  if (system !== "regiomontanus" && system !== "campanus" && system !== "topocentric") return;
  for (const [offset, pole] of [...circles(input, system), [90, input.latitude] as const]) {
    const values = projection(reference.ramcOf(input) + offset, pole, input.obliquity);
    expect(Math.hypot(...values), `${system}, ordinary projection ${JSON.stringify(input)}`)
      .toBeGreaterThanOrEqual(MIN_PROJECTION_NORM);
  }
}

function checkOrdering(actual: readonly number[], expected: readonly number[], context: string): void {
  const gaps = (cusps: readonly number[]) => cusps.map((cusp, index) => referenceNormalize(cusps[(index + 1) % 12]! - cusp));
  const a = gaps(actual);
  const b = gaps(expected);
  const winding = (values: readonly number[]) => Math.round(values.reduce((sum, gap) => sum + gap, 0) / 360);
  expect(a.map((gap) => gap === 0), `${context}, degenerate edges`).toEqual(b.map((gap) => gap === 0));
  expect(winding(a), `${context}, reference winding`).toBe(winding(b));
  if (winding(b) !== 1) multipleWindingCases++;
}

afterAll(() => {
  if (process.env.RUSTCORE_PARITY_REPORT === "1")
    console.log(JSON.stringify({ quadrantHousesParityMaxima: maxima, bisectionCases, fallbacks, singularCircleCases, multipleWindingCases }));
});

describe("remaining quadrant house systems through WASM", () => {
  it("retains TypeScript signatures and frozen system/fallback constants", () => {
    expectTypeOf(rust.placidusCusps).toEqualTypeOf<typeof reference.placidusCusps>();
    expectTypeOf(rust.kochCusps).toEqualTypeOf<typeof reference.kochCusps>();
    expectTypeOf(rust.regiomontanusCusps).toEqualTypeOf<typeof reference.regiomontanusCusps>();
    expectTypeOf(rust.campanusCusps).toEqualTypeOf<typeof reference.campanusCusps>();
    expectTypeOf(rust.topocentricCusps).toEqualTypeOf<typeof reference.topocentricCusps>();
    expectTypeOf(rust.alcabitiusCusps).toEqualTypeOf<typeof reference.alcabitiusCusps>();
    expectTypeOf(rust.isPolarUndefinedHouseSystem).toEqualTypeOf<typeof reference.isPolarUndefinedHouseSystem>();
    expect(rust.HOUSE_SYSTEMS).toEqual(reference.HOUSE_SYSTEMS);
    expect(rust.POLAR_UNDEFINED_HOUSE_SYSTEMS).toEqual(reference.POLAR_UNDEFINED_HOUSE_SYSTEMS);
    expect(Object.isFrozen(rust.HOUSE_SYSTEMS)).toBe(true);
    expect(Object.isFrozen(rust.POLAR_UNDEFINED_HOUSE_SYSTEMS)).toBe(true);
    expect(rust.POLAR_FALLBACK).toBe(reference.POLAR_FALLBACK);
    expect(rust.PLACIDUS_POLAR_FALLBACK).toBe(reference.PLACIDUS_POLAR_FALLBACK);
    for (const system of [...reference.HOUSE_SYSTEMS, "synthetic" as HouseSystem])
      expect(rust.isPolarUndefinedHouseSystem(system)).toBe(reference.isPolarUndefinedHouseSystem(system));
  });

  it("compares shared geometry in both hemispheres, including polar circles and near poles", () => {
    for (const latitude of [-89.999999, -80, -66.6, -66, -45, -1, 0, 1, 45, 66, 66.6, 80, 89.999999]) {
      for (let step = 0; step < 48; step++) {
        for (const obliquity of [0, 23.4, 23.43929111111111, 45]) {
          // Offset the quadrant seams. Exact degeneracies have a separate test.
          const input = { gastHours: 0, longitude: step * 7.5 + 0.125, latitude, obliquity };
          const angles = reference.computeAngles(input);
          for (const [name, actual, expected] of pairs) {
            const context = `${name}, ${JSON.stringify(input)}`;
            checkOrdinaryProjectionNorms(input, name);
            compareCusps(actual(input, angles), expected(input, angles), SHARED_INPUT_ARCSEC, `shared ${name} arcsec`, context);
            compareResult(rust.computeHouses(name, input, angles), reference.computeHouses(name, input, angles),
              SHARED_INPUT_ARCSEC, `shared ${name} arcsec`, context);
            if (Math.abs(latitude) < 90 - obliquity) checkOrdering(actual(input, angles)!, expected(input, angles)!, context);
          }
        }
      }
    }
  }, 30_000);

  it("runs independent time/tilt paths over synthetic monthly dates from 1800 through 2200", () => {
    const firstMs = Date.UTC(1800, 0, 1);
    const lastMs = Date.UTC(2200, 11, 31, 23, 59, 59, 999);
    const samples = [firstMs, lastMs, Date.UTC(2000, 0, 1, 12)];
    for (let year = 1800; year <= 2200; year++)
      for (let month = 0; month < 12; month++)
        samples.push(Date.UTC(year, month, 1 + (year + month) % 28, (year + month) % 24, 19, 37, 251));
    const next = randomUint32(0x71396873);
    for (let index = 0; index < 256; index++) samples.push(firstMs + Math.floor(next() / 0x1_0000_0000 * (lastMs - firstMs)));
    const latitudes = [-80, -66.6, -66, -45, -1, 0, 1, 45, 66, 66.6, 80];
    const longitudes = [-180, -137.375, -73.125, -0, 0, 47.25, 119.875, 180];
    for (let index = 0; index < samples.length; index++) {
      const ms = samples[index]!;
      const scale = (["utc", "ut1", "tt"] as const)[index % 3]!;
      const pin = index % 17 === 0 ? [-70, -0, 69.184, 86400.25][index % 4] : undefined;
      const latitude = latitudes[index % latitudes.length]!;
      const longitude = longitudes[index % longitudes.length]!;
      const b = timeBasis(ms, scale, pin);
      const a = rust.timeBasis(ms, scale, pin);
      const expectedInput = { gastHours: gastHours({ ut: b.ut1Days, tt: b.ttDays } as Parameters<typeof gastHours>[0]), obliquity: tilt(b.ttDays).tobl, latitude, longitude };
      const actualInput = { gastHours: rust.gastHours({ ut: a.ut1Days, tt: a.ttDays } as Parameters<typeof gastHours>[0]), obliquity: rust.tilt(a.ttDays).tobl, latitude, longitude };
      const expectedAngles = reference.computeAngles(expectedInput);
      const actualAngles = rust.computeAngles(actualInput);
      for (const system of systems) {
        checkOrdinaryProjectionNorms(expectedInput, system);
        checkOrdinaryProjectionNorms(actualInput, system);
        const expected = reference.computeHouses(system, expectedInput, expectedAngles);
        const actual = rust.computeHouses(system, actualInput, actualAngles);
        const context = `${system}, ms=${ms}, scale=${scale}, pin=${pin}, latitude=${latitude}, longitude=${longitude}`;
        compareResult(actual, expected, END_TO_END_ARCSEC, `independent ${system} arcsec`, context);
        // Discrete membership must agree away from the numeric cusp bound.
        for (const lon of [0, 47.125, 179.875, 271.25]) {
          expect(rust.houseOf(lon, actual.houses.cusps), `${context}, own membership`)
            .toBe(reference.houseOf(lon, actual.houses.cusps));
          if (Math.min(...expected.houses.cusps.map((cusp) => distance(cusp, lon))) * 3600 > END_TO_END_ARCSEC)
            expect(rust.houseOf(lon, actual.houses.cusps), `${context}, longitude=${lon}`)
              .toBe(reference.houseOf(lon, expected.houses.cusps));
        }
      }
    }
  }, 30_000);

  it("preserves inclusive polar cutoffs, early null returns and whole-sign fallback shape", () => {
    for (const obliquity of [0, 23.4, 23.43929111111111, 45, 90]) {
      for (const sign of [-1, 1]) {
        for (const latitude of neighbors(sign * (90 - obliquity))) {
          const input = { gastHours: 0, longitude: 17.25, latitude, obliquity };
          const angles = reference.computeAngles(input);
          const polar = Math.abs(latitude) >= 90 - obliquity;
          for (const [name, actual, expected] of pairs.slice(0, 2)) {
            const context = `${name}, latitude=${latitude}, obliquity=${obliquity}`;
            expect(actual(input, angles) === null, context).toBe(polar);
            compareCusps(actual(input, angles), expected(input, angles), NEAR_LIMIT_ARCSEC, `limit ${name} arcsec`, context);
            compareResult(rust.computeHouses(name, input, angles), reference.computeHouses(name, input, angles),
              NEAR_LIMIT_ARCSEC, `limit ${name} arcsec`, context);
            if (polar) {
              const unused = { ...input, gastHours: NaN, longitude: Infinity };
              const invalidAngles = { asc: NaN, mc: NaN, dsc: NaN, ic: NaN };
              expect(actual(unused, invalidAngles), `${context}, early return`).toBeNull();
              expect(expected(unused, invalidAngles), `${context}, reference early return`).toBeNull();
              compareResult(rust.computeHouses(name, unused, angles), reference.computeHouses(name, unused, angles),
                0, "fallback arcsec", context);
            }
          }
        }
      }
    }
  });

  it("retains Placidus results when adjacent-limit rounding requires bisection", () => {
    for (const obliquity of [23.4, 23.43929111111111, 23.4392911, 23.4271]) {
      for (const sign of [-1, 1]) {
        const limit = 90 - obliquity;
        const latitude = sign * Math.min(...neighbors(limit));
        for (const ramc of [30, 90, 150, 210, 270, 330]) {
          for (const longitude of [...neighbors(ramc), ramc - 1e-8, ramc + 1e-8,
            ...Array.from({ length: 101 }, (_, index) => ramc + (index - 50) * 1e-4)]) {
            const input = { gastHours: 0, longitude, latitude, obliquity };
            const angles = reference.computeAngles(input);
            if (referenceNeedsBisection(input)) bisectionCases++;
            const actual = rust.placidusCusps(input, angles);
            expect(actual, JSON.stringify(input)).not.toBeNull();
            compareCusps(actual, reference.placidusCusps(input, angles), NEAR_LIMIT_ARCSEC,
              "bisection placidus arcsec", JSON.stringify(input));
            expect(rust.computeHouses("placidus", input, angles).fellBack).toBe(false);
          }
        }
      }
    }
    expect(bisectionCases).toBeGreaterThan(0);
  });

  it("matches geographic pole results on shared supplied axes away from meridian seams", () => {
    for (const latitude of [-90, 90]) {
      for (const longitude of [17.25, 107.25, 197.25, 287.25]) {
        const input = { gastHours: 0, longitude, latitude, obliquity: 23.4 };
        const angles = reference.computeAngles(input);
        for (const [name, actual, expected] of pairs)
          compareCusps(actual(input, angles), expected(input, angles), SHARED_INPUT_ARCSEC,
            `geographic pole ${name} arcsec`, JSON.stringify(input));
      }
    }
  });

  it("checks intermediate-circle residuals separately at singular Regiomontanus and Topocentric cusps", () => {
    const cuspIndices = [10, 11, 1, 2] as const;
    for (const [system, actual, expected] of [pairs[2], pairs[4]] as const) {
      for (const obliquity of [23.4, 23.43929111111111]) {
        // Near/far pole heights reach 90-epsilon at these geodetic latitudes.
        const factors = system === "regiomontanus" ? [2, 1 / Math.cos(30 * DEG)] : [3, 1.5];
        for (const [circle, factor] of factors.entries()) {
          const tangentLatitude = Math.atan(factor / Math.tan(obliquity * DEG)) * RAD;
          const offset = circle === 0 ? 30 : 60;
          for (const sign of [-1, 1]) {
            const ramc = sign === 1 ? 360 - offset : 180 - offset;
            for (const latitude of neighbors(sign * tangentLatitude)) {
              for (const longitude of neighbors(ramc)) {
                const input = { gastHours: 0, longitude, latitude, obliquity };
                const angles = reference.computeAngles(input);
                const a = actual(input, angles);
                const b = expected(input, angles);
                const context = `${system}, ${JSON.stringify(input)}`;
                for (const [index, [ascension, pole]] of circles(input, system).entries()) {
                  const [numerator, denominator] = projection(reference.ramcOf(input) + ascension, pole, obliquity);
                  const cusp = cuspIndices[index]!;
                  if (Math.hypot(numerator, denominator) >= MIN_PROJECTION_NORM) {
                    compareAngle(a[cusp]!, b[cusp]!, SHARED_INPUT_ARCSEC, `nonsingular ${system} arcsec`, context);
                  } else {
                    singularCircleCases++;
                    for (const cusps of [a, b]) {
                      const lambda = cusps[cusp]! * DEG;
                      expect(Number.isFinite(lambda), context).toBe(true);
                      const residual = Math.sin(lambda) * denominator - Math.cos(lambda) * numerator;
                      expect(Math.abs(residual), `${context}, singular circle residual`).toBeLessThanOrEqual(SINGULAR_CIRCLE_RESIDUAL);
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
    expect(singularCircleCases).toBeGreaterThan(0);
  });

  it("preserves supplied-angle dependencies, copied bits, circle turning and mutable result ownership", () => {
    const input = { gastHours: 5.25, longitude: -73.125, latitude: 45, obliquity: 23.4 };
    for (const angles of [
      { asc: -0, mc: 0, dsc: -0, ic: -0 },
      { asc: 725, mc: -10, dsc: -535, ic: 350 },
      { asc: 42, mc: 17, dsc: NaN, ic: Infinity }
    ]) {
      for (const [name, actual, expected] of pairs)
        compareCall(() => actual(input, angles), () => expected(input, angles), `${name}, independent axes`);
      const placidus = rust.placidusCusps(input, angles)!;
      for (const [index, key] of [[0, "asc"], [3, "ic"], [6, "dsc"], [9, "mc"]] as const)
        expectSameNumber(placidus[index]!, angles[key], `Placidus copied ${key}`);
      for (const [name, actual, expected] of [pairs[1], pairs[5]] as const) {
        const a = actual(input, angles)!;
        const b = expected(input, angles)!;
        for (const index of [0, 3, 6, 9])
          expectSameNumber(a[index]!, b[index]!, `${name}, arithmetic-only anchor cusp=${index + 1}`);
      }
      for (const [name, actual, expected] of pairs.slice(2, 5)) {
        const a = actual(input, angles)!;
        const b = expected(input, angles)!;
        for (const index of [3, 9])
          expectSameNumber(a[index]!, b[index]!, `${name}, arithmetic-only meridian cusp=${index + 1}`);
      }
    }
    for (const [name, actual, expected] of pairs.slice(2, 5)) {
      const angles = { asc: NaN, mc: 17, dsc: Infinity, ic: -Infinity };
      compareCall(() => actual(input, angles), () => expected(input, angles), `${name}, ignores unused axes`);
    }
    for (const latitude of [-80, -45, 45, 80]) {
      const geometry = { ...input, latitude };
      const angles = reference.computeAngles(geometry);
      for (const system of reference.HOUSE_SYSTEMS) {
        const first = rust.computeHouses(system, geometry, angles);
        const second = rust.computeHouses(system, geometry, angles);
        expect(first).not.toBe(second);
        expect(first.houses).not.toBe(second.houses);
        expect(first.houses.cusps).not.toBe(second.houses.cusps);
        expect(Object.isFrozen(first.houses.cusps)).toBe(false);
        first.houses.cusps[0] = -1;
        expect(second.houses.cusps[0]).not.toBe(-1);
        for (const cusp of second.houses.cusps)
          for (const lon of neighbors(cusp))
            expect(rust.houseOf(lon, second.houses.cusps)).toBe(reference.houseOf(lon, second.houses.cusps));
      }
    }
  });

  it("matches nonfinite input acceptance and errors without adding validation to pure helpers", () => {
    const input = { gastHours: 5.25, longitude: -73.125, latitude: 45, obliquity: 23.4 };
    const angles = reference.computeAngles(input);
    for (const field of ["gastHours", "longitude", "latitude", "obliquity"] as const) {
      for (const invalid of [NaN, Infinity, -Infinity]) {
        const bad = { ...input, [field]: invalid };
        for (const [name, actual, expected] of pairs)
          compareCall(() => actual(bad, angles), () => expected(bad, angles), `${name}, ${field}=${invalid}`);
      }
    }
    for (const key of ["asc", "mc", "dsc", "ic"] as const) {
      for (const invalid of [NaN, Infinity, -Infinity]) {
        const bad: Angles = { ...angles, [key]: invalid };
        for (const [name, actual, expected] of pairs)
          compareCall(() => actual(input, bad), () => expected(input, bad), `${name}, ${key}=${invalid}`);
      }
    }
    // Koch deliberately has no asin clamp. Binary rounding can make its
    // argument exceed one even immediately below the accepted latitude limit.
    const roundedKoch = { ...input, latitude: 66.56226, obliquity: 23.437739999999998 };
    const suppliedAngles = { ...angles, mc: 90 };
    expect(roundedKoch.latitude).toBeLessThan(90 - roundedKoch.obliquity);
    expect(() => reference.kochCusps(roundedKoch, suppliedAngles)).toThrow("Longitude must be finite.");
    compareCall(() => rust.kochCusps(roundedKoch, suppliedAngles), () => reference.kochCusps(roundedKoch, suppliedAngles),
      "Koch unclamped argument rounds above one");
  });
});
