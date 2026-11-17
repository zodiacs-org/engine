import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { open, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { validateBenchmarkBaseline } from "./benchmark-baseline.mjs";
import { edgeRoot, requireNode22 } from "./build-support.mjs";

export const DEFAULT_THRESHOLD_PERCENT = "10";
const FILE_LIMIT = 2_000_000;
const PERCENT_SCALE = 1_000_000n;
const HUNDRED_PERCENT = 100n * PERCENT_SCALE;
const usage = "Usage: benchmark-gate.mjs --baseline FILE --candidate FILE [--threshold-percent DECIMAL]";

function thresholdUnits(value) {
  assert(typeof value === "string" && value.trim() === value && /^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,6})?$/.test(value),
    "Threshold must be a plain decimal percent with at most six fractional digits.");
  const [whole, fraction = ""] = value.split(".");
  assert(whole.length <= 3, "Threshold percent must be between 0 and 100.");
  const units = BigInt(whole) * PERCENT_SCALE + BigInt(fraction.padEnd(6, "0"));
  assert(units <= HUNDRED_PERCENT, "Threshold percent must be between 0 and 100.");
  return units;
}

export function parseGateOptions(args) {
  const options = { thresholdPercent: DEFAULT_THRESHOLD_PERCENT };
  const names = new Map([["--baseline", "baseline"], ["--candidate", "candidate"], ["--threshold-percent", "thresholdPercent"]]);
  const seen = new Set();
  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i], value = args[i + 1];
    assert(names.has(flag) && !seen.has(flag) && typeof value === "string"
      && value.trim().length > 0 && !value.startsWith("--"), usage);
    seen.add(flag);
    options[names.get(flag)] = value;
  }
  assert(options.baseline && options.candidate, usage);
  thresholdUnits(options.thresholdPercent);
  return options;
}

function twiceMedian(values) {
  const sorted = [...values].sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? 2n * sorted[middle] : sorted[middle - 1] + sorted[middle];
}

// Four times the median of batch medians, in nanoseconds. Both median steps
// can average a middle pair. Keeping those halves as integers avoids a float
// rounding decision exactly at the configured regression boundary. Protocol
// equality guarantees identical batch iteration counts on both sides.
function medianBatchUnits(baseline, index) {
  return twiceMedian(baseline.runs.map((run) => twiceMedian(run.results[index].samples.map(BigInt))));
}

function buildConditions(build) {
  const { sourceDigest, sources, outputs, ...conditions } = build;
  return conditions;
}

function independentRuns(baseline, candidate) {
  const runs = [...baseline.runs, ...candidate.runs];
  assert.equal(new Set(runs.map(({ rawSha256 }) => rawSha256)).size, runs.length,
    "Baseline and candidate must not reuse raw runs.");
  const sorted = runs.map(({ startedAt, completedAt }) => [Date.parse(startedAt), Date.parse(completedAt)])
    .sort((a, b) => a[0] - b[0]);
  assert(sorted.every(([start, end]) => end > start), "Benchmark measurement intervals must have positive duration.");
  for (let i = 1; i < sorted.length; i++) {
    assert(sorted[i][0] >= sorted[i - 1][1] && sorted[i][0] !== sorted[i - 1][0],
      "Benchmark measurement intervals must be independent and must not overlap.");
  }
}

function identity(record) {
  return {
    buildSourceDigest: record.provenance.build.sourceDigest,
    workloadBundleSha256: record.provenance.build.outputs.find(({ path }) => path === "workloads.mjs").sha256,
    runs: record.runs.map(({ startedAt, completedAt, rawSha256 }) => ({ startedAt, completedAt, rawSha256 }))
  };
}

