import { searchLongitudeCrossingsWith } from "../../src/crossings.js";

export interface ClearanceInterval {
  readonly from: number;
  readonly to: number;
  readonly start: "window" | "entry";
  readonly end: "window" | "exit";
}

export type ClearanceIntervalsResult =
  | { readonly status: "complete"; readonly intervals: readonly ClearanceInterval[] }
  | { readonly status: "refused"; readonly reason: "sample-budget" | "unresolved-boundary" };

type Sign = -1 | 1;
interface Boundary { low: number; high: number; before: Sign; after: Sign }
class Stopped {
  constructor(readonly reason: "sample-budget" | "unresolved-boundary") {}
}

/**
 * Sampled intervals of strictly negative clearance, closed at their boundaries.
 * Non-integral entries use the last outside millisecond; exits use the first
 * outside millisecond. An exact zero is a point boundary. Active intervals at
 * either window edge remain clipped there. Isolated zeros are not intervals.
 * The lower endpoint is unowned. An isolated zero at the owned upper endpoint
 * reached from positive clearance refuses: its entry or touch cannot be
 * classified using only in-window samples.
 *
 * This uses the engine's crossing search, including its smooth-motion and
 * station-spacing assumptions. Raw signs, sampled topology and partition
 * midpoints are checked, but finite samples cannot prove global completeness.
 * Tangencies, zero plateaus and observed unresolved topology refuse the whole
 * search. No evaluation leaves the closed window, including before Unix time.
 */
export function clearanceIntervals(
  valueAt: (milliseconds: number) => number,
  from: number,
  to: number,
  stepMilliseconds: number,
  maxCalls: number
): ClearanceIntervalsResult {
  if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from >= to ||
      !Number.isFinite(new Date(from).getTime()) || !Number.isFinite(new Date(to).getTime())) {
    throw new RangeError("Clearance window must contain ordered integer Date milliseconds.");
  }
  if (!Number.isFinite(stepMilliseconds) || stepMilliseconds < 1) {
    throw new RangeError("Clearance step must be finite and at least one millisecond.");
  }
  if (!Number.isSafeInteger(maxCalls) || maxCalls < 1) {
    throw new RangeError("Clearance maxCalls must be a finite positive integer.");
  }
  const samples = new Map<number, number>();
  let calls = 0;
  const read = (ms: number): number => {
    if (!Number.isInteger(ms) || ms < from || ms > to) throw new Error("Clearance sample escaped its window.");
    if (calls >= maxCalls) throw new Stopped("sample-budget");
    calls += 1;
    const value = valueAt(ms);
    if (!Number.isFinite(value)) throw new RangeError("Clearance must be finite.");
    samples.set(ms, value);
    return value;
  };
  const unresolved = (): never => { throw new Stopped("unresolved-boundary"); };
  const sign = (value: number): Sign => value < 0 ? -1 : 1;

  try {
    const search = searchLongitudeCrossingsWith(
      (_body, date) => Math.atan(read(date.getTime())) * 90 / Math.PI,
      "clearance", 0, new Date(from), new Date(to),
      { stepDays: stepMilliseconds / 86_400_000, maxSamples: maxCalls }
    );
    if (search.status === "refused") return { status: "refused", reason: search.reason };

    const first = read(from), last = read(to);
    // Endpoint zeros use only the interior side. The unowned lower endpoint
    // cannot create a singleton interval. At the owned upper endpoint, reaching
    // zero from outside is an unresolved entry or touch, not an absent event.
    const initial = first === 0 ? read(from + 1) : first;
    const final = last === 0 ? read(to - 1) : last;
    if (initial === 0 || final === 0) unresolved();
    if (last === 0 && final > 0) unresolved();

    const radius = Math.max(2, Math.ceil(stepMilliseconds / 2 ** 24) + 2);
    const boundaries: Boundary[] = [];
    for (const crossing of search.crossings) {
      const at = crossing.at.getTime();
      if (at === to && last === 0) continue;
      let low = Math.max(from, at - radius), high = Math.min(to, at + radius);
      let left = read(low), right = read(high);
      const center = read(at);
      if (left === 0 && low > from) { low -= 1; left = read(low); }
      if (right === 0 && high < to) { high += 1; right = read(high); }
      // A crossing solver can report a numerical zero after angular wrapping
      // rounded a tiny raw clearance to zero. Do not call that a physical root.
      if (left !== 0 && right !== 0 && sign(left) === sign(right)) {
        if (center === 0 || sign(center) !== sign(left)) unresolved();
        continue;
      }
      if (left === 0 || right === 0) unresolved();
      const before = sign(left), after = sign(right);
      while (high - low > 1) {
        const middle = low + Math.floor((high - low) / 2);
        const value = read(middle);
        if (value === 0) {
          const previous = read(middle - 1), next = read(middle + 1);
          if (previous === 0 || next === 0 || sign(previous) !== before || sign(next) !== after) unresolved();
          low = middle;
          high = middle;
          break;
        }
        if (sign(value) === before) { low = middle; left = value; }
        else { high = middle; right = value; }
      }
      const boundary = { low, high, before, after };
      const previous = boundaries.at(-1);
      if (previous && previous.low === low && previous.high === high) continue;
      if (previous && previous.high >= low) unresolved();
      boundaries.push(boundary);
    }

    // Verify both sides and one interior point of every partition. Together
    // with every raw sample retained from the solver this catches, among other
    // observed topology failures, its subsecond duplicate-root collapse.
    let edge = from;
    for (const boundary of boundaries) {
      read(edge + Math.floor((boundary.low - edge) / 2));
      edge = boundary.high;
    }
    read(edge + Math.floor((to - edge) / 2));

    let expected = sign(initial), index = 0;
    for (const [ms, value] of [...samples].sort(([a], [b]) => a - b)) {
      while (index < boundaries.length && ms > boundaries[index]!.high) {
        const boundary = boundaries[index]!;
        if (expected !== boundary.before) unresolved();
        expected = boundary.after;
        index += 1;
      }
      const boundary = boundaries[index];
      if (boundary && ms >= boundary.low) {
        if (expected !== boundary.before) unresolved();
        if (boundary.low === boundary.high) {
          if (value !== 0) unresolved();
        } else if (ms === boundary.low ? sign(value) !== boundary.before : sign(value) !== boundary.after) unresolved();
        continue;
      }
      if (value === 0) {
        if (ms !== from && ms !== to) unresolved();
      } else if (sign(value) !== expected) unresolved();
    }
    if (sign(final) !== (boundaries.at(-1)?.after ?? sign(initial))) unresolved();

    const intervals: ClearanceInterval[] = [];
    let active: { from: number; start: "window" | "entry" } | undefined =
      initial < 0 ? { from, start: "window" } : undefined;
    for (const boundary of boundaries) {
      if (boundary.after < 0) {
        if (active) unresolved();
        active = { from: boundary.low, start: "entry" };
      } else {
        if (!active) throw new Stopped("unresolved-boundary");
        intervals.push({ ...active, to: boundary.high, end: "exit" });
        active = undefined;
      }
    }
    if (active) intervals.push({ ...active, to, end: "window" });
    return { status: "complete", intervals };
  } catch (error) {
    if (error instanceof Stopped) return { status: "refused", reason: error.reason };
    throw error;
  }
}
