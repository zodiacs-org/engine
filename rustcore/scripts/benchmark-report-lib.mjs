import assert from "node:assert/strict";

export const SYSTEMS = ["whole", "placidus", "koch", "porphyry", "regiomontanus", "campanus",
  "topocentric", "alcabitius", "equal", "equal-mc", "vehlow", "meridian", "morinus"];
export const EXPECTED = Object.fromEntries([
  ["positions/warm", 9], ["positions/cold", 9], ...SYSTEMS.map(system => [`houses/${system}`, 63]),
  ["time/utc", 9], ["frame/ecliptic_of_date", 9],
  ...["legacy", "configured_default", "configured_all", "configured_custom"].map(name => [`aspects/${name}`, 9])
]);

export function percentile(sorted, fraction) {
  const index = (sorted.length - 1) * fraction;
  const lower = Math.floor(index), upper = Math.ceil(index);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

export function summarizeSamples(samples, expectedCount) {
  assert.equal(samples.length, expectedCount, "Missing benchmark samples.");
  assert(samples.length >= 2 && samples.every(value => Number.isFinite(value) && value > 0),
    "Benchmark durations must be finite and positive.");
  const sorted = [...samples].sort((a, b) => a - b);
  const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;
  return { samples: samples.length, min: sorted[0], p25: percentile(sorted, 0.25),
    median: percentile(sorted, 0.5), p75: percentile(sorted, 0.75), p95: percentile(sorted, 0.95),
    max: sorted.at(-1), mean,
    standardDeviation: Math.sqrt(samples.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (samples.length - 1)) };
}

export function validateCoverage(rows) {
  assert.deepEqual(rows.map(row => row.id).sort(), Object.keys(EXPECTED).sort(),
    "Benchmark workloads must be complete and unique.");
  for (const row of rows) assert.equal(row.callsPerIteration, EXPECTED[row.id], `Incorrect call count: ${row.id}`);
}

export function summarizeNode(raw) {
  assert.equal(raw.settings.samples, 30, "Smoke or incomplete measurements cannot become baselines.");
  validateCoverage(raw.measurements);
  return raw.measurements.map(row => {
    const typescript = summarizeSamples(row.samples.typescript, raw.settings.samples);
    const wasm = summarizeSamples(row.samples.wasm, raw.settings.samples);
    return { id: row.id, callsPerIteration: row.callsPerIteration, repeats: row.repeats,
      typescript, wasm, typescriptOverWasm: typescript.median / wasm.median };
  });
}

export function summarizeCriterion(benchmark, estimates, sample) {
  const id = benchmark.full_id;
  const callsPerIteration = EXPECTED[id];
  assert(callsPerIteration, `Unknown Criterion workload: ${id}`);
  assert.deepEqual(benchmark.throughput, { Elements: callsPerIteration }, `Wrong Criterion throughput: ${id}`);
  assert.equal(sample.times.length, 30, `Incomplete Criterion samples: ${id}`);
  assert.equal(sample.iters.length, sample.times.length);
  for (const key of ["iters", "times"])
    assert(sample[key].every(value => Number.isFinite(value) && value > 0), `Invalid Criterion ${key}: ${id}`);
  const perCall = {};
  for (const quantity of ["mean", "median"]) {
    const estimate = estimates[quantity];
    const { lower_bound: lower, upper_bound: upper, confidence_level: confidence } = estimate.confidence_interval;
    assert.equal(confidence, 0.95);
    assert([lower, estimate.point_estimate, upper, estimate.standard_error].every(Number.isFinite));
    assert(lower > 0 && lower <= estimate.point_estimate && estimate.point_estimate <= upper && estimate.standard_error >= 0);
    perCall[quantity] = { estimate: estimate.point_estimate / callsPerIteration,
      lower: lower / callsPerIteration, upper: upper / callsPerIteration,
      standardError: estimate.standard_error / callsPerIteration, confidence };
  }
  return { id, callsPerIteration, samples: sample.times.length, ...perCall };
}

export function combineReports(native, node) {
  assert.equal(native.kind, "native");
  assert.equal(node.kind, "node");
  assert.deepEqual(native.sourceDigests, node.sourceDigests, "Benchmarks measured different source snapshots.");
  assert.deepEqual(native.machine, node.machine, "Benchmark machine descriptions differ.");
  for (const report of [native, node]) {
    assert(Number.isFinite(Date.parse(report.startedAt)) && Number.isFinite(Date.parse(report.completedAt)) &&
      Date.parse(report.startedAt) < Date.parse(report.completedAt), "Invalid benchmark time interval.");
  }
  // A run must complete before the next starts. Never time both runtimes while
  // the native suite is consuming the same processor.
  assert(Date.parse(native.completedAt) <= Date.parse(node.startedAt) ||
    Date.parse(node.completedAt) <= Date.parse(native.startedAt), "Benchmark runs overlap.");
  const sorted = descriptor => ({ ...descriptor,
    manifest: [...descriptor.manifest].sort((a, b) => a.id.localeCompare(b.id)) });
  assert.deepEqual(sorted(native.descriptor), sorted(node.descriptor), "Native and Node corpora differ.");
  validateCoverage(native.measurements);
  validateCoverage(node.measurements);
  return { schema: "rustcore-benchmark/1", unit: "nanoseconds per API call",
    scope: "Synthetic workload timings, not astronomical accuracy or a general performance guarantee.",
    machine: native.machine, sourceDigests: native.sourceDigests, descriptor: node.descriptor,
    native: { ...native, machine: undefined, sourceDigests: undefined, descriptor: undefined },
    node: { ...node, machine: undefined, sourceDigests: undefined, descriptor: undefined } };
}

export function validateBaseline(report) {
  assert.equal(report.schema, "rustcore-benchmark/1");
  assert.equal(report.unit, "nanoseconds per API call");
  assert(report.machine.cpu && report.machine.arch && report.machine.os && report.machine.node);
  assert(Object.keys(report.sourceDigests).length > 0);
  for (const digest of Object.values(report.sourceDigests)) assert.match(digest, /^[0-9a-f]{64}$/);
  validateCoverage(report.native.measurements);
  validateCoverage(report.node.measurements);
  validateCoverage(report.descriptor.manifest);
  for (const row of report.native.measurements) {
    assert.equal(row.samples, 30);
    for (const key of ["mean", "median"]) {
      const value = row[key];
      assert.equal(value.confidence, 0.95);
      assert([value.estimate, value.lower, value.upper, value.standardError].every(Number.isFinite));
      assert(value.lower > 0 && value.lower <= value.estimate && value.estimate <= value.upper && value.standardError >= 0);
    }
  }
  for (const row of report.node.measurements) {
    for (const runtime of ["typescript", "wasm"]) {
      const value = row[runtime];
      assert.equal(value.samples, 30);
      for (const key of ["min", "p25", "median", "p75", "p95", "max", "mean"])
        assert(Number.isFinite(value[key]) && value[key] > 0, `Invalid summary ${key}`);
      assert(Number.isFinite(value.standardDeviation) && value.standardDeviation >= 0);
      const ordered = [value.min, value.p25, value.median, value.p75, value.p95, value.max];
      assert.deepEqual(ordered, [...ordered].sort((a, b) => a - b));
      assert(value.min <= value.mean && value.mean <= value.max);
      assert(Number.isSafeInteger(row.repeats[runtime]) && row.repeats[runtime] >= 1);
    }
    assert.equal(row.typescriptOverWasm, row.typescript.median / row.wasm.median);
  }
}

export function markdownTable(report) {
  validateBaseline(report);
  const lines = ["# Benchmark baseline", "", "Generated from [benchmark-baseline.json](benchmark-baseline.json) by",
    "`scripts/benchmark.mjs`. Values below are microseconds per API call, displayed",
    "with three significant digits; the JSON retains the measured precision.", "",
    "Native columns are Criterion median estimates and bootstrap confidence intervals.",
    "Node columns are medians of batch durations divided by call counts. TS/WASM is",
    "the ratio of those Node medians; greater than one means WASM took less time.",
    "The native and Node measurements use different harnesses and are not speed ratios.", "",
    "| Workload | Native median [95% interval] us | Node TS median us | Node WASM median us | TS/WASM |",
    "| --- | ---: | ---: | ---: | ---: |"];
  const us = value => (value / 1000).toPrecision(3);
  for (const id of Object.keys(EXPECTED)) {
    const native = report.native.measurements.find(row => row.id === id).median;
    const node = report.node.measurements.find(row => row.id === id);
    lines.push(`| ${id} | ${us(native.estimate)} [${us(native.lower)}, ${us(native.upper)}] | ${us(node.typescript.median)} | ${us(node.wasm.median)} | ${node.typescriptOverWasm.toPrecision(3)} |`);
  }
  lines.push("", "Machine and toolchain details, workload inputs, source hashes, dispersion and",
    "sample counts are in the linked JSON. See [BENCHMARKS.md](../../BENCHMARKS.md)",
    "for timing boundaries, cache state and the limits of this run.", "");
  return lines.join("\n");
}
