/*
 * Tables for RESULTS.md from windows.json, results.jsonl and summary.json:
 * counts by latitude band, house system and window length, and the search's
 * run time by window length.
 *
 *   node summarize.mjs [DIR]   (DIR defaults to this directory)
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const dir = resolve(process.argv[2] ?? fileURLToPath(new URL(".", import.meta.url)));
const windows = JSON.parse(readFileSync(resolve(dir, "windows.json"), "utf8")).windows;
const results = readFileSync(resolve(dir, "results.jsonl"), "utf8").trim().split("\n").map((line) => JSON.parse(line));
const summary = JSON.parse(readFileSync(resolve(dir, "summary.json"), "utf8"));
const byId = new Map(windows.map((window) => [window.id, window]));

const band = (latitude) => {
  const a = Math.abs(latitude);
  return a <= 60 ? "0° to 60°" : a < 66 ? "60° to 66°" : a < 67 ? "66° to 67°" : "67° to 90°";
};
const length = (seconds) => (seconds <= 600 ? "≤ 10 min" : seconds <= 7200 ? "10 min – 2 h" : seconds <= 43200 ? "2 h – 12 h" : "12 h – 24 h");
const quantile = (values, q) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
};

function table(title, keyOf, order) {
  const groups = new Map();
  for (const result of results) {
    const key = keyOf(result, byId.get(result.id));
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(result);
  }
  const keys = order ?? [...groups.keys()].sort();
  const sum = (rows, field) => rows.reduce((total, row) => total + (row[field] ?? 0), 0);
  const lines = [
    `| ${title} | windows | passed | sampled transitions | matched | missed | extra | sub-second, confirmed | switches | disagreements |`,
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |"
  ];
  for (const key of keys) {
    const rows = groups.get(key) ?? [];
    lines.push(`| ${key} | ${rows.length} | ${rows.filter((row) => row.pass).length} | ${sum(rows, "sampledTransitions")} | ${sum(rows, "matched")} | ${sum(rows, "missed")} | ${sum(rows, "extra")} | ${sum(rows, "excursionsConfirmed")} | ${sum(rows, "switches")} | ${sum(rows, "sampleDisagreements")} |`);
  }
  return lines.join("\n");
}

const lengths = ["≤ 10 min", "10 min – 2 h", "2 h – 12 h", "12 h – 24 h"];
console.log(table("absolute latitude", (result) => band(result.latitude), ["0° to 60°", "60° to 66°", "66° to 67°", "67° to 90°"]));
console.log();
console.log(table("house system", (result) => result.houseSystem));
console.log();
console.log(table("length", (result) => length(result.seconds), lengths));
console.log();
console.log("| length | windows | search median | p90 | max | checker median |");
console.log("| --- | ---: | ---: | ---: | ---: | ---: |");
for (const key of lengths) {
  const rows = results.filter((result) => length(result.seconds) === key);
  const ms = rows.map((row) => row.finderMs);
  const checker = rows.map((row) => row.checkerMs / 1000);
  console.log(`| ${key} | ${rows.length} | ${quantile(ms, 0.5).toFixed(0)} ms | ${quantile(ms, 0.9).toFixed(0)} ms | ${Math.max(...ms).toFixed(0)} ms | ${quantile(checker, 0.5).toFixed(1)} s |`);
}
console.log();
console.log(JSON.stringify({ verdict: summary.verdict, windows: summary.windows, samples: summary.samples, millisecondChecks: summary.millisecondChecks, millisecondFailures: summary.millisecondFailures, boundExceeded: summary.boundExceeded.length, flags: results.reduce((counts, row) => { for (const flag of row.flags ?? []) counts[flag] = (counts[flag] ?? 0) + 1; return counts; }, {}) }));
