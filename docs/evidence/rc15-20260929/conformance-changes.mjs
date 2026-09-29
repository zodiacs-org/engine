// Every conformance verdict that differs between two results files, grouped by
// kind and change, with each kind's residual statistics before and after and
// the largest change of any residual per level and field. The files are
// conformance/results/zodiacs-engine.json as rc.14 committed it (main at
// b0ddb88) and as rc.15 regenerates it.
//
//   git show b0ddb88:conformance/results/zodiacs-engine.json > rc14.json
//   node conformance-changes.mjs rc14.json conformance/results/zodiacs-engine.json [out.json]
import { readFileSync, readdirSync, writeFileSync } from "node:fs";

const [beforePath, afterPath, out] = process.argv.slice(2);
const [before, after] = [beforePath, afterPath].map((path) => JSON.parse(readFileSync(path, "utf8")));
const byId = (doc) => new Map(doc.results.map((result) => [result.id, result]));
const A = byId(before);
const B = byId(after);
// Each vector's kind and tags, from the suite's vector files.
const vectors = new URL("../../../conformance/vectors/", import.meta.url);
const vectorOf = new Map();
for (const name of readdirSync(vectors).filter((file) => file.endsWith(".json"))) {
  for (const vector of JSON.parse(readFileSync(new URL(name, vectors), "utf8")).vectors) vectorOf.set(vector.id, vector);
}

const groups = {};
for (const [id, result] of A) {
  const next = B.get(id);
  const to = next?.verdict ?? "absent";
  if (result.verdict === to) continue;
  const vector = vectorOf.get(id);
  const tags = vector?.tags?.length ? ` [${vector.tags.join(", ")}]` : "";
  const key = `${vector?.kind ?? "unknown kind"}${tags}: ${result.verdict} -> ${to}`;
  (groups[key] ??= []).push(id);
}
for (const id of B.keys()) if (!A.has(id)) (groups["new vector"] ??= []).push(id);

const largest = {};
for (const [id, result] of A) {
  const next = B.get(id);
  if (!result.residual || !next?.residual) continue;
  for (const [field, value] of Object.entries(result.residual)) {
    const other = next.residual[field];
    if (typeof value !== "number" || typeof other !== "number") continue;
    const key = `${id.replace(/-\d+$/u, "")}:${field}`;
    largest[key] = Math.max(largest[key] ?? 0, Math.abs(value - other));
  }
}

const report = {
  before: { engine: before.engine ?? before.adapter ?? null, total: before.summary.total },
  after: { engine: after.engine ?? after.adapter ?? null, total: after.summary.total },
  changed: Object.values(groups).reduce((sum, ids) => sum + ids.length, 0),
  groups: Object.fromEntries(Object.entries(groups).map(([key, ids]) => [key, { count: ids.length, ids }])),
  residualsByKind: Object.fromEntries(Object.entries(after.summary.byKind).map(([kind, summary]) =>
    [kind, { before: before.summary.byKind?.[kind]?.residuals ?? null, after: summary.residuals ?? null }])),
  largestResidualChange: Object.fromEntries(Object.entries(largest).map(([key, value]) => [key, Number(value.toPrecision(3))]))
};
const text = `${JSON.stringify(report, null, 1)}\n`;
if (out) writeFileSync(out, text);
process.stdout.write(text);
