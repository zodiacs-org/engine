import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, expectTypeOf, it } from "vitest";
import * as reference from "../../src/houses.js";
import { gastHours } from "../../src/ephemeris.js";
import { tilt } from "../../src/nutation.js";
import { timeBasis } from "../../src/time-scale.js";
import type { AngleInput } from "../../src/houses.js";
import type { Angles, HouseSystem } from "../../src/types.js";
import * as rust from "../ts/index.js";
import {
  binary64Samples, expectSameError, expectSameNumber, expectSameNumberCall,
  neighbors, outcome, randomUint32
} from "./parity-helpers.js";

beforeAll(() => {
  rust.initRustCore(readFileSync(new URL("../pkg/zodiacs_rustcore_bg.wasm", import.meta.url)));
});

// Fixed before the first comparison. V8 and Rust/WASM transcendental calls
// may round differently; the additions, products and divisions retain order.
const SHARED_INPUT_ARCSEC = 1e-8;
// Independent clocks/tilts add the preceding milestones' angular roundoff.
// The explicit conditioning guard below limits amplification by atan2.
const END_TO_END_ARCSEC = 1e-6;
const MIN_ASCENDANT_NORM = 0.01;
// At exact/adjacent horizon coincidences longitude is not unique. This checks
// that each returned axis is on its own supplied horizon, not their agreement.
const SINGULAR_HORIZON_RESIDUAL = 2e-15;
const DEG = Math.PI / 180;
const systems = ["whole", "equal", "equal-mc", "vehlow", "porphyry", "meridian", "morinus"] as const;
const angleKeys = ["asc", "mc", "dsc", "ic"] as const;
const arithmeticPairs = [
  ["equal", rust.equalCusps, reference.equalCusps],
  ["equal-mc", rust.equalMcCusps, reference.equalMcCusps],
  ["vehlow", rust.vehlowCusps, reference.vehlowCusps],
  ["porphyry", rust.porphyryCusps, reference.porphyryCusps]
] as const;
const maxima: Record<string, number> = {};
let singularAscendantDifferences = 0;
let illConditionedDateCases = 0;
let illConditionedSharedCases = 0;
let boundaryHouseDifferences = 0;
let boundaryWholeSignDifferences = 0;

function angularDistance(actual: number, expected: number): number {
  let difference = (actual - expected) % 360;
  if (difference > 180) difference -= 360;
  if (difference < -180) difference += 360;
  return Math.abs(difference);
}

function angular(actual: number, expected: number, tolerance: number, quantity: string, context: string): void {
  expect(Number.isFinite(actual), `${quantity}: ${context}`).toBe(true);
  const difference = angularDistance(actual, expected) * 3600;
  maxima[quantity] = Math.max(maxima[quantity] ?? 0, difference);
  expect(difference, `${quantity}: ${context}`).toBeLessThanOrEqual(tolerance);
}

function sameCusps(actual: readonly number[], expected: readonly number[], context: string): void {
  expect(actual.length, context).toBe(expected.length);
  for (let index = 0; index < expected.length; index++)
    expectSameNumber(actual[index]!, expected[index]!, `${context}, cusp=${index + 1}`);
}

function sameCuspCall(actual: () => number[], expected: () => number[], context: string): void {
  const referenceResult = outcome(expected);
  const result = outcome(actual);
  expect(result.ok, context).toBe(referenceResult.ok);
  if (result.ok && referenceResult.ok) sameCusps(result.value, referenceResult.value, context);
  else if (!result.ok && !referenceResult.ok) expectSameError(result.error, referenceResult.error, context);
}

function compareCusps(actual: readonly number[], expected: readonly number[], tolerance: number, quantity: string, context: string): void {
  expect(actual.length, context).toBe(12);
  for (let index = 0; index < 12; index++)
    angular(actual[index]!, expected[index]!, tolerance, quantity, `${context}, cusp=${index + 1}`);
}

