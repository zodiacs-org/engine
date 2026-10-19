import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { release, totalmem } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { environment, maximum } from './common.mjs';
import { createConfig } from '../src/config.mjs';
import { TIME_BOUNDARIES } from '../src/generate.mjs';
import { loadEngine } from '../src/engine.mjs';
import { descriptorAt, openDatabase } from '../src/query.mjs';
import { readStoreFile, storePathExists } from '../src/store.mjs';

export const SAMPLE_COUNT = 4_000;
export const SAMPLE_SEED = 0x51adbeef;
const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const fullDirectory = fileURLToPath(new URL('../generated/full/', import.meta.url));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const planDigest = instants => digest(JSON.stringify(instants) + '\n');

/** xorshift32, combining successive draws into 53-bit candidates. */
function randomBelow(seed) {
  if (!Number.isInteger(seed) || seed <= 0 || seed > 0xffff_ffff) throw new RangeError('Invalid sampling seed');
  let state = seed;
  const next = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state >>> 0;
  };
  return width => {
    const range = 2 ** 53, limit = range - range % width;
    let value;
    do { value = (next() >>> 5) * 2 ** 26 + (next() >>> 6); } while (value >= limit);
    return value % width;
  };
}

export function isStoredSample(input, atMs) {
  const config = createConfig(input), descriptor = descriptorAt(config, atMs);
  return atMs === descriptor.lastSampleMs || (atMs - descriptor.startMs) % config.stepMs === 0;
}

/** One non-support integer instant in each exact, equal-duration stratum. */
export function stratifiedInstants(input, count = SAMPLE_COUNT, seed = SAMPLE_SEED) {
  const config = createConfig(input);
  if (!Number.isSafeInteger(count) || count < 1 || count > 100_000) throw new RangeError('Invalid sampling count');
  const span = BigInt(config.endMs - config.startMs), divisor = BigInt(count);
  if (span < 3n * divisor) throw new RangeError('Sampling strata are too short');
  const below = randomBelow(seed), instants = [];
  for (let index = 0; index < count; index++) {
    const start = config.startMs + Number(span * BigInt(index) / divisor);
    const end = config.startMs + Number(span * BigInt(index + 1) / divisor);
    let atMs;
    for (let attempt = 0; attempt < 128; attempt++) {
      atMs = start + below(end - start);
      if (!isStoredSample(config, atMs)) break;
      atMs = undefined;
    }
    if (atMs === undefined) throw new RangeError('Stratum has no sampled interpolation instant');
    instants.push(atMs);
  }
  return instants;
}

/** Separate probes at coverage edges, the first regular tile seam and clock splits. */
export function boundaryInstants(input) {
  const config = createConfig(input), instants = new Set([config.startMs, config.endMs - 1]);
  for (const at of [config.startMs + config.tileMs, ...TIME_BOUNDARIES]) {
    if (at <= config.startMs || at >= config.endMs) continue;
    for (const offset of [-1, 0, 1]) {
      const value = at + offset;
      if (value >= config.startMs && value < config.endMs) instants.add(value);
    }
  }
  return [...instants].sort((a, b) => a - b);
}

/** Validate body alignment and measure longitude independently of query arithmetic. */
export function rowErrors(rows, direct, bodies) {
  for (const values of [rows, direct]) {
    assert.equal(values.length, bodies.length, 'Wrong number of position rows');
    values.forEach((row, index) => {
      assert.equal(row.body, bodies[index], 'Position body order mismatch');
      for (const field of ['lon', 'lat', 'speed']) assert.ok(Number.isFinite(row[field]), 'Nonfinite position');
      assert.ok(row.lon >= 0 && row.lon < 360, 'Invalid longitude');
      assert.ok(Math.abs(row.lat) <= 90, 'Invalid latitude');
    });
  }
  return rows.map((row, index) => {
    const reference = direct[index], difference = Math.abs(row.lon - reference.lon);
    return { lon: Math.min(difference, 360 - difference), lat: Math.abs(row.lat - reference.lat),
      speed: Math.abs(row.speed - reference.speed) };
  });
}

/** Median averages the middle pair; p99 uses the nearest-rank definition. */
export function errorStatistics(values) {
  if (!Array.isArray(values) || values.length === 0) throw new RangeError('No measured errors');
  let worst;
  for (const value of values) {
    if (!Number.isSafeInteger(value.atMs)) throw new RangeError('Invalid measured instant');
    worst = maximum(worst, value.error, value.atMs);
  }
  const sorted = values.map(value => value.error).sort((a, b) => a - b), count = sorted.length;
  const middle = Math.floor(count / 2);
  const median = count % 2 ? sorted[middle] : sorted[middle - 1] + (sorted[middle] - sorted[middle - 1]) / 2;
  return { count, maximum: worst, p99: sorted[Math.ceil(count * 0.99) - 1], median };
}

