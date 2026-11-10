import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AstroTime, GeoMoon, GeoMoonState, SetDeltaTFunction } from "astronomy-engine";
import { deltaT } from "../../src/deltat.js";
import { bodyLongitude, longitudeSpeed, onChartClock } from "../../src/ephemeris.js";
import { eclipticFrame, eclipticOfDate, meanEcliptic } from "../../src/frame.js";
import { normalizeLongitude } from "../../src/signs.js";
import { elapsedDays, timeBasis } from "../../src/time-scale.js";
import type { TimeScaleName } from "../../src/time-scale.js";
import {
  LEAP_SECOND_LIST, LEAP_SECONDS_EXPIRE_MS, UT1_FINALS_FROM_MS, UT1_FROM_MS,
  UT1_OBSERVED_TO_MS, UT1_TO_MS
} from "../../src/time-scale-data.js";
import * as rust from "../ts/index.js";
import type { PlanetClock, PlanetVector } from "../ts/index.js";
import { expectSameError, expectSameNumber, neighbors, outcome, randomUint32 } from "./parity-helpers.js";

const wasmBytes = readFileSync(new URL("../pkg/zodiacs_rustcore_bg.wasm", import.meta.url));
beforeAll(() => rust.initRustCore(wasmBytes));

// Fixed before this port's first comparison. These are implementation-parity
// allowances against the pinned MIT dependency, not astronomical accuracy.
// The state divides a difference of rounded positions by 2e-5 day. Its
// velocity and the node's nearly ecliptic orbit-plane projection amplify
// transcendental rounding; the node therefore needs a separate angular limit.
const POSITION_AU = 2e-17;
const VELOCITY_AU_PER_DAY = 2e-12;
const MOON_ARCSEC = 1e-7;
const NODE_ARCSEC = 0.005;
// Two coordinate errors divided by the reference's full sample interval.
const MOON_SPEED_ARCSEC_PER_DAY = 1e-4;
const NODE_SPEED_ARCSEC_PER_DAY = 0.02;
const DAY_MS = 86_400_000;
const STATE_STEP_DAYS = 1e-5;
const firstMs = Date.UTC(1800, 0, 1);
const lastMs = Date.UTC(2200, 11, 31, 23, 59, 59, 999);
const bodies = ["Moon", "North Node", "South Node"] as const;
type LunarBody = typeof bodies[number];
const scales: readonly TimeScaleName[] = ["utc", "ut1", "tt"];
const pins = [undefined, -7200, -0, 0, Number.MIN_VALUE, 69.184, 86400] as const;
const syntheticMs = [firstMs, lastMs, Date.UTC(2000, 0, 1, 12)];
for (let year = 1800; year <= 2200; year++) {
  for (let month = 0; month < 12; month++) {
    syntheticMs.push(Date.UTC(year, month, 1 + (year + month) % 28, (year + month) % 24, 17, 43, 219));
  }
}
const next = randomUint32(0x6c756e61);
for (let index = 0; index < 1024; index++) {
  syntheticMs.push(firstMs + Math.floor(next() / 0x1_0000_0000 * (lastMs - firstMs)));
}
const boundaryMs = [...new Set([
  Date.UTC(1940, 11, 31, 18), UT1_FROM_MS, UT1_FINALS_FROM_MS,
  UT1_OBSERVED_TO_MS, UT1_TO_MS, LEAP_SECONDS_EXPIRE_MS,
  ...LEAP_SECOND_LIST.changes.map(([mjd]) => (mjd - 40_587) * DAY_MS)
])].flatMap((ms) => [ms - 1, ms, ms + 1]);

const maxima: Record<string, number> = {};
let nearStationMotionDifferences = 0;
let nearWrapDifferences = 0;
const nearStationExamples: { context: string; actual: number; expected: number; differenceArcsecPerDay: number }[] = [];
const nearWrapExamples: { context: string; actual: number; expected: number; differenceArcsec: number }[] = [];
function bounded(actual: number, expected: number, tolerance: number, quantity: string, context: string): void {
  const difference = Math.abs(actual - expected);
  maxima[quantity] = Math.max(maxima[quantity] ?? 0, difference);
  expect(Number.isFinite(actual), `${quantity}: ${context}`).toBe(true);
  expect(Number.isFinite(expected), `${quantity} reference: ${context}`).toBe(true);
  expect(difference, `${quantity}: ${context}`).toBeLessThanOrEqual(tolerance);
}

