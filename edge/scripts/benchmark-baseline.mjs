import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { benchmarkProtocol, summarizeSamples, WORKLOAD_IDS } from "./benchmark-core.mjs";
import { edgeRoot, requireNode22 } from "./build-support.mjs";

const IDS = WORKLOAD_IDS;
const FILE_LIMIT = 2_000_000;
const hash = (value) => createHash("sha256").update(value).digest("hex");
const encode = (value) => JSON.stringify(value, null, 2) + "\n";

function object(value, label) {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), `${label} must be an object.`);
}

function positiveInteger(value, label) {
  assert(Number.isSafeInteger(value) && value > 0, `${label} must be a positive safe integer.`);
}

function digest(value, label) {
  assert(typeof value === "string" && value.length === 64 && /^[a-f0-9]+$/.test(value), `Invalid ${label} digest.`);
}

function text(value, label) {
  assert(typeof value === "string" && value.length > 0 && value.trim() === value, `${label} must be nonempty text.`);
}

function sourceRecords(records, label) {
  assert(Array.isArray(records) && records.length > 0, `${label} must contain source records.`);
  const paths = new Set();
  for (const record of records) {
    object(record, label);
    text(record.path, `${label} path`);
    assert(!isAbsolute(record.path) && !record.path.includes("\\"), `${label} paths must be portable relative paths.`);
    assert(!paths.has(record.path), `${label} contains duplicate source paths.`);
    paths.add(record.path);
    assert(Number.isSafeInteger(record.bytes) && record.bytes >= 0 && record.bytes < FILE_LIMIT,
      `${label} bytes must be below the project size limit.`);
    digest(record.sha256, `${label} source`);
  }
}

function validateProvenance(provenance) {
  object(provenance, "Provenance");
  for (const name of ["machine", "runtime", "runner", "build"]) object(provenance[name], `Provenance ${name}`);
  const { machine, runtime, runner, build } = provenance;
  text(machine.label, "Machine label");
  assert(/^[a-z0-9][a-z0-9-]{0,63}$/.test(machine.label), "Invalid public machine label.");
  for (const name of ["platform", "arch", "release"]) text(machine[name], `Machine ${name}`);
  assert(Array.isArray(machine.cpuModels) && machine.cpuModels.length > 0, "CPU models are required.");
  machine.cpuModels.forEach((model) => text(model, "CPU model"));
  for (const name of ["logicalCpuCount", "availableParallelism", "totalMemoryBytes"]) positiveInteger(machine[name], `Machine ${name}`);
  object(machine.cgroupV2, "Machine cgroupV2");
  for (const name of ["cpuMax", "cpuset", "memoryMax"]) {
    const value = machine.cgroupV2[name];
    assert(value === null || typeof value === "string" && value.length > 0 && value.length <= 256
      && value.trim() === value && /^(?:max|[0-9, -])+$/.test(value), `Missing or invalid cgroup ${name}.`);
  }
  assert.equal(runtime.name, "node", "Benchmark runtime must be Node.");
  text(runtime.node, "Node version");
  assert(/^22\.[0-9]+\.[0-9]+$/.test(runtime.node), "Benchmark runtime must be Node 22.");
  for (const name of ["v8", "uv"]) text(runtime[name], `Runtime ${name}`);
  assert.deepEqual(runtime.execArgv, [], "Benchmark runtime must have no CLI flags.");
  assert.equal(runtime.nodeOptions, false, "Benchmark runtime must have no NODE_OPTIONS.");
  digest(runner.sourceDigest, "runner");
  sourceRecords(runner.sources, "Runner sources");
  assert.equal(runner.sourceDigest, hash(encode(runner.sources)), "Runner source digest does not match its records.");
  assert.equal(build.schema, "edge-build/1", "Unknown benchmark build schema.");
  assert.equal(build.target, "workers", "Benchmark must identify the Workers build measured in Node.");
  text(build.engineVersion, "Build engine version");
  object(build.ephemeris, "Build ephemeris");
  assert.equal(build.ephemeris.name, "astronomy-engine", "Unknown build ephemeris.");
  text(build.ephemeris.version, "Build ephemeris version");
  object(build.toolchain, "Build toolchain");
  assert.equal(build.toolchain.node, `v${runtime.node}`, "Build and benchmark Node versions differ.");
  text(build.toolchain.esbuild, "Build esbuild version");
  object(build.config, "Build configuration");
  assert(Object.keys(build.config).length > 0, "Build configuration is required.");
  digest(build.sourceDigest, "build");
  sourceRecords(build.sources, "Build sources");
  sourceRecords(build.outputs, "Build outputs");
  assert(build.outputs.some(({ path }) => path === "workloads.mjs"), "Build must identify its workload bundle.");
  assert.equal(build.sourceDigest, hash(encode(build.sources)), "Build source digest does not match its records.");
}

