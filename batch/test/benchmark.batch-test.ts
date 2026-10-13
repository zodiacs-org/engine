import { execFileSync, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  BACKENDS, FILE_LIMIT, PROFILES, WORKLOADS, sha256, summarize, syntheticPeople,
  workloadReference, workloadSpec,
} from "../benchmark/model.js";
import type { Sample } from "../benchmark/model.js";
import { executeSerial, validateJob, workItems } from "../src/index.js";

function sample(overrides: Partial<Sample> = {}): Sample {
  return {
    backend: "memory", workload: "charts", workers: 1, repetition: 0,
    status: "ok", elapsedMs: 10_000, completedRows: 100, jobsCompleted: 1,
    failureCount: 0, claimCount: 1, rowsPerSecond: 10, error: null,
    ...overrides,
  };
}

describe("scaling benchmark workload and evidence", () => {
  it("creates deterministic invented births with distinct identifiers and valid coordinates", () => {
    const people = syntheticPeople(32);
    expect(syntheticPeople(32)).toEqual(people);
    expect(new Set(people.map((person) => person.id)).size).toBe(32);
    expect(syntheticPeople(0)).toEqual([]);
    for (const person of people) {
      expect(person.id).toMatch(/^synthetic-benchmark-\d+$/);
      expect(person.birth.utc).toBe(new Date(person.birth.utc).toISOString());
      expect(Date.parse(person.birth.utc)).toBeGreaterThanOrEqual(Date.UTC(1980, 0, 1));
      expect(Date.parse(person.birth.utc)).toBeLessThan(Date.UTC(2010, 0, 1));
      expect(person.birth.latitude).toBeGreaterThanOrEqual(-45);
      expect(person.birth.latitude).toBeLessThan(45);
      expect(person.birth.longitude).toBeGreaterThanOrEqual(-170);
      expect(person.birth.longitude).toBeLessThan(170);
      expect(person.birth.houseSystem).toBe("whole");
      expect(person.birth.timeKnown).toBe(true);
    }
  });

  it("counts chart rows, half-open daily transit samples, and the full directed nonself matrix", () => {
    const charts = validateJob(workloadSpec("charts"));
    const grid = validateJob(workloadSpec("transit-grid"));
    const matrix = validateJob(workloadSpec("synastry-matrix"));
    expect(charts.totalTasks).toBe(32);
    expect(grid.totalTasks).toBe(32);
    expect(matrix.totalTasks).toBe(30);
    expect([...workItems(charts)].map((row) => row.index)).toEqual(Array.from({ length: 32 }, (_, index) => index));

    const gridRows = [...workItems(grid)];
    const people = syntheticPeople(2);
    for (const [personIndex, person] of people.entries()) {
      const rows = gridRows.filter((row) => row.kind === "transit-grid" && row.person.id === person.id);
      expect(rows).toHaveLength(16);
      expect(rows.map((row) => row.index)).toEqual(Array.from({ length: 16 }, (_, index) => personIndex * 16 + index));
      for (const [index, row] of rows.entries()) {
        expect(row.kind).toBe("transit-grid");
        if (row.kind !== "transit-grid") throw new Error("Unexpected benchmark work kind.");
        expect(row.sampleIndex).toBe(index);
        expect(Date.parse(row.at)).toBe(Date.UTC(2024, 0, 1 + index));
        expect(Date.parse(row.at)).toBeLessThan(Date.UTC(2024, 0, 17));
      }
    }

    const pairs = [...workItems(matrix)].map((row) => {
      if (row.kind !== "synastry-matrix") throw new Error("Unexpected benchmark work kind.");
      expect(row.a.id).not.toBe(row.b.id);
      return `${row.a.id}/${row.b.id}`;
    });
    const ids = syntheticPeople(6).map((person) => person.id);
    const expected = ids.flatMap((a) => ids.filter((b) => b !== a).map((b) => `${a}/${b}`));
    expect(pairs).toEqual(expected);
    expect(new Set(pairs).size).toBe(30);
  });

  it.each(WORKLOADS)("binds %s references to the exact bounded input and newline-terminated serial output", (kind) => {
    const reference = workloadReference(kind);
    const job = validateJob(workloadSpec(kind));
    const lines = [...executeSerial(job)].map((row) => JSON.stringify(row) + "\n");
    expect(workloadSpec(kind)).toEqual(reference.spec);
    expect(reference.specSha256).toBe(sha256(JSON.stringify(job.spec)));
    expect(reference.serialNdjsonSha256).toBe(sha256(lines.join("")));
    expect(reference.totalRows).toBe(lines.length);
    expect(reference.ndjsonBytes).toBe(Buffer.byteLength(lines.join("")));
    expect(reference.maxRowBytes).toBe(Math.max(...lines.map((line) => Buffer.byteLength(line))));
    expect(reference.ndjsonBytes).toBeGreaterThan(0);
    expect(reference.ndjsonBytes).toBeLessThan(FILE_LIMIT);
    expect(Buffer.byteLength(JSON.stringify(reference))).toBeLessThan(FILE_LIMIT);
  });
});

