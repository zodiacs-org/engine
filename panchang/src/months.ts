import { searchLongitudeCrossingsWith } from "../../src/crossings.js";
import { dateFrom } from "../../src/date-input.js";
import { exactSum, roundedValue } from "../../src/exact.js";
import { firstMillisecond } from "../../src/first-millisecond.js";
import { budgetOf, optionsOf } from "../../src/sky/riseset.js";
import { elapsedDays, timeBasis } from "../../src/time-scale.js";
import type { DateInput } from "../../src/types.js";
import { luminarySnapshot, PANCHANG_AYANAMSAS } from "./engine.js";
import type { LuminarySnapshot, PanchangAyanamsa, SnapshotOptions, SnapshotRefusal } from "./engine.js";
import { tithiOf } from "./limbs.js";

const DAY = 86_400_000;
const PAD = 64 * DAY;
export const MONTH_NAMES = Object.freeze([
  "Chaitra", "Vaisakha", "Jyaishtha", "Ashadha", "Sravana", "Bhadrapada",
  "Asvina", "Kartika", "Margasirsha", "Pausha", "Magha", "Phalguna"
] as const);
export type MonthName = typeof MONTH_NAMES[number];
export type MonthConvention = "amanta" | "purnimanta";

export interface MonthOptions extends SnapshotOptions {
  /** Required: no implicit regional calendar convention. */
  readonly monthConvention: MonthConvention;
  /** Unique luminary snapshots shared by every stream and boundary check. */
  readonly maxSamples?: number;
}

export const MONTH_CONVENTIONS = Object.freeze({
  interval: "[start,end)", timeScale: "utc", coordinates: "geocentric-apparent-true-of-date",
  newMoon: "tithi-29-to-0", fullMoon: "tithi-14-to-15",
  ingress: "sidereal-sun-enters-next-30-degree-sign",
  amanta: "initial-new-moon-solar-sign;pisces-is-chaitra",
  purnimanta: "preceding-full-moon-to-full-moon;name-of-enclosed-new-moon-amanta-lunation",
  ingressOwnership: "[newMoon,nextNewMoon)", nonOrdinaryLunation: "refuse-pending-anomaly-milestone",
  resolution: "first-whole-millisecond-of-classification-change",
  stepDays: 1 / 4, paddingDays: 64, maxWindowDays: 2,
  search: "engine-longitude-crossings;sampled-forward-motion-not-proven-complete",
  reference: "analytical-trajectories-only;physical-transition-validation-pending"
} as const);

export interface MonthEvent {
  readonly kind: "new-moon" | "full-moon" | "solar-ingress";
  readonly at: string;
  /** Present only for a solar ingress: zero-based sign entered (Aries = 0). */
  readonly sign?: number;
  readonly before: LuminarySnapshot;
  readonly after: LuminarySnapshot;
}

export interface AmantaLunation {
  readonly start: MonthEvent;
  readonly end: MonthEvent;
  readonly fullMoon: MonthEvent;
  readonly solarSignAtStart: number;
  readonly ingresses: readonly MonthEvent[];
  readonly index: number;
  readonly name: MonthName;
}

export interface LunarMonthInterval {
  readonly convention: MonthConvention;
  readonly index: number;
  readonly name: MonthName;
  /** Complete computed phase boundaries, without clipping to the search window. */
  readonly start: MonthEvent;
  readonly end: MonthEvent;
  /** The new-moon lunation from which the name is derived in either convention. */
  readonly namingLunation: AmantaLunation;
}

interface MonthContext {
  readonly from: string;
  readonly to: string;
  readonly searchFrom: string;
  readonly searchTo: string;
  readonly ayanamsa: PanchangAyanamsa;
  readonly monthConvention: MonthConvention;
  readonly conventions: typeof MONTH_CONVENTIONS;
  readonly maxSamples: number;
  readonly samples: number;
  readonly longitudeSamples: number;
}

export interface LunarMonths extends MonthContext {
  readonly status: "ok";
  readonly startMonth: LunarMonthInterval;
  /** Complete overlapping month intervals in chronological order. */
  readonly intervals: readonly LunarMonthInterval[];
  /** Phase and ingress events in [from,to), ordered by time, then phase before ingress. */
  readonly events: readonly MonthEvent[];
}
export interface MonthRefusal extends MonthContext {
  readonly status: "refused";
  readonly reason: "sample-budget" | "engine-refused" | "time-basis-discontinuity" |
    "unresolved-crossing" | "unbracketed-month" | "non-ordinary-lunation";
  readonly engine?: SnapshotRefusal;
}
export type MonthResult = LunarMonths | MonthRefusal;

