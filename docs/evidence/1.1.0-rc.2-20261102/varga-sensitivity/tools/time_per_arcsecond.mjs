/*
 * G-V5 (PREREGISTRATION.md, section 8): how far an error in a body's longitude
 * moves the instants vargaSensitivity gives for it. A change happens where the
 * longitude crosses a boundary, so an error of e in the longitude moves the
 * instant by e divided by the body's rate. The bodies' instants are stated with
 * this, not judged.
 *
 *   node time_per_arcsecond.mjs [--out FILE] [--table] [--check] [--docs FILE]
 *
 * For each of the ten bodies, the engine's own longitude speed (the root's
 * `positions`, degrees a day) every 5 days from 1800-01-01 to 2199-12-27 UTC,
 * and the time 1″ moves an instant at the median |speed| and at its 10th
 * percentile, rounded up to two significant figures, since a smaller figure
 * would say more for the engine. Near a station the speed falls to zero and the
 * time grows without limit; the smallest sampled |speed| is reported. The mean
 * nodes' rows are left out: their longitudes come from a polynomial, not the
 * ephemeris. --table prints the table docs/vedic.md holds between the lines
 * "<!-- G-V5 table, tools/time_per_arcsecond.mjs -->" and "<!-- end of the
 * G-V5 table -->"; --check recomputes it and exits 1 unless that table is the
 * same (the control: one figure there changed by hand must fail). --docs names
 * the file to check (default docs/vedic.md). Load the package as load.mjs says.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { ROOT, loadEngine, options } from "./load.mjs";

const args = options(process.argv.slice(2), ["--out", "--table", "--check", "--docs"]);
const BODIES = ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"];
const STEP_DAYS = 5;
const FROM = Date.UTC(1800, 0, 1);
const TO = Date.UTC(2200, 0, 1);
const OPEN = "<!-- G-V5 table, tools/time_per_arcsecond.mjs -->";
const CLOSE = "<!-- end of the G-V5 table -->";

/** Seconds that 1″ moves an instant at `speed` degrees a day. */
const secondsPerArcsecond = (speed) => (1 / 3600 / speed) * 86_400;

/** Up to two significant figures, rounded up, in seconds, minutes, hours or days. */
function figure(seconds) {
  const units = [["s", 1], ["min", 60], ["h", 3600], ["d", 86_400]];
  let [unit, size] = units[0];
  for (const [name, value] of units) if (seconds >= value) [unit, size] = [name, value];
  const value = seconds / size;
  const scale = 10 ** (1 - Math.floor(Math.log10(value)));
  return `${Math.ceil(value * scale - 1e-9) / scale} ${unit}`;
}

const { root, version, jsDigest } = await loadEngine();
const speeds = Object.fromEntries(BODIES.map((body) => [body, []]));
for (let ms = FROM; ms < TO; ms += STEP_DAYS * 86_400_000) {
  for (const row of root.positions(new Date(ms))) if (row.body in speeds) speeds[row.body].push(Math.abs(row.speed));
}
const rows = BODIES.map((body) => {
  const sorted = speeds[body].sort((a, b) => a - b);
  const quantile = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  const median = quantile(0.5);
  const tenth = quantile(0.1);
  return {
    body,
    samples: sorted.length,
    medianSpeed: median,
    tenthPercentileSpeed: tenth,
    smallestSpeed: sorted[0],
    secondsAtMedian: secondsPerArcsecond(median),
    secondsAtTenthPercentile: secondsPerArcsecond(tenth),
    atMedian: figure(secondsPerArcsecond(median)),
    atTenthPercentile: figure(secondsPerArcsecond(tenth))
  };
});
const table = [
  OPEN,
  "| Body | 1″ moves an instant by, at the median speed | at the 10th percentile speed |",
  "| --- | ---: | ---: |",
  ...rows.map((row) => `| ${row.body} | ${row.atMedian} | ${row.atTenthPercentile} |`),
  CLOSE
].join("\n");
const report = {
  tool: "docs/evidence/1.1.0-rc.2-20261102/varga-sensitivity/tools/time_per_arcsecond.mjs",
  engine: { version, jsDigest },
  node: process.version,
  platform: `${process.platform} ${process.arch}`,
  sampled: { from: new Date(FROM).toISOString(), to: new Date(TO).toISOString(), everyDays: STEP_DAYS, timeScale: "UTC" },
  rows,
  table
};
if (args.has("--out")) writeFileSync(resolve(String(args.get("--out"))), JSON.stringify(report, null, 1) + "\n");
if (args.has("--table")) console.log(table);
if (args.has("--check")) {
  const docs = resolve(String(args.get("--docs") ?? resolve(ROOT, "docs/vedic.md")));
  const text = readFileSync(docs, "utf8");
  const start = text.indexOf(OPEN);
  const end = text.indexOf(CLOSE);
  const found = start >= 0 && end > start ? text.slice(start, end + CLOSE.length) : null;
  if (found !== table) {
    console.error(found === null ? `${docs} holds no G-V5 table.` : `${docs}'s G-V5 table differs from the recomputed one:\n${table}`);
    process.exit(1);
  }
  console.log(`${docs}'s G-V5 table matches the recomputed one.`);
}
if (!args.has("--table") && !args.has("--check")) console.log(JSON.stringify(rows.map(({ body, atMedian, atTenthPercentile }) => ({ body, atMedian, atTenthPercentile }))));
