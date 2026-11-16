#!/usr/bin/env node
/*
 * ZOD-97 T4, the case PR 93 left open: below 90°, does the rising sign turn
 * half a circle in a moment, and does the chart say so?
 *
 *   npm run build
 *   node docs/evidence/polar-angles-20261116/tools/pole-ascendant.mjs [OUT.json]
 *
 * For each latitude, the root's natalChart() every minute from
 * 2021-06-21T00:00Z for one day (1,441 charts, longitude 0, whole sign
 * houses), north and south. A "turn" is a step of the ascendant by more than
 * 90° between two charts a minute apart. Just outside the polar circle the
 * ascendant moves fast but continuously (up to 76.6° in one minute at 66.5°
 * on this day, results/pole-ascendant.json), so the threshold separates a
 * jump from motion only inside it; the records keep the largest step at every
 * latitude so a reader can judge. The arbiter is geometry, not the engine:
 * the polar circle is where |latitude| >= 90° - ε, ε the true obliquity
 * of date (23.436° on this day), so turns can happen only there.
 *
 * A latitude passes if either no turn occurs, or every chart at that latitude
 * carries a flag that says the angles are inside the polar circle. It fails
 * if the ascendant turns and the charts are silent about it.
 *
 * It needs no network. ZODIACS_ENGINE_DIST names another build.
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(new URL("../../../../", import.meta.url).pathname);
const distDir = process.env.ZODIACS_ENGINE_DIST ? resolve(process.env.ZODIACS_ENGINE_DIST) : resolve(root, "dist");
const { natalChart, ENGINE_VERSION } = await import(pathToFileURL(resolve(distDir, "index.js")).href);

const LATITUDES = [60, 66, 66.5, 67, 70, 78.22, 89.99, 90];
const START = Date.UTC(2021, 5, 21);
const POLAR_FLAG = "polar-angles";
const step = (a, b) => Math.abs(((b - a + 540) % 360) - 180);

const records = [];
for (const sign of [1, -1]) {
  for (const lat of LATITUDES) {
    const latitude = sign * lat;
    let turns = 0;
    let largestStep = 0;
    let previous = null;
    const flagSets = new Set();
    let chartsWithFlag = 0;
    const turnsAt = [];
    for (let minute = 0; minute <= 1440; minute += 1) {
      const utc = new Date(START + minute * 60000);
      const chart = natalChart({ utc, latitude, longitude: 0, houseSystem: "whole" });
      const asc = chart.angles.asc;
      flagSets.add(JSON.stringify(chart.flags));
      if (chart.flags.includes(POLAR_FLAG)) chartsWithFlag += 1;
      if (previous !== null) {
        const s = step(previous, asc);
        largestStep = Math.max(largestStep, s);
        if (s > 90) {
          turns += 1;
          if (turnsAt.length < 4) turnsAt.push(utc.toISOString());
        }
      }
      previous = asc;
    }
    const silent = turns > 0 && chartsWithFlag < 1441;
    records.push({
      latitude,
      charts: 1441,
      turns,
      turnsAt,
      largestStepDegrees: Number(largestStep.toFixed(4)),
      chartsWithPolarFlag: chartsWithFlag,
      flagSets: [...flagSets].map((s) => JSON.parse(s)),
      verdict: silent ? "fail" : "pass"
    });
    console.log(`${silent ? "fail" : "pass"}  ${String(latitude).padStart(7)}°  turns ${turns}  largest step ${largestStep.toFixed(3)}°  flagged ${chartsWithFlag}/1441  flags ${[...flagSets].join(" ")}`);
  }
}
const counts = records.reduce((c, r) => ((c[r.verdict] = (c[r.verdict] ?? 0) + 1), c), {});
const out = { what: "The ascendant every minute for a day at high latitudes, and whether each chart carries polar-angles", engineVersion: ENGINE_VERSION, node: process.version, start: new Date(START).toISOString(), polarFlag: POLAR_FLAG, counts, records };
if (process.argv[2]) writeFileSync(process.argv[2], `${JSON.stringify(out, null, 1)}\n`);
console.log(JSON.stringify(counts));
process.exitCode = counts.fail ? 1 : 0;