function ascendantNorm(input: AngleInput): number {
  const ramc = reference.ramcOf(input) * DEG;
  return Math.hypot(Math.cos(ramc), Math.sin(ramc) * Math.cos(input.obliquity * DEG)
    + Math.tan(input.latitude * DEG) * Math.sin(input.obliquity * DEG));
}

function compareAngles(actual: Angles, expected: Angles, tolerance: number, prefix: string, context: string): void {
  expect(Object.keys(actual), context).toEqual(Object.keys(expected));
  for (const key of angleKeys) angular(actual[key], expected[key], tolerance, `${prefix} ${key} arcsec`, context);
  expectSameNumber(actual.dsc, rust.normalizeLongitude(actual.asc + 180), `${context}, own descendant`);
  expectSameNumber(actual.ic, rust.normalizeLongitude(actual.mc + 180), `${context}, own lower meridian`);
}

function checkHorizonAngles(angles: Angles, input: AngleInput, context: string): void {
  for (const key of angleKeys) {
    expect(Number.isFinite(angles[key]), context).toBe(true);
    expect(angles[key], context).toBeGreaterThanOrEqual(0);
    expect(angles[key], context).toBeLessThan(360);
  }
  expectSameNumber(angles.dsc, rust.normalizeLongitude(angles.asc + 180), `${context}, own opposite`);
  expectSameNumber(angles.ic, rust.normalizeLongitude(angles.mc + 180), `${context}, own lower meridian`);
  const lambda = angles.asc * DEG;
  const theta = reference.ramcOf(input) * DEG;
  const phi = input.latitude * DEG;
  const eps = input.obliquity * DEG;
  const residual = Math.cos(phi) * Math.cos(lambda) * Math.cos(theta)
    + Math.cos(phi) * Math.sin(lambda) * Math.cos(eps) * Math.sin(theta)
    + Math.sin(phi) * Math.sin(lambda) * Math.sin(eps);
  expect(Math.abs(residual), context).toBeLessThanOrEqual(SINGULAR_HORIZON_RESIDUAL);
  const east = -Math.sin(theta) * Math.cos(lambda) + Math.cos(theta) * Math.sin(lambda) * Math.cos(eps);
  // This is the selected coordinate half-horizon convention. At geographic
  // poles it is not a physical assertion that a point rises or is unique.
  expect(east, `${context}, local-east projection`).toBeGreaterThanOrEqual(-SINGULAR_HORIZON_RESIDUAL);
}

function compareMetadata(actual: ReturnType<typeof rust.computeHouses>, expected: ReturnType<typeof reference.computeHouses>, context: string): void {
  expect(Object.keys(actual), context).toEqual(Object.keys(expected));
  expect(Object.keys(actual.houses), context).toEqual(Object.keys(expected.houses));
  expect(actual.houses.system, context).toBe(expected.houses.system);
  expect(actual.fellBack, context).toBe(false);
  expect(actual.fallbackSystem, context).toBe(null);
}

function compareSharedInput(input: AngleInput, context: string): void {
  const expectedAngles = reference.computeAngles(input);
  const actualAngles = rust.computeAngles(input);
  expectSameNumber(rust.ramcOf(input), reference.ramcOf(input), `${context}, shared RAMC`);
  if (ascendantNorm(input) >= MIN_ASCENDANT_NORM)
    compareAngles(actualAngles, expectedAngles, SHARED_INPUT_ARCSEC, "shared", context);
  else {
    illConditionedSharedCases++;
    if (angularDistance(actualAngles.asc, expectedAngles.asc) !== 0) singularAscendantDifferences++;
    checkHorizonAngles(actualAngles, input, `${context}, port`);
    checkHorizonAngles(expectedAngles, input, `${context}, reference`);
    angular(actualAngles.mc, expectedAngles.mc, SHARED_INPUT_ARCSEC, "shared MC arcsec", context);
    angular(actualAngles.ic, expectedAngles.ic, SHARED_INPUT_ARCSEC, "shared IC arcsec", context);
  }

  sameCusps(rust.wholeSignCusps(expectedAngles.asc), reference.wholeSignCusps(expectedAngles.asc), `${context}, whole`);
  for (const [name, implementation, expected] of arithmeticPairs)
    sameCusps(implementation(expectedAngles), expected(expectedAngles), `${context}, shared ${name}`);
  for (const [name, implementation, expected] of [
    ["meridian", rust.meridianCusps, reference.meridianCusps],
    ["morinus", rust.morinusCusps, reference.morinusCusps]
  ] as const)
    compareCusps(implementation(input), expected(input), SHARED_INPUT_ARCSEC, `shared ${name} arcsec`, context);

  for (const system of systems) {
    const expected = reference.computeHouses(system, input, expectedAngles);
    const actual = rust.computeHouses(system, input, expectedAngles);
    compareMetadata(actual, expected, `${context}, ${system}`);
    if (system === "meridian" || system === "morinus")
      compareCusps(actual.houses.cusps, expected.houses.cusps, SHARED_INPUT_ARCSEC, `shared ${system} arcsec`, context);
    else sameCusps(actual.houses.cusps, expected.houses.cusps, `${context}, dispatch ${system}`);
  }
}