async function metadata(directory) {
  if (await storePathExists(join(directory, '.lock'))) throw new Error('Database has a writer lock');
  const database = await openDatabase(directory, { cacheTiles: 1 });
  return { database, manifest: await readStoreFile(join(directory, 'manifest.json')),
    checkpoint: await readStoreFile(join(directory, 'checkpoint.json')) };
}

async function compare(database, engine, instants) {
  const { config } = database;
  const values = Object.fromEntries(config.bodies.map(body => [body, { lon: [], lat: [], speed: [] }]));
  let exactSamples = 0;
  for (const atMs of instants) {
    const result = await database.positions(atMs);
    assert.equal(result.atMs, atMs, 'Position instant mismatch');
    const direct = engine.sample(atMs, config), errors = rowErrors(result.rows, direct, config.bodies);
    if (isStoredSample(config, atMs)) {
      assert.deepEqual(result.rows, direct, 'Stored support sample differs from direct engine');
      exactSamples++;
    }
    config.bodies.forEach((body, index) => {
      for (const field of ['lon', 'lat', 'speed']) values[body][field].push({ error: errors[index][field], atMs });
    });
  }
  return { instants: instants.length, exactSamples, interpolatedInstants: instants.length - exactSamples,
    errors: Object.fromEntries(config.bodies.map(body => [body, Object.fromEntries(
      Object.entries(values[body]).map(([field, entries]) => [field, errorStatistics(entries)]))])) };
}

/** Read-only measurement on a completed immutable database; no generation. */
export async function measureInterpolation(directory, { count = SAMPLE_COUNT, seed = SAMPLE_SEED } = {}) {
  directory = resolve(directory);
  const runtime = { ...environment(), osRelease: release(), memoryBytes: totalmem() };
  const before = await metadata(directory), { database } = before;
  const random = stratifiedInstants(database.config, count, seed), boundaries = boundaryInstants(database.config);
  const engine = await loadEngine();
  const startedAt = new Date().toISOString(), start = performance.now();
  const results = { random: await compare(database, engine, random), boundaries: await compare(database, engine, boundaries) };
  const elapsedMs = performance.now() - start;
  const after = await metadata(directory);
  assert.deepEqual(after.manifest, before.manifest, 'Manifest changed during measurement');
  assert.deepEqual(after.checkpoint, before.checkpoint, 'Checkpoint changed during measurement');
  return {
    version: 1, command: 'node skydb/benchmarks/interpolate-full.mjs', directory: relative(repoRoot, directory),
    startedAt, finishedAt: new Date().toISOString(), runtime, elapsedMs,
    measurement: 'Direct engine consumer agreement at sampled instants; no independent astronomical accuracy or full-span bound',
    method: 'One process, sequential position queries with one cached tile; sampled tiles verified on load; no database writes; elapsedMs covers both comparisons, excludes engine loading, planning and metadata checks',
    manifest: { sha256: digest(before.manifest), bytes: before.manifest.length, value: JSON.parse(before.manifest) },
    checkpoint: JSON.parse(before.checkpoint),
    units: { lon: 'degrees, shortest circular difference', lat: 'degrees', speed: 'degrees/day' },
    sampling: { version: 1, count, seed,
      algorithm: 'xorshift32 shifts 13,17,5; upper 27 and 26 bits of successive draws form 53 bits; rejection before modulo by stratum width',
      strata: 'Integer half-open endpoints start + floor(span * index / count), calculated with exact integer arithmetic',
      selection: 'One draw per stratum, retrying stored support instants up to 128 times; refuse if no interpolation instant was selected',
      randomSha256: planDigest(random), firstRandomAtMs: random[0], lastRandomAtMs: random.at(-1),
      boundaries: 'Coverage start and end minus one millisecond; first regular tile seam and every in-range pinned clock split, at offsets -1,0,1 milliseconds; deduplicated',
      boundaryCount: boundaries.length, boundarySha256: planDigest(boundaries),
      statistics: 'Absolute errors; median averages middle pair for even counts; p99 is sorted[ceil(0.99 * count) - 1]; maximum retains first occurrence in chronological order; cohorts kept separate' },
    results
  };
}

async function main() {
  if (process.argv.length !== 2) throw new Error('Full interpolation script takes no arguments');
  console.log(JSON.stringify(await measureInterpolation(fullDirectory), null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
