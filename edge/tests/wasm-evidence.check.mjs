import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { summarizeSamples } from "../scripts/benchmark-core.mjs";
import { assessExperiment, experimentProtocol } from "../scripts/evaluate-wasm.mjs";
import { encode, sha256 } from "../scripts/build-wasm.mjs";

test("retained WASM experiment recomputes summaries and rejection from every timing sample", async () => {
  const report = JSON.parse(await readFile(new URL("../docs/evidence/m11-wasm-experiment.json", import.meta.url)));
  assert.equal(report.schema, "edge-wasm-experiment/1");
  assert.deepEqual(report.protocol, experimentProtocol);
  assert.equal(report.provenance.sourceDigest, sha256(encode(report.provenance.sources)));
  assert.equal(report.exact.kernel.comparisons, 16_784);
  assert.equal(report.exact.kernel.equal, true);
  assert.equal(report.exact.workloads.equal, true);
  assert.equal(report.exact.memory.initialBytes, report.exact.memory.finalBytes);
  for (const round of report.rounds) {
    for (const result of round.results) {
      assert.equal(result.iterations, report.protocol.iterations[result.id]);
      for (const kind of ["javascript", "wasm"]) {
        assert.equal(result.samplesNs[kind].length, report.protocol.samples);
        assert.equal(result.warmupNs[kind].length, report.protocol.warmupBatches);
        assert(result.warmupNs[kind].every((ns) => Number.isSafeInteger(ns) && ns > 0));
        assert.deepEqual(result[kind], summarizeSamples(result.samplesNs[kind], result.iterations));
      }
    }
  }
  assert.deepEqual(report.decision, assessExperiment(report.rounds, true));
  assert.equal(report.decision.status, "rejected");
  assert.equal(report.decision.productionEnabled, false);
  assert(Number.isSafeInteger(report.compilation.elapsedNs) && report.compilation.elapsedNs > 0);
  assert(Number.isSafeInteger(report.startup.validationModuleCompileNs) && report.startup.validationModuleCompileNs > 0);
  for (const sample of report.startup.samples) {
    for (const ns of Object.values(sample)) assert(Number.isSafeInteger(ns) && ns > 0);
  }
  // Historical measurement checks never require this machine to repeat a speed.
});

test("retained profile partitions samples and uses the same complete results as the experiment", async () => {
  const profile = JSON.parse(await readFile(new URL("../docs/evidence/m11-kernel-profile.json", import.meta.url)));
  const experiment = JSON.parse(await readFile(new URL("../docs/evidence/m11-wasm-experiment.json", import.meta.url)));
  assert.equal(profile.schema, "edge-kernel-profile/1");
  assert.equal(profile.provenance.sourceDigest, sha256(encode(profile.provenance.sources)));
  assert.equal(profile.exactResultSha256, experiment.exact.workloads.sha256);
  assert.deepEqual(profile.workloadSet, experiment.workloadSet.engine.map(({ id, inputs, unit }) => ({ id, unit, inputs })));
  for (const result of profile.results) {
    assert.equal(Object.values(result.selfSamplesByCategory).reduce((a, b) => a + b, 0), result.totalSamples);
    assert.equal(result.functions.reduce((total, row) => total + row.selfSamples, 0), result.totalSamples);
    for (const row of result.functions) {
      assert(row.selfSamples <= row.inclusiveSamples && row.inclusiveSamples <= result.totalSamples);
      assert(!row.source.startsWith("/"));
    }
  }
});
