import { createHash } from "node:crypto";
import { executeSerial, validateJob } from "../src/index.js";
import type { JobSpec, Person } from "../src/model.js";

export type Backend = "memory" | "sqlite";
export type Workload = JobSpec["kind"];
export const BACKENDS: readonly Backend[] = ["sqlite", "memory"];
export const WORKLOADS: readonly Workload[] = ["charts", "transit-grid", "synastry-matrix"];
export const FILE_LIMIT = 2_000_000;
export const PROFILES = Object.freeze({
  smoke: { workers: [1, 2], repetitions: 1, jobsPerSample: 1, warmupRounds: 1 },
  scaling: { workers: [1, 2, 4, 8], repetitions: 3, jobsPerSample: 16, warmupRounds: 8 },
});
export type Profile = keyof typeof PROFILES;

/** Invented instants and coordinates. No imported person records or randomness. */
export function syntheticPeople(count: number): Person[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `synthetic-benchmark-${index}`,
    birth: {
      utc: new Date(Date.UTC(1980 + index % 30, index % 12, 1 + index % 27, index % 24, index % 60)).toISOString(),
      latitude: -45 + (index * 13) % 90,
      longitude: -170 + (index * 29) % 340,
      houseSystem: "whole",
      timeKnown: true,
    },
  }));
}

// Fresh bounded stores keep every SQLite database and WAL below the file cap.
// These small jobs measure worker scaling, not scaling with job cardinality.
export function workloadSpec(kind: Workload): JobSpec {
  switch (kind) {
    case "charts": return { version: 1, kind, births: syntheticPeople(32) };
    case "transit-grid": return {
      version: 1, kind, births: syntheticPeople(2), start: "2024-01-01T00:00:00.000Z",
      end: "2024-01-17T00:00:00.000Z", stepMs: 86_400_000,
    };
    case "synastry-matrix": return { version: 1, kind, people: syntheticPeople(6) };
  }
}

export function sha256(data: string | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

export function workloadReference(kind: Workload) {
  const job = validateJob(workloadSpec(kind));
  const hash = createHash("sha256");
  let bytes = 0;
  let maxRowBytes = 0;
  for (const row of executeSerial(job)) {
    const line = JSON.stringify(row) + "\n";
    const size = Buffer.byteLength(line);
    bytes += size;
    maxRowBytes = Math.max(maxRowBytes, size);
    hash.update(line);
  }
  return {
    kind, spec: job.spec, totalRows: job.totalTasks,
    specSha256: sha256(JSON.stringify(job.spec)),
    serialNdjsonSha256: hash.digest("hex"), ndjsonBytes: bytes, maxRowBytes,
  };
}

export interface Sample {
  backend: Backend;
  workload: Workload;
  workers: number;
  repetition: number;
  status: "ok" | "failed";
  elapsedMs: number | null;
  completedRows: number;
  jobsCompleted: number;
  failureCount: number;
  claimCount: number;
  rowsPerSecond: number | null;
  error: string | null;
  counterScope?: "acknowledged-snapshots" | "unavailable-after-child-failure";
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

/** Never omit failed repetitions from a supposedly successful throughput group. */
export function summarize(samples: readonly Sample[]) {
  const groups = new Map<string, Sample[]>();
  for (const sample of samples) {
    const key = `${sample.backend}/${sample.workload}/${sample.workers}`;
    groups.set(key, [...groups.get(key) ?? [], sample]);
  }
  const summaries = [...groups.values()].map((group) => {
    const { backend, workload, workers } = group[0]!;
    const failedSamples = group.filter((row) => row.status !== "ok").length;
    const rates = group.map((row) => row.rowsPerSecond);
    const valid = !failedSamples && rates.every((rate) => rate !== null && Number.isFinite(rate) && rate > 0);
    const numbers = rates as number[];
    return {
      backend, workload, workers, samples: group.length, failedSamples,
      medianRowsPerSecond: valid ? median(numbers) : null,
      minRowsPerSecond: valid ? Math.min(...numbers) : null,
      maxRowsPerSecond: valid ? Math.max(...numbers) : null,
      speedupVsOneWorker: null as number | null,
    };
  });
  for (const summary of summaries) {
    const baseline = summaries.find((other) => other.backend === summary.backend
      && other.workload === summary.workload && other.workers === 1);
    if (summary.medianRowsPerSecond !== null && baseline?.medianRowsPerSecond) {
      summary.speedupVsOneWorker = summary.medianRowsPerSecond / baseline.medianRowsPerSecond;
    }
  }
  return summaries;
}
