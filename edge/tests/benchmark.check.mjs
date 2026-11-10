import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { benchmarkProtocol, measureWorkload, summarizeSamples, WORKLOAD_IDS } from "../scripts/benchmark-core.mjs";
import { benchmarkWorkloads } from "../scripts/benchmark-workloads.mjs";
import { parseBenchmarkOptions } from "../scripts/benchmark.mjs";
import { requireNode22 } from "../scripts/build-support.mjs";

requireNode22();
const execFileAsync = promisify(execFile);
const cli = fileURLToPath(new URL("../scripts/benchmark.mjs", import.meta.url));
const subprocessEnvironment = { ...process.env };
delete subprocessEnvironment.NODE_OPTIONS;
const protocol = (overrides = {}) => ({ samples: 3, warmupBatches: 1, iterations: { synthetic: 2 }, ...overrides });
const workload = (overrides = {}) => ({
  id: "synthetic",
  run: () => ({ value: 5, metadata: { stable: true }, at: new Date(0) }),
  consume: ({ value }) => value,
  validate: (result) => assert.equal(result.value, 5),
  ...overrides
});
function clock(durations = [1_000_000n, 1_000_000n, 1_000_000n, 1_000_000n]) {
  let time = 0n, calls = 0;
  return () => {
    if (calls++ % 2) time += durations[(calls / 2) - 1];
    return time;
  };
}

test("protocol fixes workload ordering and gives each invocation its own unit", () => {
  const settings = benchmarkProtocol();
  assert.equal(settings.schema, "edge-benchmark-protocol/1");
  assert.equal(settings.clock, "process.hrtime.bigint");
  assert.equal(settings.unit, "ms/workload-invocation");
  assert.deepEqual(settings.order, ["chart", "houses", "transit-scan"]);
  assert.deepEqual(Object.keys(settings.iterations), [...WORKLOAD_IDS]);
  for (const iterations of Object.values(settings.iterations)) assert(Number.isSafeInteger(iterations) && iterations > 0);
  settings.order.reverse();
  settings.iterations.chart = 0;
  assert.deepEqual(benchmarkProtocol().order, [...WORKLOAD_IDS]);
  assert(benchmarkProtocol().iterations.chart > 0);
  assert.deepEqual(benchmarkProtocol({ samples: 3, warmupBatches: 1 }), {
    ...benchmarkProtocol(), samples: 3, warmupBatches: 1
  });
  assert.doesNotThrow(() => benchmarkProtocol({ samples: 101, warmupBatches: 100 }));
  for (const samples of [0, 1, 2, 102, -1, 3.5, NaN, Infinity, "3", null]) {
    assert.throws(() => benchmarkProtocol({ samples }), /samples must/);
  }
  for (const warmupBatches of [0, -1, 101, 1.5, NaN, Infinity, "1", null]) {
    assert.throws(() => benchmarkProtocol({ warmupBatches }), /warmupBatches must/);
  }
});

test("summary uses per-invocation milliseconds, median, nearest-rank p95 and median absolute deviation", () => {
  const samples = Object.freeze([500_000_000, 100_000_000, 200_000_000, 400_000_000, 300_000_000]);
  assert.deepEqual(summarizeSamples(samples, 100), {
    sampleCount: 5, minMs: 1, medianMs: 3, p95Ms: 5, maxMs: 5, madMs: 1
  });
  assert.deepEqual(summarizeSamples([40_000_000, 10_000_000, 30_000_000, 20_000_000], 10), {
    sampleCount: 4, minMs: 1, medianMs: 2.5, p95Ms: 4, maxMs: 4, madMs: 1
  });
  assert.deepEqual(summarizeSamples(Array.from({ length: 20 }, (_, i) => (20 - i) * 1_000_000), 1), {
    sampleCount: 20, minMs: 1, medianMs: 10.5, p95Ms: 19, maxMs: 20, madMs: 5
  });
  assert.deepEqual(summarizeSamples([1], 1), {
    sampleCount: 1, minMs: 0.000001, medianMs: 0.000001, p95Ms: 0.000001, maxMs: 0.000001, madMs: 0
  });
});

