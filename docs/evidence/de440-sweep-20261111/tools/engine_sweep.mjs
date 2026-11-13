#!/usr/bin/env node
/*
 * The engine's side of the dense DE440 sweep (../PLAN.md): calc() from the
 * built dist/calc.js at every daily instant of one era, geocentric, in all
 * eight frames, for the Sun, the Moon and Mercury to Pluto with each of the
 * three corrections, and for the true node and its opposite point.
 *
 *   npm run build
 *   node docs/evidence/de440-sweep-20261111/tools/engine_sweep.mjs \
 *     --from-year 1800 --to-year 1850 --out engine-1800.bin
 *
 * Instant i is the TT Julian date 2378497.0 + i (noon TT of the day i days
 * after 1800-01-01), i = 0 ... 146096; an era takes the days from 1 January
 * of its first year up to, not including, 1 January of its last. The values
 * are written as little-endian float64 to --out, in the order
 * case, frame, instant, [lon, lat, dist, lon rate, lat rate] (degrees, au,
 * degrees a day; NaN where the engine gives none), and what was run as JSON
 * to --out with ".json" added. ZODIACS_ENGINE_DIST names another build.
 */
import { createHash } from "node:crypto";
import { closeSync, openSync, readFileSync, readdirSync, writeFileSync, writeSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, word, i, all) => (word.startsWith("--") ? [...pairs, [word.slice(2), all[i + 1]]] : pairs), []));
const fromYear = Number(args["from-year"]);
const toYear = Number(args["to-year"]);
const limit = args.limit === undefined ? Infinity : Number(args.limit);
if (!Number.isInteger(fromYear) || !Number.isInteger(toYear) || fromYear < 1800 || toYear > 2200 || toYear <= fromYear || !args.out) {
  throw new Error("usage: engine_sweep.mjs --from-year Y --to-year Y --out FILE [--limit N]");
}

const distDir = process.env.ZODIACS_ENGINE_DIST ? resolve(process.env.ZODIACS_ENGINE_DIST) : resolve(new URL("../../../../dist/", import.meta.url).pathname);
const { calc, CALC_FRAMES } = await import(pathToFileURL(`${distDir}/calc.js`).href);

const FIRST_JD = 2378497.0;
const TOTAL = 146097;
const DAY_MS = 86_400_000;
const dayIndex = (year) => Math.round((Date.UTC(year, 0, 1) - Date.UTC(1800, 0, 1)) / DAY_MS);
if (dayIndex(2200) !== TOTAL) throw new Error("1800 to 2200 is not 146,097 days");
const start = dayIndex(fromYear);
const count = Math.min(dayIndex(toYear) - start, limit);

const BODIES = ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"];
const CORRECTIONS = ["geometric", "astrometric", "apparent"];
const POINTS = ["North Node", "South Node"];
const cases = [
  ...CORRECTIONS.flatMap((correction) => BODIES.map((body) => ({ correction, body }))),
  ...POINTS.map((body) => ({ correction: "apparent", body }))
];
const FIELDS = 5;
const block = count * FIELDS;
const values = new Float64Array(cases.length * CALC_FRAMES.length * block).fill(NaN);

let engine = null;
const started = Date.now();
for (const [c, { correction, body }] of cases.entries()) {
  for (let i = 0; i < count; i += 1) {
    const jd = FIRST_JD + start + i;
    for (const [f, frame] of CALC_FRAMES.entries()) {
      const result = calc({ body, time: { jd, scale: "tt" }, frame, center: "geocentric", flags: { correction } });
      if (result.status !== "ok") throw new Error(`refused: ${body} ${correction} ${frame} ${jd}: ${result.reason}`);
      if (result.receipt.instants[0].jdTt !== jd) throw new Error(`${jd}: the engine ran at ${result.receipt.instants[0].jdTt}`);
      engine ??= result.receipt.engine;
      const at = (c * CALC_FRAMES.length + f) * block + i * FIELDS;
      values[at] = result.lon;
      values[at + 1] = result.lat;
      values[at + 2] = result.dist ?? NaN;
      // The nodes' rates are not compared (../PLAN.md).
      if (result.speeds && !POINTS.includes(body)) {
        values[at + 3] = result.speeds.lon;
        values[at + 4] = result.speeds.lat;
      }
    }
  }
}

const fd = openSync(args.out, "w");
const bytes = new Uint8Array(values.buffer);
for (let offset = 0; offset < bytes.length; offset += 1 << 26) writeSync(fd, bytes, offset, Math.min(1 << 26, bytes.length - offset));
closeSync(fd);

// The build that was run: the SHA-256 of "<digest>  <name>" lines of dist/'s files, sorted by name.
const names = readdirSync(distDir, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => resolve(entry.parentPath ?? entry.path, entry.name).slice(distDir.length + 1))
  .sort();
const distDigest = createHash("sha256")
  .update(names.map((name) => `${createHash("sha256").update(readFileSync(resolve(distDir, name))).digest("hex")}  ${name}\n`).join(""))
  .digest("hex");

writeFileSync(
  `${args.out}.json`,
  `${JSON.stringify({
    engine,
    distSha256: distDigest,
    node: process.version,
    fromYear,
    toYear,
    firstJdTt: FIRST_JD + start,
    startIndex: start,
    count,
    frames: CALC_FRAMES,
    cases,
    fields: ["lon", "lat", "dist", "lonRate", "latRate"],
    valuesSha256: createHash("sha256").update(bytes).digest("hex"),
    seconds: Math.round((Date.now() - started) / 1000)
  })}\n`
);
console.log(`engine sweep ${fromYear} to ${toYear}: ${count} instants from JD ${FIRST_JD + start} TT, ${cases.length} cases, ${CALC_FRAMES.length} frames, ${Math.round((Date.now() - started) / 1000)} s`);
