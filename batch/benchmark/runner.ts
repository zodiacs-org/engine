import { execFile } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { runCell } from "./cell.js";
import type { CellConfig } from "./cell.js";
import { collectMachineMetadata } from "./metadata.js";
import { BACKENDS, FILE_LIMIT, PROFILES, WORKLOADS, summarize, workloadReference } from "./model.js";
import type { Profile, Sample } from "./model.js";
import { renderReport } from "./render.js";

const execute = promisify(execFile);
const entry = fileURLToPath(import.meta.url);
const generatedRoot = fileURLToPath(new URL("../benchmark-data/", import.meta.url));
const args = process.argv.slice(2);
if (args[0] === "--cell") {
  const config = JSON.parse(args[1]!) as CellConfig;
  process.stdout.write(JSON.stringify(await runCell(config, generatedRoot)) + "\n");
} else {
  const profile = args[0] as Profile;
  const output = args[1];
  if (!Object.hasOwn(PROFILES, profile) || !output) throw new Error("Invalid benchmark invocation.");
  const settings = PROFILES[profile];
  const identity: unknown = JSON.parse(readFileSync(new URL("./identity.json", import.meta.url), "utf8"));
  const workloads = WORKLOADS.map(workloadReference);
  const samples: Sample[] = [];
  const plannedSamples = settings.repetitions * settings.workers.length * BACKENDS.length * WORKLOADS.length;
  const report = {
    schemaVersion: 1,
    profile,
    complete: false,
    startedAt: new Date().toISOString(),
    finishedAt: null as string | null,
    identity,
    machine: collectMachineMetadata(),
    method: {
      settings, plannedSamples,
      unit: "committed result rows per second",
      scope: "Repeated small jobs, fresh queue per job, same warmed worker pool within each sample; fresh process per sample.",
      timing: "Sum of monotonic intervals from before submit to final commit and file guard; includes submission, scheduler creation, claims, computation, JSON transport, ordered single-row commits and SQLite file-size checks.",
      excluded: "Build, process startup, pool warmup, database open/migration, scheduler stop, result verification/export, database close/removal and gaps between jobs.",
      warmup: "Each round concurrently fills all worker slots with workload rows; no queue warmup. Worker startup is in warmupMs.",
      ordering: "Repetition rotates worker counts and workload/backend combinations; all samples run sequentially.",
      verification: "Every stored NDJSON row is read after timing; cursor/count and full digest must match serial execution of the same engine build. This is parity, not accuracy evidence.",
      failurePolicy: "Report every sample. Failed groups have no throughput summary or speedup. Retries invalidate a sample. A child timeout or crash records a failure.",
      counterScope: "In-process counters use acknowledged snapshots, which may lag storage after an uncertain error. After child failure all counters are unavailable, represented by zero with counterScope=unavailable-after-child-failure.",
      storage: "SQLite defaults (WAL, FULL synchronous) on this filesystem; each job uses a fresh file. Memory uses the same job shapes. No live Redis benchmark.",
      fileLimitBytes: FILE_LIMIT,
      limitations: "Small-job scaling does not establish large-single-job throughput, HTTP/CLI throughput, continuous service throughput, cold start latency, host power-loss durability or exclusive CPU availability.",
    },
    workloads,
    samples,
    summary: summarize(samples),
  };
  const save = () => {
    report.summary = summarize(samples);
    const text = JSON.stringify(report, null, 2) + "\n";
    if (Buffer.byteLength(text) >= FILE_LIMIT) throw new Error("Benchmark report exceeds file budget.");
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, text);
    const markdown = renderReport(report, basename(output));
    if (Buffer.byteLength(markdown) >= FILE_LIMIT) throw new Error("Benchmark table exceeds file budget.");
    writeFileSync(output.replace(/\.json$/, ".md"), markdown);
  };
  save();
  const combinations = BACKENDS.flatMap((backend) => WORKLOADS.map((workload) => ({ backend, workload })));
  for (let repetition = 0; repetition < settings.repetitions; repetition++) {
    const workerOrder = [...settings.workers.slice(repetition), ...settings.workers.slice(0, repetition)];
    const combinationOrder = [...combinations.slice(repetition), ...combinations.slice(0, repetition)];
    for (const workers of workerOrder) {
      for (const { backend, workload } of combinationOrder) {
        const config: CellConfig = {
          backend, workload, workers, repetition, profile,
          expectedDigest: workloads.find((item) => item.kind === workload)!.serialNdjsonSha256,
        };
        let sample: Sample;
        try {
          const { stdout } = await execute(process.execPath, [entry, "--cell", JSON.stringify(config)], {
            timeout: 180_000, killSignal: "SIGKILL", maxBuffer: FILE_LIMIT - 1,
          });
          sample = JSON.parse(stdout) as Sample;
        } catch {
          sample = {
            backend, workload, workers, repetition, status: "failed", elapsedMs: null,
            completedRows: 0, jobsCompleted: 0, claimCount: 0, failureCount: 0,
            rowsPerSecond: null, error: "child-process-failed",
            counterScope: "unavailable-after-child-failure",
          };
        }
        samples.push(sample);
        save();
        process.stderr.write(`${samples.length}/${plannedSamples} ${backend} ${workload} workers=${workers} ${sample.status}\n`);
      }
    }
  }
  report.complete = samples.length === plannedSamples;
  report.finishedAt = new Date().toISOString();
  save();
  if (samples.some((sample) => sample.status !== "ok")) process.exitCode = 1;
  process.stdout.write(`Benchmark ${report.complete ? "finished" : "incomplete"}; ${samples.filter((sample) => sample.status === "failed").length} failed samples.\n`);
}
