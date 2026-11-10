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

// Fixed before running this port. This is implementation parity with the
// installed MIT dependency, not a comparison with an independent ephemeris.
// V8 and Rust/WASM transcendental rounding can differ despite identical sums.
const POSITION_AU = 2e-12;
const VELOCITY_AU_PER_DAY = 2e-14;
const COORDINATE_ARCSEC = 1e-7;
// One binary64 day ulp at either century endpoint is about 1.26 microseconds.
// This allowance covers that representational step, not the solver's physical
// accuracy or its independent 1e-9 day convergence threshold.
const EMISSION_SECONDS = 2e-6;
const DAY_MS = 86_400_000;
const DAY_SECONDS = 86_400;
const J2000_MS = Date.UTC(2000, 0, 1, 12);
const bodies: readonly SeriesBody[] = [
  "Sun", "Mercury", "Venus", "Earth", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune"
];
const scales: readonly TimeScaleName[] = ["utc", "ut1", "tt"];
const pins = [undefined, -7200, -0, 0, Number.MIN_VALUE, 69.184, 86400] as const;
const firstMs = Date.UTC(1800, 0, 1);
const lastMs = Date.UTC(2200, 11, 31, 23, 59, 59, 999);
const syntheticMs = [firstMs, lastMs, J2000_MS];
for (let year = 1800; year <= 2200; year++) {
  for (let month = 0; month < 12; month++) {
    syntheticMs.push(Date.UTC(year, month, 1 + (year + month) % 28, (year + month) % 24, 17, 43, 219));
  }
}
const next = randomUint32(0x76736f70);
for (let index = 0; index < 512; index++) {
  syntheticMs.push(firstMs + Math.floor(next() / 0x1_0000_0000 * (lastMs - firstMs)));
}

const boundaryMs = [...new Set([
  Date.UTC(1940, 11, 31, 18), UT1_FROM_MS, UT1_FINALS_FROM_MS,
  UT1_OBSERVED_TO_MS, UT1_TO_MS, LEAP_SECONDS_EXPIRE_MS,
  ...LEAP_SECOND_LIST.changes.map(([mjd]) => (mjd - 40_587) * DAY_MS)
])].flatMap((ms) => [ms - 1, ms, ms + 1]);

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
  // Subtract before wrapping to retain sub-ulp differences near zero degrees.
  let longitude = (result.lon - reference.lon) % 360;
  if (longitude > 180) longitude -= 360;
  if (longitude < -180) longitude += 360;
  bounded(longitude * 3600, 0, COORDINATE_ARCSEC, "ecliptic longitude arcsec", context);
  bounded((result.lat - reference.lat) * 3600, 0, COORDINATE_ARCSEC, "ecliptic latitude arcsec", context);
}

function compareBackdated(
  observer: SeriesBody, target: SeriesBody, clock: PlanetClock, time: AstroTime, aberration: boolean, context: string
): void {
  const actual = rust.backdatePosition(observer, target, clock, aberration);
  const expected = BackdatePosition(time, Body[observer], Body[target], aberration);
  compareVector(actual, expected, "backdated component AU", context);
  bounded((actual.ut - expected.t.ut) * DAY_SECONDS, 0, EMISSION_SECONDS, "emission UT1 seconds", context);
  bounded((actual.tt - expected.t.tt) * DAY_SECONDS, 0, EMISSION_SECONDS, "emission TT seconds", context);
}

afterAll(() => {
  SetDeltaTFunction(deltaT);
  if (process.env.RUSTCORE_PARITY_REPORT === "1") console.log(JSON.stringify({ planetParityMaxima: maxima }));
});

