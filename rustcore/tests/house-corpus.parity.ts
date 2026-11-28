import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { positions } from "../../src/api.js";
import { gastHours } from "../../src/ephemeris.js";
import * as reference from "../../src/houses.js";
import { tilt } from "../../src/nutation.js";
import { timeBasis } from "../../src/time-scale.js";
import type { AngleInput } from "../../src/houses.js";
import type { Angles, BodyPosition, HouseSystem } from "../../src/types.js";
import * as rust from "../ts/index.js";
import { expectSameError, expectSameNumber, neighbors, outcome } from "./parity-helpers.js";

beforeAll(() => rust.initRustCore(readFileSync(new URL("../pkg/zodiacs_rustcore_bg.wasm", import.meta.url))));

// Existing ordinary house and position contracts. No acceptance limit depends
// on an observed output or gets raised when a comparison fails.
const SHARED_ARCSEC = 1e-8;
const CLOCK_ARCSEC = 1e-6;
const BODY_ARCSEC = 1e-7;
const NODE_ARCSEC = 0.005;
const POLAR_LIMIT_ARCSEC = 0.01;
// This separate, preselected finite-geometry corpus extends the previous
// residual-only region. A 1e-7 projection norm amplifies binary64 trig
// roundoff, so use an explicit angular bound, equal to the existing polar
// edge allowance. It is not substituted for ordinary-geometry tolerances.
const FINITE_NEAR_SINGULAR_ARCSEC = 0.01;
const MIN_FINITE_NORM = 1e-7;
const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;
const FROM = Date.UTC(1800, 0, 1);
const TO = Date.UTC(2200, 11, 31, 23, 59, 59, 999);
const latitudes = [-90, -89.999999, -80, -66.6, -66, -45, -1, -0, 0, 1, 45, 66, 66.6, 80, 89.999999, 90];
const longitudes = [-180, -137.375, -73.125, -0, 0, 47.25, 119.875, 180];
const dates = [FROM, TO];
for (let year = 1800; year <= 2200; year++)
  dates.push(Date.UTC(year, (year * 7) % 12, 1 + year % 28, year % 24, 37, 19, 251));

const maxima: Record<string, number> = {};
const counts = {
  dates: 0, independentGeometries: 0, independentSystems: 0, polarFallbacks: 0,
  bodyPositionDates: 0, bodyMemberships: 0, fixedLongitudeMemberships: 0, cuspBoundaryMemberships: 0,
  sharedCutoffGeometries: 0, sharedCutoffSystems: 0, sharedCutoffFallbacks: 0,
  finiteAscendantGeometries: 0, finiteAscendantSystems: 0,
  finiteCircleGeometries: 0, finiteCircleSystems: 0,
  dateAscendantBelowPreviousNorm: 0, ascendantBelowPreviousNorm: 0, circleBelowPreviousNorm: 0,
  nearBoundaryComparisons: 0, boundaryDifferences: 0
};
const systemCounts = Object.fromEntries(reference.HOUSE_SYSTEMS.map((system) => [system, 0]));
const deviations: { field: string; context: string; actual: unknown; expected: unknown }[] = [];

function distance(actual: number, expected: number): number {
  let difference = (actual - expected) % 360;
  if (difference > 180) difference -= 360;
  if (difference < -180) difference += 360;
  return Math.abs(difference);
}

function angular(actual: number, expected: number, allowance: number, quantity: string, context: string): void {
  expect(Number.isFinite(actual), context).toBe(true);
  expect(Number.isFinite(expected), context).toBe(true);
  const difference = distance(actual, expected) * 3600;
  maxima[quantity] = Math.max(maxima[quantity] ?? 0, difference);
  expect(difference, `${quantity}, ${context}`).toBeLessThanOrEqual(allowance);
}

function recordDifference(field: string, context: string, actual: unknown, expected: unknown): void {
  counts.boundaryDifferences++;
  if (deviations.length < 16) deviations.push({ field, context, actual, expected });
}

function signBoundaryDistance(asc: number): number {
  const within = asc % 30;
  return Math.min(within, 30 - within) * 3600;
}

