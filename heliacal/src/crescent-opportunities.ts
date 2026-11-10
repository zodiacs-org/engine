import type { SkyEvent } from "../../src/sky/riseset.js";
import { partitionHorizonOpportunities, type ObservationPeriod } from "./appearance-sequence.js";
import { yallopBestTime } from "./yallop.js";

export type CrescentPairingGap =
  | "missing-sun-crossing"
  | "multiple-sun-crossings"
  | "sun-crossing-outside-range"
  | "missing-moon-crossing"
  | "multiple-moon-crossings"
  | "moon-crossing-outside-range";

export interface CrescentTiming {
  readonly at: string;
  readonly lagMilliseconds: number;
  /** Nonnegative rounded four-ninths offset, added in the evening and subtracted in the morning. */
  readonly offsetMilliseconds: number;
  readonly rule: "evening-four-ninths" | "morning-mirrored-four-ninths-extension";
}

export interface CrescentHorizonOpportunity<E extends SkyEvent> {
  readonly period: ObservationPeriod;
  /** The complete solar half, including any portion outside the request. */
  readonly from: number;
  readonly to: number;
  readonly solarHalf: Readonly<{ start: E; end: E }>;
  readonly sunCrossing: E | null;
  readonly moonCrossing: E | null;
  /** Evening moonset minus sunset; morning sunrise minus moonrise. Null for a pairing gap. */
  readonly lagMilliseconds: number | null;
  /** Null for a pairing gap or a nonpositive lag. */
  readonly bestTime: Readonly<CrescentTiming> | null;
  /** Sun failures take precedence when both crossings are ineligible. */
  readonly reason: CrescentPairingGap | null;
}

type CrescentOpportunityPartition<E extends SkyEvent> =
  | { status: "complete"; opportunities: CrescentHorizonOpportunity<E>[] }
  | { status: "unresolved"; detail: string };

/**
 * Pair each solar half's sunrise with moonrise or sunset with moonset. Both
 * crossings must lie in the requested half-open range, while multiplicity is
 * checked over the entire half. Missing events are never borrowed across halves.
 * Evening timing uses Yallop TN69 equation 4.1 through yallopBestTime. Morning
 * timing mirrors its rounded offset before sunrise: an unvalidated extension,
 * not a rule specified by Yallop. No position or visibility is evaluated here.
 */
export function partitionCrescentOpportunities<E extends SkyEvent>(
  sunEvents: readonly E[], targetEvents: readonly E[], from: number, to: number
): CrescentOpportunityPartition<E> {
  const solar = partitionHorizonOpportunities(sunEvents, sunEvents, from, to);
  if (solar.status !== "complete") return solar;
  const lunar = partitionHorizonOpportunities(sunEvents, targetEvents, from, to);
  if (lunar.status !== "complete") return lunar;

  const opportunities: CrescentHorizonOpportunity<E>[] = [];
  for (const [index, half] of solar.opportunities.entries()) {
    // Both partitions use the same validated transit stream and request.
    const moonHalf = lunar.opportunities[index]!;
    const sunReason: CrescentPairingGap | null = half.reason === "missing-crossing" ? "missing-sun-crossing"
      : half.reason === "multiple-crossings" ? "multiple-sun-crossings"
      : half.reason === "crossing-outside-range" ? "sun-crossing-outside-range" : null;
    const moonReason: CrescentPairingGap | null = moonHalf.reason === "missing-crossing" ? "missing-moon-crossing"
      : moonHalf.reason === "multiple-crossings" ? "multiple-moon-crossings"
      : moonHalf.reason === "crossing-outside-range" ? "moon-crossing-outside-range" : null;
    const reason = sunReason ?? moonReason;
    let lagMilliseconds: number | null = null;
    let bestTime: Readonly<CrescentTiming> | null = null;
    if (reason === null) {
      const sunAt = half.crossing!.at.getTime();
      const moonAt = moonHalf.crossing!.at.getTime();
      lagMilliseconds = half.period === "evening" ? moonAt - sunAt : sunAt - moonAt;
      if (!Number.isSafeInteger(lagMilliseconds)) {
        return { status: "unresolved", detail: "Paired Sun/Moon lag must be a safe-integer number of milliseconds." };
      }
      if (lagMilliseconds > 0) {
        const timing = half.period === "evening" ? yallopBestTime(sunAt, moonAt) : yallopBestTime(moonAt, sunAt);
        bestTime = Object.freeze({
          at: half.period === "evening" ? timing.at : new Date(sunAt - timing.offsetMilliseconds).toISOString(),
          lagMilliseconds,
          offsetMilliseconds: timing.offsetMilliseconds,
          rule: half.period === "evening" ? "evening-four-ninths" : "morning-mirrored-four-ninths-extension"
        });
      }
    }
    opportunities.push({
      period: half.period, from: half.from, to: half.to, solarHalf: half.solarHalf,
      sunCrossing: half.crossing, moonCrossing: moonHalf.crossing, lagMilliseconds, bestTime, reason
    });
  }
  return { status: "complete", opportunities };
}
