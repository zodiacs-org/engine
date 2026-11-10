import type { SkyEvent } from "../../src/sky/riseset.js";
import { partitionHorizonOpportunities, type ObservationPeriod } from "./appearance-sequence.js";

type HorizonKind = "rise" | "set";

export type HorizonPairGapReason =
  | "missing-sun-crossing"
  | "multiple-sun-crossings"
  | "sun-crossing-outside-range"
  | "missing-target-crossing"
  | "multiple-target-crossings"
  | "target-crossing-outside-range";

export interface HorizonPairOpportunity<E extends SkyEvent> {
  readonly period: ObservationPeriod;
  /** The complete solar half, including any portion outside the request. */
  readonly from: number;
  readonly to: number;
  readonly solarHalf: Readonly<{ start: E; end: E }>;
  readonly sunKind: HorizonKind;
  readonly targetKind: HorizonKind;
  readonly sunCrossing: E | null;
  readonly targetCrossing: E | null;
  /** Target time minus Sun time; null whenever either crossing is ineligible. */
  readonly lagMilliseconds: number | null;
  /** Sun failures take precedence when both crossings are ineligible. */
  readonly reason: HorizonPairGapReason | null;
}

type HorizonPairPartition<E extends SkyEvent> =
  | { status: "complete"; opportunities: HorizonPairOpportunity<E>[] }
  | { status: "unresolved"; detail: string };

/**
 * Pair sunrise or sunset with each target direction in its own solar half.
 * Every overlapping half contributes both directions, including absent and
 * ambiguous crossings. No event is borrowed from another half. This function
 * performs interval arithmetic on engine events and evaluates no positions.
 */
export function partitionHorizonPairs<E extends SkyEvent>(
  sunEvents: readonly E[], targetEvents: readonly E[], from: number, to: number
): HorizonPairPartition<E> {
  // The existing partition validates the request, all solar crossings, and the
  // finite, ordered, alternating solar transits that must bracket the request.
  const solar = partitionHorizonOpportunities(sunEvents, sunEvents, from, to);
  if (solar.status !== "complete") return solar;

  const crossings = targetEvents.filter((event) => event.kind === "rise" || event.kind === "set");
  if (crossings.some((event) => !Number.isFinite(event.at.getTime()))) {
    return { status: "unresolved", detail: "Target horizon crossings must have finite instants." };
  }

  const opportunities: HorizonPairOpportunity<E>[] = [];
  for (const half of solar.opportunities) {
    const sunKind = half.period === "morning" ? "rise" : "set";
    const sunReason: HorizonPairGapReason | null = half.reason === "missing-crossing" ? "missing-sun-crossing"
      : half.reason === "multiple-crossings" ? "multiple-sun-crossings"
      : half.reason === "crossing-outside-range" ? "sun-crossing-outside-range" : null;
    for (const targetKind of ["rise", "set"] as const) {
      // Count the entire half before range clipping so a second crossing just
      // outside the request still makes the requested pair ambiguous.
      const matches = crossings.filter((event) => event.kind === targetKind
        && event.at.getTime() >= half.from && event.at.getTime() < half.to);
      const targetCrossing = matches.length === 1 ? matches[0]! : null;
      const targetReason: HorizonPairGapReason | null = matches.length === 0 ? "missing-target-crossing"
        : matches.length > 1 ? "multiple-target-crossings"
        : targetCrossing!.at.getTime() < from || targetCrossing!.at.getTime() >= to
          ? "target-crossing-outside-range" : null;
      const reason = sunReason ?? targetReason;
      opportunities.push({
        period: half.period, from: half.from, to: half.to, solarHalf: half.solarHalf,
        sunKind, targetKind, sunCrossing: half.crossing, targetCrossing,
        lagMilliseconds: reason === null ? targetCrossing!.at.getTime() - half.crossing!.at.getTime() : null,
        reason
      });
    }
  }
  return { status: "complete", opportunities };
}