function circularDifference(actual: number, expected: number): number {
  let difference = (actual - expected) % 360;
  if (difference > 180) difference -= 360;
  if (difference < -180) difference += 360;
  return difference;
}

function longitude(actual: number, expected: number, body: LunarBody, context: string): void {
  expect(actual, context).toBeGreaterThanOrEqual(0);
  expect(actual, context).toBeLessThan(360);
  bounded(circularDifference(actual, expected) * 3600, 0,
    body === "Moon" ? MOON_ARCSEC : NODE_ARCSEC, `${body} longitude arcsec`, context);
  if (Math.abs(actual - expected) > 180) {
    nearWrapDifferences++;
    if (nearWrapExamples.length < 3)
      nearWrapExamples.push({ context, actual, expected, differenceArcsec: circularDifference(actual, expected) * 3600 });
  }
}

function compareVector(actual: PlanetVector, expected: PlanetVector, quantity: string, context: string): void {
  for (const component of ["x", "y", "z"] as const)
    bounded(actual[component], expected[component], POSITION_AU, quantity, `${context}, ${component}`);
}

// Reproduce only the private orchestration in src/ephemeris.ts using the
// original GeoMoonState and original frame. UTC cases below also check these
// helpers bit for bit against the exported bodyLongitude/longitudeSpeed.
function referenceNode(time: AstroTime): number {
  const state = GeoMoonState(time);
  const frame = eclipticFrame(time.tt);
  const [x, y] = meanEcliptic(frame,
    state.y * state.vz - state.z * state.vy,
    state.z * state.vx - state.x * state.vz,
    state.x * state.vy - state.y * state.vx);
  return normalizeLongitude(Math.atan2(x, -y) * (180 / Math.PI) + frame.tilt.dpsi / 3600);
}

function referenceLongitude(body: LunarBody, ms: number, scale: TimeScaleName = "utc", pin?: number): number {
  return onChartClock(ms, scale, pin, (time) => {
    if (body === "Moon") {
      const vector = GeoMoon(time);
      return eclipticOfDate(vector.x, vector.y, vector.z, time.tt).lon;
    }
    const node = referenceNode(time);
    return body === "North Node" ? node : normalizeLongitude(node + 180);
  });
}

function referenceSpeed(body: LunarBody, ms: number, scale: TimeScaleName = "utc", pin?: number): number {
  const step = body === "Moon" ? 0.001 : 0.25;
  const beforeMs = ms - step * DAY_MS;
  const afterMs = ms + step * DAY_MS;
  const before = referenceLongitude(body, beforeMs, scale, pin);
  const after = referenceLongitude(body, afterMs, scale, pin);
  return circularDifference(after, before) /
    elapsedDays(timeBasis(beforeMs, scale, pin), timeBasis(afterMs, scale, pin), 2 * step);
}

function compareClock(clock: PlanetClock, time: AstroTime, context: string): void {
  compareVector(rust.geoMoon(clock.tt), GeoMoon(time), "Moon vector component AU", context);
  const expectedState = GeoMoonState(time);
  const actualState = rust.geoMoonState(clock);
  compareVector(actualState, expectedState, "Moon state position component AU", context);
  for (const component of ["vx", "vy", "vz"] as const) {
    bounded(actualState[component], expectedState[component], VELOCITY_AU_PER_DAY,
      "Moon state velocity AU/day", `${context}, ${component}`);
  }
  const vector = GeoMoon(time);
  const expected = eclipticOfDate(vector.x, vector.y, vector.z, time.tt);
  const actual = rust.moonOfDate(clock);
  longitude(actual.lon, expected.lon, "Moon", context);
  bounded((actual.lat - expected.lat) * 3600, 0, MOON_ARCSEC, "Moon latitude arcsec", context);
  longitude(rust.trueNodeLongitude(clock), referenceNode(time), "North Node", context);
}

