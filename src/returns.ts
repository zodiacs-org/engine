import { bodyLongitude } from "./ephemeris.js";
import type { BodyName } from "./types.js";

const DAY = 86_400_000;

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

export function findLongitudeCrossings(
  body: BodyName,
  targetLongitude: number,
  from: Date,
  to: Date,
  stepDays = 5
): LongitudeCrossing[] {
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime())) {
    throw new RangeError("Crossing window dates must be valid.");
  }
  if (from.getTime() > to.getTime()) {
    throw new RangeError("Crossing window must have from <= to.");
  }
  if (!Number.isFinite(stepDays) || stepDays <= 0) {
    throw new RangeError("stepDays must be positive.");
  }

  const crossings: LongitudeCrossing[] = [];
  const step = stepDays * DAY;
  let previousTime = from.getTime();
  let previousDelta = signedDelta(targetLongitude, bodyLongitude(body, from));
  const endTime = to.getTime();

  while (previousTime < endTime) {
    const time = Math.min(previousTime + step, endTime);
    const currentDelta = signedDelta(targetLongitude, bodyLongitude(body, new Date(time)));

    if (
      Math.sign(currentDelta) !== Math.sign(previousDelta) &&
      Math.abs(currentDelta) < 90 &&
      Math.abs(previousDelta) < 90
    ) {
      let lower = previousTime;
      let upper = time;
      const increasing = currentDelta > previousDelta;
      for (let iteration = 0; iteration < 24; iteration += 1) {
        const middle = (lower + upper) / 2;
        const middleDelta = signedDelta(targetLongitude, bodyLongitude(body, new Date(middle)));
        if (middleDelta > 0 === increasing) upper = middle;
        else lower = middle;
      }
      crossings.push({ at: new Date(upper), retrograde: !increasing });
    }

    previousTime = time;
    previousDelta = currentDelta;
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
  if (!Number.isFinite(birthUtc.getTime())) {
    throw new RangeError("Birth date must be valid.");
  }
  const natalLon = bodyLongitude("Saturn", birthUtc);
  const speed =
    signedDelta(
      bodyLongitude("Saturn", new Date(birthUtc.getTime() - DAY)),
      bodyLongitude("Saturn", new Date(birthUtc.getTime() + DAY))
    ) / 2;

  const from = new Date(birthUtc.getTime() + 26 * 365.25 * DAY);
  const to = new Date(birthUtc.getTime() + 92 * 365.25 * DAY);
  return {
    natalLon,
    natalRetrograde: speed < 0,
    seasons: groupIntoSeasons(findLongitudeCrossings("Saturn", natalLon, from, to))
  };
}
