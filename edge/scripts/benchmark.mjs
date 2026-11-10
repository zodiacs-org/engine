import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { availableParallelism, cpus, release, totalmem } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { buildTarget } from "./build-bundles.mjs";
import { edgeRoot, requireNode22 } from "./build-support.mjs";
import { benchmarkProtocol, measureWorkload } from "./benchmark-core.mjs";
import { benchmarkWorkloads } from "./benchmark-workloads.mjs";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const encode = (value) => JSON.stringify(value, null, 2) + "\n";
const runnerPaths = ["scripts/benchmark-core.mjs", "scripts/benchmark-workloads.mjs", "scripts/benchmark.mjs"];

export function parseBenchmarkOptions(args) {
  const options = {};
  const seen = new Set();
  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i], value = args[i + 1];
    assert(["--machine", "--samples", "--warmup-batches"].includes(flag) && !seen.has(flag)
      && typeof value === "string" && value.length > 0 && !value.startsWith("--"),
    "Usage: benchmark.mjs --machine public-runner-label [--samples N] [--warmup-batches N]");
    seen.add(flag);
    if (flag === "--machine") {
      assert(value === value.trim() && /^[a-z0-9][a-z0-9-]{0,63}$/.test(value), "Use a public machine label of lowercase letters, digits and hyphens.");
      options.machine = value;
    } else {
      assert(value === value.trim() && /^[1-9][0-9]*$/.test(value), "Benchmark counts must be decimal positive integers.");
      options[flag === "--samples" ? "samples" : "warmupBatches"] = Number(value);
    }
  }
  assert(options.machine, "An explicit public --machine label is required; do not use a secret or hostname.");
  benchmarkProtocol(options);
  return options;
}

async function sourceRecords() {
  return Promise.all(runnerPaths.map(async (path) => {
    const bytes = await readFile(resolve(edgeRoot, path));
    return { path, bytes: bytes.byteLength, sha256: hash(bytes) };
  }));
}

async function cpuLimits() {
  // Best-effort Linux cgroup v2 observations, not evidence of dedicated CPUs.
  // No arbitrary environment, hostname, username or machine identifier is read.
  const fields = { cpuMax: "cpu.max", cpuset: "cpuset.cpus.effective", memoryMax: "memory.max" };
  const result = {};
  for (const [key, name] of Object.entries(fields)) {
    try {
      const text = (await readFile(`/sys/fs/cgroup/${name}`, "utf8")).trim();
      result[key] = /^(?:max|[0-9, -]){1,256}$/.test(text) ? text : null;
    } catch (error) {
      if (!["ENOENT", "EACCES", "EPERM"].includes(error.code)) throw error;
      result[key] = null;
    }
  }
  return result;
}

export async function runBenchmark(options) {
  requireNode22();
  assert.equal(process.execArgv.length, 0, "Run benchmarks without Node CLI flags.");
  assert(!process.env.NODE_OPTIONS, "Unset NODE_OPTIONS before benchmarking.");
  const protocol = benchmarkProtocol(options);
  assert(typeof options.machine === "string" && options.machine === options.machine.trim()
    && /^[a-z0-9][a-z0-9-]{0,63}$/.test(options.machine), "Invalid public machine label.");
  const runnerSources = await sourceRecords();
  const { files, manifest } = await buildTarget("workers", { write: false });
  const bytes = files.get("workloads.mjs");
  const module = await import(`data:text/javascript;base64,${bytes.toString("base64")}`);
  const workloads = benchmarkWorkloads(module);
  const definitions = workloads.map(({ id, unit, inputs }) => ({ id, unit, inputs }));
  const workloadSources = ["src/workloads.ts", "scripts/benchmark-workloads.mjs"];
  const workloadSet = {
    schema: "edge-benchmark-workloads/1",
    sha256: hash(encode({ definitions, sources: await Promise.all(workloadSources.map(async (path) => ({
      path, sha256: hash(await readFile(resolve(edgeRoot, path)))
    }))) })),
    definitions
  };
  const cpuInfo = cpus();
  assert(cpuInfo.length > 0, "CPU provenance is unavailable.");
  const provenance = {
    machine: {
      label: options.machine, platform: process.platform, arch: process.arch, release: release(),
      cpuModels: [...new Set(cpuInfo.map(({ model }) => model))].sort(),
      logicalCpuCount: cpuInfo.length, availableParallelism: availableParallelism(),
      totalMemoryBytes: totalmem(), cgroupV2: await cpuLimits()
    },
    runtime: { name: "node", node: process.versions.node, v8: process.versions.v8, uv: process.versions.uv, execArgv: [], nodeOptions: false },
    runner: { sourceDigest: hash(encode(runnerSources)), sources: runnerSources },
    build: manifest
  };
  // All build, import, provenance and exact serialization work precedes timing.
  const exact = module.runExactSmokeCases();
  assert.equal(module.runExactSmokeCases(), exact, "Preflight results are not repeatable.");
  const startedAt = new Date().toISOString();
  const results = workloads.map((workload) => measureWorkload(workload, protocol));
  const completedAt = new Date().toISOString();
  assert.equal(module.runExactSmokeCases(), exact, "Post-benchmark exact results changed.");
  assert.deepEqual(await sourceRecords(), runnerSources, "Benchmark runner changed during measurement.");
  // Verify manifest input identities after measurement, too. Builds must be
  // measured from a quiescent checkout, not during edits or an install.
  for (const source of manifest.sources) {
    assert.equal(hash(await readFile(resolve(edgeRoot, source.path))), source.sha256, `Source changed during measurement: ${source.path}`);
  }
  return {
    schema: "edge-benchmark-run/1", startedAt, completedAt,
    protocol, provenance, workloadSet, exactResultSha256: hash(exact), results
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const report = encode(await runBenchmark(parseBenchmarkOptions(process.argv.slice(2))));
    assert(Buffer.byteLength(report) < 2_000_000, "Benchmark report exceeds the project file limit.");
    process.stdout.write(report);
  } catch (error) {
    console.error(`Benchmark failed: ${error.message}`);
    process.exitCode = 1;
  }
}