test("summary rejects invalid durations, sparse samples and invalid iteration counts", () => {
  for (const value of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, "1", null]) {
    assert.throws(() => summarizeSamples([1, value, 2], 1), /Invalid sample duration/);
  }
  for (const values of [[], null, {}, new Array(3), [1, , 2]]) {
    assert.throws(() => summarizeSamples(values, 1), /Invalid sample duration/);
  }
  for (const iterations of [0, -1, 1.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1, "1", null]) {
    assert.throws(() => summarizeSamples([1], iterations), /Invalid iteration count/);
  }
});

test("warmup is consumed and recorded separately from timed sample statistics", () => {
  let runCalls = 0, consumeCalls = 0, validateCalls = 0, clockCalls = 0, insideTiming = false;
  const nextTime = clock([20_000_000n, 40_000_000n, 60_000_000n, 80_000_000n, 100_000_000n]);
  const result = measureWorkload(workload({
    run() {
      assert.equal(insideTiming, runCalls++ > 0, "Only the reference calculation is outside timing");
      return { value: 5, at: new Date(0) };
    },
    consume({ value }) {
      assert.equal(insideTiming, consumeCalls++ > 0, "Every batch consumes inside its timed interval");
      return value;
    },
    validate(result) {
      validateCalls++;
      assert.equal(insideTiming, false);
      assert.equal(result.value, 5);
      assert(result.at instanceof Date);
    }
  }), protocol({ warmupBatches: 2 }), {
    now() {
      const value = nextTime();
      insideTiming = ++clockCalls % 2 === 1;
      return value;
    }
  });
  assert.equal(runCalls, 11);
  assert.equal(consumeCalls, 11);
  assert.equal(validateCalls, 1);
  assert.equal(clockCalls, 10);
  assert.deepEqual(result, {
    id: "synthetic", iterationsPerSample: 2,
    warmup: { batches: 2, iterations: 4, elapsedNs: 60_000_000, checksum: 20 },
    samples: [60_000_000, 80_000_000, 100_000_000].map((elapsedNs) => ({ elapsedNs, checksum: 10 })),
    summary: { sampleCount: 3, minMs: 30, medianMs: 40, p95Ms: 50, maxMs: 50, madMs: 10 }
  });
});

test("bad measurement settings reject before invoking a workload or clock", () => {
  const unexpected = () => assert.fail("Invalid settings must not start work");
  for (const invalid of [
    { samples: 0 }, { samples: 1.5 }, { samples: NaN },
    { warmupBatches: 0 }, { warmupBatches: -1 }, { warmupBatches: 1.5 },
    { iterations: {} }, { iterations: { synthetic: 0 } }, { iterations: { synthetic: 1.5 } }
  ]) {
    assert.throws(() => measureWorkload(workload({ run: unexpected }), protocol(invalid), { now: unexpected }),
      /Invalid (?:sample count|workload iteration count)|Warmup is required/);
  }
});

test("invalid duration and reference consumption cannot produce timing evidence", () => {
  for (const duration of [0n, -1n, BigInt(Number.MAX_SAFE_INTEGER) + 1n]) {
    assert.throws(() => measureWorkload(workload(), protocol(), { now: clock([duration]) }), /Invalid sample duration/);
  }
  for (const value of [NaN, Infinity, -Infinity]) {
    assert.throws(() => measureWorkload(workload({ consume: () => value }), protocol(), { now: clock() }),
      /Result consumption must be finite/);
  }
  assert.throws(() => measureWorkload(workload({ consume: () => Number.MAX_VALUE }), protocol(), { now: clock() }),
    /Checksum overflow/);
  assert.throws(() => measureWorkload(workload({ validate: () => { throw new Error("invalid reference"); } }), protocol(), { now: clock() }),
    /invalid reference/);
});