export function validateMonthConvention(value: unknown): MonthConvention {
  if (value !== "amanta" && value !== "purnimanta") {
    throw new RangeError("monthConvention must be explicitly amanta or purnimanta.");
  }
  return value;
}

function settingsOf(options: MonthOptions) {
  const input = optionsOf(options, ["ayanamsa", "monthConvention", "maxSamples"], "lunar month options");
  const monthConvention = validateMonthConvention(input.monthConvention);
  const ayanamsa = input.ayanamsa === undefined ? "lahiri" : input.ayanamsa;
  if (!PANCHANG_AYANAMSAS.includes(ayanamsa as PanchangAyanamsa)) {
    throw new RangeError("ayanamsa must be an engine built-in name.");
  }
  return { ayanamsa: ayanamsa as PanchangAyanamsa, monthConvention,
    maxSamples: budgetOf(input.maxSamples === undefined ? 5_000 : input.maxSamples) };
}

class Refused {
  constructor(readonly reason: MonthRefusal["reason"], readonly engine?: SnapshotRefusal) {}
}

const msOf = (event: MonthEvent) => Date.parse(event.at);
const solarSign = (state: LuminarySnapshot) => Math.floor(state.sun.sidereal.lon / 30);
const phaseHalf = (state: LuminarySnapshot) => Math.floor(tithiOf(state.sun.tropical.lon, state.moon.tropical.lon).index / 15);

/**
 * Find month intervals around a positive UTC window of at most two elapsed days.
 * Uses the engine solver and snapshots only; performs no I/O. Root confirmation
 * verifies local boundary ownership, not exhaustive astronomical completeness.
 */
