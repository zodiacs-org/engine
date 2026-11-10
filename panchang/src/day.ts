import { budgetOf, optionsOf } from "../../src/sky/riseset.js";
import { compareSunriseTithis, TITHI_ANOMALY_CONVENTIONS } from "./anomalies.js";
import type { SunriseTithiComparison } from "./anomalies.js";
import type { NakshatraPosition } from "../../src/vedic/nakshatra.js";
import type { CivilDayInput } from "./civil.js";
import { PANCHANG_AYANAMSAS } from "./engine.js";
import type { PanchangAyanamsa, SnapshotOptions } from "./engine.js";
import type { InstantaneousPanchang, KaranaPosition, TithiPosition, YogaPosition } from "./limbs.js";
import { MONTH_CONVENTIONS, searchLunarMonths, validateMonthConvention } from "./months.js";
import type { LunarMonthInterval, LunarMonths, MonthConvention, MonthRefusal } from "./months.js";
import { resolveSunriseDay, SUNRISE_CONVENTIONS } from "./sunrise.js";
import type { SunriseDayRefusal, SunriseDayWindow, Vara } from "./sunrise.js";
import { LIMB_KINDS, searchLimbTransitions, TRANSITION_CONVENTIONS } from "./transitions.js";
import type { LimbInterval, LimbKind, LimbTransitions, TransitionRefusal } from "./transitions.js";

export interface PanchangDayOptions extends SnapshotOptions {
  readonly monthConvention: MonthConvention;
  /** Shared sky-evaluation budget for the sunrise resolver. */
  readonly sunriseMaxSamples?: number;
  /** Shared unique-snapshot budget for the padded limb-transition search. */
  readonly transitionMaxSamples?: number;
  /** Shared unique-snapshot budget for the surrounding month search. */
  readonly monthMaxSamples?: number;
}

