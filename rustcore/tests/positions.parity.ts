import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SetDeltaTFunction } from "astronomy-engine";
import { positions } from "../../src/api.js";
import { bodyLongitude, computeBodies, computeChart, longitudeSpeed,
  NODE_SPEED_STEP_DAYS, SPEED_STEP_DAYS } from "../../src/ephemeris.js";
import { deltaT } from "../../src/deltat.js";
import { degreeInSign, normalizeLongitude, signForLongitude } from "../../src/signs.js";
import { EPHEMERIS_SPAN, outsideReferenceSpan, REFERENCE_SPAN } from "../../src/reference-span.js";
import { LEAP_SECOND_LIST, UT1_FROM_MS, UT1_TO_MS } from "../../src/time-scale-data.js";
import type { BodyName, BodyPosition, DateInput } from "../../src/types.js";
import type { TimeScaleName } from "../../src/time-scale.js";
import * as rust from "../ts/index.js";
import { expectSameError, expectSameNumber, outcome, randomUint32 } from "./parity-helpers.js";

beforeAll(() => rust.initRustCore(readFileSync(new URL("../pkg/zodiacs_rustcore_bg.wasm", import.meta.url))));

// Fixed before the first M7 WASM comparison. Coordinates reuse M5/M6 limits;
// speed permits the two coordinate errors divided by the full sample interval.
// True-node errors retain the documented short-difference amplification in M6.
const COORDINATE_ARCSEC = 1e-7;
const NODE_ARCSEC = 0.005;
const SPEED_ARCSEC_PER_DAY = 1e-4;
const NODE_SPEED_ARCSEC_PER_DAY = 0.02;
const DAY = 86_400_000;
const J2000 = Date.UTC(2000, 0, 1, 12);
const FROM = Date.UTC(1800, 0, 1);
const TO = Date.UTC(2200, 11, 31, 23, 59, 59, 999);
const BODY_ORDER: readonly BodyName[] = ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn",
  "Uranus", "Neptune", "Pluto", "North Node", "South Node"];
const dates = [FROM, TO, J2000];
for (let year = 1800; year <= 2200; year++) {
  for (let month = 0; month < 12; month++)
    dates.push(Date.UTC(year, month, 1 + (year + month) % 28, (year + month) % 24, 17, 43, 219));
}
const random = randomUint32(0x726f7773);
for (let index = 0; index < 128; index++)
  dates.push(FROM + Math.floor(random() / 0x1_0000_0000 * (TO - FROM)));

