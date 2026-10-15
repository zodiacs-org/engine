export type CartesianTriple = readonly [number, number, number];

export interface ChebyshevSegment {
  readonly startJdTt: number;
  readonly endJdTt: number;
  /** Coefficients of T_0 through T_degree, with no halving of T_0. */
  readonly coefficientsAu: readonly [readonly number[], readonly number[], readonly number[]];
}

export interface ChebyshevSample {
  readonly jdTt: number;
  readonly positionAu: CartesianTriple;
}

export interface ChebyshevFitInput {
  readonly startJdTt: number;
  readonly endJdTt: number;
  readonly degree: number;
  readonly samples: readonly ChebyshevSample[];
}

/** Operational limits only, not statements of astronomical coverage or accuracy. */
export const CHEBYSHEV_LIMITS = Object.freeze({
  maxDegree: 64,
  maxSamples: 4096,
  maxAbsAu: 1_000_000,
  maxJdTt: 10_000_000,
  maxConditionInfinity: 100_000_000
});

const validatedSegments = new WeakSet<object>();

function fail(message: string): never {
  throw new RangeError(`Invalid Chebyshev data: ${message}`);
}

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail("expected an object.");
  return value as Record<string, unknown>;
}

function field(value: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (descriptor === undefined || !("value" in descriptor)) fail("expected an own data field.");
  return descriptor.value as unknown;
}

function exactKeys(value: object, keys: readonly string[]): void {
  const actual = Reflect.ownKeys(value);
  if (actual.length !== keys.length || actual.some((key) => typeof key !== "string" || !keys.includes(key))) {
    fail("unexpected object fields.");
  }
}

function finiteNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) fail(`${label} must be finite.`);
  return value;
}

function epoch(value: unknown): number {
  const result = finiteNumber(value, "TT Julian date");
  if (result <= 0 || result > CHEBYSHEV_LIMITS.maxJdTt) fail("TT Julian date exceeds operational limits.");
  return result;
}

function interval(start: unknown, end: unknown): readonly [number, number, number] {
  const startJdTt = epoch(start);
  const endJdTt = epoch(end);
  const span = endJdTt - startJdTt;
  if (!(span > 0) || !Number.isFinite(2 / span)) fail("segment must have a positive finite duration.");
  return [startJdTt, endJdTt, span];
}

function au(value: unknown): number {
  const result = finiteNumber(value, "Cartesian value");
  if (Math.abs(result) > CHEBYSHEV_LIMITS.maxAbsAu) fail("Cartesian value exceeds operational limits.");
  return Object.is(result, -0) ? 0 : result;
}

function array(value: unknown, min: number, max: number): readonly unknown[] {
  if (!Array.isArray(value) || value.length < min || value.length > max) fail("unexpected array length.");
  return value as readonly unknown[];
}

function coordinate(jdTt: number, start: number, end: number): number {
  if (jdTt < start || jdTt > end) fail("epoch lies outside the segment; extrapolation is forbidden.");
  return 2 * ((jdTt - start) / (end - start)) - 1;
}

