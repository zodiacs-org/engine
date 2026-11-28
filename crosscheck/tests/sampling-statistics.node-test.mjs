import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { SAMPLER_VERSION, HOUSE_SYSTEMS, randomWord, sampleCase, shardIndices } from '../lib/sampling.mjs';
import { emptyStats, addResidual, mergeStats, summarize, angularResidual, validateStats } from '../lib/statistics.mjs';

const config = { seed: 'synthetic-test', startMs: Date.parse('1800-01-01T00:00:00Z'), endMs: Date.parse('2200-01-01T00:00:00Z') };
const accumulate = values => values.reduce(addResidual, emptyStats(2));
const close = (a, b) => assert(Math.abs(a - b) <= 1e-12 * Math.max(1, Math.abs(b)), `${a} != ${b}`);

test('counter encoding matches independent SHA digest extraction', () => {
  const digest = createHash('sha256').update(JSON.stringify([SAMPLER_VERSION, config.seed, 42, 3, 0])).digest('hex');
  assert.equal(randomWord(config.seed, 42, 3), parseInt(digest.slice(0, 8), 16));
  assert.notEqual(randomWord(config.seed, 42, 3), randomWord(config.seed, 42, 4));
});

test('case indices reproduce across shards, random access and JSON configurations', () => {
  const cases = Array.from({ length: 1000 }, (_, index) => sampleCase(config, index));
  const recombined = Array.from({ length: 7 }, (_, shard) => [...shardIndices(cases.length, shard, 7)]).flat();
  assert.equal(new Set(recombined).size, cases.length);
  assert.deepEqual(recombined.sort((a, b) => a - b), cases.map(c => c.index));
  for (const index of recombined.reverse()) {
    assert.deepEqual(sampleCase(JSON.parse(JSON.stringify(config)), index), cases[index]);
    const c = cases[index];
    assert(Date.parse(c.utc) >= config.startMs && Date.parse(c.utc) < config.endMs);
    assert(c.latitude >= -90 && c.latitude < 90);
    assert(c.longitude >= -180 && c.longitude < 180);
    assert(HOUSE_SYSTEMS.includes(c.houseSystem));
    assert(Object.isFrozen(c));
  }
  assert.notDeepEqual(sampleCase({ ...config, seed: 'different' }, 0), cases[0]);
  assert.deepEqual([...shardIndices(0, 0, 1)], []);
  assert.deepEqual([...shardIndices(2, 3, 4)], []);
  const last = Number.MAX_SAFE_INTEGER - 1;
  assert.deepEqual([...shardIndices(Number.MAX_SAFE_INTEGER, last, Number.MAX_SAFE_INTEGER)], [last]);
});

