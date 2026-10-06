// The engine's side of the comparison: calc()'s mean ayanamsa for a caller's
// ayanamsa carried by precession from epochs across EPHEMERIS_SPAN, at TT
// instants across CALC_SPAN, and at 0.001 day of TT either side of each, the
// step of calc's speeds: for each, the Julian date asked for, the TT Julian
// date calc's receipt says it used and the mean ayanamsa. Writes JSON to stdout:
//
//   npm run build
//   node docs/evidence/calc-epochs-2026-10-06/tools/engine_epochs.mjs > /tmp/engine.json
//
// Run from the engine's root. Every number is written as JavaScript prints a
// double, which reads back as the same double, so the reference tool compares
// the engine's own binary values. The rows (about 11 MB) are not committed:
// they rebuild in about a minute, the same on every run.
import { calc } from "../../../../dist/calc.js";

const J2000 = 2_451_545;
const STEP = 0.001;
const MODELS = ["engine", "newcomb", "iau1976"];
const VALUES = [-359.9, -180, -23.85, 0, 23.85, 180, 359.9];
/** EPHEMERIS_SPAN, in days of TT from J2000.0, the ends included. */
const FAR = 730_000;
/** CALC_SPAN's ends as TT Julian dates: 1800-01-01 and 2200-01-01, read on TT. */
const SPAN = [2_378_496.5, 2_524_593.5];

// Epochs: both ends of EPHEMERIS_SPAN, every 7,300 days (about 20 years)
// between, and at and just short of CALC_SPAN's ends, where the band changes.
const epochs = new Set();
for (let day = -FAR; day <= FAR; day += 7_300) epochs.add(J2000 + day);
for (const jd of [J2000 - FAR, J2000 + FAR, SPAN[0], SPAN[0] - 1e-6, SPAN[1], SPAN[1] - 1e-6, J2000]) epochs.add(jd);

// Instants: TT Julian dates across CALC_SPAN, about every 25 years, kept 0.002 day inside its ends.
const instants = [];
for (let k = 0; k <= 16; k += 1) instants.push(SPAN[0] + 0.002 + k * 9_131.0625);
instants[instants.length - 1] = SPAN[1] - 0.002;

function mean(model, value, epochTT, jd) {
  const result = calc({
    body: "Sun",
    time: { jd, scale: "tt" },
    zodiac: { sidereal: { epoch: { jd: epochTT, scale: "tt" }, value, model } },
    flags: { speeds: false }
  });
  if (result.status !== "ok") throw new Error(`calc refused ${model} ${value} ${epochTT} at ${jd}: ${result.reason}`);
  const [used] = result.receipt.instants;
  return [used.jdTt, result.ayanamsa.mean];
}

const rows = [];
for (const model of MODELS) {
  for (const value of VALUES) {
    for (const epochTT of [...epochs].sort((a, b) => a - b)) {
      for (const jd of instants) {
        const [t, m] = mean(model, value, epochTT, jd);
        const [tPlus, mPlus] = mean(model, value, epochTT, jd + STEP);
        const [tMinus, mMinus] = mean(model, value, epochTT, jd - STEP);
        rows.push([model, value, epochTT, jd, t, m, tPlus, mPlus, tMinus, mMinus]);
      }
    }
  }
}
process.stdout.write(`${JSON.stringify({
  generator: "docs/evidence/calc-epochs-2026-10-06/tools/engine_epochs.mjs",
  columns: ["model", "value", "epochTT", "jd", "jdTT", "mean", "jdTTPlus", "meanPlus", "jdTTMinus", "meanMinus"],
  rows
})}\n`);
