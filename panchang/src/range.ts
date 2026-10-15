import { optionsOf, skyEvents } from "../../src/sky/riseset.js";
import type { SkyEvents } from "../../src/sky/riseset.js";
import { nextCivilDate, prepareCivilDay, resolveCivilDay, validateCivilDate, validateObserver, validateTimeZone } from "./civil.js";
import type { CivilDayInput, CivilDayResult, PanchangObserver } from "./civil.js";
import { daySettingsOf, panchangDayWith } from "./day.js";
import type { DayCalculations, PanchangDay, PanchangDayOptions, PanchangDayRefusal } from "./day.js";
import { luminarySnapshot } from "./engine.js";
import type { PanchangAyanamsa, SnapshotResult } from "./engine.js";
import { classifySnapshot } from "./limbs.js";
import { searchLunarMonthsWith } from "./months.js";
import type { MonthConvention } from "./months.js";
import { resolveSunriseDayWith } from "./sunrise.js";
import { searchLimbTransitionsWith } from "./transitions.js";

export interface PanchangRangeInput {
  /** Both endpoints are included Gregorian calendar dates. */
  readonly from: string;
  readonly to: string;
  readonly timeZone: string;
  readonly observer: PanchangObserver;
}

export interface PanchangRangeOptions extends PanchangDayOptions {
  /** Finite total of uncached luminary snapshots plus actual sky evaluations. */
  readonly maxSamples?: number;
}

export const RANGE_CONVENTIONS = Object.freeze({
  dates: "inclusive-from-and-to", iteration: "gregorian-calendar-successor",
  maxDays: 31, defaultMaxSamples: 100_000,
  budget: "uncached-luminary-snapshots-plus-actual-sky-evaluations",
  dayBudgets: "logical-per-day-search-samples-including-cache-hits",
  caching: "call-scoped-same-observer-zone-and-ayanamsa",
  refusal: "whole-range-no-partial-days;retain-first-refused-day"
} as const);

interface RangeContext extends PanchangRangeInput {
  readonly ayanamsa: PanchangAyanamsa;
  readonly monthConvention: MonthConvention;
  readonly conventions: typeof RANGE_CONVENTIONS;
  readonly maxSamples: number;
  readonly samples: number;
  readonly snapshotSamples: number;
  readonly skySamples: number;
  readonly snapshotCacheHits: number;
  readonly skyCacheHits: number;
}

export interface PanchangRange extends RangeContext {
  readonly status: "ok";
  /** All requested dates, in civil-date and sunrise order, with original receipts. */
  readonly days: readonly PanchangDay[];
}

export type PanchangRangeRefusal = RangeContext & { readonly status: "refused"; readonly failedDate: string } & (
  { readonly reason: "day-refused"; readonly day: PanchangDayRefusal } |
  { readonly reason: "sample-budget"; readonly stage: "snapshot" | "sunrise"; readonly search?: SkyEvents }
);
export type PanchangRangeResult = PanchangRange | PanchangRangeRefusal;

/** Date arithmetic only; an absent civil date in a zone remains in this list. */
export function civilDatesInRange(from: string, to: string): readonly string[] {
  validateCivilDate(from);
  validateCivilDate(to);
  if (from > to) throw new RangeError("Range from must be on or before to.");
  const dates: string[] = [];
  for (let date = from; ; date = nextCivilDate(date)) {
    if (dates.length === RANGE_CONVENTIONS.maxDays) throw new RangeError("Range must contain at most 31 civil dates.");
    dates.push(date);
    if (date === to) break;
  }
  // The final sunrise search needs both following midnights. Reject an
  // unrepresentable successor before history loading or astronomical work.
  nextCivilDate(nextCivilDate(to));
  return Object.freeze(dates);
}

function inputOf(input: PanchangRangeInput) {
  const value = optionsOf(input, ["from", "to", "timeZone", "observer"], "panchang range input");
  const from = value.from as string;
  const to = value.to as string;
  const dates = civilDatesInRange(from, to);
  return { from, to, dates, timeZone: validateTimeZone(value.timeZone as string),
    observer: validateObserver(value.observer as PanchangObserver) };
}

function settingsOf(options: PanchangRangeOptions) {
  const value = optionsOf(options, ["ayanamsa", "monthConvention", "sunriseMaxSamples",
    "transitionMaxSamples", "monthMaxSamples", "maxSamples"], "panchang range options");
  const { maxSamples = RANGE_CONVENTIONS.defaultMaxSamples, ...dayOptions } = value;
  if (typeof maxSamples !== "number" || !Number.isSafeInteger(maxSamples) || maxSamples < 1) {
    throw new RangeError("Range maxSamples must be a positive finite safe integer.");
  }
  const settings = daySettingsOf(dayOptions as unknown as PanchangDayOptions);
  return { maxSamples, dayOptions: Object.freeze(dayOptions) as unknown as PanchangDayOptions, ...settings };
}