test("changed consumed values reject in warmup and measured samples", () => {
  for (const changeAt of [2, 4]) {
    let calls = 0;
    assert.throws(() => measureWorkload(workload({
      run: () => ({ value: ++calls >= changeAt ? 6 : 5 })
    }), protocol(), { now: clock() }), /consumed results changed/);
  }
});

test("independent reference snapshots detect reused mutable results and unchecked fields", () => {
  const shared = { value: 5, metadata: { stable: true }, at: new Date(0) };
  let calls = 0;
  assert.throws(() => measureWorkload(workload({
    run() {
      if (calls++) shared.metadata.stable = false;
      return shared;
    }
  }), protocol(), { now: clock() }), /full result changed/);
  for (const changed of [
    { value: 5, metadata: { stable: false }, at: new Date(0) },
    { value: 5, metadata: { stable: true }, at: new Date(1) },
    { value: 5, metadata: { stable: true }, at: new Date(0), extra: undefined }
  ]) {
    let runs = 0;
    assert.throws(() => measureWorkload(workload({ run: () => runs++ ? changed : workload().run() }), protocol(), { now: clock() }),
      /full result changed/);
  }
});

test("CLI parsing requires an explicit public label and strict bounded decimal counts", () => {
  assert.deepEqual(parseBenchmarkOptions(["--machine", "ci-linux-22"]), { machine: "ci-linux-22" });
  assert.deepEqual(parseBenchmarkOptions(["--samples", "3", "--machine", "test-host", "--warmup-batches", "1"]), {
    machine: "test-host", samples: 3, warmupBatches: 1
  });
  for (const args of [
    [], ["--machine"], ["--machine", ""], ["--machine", "--samples"], ["--unknown", "x"],
    ["--machine", "a", "--machine", "b"], ["--machine", "a", "--samples", "3", "--samples", "4"],
    ["--machine", "a", "--warmup-batches", "1", "--warmup-batches", "2"],
    ["--samples", "3"], ["--machine=a"], ["--machine", "a", "stray"]
  ]) assert.throws(() => parseBenchmarkOptions(args));
  for (const label of ["UPPER", "has space", "host.example", "user@host", "-leading", "a".repeat(65),
    ...["\n", "\r", "\u2028", "\u2029"].map((suffix) => `public${suffix}`)]) {
    assert.throws(() => parseBenchmarkOptions(["--machine", label]), /public machine label/);
  }
  for (const count of ["0", "-1", "+3", "03", "3.0", "3e0", " 3", "3 ", "NaN", "Infinity", "9007199254740992",
    ...["\n", "\r", "\u2028", "\u2029"].map((suffix) => `3${suffix}`)]) {
    for (const flag of ["--samples", "--warmup-batches"]) {
      assert.throws(() => parseBenchmarkOptions(["--machine", "public", flag, count]));
    }
  }
  assert.throws(() => parseBenchmarkOptions(["--machine", "public", "--samples", "2"]), /samples must/);
  assert.throws(() => parseBenchmarkOptions(["--machine", "public", "--warmup-batches", "101"]), /warmupBatches must/);
});

