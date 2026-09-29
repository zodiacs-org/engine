// Evaluates chartDeclinations for the comparison scripts beside it.
//
// With { "jd_tt": [...] }, each Terrestrial Time instant is expressed as a UTC
// Date and a pinned ΔT that together give exactly that TT, so the engine and
// the reference are compared at one instant whatever ΔT model either would use.
// With { "utc": [...] }, each UTC instant is evaluated on the engine's own ΔT
// model, and the TT it used is reported.
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
  const result = engine.chartDeclinations(birth);
  return {
    jd_tt: jdTT ?? UNIX_EPOCH_JD + (birth.utc.getTime() + result.deltaT.seconds * 1000) / 86_400_000,
    trueObliquity: result.trueObliquity,
    // Before rc.14 there is no boundMarginArcsec; the same quantity is derived.
    rows: result.rows.map((row) => ({ body: row.body, lon: row.lon, lat: row.lat, dec: row.dec,
      margin: row.boundMarginArcsec ?? (Math.abs(row.dec) - result.trueObliquity) * 3600, flag: row.outOfBounds }))
  };
}

const instants = request.utc
  ? request.utc.map((utc) => evaluate({ utc: new Date(utc), timeKnown: false }))
  : request.jd_tt.map((jd) => {
    const ttMs = (jd - UNIX_EPOCH_JD) * 86_400_000;
    const utcMs = Math.floor(ttMs - PINNED_SECONDS * 1000);
    return evaluate({ utc: new Date(utcMs), deltaT: (ttMs - utcMs) / 1000, timeKnown: false }, jd);
  });
process.stdout.write(JSON.stringify({ version: engine.ENGINE_VERSION, instants }));