describe("benchmark summaries", () => {
  it("reports the median and observed range with a matching backend/workload baseline", () => {
    const samples = [
      ...[90, 10, 11].map((rate, repetition) => sample({ repetition, rowsPerSecond: rate })),
      ...[66, 22, 44].map((rate, repetition) => sample({ workers: 2, repetition, rowsPerSecond: rate })),
      ...[100, 5, 30, 8].map((rate, repetition) => sample({ backend: "sqlite", repetition, rowsPerSecond: rate })),
      sample({ workload: "transit-grid", workers: 2, rowsPerSecond: 999 }),
    ];
    const original = structuredClone(samples);
    expect(summarize(samples)).toEqual([
      { backend: "memory", workload: "charts", workers: 1, samples: 3, failedSamples: 0,
        medianRowsPerSecond: 11, minRowsPerSecond: 10, maxRowsPerSecond: 90, speedupVsOneWorker: 1 },
      { backend: "memory", workload: "charts", workers: 2, samples: 3, failedSamples: 0,
        medianRowsPerSecond: 44, minRowsPerSecond: 22, maxRowsPerSecond: 66, speedupVsOneWorker: 4 },
      { backend: "sqlite", workload: "charts", workers: 1, samples: 4, failedSamples: 0,
        medianRowsPerSecond: 19, minRowsPerSecond: 5, maxRowsPerSecond: 100, speedupVsOneWorker: 1 },
      { backend: "memory", workload: "transit-grid", workers: 2, samples: 1, failedSamples: 0,
        medianRowsPerSecond: 999, minRowsPerSecond: 999, maxRowsPerSecond: 999, speedupVsOneWorker: null },
    ]);
    expect(samples).toEqual(original);
    expect(summarize([])).toEqual([]);
  });

  it("keeps failed repetitions visible and refuses rates or speedups based on a poisoned group", () => {
    const summary = summarize([
      sample(),
      sample({ repetition: 1, status: "failed", failureCount: 1, rowsPerSecond: 50, error: "failed" }),
      sample({ workers: 2, rowsPerSecond: 100 }),
      sample({ backend: "sqlite" }),
      sample({ backend: "sqlite", workers: 2, rowsPerSecond: 20 }),
      sample({ backend: "sqlite", workers: 2, repetition: 1, status: "failed", rowsPerSecond: null, error: "failed" }),
    ]);
    expect(summary[0]).toMatchObject({ samples: 2, failedSamples: 1, medianRowsPerSecond: null,
      minRowsPerSecond: null, maxRowsPerSecond: null, speedupVsOneWorker: null });
    expect(summary[1]).toMatchObject({ medianRowsPerSecond: 100, speedupVsOneWorker: null });
    expect(summary[2]).toMatchObject({ failedSamples: 0, medianRowsPerSecond: 10, speedupVsOneWorker: 1 });
    expect(summary[3]).toMatchObject({ samples: 2, failedSamples: 1, medianRowsPerSecond: null,
      minRowsPerSecond: null, maxRowsPerSecond: null, speedupVsOneWorker: null });
  });

  it.each([null, 0, -1, Number.NaN, Number.POSITIVE_INFINITY])("refuses an invalid throughput value %s", (rate) => {
    expect(summarize([sample(), sample({ repetition: 1, rowsPerSecond: rate })])[0]).toMatchObject({
      samples: 2, medianRowsPerSecond: null, minRowsPerSecond: null,
      maxRowsPerSecond: null, speedupVsOneWorker: null,
    });
  });
});

