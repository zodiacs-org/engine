import assert from 'node:assert/strict';
import test from 'node:test';
import { emptyQuantiles, validateQuantiles, addAbsolute, mergeQuantiles,
  summarizeQuantiles, QUANTILE_METHOD } from '../lib/quantiles.mjs';

const accumulate = values => values.reduce(addAbsolute, emptyQuantiles());
const summary = values => summarizeQuantiles(accumulate(values), values.length, Math.max(0, ...values));
const rankByDivision = (n, numerator, denominator) =>
  Math.floor(n / denominator) * numerator + Math.ceil((n % denominator) * numerator / denominator);
function checkAgainstSorted(values, state = accumulate(values)) {
  const sorted = [...values].sort((a, b) => a - b);
  const maxAbs = sorted.at(-1) ?? 0;
  const result = summarizeQuantiles(state, sorted.length, maxAbs);
  for (const [name, numerator, denominator] of [['median', 1, 2], ['p99', 99, 100], ['p999', 999, 1000]]) {
    if (!sorted.length) { assert.equal(result[name], null); continue; }
    const rank = rankByDivision(sorted.length, numerator, denominator);
    assert.equal(result[name].rank, rank);
    assert(result[name].lower <= sorted[rank - 1], `${name} lower bound`);
    assert(result[name].upper >= sorted[rank - 1], `${name} upper bound`);
    assert(result[name].upper <= maxAbs);
    assert(Number.isFinite(result[name].lower)); assert(Number.isFinite(result[name].upper));
  }
  return result;
}
function adjacent(value, direction) {
  // Positive finite doubles are ordered by their IEEE binary64 bit patterns.
  const bytes = new ArrayBuffer(8), view = new DataView(bytes);
  view.setFloat64(0, value);
  view.setBigUint64(0, view.getBigUint64(0) + BigInt(direction));
  return view.getFloat64(0);
}

test('named quantile intervals contain independent sorted nearest ranks', () => {
  const values = Array.from({ length: 2003 }, (_, index) => ((index * 7919) % 10007) / 64);
  checkAgainstSorted(values);
  checkAgainstSorted([...values].reverse());
  checkAgainstSorted([0, 0, 0]);
  checkAgainstSorted([1, 2, 3, 4]); // The median is the second observation, without interpolation.
  const result = summary([1, 2, 3, 4]);
  assert.equal(result.median.rank, 2);
  assert.equal(result.median.lower, 2);
  assert.equal(result.median.upper, 2.125);
});

test('zero, underflow, overflow, subnormal and maximum domain values have explicit finite intervals', () => {
  assert.deepEqual(summary([]), { median: null, p99: null, p999: null });
  for (const value of [0, -0, Number.MIN_VALUE, 2 ** -41, 2 ** -40, 2 ** 40, 1e100]) {
    checkAgainstSorted([value]);
  }
  assert.deepEqual(summary([0]).median, { rank: 1, lower: 0, upper: 0 });
  assert.deepEqual(summary([Number.MIN_VALUE]).median, { rank: 1, lower: 0, upper: Number.MIN_VALUE });
  assert.deepEqual(summary([2 ** 41]).median, { rank: 1, lower: 2 ** 40, upper: 2 ** 41 });
  const mixed = [0, Number.MIN_VALUE, 2 ** -41, 1, 2 ** 40, 1e100];
  checkAgainstSorted(mixed);
  assert.deepEqual(accumulate([0, Number.MIN_VALUE, 2 ** 40]).bins, [[0, 1], [1, 1], [1282, 1]]);
});

test('every octave and subdivision assigns exact edges and adjacent doubles conservatively', () => {
  let expectedIndex = 2;
  for (let exponent = -40; exponent < 40; exponent++) {
    for (let division = 0; division < 16; division++, expectedIndex++) {
      // Independent integer-times-power construction of each mathematical edge.
      const edge = (16 + division) * 2 ** (exponent - 4);
      const below = adjacent(edge, -1), above = adjacent(edge, 1);
      assert.equal(accumulate([edge]).bins[0][0], expectedIndex);
      assert.equal(accumulate([below]).bins[0][0], expectedIndex - 1);
      assert.equal(accumulate([above]).bins[0][0], expectedIndex);
      const report = summary([edge, above, 1e100]).median;
      const next = (17 + division) * 2 ** (exponent - 4);
      assert.equal(report.lower, edge);
      assert.equal(report.upper, next);
      assert((report.upper - report.lower) / report.lower <= 1 / 16);
    }
  }
  const lastEdge = 2 ** 40;
  assert.equal(accumulate([adjacent(lastEdge, -1)]).bins[0][0], 1281);
  assert.equal(accumulate([lastEdge]).bins[0][0], 1282);
  assert.equal(accumulate([adjacent(lastEdge, 1)]).bins[0][0], 1282);
});

