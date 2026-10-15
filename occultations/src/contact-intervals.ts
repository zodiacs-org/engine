import { searchLongitudeCrossingsWith } from "../../src/crossings.js";

type Sign = -1 | 1;

export interface ContactBoundary {
  /** First integer millisecond on or after the crossing. */
  readonly at: number;
  readonly before: Sign;
  readonly after: Sign;
  /** An exact sampled zero, or adjacent milliseconds with opposite signs. */
  readonly bracket: { readonly from: number; readonly to: number };
}

export interface ContactInterval {
  readonly from: number;
  readonly to: number;
  readonly start: "window" | "entry";
  readonly end: "window" | "exit";
}

export type ContactIntervalsResult =
  | {
      readonly status: "complete";
      readonly intervals: readonly ContactInterval[];
      readonly contacts: readonly ContactBoundary[];
    }
  | { readonly status: "refused"; readonly reason: "sample-budget" | "unresolved-contact" };

class Stopped {
  constructor(readonly reason: "sample-budget" | "unresolved-contact") {}
}

/**
 * Contact-delimited intervals of negative clearance, clipped to [from,to].
 * Contacts belong to (from,to]; a contact exactly at from is only used to
 * establish the initial state. A contact at to is returned even when an entry
 * leaves no positive-duration interval inside the window. Nonintegral roots
 * use the first integer millisecond after the crossing in either direction.
 *
 * The engine supplies crossing searches and extremum probes. Its smooth-motion
 * and station-spacing assumptions still apply; finite sampling cannot prove
 * completeness. Every raw sample and partition midpoint is checked against
 * the resulting topology. Observed tangencies, plateaus and lost or conflicting
 * roots refuse the whole search. A one-millisecond halo classifies exact edge
 * roots; no callback is evaluated outside [from-1,to+1]. All calls, including
 * repeated instants and verification, count against maxCalls.
 */