it("runs the benchmark smoke profile with actual worker threads and both queue backends", () => {
  const scratchName = `benchmark-test-${randomUUID()}`;
  const scratch = fileURLToPath(new URL(`../.generated/${scratchName}/`, import.meta.url));
  const output = `${scratch}/report.json`;
  const script = fileURLToPath(new URL("../scripts/benchmark.mjs", import.meta.url));
  try {
    execFileSync(process.execPath, [script, "--profile", "smoke", "--output", `.generated/${scratchName}/report.json`], {
      cwd: fileURLToPath(new URL("../../", import.meta.url)),
      stdio: "pipe", timeout: 55_000, maxBuffer: FILE_LIMIT,
    });
    expect(statSync(output).size).toBeLessThan(FILE_LIMIT);
    const report = JSON.parse(readFileSync(output, "utf8")) as {
      schemaVersion: number;
      profile: string;
      identity: object;
      machine: object;
      workloads: ReturnType<typeof workloadReference>[];
      samples: (Sample & { maxObservedFileBytes: number })[];
      summary: ReturnType<typeof summarize>;
    };
    expect(report.schemaVersion).toBe(1);
    expect(report.profile).toBe("smoke");
    expect(report.identity).toEqual(expect.any(Object));
    expect(report.machine).toEqual(expect.any(Object));
    expect(report.workloads).toHaveLength(3);
    expect(new Set(report.workloads.map((workload) => workload.kind))).toEqual(new Set(WORKLOADS));
    expect(report.samples).toHaveLength(12);
    const expectedRows = { charts: 32, "transit-grid": 32, "synastry-matrix": 30 };
    const combinations = new Set(report.samples.map((row) => `${row.backend}/${row.workload}/${row.workers}`));
    for (const backend of BACKENDS) for (const workload of WORKLOADS) for (const workers of PROFILES.smoke.workers) {
      expect(combinations.has(`${backend}/${workload}/${workers}`)).toBe(true);
    }
    for (const row of report.samples) {
      expect(row).toMatchObject({ status: "ok", jobsCompleted: 1, failureCount: 0, claimCount: 1, error: null });
      expect(row.completedRows).toBe(expectedRows[row.workload]);
      expect(row.elapsedMs).toBeGreaterThan(0);
      expect(row.rowsPerSecond).toBeGreaterThan(0);
      expect(row.rowsPerSecond).toBeCloseTo(row.completedRows * 1_000 / row.elapsedMs!, 9);
      expect(row.maxObservedFileBytes).toBeLessThan(FILE_LIMIT);
    }
    expect(report.summary).toEqual(summarize(report.samples));
    expect(report.summary).toHaveLength(12);
    expect(report.summary.every((row) => row.failedSamples === 0)).toBe(true);

    // Deliberately disagree with serial parity after the real SQLite job has
    // committed. A completed calculation must not become successful evidence
    // when its stored output fails verification.
    const runner = fileURLToPath(new URL("../.generated/benchmark-build/runner.js", import.meta.url));
    const data = fileURLToPath(new URL("../.generated/benchmark-data/", import.meta.url));
    expect(readdirSync(data)).toEqual([]);
    const poisoned = JSON.parse(execFileSync(process.execPath, [runner, "--cell", JSON.stringify({
      backend: "sqlite", workload: "charts", workers: 2, repetition: 0,
      profile: "smoke", expectedDigest: "0".repeat(64),
    })], { encoding: "utf8", stdio: "pipe", timeout: 10_000, maxBuffer: FILE_LIMIT })) as Sample & {
      maxObservedFileBytes: number;
      verifiedNdjsonBytes: number;
    };
    expect(poisoned).toMatchObject({
      backend: "sqlite", workload: "charts", workers: 2, status: "failed",
      error: "serial-digest-mismatch", completedRows: 32, jobsCompleted: 0,
      claimCount: 1, failureCount: 0, rowsPerSecond: null,
    });
    expect(poisoned.elapsedMs).toBeGreaterThan(0);
    expect(poisoned.verifiedNdjsonBytes).toBeGreaterThan(0);
    expect(poisoned.maxObservedFileBytes).toBeGreaterThan(0);
    expect(poisoned.maxObservedFileBytes).toBeLessThan(FILE_LIMIT);
    expect(summarize([poisoned])[0]).toMatchObject({
      failedSamples: 1, medianRowsPerSecond: null, minRowsPerSecond: null,
      maxRowsPerSecond: null, speedupVsOneWorker: null,
    });
    expect(readdirSync(data)).toEqual([]);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}, 60_000);

it("refuses unknown profiles and outputs outside the ignored generated directory before execution", () => {
  const script = fileURLToPath(new URL("../scripts/benchmark.mjs", import.meta.url));
  const deniedName = `benchmark-denied-${randomUUID()}.json`;
  const deniedFile = fileURLToPath(new URL(`../${deniedName}`, import.meta.url));
  const cases = [
    { args: ["--profile", "unknown", "--output", ".generated/unused.json"], message: "Usage:" },
    { args: ["--profile", "smoke", "--output", deniedName], message: "Benchmark output must be a JSON file under batch/.generated/." },
    { args: ["--profile", "smoke", "--output", ".generated/unused.txt"], message: "Benchmark output must be a JSON file under batch/.generated/." },
  ];
  try {
    for (const { args, message } of cases) {
      const result = spawnSync(process.execPath, [script, ...args], {
        encoding: "utf8", timeout: 10_000, maxBuffer: FILE_LIMIT,
      });
      expect(result.status).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain(message);
    }
    expect(existsSync(deniedFile)).toBe(false);
  } finally {
    rmSync(deniedFile, { force: true });
  }
});
