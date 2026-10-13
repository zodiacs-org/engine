import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { sha256, summarize } from "../benchmark/model.js";
import type { Sample } from "../benchmark/model.js";
import { renderReport } from "../benchmark/render.js";
import { validateJob } from "../src/validation.js";

interface RecordedSample extends Sample {
  jobElapsedMs: number[];
  wallMs: number;
  warmupMs: number;
  warmupRows: number;
  maxObservedFileBytes: number;
  verifiedNdjsonBytes: number;
  serialNdjsonSha256: string;
}

interface Evidence {
  schemaVersion: number;
  profile: string;
  complete: boolean;
  startedAt: string;
  finishedAt: string;
  identity: {
    gitHead: string;
    sources: { path: string; sha256: string }[];
    sourceManifestSha256: string;
    bundles: { name: string; sha256: string }[];
  };
  method: {
    settings: { workers: number[]; repetitions: number; jobsPerSample: number; warmupRounds: number };
    plannedSamples: number;
    fileLimitBytes: number;
  };
  workloads: {
    kind: string; spec: unknown; specSha256: string; totalRows: number;
    ndjsonBytes: number; maxRowBytes: number; serialNdjsonSha256: string;
  }[];
  samples: RecordedSample[];
  summary: ReturnType<typeof summarize>;
}

const filename = "scaling-20261013.json";
const encoded = readFileSync(new URL(`../docs/evidence/${filename}`, import.meta.url), "utf8");
const evidence = JSON.parse(encoded) as Evidence;

describe("committed scaling observation integrity", () => {
  it("binds the recorded manifest and synthetic workload definitions without claiming a current measurement", () => {
    expect(Buffer.byteLength(encoded)).toBeLessThan(2_000_000);
    expect(evidence.schemaVersion).toBe(1);
    expect(evidence.profile).toBe("scaling");
    expect(evidence.complete).toBe(true);
    expect(Date.parse(evidence.finishedAt)).toBeGreaterThan(Date.parse(evidence.startedAt));
    expect(evidence.identity.gitHead).toMatch(/^[a-f0-9]{40}$/);
    expect(evidence.identity.sourceManifestSha256).toBe(sha256(JSON.stringify(evidence.identity.sources)));
    expect(new Set(evidence.identity.sources.map(({ path }) => path)).size).toBe(evidence.identity.sources.length);
    for (const source of evidence.identity.sources) {
      expect(source.path).not.toMatch(/^(?:\/|\.\.)/);
      expect(source.sha256).toMatch(/^[a-f0-9]{64}$/);
    }
    expect(evidence.identity.bundles.map(({ name }) => name)).toEqual(["runner.js", "worker-entry.js"]);
    for (const bundle of evidence.identity.bundles) expect(bundle.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(evidence.workloads.map(({ kind }) => kind)).toEqual(["charts", "transit-grid", "synastry-matrix"]);
    for (const workload of evidence.workloads) {
      const job = validateJob(workload.spec);
      expect(workload.specSha256).toBe(sha256(JSON.stringify(job.spec)));
      expect(workload.totalRows).toBe(job.totalTasks);
      expect(workload.maxRowBytes).toBeLessThanOrEqual(workload.ndjsonBytes);
      expect(workload.ndjsonBytes).toBeLessThan(evidence.method.fileLimitBytes);
      expect(workload.serialNdjsonSha256).toMatch(/^[a-f0-9]{64}$/);
      const people = job.spec.kind === "synastry-matrix" ? job.spec.people : job.spec.births;
      expect(people.every(({ id }) => id.startsWith("synthetic-benchmark-"))).toBe(true);
    }
    // Historical observations stay attached to their own source/runtime hashes.
    // Re-running astronomy on a later runtime would not verify those past bytes.
  });

  it("accounts for every planned combination, elapsed interval, committed row and failure", () => {
    const { workers, repetitions, jobsPerSample, warmupRounds } = evidence.method.settings;
    expect(workers).toEqual([1, 2, 4, 8]);
    expect(repetitions).toBe(3);
    expect(jobsPerSample).toBe(16);
    expect(evidence.method.fileLimitBytes).toBe(2_000_000);
    const combinations = new Set<string>();
    for (const backend of ["memory", "sqlite"]) for (const workload of evidence.workloads) {
      for (const count of workers) for (let repetition = 0; repetition < repetitions; repetition++) {
        combinations.add(`${backend}/${workload.kind}/${count}/${repetition}`);
      }
    }
    expect(evidence.method.plannedSamples).toBe(combinations.size);
    expect(evidence.samples).toHaveLength(combinations.size);
    for (const sample of evidence.samples) {
      expect(combinations.delete(`${sample.backend}/${sample.workload}/${sample.workers}/${sample.repetition}`)).toBe(true);
      const workload = evidence.workloads.find(({ kind }) => kind === sample.workload)!;
      expect(sample).toMatchObject({ status: "ok", failureCount: 0, error: null,
        jobsCompleted: jobsPerSample, claimCount: jobsPerSample, counterScope: "acknowledged-snapshots" });
      expect(sample.completedRows).toBe(workload.totalRows * jobsPerSample);
      expect(sample.jobElapsedMs).toHaveLength(jobsPerSample);
      expect(sample.jobElapsedMs.every((duration) => Number.isFinite(duration) && duration > 0)).toBe(true);
      expect(sample.elapsedMs).toBe(sample.jobElapsedMs.reduce((sum, duration) => sum + duration, 0));
      expect(sample.rowsPerSecond).toBe(sample.completedRows * 1_000 / sample.elapsedMs!);
      expect(sample.wallMs).toBeGreaterThanOrEqual(sample.elapsedMs! + sample.warmupMs);
      expect(sample.warmupMs).toBeGreaterThan(0);
      expect(sample.warmupRows).toBe(warmupRounds * sample.workers);
      expect(sample.maxObservedFileBytes).toBeGreaterThanOrEqual(0);
      expect(sample.maxObservedFileBytes).toBeLessThan(evidence.method.fileLimitBytes);
      expect(sample.verifiedNdjsonBytes).toBe(workload.ndjsonBytes * jobsPerSample);
      expect(sample.serialNdjsonSha256).toBe(workload.serialNdjsonSha256);
    }
    expect(combinations.size).toBe(0);
  });

  it("regenerates the stored summaries and Markdown table exactly from recorded samples", () => {
    expect(evidence.summary).toEqual(summarize(evidence.samples));
    const markdown = readFileSync(new URL("../docs/evidence/scaling-20261013.md", import.meta.url), "utf8");
    expect(markdown).toBe(renderReport(evidence, filename));
  });
});
