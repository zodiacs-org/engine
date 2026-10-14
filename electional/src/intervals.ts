/**
 * A half-open span [startMs, endMs) of integer epoch-millisecond labels.
 * Both endpoints must fit Date. Callers must use one resolved clock for all
 * operands; interval arithmetic neither resolves local time nor converts scales.
 */
export interface Interval {
  readonly startMs: number;
  readonly endMs: number;
}

const DATE_LIMIT_MS = 8_640_000_000_000_000;

function validateInstant(value: number): void {
  if (!Number.isSafeInteger(value) || Math.abs(value) > DATE_LIMIT_MS) {
    throw new RangeError('Interval endpoints must be integer milliseconds representable by Date.');
  }
}

function copyInterval(value: Interval): Interval {
  if (typeof value !== 'object' || value === null) {
    throw new RangeError('An interval must have startMs and endMs endpoints.');
  }
  const { startMs, endMs } = value;
  validateInstant(startMs);
  validateInstant(endMs);
  if (startMs > endMs) {
    throw new RangeError('Interval startMs must not exceed endMs.');
  }
  return { startMs, endMs };
}

function freezeIntervals(values: Interval[]): readonly Interval[] {
  for (const value of values) Object.freeze(value);
  return Object.freeze(values);
}

/** Validate, copy, sort and merge overlapping or adjacent spans; discard empties. */
export function normalizeIntervals(values: readonly Interval[]): readonly Interval[] {
  if (!Array.isArray(values)) throw new RangeError('Intervals must be an array.');
  const sorted: Interval[] = [];
  // Iteration exposes a sparse slot as undefined instead of silently skipping it.
  for (const value of values) {
    const interval = copyInterval(value);
    if (interval.startMs < interval.endMs) sorted.push(interval);
  }
  sorted.sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);

  const result: Interval[] = [];
  for (const next of sorted) {
    const previous = result[result.length - 1];
    if (previous && next.startMs <= previous.endMs) {
      result[result.length - 1] = {
        startMs: previous.startMs,
        endMs: Math.max(previous.endMs, next.endMs),
      };
    } else {
      result.push(next);
    }
  }
  return freezeIntervals(result);
}

/** Set union of both inputs, in canonical time order. */
export function unionIntervals(
  left: readonly Interval[],
  right: readonly Interval[],
): readonly Interval[] {
  // Validate each collection before spreading so malformed arrays cannot hide.
  return normalizeIntervals([...normalizeIntervals(left), ...normalizeIntervals(right)]);
}

/** Set intersection. Touching endpoints alone have no duration and are omitted. */
export function intersectIntervals(
  left: readonly Interval[],
  right: readonly Interval[],
): readonly Interval[] {
  const a = normalizeIntervals(left);
  const b = normalizeIntervals(right);
  const result: Interval[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const first = a[i]!;
    const second = b[j]!;
    const startMs = Math.max(first.startMs, second.startMs);
    const endMs = Math.min(first.endMs, second.endMs);
    if (startMs < endMs) result.push({ startMs, endMs });
    if (first.endMs <= second.endMs) i++;
    if (second.endMs <= first.endMs) j++;
  }
  return freezeIntervals(result);
}

/** Set difference: retain the portions of allowed outside excluded. */
export function subtractIntervals(
  allowed: readonly Interval[],
  excluded: readonly Interval[],
): readonly Interval[] {
  const spans = normalizeIntervals(allowed);
  const cuts = normalizeIntervals(excluded);
  const result: Interval[] = [];
  let j = 0;
  for (const span of spans) {
    let cursor = span.startMs;
    while (j < cuts.length && cuts[j]!.endMs <= cursor) j++;
    while (j < cuts.length && cuts[j]!.startMs < span.endMs) {
      const cut = cuts[j]!;
      if (cursor < cut.startMs) result.push({ startMs: cursor, endMs: cut.startMs });
      cursor = Math.max(cursor, cut.endMs);
      // Keep a cut spanning several allowed intervals for the next iteration.
      if (cursor >= span.endMs) break;
      j++;
    }
    if (cursor < span.endMs) result.push({ startMs: cursor, endMs: span.endMs });
  }
  return freezeIntervals(result);
}

/** Restrict windows to a declared domain. */
export function clipIntervals(
  values: readonly Interval[],
  domain: Interval,
): readonly Interval[] {
  return intersectIntervals(values, [domain]);
}

/** The gaps in values within a declared domain. */
export function complementIntervals(
  domain: Interval,
  values: readonly Interval[],
): readonly Interval[] {
  return subtractIntervals([domain], values);
}

/** Membership under start-inclusive, end-exclusive ownership. */
export function containsInstant(values: readonly Interval[], atMs: number): boolean {
  validateInstant(atMs);
  const spans = normalizeIntervals(values);
  let low = 0;
  let high = spans.length;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    const span = spans[middle]!;
    if (atMs < span.startMs) high = middle;
    else if (atMs >= span.endMs) low = middle + 1;
    else return true;
  }
  return false;
}
