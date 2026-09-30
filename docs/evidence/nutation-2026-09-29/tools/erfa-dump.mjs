/*
 * Inputs for erfa-compare.py: at 4,001 TT instants from 1800-01-01 to
 * 2200-01-01, the longitudes both engines report (rc.15 as carried, and this
 * tree's build), and the vectors both rotate, so that ERFA can rotate the same
 * vectors itself.
 *
 *   npm run build
 *   node docs/evidence/nutation-2026-09-29/tools/erfa-dump.mjs > "$WORK/erfa-dump.jsonl"
 *
 * Each instant k is 1800-01-01T00:00 TT + 36.525 k days + a fraction of a day
 * (the golden ratio's multiples), to the millisecond, read as TT with a pinned
 * synthetic ΔT, −20 + 32 u² s with u = (year − 1820) / 100, so that UT1 and TT
 * are exactly known on both sides: UT1 = TT − ΔT. The chart is at a synthetic
 * place, latitude within ±60° and any longitude. Per instant it writes TT and
 * UT1 (days from J2000.0), the place, the geocentric apparent vector of each
 * planet (astronomy-engine's GeoVector with aberration), of the Moon (GeoMoon)
 * and the Moon's orbital angular momentum (GeoMoonState), all on the J2000
 * mean equator, and each engine's longitudes and latitudes, true node,
 * ascendant and midheaven.
 */
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { Body, GeoMoon, GeoMoonState, GeoVector, MakeTime, SetDeltaTFunction } from "astronomy-engine";

import { BUILD, unpackRc15 } from "./engines.mjs";

const J2000 = Date.UTC(2000, 0, 1, 12);
const DAY = 86_400_000;
const PLANETS = ["Sun", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"];
const GOLDEN = (Math.sqrt(5) - 1) / 2;

let seed = 20_260_929;
const random = () => (seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648) / 2_147_483_648;

const rc15 = unpackRc15();
try {
  const engines = {
    rc15: await import(pathToFileURL(join(rc15.dist, "index.js")).href),
    build: await import(pathToFileURL(join(BUILD, "index.js")).href)
  };
  const start = Date.UTC(1800, 0, 1);
  for (let k = 0; k <= 4000; k += 1) {
    const ms = Math.round(start + (k * 36.525 + ((k * GOLDEN) % 1)) * DAY);
    const year = 1970 + ms / (365.25 * DAY);
    const deltaT = -20 + 32 * ((year - 1820) / 100) ** 2;
    const latitude = -60 + 120 * random();
    const longitude = -180 + 360 * random();
    const birth = { utc: new Date(ms).toISOString(), timeScale: "tt", deltaT, latitude, longitude, houseSystem: "whole" };
    const row = { tt: 0, ut1: 0, deltaT, latitude, longitude, vectors: {}, node: null };
    // The engine's clock for a TT instant with ΔT pinned: UT1 = TT − ΔT, and
    // astronomy-engine's time built from that UT1 with the pin installed.
    SetDeltaTFunction(() => deltaT);
    const time = MakeTime((ms - deltaT * 1000 - J2000) / DAY);
    row.tt = time.tt;
    row.ut1 = time.ut;
    for (const name of PLANETS) {
      const v = GeoVector(Body[name], time, true);
      row.vectors[name] = [v.x, v.y, v.z];
    }
    const moon = GeoMoon(time);
    row.vectors.Moon = [moon.x, moon.y, moon.z];
    const s = GeoMoonState(time);
    row.node = [s.y * s.vz - s.z * s.vy, s.z * s.vx - s.x * s.vz, s.x * s.vy - s.y * s.vx];
    for (const [name, engine] of Object.entries(engines)) {
      const chart = engine.natalChart(birth);
      row[name] = {
        bodies: Object.fromEntries(chart.bodies.map((b) => [b.body, [b.lon, b.lat]])),
        asc: chart.angles.asc,
        mc: chart.angles.mc
      };
    }
    process.stdout.write(`${JSON.stringify(row)}\n`);
  }
} finally {
  rc15.cleanup();
}
