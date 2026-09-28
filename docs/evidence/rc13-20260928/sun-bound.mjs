/**
 * The Sun at every solstice from 1800 to 2200, located with the package's own
 * longitude-crossing solver (no other ephemeris): how often its computed
 * declination lies beyond the true obliquity, and how often its row is
 * flagged out of bounds. Counts are computed, never assumed.
 *
 * Usage: node sun-bound.mjs /abs/package/dist/index.js [/abs/output.json]
 */
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const [entry, output] = process.argv.slice(2);
if (!entry) throw new Error("Usage: node sun-bound.mjs /abs/package/dist/index.js [/abs/output.json]");
const api = await import(pathToFileURL(entry).href);
const from = new Date("1800-01-01T00:00:00Z");
const to = new Date("2200-01-01T00:00:00Z");
const solstices = [90, 270]
  .flatMap((lon) => api.findLongitudeCrossings("Sun", lon, from, to, 5).map((crossing) => ({ lon, at: crossing.at })))
  .sort((a, b) => a.at - b.at);

let beyond = 0;
let sunFlagged = 0;
let maximumExcessArcsec = -Infinity;
let otherRowsChecked = 0;
let otherRowsDisagreeing = 0;
for (const { at } of solstices) {
  const result = api.chartDeclinations({ utc: at });
  for (const row of result.rows) {
    const excess = Math.abs(row.dec) - result.trueObliquity;
    if (row.body === "Sun") {
      if (excess > 0) beyond += 1;
      if (row.outOfBounds) sunFlagged += 1;
      maximumExcessArcsec = Math.max(maximumExcessArcsec, excess * 3600);
    } else {
      otherRowsChecked += 1;
      if (row.outOfBounds !== excess > 0) otherRowsDisagreeing += 1;
    }
  }
}
const report = {
  engineVersion: api.ENGINE_VERSION,
  runtime: process.version,
  window: [from.toISOString(), to.toISOString()],
  solstices: solstices.length,
  sunBeyondTrueObliquity: beyond,
  sunFlaggedOutOfBounds: sunFlagged,
  maximumSunExcessArcsec: Number(maximumExcessArcsec.toFixed(4)),
  otherRowsChecked,
  otherRowsDisagreeingWithStrictRule: otherRowsDisagreeing,
  method: "Solstice instants from findLongitudeCrossings('Sun', 90|270) at a 5-day step; chartDeclinations at each instant on the model ΔT clock."
};
if (output) writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