function compareAngles(actual: Angles, expected: Angles, allowance: number, context: string): void {
  for (const key of ["asc", "mc", "dsc", "ic"] as const)
    angular(actual[key], expected[key], key === "mc" || key === "ic"
      ? allowance === CLOCK_ARCSEC ? CLOCK_ARCSEC : SHARED_ARCSEC : allowance,
      `${allowance === CLOCK_ARCSEC ? "independent" : "finite near singular"} ${key} arcsec`, context);
}

type HouseResult = ReturnType<typeof reference.computeHouses>;
function compareHouses(actual: HouseResult, expected: HouseResult, actualAngles: Angles, expectedAngles: Angles,
  allowance: number, shared: boolean, regime: string, context: string): void {
  expect(actual.houses.system, context).toBe(expected.houses.system);
  expect(actual.fellBack, context).toBe(expected.fellBack);
  expect(actual.fallbackSystem, context).toBe(expected.fallbackSystem);
  expect(actual.houses.cusps.length, context).toBe(12);
  if (expected.houses.system === "whole") {
    expect(actual.houses.cusps, `${context}, own whole signs`).toEqual(reference.wholeSignCusps(actualAngles.asc));
    if (shared || signBoundaryDistance(expectedAngles.asc) > allowance)
      expect(actual.houses.cusps, context).toEqual(expected.houses.cusps);
    else {
      counts.nearBoundaryComparisons++;
      if (actual.houses.cusps[0] !== expected.houses.cusps[0])
        recordDifference("whole-sign first cusp", context, actual.houses.cusps[0], expected.houses.cusps[0]);
    }
    return;
  }
  for (let index = 0; index < 12; index++) {
    if (shared && ["equal", "equal-mc", "vehlow", "porphyry"].includes(expected.houses.system))
      expectSameNumber(actual.houses.cusps[index]!, expected.houses.cusps[index]!, `${context}, cusp=${index + 1}`);
    else angular(actual.houses.cusps[index]!, expected.houses.cusps[index]!, allowance,
      `${regime} ${expected.houses.system} arcsec`, `${context}, cusp=${index + 1}`);
  }
}

function membership(actualLon: number, expectedLon: number, actual: HouseResult, expected: HouseResult,
  longitudeAllowance: number, cuspAllowance: number, context: string, wholeSignBoundary = false): void {
  const actualHouse = rust.houseOf(actualLon, actual.houses.cusps);
  const expectedHouse = reference.houseOf(expectedLon, expected.houses.cusps);
  expect(actualHouse, `${context}, identical-input decision`)
    .toBe(reference.houseOf(actualLon, actual.houses.cusps));
  const nearest = Math.min(...expected.houses.cusps.map((cusp) => distance(cusp, expectedLon))) * 3600;
  const movedWholeSigns = wholeSignBoundary && expected.houses.system === "whole"
    && actual.houses.cusps[0] !== expected.houses.cusps[0];
  if (nearest > longitudeAllowance + cuspAllowance && !movedWholeSigns) expect(actualHouse, context).toBe(expectedHouse);
  else {
    counts.nearBoundaryComparisons++;
    if (actualHouse !== expectedHouse)
      recordDifference(movedWholeSigns ? "house membership at ascendant sign boundary" : "house membership",
        context, actualHouse, expectedHouse);
  }
}

function ascendantNorm(input: AngleInput): number {
  const theta = reference.ramcOf(input) * DEG;
  return Math.hypot(Math.cos(theta), Math.sin(theta) * Math.cos(input.obliquity * DEG)
    + Math.tan(input.latitude * DEG) * Math.sin(input.obliquity * DEG));
}

function geometry(ms: number, latitude: number, longitude: number, scale: "utc" | "ut1" | "tt", pin?: number): [AngleInput, AngleInput] {
  const expectedBasis = timeBasis(ms, scale, pin);
  const actualBasis = rust.timeBasis(ms, scale, pin);
  const expectedClock = { ut: expectedBasis.ut1Days, tt: expectedBasis.ttDays } as Parameters<typeof gastHours>[0];
  const actualClock = { ut: actualBasis.ut1Days, tt: actualBasis.ttDays } as Parameters<typeof gastHours>[0];
  return [
    { gastHours: rust.gastHours(actualClock), obliquity: rust.tilt(actualBasis.ttDays).tobl, latitude, longitude },
    { gastHours: gastHours(expectedClock), obliquity: tilt(expectedBasis.ttDays).tobl, latitude, longitude }
  ];
}

