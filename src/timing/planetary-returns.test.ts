/**
 * Planetary returns (gate R of docs/evidence/houses-extra-2026-09-29/PREREGISTRATION.md).
 *
 * Every natal chart here is invented: an instant and a place made up for the
 * fixture, none of them a real person's birth.
 *
 * - The Horizons fixtures are worked from JPL Horizons (DE441), an ephemeris
 *   independent of this engine: the natal longitude and the instants each
 *   body returns to it (fixtures/planetary-returns-horizons.json, built by
 *   docs/evidence/houses-extra-2026-09-29/tools/horizons-returns.py).
 * - The USNO fixture uses the equinox instants the US Naval Observatory
 *   publishes (Astronomical Applications API, `seasons`), to the minute.
 * - The consistency checks set the returns against a plain scan of the
 *   engine's own longitudes: they test that the search misses no crossing,
 *   not the ephemeris.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { natalChart } from "../api.js";
import { bodyLongitude } from "../ephemeris.js";
import type { BodyName, Chart } from "../types.js";
import { RETURN_BODIES, RETURN_STEP_DAYS, planetaryReturns } from "./planetary-returns.js";
import type { ReturnBody } from "./planetary-returns.js";

const DAY = 86_400_000;

interface Fixture {
  body: ReturnBody;
  natal: { utc: string; latitude: number; longitude: number; horizonsLongitude: number };
  window: { from: string; to: string };
  crossings: { at: string; retrograde: boolean; speed: number; rows: [string, number][] }[];
}
const HORIZONS = (
  JSON.parse(readFileSync(new URL("./fixtures/planetary-returns-horizons.json", import.meta.url), "utf8")) as {
    fixtures: Fixture[];
  }
).fixtures;

/** τ of gate R, arcseconds: twice the ephemeris error measured for the body's class, rounded up. */
const TOLERANCE: Record<ReturnBody, number> = {
  Sun: 6,
  Moon: 8,
  Mercury: 45,
  Venus: 45,
  Mars: 45,
  Jupiter: 45,
  Saturn: 45,
  Uranus: 45,
  Neptune: 45,
  Pluto: 45
};

const seam = (degrees: number) => ((((degrees + 180) % 360) + 360) % 360) - 180;

describe("returns against JPL Horizons (gate R, R1 to R3)", () => {
  it("covers every body the function takes", () => {
    expect(HORIZONS.map((fixture) => fixture.body).sort()).toEqual([...RETURN_BODIES].sort());
  });

  it("holds instants that are the roots of its own Horizons rows", () => {
    for (const fixture of HORIZONS) {
      for (const crossing of fixture.crossings) {
        // The 4-point Lagrange interpolant of the rows' offsets from the natal longitude.
        const base = Date.parse(crossing.rows[0]![0]);
        const t = crossing.rows.map(([at]) => (Date.parse(at) - base) / DAY);
        const y = crossing.rows.map(([, lon]) => seam(lon - fixture.natal.horizonsLongitude));
        const at = (Date.parse(crossing.at) - base) / DAY;
        const value = y.reduce((sum, yi, i) => sum + t.reduce((term, tj, j) => (j === i ? term : (term * (at - tj)) / (t[i]! - tj)), yi), 0);
        expect(Math.abs(value) * 3600, `${fixture.body} ${crossing.at}`).toBeLessThan(0.001);
        expect(t[0]! <= at && at <= t[3]!).toBe(true);
      }
    }
  });

  it.each(HORIZONS)("$body: every return, in order and direction, within τ of Horizons's instant", (fixture) => {
    const natal = { utc: fixture.natal.utc, latitude: fixture.natal.latitude, longitude: fixture.natal.longitude };
    const result = planetaryReturns(natal, fixture.body, fixture.window.from, fixture.window.to);
    // R1: the completeness verdict.
    expect(result.status).toBe("complete");
    // R2: the same returns, with the same directions.
    expect(result.returns.map((row) => row.retrograde)).toEqual(fixture.crossings.map((row) => row.retrograde));
    // R3: each within τ / |v| of Horizons's.
    result.returns.forEach((row, index) => {
      const expected = fixture.crossings[index]!;
      const days = (row.at.getTime() - Date.parse(expected.at)) / DAY;
      const arcseconds = Math.abs(days * expected.speed) * 3600;
      expect(arcseconds, `${fixture.body} return ${index + 1}`).toBeLessThanOrEqual(TOLERANCE[fixture.body]);
    });
    // Passes: three returns around a station are one pass; the Sun and Moon never turn.
    const passes = result.returns.map((row) => row.pass);
    expect(passes).toEqual(
      fixture.body === "Sun" || fixture.body === "Moon" ? passes.map((_, index) => index + 1) : [1, 1, 1]
    );
    // The natal longitude is the chart's.
    const chart = natalChart(natal);
    expect(result.natalLongitude).toBe(chart.bodies.find((row) => row.body === fixture.body)!.lon);
  });
});

