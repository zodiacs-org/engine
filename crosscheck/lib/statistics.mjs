// Streaming signed residuals in caller-declared units. No individual values retained.
import { emptyQuantiles, validateQuantiles, addAbsolute, mergeQuantiles, summarizeQuantiles, QUANTILE_METHOD } from './quantiles.mjs';
const STATE_KEYS = Object.freeze(['version', 'tolerance', 'n', 'passed', 'mean', 'm2', 'absSum', 'squareSum', 'maxAbs']);
export function emptyStats(tolerance, { quantiles = false } = {}) {
  if (!Number.isFinite(tolerance) || tolerance < 0 || tolerance > 1e100) throw new RangeError('Invalid tolerance');
  if (typeof quantiles !== 'boolean') throw new RangeError('Invalid quantile option');
  return { version: quantiles ? 2 : 1, tolerance, n: 0, passed: 0, mean: 0, m2: 0, absSum: 0, squareSum: 0, maxAbs: 0,
    ...(quantiles ? { absoluteHistogram: emptyQuantiles() } : {}) };
}

export function validateStats(s) {
  if (!s || ![1, 2].includes(s.version)) throw new RangeError('Invalid statistics version');
  const fields = [...STATE_KEYS, ...(s.version === 2 ? ['absoluteHistogram'] : [])];
  // Refuse extra payloads rather than carrying raw reference values through a merge.
  if (Object.keys(s).length !== fields.length || fields.some(key => !Object.hasOwn(s, key))) {
    throw new RangeError('Invalid aggregate fields');
  }
  emptyStats(s.tolerance);
  if (!Number.isSafeInteger(s.n) || s.n < 0 || !Number.isSafeInteger(s.passed) || s.passed < 0 || s.passed > s.n ||
      !['mean', 'm2', 'absSum', 'squareSum', 'maxAbs'].every(key => Number.isFinite(s[key])) ||
      ['m2', 'absSum', 'squareSum', 'maxAbs'].some(key => s[key] < 0) ||
      s.maxAbs > 1e100 || Math.abs(s.mean) > s.maxAbs ||
      (s.n === 0 && ['mean', 'm2', 'absSum', 'squareSum', 'maxAbs'].some(key => s[key] !== 0))) {
    throw new RangeError('Invalid aggregate state');
  }
  if (s.version === 2) validateQuantiles(s.absoluteHistogram, s.n, s.maxAbs);
  return s;
}

export function mergeStats(left, right) {
  validateStats(left); validateStats(right);
  if (left.tolerance !== right.tolerance) throw new RangeError('Tolerance mismatch');
  if (left.version !== right.version) throw new RangeError('Statistics version mismatch; historical quantiles cannot be recovered');
  const n = left.n + right.n;
  if (!Number.isSafeInteger(n)) throw new RangeError('Count overflow');
  if (!left.n) return structuredClone(right);
  if (!right.n) return structuredClone(left);
  const delta = right.mean - left.mean;
  return validateStats({ version: left.version, tolerance: left.tolerance, n, passed: left.passed + right.passed,
    mean: left.mean + delta * (right.n / n),
    m2: left.m2 + right.m2 + delta * delta * left.n * (right.n / n),
    absSum: left.absSum + right.absSum, squareSum: left.squareSum + right.squareSum,
    maxAbs: Math.max(left.maxAbs, right.maxAbs),
    ...(left.version === 2 ? { absoluteHistogram: mergeQuantiles(left.absoluteHistogram, right.absoluteHistogram) } : {}) });
}

export function addResidual(state, residual) {
  validateStats(state);
  if (!Number.isFinite(residual) || Math.abs(residual) > 1e100) throw new RangeError('Invalid residual');
  const abs = Math.abs(residual);
  return mergeStats(state, { version: state.version, tolerance: state.tolerance, n: 1,
    passed: Number(abs <= state.tolerance), mean: residual, m2: 0,
    absSum: abs, squareSum: residual * residual, maxAbs: abs,
    ...(state.version === 2 ? { absoluteHistogram: addAbsolute(emptyQuantiles(), abs) } : {}) });
}

export function summarize(state) {
  validateStats(state);
  return { n: state.n, passed: state.passed, failed: state.n - state.passed,
    mean: state.n ? state.mean : null, meanAbs: state.n ? state.absSum / state.n : null,
    rms: state.n ? Math.sqrt(state.squareSum / state.n) : null,
    populationStdDev: state.n ? Math.sqrt(state.m2 / state.n) : null,
    maxAbs: state.n ? state.maxAbs : null,
    ...(state.version === 2 ? { absoluteQuantiles: { method: QUANTILE_METHOD,
      ...summarizeQuantiles(state.absoluteHistogram, state.n, state.maxAbs) } } : {}) };
}

// Signed shortest-angle difference in degrees; antipodal ties choose -180.
export function angularResidual(actual, reference) {
  if (![actual, reference].every(value => Number.isFinite(value) && value >= 0 && value < 360)) throw new RangeError('Longitudes must be in [0,360)');
  const delta = actual - reference;
  return delta >= 180 ? delta - 360 : delta < -180 ? delta + 360 : delta;
}