afterAll(() => {
  if (process.env.RUSTCORE_PARITY_REPORT === "1") console.log(JSON.stringify({ houseCorpusParity: {
    span: { from: new Date(FROM).toISOString(), to: new Date(TO).toISOString() },
    maxima, counts, systemCounts, deviations
  } }));
});

describe("complete house corpus through WASM", () => {
  it("crosses every year and latitude with every house system on independent clock paths", () => {
    expect(reference.HOUSE_SYSTEMS).toHaveLength(13);
    expect(dates).toHaveLength(403);
    expect(latitudes).toHaveLength(16);
    for (const [dateIndex, ms] of dates.entries()) {
      counts.dates++;
      // Bodies use the public UTC path; the other house cases rotate all
      // scales and signed Delta T pins independently of either output.
      const includeBodies = dateIndex < 2 || new Date(ms).getUTCFullYear() % 10 === 0;
      let actualBodies: BodyPosition[] = [];
      let expectedBodies: BodyPosition[] = [];
      if (includeBodies) {
        actualBodies = rust.positions(ms);
        expectedBodies = positions(ms);
        counts.bodyPositionDates++;
        expect(actualBodies.map((body) => body.body)).toEqual(expectedBodies.map((body) => body.body));
        for (let body = 0; body < expectedBodies.length; body++)
          angular(actualBodies[body]!.lon, expectedBodies[body]!.lon,
            expectedBodies[body]!.body.endsWith("Node") ? NODE_ARCSEC : BODY_ARCSEC,
            `${expectedBodies[body]!.body} longitude arcsec`, `ms=${ms}`);
      }
      for (const [latitudeIndex, latitude] of latitudes.entries()) {
        const longitude = longitudes[(dateIndex + latitudeIndex) % longitudes.length]!;
        const scale = includeBodies ? "utc" : (["utc", "ut1", "tt"] as const)[(dateIndex + latitudeIndex) % 3]!;
        const pin = !includeBodies && dateIndex % 19 === 0 ? [-70, -0, 69.184, 86400.25][latitudeIndex % 4] : undefined;
        const [input, expectedInput] = geometry(ms, latitude, longitude, scale, pin);
        const angles = rust.computeAngles(input);
        const expectedAngles = reference.computeAngles(expectedInput);
        const context = `ms=${ms}, scale=${scale}, pin=${pin}, latitude=${latitude}, longitude=${longitude}`;
        expect(ascendantNorm(input), context).toBeGreaterThanOrEqual(MIN_FINITE_NORM);
        expect(ascendantNorm(expectedInput), context).toBeGreaterThanOrEqual(MIN_FINITE_NORM);
        if (ascendantNorm(expectedInput) < 0.01) counts.dateAscendantBelowPreviousNorm++;
        compareAngles(angles, expectedAngles, CLOCK_ARCSEC, context);
        counts.independentGeometries++;
        for (const system of reference.HOUSE_SYSTEMS) {
          const actual = rust.computeHouses(system, input, angles);
          const expected = reference.computeHouses(system, expectedInput, expectedAngles);
          compareHouses(actual, expected, angles, expectedAngles, CLOCK_ARCSEC, false,
            "independent", `${context}, system=${system}`);
          counts.independentSystems++;
          systemCounts[system] = systemCounts[system]! + 1;
          if (expected.fellBack) counts.polarFallbacks++;
          const wholeSignBoundary = signBoundaryDistance(expectedAngles.asc) <= CLOCK_ARCSEC;
          for (const lon of [0, 47.125, 179.875, 271.25]) {
            membership(lon, lon, actual, expected, 0, CLOCK_ARCSEC,
              `${context}, system=${system}, lon=${lon}`, wholeSignBoundary);
            counts.fixedLongitudeMemberships++;
          }
          // Selection is by input index. Both adjacent binary64 values and
          // points outside twice the bound exercise discrete cusp decisions;
          // a difference is allowed only inside the documented numeric band.
          if (dateIndex % 50 === 0 && latitudeIndex % 4 === 0) {
            for (const cuspIndex of [0, 1, 2, 9]) {
              const cusp = expected.houses.cusps[cuspIndex]!;
              for (const lon of [...neighbors(cusp), cusp - 2 * CLOCK_ARCSEC / 3600, cusp + 2 * CLOCK_ARCSEC / 3600]) {
                membership(lon, lon, actual, expected, 0, CLOCK_ARCSEC,
                  `${context}, system=${system}, cusp=${cuspIndex + 1}, lon=${lon}`, wholeSignBoundary);
                counts.cuspBoundaryMemberships++;
              }
            }
          }
          for (let body = 0; body < expectedBodies.length; body++) {
            const bodyName = expectedBodies[body]!.body;
            membership(actualBodies[body]!.lon, expectedBodies[body]!.lon, actual, expected,
              bodyName.endsWith("Node") ? NODE_ARCSEC : BODY_ARCSEC, CLOCK_ARCSEC,
              `${context}, system=${system}, body=${bodyName}`, wholeSignBoundary);
            counts.bodyMemberships++;
          }
        }
      }
    }
    expect(counts.independentGeometries).toBe(dates.length * latitudes.length);
    expect(counts.independentSystems).toBe(dates.length * latitudes.length * reference.HOUSE_SYSTEMS.length);
    expect(Object.values(systemCounts)).toEqual(reference.HOUSE_SYSTEMS.map(() => dates.length * latitudes.length));
    expect(counts.bodyPositionDates).toBe(43);
    expect(counts.bodyMemberships).toBe(43 * latitudes.length * reference.HOUSE_SYSTEMS.length * 12);
    expect(counts.cuspBoundaryMemberships).toBeGreaterThan(0);
    expect(counts.polarFallbacks).toBeGreaterThan(0);
  }, 120_000);

  it("compares all systems on both sides of dated polar cutoffs with identical supplied axes", () => {
    for (let year = 1800; year <= 2200; year += 50) {
      const ms = Date.UTC(year, 5, 17, 8, 31, 7, 125);
      const obliquity = tilt(timeBasis(ms).ttDays).tobl;
      for (const sign of [-1, 1]) {
        const limit = sign * (90 - obliquity);
        for (const latitude of [...neighbors(limit), limit - 1e-8, limit + 1e-8]) {
          for (const longitude of [17.25, 107.25, 197.25, 287.25]) {
            const input = { gastHours: 0, longitude, latitude, obliquity };
            const angles = reference.computeAngles(input);
            counts.sharedCutoffGeometries++;
            for (const system of reference.HOUSE_SYSTEMS) {
              const context = `year=${year}, system=${system}, ${JSON.stringify(input)}`;
              const a = outcome(() => rust.computeHouses(system, input, angles));
              const b = outcome(() => reference.computeHouses(system, input, angles));
              expect(a.ok, context).toBe(b.ok);
              if (!a.ok && !b.ok) expectSameError(a.error, b.error, context);
              if (a.ok && b.ok) {
                const polar = Math.abs(latitude) >= 90 - obliquity;
                expect(a.value.fellBack, context).toBe(polar && reference.isPolarUndefinedHouseSystem(system));
                compareHouses(a.value, b.value, angles, angles,
                  reference.isPolarUndefinedHouseSystem(system) ? POLAR_LIMIT_ARCSEC : SHARED_ARCSEC,
                  true, "shared cutoff", context);
                if (a.value.fellBack) counts.sharedCutoffFallbacks++;
              }
              counts.sharedCutoffSystems++;
            }
          }
        }
      }
    }
    expect(counts.sharedCutoffGeometries).toBe(9 * 2 * 5 * 4);
    expect(counts.sharedCutoffSystems).toBe(counts.sharedCutoffGeometries * reference.HOUSE_SYSTEMS.length);
    expect(counts.sharedCutoffFallbacks).toBeGreaterThan(0);
  });

  it("bounds finite near-singular ascendants and derived cusps numerically in both hemispheres", () => {
    for (const obliquity of [23.4, 23.43929111111111, 23.4271]) {
      for (const hemisphere of [-1, 1]) {
        for (const offset of [1e-2, 1e-3, 1e-4, 1e-5]) {
          for (const latitudeDirection of [-1, 1]) {
            for (const ramcDirection of [-1, 1]) {
              const input = {
                gastHours: 0, obliquity,
                latitude: hemisphere * (90 - obliquity) + latitudeDirection * offset,
                longitude: (hemisphere > 0 ? 270 : 90) + ramcDirection * offset
              };
              const context = JSON.stringify(input);
              const norm = ascendantNorm(input);
              expect(norm, context).toBeGreaterThanOrEqual(MIN_FINITE_NORM);
              expect(norm, context).toBeLessThan(0.01);
              counts.ascendantBelowPreviousNorm++;
              const actualAngles = rust.computeAngles(input);
              const expectedAngles = reference.computeAngles(input);
              compareAngles(actualAngles, expectedAngles, FINITE_NEAR_SINGULAR_ARCSEC, context);
              counts.finiteAscendantGeometries++;
              for (const system of reference.HOUSE_SYSTEMS) {
                const actual = rust.computeHouses(system, input, actualAngles);
                const expected = reference.computeHouses(system, input, expectedAngles);
                compareHouses(actual, expected, actualAngles, expectedAngles,
                  system === "meridian" || system === "morinus" ? SHARED_ARCSEC : FINITE_NEAR_SINGULAR_ARCSEC,
                  false, "finite ascendant", `finite ascendant ${system}, ${context}`);
                counts.finiteAscendantSystems++;
              }
            }
          }
        }
      }
    }
    expect(counts.finiteAscendantGeometries).toBe(3 * 2 * 4 * 2 * 2);
    expect(counts.finiteAscendantSystems).toBe(counts.finiteAscendantGeometries * reference.HOUSE_SYSTEMS.length);
    expect(counts.ascendantBelowPreviousNorm).toBe(counts.finiteAscendantGeometries);
  });

  it("bounds finite near-singular intermediate circles beyond the earlier residual-only probes", () => {
    for (const system of ["regiomontanus", "topocentric"] as const satisfies readonly HouseSystem[]) {
      for (const obliquity of [23.4, 23.43929111111111, 23.4271]) {
        const factors = system === "regiomontanus" ? [2, 1 / Math.cos(30 * DEG)] : [3, 1.5];
        for (const [circle, factor] of factors.entries()) {
          const tangentLatitude = Math.atan(factor / Math.tan(obliquity * DEG)) * RAD;
          const ascensionOffset = circle === 0 ? 30 : 60;
          for (const hemisphere of [-1, 1]) {
            for (const offset of [1e-2, 1e-3, 1e-4, 1e-5]) {
              for (const latitudeDirection of [-1, 1]) {
                for (const ramcDirection of [-1, 1]) {
                  const input = {
                    gastHours: 0, obliquity,
                    latitude: hemisphere * tangentLatitude + latitudeDirection * offset,
                    longitude: (hemisphere > 0 ? 360 : 180) - ascensionOffset + ramcDirection * offset
                  };
                  const pole = Math.atan(Math.tan(input.latitude * DEG) / factor) * RAD;
                  const ascension = (reference.ramcOf(input) + ascensionOffset) * DEG;
                  const norm = Math.hypot(Math.sin(ascension), Math.cos(ascension) * Math.cos(obliquity * DEG)
                    - Math.tan(pole * DEG) * Math.sin(obliquity * DEG));
                  const context = `${system}, ${JSON.stringify(input)}, projection=${norm}`;
                  expect(norm, context).toBeGreaterThanOrEqual(MIN_FINITE_NORM);
                  expect(norm, context).toBeLessThan(0.01);
                  if (norm < 1e-6) counts.circleBelowPreviousNorm++;
                  const angles = reference.computeAngles(input);
                  compareHouses(rust.computeHouses(system, input, angles), reference.computeHouses(system, input, angles),
                    angles, angles, FINITE_NEAR_SINGULAR_ARCSEC, true, "finite circle", context);
                  counts.finiteCircleGeometries++;
                  counts.finiteCircleSystems++;
                }
              }
            }
          }
        }
      }
    }
    expect(counts.finiteCircleGeometries).toBe(2 * 3 * 2 * 2 * 4 * 2 * 2);
    expect(counts.circleBelowPreviousNorm).toBeGreaterThan(0);
  });
});