function compareDate(ms: number, scale: TimeScaleName = "utc", pin?: number): void {
  const date = new Date(ms);
  for (const body of bodies) {
    const context = `${body}, ms=${ms}, scale=${scale}, pin=${Object.is(pin, -0) ? "-0" : pin}`;
    const expectedLongitude = scale === "utc" && pin === undefined
      ? bodyLongitude(body, date) : referenceLongitude(body, ms, scale, pin);
    const expectedSpeed = scale === "utc" && pin === undefined
      ? longitudeSpeed(body, date) : referenceSpeed(body, ms, scale, pin);
    longitude(rust.lunarLongitude(body, date, scale, pin), expectedLongitude, body, context);
    const speed = rust.lunarLongitudeSpeed(body, date, scale, pin);
    bounded((speed - expectedSpeed) * 3600, 0,
      body === "Moon" ? MOON_SPEED_ARCSEC_PER_DAY : NODE_SPEED_ARCSEC_PER_DAY,
      `${body} speed arcsec/day`, context);
    // At a station, rounding can change the sign of an almost-zero result.
    // Require exact motion decisions whenever the allowed speed error cannot
    // cross zero, and compare the numeric error unconditionally above.
    const allowance = body === "Moon" ? MOON_SPEED_ARCSEC_PER_DAY : NODE_SPEED_ARCSEC_PER_DAY;
    if (Math.abs(expectedSpeed) * 3600 > allowance)
      expect(speed < 0, `${context}, motion outside rounding allowance`).toBe(expectedSpeed < 0);
    else if ((speed < 0) !== (expectedSpeed < 0)) {
      nearStationMotionDifferences++;
      if (nearStationExamples.length < 3)
        nearStationExamples.push({ context, actual: speed, expected: expectedSpeed,
          differenceArcsecPerDay: (speed - expectedSpeed) * 3600 });
    }
  }
  const north = rust.lunarLongitude("North Node", date, scale, pin);
  expectSameNumber(rust.lunarLongitude("South Node", date, scale, pin), normalizeLongitude(north + 180),
    `exact South Node offset at ms=${ms}`);
  expectSameNumber(date.getTime(), ms, "input date unchanged");
}

afterAll(() => {
  SetDeltaTFunction(deltaT);
  if (process.env.RUSTCORE_PARITY_REPORT === "1")
    console.log(JSON.stringify({ moonParityMaxima: maxima, nearStationMotionDifferences, nearStationExamples,
      nearWrapDifferences, nearWrapExamples }));
});

