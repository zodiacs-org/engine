import { searchLongitudeCrossingsWith } from "../../src/crossings.js";
import { dateFrom } from "../../src/date-input.js";
import { exactSum, roundedValue } from "../../src/exact.js";
import { firstMillisecond } from "../../src/first-millisecond.js";
import { budgetOf, optionsOf } from "../../src/sky/riseset.js";
import { elapsedDays, timeBasis } from "../../src/time-scale.js";
import type { DateInput } from "../../src/types.js";
import { PANCHANG_AYANAMSAS } from "./engine.js";
import type { PanchangAyanamsa, SnapshotOptions, SnapshotRefusal } from "./engine.js";
import { instantaneousPanchang } from "./limbs.js";
import type { InstantaneousPanchang } from "./limbs.js";

const DAY = 86_400_000;
const PAD = 3 * DAY;
const STEP = DAY / 96;
export const LIMB_KINDS = Object.freeze(["tithi", "nakshatra", "yoga", "karana", "pada"] as const);
export type LimbKind = typeof LIMB_KINDS[number];
type Stream = "karana" | "pada" | "yoga";
const COUNTS = { tithi: 30, nakshatra: 27, yoga: 27, karana: 60, pada: 108 } as const;

export interface TransitionOptions extends SnapshotOptions {
  /** Unique instantaneous snapshots, including refinement and endpoint checks. */
  readonly maxSamples?: number;
}

export const TRANSITION_CONVENTIONS = Object.freeze({
  window: "[from,to)", interval: "[start,end)", timeScale: "utc",
  resolution: "first-whole-millisecond-of-classification-change",
  stepDays: 1 / 96, paddingDays: 3, maxWindowDays: 2,
  search: "engine-longitude-crossings;scaled-sector-phase;sampled-not-proven-complete",
  reference: "analytical-trajectories-only;physical-transition-validation-pending"
} as const);

export interface LimbTransition {
  readonly kind: LimbKind;
  readonly at: string;
  /** Full classified snapshots at at - 1 ms and at, with original calc receipts. */
  readonly before: InstantaneousPanchang;
  readonly after: InstantaneousPanchang;
}

export interface LimbInterval {
  readonly kind: LimbKind;
  readonly index: number;
  /** Actual computed boundaries, without clipping to the requested window. */
  readonly start: LimbTransition;
  readonly end: LimbTransition;
}

interface TransitionContext {
  readonly from: string;
  readonly to: string;
  readonly searchFrom: string;
  readonly searchTo: string;
  readonly ayanamsa: PanchangAyanamsa;
  readonly conventions: typeof TRANSITION_CONVENTIONS;
  readonly maxSamples: number;
  readonly samples: number;
  /** Callback evaluations in the shared crossing solver, including cache hits. */
  readonly longitudeSamples: number;
}

export interface LimbTransitions extends TransitionContext {
  readonly status: "ok";
  readonly startState: InstantaneousPanchang;
  /** Changes in [from,to), ordered by time, then LIMB_KINDS for ties. */
  readonly transitions: readonly LimbTransition[];
  /** Complete limb intervals overlapping [from,to), ordered by actual start. */
  readonly intervals: readonly LimbInterval[];
}

export interface TransitionRefusal extends TransitionContext {
  readonly status: "refused";
  readonly reason: "sample-budget" | "engine-refused" | "time-basis-discontinuity" |
    "unresolved-crossing" | "unbracketed-limb";
  readonly engine?: SnapshotRefusal;
}
export type TransitionResult = LimbTransitions | TransitionRefusal;

/** A comparable full-cycle index; pada includes its nakshatra, not only 1..4. */
export function limbIndex(state: InstantaneousPanchang, kind: LimbKind): number {
  return kind === "pada" ? state.nakshatra.index * 4 + state.nakshatra.pada - 1 : state[kind].index;
}

class Refused {
  constructor(readonly reason: TransitionRefusal["reason"], readonly engine?: SnapshotRefusal) {}
}

function settingsOf(options: TransitionOptions): { ayanamsa: PanchangAyanamsa; maxSamples: number } {
  const input = optionsOf(options, ["ayanamsa", "maxSamples"], "transition options");
  const ayanamsa = input.ayanamsa === undefined ? "lahiri" : input.ayanamsa;
  if (!PANCHANG_AYANAMSAS.includes(ayanamsa as PanchangAyanamsa)) {
    throw new RangeError("ayanamsa must be an engine built-in name.");
  }
  return { ayanamsa: ayanamsa as PanchangAyanamsa,
    maxSamples: budgetOf(input.maxSamples === undefined ? 10_000 : input.maxSamples) };
}

// A full sector is one phase turn. Searching zero once finds every sector
// boundary, including wrap, with no rounded 40/3 or 10/3 target longitude.
// Exact classifiers, rather than this rounded phase, settle the millisecond.
function phase(state: InstantaneousPanchang, stream: Stream): number {
  const arc = stream === "karana"
    ? roundedValue(exactSum(state.moon.tropical.lon, -state.sun.tropical.lon))
    : stream === "pada" ? state.moon.sidereal.lon
    : roundedValue(exactSum(state.sun.sidereal.lon, state.moon.sidereal.lon));
  return ((arc * COUNTS[stream] % 360) + 360) % 360;
}

function compareTransitions(a: LimbTransition, b: LimbTransition): number {
  return Date.parse(a.at) - Date.parse(b.at) || LIMB_KINDS.indexOf(a.kind) - LIMB_KINDS.indexOf(b.kind);
}

/**
 * Search a resolved UTC window, normally the two sunrises from resolveSunriseDay.
 * Invalid inputs throw. Operational failures refuse the entire result.
 * The fixed padded scan assumes forward Sun/Moon sector motion at its step;
 * adjacent-classification checks verify each returned change, not completeness.
 */
