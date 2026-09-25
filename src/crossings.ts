/**
 * The instants a body sits exactly on an ecliptic longitude.
 *
 * This is the engine's one crossing solver. It imports no ephemeris: the
 * caller passes the longitude function. `findLongitudeCrossings` and
 * `searchLongitudeCrossings` in the root entry point run it on the engine's
 * own longitudes, and the `@zodiacs/engine/crossings` entry point carries it
 * without the ephemeris, for scans that bring their own.
 */
import type { BodyName } from "./types.js";

const DAY = 86_400_000;
/** Bisection steps per crossing: the time is known to the step / 2^24. */
const REFINE_STEPS = 24;
/** How far inside the window the direction probe of an edge cell looks. */
const EDGE_PROBE_MAX_MS = 60_000;
/** Crossings closer than this to the one before are the same crossing. */
const DUPLICATE_MS = 1_000;
const GOLDEN = (Math.sqrt(5) - 1) / 2;

/** One pass of a body over a longitude. */
export interface LongitudeCrossing {
  /** The instant, to within the step divided by 2^24. */
  at: Date;
  /** True when the body was moving backward through the degree. */
  retrograde: boolean;
}

/** A longitude source: the ecliptic longitude of `body` at `date`, in degrees. */
export type BodyLongitudeAt = (body: BodyName, date: Date) => number;

export interface CrossingSearchOptions {
  /** Days between coarse samples. Defaults to 5. */
  stepDays?: number;
  /**
   * The most longitude evaluations the search may make, refinements
   * included: a positive integer, or `Infinity`. Defaults to no limit.
   */
  maxSamples?: number;
}

/**
 * A search either completes, with every crossing it found, or is refused
 * whole: a refused search returns no crossings, never part of a result.
 */
export type CrossingSearchResult =
  | {
      status: "complete";
      crossings: LongitudeCrossing[];
      /** Longitude evaluations made. */
      samples: number;
    }
  | {
      status: "refused";
      reason: "sample-budget";
      /**
       * Longitude evaluations made before the search stopped: 0 when the
       * coarse scan alone needs more than `maxSamples`, which is decided
       * before sampling; otherwise `maxSamples`.
       */
      samples: number;
      maxSamples: number;
      crossings: [];
    };

interface Sample {
  time: number;
  longitude: number;
  /** Signed distance from the target, degrees in (-180, 180]. */
  offset: number;
}

/** Thrown inside a search when it reaches its budget; never escapes it. */
class SampleBudgetReached {}

/** Signed shortest angular distance from `from` to `to`, degrees in (-180, 180]. */
function signedDelta(from: number, to: number): number {
  const difference = (((to - from) % 360) + 360) % 360;
  return difference > 180 ? difference - 360 : difference;
}

/** +1 for a local maximum, −1 for a minimum, 0 for no turn between two motions. */
function turn(before: number, after: number): number {
  if ((before > 0 && after <= 0) || (before === 0 && after < 0)) return 1;
  if ((before < 0 && after >= 0) || (before === 0 && after > 0)) return -1;
  return 0;
}

/** Offsets on one side of the target, none on it and none across the circle. */
function sameSideNear(...offsets: number[]): boolean {
  const side = Math.sign(offsets[0] ?? 0);
  return offsets.every(
    (offset) => offset !== 0 && Math.abs(offset) < 90 && Math.sign(offset) === side
  );
}

/** Twice the parabolic excess of the curvature through three samples. */
function reachOf(before: Sample, middle: Sample, after: Sample): number {
  const g0 = signedDelta(before.longitude, middle.longitude);
  const g1 = signedDelta(middle.longitude, after.longitude);
  const h0 = middle.time - before.time;
  const h1 = after.time - middle.time;
  return ((2 * Math.abs(g1 / h1 - g0 / h0)) / (h0 + h1)) * Math.max(h0, h1) ** 2;
}

function windowTime(date: Date, label: string): number {
  if (!(date instanceof Date)) throw new RangeError(`${label} must be a valid Date.`);
  const milliseconds = Date.prototype.getTime.call(date);
  if (!Number.isFinite(milliseconds)) throw new RangeError(`${label} must be a valid Date.`);
  return milliseconds;
}