const maxima: Record<string, number> = {};
const differences: { body: string; context: string; field: string; actual: unknown; expected: unknown }[] = [];
let nearBoundaryDifferences = 0;
function deviation(body: string, context: string, field: string, actual: unknown, expected: unknown): void {
  nearBoundaryDifferences++;
  if (differences.length < 12) differences.push({ body, context, field, actual, expected });
}
function circular(a: number, b: number, period = 360): number {
  let difference = (a - b) % period;
  if (difference > period / 2) difference -= period;
  if (difference < -period / 2) difference += period;
  return difference;
}
function bound(difference: number, limit: number, label: string, context: string): void {
  maxima[label] = Math.max(maxima[label] ?? 0, Math.abs(difference));
  expect(Math.abs(difference), `${label}: ${context}`).toBeLessThanOrEqual(limit);
}
function compareRows(actual: BodyPosition[], expected: BodyPosition[], context: string): void {
  expect(actual.map((row) => row.body), context).toEqual(BODY_ORDER);
  expect(actual.length, context).toBe(expected.length);
  for (let index = 0; index < expected.length; index++) {
    const a = actual[index]!;
    const b = expected[index]!;
    const node = b.body.endsWith("Node");
    const angleLimit = node ? NODE_ARCSEC : COORDINATE_ARCSEC;
    const speedLimit = node ? NODE_SPEED_ARCSEC_PER_DAY : SPEED_ARCSEC_PER_DAY;
    const label = `${b.body} ${context}`;
    expect(Object.keys(a), label).toEqual(Object.keys(b));
    expect(a.body, label).toBe(b.body);
    for (const key of ["lon", "lat", "speed", "degree"] as const)
      expect(Number.isFinite(a[key]), `${label}, ${key}`).toBe(true);
    bound(circular(a.lon, b.lon) * 3600, angleLimit, `${b.body} longitude arcsec`, context);
    bound((a.lat - b.lat) * 3600, node ? 0 : angleLimit, `${b.body} latitude arcsec`, context);
    bound((a.speed - b.speed) * 3600, speedLimit, `${b.body} speed arcsec/day`, context);
    bound(circular(a.degree, b.degree, 30) * 3600, angleLimit, `${b.body} degree-in-sign arcsec`, context);
    // Metadata is always derived exactly from this implementation's numbers.
    expect(a.sign, label).toBe(signForLongitude(a.lon).slug);
    expectSameNumber(a.degree, degreeInSign(a.lon), `${label}, degree arithmetic`);
    expect(a.retrograde, label).toBe(a.speed < 0);
    if (node) expectSameNumber(a.lat, 0, `${label}, node latitude`);
    // Across runtimes, require exact decisions unless the admitted numerical
    // error can cross the decision boundary, then record the deviation.
    const distanceToSign = Math.min(b.degree, 30 - b.degree) * 3600;
    if (distanceToSign > angleLimit) expect(a.sign, label).toBe(b.sign);
    else if (a.sign !== b.sign) deviation(b.body, context, "sign", a.sign, b.sign);
    if (Math.abs(b.speed) * 3600 > speedLimit) expect(a.retrograde, label).toBe(b.retrograde);
    else if (a.retrograde !== b.retrograde) deviation(b.body, context, "retrograde", a.retrograde, b.retrograde);
  }
  expectSameNumber(actual[11]!.speed, actual[10]!.speed, `${context}, copied node speed`);
  expectSameNumber(actual[11]!.lon, normalizeLongitude(actual[10]!.lon + 180), `${context}, opposite node`);
}
function referenceOn(ms: number, scale: TimeScaleName = "utc", pin?: number): BodyPosition[] {
  return computeChart({ utc: new Date(ms), timeKnown: false, houseSystem: "whole",
    ...(scale === "utc" ? {} : { timeScale: scale }), ...(pin === undefined ? {} : { deltaT: pin }) }).bodies;
}
function compareOn(ms: number, scale: TimeScaleName = "utc", pin?: number): void {
  compareRows(rust.positionsOn(ms, scale, pin), referenceOn(ms, scale, pin), `ms=${ms}, ${scale}, pin=${pin}`);
}

afterAll(() => {
  SetDeltaTFunction(deltaT);
  if (process.env.RUSTCORE_PARITY_REPORT === "1")
    console.log(JSON.stringify({ positionsParityMaxima: maxima, nearBoundaryDifferences, differences }));
});