function checksum(value, label) {
  assert(typeof value === "number" && Number.isFinite(value), `${label} must be a finite number.`);
}

function timestamp(value, label) {
  assert(typeof value === "string" && Number.isFinite(Date.parse(value)), `${label} must be an ISO timestamp.`);
  assert.equal(new Date(value).toISOString(), value, `${label} must be a canonical UTC ISO timestamp.`);
}

// Validate the data that determines comparability before accepting any timing.
// These are measurement records, not authenticated attestations of execution.
export function validateBenchmarkRun(report) {
  object(report, "Benchmark run");
  assert.equal(report.schema, "edge-benchmark-run/1", "Unknown benchmark run schema.");
  timestamp(report.startedAt, "startedAt");
  timestamp(report.completedAt, "completedAt");
  assert(Date.parse(report.completedAt) >= Date.parse(report.startedAt), "Benchmark completion precedes its start.");

  const { protocol, provenance, workloadSet, results } = report;
  object(protocol, "Protocol");
  assert.deepEqual(protocol, benchmarkProtocol({ samples: protocol.samples, warmupBatches: protocol.warmupBatches }),
    "Benchmark protocol does not match the declared runner protocol.");

  validateProvenance(provenance);
  object(workloadSet, "Workload set");
  assert.equal(workloadSet.schema, "edge-benchmark-workloads/1", "Unknown workload schema.");
  digest(workloadSet.sha256, "workload");
  assert(Array.isArray(workloadSet.definitions), "Workload definitions must be an array.");
  assert.deepEqual(workloadSet.definitions.map((definition) => definition?.id), IDS,
    "Workload definitions must name every workload in order.");
  for (const definition of workloadSet.definitions) {
    object(definition, "Workload definition");
    assert(typeof definition.unit === "string" && definition.unit.length > 0, "Workload unit is required.");
    assert(Object.hasOwn(definition, "inputs") && definition.inputs !== null, "Workload inputs are required.");
  }
  digest(report.exactResultSha256, "exact result");
  assert(Array.isArray(results), "Benchmark results must be an array.");
  assert.deepEqual(results.map((result) => result?.id), IDS, "Results must name every workload in order.");

  for (const result of results) {
    object(result, "Benchmark result");
    positiveInteger(result.iterationsPerSample, `${result.id} iterations per sample`);
    assert.equal(result.iterationsPerSample, protocol.iterations[result.id], "Result iterations differ from protocol.");
    object(result.warmup, `${result.id} warmup`);
    assert.equal(result.warmup.batches, protocol.warmupBatches, "Warmup batches differ from protocol.");
    positiveInteger(result.warmup.iterations, "Warmup iterations");
    assert.equal(result.warmup.iterations, result.iterationsPerSample * result.warmup.batches,
      "Warmup iterations differ from protocol.");
    positiveInteger(result.warmup.elapsedNs, "Warmup elapsed nanoseconds");
    checksum(result.warmup.checksum, "Warmup checksum");
    assert(Array.isArray(result.samples), "Benchmark samples must be an array.");
    assert.equal(result.samples.length, protocol.samples, "Sample count differs from protocol.");
    for (const sample of result.samples) {
      object(sample, "Benchmark sample");
      positiveInteger(sample.elapsedNs, "Sample elapsed nanoseconds");
      checksum(sample.checksum, "Sample checksum");
      assert.equal(sample.checksum, result.samples[0].checksum, "Sample checksums differ within a workload.");
    }
    let warmupChecksum = 0;
    for (let i = 0; i < result.warmup.batches; i++) warmupChecksum += result.samples[0].checksum;
    assert.equal(result.warmup.checksum, warmupChecksum, "Warmup checksum does not match its batches.");
    assert.deepEqual(result.summary,
      summarizeSamples(result.samples.map(({ elapsedNs }) => elapsedNs), result.iterationsPerSample),
      "Timing summary does not match the recorded samples.");
  }
  return report;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function compactBaseline(entries) {
  assert(Array.isArray(entries) && entries.length >= 3, "A baseline requires at least three independent raw runs.");
  const digests = new Set();
  const intervals = new Set();
  for (const entry of entries) {
    object(entry, "Baseline input");
    digest(entry.rawSha256, "raw file");
    assert(!digests.has(entry.rawSha256), "Duplicate raw run digest.");
    digests.add(entry.rawSha256);
    validateBenchmarkRun(entry.report);
    const interval = JSON.stringify([entry.report.startedAt, entry.report.completedAt]);
    assert(!intervals.has(interval), "Duplicate measurement interval; reformatting a raw file is not an independent run.");
    intervals.add(interval);
  }
  const first = entries[0].report;
  for (const { report } of entries.slice(1)) {
    for (const name of ["protocol", "provenance", "workloadSet", "exactResultSha256"]) {
      assert.deepEqual(report[name], first[name], `Incompatible benchmark ${name}.`);
    }
    for (const [index, result] of report.results.entries()) {
      const expected = first.results[index];
      assert.equal(result.warmup.checksum, expected.warmup.checksum, "Warmup checksums differ between runs.");
      assert.equal(result.samples[0].checksum, expected.samples[0].checksum, "Result checksums differ between runs.");
    }
  }
  return {
    schema: "edge-benchmark-baseline/1",
    protocol: first.protocol,
    provenance: first.provenance,
    workloadSet: first.workloadSet,
    exactResultSha256: first.exactResultSha256,
    runs: entries.map(({ report, rawSha256 }) => ({
      startedAt: report.startedAt,
      completedAt: report.completedAt,
      rawSha256,
      results: report.results.map((result) => ({
        id: result.id,
        iterationsPerSample: result.iterationsPerSample,
        warmup: result.warmup,
        checksum: result.samples[0].checksum,
        samples: result.samples.map(({ elapsedNs }) => elapsedNs),
        summary: result.summary
      }))
    })),
    results: IDS.map((id, index) => {
      const medians = entries.map(({ report }) => report.results[index].summary.medianMs);
      return { id, medianMs: median(medians), minRunMedianMs: Math.min(...medians), maxRunMedianMs: Math.max(...medians) };
    })
  };
}

export async function readRawBenchmark(path) {
  const root = resolve(edgeRoot, "results");
  const absolute = resolve(path);
  const local = relative(root, absolute);
  assert(local && local !== ".." && !local.startsWith(`..${sep}`) && !isAbsolute(local),
    "Raw benchmark files must be below edge/results/.");
  assert.equal(await realpath(absolute), absolute, "Raw benchmark files must not use symlinks.");
  const info = await stat(absolute);
  assert(info.isFile() && info.size < FILE_LIMIT, "Raw benchmark must be a regular file below the project size limit.");
  const bytes = await readFile(absolute);
  assert(bytes.byteLength < FILE_LIMIT, "Raw benchmark exceeds the project size limit.");
  const report = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  return { report, rawSha256: hash(bytes) };
}

export async function baselineFromFiles(paths) {
  assert(Array.isArray(paths) && paths.length >= 3, "Pass at least three explicit raw benchmark files.");
  return compactBaseline(await Promise.all(paths.map(readRawBenchmark)));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  requireNode22();
  const baseline = await baselineFromFiles(process.argv.slice(2));
  const text = JSON.stringify(baseline, null, 2) + "\n";
  assert(Buffer.byteLength(text) < FILE_LIMIT, "Compact baseline exceeds the project size limit.");
  process.stdout.write(text);
}