interface Window {
  fromTime: number;
  toTime: number;
  step: number;
}

function validWindow(targetLongitude: number, from: Date, to: Date, stepDays: number): Window {
  const fromTime = windowTime(from, "Crossing window start");
  const toTime = windowTime(to, "Crossing window end");
  if (fromTime > toTime) throw new RangeError("Crossing window must have from <= to.");
  if (!Number.isFinite(targetLongitude)) throw new RangeError("targetLongitude must be finite.");
  if (typeof stepDays !== "number" || !Number.isFinite(stepDays) || stepDays <= 0) {
    throw new RangeError("stepDays must be positive.");
  }
  const step = stepDays * DAY;
  if (!Number.isFinite(step) || step < 1) {
    throw new RangeError("stepDays must represent a finite step of at least one millisecond.");
  }
  return { fromTime, toTime, step };
}

function validBudget(maxSamples: number | undefined): number {
  if (maxSamples === undefined || maxSamples === Number.POSITIVE_INFINITY) {
    return Number.POSITIVE_INFINITY;
  }
  if (!Number.isInteger(maxSamples) || maxSamples < 1) {
    throw new RangeError("maxSamples must be a positive integer or Infinity.");
  }
  return maxSamples;
}

/**
 * Coarse samples of a non-empty window: `from`, every `from + k·step`
 * strictly before `to`, and `to`.
 */
function coarseSampleCount({ fromTime, toTime, step }: Window): number {
  const estimate = Math.ceil((toTime - fromTime) / step) - 1;
  // Far beyond any budget or any run time; not worth counting exactly.
  if (!(estimate < 2 ** 52)) return estimate + 2;
  let interior = Math.max(0, estimate);
  while (interior > 0 && fromTime + interior * step >= toTime) interior -= 1;
  while (fromTime + (interior + 1) * step < toTime) interior += 1;
  return interior + 2;
}

/**
 * The scan itself, over a non-empty window, in one pass that keeps the last
 * three coarse samples. `longitudeAt` counts, checks and may stop.
 */