/** Prepare each needed civil date through the engine, without computing a panchang. */
export async function preparePanchangRange(input: PanchangRangeInput): Promise<void> {
  const { dates, to, timeZone, observer } = inputOf(input);
  for (const date of [...dates, nextCivilDate(to)]) {
    await prepareCivilDay({ date, timeZone, observer });
  }
}

class RangeBudgetReached {
  constructor(readonly stage: "snapshot" | "sunrise", readonly search?: SkyEvents) {}
}

/**
 * Synchronous, facts-only range assembly. Historical zones need explicit
 * preparePanchangRange first. No partial days are returned after a refusal.
 * All caches are discarded at the end of the call; input/load errors propagate.
 */
export function panchangRange(input: PanchangRangeInput, options: PanchangRangeOptions): PanchangRangeResult {
  const { dates, ...request } = inputOf(input);
  const settings = settingsOf(options);
  let snapshotSamples = 0;
  let skySamples = 0;
  let snapshotCacheHits = 0;
  let skyCacheHits = 0;
  const snapshots = new Map<number, SnapshotResult>();
  const skies = new Map<string, SkyEvents>();
  const civilDays = new Map<string, CivilDayResult>();
  const remaining = () => settings.maxSamples - snapshotSamples - skySamples;
  const context = (): RangeContext => ({ ...request, ayanamsa: settings.ayanamsa,
    monthConvention: settings.monthConvention, conventions: RANGE_CONVENTIONS, maxSamples: settings.maxSamples,
    samples: snapshotSamples + skySamples, snapshotSamples, skySamples, snapshotCacheHits, skyCacheHits });
  // These adapters receive only this call's canonical Date/ISO instants. The
  // observer, zone, horizon convention and ayanamsa cannot change during a call.
  const snapshotAt: typeof luminarySnapshot = (at) => {
    const ms = at instanceof Date ? at.getTime() : Date.parse(at as string);
    const existing = snapshots.get(ms);
    if (existing) { snapshotCacheHits++; return existing; }
    if (remaining() < 1) throw new RangeBudgetReached("snapshot");
    snapshotSamples++;
    const result = luminarySnapshot(at, { ayanamsa: settings.ayanamsa });
    snapshots.set(ms, result);
    return result;
  };
  const sharedSky: typeof skyEvents = (body, observer, from, to, options) => {
    const key = `${from instanceof Date ? from.toISOString() : from}/${to instanceof Date ? to.toISOString() : to}`;
    const maxSamples = options!.maxSamples!;
    const existing = skies.get(key);
    if (existing?.status === "complete" && existing.samples <= maxSamples) {
      skyCacheHits++;
      return existing;
    }
    if (remaining() < 1) throw new RangeBudgetReached("sunrise");
    const limit = Math.min(maxSamples, remaining());
    const result = skyEvents(body, observer, from, to, { ...options, maxSamples: limit });
    skySamples += result.samples;
    if (result.status === "refused" && limit < maxSamples) throw new RangeBudgetReached("sunrise", result);
    if (result.status === "complete") skies.set(key, result);
    return result;
  };
  const sharedCivil = (day: CivilDayInput): CivilDayResult => {
    let result = civilDays.get(day.date);
    if (!result) { result = resolveCivilDay(day); civilDays.set(day.date, result); }
    return result;
  };
  const calculations: DayCalculations = {
    resolveSunriseDay: (day, options = {}) => resolveSunriseDayWith(day, options,
      { luminarySnapshot: snapshotAt, skyEvents: sharedSky, resolveCivilDay: sharedCivil }),
    searchLimbTransitions: (from, to, options = {}) => searchLimbTransitionsWith(from, to, options, (at) => {
      const snapshot = snapshotAt(at);
      return snapshot.status === "ok" ? classifySnapshot(snapshot) : snapshot;
    }),
    searchLunarMonths: (from, to, options) => searchLunarMonthsWith(from, to, options, snapshotAt)
  };
  const days: PanchangDay[] = [];
  for (const date of dates) {
    try {
      const day = panchangDayWith({ date, timeZone: request.timeZone, observer: request.observer }, settings.dayOptions, calculations);
      if (day.status !== "ok") return Object.freeze({ ...context(), status: "refused", reason: "day-refused", failedDate: date, day });
      days.push(day);
    } catch (error) {
      if (!(error instanceof RangeBudgetReached)) throw error;
      return Object.freeze({ ...context(), status: "refused", reason: "sample-budget", failedDate: date,
        stage: error.stage, ...(error.search ? { search: error.search } : {}) });
    }
  }
  return Object.freeze({ ...context(), status: "ok", days: Object.freeze(days) });
}
