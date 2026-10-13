import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { compactBaseline } from "../scripts/benchmark-baseline.mjs";

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
  // This checks retained evidence, not how fast the current machine runs.
  // Old build digests remain valid evidence after implementation changes.
});