export const DAY_CONVENTIONS = Object.freeze({
  calendar: "proleptic-gregorian", day: "local-sunrise-to-following-local-date-sunrise",
  segment: "[start,end)", simultaneousChanges: "one-segment-boundary",
  limbCoordinates: "geocentric", segmentValues: "discrete-labels-only",
  intervalBoundaries: "full-computed-boundaries-without-day-clipping",
  sunrise: SUNRISE_CONVENTIONS, transitions: TRANSITION_CONVENTIONS, months: MONTH_CONVENTIONS,
  tithiComparison: TITHI_ANOMALY_CONVENTIONS
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
  readonly month: LunarMonthInterval;
  /** Original full intervals, including endpoint snapshots and calc receipts. */
  readonly intervals: Readonly<Record<LimbKind, LimbInterval>>;
}

interface DayContext extends CivilDayInput {
  readonly ayanamsa: PanchangAyanamsa;
  readonly monthConvention: MonthConvention;
  readonly conventions: typeof DAY_CONVENTIONS;
}

export interface PanchangDay extends DayContext {
  readonly status: "ok";
  readonly sunrise: SunriseDayWindow;
  readonly timeline: LimbTransitions;
  readonly months: LunarMonths;
  readonly sunriseMonth: LunarMonthInterval;
  readonly tithiComparison: SunriseTithiComparison;
  /** Classified snapshot at the included sunrise, with original engine receipts. */
  readonly sunriseState: InstantaneousPanchang;
  /** Ordered, positive, contiguous segments covering the complete sunrise day. */
  readonly segments: readonly PanchangSegment[];
}

export type PanchangDayRefusal = DayContext & (
  { readonly status: "refused"; readonly reason: "sunrise-refused"; readonly sunrise: SunriseDayRefusal } |
  { readonly status: "refused"; readonly reason: "transitions-refused"; readonly sunrise: SunriseDayWindow;
    readonly timeline: TransitionRefusal } |
  { readonly status: "refused"; readonly reason: "months-refused"; readonly sunrise: SunriseDayWindow;
    readonly timeline: LimbTransitions; readonly months: MonthRefusal }
);
export type PanchangDayResult = PanchangDay | PanchangDayRefusal;

export function daySettingsOf(options: PanchangDayOptions) {
  const input = optionsOf(options, ["ayanamsa", "monthConvention", "sunriseMaxSamples", "transitionMaxSamples", "monthMaxSamples"], "panchang day options");
  const monthConvention = validateMonthConvention(input.monthConvention);
  const ayanamsa = input.ayanamsa === undefined ? "lahiri" : input.ayanamsa;
  if (!PANCHANG_AYANAMSAS.includes(ayanamsa as PanchangAyanamsa)) {
    throw new RangeError("ayanamsa must be an engine built-in name.");
  }
  // Validate all budgets before any calculation, retaining each resolver's
  // default when absent rather than duplicating default values here.
  const budget = (value: unknown) => value === undefined ? {} : { maxSamples: budgetOf(value) };
  return { ayanamsa: ayanamsa as PanchangAyanamsa, monthConvention,
    sunriseOptions: budget(input.sunriseMaxSamples), transitionOptions: budget(input.transitionMaxSamples),
    monthOptions: budget(input.monthMaxSamples) };
}

function segmentsOf(sunrise: SunriseDayWindow, timeline: LimbTransitions, months: LunarMonths): readonly PanchangSegment[] {
  const lo = Date.parse(sunrise.start.utc);
  const hi = Date.parse(sunrise.end.utc);
  // A set groups simultaneous limb/pada changes and excludes zero-length
  // segments at sunrise. The following sunrise never belongs to this day.
  const boundaries = [...new Set([lo, hi, ...timeline.transitions.map((event) => Date.parse(event.at)),
    ...months.intervals.map((month) => Date.parse(month.start.at)).filter((ms) => ms > lo && ms < hi)])]
    .sort((a, b) => a - b);
  const segments: PanchangSegment[] = [];
  for (let i = 0; i + 1 < boundaries.length; i++) {
    const start = boundaries[i]!;
    const end = boundaries[i + 1]!;
    const month = months.intervals.find((row) => Date.parse(row.start.at) <= start && Date.parse(row.end.at) >= end);
    if (!month) throw new Error("Missing complete lunar month interval in day assembly.");
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
      yoga: intervals.yoga.start.after.yoga, karana: intervals.karana.start.after.karana, month,
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
export function panchangDay(input: CivilDayInput, options: PanchangDayOptions): PanchangDayResult {
  return panchangDayWith(input, options, { resolveSunriseDay, searchLimbTransitions, searchLunarMonths });
}

/** Internal range wiring; standalone day calls retain their own search sources. */
export interface DayCalculations {
  readonly resolveSunriseDay: typeof resolveSunriseDay;
  readonly searchLimbTransitions: typeof searchLimbTransitions;
  readonly searchLunarMonths: typeof searchLunarMonths;
}

export function panchangDayWith(input: CivilDayInput, options: PanchangDayOptions,
  calculations: DayCalculations): PanchangDayResult {
  const { resolveSunriseDay, searchLimbTransitions, searchLunarMonths } = calculations;
  const settings = daySettingsOf(options);
  const sunrise = resolveSunriseDay(input, { ayanamsa: settings.ayanamsa, ...settings.sunriseOptions });
  const context: DayContext = { date: sunrise.date, timeZone: sunrise.timeZone, observer: sunrise.observer,
    ayanamsa: settings.ayanamsa, monthConvention: settings.monthConvention, conventions: DAY_CONVENTIONS };
  if (sunrise.status !== "ok") {
    return Object.freeze({ ...context, status: "refused", reason: "sunrise-refused", sunrise });
  }
  const timeline = searchLimbTransitions(sunrise.start.utc, sunrise.end.utc,
    { ayanamsa: settings.ayanamsa, ...settings.transitionOptions });
  if (timeline.status !== "ok") {
    return Object.freeze({ ...context, status: "refused", reason: "transitions-refused", sunrise, timeline });
  }
  const months = searchLunarMonths(sunrise.start.utc, sunrise.end.utc,
    { ayanamsa: settings.ayanamsa, monthConvention: settings.monthConvention, ...settings.monthOptions });
  if (months.status !== "ok") {
    return Object.freeze({ ...context, status: "refused", reason: "months-refused", sunrise, timeline, months });
  }
  return Object.freeze({ ...context, status: "ok", sunrise, timeline, months, sunriseMonth: months.startMonth,
    tithiComparison: compareSunriseTithis(sunrise, timeline),
    sunriseState: timeline.startState, segments: segmentsOf(sunrise, timeline, months) });
}
