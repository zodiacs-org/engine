/*
 * Inputs for test-expectations.py, which sets three pinned test values beside
 * ERFA: the Mercury station of February 2026 (src/crossings-ephemeris.test.ts),
 * the polar-fallback receipt's ascendant (src/receipt.test.ts) and the
 * Placidus polar limit of the review's reproduction (src/placidus-limit.test.ts).
 *
 *   npm run build
 *   node docs/evidence/nutation-2026-09-29/tools/test-expectations.mjs > "$WORK/test-expectations.json"
 *
 * It writes, for rc.15 as carried and for this tree's build: Mercury's
 * longitude every 5 s for an hour either side of 06:47:10Z on 2026-02-26, the
 * ascendant and the true obliquity of the two charts, and the chart clocks
 * (ΔT and UT1 − UTC). It also writes Mercury's apparent geocentric vector on
 * the J2000 mean equator (astronomy-engine's GeoVector with aberration, the
 * vector both engines rotate) at each sample's TT, UTC + 69.184 s, for ERFA to
 * rotate.
 */
import { pathToFileURL } from "node:url";
import { join } from "node:path";

import { Body, GeoVector, MakeTime, SetDeltaTFunction } from "astronomy-engine";

import { BUILD, unpackRc15 } from "./engines.mjs";

const J2000 = Date.UTC(2000, 0, 1, 12);
const DAY = 86_400_000;
const rc15 = unpackRc15();
try {
  const load = async (dist) => ({
    ...(await import(pathToFileURL(join(dist, "index.js")).href)),
    ...(await import(pathToFileURL(join(dist, "internal.js")).href))
  });
  const engines = { rc15: await load(rc15.dist), build: await load(BUILD) };

  const centre = Date.parse("2026-02-26T06:47:10Z");
  const samples = [];
  for (let s = -3600; s <= 3600; s += 5) samples.push(centre + s * 1000);
  const mercury = { utcMs: samples, ttDays: [], vectors: [], rc15: [], build: [] };
  SetDeltaTFunction(() => 69.184);
  for (const ms of samples) {
    const time = MakeTime((ms - J2000) / DAY);
    const v = GeoVector(Body.Mercury, time, true);
    mercury.ttDays.push(time.tt);
    mercury.vectors.push([v.x, v.y, v.z]);
  }
  for (const [name, engine] of Object.entries(engines)) {
    for (const ms of samples) mercury[name].push(engine.bodyLongitude("Mercury", new Date(ms)));
  }

  const charts = {
    receipt: { utc: "2001-12-21T09:00:00.000Z", latitude: 78.2232, longitude: 15.6267, houseSystem: "placidus", timeScale: "ut1" },
    placidusLimit: { utc: "2000-03-20T00:00:00.000Z", latitude: 66.56186339751429, longitude: 92.16879370494166, houseSystem: "placidus" }
  };
  const out = { mercury, charts: {} };
  for (const [key, birth] of Object.entries(charts)) {
    out.charts[key] = { birth };
    for (const [name, engine] of Object.entries(engines)) {
      const chart = engine.natalChart(birth);
      out.charts[key][name] = {
        asc: chart.angles.asc,
        mc: chart.angles.mc,
        deltaT: chart.deltaT.seconds,
        ut1MinusUtc: chart.timeScale.ut1MinusUtc?.seconds ?? 0,
        trueObliquity: engine.chartDeclinations(chart).trueObliquity,
        houses: chart.houses.system
      };
    }
  }
  process.stdout.write(`${JSON.stringify(out)}\n`);
} finally {
  rc15.cleanup();
}
