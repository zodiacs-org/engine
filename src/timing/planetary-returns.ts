/*
 * Planetary returns: the instants a body stands again on the longitude it
 * held at birth. A retrograde body can cross that longitude three times in
 * one pass (direct, retrograde, direct); every crossing is a return.
 *
 * Found with the engine's crossing search on its apparent geocentric
 * longitudes, read as UTC on the engine's time basis; each result carries the
 * search's verdict. Definitions: docs/houses.md, *Planetary returns*.
 */
import { resolvedChart, utcOf } from "../api.js";
import type { NatalSource } from "../api.js";
import { dateFrom } from "../date-input.js";
import { searchLongitudeCrossings } from "../returns.js";
import type { DateInput } from "../types.js";
import { guarded, readOptions, timingFlags } from "./shared.js";
import type { TimingFlag } from "./shared.js";

/**
 * The bodies a return can be asked for.
 *
 * @experimental Added in 0.1.1-rc.16: how returns
 * are grouped into passes, and the searches' steps, may change in a minor
 * release.
 */
export type ReturnBody = "Sun" | "Moon" | "Mercury" | "Venus" | "Mars" | "Jupiter" | "Saturn" | "Uranus" | "Neptune" | "Pluto";

/**
 * The bodies a return can be asked for, in the order of ReturnBody.
 *
 * @experimental Added in 0.1.1-rc.16: how returns
 * are grouped into passes, and the searches' steps, may change in a minor
 * release.
 */
export const RETURN_BODIES: readonly ReturnBody[] = Object.freeze([
  "Sun",
  "Moon",
  "Mercury",
  "Venus",
  "Mars",
  "Jupiter",
  "Saturn",
  "Uranus",
  "Neptune",
  "Pluto"
] as const);

/**
 * Days between the coarse samples of each body's search: two steps are
 * shorter than the shortest time between two stations from 1800 to 2200
 * (19.75 days for Mercury, 40.75 for Venus, 59.75 for Mars, longer for the
 * others), and one step moves the Moon at most 15.4°.
 *
 * @experimental Added in 0.1.1-rc.16: how returns
 * are grouped into passes, and the searches' steps, may change in a minor
 * release.
 */
export const RETURN_STEP_DAYS: Readonly<Record<ReturnBody, number>> = Object.freeze({
  Sun: 5,
  Moon: 1,
  Mercury: 2,
  Venus: 4,
  Mars: 5,
  Jupiter: 5,
  Saturn: 5,
  Uranus: 5,
  Neptune: 5,
  Pluto: 5
});

/**
 * One return: an instant in the window at which the body is on its natal longitude.
 *
 * @experimental Added in 0.1.1-rc.16: how returns
 * are grouped into passes, and the searches' steps, may change in a minor
 * release.
 */
export interface PlanetaryReturn {
  readonly at: Date;
  /** True when the body was moving backward through the degree. */
  readonly retrograde: boolean;
  /**
   * The pass it belongs to, from 1 in the window. A pass is one approach to
   * the degree: a single direct return, or direct, retrograde and direct
   * returns around a station.
   */
  readonly pass: number;
}

/**
 * `stepDays` (default {@link RETURN_STEP_DAYS}) and `maxSamples`, a budget of longitude evaluations.
 *
 * @experimental Added in 0.1.1-rc.16: how returns
 * are grouped into passes, and the searches' steps, may change in a minor
 * release.
 */
export interface PlanetaryReturnOptions {
  readonly stepDays?: number | undefined;
  readonly maxSamples?: number | undefined;
}

/**
 * The search's verdict with its returns: `"complete"` with every return it
 * found, or `"refused"` with none when the budget ran out. Both carry the
 * body, its natal longitude (the chart's, degrees in [0, 360)), the window,
 * the longitude evaluations made (`samples`) and the result's flags.
 *
 * @experimental Added in 0.1.1-rc.16: how returns
 * are grouped into passes, and the searches' steps, may change in a minor
 * release.
 */
export type PlanetaryReturns =
  | {
      readonly status: "complete";
      readonly body: ReturnBody;
      readonly natalLongitude: number;
      readonly from: Date;
      readonly to: Date;
      readonly samples: number;
      readonly flags: readonly TimingFlag[];
      readonly returns: readonly PlanetaryReturn[];
    }
  | {
      readonly status: "refused";
      readonly reason: "sample-budget";
      readonly maxSamples: number;
      readonly body: ReturnBody;
      readonly natalLongitude: number;
      readonly from: Date;
      readonly to: Date;
      readonly samples: number;
      readonly flags: readonly TimingFlag[];
      readonly returns: readonly [];
    };

/**
 * Every return of `body` to its natal longitude in (from, to]: the chart's
 * own longitude of the body, then `searchLongitudeCrossings` over the window
 * at the body's step. Retrograde returns are reported with direct ones. The
 * search assumes smooth motion with at most one station in two steps; within
 * that it finds a pair of returns around a station that falls between two
 * samples. Invalid input throws RangeError. Frozen.
 *
 * @experimental Added in 0.1.1-rc.16: how returns
 * are grouped into passes, and the searches' steps, may change in a minor
 * release.
 */
export function planetaryReturns(
  natal: NatalSource,
  body: ReturnBody,
  from: DateInput,
  to: DateInput,
  options?: PlanetaryReturnOptions
): PlanetaryReturns {
  if (typeof body !== "string" || !(RETURN_BODIES as readonly string[]).includes(body)) {
    throw new RangeError(`body must be one of ${RETURN_BODIES.join(", ")}.`);
  }
  const start = dateFrom(from, "from");
  const end = dateFrom(to, "to");
  const read = readOptions(options, ["stepDays", "maxSamples"], "planetaryReturns options");
  const stepDays = read.stepDays === undefined ? RETURN_STEP_DAYS[body] : read.stepDays;
  const { chart } = guarded(() => resolvedChart(natal));
  const natalBody = chart.bodies.find((row) => row.body === body);
  if (!natalBody) throw new RangeError(`The chart has no ${body}.`);
  const natalLongitude = natalBody.lon;
  const search = guarded(() =>
    searchLongitudeCrossings(body, natalLongitude, start, end, {
      stepDays: stepDays as number,
      ...(read.maxSamples === undefined ? {} : { maxSamples: read.maxSamples as number })
    })
  );
  const common = {
    body,
    natalLongitude,
    from: start,
    to: end,
    samples: search.samples,
    flags: timingFlags([utcOf(chart.input).getTime(), start.getTime(), end.getTime()], false)
  };
  if (search.status === "refused") {
    return Object.freeze({
      ...common,
      status: "refused",
      reason: search.reason,
      maxSamples: search.maxSamples,
      returns: Object.freeze([]) as readonly []
    });
  }
  // A direct return after a direct one means the body went round the circle
  // in between: a new pass. A retrograde return, and the direct one after it,
  // stay in the pass of the direct return before them.
  let pass = 0;
  let previousDirect = true;
  const returns = search.crossings.map((crossing) => {
    if (pass === 0 || (previousDirect && !crossing.retrograde)) pass += 1;
    previousDirect = !crossing.retrograde;
    return Object.freeze({ at: crossing.at, retrograde: crossing.retrograde, pass });
  });
  return Object.freeze({ ...common, status: "complete", returns: Object.freeze(returns) });
}