export function searchLunarMonths(from: DateInput, to: DateInput, options: MonthOptions): MonthResult {
  const settings = settingsOf(options);
  const lo = dateFrom(from, "Month window start").getTime();
  const hi = dateFrom(to, "Month window end").getTime();
  if (!(hi > lo) || hi - lo > 2 * DAY) throw new RangeError("Month window must be positive and at most two elapsed days.");
  const scanLo = lo - PAD;
  const scanHi = hi + PAD;
  if (!Number.isFinite(new Date(scanLo).getTime()) || !Number.isFinite(new Date(scanHi).getTime())) {
    throw new RangeError("Padded month window must be representable by Date.");
  }
  let samples = 0;
  let longitudeSamples = 0;
  const cache = new Map<number, LuminarySnapshot>();
  const context = (): MonthContext => ({ from: new Date(lo).toISOString(), to: new Date(hi).toISOString(),
    searchFrom: new Date(scanLo).toISOString(), searchTo: new Date(scanHi).toISOString(),
    ...settings, conventions: MONTH_CONVENTIONS, samples, longitudeSamples });
  const at = (ms: number): LuminarySnapshot => {
    if (ms < scanLo || ms > scanHi) throw new Refused("unresolved-crossing");
    const existing = cache.get(ms);
    if (existing) return existing;
    if (samples >= settings.maxSamples) throw new Refused("sample-budget");
    samples++;
    const state = luminarySnapshot(new Date(ms), { ayanamsa: settings.ayanamsa });
    if (state.status !== "ok") throw new Refused("engine-refused", state);
    cache.set(ms, state);
    return state;
  };
  try {
    at(scanLo);
    at(scanHi);
    if (!Number.isNaN(elapsedDays(timeBasis(scanLo - 1, "utc"), timeBasis(scanHi, "utc"), NaN))) {
      throw new Refused("time-basis-discontinuity");
    }
    const events: MonthEvent[] = [];
    for (const stream of ["phase", "solar"] as const) {
      const indexOf = stream === "phase" ? phaseHalf : solarSign;
      const count = stream === "phase" ? 2 : 12;
      const search = searchLongitudeCrossingsWith((_body, date) => {
        longitudeSamples++;
        const state = at(date.getTime());
        const arc = stream === "phase"
          ? roundedValue(exactSum(state.moon.tropical.lon, -state.sun.tropical.lon))
          : state.sun.sidereal.lon;
        return ((arc * count % 360) + 360) % 360;
      }, stream, 0, new Date(scanLo), new Date(scanHi), { stepDays: MONTH_CONVENTIONS.stepDays });
      for (const root of search.crossings) {
        const estimate = root.at.getTime();
        if (estimate - scanLo < 8 || scanHi - estimate < 8) continue;
        if (root.retrograde) throw new Refused("unresolved-crossing");
        const previous = indexOf(at(estimate - 4));
        const next = (previous + 1) % count;
        if (indexOf(at(estimate + 4)) !== next) throw new Refused("unresolved-crossing");
        const instant = firstMillisecond((ms) => {
          if (Math.abs(ms - estimate) > 8) throw new Refused("unresolved-crossing");
          return indexOf(at(ms)) === next;
        }, estimate);
        const before = at(instant - 1);
        const after = at(instant);
        if (indexOf(before) !== previous || indexOf(after) !== next) throw new Refused("unresolved-crossing");
        events.push(Object.freeze({ kind: stream === "solar" ? "solar-ingress" : next === 0 ? "new-moon" : "full-moon",
          at: after.utc, before, after, ...(stream === "solar" ? { sign: next } : {}) }));
      }
    }
    events.sort((a, b) => msOf(a) - msOf(b) || Number(a.kind === "solar-ingress") - Number(b.kind === "solar-ingress"));
    const newMoons = events.filter((event) => event.kind === "new-moon");
    const fullMoons = events.filter((event) => event.kind === "full-moon");
    const ingresses = events.filter((event) => event.kind === "solar-ingress");
    const boundaries = settings.monthConvention === "amanta" ? newMoons : fullMoons;
    const intervals: LunarMonthInterval[] = [];
    for (let i = 0; i + 1 < boundaries.length; i++) {
      const start = boundaries[i]!;
      const end = boundaries[i + 1]!;
      if (msOf(start) >= hi || msOf(end) <= lo) continue;
      // In purnimanta the naming new moon lies between these full moons.
      const namingStart = settings.monthConvention === "amanta" ? start :
        newMoons.find((event) => msOf(event) > msOf(start) && msOf(event) < msOf(end));
      const namingEnd = namingStart && newMoons[newMoons.indexOf(namingStart) + 1];
      if (!namingStart || !namingEnd) throw new Refused("unbracketed-month");
      const containedFull = fullMoons.filter((event) => msOf(event) > msOf(namingStart) && msOf(event) < msOf(namingEnd));
      if (containedFull.length !== 1) throw new Refused("unbracketed-month");
      const solarSignAtStart = solarSign(namingStart.after);
      const containedIngresses = ingresses.filter((event) => msOf(event) >= msOf(namingStart) && msOf(event) < msOf(namingEnd));
      // Month anomaly conventions and their naming exceptions are M8. Refuse
      // rather than silently assign a normal month to an exceptional lunation.
      if (containedIngresses.length !== 1) throw new Refused("non-ordinary-lunation");
      const index = (solarSignAtStart + 1) % 12;
      const namingLunation: AmantaLunation = Object.freeze({ start: namingStart, end: namingEnd,
        fullMoon: containedFull[0]!, solarSignAtStart, ingresses: Object.freeze(containedIngresses), index, name: MONTH_NAMES[index]! });
      intervals.push(Object.freeze({ convention: settings.monthConvention, index, name: namingLunation.name,
        start, end, namingLunation }));
    }
    const startMonth = intervals[0];
    if (!startMonth || msOf(startMonth.start) > lo || msOf(intervals.at(-1)!.end) < hi ||
        intervals.some((interval, i) => i > 0 && interval.start !== intervals[i - 1]!.end)) {
      throw new Refused("unbracketed-month");
    }
    return Object.freeze({ ...context(), status: "ok", startMonth, intervals: Object.freeze(intervals),
      events: Object.freeze(events.filter((event) => msOf(event) >= lo && msOf(event) < hi)) });
  } catch (error) {
    if (!(error instanceof Refused)) throw error;
    return Object.freeze({ ...context(), status: "refused", reason: error.reason,
      ...(error.engine ? { engine: error.engine } : {}) });
  }
}