/** Validate plain data and retain a deeply frozen snapshot, never caller-owned arrays. */
export function validateChebyshevSegment(value: unknown): ChebyshevSegment {
  const input = record(value);
  if (validatedSegments.has(input)) return input as unknown as ChebyshevSegment;
  exactKeys(input, ["startJdTt", "endJdTt", "coefficientsAu"]);
  const [startJdTt, endJdTt, span] = interval(field(input, "startJdTt"), field(input, "endJdTt"));
  const axes = array(field(input, "coefficientsAu"), 3, 3);
  let length = -1;
  const coefficients = [] as number[][];
  for (let axis = 0; axis < 3; axis++) {
    const values = array(field(axes, String(axis)), 1, CHEBYSHEV_LIMITS.maxDegree + 1);
    if (length !== -1 && length !== values.length) fail("all axes must have the same degree.");
    length = values.length;
    const copy: number[] = [];
    let derivativeBound = 0;
    for (let k = 0; k < length; k++) {
      const value = au(field(values, String(k)));
      copy.push(value);
      // |T'_k(x)| <= k^2 on [-1, 1]. Reject intervals that can overflow a rate.
      derivativeBound += Math.abs(value) * k * k;
    }
    if (!Number.isFinite(derivativeBound * (2 / span))) fail("derivative can overflow.");
    coefficients.push(copy);
  }
  const result: ChebyshevSegment = Object.freeze({
    startJdTt,
    endJdTt,
    coefficientsAu: Object.freeze([
      Object.freeze(coefficients[0]!), Object.freeze(coefficients[1]!), Object.freeze(coefficients[2]!)
    ] as const)
  });
  validatedSegments.add(result);
  return result;
}

/** Exact infinity-norm condition of the computed triangular factor, up to rounding. */
function triangularCondition(r: readonly number[][], size: number): number {
  let norm = 0;
  const inverseRowSums = new Array<number>(size).fill(0);
  for (let row = 0; row < size; row++) {
    let sum = 0;
    for (let col = row; col < size; col++) sum += Math.abs(r[row]![col]!);
    norm = Math.max(norm, sum);
  }
  for (let col = 0; col < size; col++) {
    const solution = new Array<number>(size).fill(0);
    for (let row = col; row >= 0; row--) {
      let value = row === col ? 1 : 0;
      for (let k = row + 1; k <= col; k++) value -= r[row]![k]! * solution[k]!;
      solution[row] = value / r[row]![row]!;
      inverseRowSums[row] = inverseRowSums[row]! + Math.abs(solution[row]!);
    }
  }
  return norm * Math.max(...inverseRowSums);
}

/**
 * Unweighted least squares at the supplied epochs using Householder QR.
 * Rounded Horizons epochs are used as supplied; no ideal cosine grid is assumed.
 * Identical ordered input has deterministic output within the same JS runtime.
 */