test('house identifiers match engine type without importing engine implementation', async () => {
  const source = await readFile(new URL('../../src/types.ts', import.meta.url), 'utf8');
  const section = source.split('export type HouseSystem =')[1].split(';')[0];
  assert.deepEqual([...HOUSE_SYSTEMS].sort(), [...section.matchAll(/"([^"]+)"/g)].map(match => match[1]).sort());
});

test('sampling rejects invalid domains and handles single-millisecond spans', () => {
  for (const index of [-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => sampleCase(config, index));
  for (const changes of [{ seed: '' }, { seed: 1 }, { endMs: config.startMs }, { startMs: NaN }, { endMs: 9e15 }]) assert.throws(() => sampleCase({ ...config, ...changes }, 0));
  assert.equal(sampleCase({ ...config, endMs: config.startMs + 1 }, 99).utc, new Date(config.startMs).toISOString());
  for (const args of [[10, 0, 0], [10, 3, 3], [-1, 0, 1]]) assert.throws(() => [...shardIndices(...args)]);
});

test('time and area coordinates match an independent digest-based reduction', () => {
  const word = (index, field, attempt = 0) => BigInt('0x' + createHash('sha256')
    .update(JSON.stringify([SAMPLER_VERSION, config.seed, index, field, attempt])).digest('hex').slice(0, 8));
  // A broad representable span exercises rejection as well as negative epoch arithmetic.
  const broad = { ...config, startMs: -4_500_000_000_000_000, endMs: 4_500_000_000_000_000 };
  const width = BigInt(broad.endMs) - BigInt(broad.startMs);
  const buckets = (2n ** 64n) / width;
  let rejections = 0;
  for (let index = 0; index < 20_000; index++) {
    let draw, attempt = 0;
    do {
      draw = word(index, 0, attempt) * 2n ** 32n + word(index, 1, attempt);
      attempt++;
    } while (draw / width >= buckets);
    rejections += attempt - 1;
    const c = sampleCase(broad, index);
    assert.equal(BigInt(Date.parse(c.utc)), BigInt(broad.startMs) + draw % width);
    close(Math.sin(c.latitude * Math.PI / 180), 2 * Number(word(index, 2)) / 2 ** 32 - 1);
    close(c.longitude, 360 * Number(word(index, 3)) / 2 ** 32 - 180);
  }
  assert(rejections > 0, 'rejection branch must be exercised');
});

test('large campaigns expose lazy indices without allocating case arrays', () => {
  const iterator = shardIndices(5_000_000, 2, 7);
  assert.deepEqual([iterator.next().value, iterator.next().value, iterator.next().value], [2, 9, 16]);
  iterator.return();
});

test('streaming and merged statistics match separately implemented integer arithmetic', () => {
  const values = Array.from({ length: 301 }, (_, i) => i % 19 - 9);
  // Exact BigInt sums and variance numerator, independent of the streaming algorithm.
  const n = BigInt(values.length);
  const sum = values.reduce((a, x) => a + BigInt(x), 0n);
  const squares = values.reduce((a, x) => a + BigInt(x) ** 2n, 0n);
  const absolute = values.reduce((a, x) => a + BigInt(Math.abs(x)), 0n);
  const expected = { mean: Number(sum) / Number(n), meanAbs: Number(absolute) / Number(n),
    rms: Math.sqrt(Number(squares) / Number(n)), populationStdDev: Math.sqrt(Number(n * squares - sum * sum) / Number(n * n)) };
  const sequential = accumulate(values);
  const shards = Array.from({ length: 7 }, (_, shard) => accumulate(values.filter((_, index) => index % 7 === shard)));
  for (const state of [sequential, shards.reduce(mergeStats, emptyStats(2)), shards.reverse().reduce(mergeStats, emptyStats(2))]) {
    const result = summarize(JSON.parse(JSON.stringify(state)));
    for (const key of Object.keys(expected)) close(result[key], expected[key]);
    assert.equal(result.n, values.length);
    assert.equal(result.passed, values.filter(x => Math.abs(x) <= 2).length);
    assert.equal(result.maxAbs, 9);
  }
});

test('empty, constant, boundary, invalid and resumed states', () => {
  assert.equal(summarize(emptyStats(0)).rms, null);
  assert.equal(summarize(accumulate([2, 2, 2])).populationStdDev, 0);
  assert.equal(summarize(accumulate([-2, 2, 3])).passed, 2);
  const state = accumulate([1, -3]);
  const saved = JSON.stringify(state);
  assert.deepEqual(mergeStats(state, emptyStats(2)), state);
  addResidual(state, 4);
  assert.equal(JSON.stringify(state), saved);
  for (const value of [NaN, Infinity, -Infinity, 1e101]) assert.throws(() => addResidual(state, value));
  assert.throws(() => mergeStats(state, emptyStats(3)));
  for (const changes of [{ n: -1 }, { n: 1.5 }, { passed: 10 }, { m2: -1 }, { squareSum: Infinity }, { version: 2 }]) assert.throws(() => validateStats({ ...state, ...changes }));
  assert.throws(() => mergeStats({ ...state, rawValues: [1, 2] }, emptyStats(2)));
  assert.throws(() => mergeStats({ ...accumulate([1]), n: Number.MAX_SAFE_INTEGER }, accumulate([1])));
  assert.equal(summarize(accumulate([1e12 + 1, 1e12 + 2, 1e12 + 3])).populationStdDev, Math.sqrt(2 / 3));
});

test('JSON checkpoint continuation matches uninterrupted accumulation', () => {
  const values = [0.125, -0.5, 1.25, -2.5, 8, -16];
  const checkpoint = JSON.parse(JSON.stringify(accumulate(values.slice(0, 3))));
  assert.deepEqual(values.slice(3).reduce(addResidual, checkpoint), accumulate(values));
  assert.deepEqual(Object.keys(checkpoint).sort(), Object.keys(emptyStats(2)).sort());
});

test('wrapped angular differences match independently enumerated integer circle', () => {
  for (let a = 0; a < 360; a += 7) for (let b = 0; b < 360; b += 11) {
    const expected = Array.from({ length: 360 }, (_, i) => i - 180).find(x => (b + x + 360) % 360 === a);
    assert.equal(angularResidual(a, b), expected);
  }
  close(angularResidual(0.125, 359.875), 0.25);
  assert.equal(angularResidual(180, 0), -180);
  for (const value of [NaN, Infinity, -1, 360]) assert.throws(() => angularResidual(value, 0));
});