describe("solar and planetary series through WASM", () => {
  it("pins the comparison dependency bytes and admits only data/error glue imports into WASM", () => {
    const bytes = readFileSync(new URL("../node_modules/astronomy-engine/esm/astronomy.js", import.meta.url));
    expect(createHash("sha256").update(bytes).digest("hex"))
      .toBe("068f1445ed0c636c94818fe6d20d7d125120e605e0bab9fc4675c3d531be5ad7");
    // These imports marshal strings, numbers and records or throw an error.
    // A new JavaScript function-call or transcendental import must be reviewed;
    // it cannot silently become a numerical callback into astronomy-engine.
    const allowed = new Set([
      "__wbindgen_string_new", "__wbindgen_number_new", "__wbindgen_string_get",
      "__wbindgen_is_null", "__wbindgen_number_get", "__wbindgen_debug_string",
      "__wbindgen_throw", "__wbindgen_init_externref_table",
      "__wbg_get_67b2ba62fc30de12", "__wbg_new_405e22f390576ce2",
      "__wbg_new_1ab78df5e132f715", "__wbg_set_bb8cecf6a62b9f46",
      // Complete position rows allocate and populate an ordinary JS array.
      "__wbg_new_78feb108b6472713", "__wbg_push_737cfc8c1432c2c6"
    ]);
    for (const imported of WebAssembly.Module.imports(new WebAssembly.Module(wasmBytes))) {
      expect(imported.module).toBe("wbg");
      expect(imported.kind).toBe("function");
      expect(allowed.has(imported.name), `unreviewed WASM import: ${imported.name}`).toBe(true);
    }
  });

  it("compares heliocentric vectors and analytical states on monthly and seeded dates from 1800 through 2200", () => {
    for (const ms of syntheticMs) {
      onChartClock(ms, "utc", undefined, (time) => {
        for (const body of bodies) {
          const context = `${body}, ms=${ms}, tt=${time.tt}`;
          const vector = rust.helioVector(body, time.tt);
          const state = rust.helioState(body, time.tt);
          const expectedVector = HelioVector(Body[body], time);
          const expectedState = HelioState(Body[body], time);
          compareVector(vector, expectedVector, "heliocentric component AU", context);
          compareVector(state, expectedState, "state position component AU", context);
          for (const component of ["vx", "vy", "vz"] as const) {
            bounded(state[component], expectedState[component], VELOCITY_AU_PER_DAY,
              "heliocentric velocity AU/day", `${context}, ${component}`);
          }
          for (const component of ["x", "y", "z"] as const)
            expectSameNumber(state[component], vector[component], `${context}, vector/state ${component}`);
          if (body !== "Sun") compareAngles(vector, expectedVector, time.tt, context);
        }
      });
    }
  }, 60_000);

  it("compares geocentric vectors and ecliptic coordinates with both aberration choices on the same date corpus", () => {
    for (const ms of syntheticMs) {
      onChartClock(ms, "utc", undefined, (time, basis) => {
        const portBasis = rust.timeBasis(ms);
        expectSameNumber(portBasis.ut1Days, time.ut, `UT1 at ms=${ms}`);
        expectSameNumber(portBasis.ttDays, time.tt, `TT at ms=${ms}`);
        const clock = { ut: portBasis.ut1Days, tt: portBasis.ttDays, deltaT: portBasis.deltaT.seconds };
        // The model's tiny cross-runtime Delta T rounding is admitted by M3;
        // its frozen seconds are supplied to the respective iteration paths.
        expect(Math.abs(clock.deltaT - basis.deltaT.seconds)).toBeLessThanOrEqual(1e-12);
        for (const body of bodies) {
          for (const aberration of [false, true]) {
            const context = `${body}, ms=${ms}, aberration=${aberration}`;
            const actual = rust.geoVector(body, clock, aberration);
            const expected = GeoVector(Body[body], time, aberration);
            compareVector(actual, expected, "geocentric component AU", context);
            if (body !== "Earth") compareAngles(actual, expected, time.tt, context);
          }
        }
      });
    }
  }, 60_000);

  it("freezes the chart's Delta T through light-time iteration on every scale, pin and time-basis boundary", () => {
    for (const ms of boundaryMs) {
      for (const scale of scales) {
        for (const pin of pins) {
          onChartClock(ms, scale, pin, (time, basis) => {
            const clock = { ut: time.ut, tt: time.tt, deltaT: basis.deltaT.seconds };
            for (const target of bodies) {
              for (const aberration of [false, true]) {
                const context = `${target}, ms=${ms}, scale=${scale}, pin=${pin}, aberration=${aberration}`;
                compareBackdated("Earth", target, clock, time, aberration, context);
                compareVector(rust.geoVector(target, clock, aberration), GeoVector(Body[target], time, aberration),
                  "boundary geocentric component AU", context);
              }
            }
          });
        }
      }
    }
  }, 60_000);

  it("compares every supported observer-target pair in both modes at synthetic century dates", () => {
    for (const year of [1800, 1900, 2000, 2100, 2200]) {
      onChartClock(Date.UTC(year, 5, 17, 9, 13, 29, 731), "utc", undefined, (time, basis) => {
        const clock = { ut: time.ut, tt: time.tt, deltaT: basis.deltaT.seconds };
        for (const observer of bodies) {
          for (const target of bodies) {
            for (const aberration of [false, true]) {
              const context = `observer=${observer}, target=${target}, year=${year}, aberration=${aberration}`;
              compareBackdated(observer, target, clock, time, aberration, context);
              if (observer === target) {
                const actual = rust.backdatePosition(observer, target, clock, aberration);
                for (const component of ["x", "y", "z"] as const)
                  expectSameNumber(actual[component], 0, `${context}, exact ${component}`);
                expectSameNumber(actual.ut, clock.ut, `${context}, unchanged UT1`);
                expectSameNumber(actual.tt, clock.tt, `${context}, unchanged TT`);
              }
            }
          }
        }
      });
    }
  });

  it("preserves exact origin zeros and supplied TT at J2000 and adjacent binary64 values", () => {
    for (const tt of [...neighbors(-1), ...neighbors(0), ...neighbors(1)]) {
      SetDeltaTFunction(() => 0);
      try {
        const time = new AstroTime(0);
        time.tt = tt;
        const clock = { ut: 0, tt, deltaT: 0 };
        const sun = rust.helioState("Sun", tt);
        const earth = rust.geoVector("Earth", clock);
        for (const component of ["x", "y", "z", "vx", "vy", "vz"] as const)
          expectSameNumber(sun[component], 0, `Sun ${component}, tt=${tt}`);
        for (const component of ["x", "y", "z"] as const)
          expectSameNumber(earth[component], 0, `Earth ${component}, tt=${tt}`);
        for (const body of bodies) {
          const actual = rust.helioVector(body, tt);
          const expected = HelioVector(Body[body], time);
          compareVector(actual, expected, "J2000-neighbor component AU", `${body}, tt=${tt}`);
        }
      } finally {
        SetDeltaTFunction(deltaT);
      }
    }
  });

  it("preserves initial split clocks then reconstructs each AddDays TT from UT1 plus fixed Delta T", () => {
    // Deliberately inconsistent finite clocks are accepted at this low-level
    // boundary. AstroTime exposes mutable fields; its AddDays reconstructs TT
    // from UT1 and the installed Delta T instead of merely adding to old TT.
    for (const clock of [
      { ut: -70_000, tt: -69_999.75, deltaT: -7200 },
      { ut: 0, tt: 0.125, deltaT: 69.184 },
      { ut: 70_000, tt: 69_999.5, deltaT: 86400 }
    ]) {
      SetDeltaTFunction(() => clock.deltaT);
      try {
        const time = new AstroTime(clock.ut);
        time.tt = clock.tt;
        for (const observer of ["Sun", "Earth", "Neptune"] as const) {
          for (const target of bodies) {
            for (const aberration of [false, true]) {
              compareBackdated(observer, target, clock, time, aberration,
                `split clock ${JSON.stringify(clock)}, ${observer} to ${target}, aberration=${aberration}`);
            }
          }
        }
      } finally {
        SetDeltaTFunction(deltaT);
      }
    }
  });

  it("uses no astronomy-engine Delta T callback and repeats identical clocks bit for bit", () => {
    const clocks = [1800, 2000, 2200].map((year) => {
      const basis = timeBasis(Date.UTC(year, 7, 19, 11, 23, 37, 419));
      return { ut: basis.ut1Days, tt: basis.ttDays, deltaT: basis.deltaT.seconds };
    });
    SetDeltaTFunction(() => { throw new Error("Rust must not evaluate the JavaScript time callback"); });
    try {
      for (const clock of clocks) {
        for (const body of bodies) {
          const vector = rust.helioVector(body, clock.tt);
          const state = rust.helioState(body, clock.tt);
          const geo = rust.geoVector(body, clock);
          const backdated = rust.backdatePosition("Earth", body, clock);
          // Other epochs and bodies must not alter subsequent results.
          for (const other of clocks) rust.geoVector("Neptune", other, false);
          const repeated = [
            [vector, rust.helioVector(body, clock.tt)], [state, rust.helioState(body, clock.tt)],
            [geo, rust.geoVector(body, clock, true)],
            [backdated, rust.backdatePosition("Earth", body, clock, true)]
          ] as const;
          for (const [first, second] of repeated) {
            expect(Object.keys(second)).toEqual(Object.keys(first));
            for (const field of Object.keys(first)) {
              expectSameNumber((second as unknown as Record<string, number>)[field]!,
                (first as unknown as Record<string, number>)[field]!, `${body}, ${field}, repeated tt=${clock.tt}`);
            }
          }
        }
      }
    } finally {
      SetDeltaTFunction(deltaT);
    }
  });

  it("rejects unsupported bodies, nonfinite or non-number clocks, and nonboolean correction choices", () => {
    const clock = { ut: 0, tt: 0, deltaT: 0 };
    const invalidBodies: unknown[] = ["Moon", "EMB", "SSB", "Star1", "earth", "", null, 0, {}, Symbol("body")];
    for (const input of invalidBodies) {
      const body = input as SeriesBody;
      expect(() => rust.helioVector(body, 0)).toThrow(RangeError);
      expect(() => rust.helioState(body, 0)).toThrow(RangeError);
      expect(() => rust.geoVector(body, clock)).toThrow(RangeError);
      expect(() => rust.backdatePosition(body, "Sun", clock)).toThrow(RangeError);
      expect(() => rust.backdatePosition("Earth", body, clock)).toThrow(RangeError);
    }
    const invalidNumbers: unknown[] = [NaN, Infinity, -Infinity, undefined, null, true, "0", 0n, [], {},
      new Number(0), Symbol("time"), { valueOf() { throw new Error("Must not coerce"); } }];
    for (const input of invalidNumbers) {
      expect(() => rust.helioVector("Earth", input as number)).toThrow(RangeError);
      expect(() => rust.helioState("Earth", input as number)).toThrow(RangeError);
      for (const field of ["ut", "tt", "deltaT"] as const) {
        const invalidClock = { ...clock, [field]: input } as PlanetClock;
        expect(() => rust.geoVector("Sun", invalidClock)).toThrow(RangeError);
        expect(() => rust.backdatePosition("Earth", "Sun", invalidClock)).toThrow(RangeError);
      }
    }
    for (const input of [null, 0, 1, "true", {}, [], NaN]) {
      expect(() => rust.geoVector("Earth", clock, input as boolean)).toThrow(RangeError);
      expect(() => rust.backdatePosition("Earth", "Sun", clock, input as boolean)).toThrow(RangeError);
    }
    for (const input of [null, undefined, 0, true, "clock", Symbol("clock"), [], {}]) {
      expect(() => rust.geoVector("Sun", input as PlanetClock)).toThrow(RangeError);
      expect(() => rust.backdatePosition("Earth", "Sun", input as PlanetClock)).toThrow(RangeError);
    }
  });
});