const firstMs = Date.UTC(1800, 0, 1);
const lastMs = Date.UTC(2200, 11, 31, 23, 59, 59, 999);
const syntheticMs = [firstMs, lastMs, Date.UTC(2000, 0, 1, 12)];
for (let year = 1800; year <= 2200; year++) {
  for (let month = 0; month < 12; month++)
    syntheticMs.push(Date.UTC(year, month, 1 + (year + month) % 28, (year + month) % 24, 19, 37, 251));
}
const nextDate = randomUint32(0x686f7573);
for (let index = 0; index < 256; index++)
  syntheticMs.push(firstMs + Math.floor(nextDate() / 0x1_0000_0000 * (lastMs - firstMs)));
const latitudes = [-89.999999, -80, -66.6, -66, -45, -1, 0, 1, 45, 66, 66.6, 80, 89.999999];
const longitudes = [-180, -137.375, -73.125, -0, 0, 47.25, 119.875, 180];

afterAll(() => {
  if (process.env.RUSTCORE_PARITY_REPORT === "1") console.log(JSON.stringify({
    housesParityMaxima: maxima, singularAscendantDifferences, illConditionedDateCases, illConditionedSharedCases,
    boundaryHouseDifferences, boundaryWholeSignDifferences
  }));
});

describe("angles and implemented house systems through WASM", () => {
  it("pins the locally translated house source bytes", () => {
    const bytes = readFileSync(new URL("../../src/houses.ts", import.meta.url));
    expect(createHash("sha256").update(bytes).digest("hex"))
      .toBe("e97ea80f5f225fadf0bfcb051f0afcce820678f31ff1013cc0ebce3035cc8ceb");
  });

  it("retains each TypeScript function signature", () => {
    expectTypeOf(rust.ramcOf).toEqualTypeOf<typeof reference.ramcOf>();
    expectTypeOf(rust.computeAngles).toEqualTypeOf<typeof reference.computeAngles>();
    expectTypeOf(rust.wholeSignCusps).toEqualTypeOf<typeof reference.wholeSignCusps>();
    expectTypeOf(rust.equalCusps).toEqualTypeOf<typeof reference.equalCusps>();
    expectTypeOf(rust.equalMcCusps).toEqualTypeOf<typeof reference.equalMcCusps>();
    expectTypeOf(rust.vehlowCusps).toEqualTypeOf<typeof reference.vehlowCusps>();
    expectTypeOf(rust.porphyryCusps).toEqualTypeOf<typeof reference.porphyryCusps>();
    expectTypeOf(rust.meridianCusps).toEqualTypeOf<typeof reference.meridianCusps>();
    expectTypeOf(rust.morinusCusps).toEqualTypeOf<typeof reference.morinusCusps>();
    expectTypeOf(rust.computeHouses).toEqualTypeOf<typeof reference.computeHouses>();
    expectTypeOf(rust.houseOf).toEqualTypeOf<typeof reference.houseOf>();
  });

  it("keeps RAMC and shared-input cusp arithmetic bit-exact at boundaries and binary64 extremes", () => {
    const inputs = [
      ...Array.from({ length: 73 }, (_, index) => (index - 36) * 30).flatMap(neighbors),
      ...binary64Samples(1024, 0x63757370), 0.1, -0.1, Number.MAX_VALUE, -Number.MAX_VALUE,
      NaN, Infinity, -Infinity
    ];
    for (let index = 0; index < inputs.length; index++) {
      const value = inputs[index]!;
      const paired = inputs[(index + 1) % inputs.length]!;
      const input = { gastHours: value, longitude: paired };
      expectSameNumberCall(() => rust.ramcOf(input), () => reference.ramcOf(input), `RAMC sample=${index}`);
      sameCuspCall(() => rust.wholeSignCusps(value), () => reference.wholeSignCusps(value), `whole sample=${index}`);
      // Independent fields deliberately include inconsistent axes. Pure cusp
      // helpers must neither recompute the angles nor normalize copied fields.
      const angles = { asc: value, mc: paired, dsc: -0, ic: -paired };
      for (const [name, actual, expected] of arithmeticPairs)
        sameCuspCall(() => actual(angles), () => expected(angles), `${name} sample=${index}`);
    }
    for (const angles of [
      { asc: -0, mc: 0, dsc: -0, ic: 180 },
      { asc: 725, mc: -10, dsc: -535, ic: 350 },
      { asc: 42, mc: 17, dsc: NaN, ic: 197 },
      { asc: 42, mc: NaN, dsc: Infinity, ic: -Infinity }
    ]) {
      for (const [name, actual, expected] of arithmeticPairs)
        sameCuspCall(() => actual(angles), () => expected(angles), `${name} independent fields`);
    }
  });

  it("compares shared-input northern, southern and polar geometry over right ascension quadrants", () => {
    for (const latitude of latitudes) {
      for (let step = 0; step < 48; step++) {
        for (const obliquity of [0, 23.4, 23.43929111111111, 45]) {
          const input = { gastHours: step / 2, longitude: 0, latitude, obliquity };
          // Input geometry selects the angular or residual contract before
          // examining either implementation's ascendant. Every grid point runs.
          compareSharedInput(input, `latitude=${latitude}, RAMC=${step * 7.5}, obliquity=${obliquity}`);
        }
      }
    }
  }, 30_000);

  it("runs the independent time, sidereal, tilt and house paths on monthly and seeded dates from 1800 through 2200", () => {
    for (let index = 0; index < syntheticMs.length; index++) {
      const ms = syntheticMs[index]!;
      const scale = (["utc", "ut1", "tt"] as const)[index % 3]!;
      const pin = index % 17 === 0 ? [-70, -0, 69.184, 86400.25][index % 4] : undefined;
      const latitude = latitudes[index % latitudes.length]!;
      const longitude = longitudes[index % longitudes.length]!;
      const referenceBasis = timeBasis(ms, scale, pin);
      const portBasis = rust.timeBasis(ms, scale, pin);
      const referenceTime = { ut: referenceBasis.ut1Days, tt: referenceBasis.ttDays } as Parameters<typeof gastHours>[0];
      const portTime = { ut: portBasis.ut1Days, tt: portBasis.ttDays } as Parameters<typeof gastHours>[0];
      const expectedInput = { gastHours: gastHours(referenceTime), obliquity: tilt(referenceBasis.ttDays).tobl, latitude, longitude };
      const actualInput = { gastHours: rust.gastHours(portTime), obliquity: rust.tilt(portBasis.ttDays).tobl, latitude, longitude };
      const context = `ms=${ms}, scale=${scale}, pin=${pin}, latitude=${latitude}, longitude=${longitude}`;
      // Classify from each input before examining the returned longitude.
      // Poorly conditioned samples retain MC/equatorial-cusp parity, horizon
      // geometry and exact shared-input arithmetic instead of being skipped.
      const conditioned = ascendantNorm(expectedInput) >= MIN_ASCENDANT_NORM
        && ascendantNorm(actualInput) >= MIN_ASCENDANT_NORM;
      const expectedAngles = reference.computeAngles(expectedInput);
      const actualAngles = rust.computeAngles(actualInput);
      if (conditioned) compareAngles(actualAngles, expectedAngles, END_TO_END_ARCSEC, "independent", context);
      else {
        illConditionedDateCases++;
        if (angularDistance(actualAngles.asc, expectedAngles.asc) !== 0) singularAscendantDifferences++;
        checkHorizonAngles(actualAngles, actualInput, `${context}, port`);
        checkHorizonAngles(expectedAngles, expectedInput, `${context}, reference`);
        angular(actualAngles.mc, expectedAngles.mc, END_TO_END_ARCSEC, "independent MC arcsec", context);
        angular(actualAngles.ic, expectedAngles.ic, END_TO_END_ARCSEC, "independent IC arcsec", context);
      }
      angular(rust.ramcOf(actualInput), reference.ramcOf(expectedInput), END_TO_END_ARCSEC, "independent RAMC arcsec", context);
      for (const system of systems) {
        const expected = reference.computeHouses(system, expectedInput, expectedAngles);
        const actual = rust.computeHouses(system, actualInput, actualAngles);
        compareMetadata(actual, expected, `${context}, ${system}`);
        if (system === "whole") {
          const distance = Math.min(expectedAngles.asc % 30, 30 - expectedAngles.asc % 30) * 3600;
          if (conditioned && distance > END_TO_END_ARCSEC) sameCusps(actual.houses.cusps, expected.houses.cusps, `${context}, whole`);
          else if (actual.houses.cusps[0] !== expected.houses.cusps[0]) boundaryWholeSignDifferences++;
          sameCusps(actual.houses.cusps, reference.wholeSignCusps(actualAngles.asc), `${context}, own whole`);
        } else {
          if (conditioned || system === "meridian" || system === "morinus")
            compareCusps(actual.houses.cusps, expected.houses.cusps, END_TO_END_ARCSEC, `independent ${system} arcsec`, context);
          const pair = arithmeticPairs.find(([name]) => name === system);
          if (pair) sameCusps(actual.houses.cusps, pair[2](actualAngles), `${context}, own ${system}`);
        }
        for (const bodyLongitude of [0, 47.125, 179.875, 271.25]) {
          const portHouse = rust.houseOf(bodyLongitude, actual.houses.cusps);
          const referenceHouse = reference.houseOf(bodyLongitude, expected.houses.cusps);
          expect(portHouse, `${context}, ${system}, own membership`).toBe(reference.houseOf(bodyLongitude, actual.houses.cusps));
          const margin = Math.min(...expected.houses.cusps.map((cusp) => angularDistance(cusp, bodyLongitude))) * 3600;
          const comparable = conditioned || system === "meridian" || system === "morinus";
          if (comparable && margin > END_TO_END_ARCSEC && (system !== "whole" || actual.houses.cusps[0] === expected.houses.cusps[0]))
            expect(portHouse, `${context}, ${system}, longitude=${bodyLongitude}`).toBe(referenceHouse);
          else if (portHouse !== referenceHouse) boundaryHouseDifferences++;
        }
      }
    }
  }, 30_000);

  it("checks horizon residuals separately at exact and adjacent singular geometry, including geographic poles", () => {
    for (const obliquity of [23.4, 23.43929111111111, 45]) {
      for (const hemisphere of [-1, 1]) {
        const ramc = hemisphere === 1 ? 270 : 90;
        for (const latitude of [...neighbors(hemisphere * (90 - obliquity)), hemisphere * 90]) {
          for (const longitude of [...neighbors(ramc), ramc - 1e-8, ramc + 1e-8]) {
            const input = { gastHours: 0, longitude, latitude, obliquity };
            const actual = rust.computeAngles(input);
            const expected = reference.computeAngles(input);
            const context = `latitude=${latitude}, RAMC=${longitude}, obliquity=${obliquity}`;
            angular(actual.mc, expected.mc, SHARED_INPUT_ARCSEC, "singular MC arcsec", context);
            angular(actual.ic, expected.ic, SHARED_INPUT_ARCSEC, "singular IC arcsec", context);
            if (angularDistance(actual.asc, expected.asc) !== 0) singularAscendantDifferences++;
            for (const angles of [actual, expected]) {
              checkHorizonAngles(angles, input, context);
              for (const [name, implementation, expectedCusps] of arithmeticPairs)
                sameCusps(implementation(angles), expectedCusps(angles), `${context}, singular shared ${name}`);
            }
            compareCusps(rust.meridianCusps(input), reference.meridianCusps(input), SHARED_INPUT_ARCSEC, "singular meridian arcsec", context);
            compareCusps(rust.morinusCusps(input), reference.morinusCusps(input), SHARED_INPUT_ARCSEC, "singular morinus arcsec", context);
          }
        }
      }
    }
    // Geographic poles have no physical rising direction. Even when atan2's
    // norm is large, its half-horizon branch may sit on a rounded meridian
    // seam at RAMC 0/180, so these cases use only the separate axis contract.
    for (const latitude of [-90, 90]) {
      for (const ramc of [-0, 0, 90, 180, 270]) {
        const input = { gastHours: 0, longitude: ramc, latitude, obliquity: 23.4 };
        const actual = rust.computeAngles(input);
        const expected = reference.computeAngles(input);
        const context = `geographic pole=${latitude}, RAMC=${ramc}`;
        checkHorizonAngles(actual, input, context);
        checkHorizonAngles(expected, input, context);
        angular(actual.mc, expected.mc, SHARED_INPUT_ARCSEC, "geographic pole MC arcsec", context);
        angular(actual.ic, expected.ic, SHARED_INPUT_ARCSEC, "geographic pole IC arcsec", context);
        compareCusps(rust.meridianCusps(input), reference.meridianCusps(input), SHARED_INPUT_ARCSEC, "geographic pole meridian arcsec", context);
        compareCusps(rust.morinusCusps(input), reference.morinusCusps(input), SHARED_INPUT_ARCSEC, "geographic pole morinus arcsec", context);
      }
    }
  });

  it("returns fresh mutable records and ignores irrelevant fields for each cusp definition", () => {
    const input = { gastHours: 5.25, longitude: -73.125, latitude: 80, obliquity: 23.4 };
    const angles = reference.computeAngles(input);
    const firstAngles = rust.computeAngles(input);
    const secondAngles = rust.computeAngles(input);
    expect(firstAngles).not.toBe(secondAngles);
    expect(Object.isFrozen(firstAngles)).toBe(false);
    for (const system of systems) {
      const first = rust.computeHouses(system, input, angles);
      const second = rust.computeHouses(system, input, angles);
      expect(first).not.toBe(second);
      expect(first.houses).not.toBe(second.houses);
      expect(first.houses.cusps).not.toBe(second.houses.cusps);
      first.houses.cusps[0] = 1234;
      expect(second.houses.cusps[0]).not.toBe(1234);
    }
    for (const latitude of [NaN, Infinity, -Infinity, -90, 90]) {
      const unusedLatitude = { ...input, latitude };
      sameCusps(rust.meridianCusps(unusedLatitude), rust.meridianCusps(input), "Meridian ignores latitude");
      sameCusps(rust.morinusCusps(unusedLatitude), rust.morinusCusps(input), "Morinus ignores latitude");
    }
    const unusedInput = { gastHours: NaN, latitude: NaN, longitude: Infinity, obliquity: -Infinity };
    for (const system of ["whole", "equal", "equal-mc", "vehlow", "porphyry"] as const)
      sameCusps(rust.computeHouses(system, unusedInput, angles).houses.cusps,
        reference.computeHouses(system, unusedInput, angles).houses.cusps, `${system} ignores AngleInput`);
  });

  it("preserves numeric rejection and unknown-system messages while explicitly refusing pending systems", () => {
    const input = { gastHours: 5.25, longitude: -73.125, latitude: 80, obliquity: 23.4 };
    const angles = reference.computeAngles(input);
    for (const field of ["gastHours", "longitude", "latitude", "obliquity"] as const) {
      for (const invalid of [NaN, Infinity, -Infinity]) {
        const bad = { ...input, [field]: invalid };
        const expected = outcome(() => reference.computeAngles(bad));
        const actual = outcome(() => rust.computeAngles(bad));
        expect(actual.ok, field).toBe(expected.ok);
        if (!actual.ok && !expected.ok) expectSameError(actual.error, expected.error, `${field}=${invalid}`);
      }
    }
    for (const system of ["", "Equal", "synthetic", null, undefined, 7, Symbol("synthetic")]) {
      const expected = outcome(() => reference.computeHouses(system as HouseSystem, input, angles));
      const actual = outcome(() => rust.computeHouses(system as HouseSystem, input, angles));
      expect(actual.ok).toBe(false);
      if (!actual.ok && !expected.ok) expectSameError(actual.error, expected.error, `system=${String(system)}`);
    }
    for (const system of ["placidus", "koch", "regiomontanus", "campanus", "topocentric", "alcabitius"] as const)
      expect(() => rust.computeHouses(system, input, angles))
        .toThrow(new RangeError(`House system ${system} is not implemented in this Rust milestone.`));
  });
});

