import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { availableParallelism, release, totalmem } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { environment } from './common.mjs';
import { SAMPLE_SEED, stratifiedInstants } from './interpolate-full.mjs';
import { createConfig } from '../src/config.mjs';
import { verifyEngineArchive } from '../src/identity.mjs';
import { descriptorAt, openDatabase } from '../src/query.mjs';
import { readStoreFile, storePathExists } from '../src/store.mjs';

export const QUERY_DEFAULTS = Object.freeze({ positionCount: 512, warmRepeats: 8,
  eventCount: 8, seed: SAMPLE_SEED, cacheTiles: 4 });
const day = 86_400_000;
const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const fullDirectory = fileURLToPath(new URL('../generated/full/', import.meta.url));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const planDigest = plan => digest(JSON.stringify(plan) + '\n');

function settings(options) {
  if (!options || typeof options !== 'object' || Array.isArray(options) ||
      Object.keys(options).some(key => !Object.hasOwn(QUERY_DEFAULTS, key))) throw new RangeError('Invalid benchmark options');
  const value = { ...QUERY_DEFAULTS, ...options };
  for (const [key, max] of [['positionCount', 10_000], ['warmRepeats', 64], ['eventCount', 64],
    ['seed', 0xffff_ffff], ['cacheTiles', 64]]) {
    if (!Number.isSafeInteger(value[key]) || value[key] < 1 || value[key] > max) throw new RangeError(`Invalid ${key}`);
  }
  return value;
}

/** Fixed workloads; short test stores clip durations rather than extrapolate. */
export function queryPlan(input, options = {}) {
  const config = createConfig(input), policy = settings(options);
  const span = config.endMs - config.startMs;
  const specifications = [
    ['day', day, {}], ['month', 30 * day, {}], ['year', 365 * day, {}],
    ...(config.bodies.includes('Moon') ? [['moonIngressMonth', 30 * day, { kind: 'ingress', body: 'Moon' }]] : []),
    ...(config.bodies.includes('Mercury') ? [['mercuryStationYear', 365 * day, { kind: 'station', body: 'Mercury' }]] : [])
  ];
  const events = specifications.map(([name, requestedDurationMs, filter]) => {
    const durationMs = Math.min(span, requestedDurationMs), width = BigInt(span - durationMs + 1);
    const ranges = Array.from({ length: policy.eventCount }, (_, index) => {
      const offset = Number(width * BigInt(2 * index + 1) / BigInt(2 * policy.eventCount));
      const startMs = config.startMs + offset;
      return { startMs, endMs: startMs + durationMs };
    });
    return { name, requestedDurationMs, durationMs, filter, ranges };
  });
  events.push({ name: 'fullSpan', requestedDurationMs: span, durationMs: span, filter: {},
    ranges: [{ startMs: config.startMs, endMs: config.endMs }] });
  return { positions: stratifiedInstants(config, policy.positionCount, policy.seed), events };
}

/** Latencies are milliseconds; quantiles use nearest rank, median the middle pair. */
export function latencyStatistics(values) {
  if (!Array.isArray(values) || !values.length || values.some(value => !Number.isFinite(value) || value < 0)) {
    throw new RangeError('Invalid latency observations');
  }
  const sorted = [...values].sort((a, b) => a - b), count = sorted.length;
  const mid = Math.floor(count / 2);
  return { count, totalMs: values.reduce((sum, value) => sum + value, 0),
    minimumMs: sorted[0], medianMs: count % 2 ? sorted[mid] : sorted[mid - 1] + (sorted[mid] - sorted[mid - 1]) / 2,
    p95Ms: sorted[Math.ceil(count * 0.95) - 1], p99Ms: sorted[Math.ceil(count * 0.99) - 1], maximumMs: sorted.at(-1) };
}

async function metadata(directory) {
  if (await storePathExists(join(directory, '.lock'))) throw new Error('Database has a writer lock');
  const database = await openDatabase(directory, { cacheTiles: 1 });
  return { config: database.config, manifest: await readStoreFile(join(directory, 'manifest.json')),
    checkpoint: await readStoreFile(join(directory, 'checkpoint.json')) };
}

function memoryObserver() {
  const baseline = process.memoryUsage(), maximum = { ...baseline };
  let observations = 1;
  const observe = () => {
    const current = process.memoryUsage();
    observations++;
    for (const field of Object.keys(maximum)) maximum[field] = Math.max(maximum[field], current[field]);
    return current;
  };
  return { observe, report: () => {
    const final = observe();
    return { unit: 'bytes', baseline, final, sampledMaximum: maximum, observations,
      processLifetimeMaxRssBytes: process.resourceUsage().maxRSS * 1024 };
  } };
}

