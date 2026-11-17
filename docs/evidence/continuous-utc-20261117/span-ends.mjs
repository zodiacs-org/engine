#!/usr/bin/env node
/*
 * The last UTC instant an installed engine accepts at the far end of its
 * spans, found by bisection to the millisecond:
 *
 *   node span-ends.mjs <package directory> > results/span-ends-<version>.json
 *
 * natalChart: the last UTC whose chart, speed samples included, lies inside
 * EPHEMERIS_SPAN (it throws RangeError past it). calc: the last UTC for which
 * calc({ body: "Sun", time }) has status "ok", inside CALC_SPAN on both UT1
 * and TT. Both on UTC input, with the engine's own ΔT.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const dir = process.argv[2];
if (!dir) throw new Error("usage: node span-ends.mjs <package directory>");
const version = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")).version;
const { natalChart } = await import(pathToFileURL(join(dir, "dist", "index.js")).href);
const { calc } = await import(pathToFileURL(join(dir, "dist", "calc.js")).href);

/** The last millisecond in [low, high) for which `ok` holds, given ok(low) and not ok(high). */
function last(ok, low, high) {
  if (!ok(low) || ok(high)) throw new Error("the bracket does not hold the end");
  while (high - low > 1) {
    const middle = low + Math.floor((high - low) / 2);
    if (ok(middle)) low = middle;
    else high = middle;
  }
  return new Date(low).toISOString();
}
const natalOk = (ms) => {
  try {
    natalChart({ utc: new Date(ms), latitude: 0, longitude: 0 });
    return true;
  } catch (error) {
    if (error instanceof RangeError) return false;
    throw error;
  }
};
const calcOk = (ms) => calc({ body: "Sun", time: new Date(ms).toISOString() }).status === "ok";
process.stdout.write(
  `${JSON.stringify(
    {
      engine: version,
      natalChartLastUtc: last(natalOk, Date.UTC(3998, 8, 2), Date.UTC(3998, 8, 4)),
      calcLastUtc: last(calcOk, Date.UTC(2199, 11, 31, 23), Date.UTC(2200, 0, 1, 1))
    },
    null,
    2
  )}\n`
);