export function searchLimbTransitions(from: DateInput, to: DateInput, options: TransitionOptions = {}): TransitionResult {
  return searchLimbTransitionsWith(from, to, options, instantaneousPanchang);
}

/** Internal snapshot source for a single range; search budgets still count logical samples. */
export function searchLimbTransitionsWith(from: DateInput, to: DateInput, options: TransitionOptions,
  source: typeof instantaneousPanchang): TransitionResult {
  const settings = settingsOf(options);
  const lo = dateFrom(from, "Transition start").getTime();
  const hi = dateFrom(to, "Transition end").getTime();
  if (!(hi > lo) || hi - lo > 2 * DAY) {
    throw new RangeError("Transition window must be positive and at most two elapsed days.");
  }
  const scanLo = lo - PAD;
  const scanHi = hi + PAD;
  if (!Number.isFinite(new Date(scanLo).getTime()) || !Number.isFinite(new Date(scanHi).getTime())) {
    throw new RangeError("Padded transition window must be representable by Date.");
  }
  let samples = 0;
  let longitudeSamples = 0;
  const cache = new Map<number, InstantaneousPanchang>();
  const context = (): TransitionContext => ({ from: new Date(lo).toISOString(), to: new Date(hi).toISOString(),
    searchFrom: new Date(scanLo).toISOString(), searchTo: new Date(scanHi).toISOString(),
    ...settings, conventions: TRANSITION_CONVENTIONS, samples, longitudeSamples });
  const at = (ms: number): InstantaneousPanchang => {
    if (ms < scanLo || ms > scanHi) throw new Refused("unresolved-crossing");
    const existing = cache.get(ms);
    if (existing) return existing;
    if (samples >= settings.maxSamples) throw new Refused("sample-budget");
    samples++;
    const state = source(new Date(ms), { ayanamsa: settings.ayanamsa });
    if (state.status !== "ok") throw new Refused("engine-refused", state);
    cache.set(ms, state);
    return state;
  };
  try {
    // Refuse calc coverage before the scan. Do not invent partial intervals at
    // the reference-span edge or across a discontinuity of the engine clock.
    at(scanLo);
    at(scanHi);
    if (!Number.isNaN(elapsedDays(timeBasis(scanLo - 1, "utc"), timeBasis(scanHi, "utc"), Number.NaN))) {
      throw new Refused("time-basis-discontinuity");
    }
    const startState = at(lo);
    const events: LimbTransition[] = [];
    for (const stream of ["karana", "pada", "yoga"] as const) {
      const search = searchLongitudeCrossingsWith((_body, date) => {
        longitudeSamples++;
        return phase(at(date.getTime()), stream);
      }, stream, 0, new Date(scanLo), new Date(scanHi), { stepDays: STEP / DAY });
      for (const root of search.crossings) {
        const estimate = root.at.getTime();
        // Outer-edge roots cannot bound an overlapping interval; their
        // verification would require samples beyond the declared padded span.
        if (estimate - scanLo < 8 || scanHi - estimate < 8) continue;
        if (root.retrograde) throw new Refused("unresolved-crossing");
        const previous = limbIndex(at(estimate - 4), stream);
        const next = (previous + 1) % COUNTS[stream];
        if (limbIndex(at(estimate + 4), stream) !== next) throw new Refused("unresolved-crossing");
        const instant = firstMillisecond((ms) => {
          if (Math.abs(ms - estimate) > 8) throw new Refused("unresolved-crossing");
          return limbIndex(at(ms), stream) === next;
        }, estimate);
        const before = at(instant - 1);
        const after = at(instant);
        if (limbIndex(before, stream) !== previous || limbIndex(after, stream) !== next) {
          throw new Refused("unresolved-crossing");
        }
        const kinds: LimbKind[] = [stream];
        if (stream === "karana" && next % 2 === 0) kinds.push("tithi");
        if (stream === "pada" && next % 4 === 0) kinds.push("nakshatra");
        for (const kind of kinds) events.push(Object.freeze({ kind, at: after.utc, before, after }));
      }
    }
    events.sort(compareTransitions);
    const intervals: LimbInterval[] = [];
    for (const kind of LIMB_KINDS) {
      const changes = events.filter((event) => event.kind === kind);
      let first = -1;
      for (let i = 0; i < changes.length; i++) {
        if (Date.parse(changes[i]!.at) <= lo) first = i;
      }
      const last = changes.findIndex((event) => Date.parse(event.at) >= hi);
      if (first < 0 || last <= first) throw new Refused("unbracketed-limb");
      for (let i = first; i < last; i++) {
        const start = changes[i]!;
        const end = changes[i + 1]!;
        const index = limbIndex(start.after, kind);
        if (limbIndex(end.before, kind) !== index || limbIndex(end.after, kind) !== (index + 1) % COUNTS[kind]) {
          throw new Refused("unresolved-crossing");
        }
        intervals.push(Object.freeze({ kind, index, start, end }));
      }
      if (limbIndex(changes[first]!.after, kind) !== limbIndex(startState, kind)) {
        throw new Refused("unresolved-crossing");
      }
    }
    intervals.sort((a, b) => compareTransitions(a.start, b.start));
    return Object.freeze({ ...context(), status: "ok", startState,
      transitions: Object.freeze(events.filter((event) => Date.parse(event.at) >= lo && Date.parse(event.at) < hi)),
      intervals: Object.freeze(intervals) });
  } catch (error) {
    if (!(error instanceof Refused)) throw error;
    return Object.freeze({ ...context(), status: "refused", reason: error.reason,
      ...(error.engine ? { engine: error.engine } : {}) });
  }
}
