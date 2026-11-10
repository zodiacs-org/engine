import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { build } from "esbuild";

assert(process.argv.length === 2, "Usage: node directions/scripts/report-evidence.mjs");
assert(Number(process.versions.node.split(".")[0]) === 22, "Run the evidence report on Node 22.");
const project = fileURLToPath(new URL("..", import.meta.url));
const output = join(project, "generated", "m11");
await mkdir(output, { recursive: true });
const bundle = await build({
  absWorkingDir: project, entryPoints: ["evidence/m11-report.ts"], outfile: "build/m11-report.mjs",
  bundle: true, platform: "node", format: "esm", target: "node22.7", metafile: true, logLevel: "silent"
});
const sources = {};
for (const input of Object.keys(bundle.metafile.inputs).sort()) {
  sources[input] = createHash("sha256").update(await readFile(join(project, input))).digest("hex");
}
const { measureM11 } = await import(new URL("../build/m11-report.mjs", import.meta.url));
const result = measureM11();
const groups = new Map();
for (const row of result.numeric) {
  const key = `${row.group}/${row.quantity}`;
  if (!groups.has(key)) groups.set(key, {
    group: row.group, quantity: row.quantity, unit: row.unit, comparisons: 0, failures: 0,
    maximumAbsoluteResidual: 0, maximumAllowanceFraction: 0, worstCase: row.id
  });
  const summary = groups.get(key);
  summary.comparisons++;
  if (!row.passed) summary.failures++;
  const absoluteResidual = Math.abs(row.residual);
  if (absoluteResidual > summary.maximumAbsoluteResidual) {
    summary.maximumAbsoluteResidual = absoluteResidual;
    summary.worstCase = row.id;
  }
  if (row.allowance > 0) summary.maximumAllowanceFraction = Math.max(summary.maximumAllowanceFraction,
    absoluteResidual / row.allowance);
}
const summary = {
  milestone: "M11", basis: "independent-analytic-and-arithmetic-only", node: process.version,
  sources, inputCases: Object.fromEntries(Object.entries(result.inputs).map(([name, rows]) => [name, rows.length])),
  numericComparisons: result.numeric.length, refusalComparisons: result.refusals.length,
  numericFailures: result.numeric.filter(row => !row.passed).length,
  refusalFailures: result.refusals.filter(row => !row.passed).length,
  measurements: [...groups.values()]
};
// Raw generated data stays ignored and is split to respect the file limit.
// summary.json is the manifest: only the filenames it lists belong to this run.
const files = [];
async function save(name, data) {
  const json = `${JSON.stringify(data, null, 2)}\n`;
  assert(Buffer.byteLength(json) < 2_000_000, `Evidence file exceeds limit: ${name}`);
  await writeFile(join(output, name), json);
  files.push(name);
}
async function chunks(name, rows) {
  for (let start = 0; start < rows.length; start += 500) {
    await save(`${name}-${start / 500 + 1}.json`, rows.slice(start, start + 500));
  }
}
await chunks("numeric", result.numeric);
await chunks("refusals", result.refusals);
for (const [name, rows] of Object.entries(result.inputs)) await chunks(`inputs-${name}`, rows);
await save("summary.json", { ...summary, files: [...files] });
console.log(JSON.stringify(summary, null, 2));
assert(summary.numericFailures === 0 && summary.refusalFailures === 0, "M11 evidence comparison failed.");
