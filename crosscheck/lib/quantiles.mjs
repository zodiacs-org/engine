// Fixed absolute-residual buckets retain counts only, never observations.
const MIN_EXPONENT = -40;
const MAX_EXPONENT = 40;
const SUBDIVISIONS = 16;
const MAX_ABSOLUTE = 1e100;
const ZERO = 0;
const UNDERFLOW = 1;
const FIRST_REGULAR = 2;
const REGULAR_COUNT = (MAX_EXPONENT - MIN_EXPONENT) * SUBDIVISIONS;
const OVERFLOW = FIRST_REGULAR + REGULAR_COUNT;
const BUCKET_COUNT = OVERFLOW + 1;
// These binary fractions and powers of two are represented exactly.
const EDGES = Object.freeze(Array.from({ length: REGULAR_COUNT + 1 }, (_, i) => {
  const exponent = MIN_EXPONENT + Math.floor(i / SUBDIVISIONS);
  return 2 ** exponent * (1 + (i % SUBDIVISIONS) / SUBDIVISIONS);
}));
const PROBABILITIES = Object.freeze({
  median: Object.freeze({ numerator: 1, denominator: 2 }),
  p99: Object.freeze({ numerator: 99, denominator: 100 }),
  p999: Object.freeze({ numerator: 999, denominator: 1000 })
});

export const QUANTILE_METHOD = Object.freeze({
  name: 'fixed-absolute-histogram/1',
  probabilities: PROBABILITIES,
  rank: 'One-based nearest rank: ceil(n * numerator / denominator), using exact integer arithmetic',
  rankApproximation: 0,
  result: 'Conservative inclusive lower and upper bounds only; no interpolated point estimate',
  regular: Object.freeze({ lowerInclusive: 2 ** MIN_EXPONENT, upperExclusive: 2 ** MAX_EXPONENT,
    subdivisionsPerOctave: SUBDIVISIONS, relativeWidthAtMost: 1 / SUBDIVISIONS }),
  tails: Object.freeze({ zero: 'Exact zero bucket',
    underflow: '(0, 2^-40), reported conservatively as [0, min(2^-40, maximum absolute)]',
    overflow: '[2^40, maximum absolute]', relativeWidthGuarantee: false }),
  maximumAbsolute: MAX_ABSOLUTE,
  maximumBuckets: BUCKET_COUNT
});

const validMagnitude = value => Number.isFinite(value) && value >= 0 && value <= MAX_ABSOLUTE;
const validCount = value => Number.isSafeInteger(value) && value >= 0;
const fields = (value, expected) => value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).length === expected.length && expected.every(key => Object.hasOwn(value, key));
function bucket(absolute) {
  if (absolute === 0) return ZERO;
  if (absolute < EDGES[0]) return UNDERFLOW;
  if (absolute >= EDGES[REGULAR_COUNT]) return OVERFLOW;
  // Binary search avoids logarithm rounding at an octave or subdivision edge.
  let low = 0, high = REGULAR_COUNT;
  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2);
    if (absolute < EDGES[middle]) high = middle;
    else low = middle;
  }
  return FIRST_REGULAR + low;
}
function inspect(state) {
  if (!fields(state, ['version', 'bins']) || state.version !== 1 ||
      !Array.isArray(state.bins) || state.bins.length > BUCKET_COUNT ||
      Object.keys(state.bins).length !== state.bins.length) throw new RangeError('Invalid quantile fields');
  let previous = -1, n = 0;
  for (let i = 0; i < state.bins.length; i++) {
    if (!Object.hasOwn(state.bins, i)) throw new RangeError('Invalid quantile bins');
    const pair = state.bins[i];
    if (!Array.isArray(pair) || pair.length !== 2 || Object.keys(pair).length !== 2 ||
        !Object.hasOwn(pair, 0) || !Object.hasOwn(pair, 1) ||
        !Number.isSafeInteger(pair[0]) || pair[0] <= previous || pair[0] > OVERFLOW ||
        !validCount(pair[1]) || !pair[1]) throw new RangeError('Invalid quantile bins');
    previous = pair[0]; n += pair[1];
    if (!validCount(n)) throw new RangeError('Quantile count overflow');
  }
  return n;
}

export function emptyQuantiles() {
  return { version: 1, bins: [] };
}

export function validateQuantiles(state, n, maxAbs) {
  if (!validCount(n) || !validMagnitude(maxAbs) || (n === 0 && maxAbs !== 0)) {
    throw new RangeError('Invalid quantile aggregate');
  }
  const counted = inspect(state);
  if (counted !== n || (n && state.bins.at(-1)[0] !== bucket(maxAbs))) {
    throw new RangeError('Quantile aggregate mismatch');
  }
  return state;
}

export function addAbsolute(state, absolute) {
  const n = inspect(state);
  if (!validMagnitude(absolute)) throw new RangeError('Invalid absolute residual');
  if (n === Number.MAX_SAFE_INTEGER) throw new RangeError('Quantile count overflow');
  const index = bucket(absolute), bins = [];
  let inserted = false;
  for (const [priorIndex, count] of state.bins) {
    if (!inserted && index < priorIndex) { bins.push([index, 1]); inserted = true; }
    if (index === priorIndex) { bins.push([priorIndex, count + 1]); inserted = true; }
    else bins.push([priorIndex, count]);
  }
  if (!inserted) bins.push([index, 1]);
  return { version: 1, bins };
}

export function mergeQuantiles(left, right) {
  const n = inspect(left) + inspect(right);
  if (!validCount(n)) throw new RangeError('Quantile count overflow');
  const bins = [];
  let a = 0, b = 0;
  while (a < left.bins.length || b < right.bins.length) {
    const l = left.bins[a], r = right.bins[b];
    if (!r || (l && l[0] < r[0])) { bins.push([...l]); a++; }
    else if (!l || r[0] < l[0]) { bins.push([...r]); b++; }
    else { bins.push([l[0], l[1] + r[1]]); a++; b++; }
  }
  return { version: 1, bins };
}

export function summarizeQuantiles(state, n, maxAbs) {
  validateQuantiles(state, n, maxAbs);
  return Object.fromEntries(Object.entries(PROBABILITIES).map(([name, probability]) => {
    if (!n) return [name, null];
    const denominator = BigInt(probability.denominator);
    const rank = Number((BigInt(n) * BigInt(probability.numerator) + denominator - 1n) / denominator);
    let seen = 0, index;
    for (const [candidate, count] of state.bins) {
      seen += count;
      if (seen >= rank) { index = candidate; break; }
    }
    const lower = index === ZERO || index === UNDERFLOW ? 0 :
      index === OVERFLOW ? EDGES[REGULAR_COUNT] : EDGES[index - FIRST_REGULAR];
    const upper = index === ZERO ? 0 : index === UNDERFLOW ? EDGES[0] :
      index === OVERFLOW ? maxAbs : EDGES[index - FIRST_REGULAR + 1];
    return [name, { rank, lower, upper: Math.min(upper, maxAbs) }];
  }));
}
