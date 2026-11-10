import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs, { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { relative, resolve } from "node:path";
import test from "node:test";
import { compactBaseline, validateBenchmarkBaseline } from "../scripts/benchmark-baseline.mjs";
import { benchmarkProtocol, summarizeSamples, WORKLOAD_IDS } from "../scripts/benchmark-core.mjs";
import { compareBenchmarks, gateFromFiles, parseGateOptions, readGateRecord } from "../scripts/benchmark-gate.mjs";
import { edgeRoot } from "../scripts/build-support.mjs";

const hash = (value) => createHash("sha256").update(value).digest("hex");
const encode = (value) => JSON.stringify(value, null, 2) + "\n";

// Constructed nanosecond timings and provenance test validation and arithmetic.
// None of these fixtures is a performance measurement or an accuracy reference.
function fixture({ candidate = false, batches = [[900, 1000, 1100], [900, 1000, 1100], [900, 1000, 1100]],
  warmupBatches = 2, change = () => {} } = {}) {
  const protocol = benchmarkProtocol({ samples: batches[0].length, warmupBatches });
  const runnerSources = [{ path: "scripts/synthetic-runner.mjs", bytes: 100, sha256: "a".repeat(64) }];
  const buildSources = [{ path: "src/synthetic-workloads.ts", bytes: 100, sha256: "b".repeat(64) }];
  const provenance = {
    machine: {
      label: "synthetic-gate-test", platform: "linux", arch: "x64", release: "synthetic-kernel",
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
  };
  const origin = Date.parse(candidate ? "2026-01-02T00:00:00.000Z" : "2026-01-01T00:00:00.000Z");
  return compactBaseline(batches.map((elapsedNs, index) => {
    const report = {
      schema: "edge-benchmark-run/1",
      startedAt: new Date(origin + index * 10_000).toISOString(),
      completedAt: new Date(origin + index * 10_000 + 1000).toISOString(),
      protocol: structuredClone(protocol), provenance: structuredClone(provenance),
      workloadSet: {
        schema: "edge-benchmark-workloads/1", sha256: "c".repeat(64),
        definitions: WORKLOAD_IDS.map((id) => ({ id, unit: "one synthetic call", inputs: { synthetic: true } }))
      },
      exactResultSha256: "d".repeat(64),
      results: WORKLOAD_IDS.map((id, resultIndex) => {
        const iterations = protocol.iterations[id], checksum = 123 + resultIndex;
        return {
          id, iterationsPerSample: iterations,
          warmup: { batches: warmupBatches, iterations: iterations * warmupBatches, elapsedNs: 1000,
            checksum: checksum * warmupBatches },
          samples: elapsedNs.map((value) => ({ elapsedNs: value, checksum })),
          summary: summarizeSamples(elapsedNs, iterations)
        };
      })
    };
    change(report, index);
    return { report, rawSha256: hash(encode(report)) };
  }));
}

const repeated = (ns) => Array.from({ length: 3 }, () => [ns, ns, ns]);

function setSamples(report, id, samples) {
  const result = report.results.find((row) => row.id === id);
  result.samples = samples.map((elapsedNs) => ({ elapsedNs, checksum: result.samples[0].checksum }));
  result.summary = summarizeSamples(samples, result.iterationsPerSample);
}

test("gate passes unchanged and faster independent captures without changing either input", () => {
  const baseline = fixture(), candidate = fixture({ candidate: true });
  const saved = structuredClone({ baseline, candidate });
  const result = compareBenchmarks(baseline, candidate);
  assert.equal(result.schema, "edge-benchmark-gate/1");
  assert.equal(result.status, "pass");
  assert.equal(result.thresholdPercent, 10);
  assert.equal(result.statistic, "median of run medians");
  assert.equal(result.unit, "ms/workload-invocation");
  assert.deepEqual(result.results.map(({ id, status, changePercent }) => ({ id, status, changePercent })),
    WORKLOAD_IDS.map((id) => ({ id, status: "pass", changePercent: 0 })));
  assert.deepEqual({ baseline, candidate }, saved);
  const faster = compareBenchmarks(baseline, fixture({ candidate: true, batches: repeated(500) }));
  assert.equal(faster.status, "pass");
  assert(faster.results.every(({ changePercent }) => changePercent === -50));
});

for (const id of WORKLOAD_IDS) {
  test(`gate fails when only ${id} exceeds its threshold`, () => {
    const result = compareBenchmarks(fixture(), fixture({ candidate: true,
      change: (report) => setSamples(report, id, [1200, 1200, 1200]) }));
    assert.equal(result.status, "regression");
    assert.deepEqual(result.results.map(({ id: rowId, status }) => [rowId, status]),
      WORKLOAD_IDS.map((rowId) => [rowId, rowId === id ? "regression" : "pass"]));
    assert.equal(result.results.find((row) => row.id === id).changePercent, 20);
  });
}

for (const [thresholdPercent, baselineNs, boundaryNs] of [
  ["10", 1000, 1100], ["0.1", 1000, 1001], ["2.5", 1000, 1025],
  ["0.000001", 100_000_000, 100_000_001], ["100", 1000, 2000], ["0", 1000, 1000]
]) {
  test(`gate accepts equality at ${thresholdPercent} percent and rejects one nanosecond above it`, () => {
    const baseline = fixture({ batches: repeated(baselineNs) });
    for (const [ns, expected] of [[boundaryNs, "pass"], [boundaryNs + 1, "regression"]]) {
      const result = compareBenchmarks(baseline, fixture({ candidate: true, batches: repeated(ns) }), { thresholdPercent });
      assert.equal(result.status, expected);
      assert(result.results.every(({ status }) => status === expected));
    }
  });
}

test("gate preserves both even medians and quarter-nanosecond boundary decisions", () => {
  // Run medians are 399, 399.5, 400.5 and 402 ns; their median is 400 ns.
  const baseline = fixture({ batches: [[390, 398, 400, 410], [390, 399, 400, 410],
    [390, 400, 401, 410], [390, 401, 403, 410]] });
  // Run medians are 409, 410, 410 and 412 ns; their median is 410 ns.
  const batches = [[400, 408, 410, 420], [400, 409, 411, 420],
    [400, 409, 411, 420], [400, 411, 413, 420]];
  assert.equal(compareBenchmarks(baseline, fixture({ candidate: true, batches }), { thresholdPercent: "2.5" }).status, "pass");
  batches[2][2] += 1; // A middle sample moves the median of run medians to 410.25 ns.
  const result = compareBenchmarks(baseline, fixture({ candidate: true, batches }), { thresholdPercent: "2.5" });
  assert.equal(result.status, "regression");
  assert(result.results.every(({ changePercent }) => changePercent === 2.5625));
});

test("gate compares the median of run medians rather than pooled samples or a favorable run", () => {
  const baseline = fixture({ batches: [[1, 100, 100], [1, 100, 100], [1, 1, 100]] });
  const candidate = fixture({ candidate: true, batches: repeated(110) });
  assert.equal(compareBenchmarks(baseline, candidate).status, "pass");
  baseline.runs.reverse();
  candidate.runs.reverse();
  assert.equal(compareBenchmarks(baseline, candidate).status, "pass");
  assert.equal(compareBenchmarks(baseline, fixture({ candidate: true, batches: repeated(111) })).status, "regression");
});

test("gate uses exact integer arithmetic near the safe-integer timing limit", () => {
  const baseline = fixture({ batches: repeated(8_000_000_000_000_000) });
  const at = fixture({ candidate: true, batches: repeated(8_800_000_000_000_000) });
  const above = fixture({ candidate: true, batches: repeated(8_800_000_000_000_001) });
  assert.equal(compareBenchmarks(baseline, at).status, "pass");
  assert.equal(compareBenchmarks(baseline, above).status, "regression");
});

test("threshold is configurable and CLI options reject ambiguous or malformed input", () => {
  const flags = ["--baseline", "baseline.json", "--candidate", "candidate.json"];
  assert.deepEqual(parseGateOptions(flags), { baseline: "baseline.json", candidate: "candidate.json", thresholdPercent: "10" });
  assert.deepEqual(parseGateOptions(["--threshold-percent", "2.500000", ...flags]),
    { baseline: "baseline.json", candidate: "candidate.json", thresholdPercent: "2.500000" });
  const baseline = fixture(), candidate = fixture({ candidate: true, batches: repeated(1200) });
  assert.equal(compareBenchmarks(baseline, candidate, { thresholdPercent: "20" }).status, "pass");
  assert.equal(compareBenchmarks(baseline, candidate, { thresholdPercent: "19.999999" }).status, "regression");
  for (const args of [[], ["--baseline", "x"], ["--candidate", "x"], [...flags, "--unknown", "x"],
    [...flags, "extra"], [...flags, "--threshold-percent"], [...flags, "--baseline", "x"],
    [...flags, "--candidate", "x"], [...flags, "--threshold-percent", "10", "--threshold-percent", "20"],
    ["--baseline", "", "--candidate", "x"], ["--baseline", "   ", "--candidate", "x"],
    ["--baseline", "--candidate", "x"]]) {
    assert.throws(() => parseGateOptions(args), /Usage:/);
  }
  for (const value of ["", " ", " 10", "10 ", "10\n", "-1", "+1", "01", ".1", "1.", "1e1", "0x10",
    "NaN", "Infinity", "100.000001", "101", "1000", "0.0000001", "10%", 10, null, false]) {
    assert.throws(() => compareBenchmarks(baseline, candidate, { thresholdPercent: value }), /Threshold/);
    assert.throws(() => parseGateOptions([...flags, "--threshold-percent", value]));
  }
});

for (const [label, change] of [
  ["machine label", (r) => { r.provenance.machine.label = "different-machine"; }],
  ["CPU model", (r) => { r.provenance.machine.cpuModels = ["different-cpu"]; }],
  ["CPU limit", (r) => { r.provenance.machine.cgroupV2.cpuMax = "100000 100000"; }],
  ["memory", (r) => { r.provenance.machine.totalMemoryBytes += 1; }],
  ["runtime", (r) => { r.provenance.runtime.v8 = "different-v8"; }],
  ["Node version", (r) => { r.provenance.runtime.node = "22.1.0"; r.provenance.build.toolchain.node = "v22.1.0"; }],
  ["runner", (r) => {
    r.provenance.runner.sources[0].sha256 = "f".repeat(64);
    r.provenance.runner.sourceDigest = hash(encode(r.provenance.runner.sources));
  }],
  ["workload digest", (r) => { r.workloadSet.sha256 = "f".repeat(64); }],
  ["workload inputs", (r) => { r.workloadSet.definitions[0].inputs.changed = true; }],
  ["exact output", (r) => { r.exactResultSha256 = "f".repeat(64); }],
  ["engine version", (r) => { r.provenance.build.engineVersion = "1.0.1"; }],
  ["ephemeris version", (r) => { r.provenance.build.ephemeris.version = "synthetic-other"; }],
  ["bundler version", (r) => { r.provenance.build.toolchain.esbuild = "synthetic-other"; }],
  ["build configuration", (r) => { r.provenance.build.config.minify = true; }],
  ["workload checksum", (r) => {
    r.results[0].samples.forEach((sample) => { sample.checksum += 1; });
    r.results[0].warmup.checksum += r.protocol.warmupBatches;
  }]
]) {
  test(`gate refuses incomparable ${label}`, () => {
    const candidate = fixture({ candidate: true, change });
    validateBenchmarkBaseline(candidate);
    assert.throws(() => compareBenchmarks(fixture(), candidate), /Incompatible/);
  });
}

test("gate refuses different sample, warmup and independent run counts", () => {
  const baseline = fixture();
  for (const candidate of [fixture({ candidate: true, batches: Array.from({ length: 3 }, () => [900, 1000, 1000, 1100]) }),
    fixture({ candidate: true, warmupBatches: 3 }), fixture({ candidate: true, batches: [...repeated(1000), [1000, 1000, 1000]] })]) {
    validateBenchmarkBaseline(candidate);
    assert.throws(() => compareBenchmarks(baseline, candidate), /Incompatible/);
  }
});

test("gate accepts changed build source and output identities while retaining them in its report", () => {
  const baseline = fixture(), candidate = fixture({ candidate: true, change: (r) => {
    r.provenance.build.sources[0].sha256 = "f".repeat(64);
    r.provenance.build.sources[0].bytes += 1;
    r.provenance.build.sourceDigest = hash(encode(r.provenance.build.sources));
    r.provenance.build.outputs[0].sha256 = "9".repeat(64);
    r.provenance.build.outputs[0].bytes += 1;
  } });
  const result = compareBenchmarks(baseline, candidate);
  assert.equal(result.status, "pass");
  for (const [record, identity] of [[baseline, result.baseline], [candidate, result.candidate]]) {
    assert.equal(identity.buildSourceDigest, record.provenance.build.sourceDigest);
    assert.equal(identity.workloadBundleSha256, record.provenance.build.outputs[0].sha256);
    assert.deepEqual(identity.runs, record.runs.map(({ startedAt, completedAt, rawSha256 }) => ({ startedAt, completedAt, rawSha256 })));
  }
  assert.notEqual(result.baseline.buildSourceDigest, result.candidate.buildSourceDigest);
  assert.notEqual(result.baseline.workloadBundleSha256, result.candidate.workloadBundleSha256);
});

test("gate revalidates missing, duplicated and reordered workloads in either compact record", () => {
  for (const key of ["results", "definitions", "run-results"]) {
    for (const mutate of [(rows) => rows.pop(), (rows) => { rows[1] = structuredClone(rows[0]); }, (rows) => rows.reverse()]) {
      for (const side of ["baseline", "candidate"]) {
        const records = { baseline: fixture(), candidate: fixture({ candidate: true }) };
        const record = records[side];
        mutate(key === "definitions" ? record.workloadSet.definitions : key === "run-results" ? record.runs[0].results : record.results);
        assert.throws(() => compareBenchmarks(records.baseline, records.candidate), new RegExp(`Invalid ${side}:`));
      }
    }
  }
});

test("gate refuses forged run summaries, aggregate summaries and malformed compact records", () => {
  const mutations = [
    (r) => { r.schema = "edge-benchmark-run/1"; }, (r) => { r.runs = null; }, (r) => { r.runs.pop(); },
    (r) => { r.runs[0].results = {}; }, (r) => { r.runs[0].results[0].samples = null; },
    (r) => { r.runs[0].results[0].samples[0] = 0; }, (r) => { r.runs[0].results[0].samples[0] = 1.5; },
    (r) => { r.runs[0].rawSha256 = "invalid"; }, (r) => { r.runs[0].startedAt = "yesterday"; },
    (r) => { r.runs[0].results[0].checksum = Infinity; }, (r) => { r.runs[0].results[0].warmup.checksum += 1; },
    (r) => { r.provenance.build.sourceDigest = "f".repeat(64); }, (r) => { delete r.exactResultSha256; },
    (r) => { r.results[0].extra = true; }
  ];
  for (const key of ["sampleCount", "minMs", "medianMs", "p95Ms", "maxMs", "madMs"]) {
    mutations.push((r) => { r.runs[0].results[0].summary[key] += 1; });
  }
  for (const key of ["medianMs", "minRunMedianMs", "maxRunMedianMs"]) {
    mutations.push((r) => { r.results[0][key] += 1; });
  }
  for (const mutate of mutations) {
    for (const side of ["baseline", "candidate"]) {
      const records = { baseline: fixture(), candidate: fixture({ candidate: true }) };
      mutate(records[side]);
      assert.throws(() => compareBenchmarks(records.baseline, records.candidate), new RegExp(`Invalid ${side}:`));
    }
  }
  for (const invalid of [null, [], {}, "bad"]) {
    assert.throws(() => compareBenchmarks(invalid, fixture({ candidate: true })), /Invalid baseline:/);
    assert.throws(() => compareBenchmarks(fixture(), invalid), /Invalid candidate:/);
  }
});

test("gate refuses reused captures and overlapping intervals within or between records", () => {
  const baseline = fixture();
  assert.throws(() => compareBenchmarks(baseline, baseline), /reuse raw runs/);
  const reused = fixture({ candidate: true });
  reused.runs[1].rawSha256 = baseline.runs[0].rawSha256;
  assert.throws(() => compareBenchmarks(baseline, reused), /reuse raw runs/);
  for (const [start, end] of [["2026-01-01T00:00:00.000Z", "2026-01-01T00:00:01.000Z"],
    ["2026-01-01T00:00:00.500Z", "2026-01-01T00:00:02.000Z"],
    ["2026-01-02T00:00:09.500Z", "2026-01-02T00:00:10.500Z"]]) {
    const candidate = fixture({ candidate: true });
    candidate.runs[0].startedAt = start;
    candidate.runs[0].completedAt = end;
    assert.throws(() => compareBenchmarks(baseline, candidate), /independent.*overlap/);
  }
  for (const side of ["baseline", "candidate"]) {
    const records = { baseline: fixture(), candidate: fixture({ candidate: true }) };
    records[side].runs[0].completedAt = records[side].runs[0].startedAt;
    assert.throws(() => compareBenchmarks(records.baseline, records.candidate), /positive duration/);
  }
  const candidate = fixture({ candidate: true });
  candidate.runs[0].startedAt = "2026-01-01T00:00:01.000Z";
  candidate.runs[0].completedAt = "2026-01-01T00:00:02.000Z";
  assert.equal(compareBenchmarks(baseline, candidate).status, "pass", "Adjacent independent intervals may touch.");
});

async function temporaryResults(t) {
  await mkdir(resolve(edgeRoot, "results"), { recursive: true });
  const directory = await mkdtemp(resolve(edgeRoot, "results/gate-check-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

function cli(args, cwd) {
  return spawnSync(process.execPath, [resolve(edgeRoot, "scripts/benchmark-gate.mjs"), ...args],
    { cwd, encoding: "utf8", maxBuffer: 2_000_000, timeout: 20_000 });
}

test("gate CLI emits JSON with file digests and uses exit codes zero, one and two", async (t) => {
  const directory = await temporaryResults(t);
  const baseline = resolve(directory, "baseline.json"), candidate = resolve(directory, "candidate.json");
  await writeFile(baseline, encode(fixture()));
  await writeFile(candidate, encode(fixture({ candidate: true })));
  const options = { baseline, candidate, thresholdPercent: "10" };
  const expected = await gateFromFiles(options);
  assert.deepEqual(expected.inputSha256, { baseline: hash(await readFile(baseline)), candidate: hash(await readFile(candidate)) });
  const args = ["--baseline", "baseline.json", "--candidate", "candidate.json"];
  const passed = cli(args, directory);
  assert.equal(passed.error, undefined);
  assert.equal(passed.status, 0, passed.stderr);
  assert.equal(passed.stderr, "");
  assert.deepEqual(JSON.parse(passed.stdout), expected);
  assert(!passed.stdout.includes(directory), "Report must not disclose local absolute paths.");
  await writeFile(candidate, encode(fixture({ candidate: true, batches: repeated(1200) })));
  const regressed = cli(args, directory);
  assert.equal(regressed.status, 1, regressed.stderr);
  assert.equal(regressed.stderr, "");
  assert.equal(JSON.parse(regressed.stdout).status, "regression");
  assert.equal(cli([...args, "--threshold-percent", "20"], directory).status, 0);
  await writeFile(candidate, encode({ schema: "invalid" }));
  const invalid = cli(args, directory);
  assert.equal(invalid.status, 2);
  assert.equal(invalid.stdout, "");
  assert.match(invalid.stderr, /Performance gate refused comparison: Invalid candidate/);
  for (const badArgs of [[], [...args, "--unknown", "x"], [...args, "--threshold-percent", "NaN"],
    ["--baseline", "baseline.json", "--candidate", "missing.json"]]) {
    const refused = cli(badArgs, directory);
    assert.equal(refused.status, 2);
    assert.equal(refused.stdout, "");
    assert.match(refused.stderr, /Performance gate refused comparison:/);
  }
});

test("gate input validates paths, file kind, JSON and UTF-8 before comparison", async (t) => {
  const directory = await temporaryResults(t), file = resolve(directory, "candidate.json");
  await writeFile(file, encode(fixture({ candidate: true })));
  const read = await readGateRecord(relative(process.cwd(), file));
  assert.deepEqual(read.record, fixture({ candidate: true }));
  assert.equal(read.sha256, hash(await readFile(file)));
  for (const path of [edgeRoot, resolve(edgeRoot, "../package.json"), resolve(edgeRoot, "../edge-other/missing.json")]) {
    await assert.rejects(readGateRecord(path), /below edge\//);
  }
  await assert.rejects(readGateRecord(resolve(directory, "missing.json")), /ENOENT/);
  await assert.rejects(readGateRecord(directory), /regular file|EISDIR/);
  if (process.platform !== "win32") {
    const link = resolve(directory, "linked.json"), parentLink = resolve(directory, "linked-directory");
    await symlink(file, link);
    await symlink(directory, parentLink);
    await assert.rejects(readGateRecord(link), /symlinks/);
    await assert.rejects(readGateRecord(resolve(parentLink, "candidate.json")), /symlinks/);
    const outsideLink = resolve(directory, "outside.json");
    await symlink(resolve(edgeRoot, "../package.json"), outsideLink);
    await assert.rejects(readGateRecord(outsideLink), /symlinks/);
  }
  for (const bytes of ["{broken", "", Buffer.from([0x7b, 0x22, 0xc3, 0x28, 0x22, 0x3a, 0x31, 0x7d])]) {
    await writeFile(file, bytes);
    await assert.rejects(readGateRecord(file), /JSON|encoded data was not valid/);
    const refused = cli(["--baseline", file, "--candidate", file], directory);
    assert.equal(refused.status, 2);
    assert.equal(refused.stdout, "");
  }
});

test("gate bounds input size before reading and when a file grows during reading", async (t) => {
  const directory = await temporaryResults(t), file = resolve(directory, "small.json");
  await writeFile(file, "null\n");
  // Mock descriptors avoid creating any file that violates the repository size limit.
  for (const reportedSize of [2_000_000, 1]) {
    let readBytes = 0, closed = false;
    const mocked = t.mock.method(fs, "open", async () => ({
      stat: async () => ({ isFile: () => true, size: reportedSize }),
      read: async (buffer, offset, length) => {
        assert(length <= 2_000_000 - readBytes);
        buffer.fill(0x20, offset, offset + length);
        readBytes += length;
        return { bytesRead: length };
      },
      close: async () => { closed = true; }
    }));
    syncBuiltinESMExports();
    try {
      await assert.rejects(readGateRecord(file), /project size limit/);
      assert.equal(readBytes, reportedSize === 1 ? 2_000_000 : 0);
      assert.equal(closed, true);
    } finally {
      mocked.mock.restore();
      syncBuiltinESMExports();
    }
  }
  assert.equal((await readGateRecord(file)).record, null, "The file reader is restored after descriptor tests.");
});
