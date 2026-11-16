#!/usr/bin/env node
/*
 * ZOD-97, test T5 at the edge of the span, without Horizons: the part of
 * ../../edge-cases-1.1.0-20261116/tools/horizons-edge.mjs that needs no
 * Horizons response, copied so that its results are written here and not into
 * that folder. calc() must refuse outside the span; the root entry computes
 * there and must flag it, natalChart() on the chart and positions() on its
 * rows. The cases and the verdicts are that tool's, unchanged; each Y-i record
 * also says whether every row's flags equal the chart's.
 *
 *   npm run build
 *   node docs/evidence/positions-span-20261116/tools/span-edge.mjs
 *
 * The arbiter is the span's published definition: CALC_SPAN and
 * REFERENCE_SPAN, 1800-01-01T00:00Z up to 2200-01-01T00:00Z (docs/calc.md).
 * Writes ../results/span-edge.json, and exits non-zero unless every record
 * is "pass" or "flagged" (horizons-edge.mjs exits so only on "fail" or
 * "error").
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const here = resolve(new URL("..", import.meta.url).pathname);
const root = resolve(here, "../../..");
const distDir = process.env.ZODIACS_ENGINE_DIST ? resolve(process.env.ZODIACS_ENGINE_DIST) : resolve(root, "dist");
const load = (name) => import(pathToFileURL(resolve(distDir, name)).href);
const { calc } = await load("calc.js");
const { natalChart, positions, ENGINE_VERSION } = await load("index.js");

// T5, outside the span: calc() must refuse (horizons-edge.mjs's REFUSED).
const REFUSED = [
  ["Y-f", { jd: 2524593.5, scale: "tt" }, "2200-01-01 00:00 TT, the end, excluded"],
  ["Y-g", { jd: 2524594.0, scale: "tt" }, "2200-01-01 12:00 TT"],
  ["Y-h", { jd: 2378496.5, scale: "tt" }, "1800-01-01 00:00 TT (its UT1 is before the start)"],
  ["Y-j", "2199-12-31T23:59:00Z", "UTC inside the span, TT past its end"],
  ["Y-l", "2200-01-01T00:00:00Z", "the end by UTC"],
  ["Y-m", "1799-12-31T23:59:00Z", "a minute before the start by UTC"]
];
const records = [];
for (const [id, time, label] of REFUSED) {
  for (const body of ["Sun", "Moon"]) {
    const record = { test: "T5", id, body, instant: label };
    try {
      const result = calc({ body, time });
      record.engine = { status: result.status, reason: result.reason ?? null };
      record.verdict = result.status === "refused" && result.reason === "out-of-range" ? "pass" : "fail";
    } catch (error) {
      Object.assign(record, { verdict: "error", error: String(error?.message ?? error) });
    }
    records.push(record);
  }
}
for (const iso of ["2200-01-01T00:00:00Z", "2250-01-01T00:00:00Z", "1799-12-31T23:59:00Z"]) {
  const record = { test: "T5", id: "Y-i", instant: `${iso} through the root entry` };
  try {
    const chart = natalChart({ utc: new Date(iso) });
    const list = positions(new Date(iso));
    record.engine = {
      natalChartFlags: chart.flags,
      positionsReturns: `${list.length} positions`,
      positionsCarriesAFlag: "flags" in list || list.some((entry) => "flags" in entry || "flag" in entry),
      positionsEphemeris: [...new Set(list.map((entry) => entry.ephemeris))],
      positionsFlags: [...new Set(list.map((entry) => JSON.stringify(entry.flags ?? null)))].map((text) => JSON.parse(text)),
      everyRowFlagsAsTheChart: list.every((entry) => JSON.stringify(entry.flags) === JSON.stringify(chart.flags))
    };
    record.verdict = chart.flags.includes("outside-reference-span") ? (record.engine.positionsCarriesAFlag ? "flagged" : "flagged-by-natalChart-only") : "fail";
  } catch (error) {
    Object.assign(record, { verdict: "refused", engine: { threw: String(error?.message ?? error) } });
  }
  records.push(record);
}

const counts = {};
for (const record of records) counts[record.verdict] = (counts[record.verdict] ?? 0) + 1;
mkdirSync(resolve(here, "results"), { recursive: true });
writeFileSync(resolve(here, "results/span-edge.json"), `${JSON.stringify({ what: "ZOD-97 T5 at the span's edge, without Horizons", node: process.version, engineVersion: ENGINE_VERSION, counts, records }, null, 1)}\n`);
for (const record of records) console.log(`${record.verdict.padEnd(26)} ${record.id.padEnd(5)} ${(record.body ?? "").padEnd(5)} ${JSON.stringify(record.engine ?? record.error).slice(0, 200)}`);
console.log(JSON.stringify(counts));
if (records.some((record) => record.verdict !== "pass" && record.verdict !== "flagged")) process.exit(1);
