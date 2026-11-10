import { expect } from "vitest";

/** Compare the binary64 representation, preserving the sign of zero. */
export function bits(value: number): bigint {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, value, false);
  return view.getBigUint64(0, false);
}

export function expectSameNumber(actual: number, expected: number, context: string): void {
  // Unchecked arithmetic can produce NaN. Its payload and sign are outside
  // numeric compatibility; runtimes may canonicalize them.
  if (Number.isNaN(expected)) expect(Number.isNaN(actual), context).toBe(true);
  else expect(bits(actual), context).toBe(bits(expected));
}

type Outcome<T> = { ok: true; value: T } | { ok: false; error: unknown };

export function outcome<T>(operation: () => T): Outcome<T> {
  try {
    return { ok: true, value: operation() };
  } catch (error) {
    return { ok: false, error };
  }
}

export function expectSameError(actual: unknown, expected: unknown, context: string): void {
  expect(actual, context).toBeInstanceOf(Error);
  expect(expected, context).toBeInstanceOf(Error);
  const actualError = actual as Error;
  const expectedError = expected as Error;
  expect(actualError.constructor, context).toBe(expectedError.constructor);
  expect(actualError.message, context).toBe(expectedError.message);
}

export function expectSameNumberCall(actual: () => number, expected: () => number, context: string): void {
  const reference = outcome(expected);
  const result = outcome(actual);
  expect(result.ok, context).toBe(reference.ok);
  if (reference.ok && result.ok) expectSameNumber(result.value, reference.value, context);
  else if (!reference.ok && !result.ok) expectSameError(result.error, reference.error, context);
}

/** Seeded synthetic inputs: no ephemeris or external fixture is consulted. */
export function randomUint32(seed: number): () => number {
  return () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return seed >>> 0;
  };
}

export function* binary64Samples(count: number, seed: number): Generator<number> {
  const next = randomUint32(seed);
  const view = new DataView(new ArrayBuffer(8));
  for (let sample = 0; sample < count; sample++) {
    view.setUint32(0, next(), false);
    view.setUint32(4, next(), false);
    yield view.getFloat64(0, false);
  }
}

/** Adjacent representable values around an exactly expressed boundary. */
export function neighbors(value: number): number[] {
  if (value === 0) return [-Number.MIN_VALUE, -0, 0, Number.MIN_VALUE];
  const view = new DataView(new ArrayBuffer(8));
  view.setBigUint64(0, bits(value) - 1n, false);
  const belowBits = view.getFloat64(0, false);
  view.setBigUint64(0, bits(value) + 1n, false);
  return [belowBits, value, view.getFloat64(0, false)];
}
