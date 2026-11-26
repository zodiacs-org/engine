// Compares a conformance run on this build with the committed results it is
// checked against, vector by vector, and prints the L1 summary README.md and
// docs/comparison.md quote:
//
//   node conformance/harness/run.mjs --adapter "node conformance/adapters/zodiacs-engine.mjs" --out RUN.json
//   node docs/evidence/3.0.0-readme-20261126/compare-conformance.mjs RUN.json conformance/results/zodiacs-engine.json
//
// (and the same with `--ephemeris astronomy-engine` against
// conformance/results/zodiacs-engine-astronomy-engine.json). It prints one
// JSON object: the run's totals, how many vectors have the same verdict and
// the same residuals as the committed file, and the L1 residual summary.
import { readFileSync } from "node:fs";

const [runPath, committedPath] = process.argv.slice(2);
if (!runPath || !committedPath) throw new Error("usage: compare-conformance.mjs RUN.json COMMITTED.json");
const run = JSON.parse(readFileSync(runPath, "utf8"));
const committed = JSON.parse(readFileSync(committedPath, "utf8"));
const byId = new Map(committed.results.map((result) => [result.id, result]));
let sameVerdict = 0;
let sameResiduals = 0;
for (const result of run.results) {
  const other = byId.get(result.id);
  if (other?.verdict === result.verdict) sameVerdict += 1;
  if (other && JSON.stringify(other.residuals ?? null) === JSON.stringify(result.residuals ?? null)) sameResiduals += 1;
}
const l1 = run.summary.byKind["position.apparent.ecliptic-true-of-date"];
console.log(
  JSON.stringify(
    {
      run: runPath.split("/").pop(),
      committed: committedPath,
      adapterEngineVersion: run.adapter.engineVersion,
      total: run.summary.total,
      vectors: run.results.length,
      committedVectors: committed.results.length,
      sameVerdict,
      sameResiduals,
      configurationDiffers: Object.keys(run.adapter.configuration).filter(
        (key) => run.adapter.configuration[key] !== committed.adapter.configuration[key]
      ),
      l1: { pass: l1.pass, fail: l1.fail, unsupported: l1.unsupported, lon: l1.residuals.lon, lat: l1.residuals.lat }
    },
    null,
    2
  )
);
