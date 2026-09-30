/*
 * The 1,000-window check as run on the branch (../results.jsonl, the build of
 * 670db8a6) and as run again on 0.1.1-rc.16 after the nutation
 * (./results.jsonl): the totals of each, and every window whose counts
 * differ, field by field.
 *
 *   node compare-runs.mjs [out.json]   (out.json defaults to ./compare-runs.json)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const read = (file) =>
  readFileSync(resolve(here, file), "utf8").trim().split("\n").map((line) => JSON.parse(line));
const before = new Map(read("../results.jsonl").map((row) => [row.id, row]));
const after = new Map(read("results.jsonl").map((row) => [row.id, row]));
const windows = new Map(JSON.parse(readFileSync(resolve(here, "../windows.json"), "utf8")).windows.map((w) => [w.id, w]));

// The counts compare.mjs gives each window; timings are left out.
const FIELDS = [
  "pass", "cells", "samples", "sampledTransitions", "matched", "missed", "extra", "switches", "changes",
  "excursions", "excursionsConfirmed", "sampleDisagreements", "millisecondChecks", "millisecondFailures", "flags"
];
const differing = [];
for (const [id, a] of before) {
  const b = after.get(id);
  if (!b) {
    differing.push({ id, missing: "rc16" });
    continue;
  }
  const fields = {};
  for (const field of FIELDS) {
    if (JSON.stringify(a[field]) !== JSON.stringify(b[field])) fields[field] = [a[field], b[field]];
  }
  if (Object.keys(fields).length) {
    const w = windows.get(id);
    differing.push({ id, start: w.start, end: w.end, latitude: w.latitude, houseSystem: w.houseSystem, fields });
  }
}
const total = (rows, field) => [...rows.values()].reduce((sum, row) => sum + (typeof row[field] === "number" ? row[field] : 0), 0);
const totals = Object.fromEntries(
  ["cells", "samples", "sampledTransitions", "matched", "missed", "extra", "switches", "changes", "excursions", "excursionsConfirmed",
    "sampleDisagreements", "millisecondChecks", "millisecondFailures"].map((field) => [field, [total(before, field), total(after, field)]])
);
const report = {
  note: "[branch run on 670db8a6, rc16 run]; the window counts of compare.mjs, timings left out",
  windows: [before.size, after.size],
  passed: [[...before.values()].filter((r) => r.pass).length, [...after.values()].filter((r) => r.pass).length],
  totals,
  identical: before.size - differing.length,
  differing: differing.length,
  differingSince1972: differing.filter((row) => row.start >= "1972").length,
  rows: differing
};
const out = resolve(process.argv[2] ?? resolve(here, "compare-runs.json"));
writeFileSync(out, `${JSON.stringify(report, null, 1)}\n`);
console.log(JSON.stringify({ ...report, rows: undefined }, null, 1));
