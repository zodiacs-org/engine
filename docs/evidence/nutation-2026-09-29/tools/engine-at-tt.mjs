// docs/evidence/rc14-20260928/engine-at-tt.mjs for engines from 0.1.1-rc.15
// on, which read a UTC instant from 1972 as UTC and add UT1 − UTC before the
// pinned ΔT. So each Terrestrial Time instant is given as a UT1 instant
// (`timeScale: "ut1"`) and a pinned ΔT that together give exactly that TT,
// and a UTC instant's TT is its UT1 (UTC + UT1 − UTC) plus ΔT.
//
// usage: node engine-at-tt.mjs <path to dist/index.js> <input.json>
// stdout: { version, instants: [ { jd_tt, trueObliquity, rows: [ { body, lon, lat, dec, margin, flag } ] } ] }
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const [entry, input] = process.argv.slice(2);
const engine = await import(pathToFileURL(resolve(entry)).href);
const request = JSON.parse(readFileSync(input, "utf8"));
const UNIX_EPOCH_JD = 2440587.5;
const PINNED_SECONDS = 69.184;

function evaluate(birth, jdTT) {
  const chart = engine.natalChart(birth);
  const result = engine.chartDeclinations(chart);
  const ut1Ms = birth.utc.getTime() + (chart.timeScale.ut1MinusUtc?.seconds ?? 0) * 1000;
  return {
    jd_tt: jdTT ?? UNIX_EPOCH_JD + (ut1Ms + result.deltaT.seconds * 1000) / 86_400_000,
    trueObliquity: result.trueObliquity,
    rows: result.rows.map((row) => ({ body: row.body, lon: row.lon, lat: row.lat, dec: row.dec,
      margin: row.boundMarginArcsec, flag: row.outOfBounds }))
  };
}

const instants = request.utc
  ? request.utc.map((utc) => evaluate({ utc: new Date(utc), timeKnown: false }))
  : request.jd_tt.map((jd) => {
    const ttMs = (jd - UNIX_EPOCH_JD) * 86_400_000;
    const ut1Ms = Math.floor(ttMs - PINNED_SECONDS * 1000);
    return evaluate({ utc: new Date(ut1Ms), timeScale: "ut1", deltaT: (ttMs - ut1Ms) / 1000, timeKnown: false }, jd);
  });
process.stdout.write(JSON.stringify({ version: engine.ENGINE_VERSION, instants }));
