// Compares runs of 1.0.0-rc.1's values battery (../../1.0.0-rc.1-20261006/tools/values.mjs)
// made on different runtimes with the first one given, line by line: which
// calls differ, and the largest absolute difference among their numbers. It
// prints JSON.
//
//   node compare-batteries.mjs <label>=<run.jsonl> <label>=<run.jsonl> ...
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const runs = process.argv.slice(2).map((arg) => {
  const at = arg.indexOf("=");
  const bytes = readFileSync(arg.slice(at + 1));
  return { label: arg.slice(0, at), sha256: createHash("sha256").update(bytes).digest("hex"), lines: bytes.toString("utf8").split("\n").filter(Boolean) };
});
const [reference, ...others] = runs;
function numbers(value, path, out) {
  if (typeof value === "number") out.set(path, value);
  else if (value && typeof value === "object") for (const [key, entry] of Object.entries(value)) numbers(entry, `${path}.${key}`, out);
  return out;
}
const report = { reference: { label: reference.label, sha256: reference.sha256, calls: reference.lines.length }, runs: [] };
for (const run of others) {
  const differing = [];
  for (let index = 0; index < reference.lines.length; index++) {
    if (run.lines[index] === reference.lines[index]) continue;
    const a = JSON.parse(reference.lines[index]);
    const b = JSON.parse(run.lines[index] ?? "null");
    const na = numbers(a, "", new Map());
    const nb = numbers(b ?? {}, "", new Map());
    let largest = 0;
    let structural = false;
    for (const [path, value] of na) {
      if (!nb.has(path)) { structural = true; continue; }
      const other = nb.get(path);
      if (Number.isFinite(value) && Number.isFinite(other)) largest = Math.max(largest, Math.abs(value - other));
      else if (!Object.is(value, other)) structural = true;
    }
    if (nb.size !== na.size) structural = true;
    differing.push({ line: index + 1, id: a?.id ?? null, largestAbsolute: largest, structural });
  }
  report.runs.push({ label: run.label, sha256: run.sha256, calls: run.lines.length, differingCalls: differing.length, largestAbsolute: differing.reduce((max, row) => Math.max(max, row.largestAbsolute), 0), anyStructural: differing.some((row) => row.structural), differing });
}
console.log(JSON.stringify(report, null, 1));
