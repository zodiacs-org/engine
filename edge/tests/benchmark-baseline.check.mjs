import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { benchmarkProtocol, summarizeSamples } from "../scripts/benchmark-core.mjs";
import { baselineFromFiles, compactBaseline, readRawBenchmark, validateBenchmarkRun } from "../scripts/benchmark-baseline.mjs";
import { edgeRoot } from "../scripts/build-support.mjs";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const encode = (value) => JSON.stringify(value, null, 2) + "\n";

// Timing fixtures are constructed arithmetic, never claimed measurements.
function entry(index, scale = index + 1) {
  const protocol = benchmarkProtocol({ samples: 3, warmupBatches: 2 });
  const runnerSources = [{ path: "scripts/benchmark-core.mjs", bytes: 100, sha256: "a".repeat(64) }];
  const buildSources = [{ path: "src/workloads.ts", bytes: 100, sha256: "b".repeat(64) }];
  const report = {
    schema: "edge-benchmark-run/1",
    startedAt: `2026-01-0${index + 1}T00:00:00.000Z`,
    completedAt: `2026-01-0${index + 1}T00:00:01.000Z`,
    protocol,
    provenance: {
      machine: {
        label: "synthetic-test", platform: "linux", arch: "x64", release: "synthetic-kernel",
        cpuModels: ["synthetic-cpu"], logicalCpuCount: 4, availableParallelism: 2,
        totalMemoryBytes: 1_000_000, cgroupV2: { cpuMax: "200000 100000", cpuset: "0-1", memoryMax: null }
      },
      runtime: { name: "node", node: "22.0.0", v8: "synthetic-v8", uv: "synthetic-uv", execArgv: [], nodeOptions: false },
      runner: { sourceDigest: hash(encode(runnerSources)), sources: runnerSources },
      build: {
        schema: "edge-build/1", target: "workers", sourceDigest: hash(encode(buildSources)), sources: buildSources,
        engineVersion: "1.0.0", ephemeris: { name: "astronomy-engine", version: "2.1.19" },
        toolchain: { node: "v22.0.0", esbuild: "0.27.7" }, config: { format: "esm" },
        outputs: [{ path: "workloads.mjs", bytes: 1000, sha256: "e".repeat(64) }]
      }
    },
    workloadSet: {
      schema: "edge-benchmark-workloads/1", sha256: "c".repeat(64),
      definitions: protocol.order.map((id) => ({ id, unit: "one synthetic workload call", inputs: { synthetic: true } }))
    },
    exactResultSha256: "d".repeat(64),
    results: protocol.order.map((id, resultIndex) => {
      const iterations = protocol.iterations[id];
      const samples = [2, 3, 7].map((value) => ({
        elapsedNs: value * scale * (resultIndex + 1) * iterations * 1e6, checksum: 123 + resultIndex
      }));
      return {
        id, iterationsPerSample: iterations,
        warmup: { batches: 2, iterations: 2 * iterations, elapsedNs: 100_000, checksum: 2 * (123 + resultIndex) },
        samples,
        summary: summarizeSamples(samples.map(({ elapsedNs }) => elapsedNs), iterations)
      };
    })
  };
  return { report, rawSha256: hash(encode(report)) };
}

const entries = () => [entry(0, 1), entry(1, 2), entry(2, 4)];

test("baseline retains every timing and summarizes the median of all run medians", () => {
  const inputs = entries();
  const baseline = compactBaseline(inputs);
  assert.equal(baseline.schema, "edge-benchmark-baseline/1");
  for (const key of ["provenance", "protocol", "workloadSet", "exactResultSha256"]) {
    assert.deepEqual(baseline[key], inputs[0].report[key]);
  }
  assert.equal(baseline.runs.length, inputs.length);
  for (const [index, run] of baseline.runs.entries()) {
    const original = inputs[index];
    assert.equal(run.rawSha256, original.rawSha256);
    assert.equal(run.startedAt, original.report.startedAt);
    assert.equal(run.completedAt, original.report.completedAt);
    for (const [resultIndex, result] of run.results.entries()) {
      const source = original.report.results[resultIndex];
      assert.deepEqual(result.samples, source.samples.map(({ elapsedNs }) => elapsedNs));
      assert.deepEqual(result.summary, summarizeSamples(result.samples, result.iterationsPerSample));
      assert.equal(result.checksum, source.samples[0].checksum);
      assert.deepEqual(result.warmup, source.warmup);
    }
  }
  assert.deepEqual(baseline.results, [
    { id: "chart", medianMs: 6, minRunMedianMs: 3, maxRunMedianMs: 12 },
    { id: "houses", medianMs: 12, minRunMedianMs: 6, maxRunMedianMs: 24 },
    { id: "transit-scan", medianMs: 18, minRunMedianMs: 9, maxRunMedianMs: 36 }
  ]);
  assert.deepEqual(compactBaseline([...inputs].reverse()).results, baseline.results,
    "Caller order must not select a favorable run.");
  assert.equal(compactBaseline([...inputs, entry(3, 3)]).results[0].medianMs, 7.5,
    "An even run count averages its middle pair.");
});