describe("the completeness verdict (gate R, R1 and R4)", () => {
  it("is refused, with no returns, when the budget is smaller than the coarse scan", () => {
    const fixture = HORIZONS.find((row) => row.body === "Saturn")!;
    const refused = planetaryReturns(fixture.natal, "Saturn", fixture.window.from, fixture.window.to, { maxSamples: 10 });
    expect(refused).toMatchObject({ status: "refused", reason: "sample-budget", samples: 0, maxSamples: 10, returns: [] });
    expect(Object.isFrozen(refused) && Object.isFrozen(refused.returns)).toBe(true);
    // Refused part-way, after the coarse scan: still no returns, never part of a result.
    const complete = planetaryReturns(fixture.natal, "Saturn", fixture.window.from, fixture.window.to);
    expect(complete.status).toBe("complete");
    const partway = planetaryReturns(fixture.natal, "Saturn", fixture.window.from, fixture.window.to, {
      maxSamples: complete.samples - 1
    });
    expect(partway).toMatchObject({ status: "refused", returns: [], samples: complete.samples - 1 });
    const exact = planetaryReturns(fixture.natal, "Saturn", fixture.window.from, fixture.window.to, {
      maxSamples: complete.samples
    });
    expect(exact).toEqual(complete);
  });

  it("carries a verdict on every result, frozen", () => {
    for (const body of RETURN_BODIES) {
      const result = planetaryReturns({ utc: "2003-11-02T08:13:00Z", latitude: -4.2, longitude: 55.5 }, body, "2004-01-01", "2004-02-01");
      expect(["complete", "refused"]).toContain(result.status);
      expect(Object.isFrozen(result) && Object.isFrozen(result.returns) && Object.isFrozen(result.flags)).toBe(true);
      for (const row of result.returns) expect(Object.isFrozen(row)).toBe(true);
    }
  });
});

describe("solar returns against USNO's published equinoxes", () => {
  it("returns four times, each within 210 s of the March equinox, for a native born at the equinox of 2000", () => {
    // An invented native born at the March equinox of 2000 as USNO publishes
    // it, 2000-03-20 07:35 UT. USNO's March equinoxes of 2001 to 2004 (UT).
    const result = planetaryReturns({ utc: "2000-03-20T07:35:00Z", latitude: 8.5, longitude: -79.5 }, "Sun", "2000-06-01", "2004-06-01");
    expect(result.status).toBe("complete");
    const equinoxes = ["2001-03-20T13:31:00Z", "2002-03-20T19:16:00Z", "2003-03-21T01:00:00Z", "2004-03-20T06:49:00Z"];
    expect(result.returns.map((row) => row.retrograde)).toEqual([false, false, false, false]);
    result.returns.forEach((row, index) => {
      expect(Math.abs(row.at.getTime() - Date.parse(equinoxes[index]!)) / 1000).toBeLessThanOrEqual(210);
    });
  });
});

