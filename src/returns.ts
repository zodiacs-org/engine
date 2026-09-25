import { findLongitudeCrossingsWith, searchLongitudeCrossingsWith } from "./crossings.js";
import type { CrossingSearchOptions, CrossingSearchResult, LongitudeCrossing } from "./crossings.js";
import { SPEED_STEP_DAYS, bodyLongitude, longitudeSpeed } from "./ephemeris.js";
import type { BodyName } from "./types.js";

const DAY = 86_400_000;

function validMilliseconds(date: Date, label: string): number {
  if (!(date instanceof Date)) throw new RangeError(`${label} must be a valid Date.`);
  const milliseconds = Date.prototype.getTime.call(date);
  if (!Number.isFinite(milliseconds)) throw new RangeError(`${label} must be a valid Date.`);
  return milliseconds;
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
 * Every instant in (from, to] when `body` sits exactly on `targetLongitude`,
 * from the engine's apparent geocentric longitudes, in time order. This is
 * {@link findLongitudeCrossingsWith} on the engine's ephemeris, with its
 * conventions: a root exactly at `from` is not reported and one exactly at
 * `to` is, an exact sample is reported once, and a pair of crossings around a
 * station that falls between two samples is found and kept. There is no
 * sample budget; {@link searchLongitudeCrossings} takes one and refuses
 * instead of throwing. Invalid input throws RangeError.
 */
export function findLongitudeCrossings(
  body: BodyName,
  targetLongitude: number,
  from: Date,
  to: Date,
  stepDays = 5
): LongitudeCrossing[] {
  return findLongitudeCrossingsWith(bodyLongitude, body, targetLongitude, from, to, stepDays);
}

/**
 * {@link findLongitudeCrossings} under an optional budget of ephemeris
 * evaluations, `maxSamples`, with the step as `stepDays` (default 5). Over
 * budget, it returns `{ status: "refused", reason: "sample-budget" }` with no
 * crossings rather than throwing.
 */
export function searchLongitudeCrossings(
  body: BodyName,
  targetLongitude: number,
  from: Date,
  to: Date,
  options?: CrossingSearchOptions
): CrossingSearchResult {
  return searchLongitudeCrossingsWith(bodyLongitude, body, targetLongitude, from, to, options);
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
  // The chart's own speed decides the natal direction, so the two agree at a station.
  const before = new Date(birthTime - SPEED_STEP_DAYS * DAY);
  const after = new Date(birthTime + SPEED_STEP_DAYS * DAY);
  const from = new Date(birthTime + 26 * 365.25 * DAY);
  const to = new Date(birthTime + 92 * 365.25 * DAY);
  validMilliseconds(before, "Natal speed window start");
  validMilliseconds(after, "Natal speed window end");
  validMilliseconds(from, "Saturn return window start");
  validMilliseconds(to, "Saturn return window end");
  const natalLon = bodyLongitude("Saturn", birthUtc);
  const speed = longitudeSpeed("Saturn", birthUtc);

  return {
    natalLon,
    natalRetrograde: speed < 0,
    seasons: groupIntoSeasons(findLongitudeCrossings("Saturn", natalLon, from, to))
  };
}