test("workload validators refuse incomplete or empty computations", () => {
  const definitions = benchmarkWorkloads({
    CHART_CASES: [{ id: "synthetic-chart" }], HOUSE_CASES: [{ id: "synthetic-house" }], HOUSE_SYSTEMS: ["whole"],
    TRANSIT_CASE: { from: "2000-01-01T00:00:00Z", to: "2000-02-01T00:00:00Z", options: { maxSamples: 10 } }
  });
  const [chart, houses, transit] = definitions;
  assert.deepEqual(definitions.map(({ id }) => id), [...WORKLOAD_IDS]);
  assert.throws(() => chart.validate([]));
  assert.throws(() => chart.validate([{ id: "synthetic-chart", result: { bodies: [] } }]), /Empty chart/);
  assert.throws(() => houses.validate([]));
  assert.throws(() => houses.validate([{ id: "synthetic-house", system: "whole", result: { houses: { cusps: [] } } }]));
  const completed = { status: "complete", samples: 5, crossings: [{ at: new Date("2000-01-15T00:00:00Z"), retrograde: false }] };
  assert.doesNotThrow(() => transit.validate(completed));
  for (const result of [
    { ...completed, status: "refused" }, { ...completed, samples: 0 }, { ...completed, samples: 11 },
    { ...completed, crossings: [] }, { ...completed, crossings: [{ at: new Date(NaN) }] },
    { ...completed, crossings: [{ at: new Date("2000-01-01T00:00:00Z") }] },
    { ...completed, crossings: [{ at: new Date("2000-02-02T00:00:00Z") }] }
  ]) assert.throws(() => transit.validate(result));
});

test("CLI errors exit unsuccessfully without printing a partial JSON report", async () => {
  await assert.rejects(execFileAsync(process.execPath, [cli, "--machine", "public", "--samples", "2"], {
    env: subprocessEnvironment, timeout: 30_000
  }), (error) => {
    assert.equal(error.code, 1);
    assert.equal(error.stdout, "");
    assert.match(error.stderr, /Benchmark failed: samples must/);
    return true;
  });
});

test("real workload CLI smoke includes timing, source identities and public provenance", { timeout: 120_000 }, async () => {
  // This is a schema and execution check, never baseline performance evidence.
  const { stdout, stderr } = await execFileAsync(process.execPath, [cli,
    "--machine", "automated-test", "--samples", "3", "--warmup-batches", "1"
  ], { env: subprocessEnvironment, timeout: 110_000, maxBuffer: 2_000_000 });
  assert.equal(stderr, "");
  const report = JSON.parse(stdout);
  assert.equal(report.schema, "edge-benchmark-run/1");
  assert.equal(report.provenance.machine.label, "automated-test");
  assert.equal(report.provenance.runtime.node, process.versions.node);
  assert.deepEqual(report.provenance.runtime.execArgv, []);
  assert.equal(report.provenance.runtime.nodeOptions, false);
  assert(report.provenance.machine.cpuModels.length > 0);
  assert(report.provenance.machine.availableParallelism > 0);
  assert(Date.parse(report.completedAt) >= Date.parse(report.startedAt));
  for (const digest of [report.exactResultSha256, report.workloadSet.sha256, report.provenance.runner.sourceDigest]) {
    assert.match(digest, /^[0-9a-f]{64}$/);
  }
  assert(report.provenance.runner.sources.length > 0);
  assert(report.provenance.build.sources.length > 0);
  assert.deepEqual(report.results.map(({ id }) => id), [...WORKLOAD_IDS]);
  assert.deepEqual(report.workloadSet.definitions.map(({ id }) => id), [...WORKLOAD_IDS]);
  for (const result of report.results) {
    assert.equal(result.warmup.batches, 1);
    assert.equal(result.warmup.iterations, result.iterationsPerSample);
    assert(result.warmup.elapsedNs > 0);
    assert.equal(result.samples.length, 3);
    for (const sample of result.samples) {
      assert(Number.isSafeInteger(sample.elapsedNs) && sample.elapsedNs > 0);
      assert(Number.isFinite(sample.checksum));
      assert.equal(sample.checksum, result.warmup.checksum);
    }
    assert.equal(result.summary.sampleCount, 3);
    assert(result.summary.minMs > 0);
    assert(result.summary.minMs <= result.summary.medianMs);
    assert(result.summary.medianMs <= result.summary.p95Ms);
    assert(result.summary.p95Ms <= result.summary.maxMs);
    assert(result.summary.madMs >= 0);
  }
});
