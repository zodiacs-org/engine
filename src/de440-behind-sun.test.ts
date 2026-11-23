/**
 * A planet behind the Sun's disc on the shipped DE440 pack (from 1.1.0-rc.12).
 *
 * The pack's reduction bends no light from a planet behind the disc, as JPL
 * Horizons does not (src/de440/reduce.ts). Through 1.1.0-rc.11 it bent it
 * there too, without limit towards the centre: on 1954-05-08 Mercury's place
 * was 307.9″ from Horizons's. Here the places are held to Horizons's own, as
 * the planet's offset from the Sun, which takes the two frames' difference
 * out: the fixture is extracted from the near-Sun comparison's Horizons
 * responses (docs/evidence/1.1.0-rc.12-20261115/near-sun/, fixture.py), at
 * the passages nearest the centre and across each limb.
 *
 * And the speed: the place steps at the limb by the deflection there (at
 * most 1.7512″), so a central difference over ±0.001 day across it would
 * hold the step, up to 876″ a day; each speed's samples take the decision of
 * the instant itself, so the speed is the place's own rate on its side.
 */
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { calc, searchStations } from "./calc.js";
import type { CalcBody } from "./calc.js";
import { DE440_AT_LIMB, DE440_MEASURED } from "./calc-bounds-de440.js";
import { positions, setDefaultEphemeris } from "./index.js";

interface FixtureRow {
  body: CalcBody;
  jdTt: number;
  zone: "inside" | "limb" | "outside";
  horizons: { ra: number; dec: number; sunRa: number; sunDec: number };
}
const fixture: { rows: FixtureRow[]; relativeToTheSunArcsec: number } = JSON.parse(
  readFileSync(new URL("../docs/evidence/1.1.0-rc.12-20261115/near-sun/results/fixture.json", import.meta.url), "utf8")
);
const DEG = Math.PI / 180;
const unit = (ra: number, dec: number) => [Math.cos(dec * DEG) * Math.cos(ra * DEG), Math.cos(dec * DEG) * Math.sin(ra * DEG), Math.sin(dec * DEG)];

beforeAll(() => setDefaultEphemeris("de440"));
afterAll(() => setDefaultEphemeris("astronomy-engine"));

describe("a planet behind the Sun's disc on the shipped DE440 pack, against JPL Horizons", () => {
  it("is where Horizons puts it relative to the Sun, inside the disc and on either side of the limb", () => {
    expect(fixture.rows.length).toBeGreaterThanOrEqual(40);
    expect(new Set(fixture.rows.map((row) => row.zone))).toEqual(new Set(["inside", "outside"]));
    let largest = 0;
    for (const row of fixture.rows) {
      const at = (body: CalcBody) => {
        const r = calc({ body, time: { jd: row.jdTt, scale: "tt" }, frame: "equatorial-true-of-date", flags: { speeds: false } });
        if (r.status !== "ok") throw new Error(r.reason);
        expect(r.receipt.engine.ephemeris.name).toBe("jpl-de440");
        return unit(r.lon, r.lat);
      };
      const [b, s] = [at(row.body), at("Sun")];
      const [hb, hs] = [unit(row.horizons.ra, row.horizons.dec), unit(row.horizons.sunRa, row.horizons.sunDec)];
      const offset = Math.hypot(...[0, 1, 2].map((i) => b[i]! - s[i]! - (hb[i]! - hs[i]!))) / DEG * 3600;
      largest = Math.max(largest, offset);
    }
    // The figure the evidence quotes, and far under the 56″ to 308″ of 1.1.0-rc.11 at the same passages.
    expect(largest).toBeLessThanOrEqual(fixture.relativeToTheSunArcsec);
    expect(fixture.relativeToTheSunArcsec).toBeLessThan(Math.max(...Object.values(DE440_MEASURED)) * 3);
  });
});

describe("a planet's speed where its place steps at the Sun's limb", () => {
  // Neptune passes behind the limb on 1920-08-03 about seven hours before its least separation, 0.022° near 23:28 UTC.
  const closest = Date.UTC(1920, 7, 3, 23, 28);
  const neptune = (ms: number) => positions(new Date(ms)).find((row) => row.body === "Neptune")!;
  const moved = (a: number, b: number) => Math.abs(((neptune(b).lon - neptune(a).lon + 540) % 360) - 180);

  it("finds no Neptune station across either solar limb on daily and hourly scans", () => {
    const hour = 3_600_000;
    const start = closest - 12 * hour;
    const stop = closest + 12 * hour;
    const check = (from: number, to: number) => {
      expect(searchStations({ body: "Neptune", from: new Date(from), to: new Date(to) }))
        .toMatchObject({ status: "ok", events: [], ephemeris: { name: "jpl-de440" } });
    };
    check(start, stop);
    for (let from = start; from < stop; from += hour) check(from, from + hour);
  });

  it("is the place's own rate on either side of the step, in positions() and calc(), never the step over the samples", () => {
    let found: number | null = null;
    for (let time = closest - 12 * 3_600_000; time < closest && found === null; time += 60_000) {
      if (moved(time, time + 60_000) > 1e-4) found = time;
    }
    expect(found).not.toBeNull();
    const minute = found!;
    // Every 5 s for five minutes either side of the step: the speed stays at Neptune's own, within 0.005° a day (the
    // deflection's own rate outside the limb, about 0.0017° a day, is there on one side and not the other).
    const usual = neptune(minute - 600_000).speed;
    let worst = 0;
    for (let time = minute - 300_000; time <= minute + 360_000; time += 5_000) {
      worst = Math.max(worst, Math.abs(neptune(time).speed - usual));
      const r = calc({ body: "Neptune", time: new Date(time).toISOString() });
      if (r.status !== "ok") throw new Error(r.reason);
      worst = Math.max(worst, Math.abs(r.speeds!.lon - usual));
    }
    // A difference across the step would be about 1.7″ / 0.002 day, 0.24° a day.
    expect(worst).toBeLessThan(0.005);
    expect(DE440_AT_LIMB).toBeGreaterThan(1.7512);
  });
});
