/*
 * Inputs for swiss-compare.py, which sets both engines beside Swiss
 * Ephemeris (an instrument; only its statistics are kept). For rc.15 as
 * carried and for this tree's build:
 *
 * - "positions": 2,000 TT instants drawn from 1850-01-01 to 2050-01-01, read
 *   as TT: every body's longitude, the true node's, the mean node's and Black
 *   Moon Lilith's, the nutation in longitude (the ayanamsa's `nutation`) and
 *   in obliquity (chartDeclinations' true obliquity less the IAU 2006 mean
 *   obliquity), with the Julian date (TT);
 * - "angles": 3,000 instants drawn from 1800-01-01 to 2200-01-01, read as UT1
 *   as Swiss reads its jd_ut, at latitudes within ±60° and any longitude: the
 *   ascendant and midheaven;
 * - "meanPoints": 2,000 TT instants drawn from 1800-01-01 to 2200-01-01, the
 *   span README.md states for them: the mean node and Black Moon Lilith.
 *
 *   npm run build
 *   node docs/evidence/nutation-2026-09-29/tools/swiss-dump.mjs > "$WORK/swiss-dump.json"
 *
 * The instants and places are synthetic (a seeded generator).
 */
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { BUILD, unpackRc15 } from "./engines.mjs";

let seed = 29_092_026;
const random = () => (seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648) / 2_147_483_648;
const instant = (from, to) => new Date(Math.round(Date.UTC(from, 0, 1) + random() * (Date.UTC(to, 0, 1) - Date.UTC(from, 0, 1)))).toISOString();

const positions = Array.from({ length: 2000 }, () => instant(1850, 2050));
const angles = Array.from({ length: 3000 }, () => ({ utc: instant(1800, 2200), latitude: -60 + 120 * random(), longitude: -180 + 360 * random() }));
const meanPoints = Array.from({ length: 2000 }, () => instant(1800, 2200));

const rc15 = unpackRc15();
try {
  const out = { positions: { utc: positions }, angles: { cases: angles }, meanPoints: { utc: meanPoints } };
  for (const [name, dist] of [["rc15", rc15.dist], ["build", BUILD]]) {
    const root = await import(pathToFileURL(join(dist, "index.js")).href);
    const vedic = await import(pathToFileURL(join(dist, "vedic.js")).href);
    const math = await import(pathToFileURL(join(dist, "internal-math.js")).href);
    out.positions[name] = positions.map((utc) => {
      const chart = root.natalChart({ utc, timeScale: "tt", timeKnown: false });
      const value = vedic.ayanamsa("lahiri", utc, { timeScale: "tt" });
      const t = (value.julianDateTT - 2_451_545) / 36_525;
      const points = root.chartPoints(chart).points;
      const point = (label) => points.find((p) => p.point === label);
      return {
        jdTT: value.julianDateTT,
        bodies: Object.fromEntries(chart.bodies.map((b) => [b.body, b.lon])),
        meanNode: point("Mean Node").lon,
        lilith: [point("Black Moon Lilith").lon, point("Black Moon Lilith").lat],
        dpsi: value.nutation * 3600,
        deps: (root.chartDeclinations(chart).trueObliquity - math.meanObliquity(t)) * 3600
      };
    });
    out.meanPoints[name] = meanPoints.map((utc) => {
      const chart = root.natalChart({ utc, timeScale: "tt", timeKnown: false });
      const points = root.chartPoints(chart).points;
      const lilith = points.find((p) => p.point === "Black Moon Lilith");
      return [vedic.ayanamsa("raman", utc, { timeScale: "tt" }).julianDateTT, points.find((p) => p.point === "Mean Node").lon, lilith.lon, lilith.lat];
    });
    out.angles[name] = angles.map(({ utc, latitude, longitude }) => {
      const chart = root.natalChart({ utc, timeScale: "ut1", latitude, longitude, houseSystem: "whole" });
      return [chart.angles.asc, chart.angles.mc];
    });
  }
  process.stdout.write(`${JSON.stringify(out)}\n`);
} finally {
  rc15.cleanup();
}
