import { bodyLongitude } from "./ephemeris.js";
import type { BodyName } from "./types.js";

const DAY = 86_400_000;
// A default 66-year Saturn window needs 4,823 coarse samples; 10,000 also
// accommodates its crossing refinements while bounding synchronous work.
const MAX_CROSSING_SAMPLES = 10_000;

function validMilliseconds(date: Date, label: string): number {
  if (!(date instanceof Date)) throw new RangeError(`${label} must be a valid Date.`);
  const milliseconds = Date.prototype.getTime.call(date);
  if (!Number.isFinite(milliseconds)) throw new RangeError(`${label} must be a valid Date.`);
  return milliseconds;
}

function signedDelta(from: number, to: number): number {
  const difference = (((to - from) % 360) + 360) % 360;
  return difference > 180 ? difference - 360 : difference;
}

export interface LongitudeCrossing {
  at: Date;
  retrograde: boolean;
}

export interface ReturnSeason {
  /** One-based return number. */
  index: number;
  crossings: LongitudeCrossing[];
  first: Date;
  last: Date;
}

export interface SaturnReturnResult {
  natalLon: number;
  natalRetrograde: boolean;
  seasons: ReturnSeason[];
}

/**
 * Search a finite window with at most 10,000 ephemeris samples, including
 * crossing refinements. A step must represent at least one millisecond.
 * Throws RangeError when the requested work exceeds this synchronous budget.
 * Exact boundary roots are included when an adjacent nonzero sample establishes
 * direction. Interior exact roots require opposite signs on either side.
 * Zero-length windows, sampled zero plateaus, and interior tangencies produce no event.
 * Endpoint direction is one-sided; a boundary touch cannot be distinguished
 * from a crossing without extending the requested window.
 */
export function findLongitudeCrossings(
  body: BodyName,
  targetLongitude: number,
  from: Date,
  to: Date,
  stepDays = 5
): LongitudeCrossing[] {
  const fromTime = validMilliseconds(from, "Crossing window start");
  const endTime = validMilliseconds(to, "Crossing window end");
  if (fromTime > endTime) {
    throw new RangeError("Crossing window must have from <= to.");
  }
  if (!Number.isFinite(targetLongitude)) {
    throw new RangeError("targetLongitude must be finite.");
  }
  if (!Number.isFinite(stepDays) || stepDays <= 0) {
    throw new RangeError("stepDays must be positive.");
  }

  const step = stepDays * DAY;
  if (!Number.isFinite(step) || step < 1) {
    throw new RangeError("stepDays must represent a finite step of at least one millisecond.");
  }
  const budgetError = () => new RangeError("Crossing search exceeds the 10,000-sample budget.");
  if (Math.ceil((endTime - fromTime) / step) + 1 > MAX_CROSSING_SAMPLES) {
    throw budgetError();
  }
  let samples = 0;
  function sample(time: number): number {
    if (samples >= MAX_CROSSING_SAMPLES) throw budgetError();
    samples += 1;
    const longitude = bodyLongitude(body, new Date(time));
    if (!Number.isFinite(longitude)) {
      throw new RangeError("Ephemeris returned a non-finite longitude.");
    }
    return signedDelta(targetLongitude, longitude);
  }

  const crossings: LongitudeCrossing[] = [];
  let previousTime = fromTime;
  let previousDelta = sample(fromTime);
  let pendingExact: { time: number; before?: number } | undefined =
    previousDelta === 0 ? { time: fromTime } : undefined;

  while (previousTime < endTime) {
    const time = Math.min(previousTime + step, endTime);
    if (!(time > previousTime)) {
      throw new RangeError("Crossing search step must advance time.");
    }
    const currentDelta = sample(time);

    if (currentDelta === 0) {
      // Defer an interior exact root until its next sample distinguishes a
      // crossing from a touch. Consecutive zeros do not identify a unique root.
      pendingExact =
        previousDelta !== 0 && Math.abs(previousDelta) < 90
          ? { time, before: previousDelta }
          : undefined;
    } else {
      if (
        pendingExact &&
        Math.abs(currentDelta) < 90 &&
        (pendingExact.before === undefined ||
          Math.sign(pendingExact.before) !== Math.sign(currentDelta))
      ) {
        crossings.push({ at: new Date(pendingExact.time), retrograde: currentDelta < 0 });
      }
      pendingExact = undefined;
    }

    if (
      previousDelta !== 0 &&
      currentDelta !== 0 &&
      Math.sign(currentDelta) !== Math.sign(previousDelta) &&
      Math.abs(currentDelta) < 90 &&
      Math.abs(previousDelta) < 90
    ) {
      let lower = previousTime;
      let upper = time;
      const increasing = currentDelta > previousDelta;
      for (let iteration = 0; iteration < 24; iteration += 1) {
        const middle = (lower + upper) / 2;
        const middleDelta = sample(middle);
        if (middleDelta > 0 === increasing) upper = middle;
        else lower = middle;
      }
      crossings.push({ at: new Date(upper), retrograde: !increasing });
    }

    previousTime = time;
    previousDelta = currentDelta;
  }
  if (pendingExact?.before !== undefined) {
    // The window ends on a root: use only the available left-sided direction.
    crossings.push({ at: new Date(pendingExact.time), retrograde: pendingExact.before > 0 });
  }
  return crossings;
}

export function groupIntoSeasons(
  crossings: readonly LongitudeCrossing[],
  gapDays = 400
): ReturnSeason[] {
  if (!Number.isFinite(gapDays) || gapDays <= 0) {
    throw new RangeError("gapDays must be positive.");
  }
  const seasons: ReturnSeason[] = [];
  for (const crossing of crossings) {
    const current = seasons.at(-1);
    if (current && crossing.at.getTime() - current.last.getTime() <= gapDays * DAY) {
      current.crossings.push(crossing);
      current.last = crossing.at;
    } else {
      seasons.push({
        index: seasons.length + 1,
        crossings: [crossing],
        first: crossing.at,
        last: crossing.at
      });
    }
  }
  return seasons;
}

export function computeSaturnReturns(birthUtc: Date): SaturnReturnResult {
  const birthTime = validMilliseconds(birthUtc, "Birth date");
  const before = new Date(birthTime - DAY);
  const after = new Date(birthTime + DAY);
  const from = new Date(birthTime + 26 * 365.25 * DAY);
  const to = new Date(birthTime + 92 * 365.25 * DAY);
  validMilliseconds(before, "Natal speed window start");
  validMilliseconds(after, "Natal speed window end");
  validMilliseconds(from, "Saturn return window start");
  validMilliseconds(to, "Saturn return window end");
  const natalLon = bodyLongitude("Saturn", birthUtc);
  const speed = signedDelta(bodyLongitude("Saturn", before), bodyLongitude("Saturn", after)) / 2;

  return {
    natalLon,
    natalRetrograde: speed < 0,
    seasons: groupIntoSeasons(findLongitudeCrossings("Saturn", natalLon, from, to))
  };
}