describe("house membership on identical supplied cusps", () => {
  it("matches exact boundaries, adjacent doubles and wraps in all implemented systems", () => {
    for (const latitude of [-89.999999, -66.6, -45, 0, 45, 66.6, 89.999999]) {
      const input = { gastHours: 7.125, longitude: -13.25, latitude, obliquity: 23.4 };
      const angles = reference.computeAngles(input);
      for (const system of systems) {
        const cusps = reference.computeHouses(system, input, angles).houses.cusps;
        for (const cusp of cusps) {
          for (const shift of [-720, -360, 0, 360, 720]) {
            for (const longitude of neighbors(cusp + shift))
              expectSameNumberCall(() => rust.houseOf(longitude, cusps), () => reference.houseOf(longitude, cusps),
                `latitude=${latitude}, ${system}, longitude=${longitude}`);
          }
        }
      }
    }
  });

  it("matches degeneracies, missing edges, short-circuit order, overflow and rejection", () => {
    const ordinary = reference.wholeSignCusps(0);
    const firstGap = ordinary.slice();
    delete firstGap[0];
    const empty = new Array<number>(12);
    const sparse = new Array<number>(12);
    sparse[5] = 120;
    sparse[6] = 150;
    const lateInvalid = ordinary.slice();
    lateInvalid[7] = NaN;
    const duplicate = ordinary.slice();
    duplicate[1] = 0;
    const allLongitudes = [
      ...neighbors(0), ...neighbors(30), ...neighbors(360), -721, 721,
      Number.MAX_VALUE, -Number.MAX_VALUE, NaN, Infinity, -Infinity
    ];
    const cuspSets = [
      [], ordinary.slice(0, 11), [...ordinary, 360], ordinary, firstGap, empty, sparse,
      lateInvalid, duplicate, [...ordinary].reverse(), new Array<number>(12).fill(-0),
      new Array<number>(12).fill(Number.MAX_VALUE), new Array<number>(12).fill(NaN),
      [Number.MAX_VALUE, -Number.MAX_VALUE, ...ordinary.slice(2)]
    ];
    for (let index = 0; index < cuspSets.length; index++) {
      const cusps = cuspSets[index]!;
      for (const longitude of allLongitudes)
        expectSameNumberCall(() => rust.houseOf(longitude, cusps), () => reference.houseOf(longitude, cusps),
          `cusp set=${index}, longitude=${longitude}`);
    }
    const next = randomUint32(0x686f7573);
    for (let index = 0; index < 1024; index++) {
      const cusps = Array.from({ length: 12 }, () => next() / 0x1_0000_0000 * 2160 - 1080);
      const longitude = next() / 0x1_0000_0000 * 2160 - 1080;
      expectSameNumberCall(() => rust.houseOf(longitude, cusps), () => reference.houseOf(longitude, cusps), `unordered sample=${index}`);
    }
  });
});
