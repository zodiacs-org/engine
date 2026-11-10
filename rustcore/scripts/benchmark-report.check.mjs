import assert from "node:assert/strict";
import { test } from "node:test";
import { combineReports, EXPECTED, markdownTable, summarizeCriterion, summarizeNode,
  summarizeSamples, validateBaseline, validateCoverage } from "./benchmark-report-lib.mjs";

const manifest = Object.entries(EXPECTED).map(([id, callsPerIteration]) => ({ id, callsPerIteration }));
const samples = Array.from({ length: 30 }, (_, i) => i + 1);
const rawNode = () => ({ settings: { samples: 30 }, measurements: manifest.map(row => ({ ...row,
  repeats: { typescript: 2, wasm: 3 }, samples: { typescript: samples.map(n => n * 2), wasm: samples } })) });
function nativeRows() {
  return manifest.map(row => ({ ...row, samples: 30,
    mean: { estimate: 10, lower: 9, upper: 11, confidence: 0.95, standardError: 0.5 },
    median: { estimate: 10, lower: 9, upper: 11, confidence: 0.95, standardError: 0.5 } }));
}
function reports() {
  const common = { machine: { cpu: "synthetic test CPU", arch: "test", os: "test", node: "v22" },
    sourceDigests: { "test.rs": "a".repeat(64) }, descriptor: { manifest } };
  return [
    { ...common, kind: "native", startedAt: "2026-01-01T00:00:00Z", completedAt: "2026-01-01T00:01:00Z", measurements: nativeRows() },
    { ...common, kind: "node", startedAt: "2026-01-01T00:01:00Z", completedAt: "2026-01-01T00:02:00Z", measurements: summarizeNode(rawNode()) }
  ];
}

test("summaries use interpolated quantiles and sample dispersion without mutating samples", () => {
  const input = [4, 1, 3, 2];
  const result = summarizeSamples(input, 4);
  assert.deepEqual(input, [4, 1, 3, 2]);
  assert.equal(result.median, 2.5);
  assert.equal(result.p25, 1.75);
  assert.equal(result.p75, 3.25);
  assert.equal(result.mean, 2.5);
  assert.equal(result.standardDeviation, Math.sqrt(5 / 3));
  for (const bad of [[1], [0, 1], [-1, 1], [Infinity, 1], [NaN, 1]])
    assert.throws(() => summarizeSamples(bad, 2));
});

test("a partial, duplicate, smoke or wrongly normalized corpus cannot become a baseline", () => {
  validateCoverage(manifest);
  assert.throws(() => validateCoverage(manifest.slice(1)));
  assert.throws(() => validateCoverage([...manifest, manifest[0]]));
  assert.throws(() => validateCoverage(manifest.map(row => ({ ...row, callsPerIteration: 1 }))));
  const raw = rawNode();
  assert(summarizeNode(raw).every(row => row.typescriptOverWasm === 2));
  raw.settings.samples = 2;
  assert.throws(() => summarizeNode(raw));
});

test("Criterion estimates and intervals are converted from corpus sweeps to API calls", () => {
  const benchmark = { full_id: "houses/placidus", throughput: { Elements: 63 } };
  const estimate = { point_estimate: 6300, standard_error: 63,
    confidence_interval: { lower_bound: 5670, upper_bound: 6930, confidence_level: 0.95 } };
  const sample = { iters: samples, times: samples.map(value => value * 6300) };
  const row = summarizeCriterion(benchmark, { mean: estimate, median: estimate }, sample);
  assert.deepEqual(row.median, { estimate: 100, lower: 90, upper: 110, confidence: 0.95, standardError: 1 });
  assert.throws(() => summarizeCriterion({ ...benchmark, full_id: "unknown" }, {}, sample));
  assert.throws(() => summarizeCriterion({ ...benchmark, throughput: { Elements: 1 } }, {}, sample));
  assert.throws(() => summarizeCriterion(benchmark, { mean: estimate, median: estimate }, { iters: [1], times: [1] }));
});

test("combination rejects different source snapshots, corpora, machines and overlapping runs", () => {
  const [native, node] = reports();
  validateBaseline(combineReports(native, node));
  for (const change of [
    { sourceDigests: { "test.rs": "b".repeat(64) } },
    { machine: { cpu: "different" } },
    { descriptor: { manifest: manifest.slice(1) } },
    { startedAt: "2026-01-01T00:00:30Z" },
    { startedAt: "2026-01-01T00:03:00Z" },
    { startedAt: "invalid" }
  ]) assert.throws(() => combineReports(native, { ...node, ...change }));
});

test("committed tables are derived from full-precision evidence and invalid summaries are refused", () => {
  const report = combineReports(...reports());
  assert(markdownTable(report).includes("| houses/placidus | 0.0100 [0.00900, 0.0110] | 0.0310 | 0.0155 | 2.00 |"));
  report.node.measurements[0].typescriptOverWasm = 3;
  assert.throws(() => validateBaseline(report));
});