test('JSON continuation and several merge trees preserve all bucket counts without aliasing', () => {
  const values = Array.from({ length: 1007 }, (_, i) => i % 11 === 0 ? 0 : (i % 17 + 1) * 2 ** (i % 87 - 43));
  const baseline = accumulate(values);
  const checkpoint = JSON.parse(JSON.stringify(accumulate(values.slice(0, 193))));
  const saved = JSON.stringify(checkpoint);
  assert.deepEqual(values.slice(193).reduce(addAbsolute, checkpoint), baseline);
  assert.equal(JSON.stringify(checkpoint), saved);
  const shards = Array.from({ length: 7 }, (_, shard) => accumulate(values.filter((_, i) => i % 7 === shard)));
  const original = JSON.stringify(shards);
  const left = shards.reduce(mergeQuantiles, emptyQuantiles());
  const right = [...shards].reverse().reduce(mergeQuantiles, emptyQuantiles());
  const pairwise = mergeQuantiles(mergeQuantiles(shards[0], shards[1]),
    mergeQuantiles(mergeQuantiles(shards[2], shards[3]), mergeQuantiles(shards[4], mergeQuantiles(shards[5], shards[6]))));
  for (const state of [left, right, pairwise]) {
    assert.deepEqual(state, baseline); checkAgainstSorted(values, state);
  }
  assert.equal(JSON.stringify(shards), original);
  const emptyMerged = mergeQuantiles(baseline, emptyQuantiles());
  emptyMerged.bins[0][1]++;
  assert.notDeepEqual(emptyMerged, baseline);
});

test('large safe counts use exact ranks and reject overflow before merging or adding', () => {
  const n = Number.MAX_SAFE_INTEGER;
  const state = { version: 1, bins: [[0, n - 1], [1282, 1]] };
  const result = summarizeQuantiles(state, n, 1e100);
  for (const [name, numerator, denominator] of [['median', 1, 2], ['p99', 99, 100], ['p999', 999, 1000]]) {
    assert.equal(result[name].rank, rankByDivision(n, numerator, denominator));
    assert.deepEqual([result[name].lower, result[name].upper], [0, 0]);
  }
  assert.throws(() => addAbsolute(state, 0), /overflow/);
  assert.throws(() => mergeQuantiles(state, accumulate([0])), /overflow/);
  assert.throws(() => validateQuantiles({ version: 1, bins: [[0, n], [1282, 1]] }, n, 1e100), /overflow/);
});

test('reject malformed fields, retained samples, invalid counts and inconsistent maxima', () => {
  const valid = accumulate([0, 1, 1e100]);
  for (const state of [null, [], { ...valid, version: 2 }, { ...valid, values: [0, 1, 1e100] },
    { version: 1, bins: [[0, 0]] }, { version: 1, bins: [[-1, 1]] },
    { version: 1, bins: [[1283, 1]] }, { version: 1, bins: [[0.5, 1]] },
    { version: 1, bins: [[0, -1]] }, { version: 1, bins: [[0, 1.5]] },
    { version: 1, bins: [[0, Infinity]] }, { version: 1, bins: [[0, Number.MAX_SAFE_INTEGER + 1]] },
    { version: 1, bins: [[0, 1], [0, 1]] }, { version: 1, bins: [[2, 1], [0, 1]] },
    { version: 1, bins: [[0, 1, 'raw']] }, { version: 1, bins: { 0: [0, 1] } },
    { version: 1, bins: Array(1) }]) {
    assert.throws(() => validateQuantiles(state, 3, 1e100));
  }
  const extraPair = [0, 1]; extraPair.raw = 123;
  assert.throws(() => addAbsolute({ version: 1, bins: [extraPair] }, 0));
  const extraBins = [[0, 1]]; extraBins.raw = 123;
  assert.throws(() => addAbsolute({ version: 1, bins: extraBins }, 0));
  for (const value of [-1, NaN, Infinity, -Infinity, 1.01e100]) {
    assert.throws(() => addAbsolute(emptyQuantiles(), value));
  }
  for (const [n, maximum] of [[2, 1e100], [3, 1], [3, Infinity], [3, -1], [3, 1.01e100], [-1, 1e100], [1.5, 1e100]]) {
    assert.throws(() => validateQuantiles(valid, n, maximum));
  }
  assert.throws(() => validateQuantiles(emptyQuantiles(), 0, 1));
  assert.throws(() => validateQuantiles(accumulate([0]), 1, 2 ** -41));
  assert.equal(validateQuantiles(valid, 3, 1e100), valid);
});

test('state cardinality and serialized size stay bounded across the entire bucket domain', () => {
  const representatives = [0, Number.MIN_VALUE];
  for (let exponent = -40; exponent < 40; exponent++) {
    for (let division = 0; division < 16; division++) representatives.push((16 + division) * 2 ** (exponent - 4));
  }
  representatives.push(1e100);
  const state = accumulate(representatives);
  assert.equal(state.bins.length, QUANTILE_METHOD.maximumBuckets);
  validateQuantiles(state, representatives.length, 1e100);
  const denseCounts = { version: 1, bins: state.bins.map(([index]) => [index, 1_000_000_000]) };
  validateQuantiles(denseCounts, state.bins.length * 1_000_000_000, 1e100);
  assert(Buffer.byteLength(JSON.stringify(denseCounts)) < 32_000);
  assert(Object.isFrozen(QUANTILE_METHOD));
  assert(Object.isFrozen(QUANTILE_METHOD.regular));
  assert(Object.isFrozen(QUANTILE_METHOD.tails));
  assert(Object.isFrozen(QUANTILE_METHOD.probabilities.p999));
  assert.equal(QUANTILE_METHOD.rankApproximation, 0);
  assert.equal(QUANTILE_METHOD.regular.relativeWidthAtMost, 1 / 16);
  assert.equal(QUANTILE_METHOD.tails.relativeWidthGuarantee, false);
});
