import type { SkyEvent, SkyFlag } from "../../src/sky/riseset.js";

/** Internal interval arithmetic. Inputs are solver events, not sampled positions. */
interface Timeline<E extends SkyEvent> {
  readonly events: readonly E[];
  readonly flags: readonly SkyFlag[];
}

interface Interval { from: number; to: number }

export interface PartitionWindow<E extends SkyEvent> extends Interval {
  period: "morning" | "evening";
  solarHalf: { start: E; end: E };
}

type Partition<E extends SkyEvent> =
  | { status: "complete"; windows: PartitionWindow<E>[] }
  | { status: "unresolved"; detail: string };

function horizonIntervals<E extends SkyEvent>(
  timeline: Timeline<E>, from: number, to: number, wantAbove: boolean
): Interval[] | null {
  const crossings = timeline.events.filter((event) => event.kind === "rise" || event.kind === "set");
  const alwaysAbove = timeline.flags.includes("never-sets");
  const alwaysBelow = timeline.flags.includes("never-rises");
  if (!crossings.length) {
    if (alwaysAbove === alwaysBelow) return null;
    return alwaysAbove === wantAbove ? [{ from, to }] : [];
  }
  if (alwaysAbove || alwaysBelow) return null;
  for (let i = 1; i < crossings.length; i += 1) {
    const before = crossings[i - 1]!;
    const after = crossings[i]!;
    if (after.at.getTime() <= before.at.getTime() || after.kind === before.kind) return null;
  }
  // A set's preceding state is above; a rise's preceding state is below.
  // This also handles a bounded stream holding only one horizon crossing.
  let above = crossings[0]!.kind === "set";
  let cursor = from;
  const intervals: Interval[] = [];
  for (const event of crossings) {
    const at = event.at.getTime();
    if (at > from) {
      const end = Math.min(at, to);
      if (end > cursor && above === wantAbove) intervals.push({ from: cursor, to: end });
      cursor = end;
    }
    if (at >= to) break;
    above = event.kind === "rise";
  }
  if (cursor < to && above === wantAbove) intervals.push({ from: cursor, to });
  return intervals;
}

function intersection(left: readonly Interval[], right: readonly Interval[]): Interval[] {
  const intervals: Interval[] = [];
  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) {
    const a = left[i]!;
    const b = right[j]!;
    const from = Math.max(a.from, b.from);
    const to = Math.min(a.to, b.to);
    if (from < to) intervals.push({ from, to });
    if (a.to <= b.to) i += 1;
    if (b.to <= a.to) j += 1;
  }
  return intervals;
}

/**
 * Form half-open intervals from crossing directions and alternating solar
 * transits. Never guess a state when its anchors or horizon flags are absent.
 * Exact simultaneous rise/set contacts are unresolved, not a positive window.
 */
export function partitionWindows<E extends SkyEvent>(
  sun: Timeline<E>, target: Timeline<E>, from: number, to: number
): Partition<E> {
  const night = horizonIntervals(sun, from, to, false);
  const above = horizonIntervals(target, from, to, true);
  if (night === null || above === null) {
    return { status: "unresolved", detail: "Missing or inconsistent horizon states in the bounded support search." };
  }
  const transits = sun.events.filter((event) => event.kind === "upper-transit" || event.kind === "lower-transit");
  if (!transits.length || transits[0]!.at.getTime() > from || transits.at(-1)!.at.getTime() < to) {
    return { status: "unresolved", detail: "Solar transits do not bracket the whole requested range within the bounded support search." };
  }
  for (let i = 1; i < transits.length; i += 1) {
    if (transits[i]!.kind === transits[i - 1]!.kind || transits[i]!.at.getTime() <= transits[i - 1]!.at.getTime()) {
      return { status: "unresolved", detail: "Solar upper and lower transits do not alternate in the support search." };
    }
  }
  const eligible = intersection(night, above);
  const windows: PartitionWindow<E>[] = [];
  let j = 0;
  for (let i = 1; i < transits.length; i += 1) {
    const start = transits[i - 1]!;
    const end = transits[i]!;
    const halfFrom = start.at.getTime();
    const halfTo = end.at.getTime();
    while (j < eligible.length && eligible[j]!.to <= halfFrom) j += 1;
    for (let k = j; k < eligible.length && eligible[k]!.from < halfTo; k += 1) {
      const interval = eligible[k]!;
      const begin = Math.max(interval.from, halfFrom);
      const finish = Math.min(interval.to, halfTo);
      if (begin < finish) windows.push({
        from: begin, to: finish, period: start.kind === "upper-transit" ? "evening" : "morning",
        solarHalf: { start, end }
      });
    }
  }
  return { status: "complete", windows };
}