/** Crossings of `target` by the engine's own longitude: a plain scan, each sign change bisected to 1 ms. */
function plainScan(body: BodyName, target: number, from: number, to: number, stepDays: number) {
  const offset = (time: number) => seam(bodyLongitude(body, new Date(time)) - target);
  const found: { at: number; retrograde: boolean }[] = [];
  let previousTime = from;
  let previous = offset(from);
  for (let time = from + stepDays * DAY; previousTime < to; time += stepDays * DAY) {
    const now = Math.min(time, to);
    const current = offset(now);
    if (previous !== 0 && current !== 0 && Math.sign(previous) !== Math.sign(current) && Math.abs(previous) < 90 && Math.abs(current) < 90) {
      let low = previousTime;
      let high = now;
      while (high - low > 1) {
        const middle = Math.floor((low + high) / 2);
        if (Math.sign(offset(middle)) === Math.sign(previous)) low = middle;
        else high = middle;
      }
      found.push({ at: high, retrograde: current < previous });
    }
    previousTime = now;
    previous = current;
  }
  return found;
}

/** A copy of an invented chart with one body moved to `lon`: the returns read only the chart's longitude. */
function withLongitude(chart: Chart, body: BodyName, lon: number): Chart {
  return { ...chart, bodies: chart.bodies.map((row) => (row.body === body ? { ...row, lon } : row)) };
}

describe("consistency with a plain scan of the engine's own longitudes", () => {
  it.each(HORIZONS)("$body: the same returns as a fine plain scan over the fixture's window", (fixture) => {
    const result = planetaryReturns(fixture.natal, fixture.body, fixture.window.from, fixture.window.to);
    const scan = plainScan(
      fixture.body,
      result.natalLongitude,
      Date.parse(fixture.window.from),
      Date.parse(fixture.window.to),
      fixture.body === "Moon" ? 0.005 : 0.02
    );
    expect(result.returns.map((row) => row.retrograde)).toEqual(scan.map((row) => row.retrograde));
    result.returns.forEach((row, index) => {
      expect(Math.abs(row.at.getTime() - scan[index]!.at)).toBeLessThanOrEqual(1_000);
    });
  });

  // Stations of each planet, found on the engine's own longitudes: a daily
  // scan for the first retrograde station after the instant, refined by
  // golden-section search. A natal degree 1e-3° to 1e-6° inside it has two
  // returns hours or minutes apart, which a plain scan at any fixed step can
  // miss; they are bisected here on each side of the station instead.
  const STATIONS: [ReturnBody, string, number][] = [
    ["Mercury", "2029-01-01", 10],
    ["Venus", "2031-06-01", 20],
    ["Mars", "2033-01-01", 30],
    ["Jupiter", "2034-01-01", 60],
    ["Saturn", "2036-01-01", 60],
    ["Uranus", "2037-01-01", 60],
    ["Neptune", "2038-01-01", 60],
    ["Pluto", "2039-01-01", 60]
  ];
  const chart = natalChart({ utc: "1990-10-17T16:42:00Z", latitude: 27.4, longitude: -15.6 });

  it.each(STATIONS)("%s: both returns around a station, from 1e-3° to 1e-6° inside it, and none outside", (body, start, halfWindow) => {
    const unwrapped = (time: number, reference: number) => reference + seam(bodyLongitude(body, new Date(time)) - reference);
    // The first local maximum of the longitude after `start`, to the millisecond.
    let time = Date.parse(start);
    let previous = bodyLongitude(body, new Date(time));
    let rising = false;
    for (;;) {
      const next = unwrapped(time + DAY, previous);
      if (rising && next < previous) break;
      rising = next > previous;
      previous = next;
      time += DAY;
    }
    let low = time - DAY;
    let high = time + DAY;
    const golden = (Math.sqrt(5) - 1) / 2;
    while (high - low > 1) {
      const a = high - golden * (high - low);
      const b = low + golden * (high - low);
      if (unwrapped(a, previous) < unwrapped(b, previous)) low = a;
      else high = b;
    }
    const station = (low + high) / 2;
    const peak = bodyLongitude(body, new Date(station));
    for (const inside of [1e-3, 1e-4, 1e-5, 1e-6]) {
      const target = ((peak - inside) % 360 + 360) % 360;
      const bisect = (from: number, to: number) => {
        let a = from;
        let b = to;
        const sign = Math.sign(seam(bodyLongitude(body, new Date(a)) - target));
        while (b - a > 1) {
          const middle = Math.floor((a + b) / 2);
          if (Math.sign(seam(bodyLongitude(body, new Date(middle)) - target)) === sign) a = middle;
          else b = middle;
        }
        return b;
      };
      const expected = [bisect(station - halfWindow * DAY, station), bisect(station, station + halfWindow * DAY)];
      const result = planetaryReturns(withLongitude(chart, body, target), body, new Date(station - halfWindow * DAY), new Date(station + halfWindow * DAY));
      expect(result.status).toBe("complete");
      expect(result.returns.map((row) => [row.retrograde, row.pass]), `${body} ${inside}° inside`).toEqual([
        [false, 1],
        [true, 1]
      ]);
      result.returns.forEach((row, index) => {
        expect(Math.abs(row.at.getTime() - expected[index]!), `${body} ${inside}° inside, return ${index + 1}`).toBeLessThanOrEqual(1_000);
      });
      const outside = planetaryReturns(
        withLongitude(chart, body, ((peak + inside) % 360 + 360) % 360),
        body,
        new Date(station - halfWindow * DAY),
        new Date(station + halfWindow * DAY)
      );
      expect(outside.returns, `${body} ${inside}° outside`).toEqual([]);
    }
  });
});