export function compareBenchmarks(baseline, candidate, { thresholdPercent = DEFAULT_THRESHOLD_PERCENT } = {}) {
  const threshold = thresholdUnits(thresholdPercent);
  for (const [name, value] of [["baseline", baseline], ["candidate", candidate]]) {
    try { validateBenchmarkBaseline(value); }
    catch (error) { throw new Error(`Invalid ${name}: ${error.message}`, { cause: error }); }
  }
  assert.equal(candidate.runs.length, baseline.runs.length, "Incompatible independent run count.");
  for (const name of ["protocol", "workloadSet", "exactResultSha256"]) {
    assert.deepEqual(candidate[name], baseline[name], `Incompatible ${name}.`);
  }
  for (const name of ["machine", "runtime", "runner"]) {
    assert.deepEqual(candidate.provenance[name], baseline.provenance[name], `Incompatible ${name} provenance.`);
  }
  assert.deepEqual(buildConditions(candidate.provenance.build), buildConditions(baseline.provenance.build),
    "Incompatible build conditions.");
  for (const [index, result] of candidate.runs[0].results.entries()) {
    assert.equal(result.checksum, baseline.runs[0].results[index].checksum, `Incompatible ${result.id} checksum.`);
  }
  independentRuns(baseline, candidate);
  const results = baseline.results.map((result, index) => {
    const previous = medianBatchUnits(baseline, index), current = medianBatchUnits(candidate, index);
    const regressed = current * HUNDRED_PERCENT > previous * (HUNDRED_PERCENT + threshold);
    return {
      id: result.id, baselineMedianMs: result.medianMs, candidateMedianMs: candidate.results[index].medianMs,
      // Descriptive binary64 values only; the decision above uses integer ns.
      changePercent: Number(current - previous) / Number(previous) * 100,
      status: regressed ? "regression" : "pass"
    };
  });
  return {
    schema: "edge-benchmark-gate/1", status: results.some(({ status }) => status === "regression") ? "regression" : "pass",
    thresholdPercent: Number(thresholdPercent), statistic: "median of run medians",
    unit: baseline.protocol.unit, comparison: "strict increase beyond threshold; exact integer sample arithmetic",
    machine: baseline.provenance.machine, runtime: baseline.provenance.runtime,
    runnerSourceDigest: baseline.provenance.runner.sourceDigest, workloadSha256: baseline.workloadSet.sha256,
    exactResultSha256: baseline.exactResultSha256,
    baseline: identity(baseline), candidate: identity(candidate), results
  };
}

export async function readGateRecord(path) {
  const absolute = resolve(path), local = relative(edgeRoot, absolute);
  assert(local && local !== ".." && !local.startsWith(`..${sep}`) && !isAbsolute(local),
    "Gate inputs must be below edge/.");
  assert.equal(await realpath(absolute), absolute, "Gate inputs must not use symlinks.");
  const file = await open(absolute, "r");
  try {
    const info = await file.stat();
    assert(info.isFile() && info.size < FILE_LIMIT, "Gate input must be a regular file below the project size limit.");
    // Read a bounded buffer even if a producer appends after stat().
    const buffer = Buffer.alloc(FILE_LIMIT);
    let length = 0;
    while (length < FILE_LIMIT) {
      const { bytesRead } = await file.read(buffer, length, FILE_LIMIT - length, null);
      if (bytesRead === 0) break;
      length += bytesRead;
    }
    assert(length < FILE_LIMIT, "Gate input exceeds the project size limit.");
    const bytes = buffer.subarray(0, length);
    return {
      record: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
      sha256: createHash("sha256").update(bytes).digest("hex")
    };
  } finally { await file.close(); }
}

export async function gateFromFiles(options) {
  const [baseline, candidate] = await Promise.all([readGateRecord(options.baseline), readGateRecord(options.candidate)]);
  return {
    ...compareBenchmarks(baseline.record, candidate.record, options),
    inputSha256: { baseline: baseline.sha256, candidate: candidate.sha256 }
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    requireNode22();
    const report = await gateFromFiles(parseGateOptions(process.argv.slice(2)));
    const output = JSON.stringify(report, null, 2) + "\n";
    assert(Buffer.byteLength(output) < FILE_LIMIT, "Gate report exceeds the project size limit.");
    process.stdout.write(output);
    process.exitCode = report.status === "pass" ? 0 : 1;
  } catch (error) {
    // Invalid evidence is never emitted as a passing comparison.
    console.error(`Performance gate refused comparison: ${error.message}`);
    process.exitCode = 2;
  }
}