function positionText(result, atMs, config) {
  assert.equal(result.atMs, atMs, 'Position instant mismatch');
  assert.deepEqual(result.rows.map(row => row.body), config.bodies, 'Position body order mismatch');
  for (const row of result.rows) {
    for (const key of ['lon', 'lat', 'speed']) assert.ok(Number.isFinite(row[key]), 'Nonfinite position');
  }
  return JSON.stringify(result) + '\n';
}

function cacheCheck(database, expectedIndices) {
  const cache = database.cacheInfo();
  assert.ok(cache.size <= cache.capacity, 'Cache exceeds capacity');
  if (expectedIndices) assert.deepEqual(cache.indices, expectedIndices, 'Unexpected cached tiles');
  return cache.size;
}

async function positions(directory, config, instants, policy, memory) {
  const openings = [], cold = [], warm = [], hashes = { cold: createHash('sha256'), warm: createHash('sha256') };
  let maximumCacheSize = 0;
  for (const atMs of instants) {
    let start = performance.now();
    const database = await openDatabase(directory, { cacheTiles: policy.cacheTiles });
    openings.push(performance.now() - start);
    cacheCheck(database, []);
    memory.observe();
    start = performance.now();
    const result = await database.positions(atMs);
    cold.push(performance.now() - start);
    memory.observe();
    const text = positionText(result, atMs, config), index = descriptorAt(config, atMs).index;
    maximumCacheSize = Math.max(maximumCacheSize, cacheCheck(database, [index]));
    hashes.cold.update(text);
    for (let repeat = 0; repeat < policy.warmRepeats; repeat++) {
      start = performance.now();
      const repeated = await database.positions(atMs);
      warm.push(performance.now() - start);
      memory.observe();
      assert.equal(positionText(repeated, atMs, config), text, 'Warm position differs');
      cacheCheck(database, [index]);
      // One result per instant gives comparable cold and warm result digests.
      if (repeat === 0) hashes.warm.update(text);
    }
  }
  const resultSha256 = { cold: hashes.cold.digest('hex'), warm: hashes.warm.digest('hex') };
  assert.equal(resultSha256.cold, resultSha256.warm, 'Position result digests differ');
  return { opening: latencyStatistics(openings), cold: latencyStatistics(cold), warm: latencyStatistics(warm),
    maximumCacheSize, resultSha256 };
}

async function events(directory, config, cohorts, policy, memory) {
  const results = [];
  for (const cohort of cohorts) {
    const timings = [], eventCounts = [], countsByKind = {}, hash = createHash('sha256');
    let scannedTiles = 0, maximumCacheSize = 0;
    const openingTimes = [];
    for (const { startMs, endMs } of cohort.ranges) {
      const openStart = performance.now();
      const database = await openDatabase(directory, { cacheTiles: policy.cacheTiles });
      openingTimes.push(performance.now() - openStart);
      cacheCheck(database, []);
      memory.observe();
      let count = 0, previous = startMs;
      hash.update(JSON.stringify({ startMs, endMs, filter: cohort.filter }) + '\n');
      const start = performance.now();
      for await (const event of database.events(startMs, endMs, cohort.filter)) {
        assert.ok(event.atMs >= previous && event.atMs < endMs, 'Event outside ordered range');
        assert.ok(!cohort.filter.kind || event.kind === cohort.filter.kind, 'Event kind mismatch');
        assert.ok(!cohort.filter.body || event.bodies.includes(cohort.filter.body), 'Event body mismatch');
        previous = event.atMs;
        count++;
        countsByKind[event.kind] = (countsByKind[event.kind] ?? 0) + 1;
        hash.update(JSON.stringify(event) + '\n');
        if (count % 128 === 0) memory.observe();
      }
      timings.push(performance.now() - start);
      memory.observe();
      eventCounts.push(count);
      const first = descriptorAt(config, startMs).index, last = descriptorAt(config, endMs - 1).index;
      const expected = Array.from({ length: Math.min(last - first + 1, policy.cacheTiles) },
        (_, index) => Math.max(first, last - policy.cacheTiles + 1) + index);
      maximumCacheSize = Math.max(maximumCacheSize, cacheCheck(database, expected));
      scannedTiles += last - first + 1;
    }
    results.push({ name: cohort.name, requestedDurationMs: cohort.requestedDurationMs,
      durationMs: cohort.durationMs, filter: cohort.filter, ranges: cohort.ranges.length,
      opening: latencyStatistics(openingTimes), latency: latencyStatistics(timings),
      events: eventCounts.reduce((a, b) => a + b, 0), minimumEvents: Math.min(...eventCounts),
      maximumEvents: Math.max(...eventCounts), countsByKind, scannedTiles, maximumCacheSize,
      resultSha256: hash.digest('hex') });
  }
  return results;
}

