import assert from "node:assert/strict";

export const WORKLOAD_IDS = Object.freeze(["chart", "houses", "transit-scan"]);

export function benchmarkProtocol({ samples = 15, warmupBatches = 5 } = {}) {
  assert(Number.isSafeInteger(samples) && samples >= 3 && samples <= 101, "samples must be an integer from 3 to 101.");
  assert(Number.isSafeInteger(warmupBatches) && warmupBatches >= 1 && warmupBatches <= 100,
    "warmupBatches must be an integer from 1 to 100.");
  return {
    schema: "edge-benchmark-protocol/1",
    clock: "process.hrtime.bigint",
    unit: "ms/workload-invocation",
    warmupBatches, samples,
    iterations: { chart: 16, houses: 512, "transit-scan": 32 },
    order: [...WORKLOAD_IDS],
    timed: "workload call plus checksum consumption",
    gc: "automatic; no forced collection"
  };
}

function median(sorted) {
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function summarizeSamples(samples, iterations) {
  assert(Number.isSafeInteger(iterations) && iterations > 0, "Invalid iteration count.");
  assert(Array.isArray(samples) && samples.length > 0
    && [...samples].every((value) => Number.isSafeInteger(value) && value > 0), "Invalid sample duration.");
  const sorted = samples.map((ns) => ns / iterations / 1e6).sort((a, b) => a - b);
  const medianMs = median(sorted);
  return {
    sampleCount: sorted.length,
    minMs: sorted[0], medianMs,
    // Nearest-rank percentile; no interpolation and no discarded samples.
    p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1],
    maxMs: sorted.at(-1),
    madMs: median(sorted.map((value) => Math.abs(value - medianMs)).sort((a, b) => a - b))
  };
}

// The clock and operation are injected for deterministic protocol tests.
// Production uses a monotonic nanosecond clock and synchronous engine calls.
export function measureWorkload(workload, protocol, { now = process.hrtime.bigint } = {}) {
  const iterations = protocol.iterations[workload.id];
  assert(Number.isSafeInteger(iterations) && iterations > 0, "Invalid workload iteration count.");
  assert(Number.isSafeInteger(protocol.samples) && protocol.samples > 0, "Invalid sample count.");
  assert(Number.isSafeInteger(protocol.warmupBatches) && protocol.warmupBatches > 0, "Warmup is required.");
  // Keep an independent snapshot: a function reusing a mutable result cannot
  // silently update the reference. Validation and serialization are not timed.
  const expected = structuredClone(workload.run());
  workload.validate(expected);
  const expectedValue = workload.consume(expected);
  assert(Number.isFinite(expectedValue), "Result consumption must be finite.");
  let expectedChecksum = 0;
  for (let i = 0; i < iterations; i++) expectedChecksum += expectedValue;
  assert(Number.isFinite(expectedChecksum), "Checksum overflow.");

  function batch() {
    let checksum = 0, result;
    const start = now();
    for (let i = 0; i < iterations; i++) {
      result = workload.run();
      checksum += workload.consume(result);
    }
    const elapsedNs = Number(now() - start);
    assert(Number.isSafeInteger(elapsedNs) && elapsedNs > 0, "Invalid sample duration.");
    assert.equal(checksum, expectedChecksum, `${workload.id}: consumed results changed.`);
    assert.deepStrictEqual(result, expected, `${workload.id}: full result changed.`);
    return { elapsedNs, checksum };
  }

  const warmup = { batches: protocol.warmupBatches, iterations: iterations * protocol.warmupBatches, elapsedNs: 0, checksum: 0 };
  for (let i = 0; i < protocol.warmupBatches; i++) {
    const result = batch();
    warmup.elapsedNs += result.elapsedNs;
    warmup.checksum += result.checksum;
  }
  assert(Number.isSafeInteger(warmup.elapsedNs) && warmup.elapsedNs > 0, "Warmup duration overflow.");
  assert(Number.isFinite(warmup.checksum), "Warmup checksum overflow.");
  const samples = Array.from({ length: protocol.samples }, batch);
  return {
    id: workload.id, iterationsPerSample: iterations, warmup, samples,
    summary: summarizeSamples(samples.map(({ elapsedNs }) => elapsedNs), iterations)
  };
}
