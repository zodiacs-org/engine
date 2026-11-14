import { findLongitudeCrossingsWith, searchLongitudeCrossingsWith } from "./crossings.js";
import type { CrossingSearchOptions, CrossingSearchResult, LongitudeCrossing } from "./crossings.js";
import { dateFrom } from "./date-input.js";
import { SPEED_STEP_DAYS, bodyLongitude, longitudeSpeed, notingFallbacks } from "./ephemeris.js";
import type { BodyName, DateInput, EphemerisFallback } from "./types.js";

const DAY = 86_400_000;

/** A window's end as the root reads any instant; the crossings entry takes Dates. */
function windowEnd(value: DateInput, end: "start" | "end"): Date {
  return dateFrom(value, `Crossing window ${end}`);
}

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
  /** The ephemeris natal Saturn came from, as a BodyPosition names it; set by `saturnReturn` from 1.1.0-rc.10. */
  ephemeris?: string;
  /**
   * Each kind of fallback from the shipped DE440 pack to astronomy-engine
   * that the natal position or the search to about age 92 met, or none: a
   * search that runs past the pack's last year reports `"outside-de440-span"`.
   * Set by `saturnReturn` from 1.1.0-rc.10.
   */
  flags?: EphemerisFallback[];
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
  from: DateInput,
  to: DateInput,
  stepDays = 5
): LongitudeCrossing[] {
  return findLongitudeCrossingsWith(bodyLongitude, body, targetLongitude, windowEnd(from, "start"), windowEnd(to, "end"), stepDays);
}

/**
 * {@link findLongitudeCrossings} under an optional budget of ephemeris
 * evaluations, `maxSamples`, with the step as `stepDays` (default 5). Over
 * budget, it returns `{ status: "refused", reason: "sample-budget" }` with no
 * crossings rather than throwing. A complete result carries `flags`: each
 * kind of fallback from the shipped DE440 pack to astronomy-engine that a
 * longitude of the search met (`EphemerisFallback`), or none.
 * `findLongitudeCrossings` returns the bare crossings and cannot say.
 */
export function searchLongitudeCrossings(
  body: BodyName,
  targetLongitude: number,
  from: DateInput,
  to: DateInput,
  options?: CrossingSearchOptions
): CrossingSearchResult {
  const { value, fallbacks } = notingFallbacks(() =>
    searchLongitudeCrossingsWith(bodyLongitude, body, targetLongitude, windowEnd(from, "start"), windowEnd(to, "end"), options)
  );
  // A complete search says which fallbacks from the shipped DE440 pack its longitudes met, if any.
  return value.status === "complete" ? { ...value, flags: fallbacks } : value;
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
