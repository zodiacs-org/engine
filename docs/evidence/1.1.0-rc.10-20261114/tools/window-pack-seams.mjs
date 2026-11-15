#!/usr/bin/env node
/*
 * The steps of the shipped DE440 pack's positions at its record boundaries,
 * which the birth-window search treats as seams (src/window.ts, sourceSteps).
 *
 * For every instant the pack's source lists (`steps`, @zodiacs/engine/de440)
 * from 1800-01-01 to 2200-01-01, and for each of the twelve bodies of a
 * chart, the engine's longitude 2 ms before and 2 ms after the instant, less
 * the motion over the 4 ms before that (the body's own motion, which a smooth
 * function repeats to far below the step): what is left is the step. Also,
 * as a control, the same difference of differences 1 s later, where no step
 * is listed.
 *
 *   node window-pack-seams.mjs [--out FILE]
 *
 * Loads the build in ../../../../dist; ZODIACS_ENGINE_DIST points it elsewhere.
 * Pins the engine's own output: it measures the steps, it is not accuracy
 * evidence.
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const dist = process.env.ZODIACS_ENGINE_DIST ?? resolve(here, "../../../../dist");
const load = (name) => import(pathToFileURL(resolve(dist, name)).href);
const { bodyLongitude } = await load("internal.js");
const engine = await load("index.js");
const { shippedDe440Source } = await load("de440-pack.js");
const { timeBasis } = await load("time.js");
const out = process.argv.includes("--out") ? resolve(process.argv[process.argv.indexOf("--out") + 1]) : resolve(here, "../results/window-pack-seams.json");

const DAY = 86_400_000;
const J2000 = Date.UTC(2000, 0, 1, 12);
const BODIES = ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto", "North Node", "South Node"];
const wrap = (d) => ((((d % 360) + 540) % 360) - 180);
const tt = (ms) => timeBasis(ms, "utc").ttDays;
/** The first UTC millisecond whose TT is at or past ttDays. */
function utcAt(ttDays) {
  let at = Math.round(J2000 + ttDays * DAY);
  at = Math.round(at + (ttDays - tt(at)) * DAY);
  while (tt(at) >= ttDays) at -= 1;
  while (tt(at) < ttDays) at += 1;
  return at;
}
if (engine.defaultEphemeris().name !== "de440" || !engine.defaultEphemeris().de440.opened) throw new Error("the default source is not the shipped pack");
const source = shippedDe440Source();
const from = (Date.UTC(1800, 0, 1) - J2000) / DAY;
const to = (Date.UTC(2200, 0, 1) - J2000) / DAY;
const largest = Object.fromEntries(BODIES.map((body) => [body, { step: 0, at: null, control: 0 }]));
let instants = 0;
// A year at a time, so that no list is long.
for (let start = from; start < to; start += 365.25) {
  for (const step of source.steps(start, Math.min(to, start + 365.25))) {
    // Past the IERS table's seams the time basis itself steps; those instants are the window's own seams already.
    const at = utcAt(step);
    if (Math.abs(tt(at + 1010) - tt(at - 10) - 1020 / DAY) > 1e-9) continue;
    instants += 1;
    for (const body of BODIES) {
      const lon = (ms) => bodyLongitude(body, new Date(ms));
      const across = wrap(lon(at + 2) - lon(at - 2));
      const before = wrap(lon(at - 2) - lon(at - 6));
      const control = wrap(lon(at + 1004) - lon(at + 1000)) - wrap(lon(at + 1000) - lon(at + 996));
      const row = largest[body];
      if (Math.abs(across - before) > row.step) Object.assign(row, { step: Math.abs(across - before), at: new Date(at).toISOString() });
      row.control = Math.max(row.control, Math.abs(control));
    }
  }
}
const summary = {
  what: "Largest step of the engine's longitude across an instant the shipped DE440 pack's source lists (steps), degrees: the change from 2 ms before to 2 ms after, less the change over the 4 ms before that. control: the same 1 s later, where no step is listed.",
  engine: engine.ENGINE_VERSION,
  pack: source.pack.sha256,
  span: { from: "1800-01-01T00:00:00.000Z", to: "2200-01-01T00:00:00.000Z" },
  instants,
  arcsecond: 1 / 3600,
  largest
};
writeFileSync(out, JSON.stringify(summary, null, 1) + "\n");
console.log(JSON.stringify(summary, null, 1));