function solve(
  longitudeAt: (time: number) => number,
  targetLongitude: number,
  { fromTime, toTime, step }: Window,
  count: number
): LongitudeCrossing[] {
  const found: LongitudeCrossing[] = [];
  const offsetAt = (time: number) => signedDelta(targetLongitude, longitudeAt(time));
  const sampleAt = (time: number): Sample => {
    const longitude = longitudeAt(time);
    return { time, longitude, offset: signedDelta(targetLongitude, longitude) };
  };
  const keep = (time: number, retrograde: boolean) => {
    if (time > fromTime && time <= toTime) found.push({ at: new Date(time), retrograde });
  };
  const bisect = (low: number, high: number, rising: boolean): number => {
    let lower = low;
    let upper = high;
    for (let iteration = 0; iteration < REFINE_STEPS; iteration += 1) {
      const middle = (lower + upper) / 2;
      if (offsetAt(middle) > 0 === rising) upper = middle;
      else lower = middle;
    }
    return upper;
  };

  /** Find the extremum on [low, high]; if it passes the target, keep both roots. */
  const completePair = (low: number, high: number, maximize: boolean, side: number) => {
    let a = low;
    let b = high;
    let x1 = b - GOLDEN * (b - a);
    let x2 = a + GOLDEN * (b - a);
    let v1 = offsetAt(x1);
    let v2 = offsetAt(x2);
    while (b - a > 1) {
      if (maximize ? v1 < v2 : v1 > v2) {
        a = x1;
        x1 = x2;
        v1 = v2;
        x2 = a + GOLDEN * (b - a);
        v2 = offsetAt(x2);
      } else {
        b = x2;
        x2 = x1;
        v2 = v1;
        x1 = b - GOLDEN * (b - a);
        v1 = offsetAt(x1);
      }
    }
    const extremum = (a + b) / 2;
    const extremeOffset = offsetAt(extremum);
    if (extremeOffset === 0) {
      keep(extremum, false);
      return;
    }
    if (Math.sign(extremeOffset) === side) return;
    keep(bisect(low, extremum, maximize), !maximize);
    keep(bisect(extremum, high, !maximize), maximize);
  };

  /** A sign change between neighbouring samples, or an exact sample. */
  const signChange = (previous: Sample, current: Sample) => {
    // An exact sample belongs to the cell that ends on it, once. Skipping a
    // zero previous sample also leaves the lower bound of (from, to] out.
    // Offsets of 90° or more are the far side of the circle, not a crossing.
    if (current.offset === 0 && previous.offset !== 0 && Math.abs(previous.offset) < 90) {
      found.push({ at: new Date(current.time), retrograde: previous.offset > 0 });
    } else if (
      previous.offset !== 0 &&
      current.offset !== 0 &&
      Math.sign(current.offset) !== Math.sign(previous.offset) &&
      Math.abs(current.offset) < 90 &&
      Math.abs(previous.offset) < 90
    ) {
      const rising = current.offset > previous.offset;
      // Longitude increasing through the degree is direct motion.
      found.push({ at: new Date(bisect(previous.time, current.time, rising)), retrograde: !rising });
    }
  };

  /** Motion that turns at the middle sample without the offset changing sign. */
  const interiorTurn = (before: Sample, middle: Sample, after: Sample) => {
    const kind = turn(
      signedDelta(before.longitude, middle.longitude),
      signedDelta(middle.longitude, after.longitude)
    );
    if (kind === 0 || !sameSideNear(before.offset, middle.offset, after.offset)) return;
    const maximize = kind > 0;
    // A maximum below the target or a minimum above it can reach it.
    if (maximize !== middle.offset < 0) return;
    if (Math.abs(middle.offset) > reachOf(before, middle, after) + 1e-12) return;
    completePair(before.time, after.time, maximize, Math.sign(middle.offset));
  };

  /**
   * A turn inside the first or last cell has no third sample. A direction
   * probe just inside the window finds it, taken only when the edge offsets
   * are within reach of the neighbouring curvature.
   */
  const edgeCell = (low: Sample, high: Sample, reach: number, first: boolean) => {
    if (!sameSideNear(low.offset, high.offset)) return;
    if (Math.min(Math.abs(low.offset), Math.abs(high.offset)) > reach + 1e-12) return;
    const probe = Math.min(EDGE_PROBE_MAX_MS, (high.time - low.time) / 1000);
    if (!(probe > 0)) return;
    const cell = signedDelta(low.longitude, high.longitude);
    const probeLongitude = longitudeAt(first ? low.time + probe : high.time - probe);
    const local = first
      ? signedDelta(low.longitude, probeLongitude)
      : signedDelta(probeLongitude, high.longitude);
    const kind = first ? turn(local, cell) : turn(cell, local);
    if (kind === 0) return;
    const maximize = kind > 0;
    if (maximize !== low.offset < 0) return;
    completePair(low.time, high.time, maximize, Math.sign(low.offset));
  };

  // One pass over the coarse samples, holding the last three. The edge cells
  // take four times the reach of the curvature next to them; a window of a
  // single cell has no curvature to go by and always probes.
  let secondLast: Sample | undefined;
  let last = sampleAt(fromTime);
  for (let index = 1; index < count; index += 1) {
    const current = sampleAt(index === count - 1 ? toTime : fromTime + index * step);
    signChange(last, current);
    if (secondLast) {
      interiorTurn(secondLast, last, current);
      if (index === 2 || index === count - 1) {
        const reach = 4 * reachOf(secondLast, last, current);
        if (index === 2) edgeCell(secondLast, last, reach, true);
        if (index === count - 1) edgeCell(last, current, reach, false);
      }
    }
    secondLast = last;
    last = current;
  }
  if (count === 2 && secondLast) {
    edgeCell(secondLast, last, Number.POSITIVE_INFINITY, true);
    edgeCell(secondLast, last, Number.POSITIVE_INFINITY, false);
  }

  found.sort((a, b) => a.at.getTime() - b.at.getTime());
  const crossings: LongitudeCrossing[] = [];
  let previous: LongitudeCrossing | undefined;
  for (const crossing of found) {
    if (!previous || crossing.at.getTime() - previous.at.getTime() >= DUPLICATE_MS) {
      crossings.push(crossing);
    }
    previous = crossing;
  }
  return crossings;
}

