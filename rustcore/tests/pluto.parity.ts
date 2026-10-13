import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  AstroTime, BackdatePosition, Body, GeoVector, HelioState, HelioVector, SetDeltaTFunction
} from "astronomy-engine";
import { deltaT } from "../../src/deltat.js";
import { onChartClock } from "../../src/ephemeris.js";
import { eclipticOfDate } from "../../src/frame.js";
import { timeBasis } from "../../src/time-scale.js";
import type { TimeScaleName } from "../../src/time-scale.js";
import {
  LEAP_SECOND_LIST, LEAP_SECONDS_EXPIRE_MS, UT1_FINALS_FROM_MS, UT1_FROM_MS,
  UT1_OBSERVED_TO_MS, UT1_TO_MS
} from "../../src/time-scale-data.js";
import * as rust from "../ts/index.js";
import type { PlanetClock, PlanetVector, SeriesBody } from "../ts/index.js";
import { expectSameNumber, neighbors, randomUint32 } from "./parity-helpers.js";

const wasmBytes = readFileSync(new URL("../pkg/zodiacs_rustcore_bg.wasm", import.meta.url));
beforeAll(() => rust.initRustCore(wasmBytes));

// Fixed before running this port, using the M5 planetary acceptance budgets.
// The source's giant-planet series and force square roots can round differently
// in V8 and Rust/WASM; the ordered integration accumulates that roundoff.
// This is implementation parity, not a comparison with an external ephemeris.
const POSITION_AU = 2e-12;
const VELOCITY_AU_PER_DAY = 2e-14;
const COORDINATE_ARCSEC = 1e-7;
const EMISSION_SECONDS = 2e-6;
// At the full table endpoints, one binary64 day ulp is about 10.06 microseconds.
// The larger clock allowance applies only to those separate endpoint probes.
const ENDPOINT_EMISSION_SECONDS = 2e-5;
const DAY_MS = 86_400_000;
const DAY_SECONDS = 86_400;
const J2000_MS = Date.UTC(2000, 0, 1, 12);
const firstMs = Date.UTC(1800, 0, 1);
const lastMs = Date.UTC(2200, 11, 31, 23, 59, 59, 999);
const syntheticMs = [firstMs, lastMs, J2000_MS];
for (let year = 1800; year <= 2200; year++) {
  for (let month = 0; month < 12; month++) {
    syntheticMs.push(Date.UTC(year, month, 1 + (year + month) % 28, (year + month) % 24, 23, 41, 317));
  }
}
const next = randomUint32(0x706c7574);
for (let index = 0; index < 512; index++) {
  syntheticMs.push(firstMs + Math.floor(next() / 0x1_0000_0000 * (lastMs - firstMs)));
}