test("baseline refuses missing independent runs and duplicated raw records", () => {
  assert.throws(() => compactBaseline(entries().slice(0, 2)), /at least three/);
  const inputs = entries();
  inputs[2] = inputs[0];
  assert.throws(() => compactBaseline(inputs), /Duplicate raw run/);
  const reformatted = entries();
  reformatted[2] = {
    report: structuredClone(reformatted[0].report),
    rawSha256: hash(JSON.stringify(reformatted[0].report))
  };
  assert.throws(() => compactBaseline(reformatted), /Duplicate measurement interval/);
  for (const rawSha256 of [undefined, "x".repeat(64), "a".repeat(63), "a".repeat(64) + "\n", { toString: () => "a".repeat(64) }]) {
    const invalid = entries();
    invalid[1].rawSha256 = rawSha256;
    assert.throws(() => compactBaseline(invalid), /raw file digest/);
  }
});

for (const field of ["machine", "runtime", "runner", "build"]) {
  test(`baseline refuses incompatible ${field} provenance`, () => {
    const inputs = entries();
    inputs[1].report.provenance[field].changed = true;
    assert.throws(() => compactBaseline(inputs), /Incompatible benchmark provenance/);
  });
}

test("baseline refuses protocol, workload or output differences", () => {
  const protocol = entries();
  const changed = protocol[1].report;
  changed.protocol.warmupBatches = 3;
  for (const result of changed.results) {
    result.warmup.batches = 3;
    result.warmup.iterations = result.iterationsPerSample * 3;
    result.warmup.checksum = result.samples[0].checksum * 3;
  }
  assert.throws(() => compactBaseline(protocol), /Incompatible benchmark protocol/);
  for (const mutate of [
    (report) => { report.workloadSet.sha256 = "e".repeat(64); },
    (report) => { report.workloadSet.definitions[0].inputs.changed = true; },
    (report) => { report.exactResultSha256 = "f".repeat(64); }
  ]) {
    const inputs = entries();
    mutate(inputs[1].report);
    assert.throws(() => compactBaseline(inputs), /Incompatible benchmark/);
  }
  for (const where of ["warmup", "samples"]) {
    const inputs = entries();
    const result = inputs[1].report.results[0];
    if (where === "warmup") {
      result.warmup.checksum += 1;
      assert.throws(() => compactBaseline(inputs), /Warmup checksum does not match/);
    } else {
      result.samples.forEach((sample) => { sample.checksum += 1; });
      result.warmup.checksum += result.warmup.batches;
      assert.throws(() => compactBaseline(inputs), /checksums differ between runs/);
    }
  }
});

for (const value of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, "100"] ) {
  test(`raw report refuses invalid timing ${String(value)}`, () => {
    for (const where of ["warmup", "samples"]) {
      const { report } = entry(0);
      const target = where === "warmup" ? report.results[0].warmup : report.results[0].samples[0];
      target.elapsedNs = value;
      assert.throws(() => validateBenchmarkRun(report), /positive safe integer/);
    }
  });
}

test("raw report refuses forged summaries and invalid checksums", () => {
  for (const key of ["sampleCount", "minMs", "medianMs", "p95Ms", "maxMs", "madMs"]) {
    const { report } = entry(0);
    report.results[0].summary[key] += 1;
    assert.throws(() => validateBenchmarkRun(report), /summary does not match/);
  }
  for (const checksum of [NaN, Infinity, "123", null]) {
    const { report } = entry(0);
    report.results[0].samples[0].checksum = checksum;
    assert.throws(() => validateBenchmarkRun(report), /finite number/);
  }
  const { report } = entry(0);
  report.results[0].samples[1].checksum += 1;
  assert.throws(() => validateBenchmarkRun(report), /checksums differ within/);
});

test("raw report refuses missing, duplicate and reordered workloads", () => {
  for (const key of ["results", "definitions"]) {
    for (const mutate of [
      (rows) => rows.pop(),
      (rows) => { rows[1] = structuredClone(rows[0]); },
      (rows) => rows.reverse()
    ]) {
      const { report } = entry(0);
      mutate(key === "results" ? report.results : report.workloadSet.definitions);
      assert.throws(() => validateBenchmarkRun(report), /every workload in order/);
    }
  }
});

test("raw report enforces iterations, warmup and sampling protocol", () => {
  for (const mutate of [
    (report) => { report.protocol.samples = 1; },
    (report) => { report.protocol.order.reverse(); },
    (report) => { report.protocol.iterations.chart += 1; },
    (report) => { report.results[0].iterationsPerSample += 1; },
    (report) => { report.results[0].warmup.batches += 1; },
    (report) => { report.results[0].warmup.iterations += 1; },
    (report) => { report.results[0].samples.pop(); }
  ]) {
    const { report } = entry(0);
    mutate(report);
    assert.throws(() => validateBenchmarkRun(report), /protocol|samples must be/);
  }
});