export function contactIntervals(
  valueAt: (milliseconds: number) => number,
  from: number,
  to: number,
  stepMilliseconds: number,
  maxCalls: number
): ContactIntervalsResult {
  if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from >= to ||
      !Number.isSafeInteger(to - from) ||
      !Number.isFinite(new Date(from - 1).getTime()) || !Number.isFinite(new Date(to + 1).getTime())) {
    throw new RangeError("Contact window must contain ordered integer Date milliseconds and a one-millisecond halo.");
  }
  if (!Number.isFinite(stepMilliseconds) || stepMilliseconds < 1) {
    throw new RangeError("Contact step must be finite and at least one millisecond.");
  }
  if (!Number.isSafeInteger(maxCalls) || maxCalls < 1) {
    throw new RangeError("Contact maxCalls must be a finite positive integer.");
  }

  const samples = new Map<number, number>();
  let calls = 0;
  const unresolved = (): never => { throw new Stopped("unresolved-contact"); };
  const sign = (value: number): Sign => value < 0 ? -1 : 1;
  const read = (ms: number): number => {
    if (!Number.isInteger(ms) || ms < from - 1 || ms > to + 1) throw new Error("Contact sample escaped its halo.");
    if (calls >= maxCalls) throw new Stopped("sample-budget");
    calls += 1;
    const value = valueAt(ms);
    if (!Number.isFinite(value)) throw new RangeError("Contact clearance must be finite.");
    if (samples.has(ms) && samples.get(ms) !== value) unresolved();
    samples.set(ms, value);
    return value;
  };
  const exactBoundary = (at: number): ContactBoundary => {
    const previous = read(at - 1), next = read(at + 1);
    if (previous === 0 || next === 0 || sign(previous) === sign(next)) unresolved();
    return { at, before: sign(previous), after: sign(next), bracket: { from: at, to: at } };
  };

  try {
    const search = searchLongitudeCrossingsWith(
      (_body, date) => Math.atan(read(date.getTime())) * 90 / Math.PI,
      "contact", 0, new Date(from), new Date(to),
      { stepDays: stepMilliseconds / 86_400_000, maxSamples: maxCalls }
    );
    if (search.status === "refused") return { status: "refused", reason: search.reason };

    const first = read(from), last = read(to);
    const found: ContactBoundary[] = [];
    if (first === 0) found.push(exactBoundary(from));
    if (last === 0) found.push(exactBoundary(to));

    // The engine refines 24 times and Date truncates toward zero. This bracket
    // accommodates that resolution in either epoch direction, then uses raw
    // clearance to establish adjacent integer milliseconds or an exact zero.
    const radius = Math.max(2, Math.ceil(stepMilliseconds / 2 ** 24) + 2);
    for (const crossing of search.crossings) {
      const at = crossing.at.getTime();
      if ((at === from && first === 0) || (at === to && last === 0)) continue;
      let low = Math.max(from, at - radius), high = Math.min(to, at + radius);
      let left = read(low), right = read(high);
      const center = read(at);
      if (left === 0) { low -= 1; left = read(low); }
      if (right === 0) { high += 1; right = read(high); }
      if (left === 0 || right === 0) unresolved();
      if (sign(left) === sign(right)) {
        // Angular wrapping can round tiny nonzero clearances to zero. That
        // alone is not a physical root; a raw zero or contrary sign is real
        // unresolved topology, including a sampled graze.
        if (center === 0 || sign(center) !== sign(left)) unresolved();
        continue;
      }
      const before = sign(left), after = sign(right);
      let exact: ContactBoundary | undefined;
      while (high - low > 1) {
        const middle = low + Math.floor((high - low) / 2);
        const value = read(middle);
        if (value === 0) {
          exact = exactBoundary(middle);
          if (exact.before !== before || exact.after !== after) unresolved();
          break;
        }
        if (sign(value) === before) low = middle;
        else high = middle;
      }
      found.push(exact ?? { at: high, before, after, bracket: { from: low, to: high } });
    }

    found.sort((a, b) => a.at - b.at);
    const boundaries: ContactBoundary[] = [];
    for (const boundary of found) {
      if (boundary.at < from || boundary.at > to) unresolved();
      const previous = boundaries.at(-1);
      if (previous?.at === boundary.at) {
        if (previous.before !== boundary.before || previous.after !== boundary.after ||
            previous.bracket.from !== boundary.bracket.from || previous.bracket.to !== boundary.bracket.to) unresolved();
        continue;
      }
      if (previous && previous.bracket.to > boundary.bracket.from) unresolved();
      boundaries.push(boundary);
    }

    let edge = from;
    for (const boundary of boundaries) {
      read(edge + Math.floor((boundary.bracket.from - edge) / 2));
      edge = boundary.bracket.to;
    }
    read(edge + Math.floor((to - edge) / 2));

    // A second root discarded by the engine's subsecond deduplication, a zero
    // missed by the angular transform, or a contradictory refinement sample
    // must not silently leave a plausible but incomplete interval list.
    const lowerBoundary = boundaries[0]?.at === from ? boundaries[0] : undefined;
    let expected = lowerBoundary?.before ?? sign(first), index = 0;
    for (const [ms, value] of [...samples].sort(([a], [b]) => a - b)) {
      while (index < boundaries.length && ms > boundaries[index]!.bracket.to) {
        const boundary = boundaries[index]!;
        if (expected !== boundary.before) unresolved();
        expected = boundary.after;
        index += 1;
      }
      const boundary = boundaries[index];
      if (boundary && ms >= boundary.bracket.from) {
        if (expected !== boundary.before) unresolved();
        if (boundary.bracket.from === boundary.bracket.to) {
          if (value !== 0) unresolved();
        } else if (value === 0 ||
                   sign(value) !== (ms === boundary.bracket.from ? boundary.before : boundary.after)) unresolved();
      } else if (value === 0 || sign(value) !== expected) unresolved();
    }

    const intervals: ContactInterval[] = [];
    const contacts = boundaries.filter((boundary) => boundary.at > from);
    let active: { from: number; start: "window" | "entry" } | undefined =
      (lowerBoundary?.after ?? sign(first)) < 0 ? { from, start: "window" } : undefined;
    for (const boundary of contacts) {
      if (boundary.after < 0) {
        if (active) unresolved();
        active = { from: boundary.at, start: "entry" };
      } else {
        if (!active) throw new Stopped("unresolved-contact");
        if (boundary.at > active.from) intervals.push({ ...active, to: boundary.at, end: "exit" });
        active = undefined;
      }
    }
    if (active && active.from < to) intervals.push({ ...active, to, end: "window" });
    return { status: "complete", intervals, contacts };
  } catch (error) {
    if (error instanceof Stopped) return { status: "refused", reason: error.reason };
    throw error;
  }
}