function run(
  longitudeAt: BodyLongitudeAt,
  body: BodyName,
  targetLongitude: number,
  window: Window,
  maxSamples: number
): CrossingSearchResult {
  const refused = (samples: number): CrossingSearchResult => ({
    status: "refused",
    reason: "sample-budget",
    samples,
    maxSamples,
    crossings: []
  });
  if (window.toTime === window.fromTime) return { status: "complete", crossings: [], samples: 0 };
  // The coarse scan's size is known before any sampling; refinements are not.
  const count = coarseSampleCount(window);
  if (count > maxSamples) return refused(0);

  let samples = 0;
  const sample = (time: number): number => {
    if (samples >= maxSamples) throw new SampleBudgetReached();
    samples += 1;
    const longitude = longitudeAt(body, new Date(time));
    if (!Number.isFinite(longitude)) {
      throw new RangeError("Ephemeris returned a non-finite longitude.");
    }
    return longitude;
  };
  try {
    const crossings = solve(sample, targetLongitude, window, count);
    return { status: "complete", crossings, samples };
  } catch (error) {
    if (error instanceof SampleBudgetReached) return refused(samples);
    throw error;
  }
}

/**
 * Every instant in (from, to] when `body` sits exactly on `targetLongitude`,
 * in time order, from the longitudes `longitudeAt` returns.
 *
 * The scan samples `from`, every `stepDays` after it, and `to`, and bisects
 * each sign change of the offset from the target 24 times, to the step
 * divided by 2^24. A root exactly at `from` is left to the window that ends
 * there. A sample exactly on the target is reported once, at that sample, in
 * the direction of the sample before it. Offsets of 90° or more are read as
 * the far side of the circle, not a crossing.
 *
 * A plain scan loses both crossings when a station falls between two samples
 * just past the target: at a 5-day step, a Saturn station within 0.0103° of
 * it, or a Jupiter station within 0.0205°. Where the sampled motion turns
 * without the offset changing sign, and the turning sample is within reach of
 * the local curvature, a golden-section search finds the extremum. Both
 * crossings are bisected when it passes the target, and one is reported, as
 * direct, when it only touches. A turn in the first or last cell is found by a
 * probe one minute inside the window; no sample falls outside [from, to].
 * Crossings less than a second after another are the same crossing. The
 * search assumes smooth motion with at most one station in two steps; it is
 * tested, not proven complete.
 *
 * There is no sample budget: the work grows with (to − from) / step, and
 * {@link searchLongitudeCrossingsWith} bounds it. Throws RangeError for an
 * invalid window, target or step, and for a non-finite longitude.
 */
export function findLongitudeCrossingsWith(
  longitudeAt: BodyLongitudeAt,
  body: BodyName,
  targetLongitude: number,
  from: Date,
  to: Date,
  stepDays = 5
): LongitudeCrossing[] {
  const window = validWindow(targetLongitude, from, to, stepDays);
  const result = run(longitudeAt, body, targetLongitude, window, Number.POSITIVE_INFINITY);
  return result.crossings;
}

/**
 * The search {@link findLongitudeCrossingsWith} makes, with the step as
 * `options.stepDays` (default 5), under an optional budget of longitude
 * evaluations, `options.maxSamples`. It is refused before any sampling when
 * the coarse scan alone needs more than the budget, and otherwise when a
 * refinement would pass it; either way it returns a typed refusal with no
 * crossings rather than throwing. Invalid input still throws RangeError.
 */
export function searchLongitudeCrossingsWith(
  longitudeAt: BodyLongitudeAt,
  body: BodyName,
  targetLongitude: number,
  from: Date,
  to: Date,
  options: CrossingSearchOptions = {}
): CrossingSearchResult {
  if (options === null || typeof options !== "object") {
    throw new RangeError("Crossing search options must be an object.");
  }
  const stepDays = options.stepDays === undefined ? 5 : options.stepDays;
  const window = validWindow(targetLongitude, from, to, stepDays);
  const maxSamples = validBudget(options.maxSamples);
  return run(longitudeAt, body, targetLongitude, window, maxSamples);
}