describe("input", () => {
  const natal = { utc: "1978-05-30T22:05:00Z", latitude: -8.1, longitude: 115.2 };

  it("refuses an unknown body, invalid dates and unknown options", () => {
    expect(() => planetaryReturns(natal, "North Node" as ReturnBody, "2000-01-01", "2001-01-01")).toThrow(RangeError);
    expect(() => planetaryReturns(natal, "Mars", "not a date", "2001-01-01")).toThrow(RangeError);
    expect(() => planetaryReturns(natal, "Mars", "2001-01-01", "2000-01-01")).toThrow(RangeError);
    expect(() => planetaryReturns(natal, "Mars", "2000-01-01", "2001-01-01", { step: 1 } as never)).toThrow(RangeError);
    expect(() => planetaryReturns(natal, "Mars", "2000-01-01", "2001-01-01", { stepDays: 0 })).toThrow(RangeError);
    expect(() => planetaryReturns(natal, "Mars", "2000-01-01", "2001-01-01", { maxSamples: 1.5 })).toThrow(RangeError);
  });

  it("uses each body's step unless one is given, and flags instants outside the reference span", () => {
    expect(Object.isFrozen(RETURN_STEP_DAYS) && Object.isFrozen(RETURN_BODIES)).toBe(true);
    const byDefault = planetaryReturns(natal, "Mercury", "2000-01-01", "2000-12-31");
    const explicit = planetaryReturns(natal, "Mercury", "2000-01-01", "2000-12-31", { stepDays: RETURN_STEP_DAYS.Mercury });
    expect(explicit).toEqual(byDefault);
    expect(byDefault.flags).toEqual([]);
    expect(planetaryReturns(natal, "Sun", "2250-01-01", "2250-02-01").flags).toEqual(["outside-reference-span"]);
  });

  it("reads a supplied chart's own longitude", () => {
    const chart = natalChart(natal);
    const result = planetaryReturns(chart, "Venus", "2001-01-01", "2002-01-01");
    expect(result).toEqual(planetaryReturns(natal, "Venus", "2001-01-01", "2002-01-01"));
    expect(result.natalLongitude).toBe(chart.bodies.find((row) => row.body === "Venus")!.lon);
  });
});