export function fitChebyshevSegment(input: ChebyshevFitInput): ChebyshevSegment {
  const options = record(input);
  exactKeys(options, ["startJdTt", "endJdTt", "degree", "samples"]);
  const [startJdTt, endJdTt] = interval(field(options, "startJdTt"), field(options, "endJdTt"));
  const degree = finiteNumber(field(options, "degree"), "degree");
  if (!Number.isInteger(degree) || degree < 0 || degree > CHEBYSHEV_LIMITS.maxDegree) fail("invalid degree.");
  const width = degree + 1;
  const samples = array(field(options, "samples"), width, CHEBYSHEV_LIMITS.maxSamples);
  const matrix: number[][] = [];
  const rhs: number[][] = [];
  let previous = -Infinity;
  for (let i = 0; i < samples.length; i++) {
    const sample = record(field(samples, String(i)));
    const jdTt = epoch(field(sample, "jdTt"));
    if (jdTt <= previous) fail("sample epochs must be strictly increasing and distinct.");
    previous = jdTt;
    const x = coordinate(jdTt, startJdTt, endJdTt);
    const position = array(field(sample, "positionAu"), 3, 3);
    rhs.push([au(field(position, "0")), au(field(position, "1")), au(field(position, "2"))]);
    const row = new Array<number>(width);
    row[0] = 1;
    if (degree > 0) row[1] = x;
    for (let k = 2; k < width; k++) row[k] = 2 * x * row[k - 1]! - row[k - 2]!;
    matrix.push(row);
  }

  // Every initial Chebyshev matrix entry is bounded by one. This threshold
  // refuses numerical rank loss before dividing by an unreliable diagonal.
  const rankTolerance = Number.EPSILON * samples.length * Math.sqrt(samples.length);
  for (let k = 0; k < width; k++) {
    let norm = 0;
    for (let row = k; row < samples.length; row++) norm = Math.hypot(norm, matrix[row]![k]!);
    if (!(norm > rankTolerance)) fail("rank-deficient sample geometry.");
    const first = matrix[k]![k]!;
    const alpha = first >= 0 ? -norm : norm;
    const divisor = first - alpha;
    const tau = (alpha - first) / alpha;
    matrix[k]![k] = alpha;
    for (let row = k + 1; row < samples.length; row++) matrix[row]![k] = matrix[row]![k]! / divisor;

    for (let col = k + 1; col < width; col++) {
      let dot = matrix[k]![col]!;
      for (let row = k + 1; row < samples.length; row++) dot += matrix[row]![k]! * matrix[row]![col]!;
      dot *= tau;
      matrix[k]![col] = matrix[k]![col]! - dot;
      for (let row = k + 1; row < samples.length; row++) {
        matrix[row]![col] = matrix[row]![col]! - matrix[row]![k]! * dot;
      }
    }
    for (let axis = 0; axis < 3; axis++) {
      let dot = rhs[k]![axis]!;
      for (let row = k + 1; row < samples.length; row++) dot += matrix[row]![k]! * rhs[row]![axis]!;
      dot *= tau;
      rhs[k]![axis] = rhs[k]![axis]! - dot;
      for (let row = k + 1; row < samples.length; row++) {
        rhs[row]![axis] = rhs[row]![axis]! - matrix[row]![k]! * dot;
      }
    }
  }
  const condition = triangularCondition(matrix, width);
  if (!Number.isFinite(condition) || condition > CHEBYSHEV_LIMITS.maxConditionInfinity) {
    fail("ill-conditioned sample geometry.");
  }
  const coefficients = Array.from({ length: 3 }, () => new Array<number>(width).fill(0));
  for (let axis = 0; axis < 3; axis++) {
    for (let row = width - 1; row >= 0; row--) {
      let value = rhs[row]![axis]!;
      for (let col = row + 1; col < width; col++) value -= matrix[row]![col]! * coefficients[axis]![col]!;
      coefficients[axis]![row] = value / matrix[row]![row]!;
    }
  }
  return validateChebyshevSegment({ startJdTt, endJdTt, coefficientsAu: coefficients });
}

function clenshaw(coefficients: readonly number[], x: number): readonly [number, number] {
  let b1 = 0;
  let b2 = 0;
  let d1 = 0;
  let d2 = 0;
  for (let k = coefficients.length - 1; k >= 1; k--) {
    const b0 = 2 * x * b1 - b2 + coefficients[k]!;
    const d0 = 2 * b1 + 2 * x * d1 - d2;
    b2 = b1;
    b1 = b0;
    d2 = d1;
    d1 = d0;
  }
  return [coefficients[0]! + x * b1 - b2, b1 + x * d1 - d2];
}

/** Evaluate both inclusive edges, with analytic derivatives in au per TT day. */
export function evaluateChebyshevSegment(segment: ChebyshevSegment, jdTt: number): Readonly<{
  positionAu: CartesianTriple;
  velocityAuPerDay: CartesianTriple;
}> {
  const checked = validateChebyshevSegment(segment);
  const x = coordinate(epoch(jdTt), checked.startJdTt, checked.endJdTt);
  const rate = 2 / (checked.endJdTt - checked.startJdTt);
  const axes = checked.coefficientsAu.map((coefficients) => clenshaw(coefficients, x));
  const positionAu: CartesianTriple = Object.freeze([axes[0]![0], axes[1]![0], axes[2]![0]]);
  const velocityAuPerDay: CartesianTriple = Object.freeze([axes[0]![1] * rate, axes[1]![1] * rate, axes[2]![1] * rate]);
  if (![...positionAu, ...velocityAuPerDay].every(Number.isFinite)) fail("nonfinite evaluated result.");
  return Object.freeze({ positionAu, velocityAuPerDay });
}