// Obtain branch locations from the pinned local algorithm, without copying
// reference ephemeris outputs or its state vectors into a fixture.
const source = readFileSync(new URL("../node_modules/astronomy-engine/esm/astronomy.js", import.meta.url), "utf8");
function sourceConstant(name: string): number {
  const match = source.match(new RegExp(`const ${name} = (\\d+);`));
  if (!match) throw new Error(`Missing pinned Pluto constant: ${name}`);
  return Number(match[1]);
}
const tableStartMatch = source.match(/const PlutoStateTable = \[\s*\[(-?\d+(?:\.\d+)?),/);
if (!tableStartMatch) throw new Error("Missing pinned Pluto table origin");
const tableStart = Number(tableStartMatch[1]);
const segmentDays = sourceConstant("PLUTO_TIME_STEP");
const stepDays = sourceConstant("PLUTO_DT");
const stateCount = sourceConstant("PLUTO_NUM_STATES");
const tableEnd = tableStart + segmentDays * (stateCount - 1);
const firstTt = timeBasis(firstMs).ttDays;
const lastTt = timeBasis(lastMs).ttDays;
const integrationKnots: number[] = [];
for (let tt = tableStart; tt <= tableEnd; tt += stepDays) {
  if (tt >= firstTt && tt <= lastTt) integrationKnots.push(tt);
}
const segmentKnots: number[] = [];
for (let tt = tableStart; tt <= tableEnd; tt += segmentDays) {
  if (tt >= firstTt && tt <= lastTt) segmentKnots.push(tt);
}

const boundaryMs = [...new Set([
  Date.UTC(1940, 11, 31, 18), UT1_FROM_MS, UT1_FINALS_FROM_MS,
  UT1_OBSERVED_TO_MS, UT1_TO_MS, LEAP_SECONDS_EXPIRE_MS,
  ...LEAP_SECOND_LIST.changes.map(([mjd]) => (mjd - 40_587) * DAY_MS)
])].flatMap((ms) => [ms - 1, ms, ms + 1]);
const scales: readonly TimeScaleName[] = ["utc", "ut1", "tt"];
const pins = [undefined, -7200, -0, 0, Number.MIN_VALUE, 69.184, 86400] as const;
const bodies: readonly SeriesBody[] = [
  "Sun", "Mercury", "Venus", "Earth", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"
];
const maxima: Record<string, number> = {};

function bounded(actual: number, expected: number, tolerance: number, quantity: string, context: string): void {
  const difference = Math.abs(actual - expected);
  maxima[quantity] = Math.max(maxima[quantity] ?? 0, difference);
  expect(Number.isFinite(actual), `${quantity}: ${context}`).toBe(true);
  expect(Number.isFinite(expected), `${quantity} reference: ${context}`).toBe(true);
  expect(difference, `${quantity}: ${context}`).toBeLessThanOrEqual(tolerance);
}

function compareVector(actual: PlanetVector, expected: PlanetVector, quantity: string, context: string): void {
  for (const component of ["x", "y", "z"] as const)
    bounded(actual[component], expected[component], POSITION_AU, quantity, `${context}, ${component}`);
}

function compareAngles(actual: PlanetVector, expected: PlanetVector, tt: number, context: string): void {
  const result = rust.eclipticOfDate(actual.x, actual.y, actual.z, tt);
  const reference = eclipticOfDate(expected.x, expected.y, expected.z, tt);
  let longitude = (result.lon - reference.lon) % 360;
  if (longitude > 180) longitude -= 360;
  if (longitude < -180) longitude += 360;
  bounded(longitude * 3600, 0, COORDINATE_ARCSEC, "ecliptic longitude arcsec", context);
  bounded((result.lat - reference.lat) * 3600, 0, COORDINATE_ARCSEC, "ecliptic latitude arcsec", context);
}

function compareHelio(time: AstroTime, context: string, angles = true): void {
  const vector = rust.helioVector("Pluto", time.tt);
  const state = rust.helioState("Pluto", time.tt);
  const expectedVector = HelioVector(Body.Pluto, time);
  const expectedState = HelioState(Body.Pluto, time);
  compareVector(vector, expectedVector, "heliocentric component AU", context);
  compareVector(state, expectedState, "state position component AU", context);
  for (const component of ["vx", "vy", "vz"] as const)
    bounded(state[component], expectedState[component], VELOCITY_AU_PER_DAY,
      "heliocentric velocity AU/day", `${context}, ${component}`);
  for (const component of ["x", "y", "z"] as const)
    expectSameNumber(state[component], vector[component], `${context}, vector/state ${component}`);
  if (angles) compareAngles(vector, expectedVector, time.tt, context);
}

function compareBackdated(
  observer: SeriesBody, target: SeriesBody, clock: PlanetClock, time: AstroTime,
  aberration: boolean, context: string, endpoint = false,
): void {
  const actual = rust.backdatePosition(observer, target, clock, aberration);
  const expected = BackdatePosition(time, Body[observer], Body[target], aberration);
  compareVector(actual, expected, endpoint ? "endpoint backdated component AU" : "backdated component AU", context);
  const tolerance = endpoint ? ENDPOINT_EMISSION_SECONDS : EMISSION_SECONDS;
  const label = endpoint ? "endpoint emission" : "emission";
  bounded((actual.ut - expected.t.ut) * DAY_SECONDS, 0, tolerance, `${label} UT1 seconds`, context);
  bounded((actual.tt - expected.t.tt) * DAY_SECONDS, 0, tolerance, `${label} TT seconds`, context);
}

afterAll(() => {
  SetDeltaTFunction(deltaT);
  if (process.env.RUSTCORE_PARITY_REPORT === "1") console.log(JSON.stringify({ plutoParityMaxima: maxima }));
});

describe("Pluto integration through WASM", () => {
  it("pins the local dependency and derives its integration grid", () => {
    expect(createHash("sha256").update(source).digest("hex"))
      .toBe("068f1445ed0c636c94818fe6d20d7d125120e605e0bab9fc4675c3d531be5ad7");
    expect(segmentDays).toBe(stepDays * (sourceConstant("PLUTO_NSTEPS") - 1));
    expect(tableStart).toBe(-tableEnd);
    expect(integrationKnots.length).toBeGreaterThan(0);
    expect(segmentKnots.length).toBeGreaterThan(0);
  });

  it("compares state, geocentric vector and ecliptic coordinates on monthly and seeded dates from 1800 through 2200", () => {
    for (const ms of syntheticMs) {
      onChartClock(ms, "utc", undefined, (time, basis) => {
        const context = `Pluto, ms=${ms}, tt=${time.tt}`;
        compareHelio(time, context);
        const clock = { ut: time.ut, tt: time.tt, deltaT: basis.deltaT.seconds };
        for (const aberration of [false, true]) {
          const actual = rust.geoVector("Pluto", clock, aberration);
          const expected = GeoVector(Body.Pluto, time, aberration);
          compareVector(actual, expected, "geocentric component AU", `${context}, aberration=${aberration}`);
          compareAngles(actual, expected, time.tt, `${context}, aberration=${aberration}`);
        }
      });
    }
  }, 60_000);

  it("compares every in-range integration knot, adjacent TT doubles and interval midpoints", () => {
    SetDeltaTFunction(() => 0);
    try {
      for (const knot of integrationKnots) {
        for (const tt of [...neighbors(knot), knot + stepDays / 2].filter((tt) => tt >= firstTt && tt <= lastTt)) {
          // These are TT labels, not Date timestamps: preserve submillisecond
          // and subnormal neighbors through the source's mutable AstroTime.
          const time = new AstroTime(0);
          time.ut = tt;
          time.tt = tt;
          compareHelio(time, `integration knot=${knot}, tt=${tt}`);
        }
      }
      for (const knot of segmentKnots) {
        for (const tt of [...neighbors(knot), knot - 1, knot + 1]) {
          const time = new AstroTime(tt);
          for (const aberration of [false, true]) {
            compareBackdated("Earth", "Pluto", { ut: tt, tt, deltaT: 0 }, time, aberration,
              `segment boundary=${knot}, tt=${tt}, aberration=${aberration}`);
          }
        }
      }
    } finally {
      SetDeltaTFunction(deltaT);
    }
  }, 60_000);

  it("preserves the fixed chart clock on each scale, pin and time-basis boundary", () => {
    for (const ms of boundaryMs) {
      for (const scale of scales) {
        for (const pin of pins) {
          onChartClock(ms, scale, pin, (time, basis) => {
            const clock = { ut: time.ut, tt: time.tt, deltaT: basis.deltaT.seconds };
            for (const aberration of [false, true]) {
              const context = `ms=${ms}, scale=${scale}, pin=${pin}, aberration=${aberration}`;
              compareBackdated("Earth", "Pluto", clock, time, aberration, context);
              compareVector(rust.geoVector("Pluto", clock, aberration), GeoVector(Body.Pluto, time, aberration),
                "boundary geocentric component AU", context);
            }
          });
        }
      }
    }
  }, 60_000);

  it("compares Pluto as observer and target with every supported body on synthetic century dates", () => {
    for (const year of [1800, 1900, 2000, 2100, 2200]) {
      onChartClock(Date.UTC(year, 5, 17, 9, 13, 29, 731), "utc", undefined, (time, basis) => {
        const clock = { ut: time.ut, tt: time.tt, deltaT: basis.deltaT.seconds };
        for (const other of bodies) {
          for (const [observer, target] of [["Pluto", other], [other, "Pluto"]] as const) {
            for (const aberration of [false, true]) {
              const context = `observer=${observer}, target=${target}, year=${year}, aberration=${aberration}`;
              compareBackdated(observer, target, clock, time, aberration, context);
              if (observer === target) {
                const vector = rust.backdatePosition(observer, target, clock, aberration);
                for (const component of ["x", "y", "z"] as const)
                  expectSameNumber(vector[component], 0, `${context}, exact ${component}`);
                expectSameNumber(vector.ut, clock.ut, `${context}, unchanged UT1`);
                expectSameNumber(vector.tt, clock.tt, `${context}, unchanged TT`);
              }
            }
          }
        }
      });
    }
  });

  it("reconstructs TT in each light-time sample while preserving the initially supplied split clock", () => {
    for (const clock of [
      { ut: -70_000, tt: -69_999.75, deltaT: -7200 },
      { ut: 0, tt: 0.125, deltaT: 69.184 },
      { ut: 70_000, tt: 69_999.5, deltaT: 86400 }
    ]) {
      SetDeltaTFunction(() => clock.deltaT);
      try {
        const time = new AstroTime(clock.ut);
        time.tt = clock.tt;
        for (const other of ["Sun", "Earth", "Neptune"] as const) {
          for (const [observer, target] of [["Pluto", other], [other, "Pluto"]] as const) {
            for (const aberration of [false, true]) {
              compareBackdated(observer, target, clock, time, aberration,
                `split clock=${JSON.stringify(clock)}, ${observer} to ${target}, aberration=${aberration}`);
            }
          }
        }
      } finally {
        SetDeltaTFunction(deltaT);
      }
    }
  });

  it("compares table endpoints and backdating from the earliest observation without an unbounded integration crawl", () => {
    SetDeltaTFunction(() => 0);
    try {
      for (const tt of [tableStart, tableEnd]) {
        const time = new AstroTime(tt);
        const clock = { ut: tt, tt, deltaT: 0 };
        compareHelio(time, `table endpoint tt=${tt}`, false);
        for (const aberration of [false, true]) {
          for (const [observer, target] of [["Earth", "Pluto"], ["Pluto", "Earth"], ["Pluto", "Sun"]] as const) {
            compareBackdated(observer, target, clock, time, aberration,
              `table endpoint tt=${tt}, ${observer} to ${target}, aberration=${aberration}`, true);
          }
          compareVector(rust.geoVector("Pluto", clock, aberration), GeoVector(Body.Pluto, time, aberration),
            "endpoint geocentric component AU", `tt=${tt}, aberration=${aberration}`);
        }
      }
    } finally {
      SetDeltaTFunction(deltaT);
    }
    // The source would crawl outside its table; the wrapper refuses before
    // invoking the integrator. Do not run extreme source calls in this test.
    for (const tt of [
      ...neighbors(tableStart).filter((tt) => tt < tableStart),
      ...neighbors(tableEnd).filter((tt) => tt > tableEnd),
      tableStart - 1, tableEnd + 1, -Number.MAX_VALUE, Number.MAX_VALUE
    ]) {
      expect(() => rust.helioVector("Pluto", tt), `heliocentric vector outside tt=${tt}`).toThrow(RangeError);
      expect(() => rust.helioState("Pluto", tt), `heliocentric state outside tt=${tt}`).toThrow(RangeError);
      expect(() => rust.geoVector("Pluto", { ut: tt, tt, deltaT: 0 }), `geocentric outside tt=${tt}`)
        .toThrow(RangeError);
      expect(() => rust.backdatePosition("Earth", "Pluto", { ut: tt, tt, deltaT: 0 }), `backdating outside tt=${tt}`)
        .toThrow(RangeError);
      expect(() => rust.backdatePosition("Pluto", "Sun", { ut: tt, tt, deltaT: 0 }), `Pluto observer outside tt=${tt}`)
        .toThrow(RangeError);
    }
  }, 60_000);

  it("repeats identical values bit for bit after other segment queries without JavaScript numeric callbacks", () => {
    const clocks = [1800, 1840, 1920, 2000, 2080, 2160, 2200].map((year) => {
      const basis = timeBasis(Date.UTC(year, 7, 19, 11, 23, 37, 419));
      return { ut: basis.ut1Days, tt: basis.ttDays, deltaT: basis.deltaT.seconds };
    });
    SetDeltaTFunction(() => { throw new Error("Rust must not evaluate the JavaScript time callback"); });
    try {
      for (const clock of clocks) {
        const vector = rust.helioVector("Pluto", clock.tt);
        const state = rust.helioState("Pluto", clock.tt);
        const geo = rust.geoVector("Pluto", clock);
        const backdated = rust.backdatePosition("Earth", "Pluto", clock);
        for (const other of [...clocks].reverse()) {
          rust.geoVector("Pluto", other, false);
          rust.helioState("Neptune", other.tt);
        }
        const repeated = [
          [vector, rust.helioVector("Pluto", clock.tt)], [state, rust.helioState("Pluto", clock.tt)],
          [geo, rust.geoVector("Pluto", clock, true)],
          [backdated, rust.backdatePosition("Earth", "Pluto", clock, true)]
        ] as const;
        for (const [first, second] of repeated) {
          expect(Object.keys(second)).toEqual(Object.keys(first));
          for (const field of Object.keys(first)) {
            expectSameNumber((second as unknown as Record<string, number>)[field]!,
              (first as unknown as Record<string, number>)[field]!, `${field}, repeated tt=${clock.tt}`);
          }
        }
      }
    } finally {
      SetDeltaTFunction(deltaT);
    }
  });

  it("rejects nonfinite and non-number Pluto clocks before integration", () => {
    const invalidNumbers: unknown[] = [NaN, Infinity, -Infinity, undefined, null, true, "0", 0n, [], {},
      new Number(0), Symbol("time"), { valueOf() { throw new Error("Must not coerce"); } }];
    for (const value of invalidNumbers) {
      expect(() => rust.helioVector("Pluto", value as number)).toThrow(RangeError);
      expect(() => rust.helioState("Pluto", value as number)).toThrow(RangeError);
      for (const field of ["ut", "tt", "deltaT"] as const) {
        const clock = { ut: 0, tt: 0, deltaT: 0, [field]: value } as PlanetClock;
        expect(() => rust.geoVector("Pluto", clock)).toThrow(RangeError);
        expect(() => rust.backdatePosition("Pluto", "Earth", clock)).toThrow(RangeError);
        expect(() => rust.backdatePosition("Earth", "Pluto", clock)).toThrow(RangeError);
      }
    }
  });
});
