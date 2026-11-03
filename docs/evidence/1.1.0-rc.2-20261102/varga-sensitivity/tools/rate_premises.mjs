/*
 * Two premises of vargaSensitivity's rate bounds (src/vedic/varga-time.ts),
 * which the amendment "2026-11-03, review 1: two figures of the departures,
 * rounded the wrong way" of PREREGISTRATION.md (section 13) states:
 *
 * - The Sun's largest daily motion, a factor of the star definitions' bound
 *   of 0.021 degree a day. The engine's own longitude speed of the Sun
 *   (`longitudeSpeed` of the internal entry, the value the root's `positions`
 *   gives as `speed`, checked equal bit for bit at the largest; a central
 *   difference over ±0.001 day divided by the TT elapsed, so a leap second
 *   does not inflate it) is sampled every hour of UTC from 1800-01-01T00:00Z
 *   up to 2200-01-01T00:00Z. What the grid can miss between two samples is
 *   bounded, as docs/evidence/birth-window/rate-bounds.mjs bounds it, by half
 *   the largest change between neighbouring samples: the bound is the largest
 *   sample plus that half.
 * - The mean nodes' guard, which takes their leading rate within a relative
 *   1e-5: the size of the polynomial's higher terms' rate against its leading
 *   rate over the same span. The coefficients are read from src/points.ts
 *   (`const node = ...`, Simon et al. 1994, arcseconds and Julian centuries
 *   of TT) and checked against the built `lunarMeanArguments`; the rate's
 *   higher terms, 2 c2 T + 3 c3 T² + 4 c4 T³, are taken against c1 at the
 *   TT of each hour of the span, T from the time entry's `timeBasis`.
 *
 *   node rate_premises.mjs [--out FILE]
 *
 * Loads the build in the repository's dist/ (or ZODIACS_ENGINE_DIST): the
 * root, the internal entry and the time entry. One heavy job: about a minute
 * and a half on one core.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { ROOT, loadEngine, options } from "./load.mjs";

const args = options(process.argv.slice(2), ["--out"]);
const { root, version, jsDigest, dist } = await loadEngine();
const internal = await import(pathToFileURL(resolve(dist, "internal.js")).href);
const time = await import(pathToFileURL(resolve(dist, "time.js")).href);

const HOUR = 3_600_000;
const FROM = Date.UTC(1800, 0, 1);
const TO = Date.UTC(2200, 0, 1);
const SUN_STATED = 1.02;
const NODE_STATED = 4.31e-6;
const NODE_GUARD = 1e-5;

// The Sun.
let largest = -Infinity;
let largestAt = FROM;
let change = 0;
let changeAt = FROM;
let before = null;
let samples = 0;
for (let ms = FROM; ms < TO; ms += HOUR) {
  const speed = internal.longitudeSpeed("Sun", new Date(ms));
  samples += 1;
  if (speed > largest) [largest, largestAt] = [speed, ms];
  if (before !== null && Math.abs(speed - before) > change) [change, changeAt] = [Math.abs(speed - before), ms];
  before = speed;
}
const publicSpeed = root.positions(new Date(largestAt)).find((row) => row.body === "Sun").speed;
const sunBound = largest + change / 2;

// The mean node's polynomial.
const source = readFileSync(resolve(ROOT, "src/points.ts"), "utf8");
const line = /const node = ([-0-9.]+) \+ t \* \(([-0-9.]+) \+ t \* \(([-0-9.]+) \+ t \* \(([-0-9.]+) \+ t \* ([-0-9.]+)\)\)\);/u.exec(source);
if (!line) throw new Error("src/points.ts holds no `const node = ...` polynomial of the expected form");
const [c0, c1, c2, c3, c4] = line.slice(1).map(Number);
/** Degrees an arcsecond, as src/points.ts takes it: lunarMeanArguments gives degrees. */
const ARCSEC = 1 / 3600;
const polynomial = (t) => (c0 + t * (c1 + t * (c2 + t * (c3 + t * c4)))) * ARCSEC;
const checkpoints = [-2, -1, 0, 1, 2].map((t) => ({ t, built: root.lunarMeanArguments(t).node, fromSource: polynomial(t) }));
const sameAsBuilt = checkpoints.every(({ built, fromSource }) => Math.abs(built - fromSource) <= 1e-12 * Math.max(1, Math.abs(built)));
const higher = (t) => Math.abs(2 * c2 * t + 3 * c3 * t * t + 4 * c4 * t * t * t) / Math.abs(c1);
let nodeLargest = 0;
let nodeLargestT = 0;
for (let ms = FROM; ms <= TO; ms += HOUR) {
  const t = time.timeBasis(ms).ttDays / 36_525;
  const ratio = higher(t);
  if (ratio > nodeLargest) [nodeLargest, nodeLargestT] = [ratio, t];
}

const report = {
  tool: "docs/evidence/1.1.0-rc.2-20261102/varga-sensitivity/tools/rate_premises.mjs",
  engine: { version, jsDigest },
  node: process.version,
  platform: `${process.platform} ${process.arch}`,
  span: { from: new Date(FROM).toISOString(), to: new Date(TO).toISOString(), everyHours: 1, timeScale: "UTC" },
  sun: {
    what: "the Sun's longitude speed in the engine's own positions, degrees a day",
    samples,
    largest,
    largestAt: new Date(largestAt).toISOString(),
    positionsGivesTheSameAtTheLargest: Object.is(publicSpeed, largest),
    largestChangeBetweenNeighbours: change,
    largestChangeAt: new Date(changeAt).toISOString(),
    bound: sunBound,
    stated: SUN_STATED,
    holds: sunBound <= SUN_STATED,
    starRateBound: { deflectionPerRadianOfTheSun: 0.02015, product: 0.02015 * SUN_STATED, bound: 0.021, holds: 0.02015 * SUN_STATED < 0.021 }
  },
  meanNode: {
    what: "|2 c2 T + 3 c3 T² + 4 c4 T³| / |c1|, the polynomial's higher terms' rate against its leading rate, T Julian centuries of TT",
    coefficientsArcsec: { c0, c1, c2, c3, c4 },
    sameAsBuilt,
    checkpoints,
    largest: nodeLargest,
    largestAtT: nodeLargestT,
    stated: NODE_STATED,
    holds: nodeLargest < NODE_STATED,
    guard: NODE_GUARD,
    underTheGuard: nodeLargest < NODE_GUARD
  }
};
const text = `${JSON.stringify(report, null, 1)}\n`;
if (args.has("--out")) writeFileSync(resolve(String(args.get("--out"))), text);
process.stdout.write(text);
process.exitCode = report.sun.holds && report.sun.positionsGivesTheSameAtTheLargest && report.sun.starRateBound.holds &&
  report.meanNode.sameAsBuilt && report.meanNode.holds && report.meanNode.underTheGuard ? 0 : 1;