describe("Moon series and true nodes through WASM", () => {
  it("pins the lunar reference source and checks the scale-aware reference adapters", () => {
    const bytes = readFileSync(new URL("../node_modules/astronomy-engine/esm/astronomy.js", import.meta.url));
    expect(createHash("sha256").update(bytes).digest("hex"))
      .toBe("068f1445ed0c636c94818fe6d20d7d125120e605e0bab9fc4675c3d531be5ad7");
    for (const [path, digest] of [
      ["../../src/ephemeris.ts", "b530dbd0463b886fe1b8e99a095dc9cf9ef0cf614b6854e78ad206a27913cc7e"],
      ["../../src/reference-span.ts", "5bce5a05494448a5740027c078527ab4fb7b0c02f71ff83465c01fd085a4d996"]
    ]) {
      expect(createHash("sha256").update(readFileSync(new URL(path!, import.meta.url))).digest("hex"))
        .toBe(digest);
    }
    for (const ms of [firstMs, lastMs, ...boundaryMs]) {
      for (const body of bodies) {
        expectSameNumber(referenceLongitude(body, ms), bodyLongitude(body, new Date(ms)), `${body} adapter longitude`);
        expectSameNumber(referenceSpeed(body, ms), longitudeSpeed(body, new Date(ms)), `${body} adapter speed`);
      }
    }
  });

  it("compares EQJ position, differenced state, of-date coordinates and nodes on monthly and seeded 1800-2200 dates", () => {
    for (const ms of syntheticMs) {
      onChartClock(ms, "utc", undefined, (time, basis) => {
        const portBasis = rust.timeBasis(ms);
        expectSameNumber(portBasis.ut1Days, time.ut, `UT1 at ms=${ms}`);
        expectSameNumber(portBasis.ttDays, time.tt, `TT at ms=${ms}`);
        expect(Math.abs(portBasis.deltaT.seconds - basis.deltaT.seconds)).toBeLessThanOrEqual(1e-12);
        compareClock({ ut: portBasis.ut1Days, tt: portBasis.ttDays, deltaT: portBasis.deltaT.seconds }, time, `ms=${ms}`);
      });
    }
  }, 60_000);

  it("compares Moon and both node longitudes and finite-difference speeds on the same date corpus", () => {
    for (const ms of syntheticMs) compareDate(ms);
  }, 60_000);

  it("preserves frozen sample Delta T and elapsed TT over every time-basis seam, scale and pin", () => {
    for (const ms of boundaryMs) {
      for (const scale of scales) {
        for (const pin of pins) {
          onChartClock(ms, scale, pin, (time, basis) => {
            compareClock({ ut: time.ut, tt: time.tt, deltaT: basis.deltaT.seconds }, time,
              `boundary ms=${ms}, scale=${scale}, pin=${pin}`);
          });
          compareDate(ms, scale, pin);
        }
      }
    }
    // A TT input can fall inside the represented leap second even though a
    // Date has no UTC 23:59:60 spelling. These are synthetic scale labels.
    for (let index = 1; index < LEAP_SECOND_LIST.changes.length; index++) {
      const [mjd] = LEAP_SECOND_LIST.changes[index]!;
      const oldTai = LEAP_SECOND_LIST.changes[index - 1]![1];
      for (const offset of [0, 500, 999, 1000])
        compareDate((mjd - 40_587) * DAY_MS + oldTai * 1000 + 32_184 + offset, "tt");
    }
  }, 60_000);

  it("retains the exact short-difference arithmetic, including reconstruction of deliberately split clocks", () => {
    const clocks = [
      { ut: -70_000, tt: -69_999.75, deltaT: -7200 },
      { ut: 0, tt: 0.125, deltaT: 69.184 },
      { ut: 70_000, tt: 69_999.5, deltaT: 86400 },
      ...neighbors(0).map((tt) => ({ ut: 0, tt, deltaT: 0 })),
      ...neighbors(-1).map((tt) => ({ ut: tt, tt, deltaT: 0 })),
      ...neighbors(1).map((tt) => ({ ut: tt, tt, deltaT: 0 }))
    ];
    for (const clock of clocks) {
      SetDeltaTFunction(() => clock.deltaT);
      try {
        const time = new AstroTime(clock.ut);
        time.tt = clock.tt;
        compareClock(clock, time, `split clock ${JSON.stringify(clock)}`);
        const before = rust.geoMoon((clock.ut - STATE_STEP_DAYS) + clock.deltaT / 86400);
        const after = rust.geoMoon((clock.ut + STATE_STEP_DAYS) + clock.deltaT / 86400);
        const state = rust.geoMoonState(clock);
        for (const [component, velocity] of [["x", "vx"], ["y", "vy"], ["z", "vz"]] as const) {
          expectSameNumber(state[component], (before[component] + after[component]) / 2,
            `${component} exact state midpoint`);
          expectSameNumber(state[velocity], (after[component] - before[component]) / (2 * STATE_STEP_DAYS),
            `${velocity} exact state difference`);
        }
      } finally {
        SetDeltaTFunction(deltaT);
      }
    }
  });

  it("compares TS-discovered node longitude wraps and stations with nearby millisecond samples", () => {
    const wraps: number[] = [];
    const stations: number[] = [];
    // Locate wraps using only the original TypeScript engine. This scan is
    // case selection, not a completeness claim about astronomical events.
    let beforeMs = firstMs;
    let beforeLon = bodyLongitude("North Node", new Date(beforeMs));
    for (let ms = firstMs + 32 * DAY_MS; ms <= lastMs; ms += 32 * DAY_MS) {
      const afterLon = bodyLongitude("North Node", new Date(ms));
      if (Math.abs(afterLon - beforeLon) > 180) {
        let lo = beforeMs;
        let hi = ms;
        const lowHalf = beforeLon < 180;
        while (hi - lo > 1) {
          const middle = Math.floor((lo + hi) / 2);
          if ((bodyLongitude("North Node", new Date(middle)) < 180) === lowHalf) lo = middle;
          else hi = middle;
        }
        wraps.push(hi);
      }
      beforeMs = ms;
      beforeLon = afterLon;
    }
    // Daily samples in the first quarter of each decade exercise both
    // direct-to-retrograde and retrograde-to-direct station neighborhoods.
    for (let year = 1800; year <= 2200; year += 10) {
      let loMs = Date.UTC(year, 0, 1);
      let loSpeed = longitudeSpeed("North Node", new Date(loMs));
      for (let day = 1; day <= 90; day++) {
        const hiMs = Date.UTC(year, 0, 1) + day * DAY_MS;
        const hiSpeed = longitudeSpeed("North Node", new Date(hiMs));
        if ((hiSpeed < 0) !== (loSpeed < 0)) {
          let lo = loMs;
          let hi = hiMs;
          const negative = loSpeed < 0;
          while (hi - lo > 1) {
            const middle = Math.floor((lo + hi) / 2);
            if ((longitudeSpeed("North Node", new Date(middle)) < 0) === negative) lo = middle;
            else hi = middle;
          }
          stations.push(hi);
        }
        loMs = hiMs;
        loSpeed = hiSpeed;
      }
    }
    expect(wraps.length).toBeGreaterThan(0);
    expect(stations.length).toBeGreaterThan(0);
    for (const at of [...wraps, ...stations]) {
      for (const offset of [-DAY_MS, -60_000, -1000, -1, 0, 1, 1000, 60_000, DAY_MS]) {
        const ms = at + offset;
        if (ms >= firstMs && ms <= lastMs) compareDate(ms);
      }
    }
  }, 60_000);

  it("does no JavaScript Delta T evaluation and repeats results bit for bit after unrelated clocks", () => {
    const clocks = [1800, 2000, 2200].map((year) => {
      const basis = timeBasis(Date.UTC(year, 6, 19, 11, 23, 37, 419));
      return { ut: basis.ut1Days, tt: basis.ttDays, deltaT: basis.deltaT.seconds };
    });
    SetDeltaTFunction(() => { throw new Error("Rust must not evaluate the JavaScript time callback"); });
    try {
      for (const clock of clocks) {
        const vector = rust.geoMoon(clock.tt);
        const state = rust.geoMoonState(clock);
        const coordinates = rust.moonOfDate(clock);
        const node = rust.trueNodeLongitude(clock);
        for (const other of clocks) rust.trueNodeLongitude(other);
        for (const [first, second] of [
          [vector, rust.geoMoon(clock.tt)], [state, rust.geoMoonState(clock)],
          [coordinates, rust.moonOfDate(clock)]
        ]) {
          expect(Object.keys(second!)).toEqual(Object.keys(first!));
          for (const field of Object.keys(first!)) {
            expectSameNumber((second as unknown as Record<string, number>)[field]!,
              (first as unknown as Record<string, number>)[field]!, `repeat ${field}, tt=${clock.tt}`);
          }
        }
        expectSameNumber(rust.trueNodeLongitude(clock), node, `repeat node, tt=${clock.tt}`);
      }
      for (const ms of [firstMs, Date.UTC(2000, 0, 1, 12), lastMs]) {
        for (const body of bodies) {
          const date = new Date(ms);
          expectSameNumber(rust.lunarLongitude(body, date), rust.lunarLongitude(body, date), "repeat date longitude");
          expectSameNumber(rust.lunarLongitudeSpeed(body, date), rust.lunarLongitudeSpeed(body, date), "repeat date speed");
        }
      }
    } finally {
      SetDeltaTFunction(deltaT);
    }
  });

  it("refuses malformed kernel clocks and unsupported lunar bodies without coercion", () => {
    const clock = { ut: 0, tt: 0, deltaT: 0 };
    const invalidNumbers: unknown[] = [NaN, Infinity, -Infinity, undefined, null, true, "0", 0n, [], {},
      new Number(0), Symbol("time"), { valueOf() { throw new Error("Must not coerce"); } }];
    for (const input of invalidNumbers) {
      expect(() => rust.geoMoon(input as number)).toThrow(RangeError);
      for (const field of ["ut", "tt", "deltaT"] as const) {
        const invalidClock = { ...clock, [field]: input } as PlanetClock;
        expect(() => rust.geoMoonState(invalidClock)).toThrow(RangeError);
        expect(() => rust.moonOfDate(invalidClock)).toThrow(RangeError);
        expect(() => rust.trueNodeLongitude(invalidClock)).toThrow(RangeError);
      }
    }
    for (const input of [null, undefined, 0, true, "clock", Symbol("clock"), [], {}]) {
      expect(() => rust.geoMoonState(input as PlanetClock)).toThrow(RangeError);
      expect(() => rust.moonOfDate(input as PlanetClock)).toThrow(RangeError);
      expect(() => rust.trueNodeLongitude(input as PlanetClock)).toThrow(RangeError);
    }
    for (const input of ["Sun", "Pluto", "moon", "", null, 0, {}, Symbol("body")]) {
      expect(() => rust.lunarLongitude(input as LunarBody, new Date(0))).toThrow(RangeError);
      expect(() => rust.lunarLongitudeSpeed(input as LunarBody, new Date(0))).toThrow(RangeError);
    }
  });

  it("preserves longitude and outer speed-sample span refusals without claiming parity outside the date corpus", () => {
    const j2000 = Date.UTC(2000, 0, 1, 12);
    for (const edge of [-730000, 730000]) {
      for (const step of [0, 0.001, 0.25]) {
        for (const direction of [-1, 1]) {
          for (const adjacentMs of [-1, 0, 1]) {
            const ms = new Date(j2000 + (edge + direction * step) * DAY_MS + adjacentMs).getTime();
            for (const body of bodies) {
              for (const scale of scales) {
                for (const pin of [0, 69.184, -7200]) {
                  const context = `${body}, edge=${edge}, step=${step}, ms=${ms}, scale=${scale}, pin=${pin}`;
                  const calls = [
                    [() => rust.lunarLongitude(body, new Date(ms), scale, pin),
                      () => referenceLongitude(body, ms, scale, pin)],
                    [() => rust.lunarLongitudeSpeed(body, new Date(ms), scale, pin),
                      () => referenceSpeed(body, ms, scale, pin)]
                  ] as const;
                  for (const [actualCall, expectedCall] of calls) {
                    const expected = outcome(expectedCall);
                    const actual = outcome(actualCall);
                    expect(actual.ok, context).toBe(expected.ok);
                    if (!actual.ok && !expected.ok) expectSameError(actual.error, expected.error, context);
                    else if (actual.ok) expect(Number.isFinite(actual.value), context).toBe(true);
                  }
                }
              }
            }
          }
        }
      }
    }
  });

  it("validates the lunar Date, time-scale and pin boundary before entering WASM", () => {
    for (const date of [new Date(NaN), null, undefined, 0, "2000-01-01", {}, Object.create(Date.prototype)]) {
      for (const body of bodies) {
        expect(() => rust.lunarLongitude(body, date as Date)).toThrow(RangeError);
        expect(() => rust.lunarLongitudeSpeed(body, date as Date)).toThrow(RangeError);
      }
    }
    for (const scale of ["UTC", "invalid", "", null, 0, {}, Symbol("scale")]) {
      expect(() => rust.lunarLongitude("Moon", new Date(0), scale as TimeScaleName)).toThrow(RangeError);
      expect(() => rust.lunarLongitudeSpeed("Moon", new Date(0), scale as TimeScaleName)).toThrow(RangeError);
    }
    for (const pin of [NaN, Infinity, -Infinity, 1e10 + 1, -1e10 - 1, null, "0", {}, Symbol("pin")]) {
      expect(() => rust.lunarLongitude("Moon", new Date(0), "utc", pin as number)).toThrow(RangeError);
      expect(() => rust.lunarLongitudeSpeed("Moon", new Date(0), "utc", pin as number)).toThrow(RangeError);
    }
    // The largest accepted pin still evaluates a J2000 TT input near J2000;
    // it shifts UT1, so this stays within the numerical parity date span.
    for (const pin of [-1e10, 1e10]) compareDate(Date.UTC(2000, 0, 1, 12), "tt", pin);
    const date = new Date(Date.UTC(2000, 0, 1, 12));
    date.getTime = () => { throw new Error("Use the intrinsic Date value"); };
    for (const body of bodies) {
      expectSameNumber(rust.lunarLongitude(body, date), rust.lunarLongitude(body, new Date(Date.UTC(2000, 0, 1, 12))),
        `${body}, intrinsic Date timestamp`);
    }
  });
});