describe("complete native position rows through WASM", () => {
  it("retains the engine function signatures and span metadata", () => {
    const signatures: [typeof positions, typeof computeBodies, typeof bodyLongitude, typeof longitudeSpeed,
      typeof outsideReferenceSpan] = [rust.positions, rust.computeBodies, rust.bodyLongitude,
      rust.longitudeSpeed, rust.outsideReferenceSpan];
    expect(signatures.every((value) => typeof value === "function")).toBe(true);
    expect(rust.REFERENCE_SPAN).toEqual(REFERENCE_SPAN);
    expect(rust.EPHEMERIS_SPAN).toEqual(EPHEMERIS_SPAN);
    expect(Object.isFrozen(rust.REFERENCE_SPAN)).toBe(true);
    expect(Object.isFrozen(rust.EPHEMERIS_SPAN)).toBe(true);
    expect(Object.isFrozen(rust.EPHEMERIS_SPAN.daysFromJ2000)).toBe(true);
    expectSameNumber(rust.SPEED_STEP_DAYS, SPEED_STEP_DAYS, "planet step");
    expectSameNumber(rust.NODE_SPEED_STEP_DAYS, NODE_SPEED_STEP_DAYS, "node step");
    for (const ms of [NaN, -8.64e15, FROM - 1, FROM, FROM + 1, Date.UTC(2200, 0, 1) - 1,
      Date.UTC(2200, 0, 1), Date.UTC(2200, 0, 1) + 1, 8.64e15])
      expect(rust.outsideReferenceSpan(new Date(ms))).toBe(outsideReferenceSpan(new Date(ms)));
  });

  it("compares every row and annotation on monthly and seeded synthetic dates from 1800 through 2200", () => {
    for (const ms of dates) compareRows(rust.positions(ms), positions(ms), `ms=${ms}`);
  }, 60_000);

  it("compares the standalone longitude/speed functions and preserves node row speed sharing", () => {
    for (let year = 1800; year <= 2200; year += 4) {
      const date = new Date(Date.UTC(year, 8, 17, 3, 29, 11, 193));
      const rows = rust.computeBodies(date);
      compareRows(rows, computeBodies(date), date.toISOString());
      for (const body of BODY_ORDER) {
        const row = rows.find((candidate) => candidate.body === body)!;
        const node = body.endsWith("Node");
        const lon = rust.bodyLongitude(body, date);
        const speed = rust.longitudeSpeed(body, date);
        bound(circular(lon, bodyLongitude(body, date)) * 3600, node ? NODE_ARCSEC : COORDINATE_ARCSEC,
          `${body} standalone longitude arcsec`, date.toISOString());
        bound((speed - longitudeSpeed(body, date)) * 3600, node ? NODE_SPEED_ARCSEC_PER_DAY : SPEED_ARCSEC_PER_DAY,
          `${body} standalone speed arcsec/day`, date.toISOString());
        expectSameNumber(row.lon, lon, `${body}, row longitude`);
        if (body !== "South Node") expectSameNumber(row.speed, speed, `${body}, row speed`);
      }
    }
  }, 60_000);

  it("preserves explicit chart clocks, pins and every leap boundary in complete rows", () => {
    const boundaries = [...new Set([Date.UTC(1940, 11, 31, 18), UT1_FROM_MS, UT1_TO_MS,
      ...LEAP_SECOND_LIST.changes.map(([mjd]) => (mjd - 40587) * DAY)])];
    for (const edge of boundaries) {
      for (const offset of [-1, 0, 1]) {
        for (const scale of ["utc", "ut1", "tt"] as const) {
          for (const pin of [undefined, 0, -7200, 69.184, 86400]) compareOn(edge + offset, scale, pin);
        }
      }
    }
    for (let index = 1; index < LEAP_SECOND_LIST.changes.length; index++) {
      const [mjd] = LEAP_SECOND_LIST.changes[index]!;
      const oldTai = LEAP_SECOND_LIST.changes[index - 1]![1];
      compareOn((mjd - 40587) * DAY + oldTai * 1000 + 32184 + 500, "tt");
    }
    for (const pin of [-1e10, 1e10]) compareOn(J2000, "tt", pin);
  }, 60_000);

  it("probes TS-selected sign crossings and stations, including conditional discrete deviations", () => {
    // Select synthetic event neighborhoods from the TS implementation itself.
    // These brackets need not locate every crossing or a physically true event.
    for (const body of ["Sun", "Mercury", "Pluto", "North Node"] as const) {
      const start = Date.UTC(2000, 0, 1);
      let previous = start;
      let lon = bodyLongitude(body, new Date(start));
      let speed = longitudeSpeed(body, new Date(start));
      let signs = 0;
      let stations = 0;
      for (let ms = start + 16 * DAY; ms <= start + 36525 * DAY; ms += 16 * DAY) {
        const nextLon = bodyLongitude(body, new Date(ms));
        const nextSpeed = longitudeSpeed(body, new Date(ms));
        for (const kind of ["sign", "station"] as const) {
          const before = kind === "sign" ? Math.floor(lon / 30) : speed < 0;
          const after = kind === "sign" ? Math.floor(nextLon / 30) : nextSpeed < 0;
          if (before === after || (kind === "sign" ? signs : stations) >= 2) continue;
          let lo = previous;
          let hi = ms;
          while (hi - lo > 1) {
            const middle = Math.floor((lo + hi) / 2);
            const value = kind === "sign" ? Math.floor(bodyLongitude(body, new Date(middle)) / 30)
              : longitudeSpeed(body, new Date(middle)) < 0;
            if (value === before) lo = middle;
            else hi = middle;
          }
          for (const offset of [-1000, -1, 0, 1, 1000])
            compareRows(rust.positions(hi + offset), positions(hi + offset), `${body} ${kind}, ms=${hi + offset}`);
          if (kind === "sign") signs++;
          else stations++;
        }
        previous = ms;
        lon = nextLon;
        speed = nextSpeed;
        if (signs >= 2 && (body === "Sun" || stations >= 2)) break;
      }
      expect(signs).toBeGreaterThan(0);
      if (body !== "Sun") expect(stations).toBeGreaterThan(0);
    }
  }, 60_000);

  it("matches public date validation, parses offsets and returns fresh mutable rows", () => {
    for (const input of ["1800-01-01", "2000-01-01T19:00:00+07:00", TO, new Date(J2000)])
      compareRows(rust.positions(input), positions(input), String(input));
    const invalid: unknown[] = [NaN, Infinity, -Infinity, null, undefined, true, {}, [], Symbol("date"),
      0n, "2020-02-30", "2020-01-01T12:00", "2020-01-01T24:00:00Z", new Date(NaN)];
    for (const input of invalid) {
      const a = outcome(() => rust.positions(input as DateInput));
      const b = outcome(() => positions(input as DateInput));
      expect(a.ok).toBe(false);
      expect(b.ok).toBe(false);
      if (!a.ok && !b.ok) expectSameError(a.error, b.error, "invalid positions date");
    }
    const input = new Date(J2000);
    input.getTime = () => { throw new Error("public positions must use intrinsic Date value"); };
    compareRows(rust.positions(input), positions(input), "Date intrinsic");
    const baseline = rust.positions(J2000);
    const changed = rust.positions(J2000);
    expect(changed).not.toBe(baseline);
    expect(changed[0]).not.toBe(baseline[0]);
    changed[0]!.lon = 123;
    changed.splice(1);
    expect(rust.positions(J2000)).toEqual(baseline);
    expect(Date.prototype.getTime.call(input)).toBe(J2000);
  });

  it("refuses ephemeris-span breaches on the center and speed samples and accepts reference-span exteriors", () => {
    // The wider TT checks test acceptance only, not the 1800..2200 tolerance.
    for (const edge of [-730000, 730000]) {
      for (const offset of [-DAY, -DAY / 4 - 1, -DAY / 4, -86400, -1, 0, 1, 86400, DAY / 4, DAY / 4 + 1, DAY]) {
        const ms = J2000 + edge * DAY + offset;
        for (const scale of ["utc", "ut1", "tt"] as const) {
          for (const pin of [0, -7200, 69.184]) {
            const a = outcome(() => rust.positionsOn(ms, scale, pin));
            const b = outcome(() => referenceOn(ms, scale, pin));
            const context = `edge=${edge}, offset=${offset}, ${scale}, pin=${pin}`;
            expect(a.ok, context).toBe(b.ok);
            if (!a.ok && !b.ok) expectSameError(a.error, b.error, context);
            else if (a.ok) expect(a.value.every((row) => Number.isFinite(row.lon) && Number.isFinite(row.speed)), context).toBe(true);
          }
        }
      }
    }
    for (const ms of [Date.UTC(1799, 11, 31), Date.UTC(2200, 0, 1)]) {
      expect(rust.outsideReferenceSpan(new Date(ms))).toBe(true);
      expect(rust.positions(ms).map((row) => row.body)).toEqual(BODY_ORDER);
    }
    for (const input of [8.64e15, -8.64e15, "0000-01-01", "3999-01-01"]) {
      const a = outcome(() => rust.positions(input));
      const b = outcome(() => positions(input));
      expect(a.ok).toBe(false);
      expect(b.ok).toBe(false);
      if (!a.ok && !b.ok) expectSameError(a.error, b.error, "outside ephemeris span");
    }
  }, 60_000);

  it("runs complete rows without calling JavaScript ephemeris or time callbacks", () => {
    SetDeltaTFunction(() => { throw new Error("Rust must not evaluate the TS time callback"); });
    try {
      const rows = rust.positions(J2000);
      rust.positions(FROM);
      rust.positions(TO);
      expect(rust.positions(J2000)).toEqual(rows);
      for (const body of BODY_ORDER) {
        expect(Number.isFinite(rust.bodyLongitude(body, new Date(J2000)))).toBe(true);
        expect(Number.isFinite(rust.longitudeSpeed(body, new Date(J2000)))).toBe(true);
      }
    } finally {
      SetDeltaTFunction(deltaT);
    }
    for (const scale of [null, "UTC", {}, 0])
      expect(() => rust.positionsOn(J2000, scale as TimeScaleName)).toThrow(RangeError);
    for (const pin of [NaN, Infinity, -Infinity, 1e10 + 1, null, "0", {}])
      expect(() => rust.positionsOn(J2000, "utc", pin as number)).toThrow(RangeError);
  });
});
