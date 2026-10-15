import { budgetOf, optionsOf } from "../../src/sky/riseset.js";
import type { NakshatraPosition } from "../../src/vedic/nakshatra.js";
import type { CivilDayInput } from "./civil.js";
import { PANCHANG_AYANAMSAS } from "./engine.js";
import type { PanchangAyanamsa, SnapshotOptions } from "./engine.js";
import type { InstantaneousPanchang, KaranaPosition, TithiPosition, YogaPosition } from "./limbs.js";
import { resolveSunriseDay, SUNRISE_CONVENTIONS } from "./sunrise.js";
import type { SunriseDayRefusal, SunriseDayWindow, Vara } from "./sunrise.js";
import { LIMB_KINDS, searchLimbTransitions, TRANSITION_CONVENTIONS } from "./transitions.js";
import type { LimbInterval, LimbKind, LimbTransitions, TransitionRefusal } from "./transitions.js";

export interface PanchangDayOptions extends SnapshotOptions {
  /** Shared sky-evaluation budget for the sunrise resolver. */
  readonly sunriseMaxSamples?: number;
  /** Shared unique-snapshot budget for the padded limb-transition search. */
  readonly transitionMaxSamples?: number;
}

export const DAY_CONVENTIONS = Object.freeze({
  calendar: "proleptic-gregorian", day: "local-sunrise-to-following-local-date-sunrise",
  segment: "[start,end)", simultaneousChanges: "one-segment-boundary",
  limbCoordinates: "geocentric", segmentValues: "discrete-labels-only",
  intervalBoundaries: "full-computed-boundaries-without-day-clipping",
  sunrise: SUNRISE_CONVENTIONS, transitions: TRANSITION_CONVENTIONS
} as const);

/** Constant discrete labels on a clipped portion of a sunrise day. */
export interface PanchangSegment {
  readonly start: string;
  readonly end: string;
  readonly vara: Vara;
  readonly tithi: TithiPosition;
  readonly nakshatra: Readonly<Pick<NakshatraPosition, "index" | "name" | "pada">>;
  readonly yoga: YogaPosition;
  readonly karana: KaranaPosition;
  /** Original full intervals, including endpoint snapshots and calc receipts. */
  readonly intervals: Readonly<Record<LimbKind, LimbInterval>>;
}

interface DayContext extends CivilDayInput {
  readonly ayanamsa: PanchangAyanamsa;
  readonly conventions: typeof DAY_CONVENTIONS;
}

export interface PanchangDay extends DayContext {
  readonly status: "ok";
  readonly sunrise: SunriseDayWindow;
  readonly timeline: LimbTransitions;
  /** Classified snapshot at the included sunrise, with original engine receipts. */
  readonly sunriseState: InstantaneousPanchang;
  /** Ordered, positive, contiguous segments covering the complete sunrise day. */
  readonly segments: readonly PanchangSegment[];
}

export type PanchangDayRefusal = DayContext & (
  { readonly status: "refused"; readonly reason: "sunrise-refused"; readonly sunrise: SunriseDayRefusal } |
  { readonly status: "refused"; readonly reason: "transitions-refused"; readonly sunrise: SunriseDayWindow;
    readonly timeline: TransitionRefusal }
);
export type PanchangDayResult = PanchangDay | PanchangDayRefusal;

function settingsOf(options: PanchangDayOptions) {
  const input = optionsOf(options, ["ayanamsa", "sunriseMaxSamples", "transitionMaxSamples"], "panchang day options");
  const ayanamsa = input.ayanamsa === undefined ? "lahiri" : input.ayanamsa;
  if (!PANCHANG_AYANAMSAS.includes(ayanamsa as PanchangAyanamsa)) {
    throw new RangeError("ayanamsa must be an engine built-in name.");
  }
  // Validate both budgets before any calculation, retaining each resolver's
  // default when absent rather than duplicating default values here.
  const budget = (value: unknown) => value === undefined ? {} : { maxSamples: budgetOf(value) };
  return { ayanamsa: ayanamsa as PanchangAyanamsa,
    sunriseOptions: budget(input.sunriseMaxSamples), transitionOptions: budget(input.transitionMaxSamples) };
}

function segmentsOf(sunrise: SunriseDayWindow, timeline: LimbTransitions): readonly PanchangSegment[] {
  const lo = Date.parse(sunrise.start.utc);
  const hi = Date.parse(sunrise.end.utc);
  // A set groups simultaneous limb/pada changes and excludes zero-length
  // segments at sunrise. The following sunrise never belongs to this day.
  const boundaries = [...new Set([lo, hi, ...timeline.transitions.map((event) => Date.parse(event.at))])]
    .sort((a, b) => a - b);
  const segments: PanchangSegment[] = [];
  for (let i = 0; i + 1 < boundaries.length; i++) {
    const start = boundaries[i]!;
    const end = boundaries[i + 1]!;
    const intervals = Object.fromEntries(LIMB_KINDS.map((kind) => {
      const interval = timeline.intervals.find((row) => row.kind === kind &&
        Date.parse(row.start.at) <= start && Date.parse(row.end.at) >= end);
      if (!interval) throw new Error(`Missing complete ${kind} interval in day assembly.`);
      return [kind, interval];
    })) as Record<LimbKind, LimbInterval>;
    const nakshatra = intervals.nakshatra.start.after.nakshatra;
    segments.push(Object.freeze({
      start: new Date(start).toISOString(), end: new Date(end).toISOString(), vara: sunrise.vara,
      tithi: intervals.tithi.start.after.tithi,
      nakshatra: Object.freeze({ index: nakshatra.index, name: nakshatra.name,
        pada: intervals.pada.start.after.nakshatra.pada }),
      yoga: intervals.yoga.start.after.yoga, karana: intervals.karana.start.after.karana,
      intervals: Object.freeze(intervals)
    }));
  }
  return Object.freeze(segments);
}

/**
 * Synchronous facts-only day assembly, with no I/O. For historical zone data,
 * await prepareSunriseDay(input) first. Invalid input and engine load errors
 * propagate; an operational refusal exposes diagnostics without partial segments.
 */
export function panchangDay(input: CivilDayInput, options: PanchangDayOptions = {}): PanchangDayResult {
  const settings = settingsOf(options);
  const sunrise = resolveSunriseDay(input, { ayanamsa: settings.ayanamsa, ...settings.sunriseOptions });
  const context: DayContext = { date: sunrise.date, timeZone: sunrise.timeZone, observer: sunrise.observer,
    ayanamsa: settings.ayanamsa, conventions: DAY_CONVENTIONS };
  if (sunrise.status !== "ok") {
    return Object.freeze({ ...context, status: "refused", reason: "sunrise-refused", sunrise });
  }
  const timeline = searchLimbTransitions(sunrise.start.utc, sunrise.end.utc,
    { ayanamsa: settings.ayanamsa, ...settings.transitionOptions });
  if (timeline.status !== "ok") {
    return Object.freeze({ ...context, status: "refused", reason: "transitions-refused", sunrise, timeline });
  }
  return Object.freeze({ ...context, status: "ok", sunrise, timeline,
    sunriseState: timeline.startState, segments: segmentsOf(sunrise, timeline) });
}
