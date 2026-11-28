import type { SkyEvent } from "../../src/sky/riseset.js";

export type ObservationPeriod = "morning" | "evening";

export interface HorizonOpportunity<E extends SkyEvent> {
  readonly period: ObservationPeriod;
  /** Complete solar half, even when it extends past the requested range. */
  readonly from: number;
  readonly to: number;
  readonly solarHalf: Readonly<{ start: E; end: E }>;
  readonly crossing: E | null;
  readonly reason: "missing-crossing" | "multiple-crossings" | "crossing-outside-range" | null;
}

type OpportunityPartition<E extends SkyEvent> =
  | { status: "complete"; opportunities: HorizonOpportunity<E>[] }
  | { status: "unresolved"; detail: string };

/**
 * Internal interval arithmetic over engine events. Morning opportunities use
 * rises between lower and upper solar transit; evening opportunities use sets
 * between upper and lower transit. Keep missing halves so callers cannot join
 * visibility states across a gap. Daylight crossings are deliberately retained.
 */
export function partitionHorizonOpportunities<E extends SkyEvent>(
  sunEvents: readonly E[], targetEvents: readonly E[], from: number, to: number
): OpportunityPartition<E> {
  if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to) {
    return { status: "unresolved", detail: "The requested opportunity range must be finite and nonempty." };
  }
  const transits = sunEvents.filter((event) => event.kind === "upper-transit" || event.kind === "lower-transit");
  if (transits.length < 2 || transits[0]!.at.getTime() > from || transits.at(-1)!.at.getTime() < to) {
    return { status: "unresolved", detail: "Solar transits do not bracket the whole requested opportunity range." };
  }
  for (let i = 0; i < transits.length; i += 1) {
    const current = transits[i]!;
    const before = transits[i - 1];
    if (!Number.isFinite(current.at.getTime()) || (before !== undefined
      && (current.at.getTime() <= before.at.getTime() || current.kind === before.kind))) {
      return { status: "unresolved", detail: "Solar upper and lower transits must be finite, strictly ordered and alternating." };
    }
  }
  const crossings = targetEvents.filter((event) => event.kind === "rise" || event.kind === "set");
  if (crossings.some((event) => !Number.isFinite(event.at.getTime()))) {
    return { status: "unresolved", detail: "Target horizon crossings must have finite instants." };
  }
  const opportunities: HorizonOpportunity<E>[] = [];
  for (let i = 1; i < transits.length; i += 1) {
    const start = transits[i - 1]!;
    const end = transits[i]!;
    const halfFrom = start.at.getTime();
    const halfTo = end.at.getTime();
    if (halfTo <= from || halfFrom >= to) continue;
    const period = start.kind === "lower-transit" ? "morning" : "evening";
    const kind = period === "morning" ? "rise" : "set";
    // Check the whole solar half, not just the clipped range. A second crossing
    // outside the request must still prevent an ambiguous half from qualifying.
    const matches = crossings.filter((event) => event.kind === kind
      && event.at.getTime() >= halfFrom && event.at.getTime() < halfTo);
    const crossing = matches.length === 1 ? matches[0]! : null;
    const reason = matches.length === 0 ? "missing-crossing" : matches.length > 1 ? "multiple-crossings"
      : crossing!.at.getTime() < from || crossing!.at.getTime() >= to ? "crossing-outside-range" : null;
    opportunities.push({ period, from: halfFrom, to: halfTo, solarHalf: { start, end }, crossing, reason });
  }
  return { status: "complete", opportunities };
}
