// Streaming signed residuals in caller-declared units. No individual values retained.
const STATE_KEYS = Object.freeze(['version', 'tolerance', 'n', 'passed', 'mean', 'm2', 'absSum', 'squareSum', 'maxAbs']);
export function emptyStats(tolerance) {
  if (!Number.isFinite(tolerance) || tolerance < 0 || tolerance > 1e100) throw new RangeError('Invalid tolerance');
  return { version: 1, tolerance, n: 0, passed: 0, mean: 0, m2: 0, absSum: 0, squareSum: 0, maxAbs: 0 };
}

export function validateStats(s) {
  if (!s || s.version !== 1) throw new RangeError('Invalid statistics version');
  // Refuse extra payloads rather than carrying raw reference values through a merge.
  if (Object.keys(s).length !== STATE_KEYS.length || STATE_KEYS.some(key => !Object.hasOwn(s, key))) {
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
  return s;
}

export function mergeStats(left, right) {
  validateStats(left); validateStats(right);
  if (left.tolerance !== right.tolerance) throw new RangeError('Tolerance mismatch');
  const n = left.n + right.n;
  if (!Number.isSafeInteger(n)) throw new RangeError('Count overflow');
  if (!left.n) return { ...right };
  if (!right.n) return { ...left };
  const delta = right.mean - left.mean;
  return validateStats({ version: 1, tolerance: left.tolerance, n, passed: left.passed + right.passed,
    mean: left.mean + delta * (right.n / n),
    m2: left.m2 + right.m2 + delta * delta * left.n * (right.n / n),
    absSum: left.absSum + right.absSum, squareSum: left.squareSum + right.squareSum,
    maxAbs: Math.max(left.maxAbs, right.maxAbs) });
}

export function addResidual(state, residual) {
  if (!Number.isFinite(residual) || Math.abs(residual) > 1e100) throw new RangeError('Invalid residual');
  const abs = Math.abs(residual);
  return mergeStats(state, { version: 1, tolerance: state.tolerance, n: 1,
    passed: Number(abs <= state.tolerance), mean: residual, m2: 0,
    absSum: abs, squareSum: residual * residual, maxAbs: abs });
}

export function summarize(state) {
  validateStats(state);
  return { n: state.n, passed: state.passed, failed: state.n - state.passed,
    mean: state.n ? state.mean : null, meanAbs: state.n ? state.absSum / state.n : null,
    rms: state.n ? Math.sqrt(state.squareSum / state.n) : null,
    populationStdDev: state.n ? Math.sqrt(state.m2 / state.n) : null,
    maxAbs: state.n ? state.maxAbs : null };
}

// Signed shortest-angle difference in degrees; antipodal ties choose -180.
export function angularResidual(actual, reference) {
  if (![actual, reference].every(value => Number.isFinite(value) && value >= 0 && value < 360)) throw new RangeError('Longitudes must be in [0,360)');
  const delta = actual - reference;
  return delta >= 180 ? delta - 360 : delta < -180 ? delta + 360 : delta;
}
