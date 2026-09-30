import { Body, EclipticGeoMoon, GeoVector, RotateVector, Rotation_EQJ_ECT } from "astronomy-engine";
import { describe, expect, it } from "vitest";

import {
  NODE_SPEED_STEP_DAYS,
  SPEED_STEP_DAYS,
  bodyLongitude,
  computeBodies,
  longitudeSpeed,
  onChartClock
} from "./ephemeris.js";
import { computeSaturnReturns } from "./returns.js";
import { chartPoints, natalChart } from "./api.js";
import { timeBasis } from "./time-scale.js";
import type { BodyName, BirthInput } from "./types.js";

const DAY = 86_400_000;
const BODIES: BodyName[] = [
  "Sun",
  "Moon",
  "Mercury",
  "Venus",
  "Mars",
  "Jupiter",
  "Saturn",
  "Uranus",
  "Neptune",
  "Pluto"
];

function centralDifference(body: BodyName, date: Date, stepDays: number): number {
  const before = bodyLongitude(body, new Date(date.getTime() - stepDays * DAY));
  const after = bodyLongitude(body, new Date(date.getTime() + stepDays * DAY));
  let difference = after - before;
  if (difference > 180) difference -= 360;
  if (difference < -180) difference += 360;
  return difference / (2 * stepDays);
}

describe("longitude speeds", () => {
  it("are the derivative of the reported longitude to 0.01″ a day", () => {
    let worst = 0;
    for (let t = Date.UTC(2025, 0, 1); t < Date.UTC(2026, 0, 1); t += 3 * DAY) {
      for (const body of BODIES) {
        const date = new Date(t);
        const error =
          Math.abs(longitudeSpeed(body, date) - centralDifference(body, date, 1e-4)) * 3600;
        worst = Math.max(worst, error);
      }
    }
    expect(worst).toBeLessThan(0.01);
  });

  it("keep the true node's six-hour difference", () => {
    for (const iso of ["1990-02-01T12:00:00Z", "2026-07-15T11:15:00Z", "2040-12-31T23:59:59Z"]) {
      const date = new Date(iso);
      expect(longitudeSpeed("North Node", date)).toBe(
        centralDifference("North Node", date, NODE_SPEED_STEP_DAYS)
      );
    }
  });

  it("set retrograde from the sign of the speed for every body", () => {
    for (const row of computeBodies(new Date("2024-04-01T22:14:00Z"))) {
      expect(row.retrograde).toBe(row.speed < 0);
    }
  });
});

/*
 * A leap second puts 86,401 s in a UTC day, and where the time basis changes
 * (1972-01-01, the UT1 table's last day, the ΔT model's hand-over at 1941.0)
 * TT steps. Speed samples 0.001 day either side of an instant there are then
 * 0.001 day apart on the input's scale but not in TT. rc.15's first cut
 * divided by 0.002 day all the same: within 86.4 s of a leap second every
 * speed read 1.005787 times the true rate. The true rate is the TT difference
 * quotient: positions depend on TT alone.
 */