/** Read a retained immutable store; never generate tiles or change checkpoints. */
export async function measureQueries(directory, options = {}) {
  directory = resolve(directory);
  const policy = settings(options);
  const runtime = { ...environment(), osRelease: release(), memoryBytes: totalmem(),
    availableParallelism: availableParallelism() };
  await verifyEngineArchive();
  const before = await metadata(directory), plan = queryPlan(before.config, policy);
  const memory = memoryObserver(), cpuStart = process.cpuUsage();
  const startedAt = new Date().toISOString(), start = performance.now();
  const positionQueries = await positions(directory, before.config, plan.positions, policy, memory);
  const eventQueries = await events(directory, before.config, plan.events, policy, memory);
  const elapsedMs = performance.now() - start, cpu = process.cpuUsage(cpuStart), memoryReport = memory.report();
  const after = await metadata(directory);
  assert.deepEqual(after.manifest, before.manifest, 'Manifest changed during measurement');
  assert.deepEqual(after.checkpoint, before.checkpoint, 'Checkpoint changed during measurement');
  return {
    version: 1, command: 'node skydb/benchmarks/query-full.mjs', directory: relative(repoRoot, directory),
    startedAt, finishedAt: new Date().toISOString(), runtime, elapsedMs,
    cpu: { userMs: cpu.user / 1000, systemMs: cpu.system / 1000 },
    measurement: 'Local sequential queries on a completed database; filesystem cache, host load and garbage collection uncontrolled; no latency or memory guarantee',
    method: {
      positions: 'Fresh database per instant; opening timed separately; cold is one empty application-cache lookup, warm immediately repeats that instant; query timers exclude result checks, hashes and memory observations',
      events: 'Fresh database per range; opening timed separately; completely consume iterator with ordered-range and filter checks, streaming counts and SHA-256 inside timer; filter still loads all overlapping tiles; fullSpan scans the whole database once',
      memory: 'process.memoryUsage before work, after opening and position operations, every 128 yielded events and after ranges; sampled per-field maxima are not simultaneous or peak bounds; maxRSS is process-lifetime high water in KiB converted to bytes, including preflight; no forced garbage collection',
      statistics: 'Milliseconds; median averages middle pair for even counts; p95 and p99 are nearest rank sorted[ceil(p * count) - 1]; no discarded warmup or latency threshold',
      elapsed: 'Includes openings, queries, diagnostics, hashing and memory observations; excludes archive preflight, plan construction, metadata checks and report serialization; one process, no workers'
    },
    manifest: { sha256: digest(before.manifest), bytes: before.manifest.length, value: JSON.parse(before.manifest) },
    checkpoint: JSON.parse(before.checkpoint),
    workload: { ...policy, planSha256: planDigest(plan), positionSha256: planDigest(plan.positions),
      firstPositionAtMs: plan.positions[0], lastPositionAtMs: plan.positions.at(-1),
      positionSelection: 'interpolate-full stratifiedInstants, excluding support samples with recorded seed and count',
      eventSelection: 'Nominal days of 86400000 milliseconds; requested durations clipped to coverage; starts at startMs + floor((spanMs - durationMs + 1) * (2 * index + 1) / (2 * eventCount)) using exact integer arithmetic; fullSpan is one half-open coverage range',
      eventPlan: plan.events },
    positionQueries, eventQueries, memory: memoryReport
  };
}

async function main() {
  if (process.argv.length !== 2) throw new Error('Full query benchmark takes no arguments');
  const verified = JSON.parse(await readFile(new URL('./verify-full-output.json', import.meta.url)));
  const report = await measureQueries(fullDirectory);
  assert.deepEqual(report.manifest, verified.manifest, 'Database differs from completed verification evidence');
  assert.deepEqual(report.checkpoint, verified.checkpoint, 'Checkpoint differs from completed verification evidence');
  assert.equal(report.eventQueries.find(value => value.name === 'fullSpan').events, verified.verification.summary.events,
    'Full event count differs from verification evidence');
  console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
