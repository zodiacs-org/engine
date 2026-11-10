import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { compactBaseline, validateBenchmarkBaseline } from "../scripts/benchmark-baseline.mjs";
import { gateFromFiles } from "../scripts/benchmark-gate.mjs";

test("committed Node baseline retains sufficient data to verify every summary and identity", async () => {
  const baseline = JSON.parse(await readFile(new URL("../docs/evidence/m9-node-baseline.json", import.meta.url), "utf8"));
  const { protocol, provenance, workloadSet, exactResultSha256 } = baseline;
  const entries = baseline.runs.map(({ startedAt, completedAt, rawSha256, results }) => ({
    rawSha256,
    report: {
      schema: "edge-benchmark-run/1", startedAt, completedAt,
      protocol, provenance, workloadSet, exactResultSha256,
      results: results.map(({ id, iterationsPerSample, warmup, checksum, samples, summary }) => ({
        id, iterationsPerSample, warmup, summary,
        samples: samples.map((elapsedNs) => ({ elapsedNs, checksum }))
      }))
    }
  }));
  assert.deepEqual(compactBaseline(entries), baseline);
  assert.equal(validateBenchmarkBaseline(baseline), baseline);
  // This checks retained evidence, not how fast the current machine runs.
  // Old build digests remain valid evidence after implementation changes.
});

test("committed M10 gate evidence reproduces from retained candidate and baseline samples", async () => {
  const baseline = fileURLToPath(new URL("../docs/evidence/m9-node-baseline.json", import.meta.url));
  const candidate = fileURLToPath(new URL("../docs/evidence/m10-node-candidate.json", import.meta.url));
  const recorded = JSON.parse(await readFile(new URL("../docs/evidence/m10-performance-gate.json", import.meta.url), "utf8"));
  assert.deepEqual(await gateFromFiles({ baseline, candidate, thresholdPercent: "10" }), recorded);
  assert.equal(recorded.status, "regression");
  assert.deepEqual(recorded.results.map(({ id, status }) => [id, status]),
    [["chart", "regression"], ["houses", "pass"], ["transit-scan", "pass"]]);
  assert.equal(recorded.baseline.workloadBundleSha256, recorded.candidate.workloadBundleSha256,
    "The retained timing regression was observed with identical workload bundle bytes.");
  // Recompute old measurements; never require today's host to repeat a speed.
});