describe("speeds where the time basis steps between their samples", () => {
  const J2000 = Date.UTC(2000, 0, 1, 12);
  const DAY_MS = 86_400_000;
  const wrap = (difference: number) => (difference > 180 ? difference - 360 : difference < -180 ? difference + 360 : difference);
  /** A planet's or the Moon's apparent longitude at a TT instant, ms, which may be fractional (a Date is not). */
  const longitudeAtTt = (body: BodyName, ttMs: number, pin: number | undefined): number =>
    onChartClock(ttMs, "tt", pin, (time) => {
      if (body === "Moon") return EclipticGeoMoon(time).lon;
      const vector = RotateVector(Rotation_EQJ_ECT(time), GeoVector(Body[body as keyof typeof Body], time, true));
      return (Math.atan2(vector.y, vector.x) * 180) / Math.PI;
    });
  /**
   * Each body's change of longitude between the chart's own speed samples,
   * `stepDays` either side of the instant on its scale, per day of TT between
   * them: the samples' TT from the time basis, their positions at that TT.
   */
  function ttRates(birth: BirthInput, stepDays: number, bodies: readonly BodyName[]): Map<BodyName, number> {
    const ms = new Date(birth.utc as string).getTime();
    const ttOf = (offset: number) => J2000 + timeBasis(ms + offset * DAY_MS, birth.timeScale ?? "utc", birth.deltaT).ttDays * DAY_MS;
    const [early, late] = [ttOf(-stepDays), ttOf(stepDays)];
    return new Map(
      bodies.map((body) => {
        const change = wrap(longitudeAtTt(body, late, birth.deltaT) - longitudeAtTt(body, early, birth.deltaT));
        return [body, change / ((late - early) / DAY_MS)];
      })
    );
  }

  it.each([
    ["2016-12-31T23:59:30Z", "utc", "the last leap second"],
    ["2017-01-01T00:00:30Z", "utc", "the last leap second"],
    ["1972-06-30T23:59:00Z", "utc", "the first leap second"],
    ["1998-12-31T23:59:59.500Z", "utc", "a leap second"],
    ["2027-10-02T00:00:00Z", "utc", "the UT1 table's last day"],
    ["2027-10-01T23:59:00Z", "utc", "the UT1 table's last day"],
    ["2027-10-02T00:00:00Z", "ut1", "the UT1 table's last day"],
    ["1972-01-01T00:00:00Z", "utc", "the first day of the leap-second list"],
    ["1971-12-31T23:59:30Z", "ut1", "the first day of the leap-second list"],
    ["1940-12-31T18:00:10Z", "utc", "the ΔT model's hand-over from its spline"],
    ["2016-12-31T23:59:30Z", "utc", "a pinned ΔT and a leap second", 68],
    ["2027-10-02T00:00:00Z", "utc", "a pinned ΔT and the UT1 table's last day", 70]
  ] as const)("are the rate per day of TT at %s (%s input, %s)", (utc, timeScale, _what, deltaT?: number) => {
    const birth: BirthInput = { utc, timeScale, timeKnown: false, ...(deltaT === undefined ? {} : { deltaT }) };
    const rates = ttRates(birth, SPEED_STEP_DAYS, BODIES);
    for (const row of natalChart(birth).bodies) {
      if (row.body === "North Node" || row.body === "South Node") continue;
      const rate = rates.get(row.body)!;
      // To rounding (the two reach the same TT by different sums); the first cut divided by
      // 0.002 day however much TT lay between the samples, and was off by 1.2e-5 to 5.8e-3 of the rate.
      expect(Math.abs(row.speed - rate), row.body).toBeLessThanOrEqual(Math.abs(rate) * 1e-7 + 1e-9);
    }
  });

  it("run on smoothly through a leap second", () => {
    const moon = (utc: string) => natalChart({ utc, timeKnown: false }).bodies.find((row) => row.body === "Moon")!.speed;
    // Inside the ±86.4 s window, against the mean of two instants just outside it.
    const outside = (moon("2016-12-31T23:57:00Z") + moon("2017-01-01T00:02:00Z")) / 2;
    for (const utc of ["2016-12-31T23:58:30Z", "2016-12-31T23:59:59Z", "2017-01-01T00:01:00Z"]) {
      expect(Math.abs(moon(utc) / outside - 1)).toBeLessThan(2e-5);
    }
  });

  it("keep the true node's rate over six hours across a leap second", () => {
    // Samples 2016-12-31T16:00 and 2017-01-01T04:00 UTC, half a day and a second apart.
    const utc = Date.parse("2016-12-31T22:00:00Z");
    const node = natalChart({ utc, timeKnown: false }).bodies.find((row) => row.body === "North Node")!;
    const ttOf = (offset: number) => J2000 + timeBasis(utc + offset * DAY_MS).ttDays * DAY_MS;
    const [early, late] = [ttOf(-NODE_SPEED_STEP_DAYS), ttOf(NODE_SPEED_STEP_DAYS)];
    // TT = UTC + 69.184 s on both sides here, in whole milliseconds, so TT input can take them.
    expect([early % 1, late % 1]).toEqual([0, 0]);
    const nodeAt = (tt: number) => natalChart({ utc: tt, timeScale: "tt", timeKnown: false }).bodies.find((row) => row.body === "North Node")!.lon;
    const rate = wrap(nodeAt(late) - nodeAt(early)) / ((late - early) / DAY_MS);
    // One second in half a day is 2.3e-5 of the rate.
    expect(Math.abs(node.speed / rate - 1)).toBeLessThan(1e-9);
  });

  it("keep the mean node's and the mean apogee's rates across a leap second", () => {
    const at = (utc: number, timeScale?: "tt") =>
      chartPoints({ utc, timeKnown: false, ...(timeScale ? { timeScale } : {}) }).points;
    const utc = Date.parse("2016-12-31T23:59:30Z");
    const ttOf = (offset: number) => J2000 + timeBasis(utc + offset * DAY_MS).ttDays * DAY_MS;
    const [early, late] = [ttOf(-SPEED_STEP_DAYS), ttOf(SPEED_STEP_DAYS)];
    expect([early % 1, late % 1]).toEqual([0, 0]);
    const before = at(early, "tt");
    const after = at(late, "tt");
    for (const point of at(utc)) {
      if (point.speed === null) continue;
      const index = before.findIndex((row) => row.point === point.point);
      const rate = wrap(after[index]!.lon - before[index]!.lon) / ((late - early) / DAY_MS);
      expect(Math.abs(point.speed / rate - 1), point.point).toBeLessThan(1e-9);
    }
  });

  it("are unchanged where no step lies between the samples", () => {
    // The quotient is taken over 0.002 day on the input's scale, as before.
    for (const iso of ["2016-12-31T23:58:00Z", "2017-01-01T00:02:00Z", "1990-02-01T12:00:00Z"]) {
      const date = new Date(iso);
      expect(longitudeSpeed("Moon", date)).toBe(centralDifference("Moon", date, SPEED_STEP_DAYS));
    }
  });
});

describe("natal Saturn direction in the return scan", () => {
  // Saturn stations retrograde on 2026-07-26; this speed changes sign near 19:57:39.6Z.
  it.each([
    "2026-07-26T19:57:16.990Z",
    "2026-07-26T19:57:29.612Z",
    "2026-07-26T19:57:49.612Z",
    "1990-02-01T12:00:00Z"
  ])("agrees with the chart at %s", (iso) => {
    const utc = new Date(iso);
    const saturn = natalChart({
      utc,
      latitude: 0,
      longitude: 0,
      houseSystem: "whole",
      timeKnown: true
    }).bodies.find((row) => row.body === "Saturn")!;
    expect(computeSaturnReturns(utc).natalRetrograde).toBe(saturn.retrograde);
  });
});
