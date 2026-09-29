// The chart's Sun at every solstice in EPHEMERIS_SPAN: the June and December
// solstices of years 1 to 3997 and the June solstice of 3998 (the span runs
// from TT 0001-04-30T12:00 to 3998-09-03T12:00). For each, the engine's own
// solar latitude there, and whether chartDeclinations flags the Sun out of
// bounds. Each solstice is the engine's own, the instant its Sun crosses 90° or
// 270°. rc.13 has no span, so the same solstices are chosen for every build:
// those whose search window lies where the model ΔT clock is always inside the
// span, 0001-05-01T00:00Z to 3998-09-02T00:00Z.
//
// usage: node sun-span.mjs <label>=<path to dist/index.js> ...
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const LIMIT_ARCSEC = 3.6; // SUN_BOUND_LATITUDE, 0.001°
const at = (year, month, day) => { const date = new Date(Date.UTC(2000, month - 1, day)); date.setUTCFullYear(year); return date; };
const [SPAN_FROM, SPAN_TO] = [at(1, 5, 1), at(3998, 9, 2)];
const report = { runtime: process.version, builds: {} };
for (const argument of process.argv.slice(2)) {
  const [label, path] = argument.split("=");
  const engine = await import(pathToFileURL(resolve(path)).href);
  let scanned = 0;
  let flagged = 0;
  let beyondLimit = 0;
  let beyondLimitAndMargin = 0;
  const firstFlagged = [];
  const before2000 = { beyondLimit: 0, largestMarginArcsec: -Infinity };
  let last = null; // the last solstice in the span, June 3998
  const byMillennium = new Map();
  const inside = []; // years whose two solstices both have |lat| within the limit
  for (let year = 1; year <= 3998; year += 1) {
    let both = true;
    for (const [target, month] of [[90, 6], [270, 12]]) {
      const [from, to] = [at(year, month - 1, 1), at(year, month, 28)];
      if (from < SPAN_FROM || to > SPAN_TO) continue; // the December solstice of 3998
      const [crossing] = engine.findLongitudeCrossings("Sun", target, from, to);
      const result = engine.chartDeclinations({ utc: crossing.at, timeKnown: false });
      const sun = result.rows.find((row) => row.body === "Sun");
      const latArcsec = sun.lat * 3600;
      // Before rc.14 there is no boundMarginArcsec; the same quantity is derived.
      const margin = sun.boundMarginArcsec ?? (Math.abs(sun.dec) - result.trueObliquity) * 3600;
      scanned += 1;
      last = { utc: crossing.at.toISOString(), latArcsec: Number(latArcsec.toFixed(3)), marginArcsec: Number(margin.toFixed(3)), flagged: sun.outOfBounds };
      if (sun.outOfBounds) {
        flagged += 1;
        if (firstFlagged.length < 3) firstFlagged.push({ utc: crossing.at.toISOString(), latArcsec: Number(latArcsec.toFixed(3)), marginArcsec: Number(margin.toFixed(3)) });
      }
      if (Math.abs(latArcsec) > LIMIT_ARCSEC) {
        both = false;
        beyondLimit += 1;
        if (margin > 0) beyondLimitAndMargin += 1;
        if (year < 2000) {
          before2000.beyondLimit += 1;
          before2000.largestMarginArcsec = Math.max(before2000.largestMarginArcsec, margin);
        }
      }
      const millennium = `${Math.floor((year - 1) / 1000) * 1000 + 1}-${Math.floor((year - 1) / 1000) * 1000 + 1000}`;
      const bucket = byMillennium.get(millennium) ?? { min: Infinity, max: -Infinity };
      bucket.min = Math.min(bucket.min, latArcsec);
      bucket.max = Math.max(bucket.max, latArcsec);
      byMillennium.set(millennium, bucket);
    }
    if (both) inside.push(year);
  }
  // The longest run of consecutive years whose solstice latitudes are all within the limit.
  let run = { from: null, to: null, length: 0 };
  for (let index = 0, start = 0; index < inside.length; index += 1) {
    if (index > 0 && inside[index] !== inside[index - 1] + 1) start = index;
    if (index - start + 1 > run.length) run = { from: inside[start], to: inside[index], length: index - start + 1 };
  }
  report.builds[label] = {
    version: engine.ENGINE_VERSION,
    solsticesScanned: scanned,
    chartSunFlaggedOutOfBounds: flagged,
    firstFlagged,
    lastSolstice: last,
    latitudeBeyond3_6Arcsec: beyondLimit,
    latitudeBeyond3_6ArcsecWithPositiveMargin: beyondLimitAndMargin,
    before2000LatitudeBeyond3_6Arcsec: { solstices: before2000.beyondLimit, largestMarginArcsec: Number(before2000.largestMarginArcsec.toFixed(3)) },
    yearsWithinTheLimitAtBothSolstices: { longestRun: run },
    solarLatitudeArcsecByMillennium: Object.fromEntries([...byMillennium].map(([key, { min, max }]) => [key, [Number(min.toFixed(1)), Number(max.toFixed(1))]]))
  };
}
console.log(JSON.stringify(report, null, 2));