test("raw report requires schemas, digests, timestamps and complete provenance", () => {
  for (const mutate of [
    (report) => { report.schema = "other"; },
    (report) => { report.workloadSet.schema = "other"; },
    (report) => { report.workloadSet.sha256 = "bad"; },
    (report) => { report.exactResultSha256 = "bad"; },
    (report) => { report.startedAt = "yesterday"; },
    (report) => { report.completedAt = "2025-12-31T00:00:00.000Z"; },
    (report) => { report.startedAt = "2026-01-01T00:00:00+00:00"; },
    (report) => { delete report.provenance.runtime; },
    (report) => { report.provenance.runner = {}; },
    (report) => { delete report.workloadSet.definitions[0].inputs; }
  ]) {
    const { report } = entry(0);
    mutate(report);
    assert.throws(() => validateBenchmarkRun(report));
  }
});

test("raw provenance requires host, runtime, build and self-consistent source records", () => {
  for (const mutate of [
    (provenance) => { delete provenance.machine.cpuModels; },
    (provenance) => { provenance.machine.cpuModels = []; },
    (provenance) => { provenance.machine.logicalCpuCount = 0; },
    (provenance) => { provenance.machine.totalMemoryBytes = Infinity; },
    (provenance) => { delete provenance.machine.cgroupV2.cpuMax; },
    (provenance) => { provenance.machine.label += "\n"; },
    (provenance) => { provenance.runtime.node = "24.0.0"; },
    (provenance) => { delete provenance.runtime.v8; },
    (provenance) => { delete provenance.runtime.uv; },
    (provenance) => { provenance.runtime.execArgv = ["--jitless"]; },
    (provenance) => { provenance.runtime.nodeOptions = true; },
    (provenance) => { provenance.runner.sources = []; },
    (provenance) => { provenance.runner.sources[0].sha256 = "f".repeat(64); },
    (provenance) => { provenance.runner.sourceDigest += "\n"; },
    (provenance) => { provenance.build.schema = "unknown"; },
    (provenance) => { provenance.build.target = "browser"; },
    (provenance) => { delete provenance.build.engineVersion; },
    (provenance) => { delete provenance.build.ephemeris; },
    (provenance) => { provenance.build.toolchain.node = "v22.1.0"; },
    (provenance) => { provenance.build.config = {}; },
    (provenance) => { provenance.build.sources[0].bytes += 1; },
    (provenance) => { provenance.build.outputs[0].sha256 += "\n"; },
    (provenance) => { provenance.build.outputs[0].path = "engine.mjs"; }
  ]) {
    const { report } = entry(0);
    mutate(report.provenance);
    assert.throws(() => validateBenchmarkRun(report));
  }
});

async function temporaryResults(t) {
  await mkdir(resolve(edgeRoot, "results"), { recursive: true });
  const directory = await mkdtemp(resolve(edgeRoot, "results/baseline-check-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test("baseline CLI reads only explicit local raw files and emits recomputable JSON", async (t) => {
  const directory = await temporaryResults(t);
  const paths = await Promise.all(entries().map(async ({ report }, index) => {
    const path = resolve(directory, `run-${index}.json`);
    await writeFile(path, encode(report));
    return path;
  }));
  const baseline = await baselineFromFiles(paths);
  const stdout = execFileSync(process.execPath, [resolve(edgeRoot, "scripts/benchmark-baseline.mjs"), ...paths],
    { encoding: "utf8", maxBuffer: 2_000_000 });
  assert.deepEqual(JSON.parse(stdout), baseline);
  assert(!stdout.includes(directory), "Baseline must not disclose absolute raw paths.");
  for (const [index, path] of paths.entries()) {
    assert.equal(baseline.runs[index].rawSha256, hash(await readFile(path)));
  }
  await assert.rejects(baselineFromFiles(paths.slice(0, 2)), /at least three/);
  await assert.rejects(baselineFromFiles([paths[0], paths[1], paths[0]]), /Duplicate raw run/);
  const failed = spawnSync(process.execPath, [resolve(edgeRoot, "scripts/benchmark-baseline.mjs")], { encoding: "utf8" });
  assert.notEqual(failed.status, 0);
  assert.match(failed.stderr, /at least three/);
});

test("raw file input rejects outside paths, symlinks, invalid JSON and malformed UTF-8", async (t) => {
  const directory = await temporaryResults(t);
  await assert.rejects(readRawBenchmark(resolve(edgeRoot, "package.json")), /below edge\/results/);
  await assert.rejects(readRawBenchmark(resolve(edgeRoot, "results")), /below edge\/results/);
  const file = resolve(directory, "invalid.json");
  await writeFile(file, "{broken");
  await assert.rejects(readRawBenchmark(file), SyntaxError);
  await writeFile(file, Buffer.from([0xc3, 0x28]));
  await assert.rejects(readRawBenchmark(file), /encoded data was not valid/);
  await writeFile(file, encode(entry(0).report));
  if (process.platform !== "win32") {
    const link = resolve(directory, "link.json");
    await symlink(file, link);
    await assert.rejects(readRawBenchmark(link), /symlinks/);
  }
});
