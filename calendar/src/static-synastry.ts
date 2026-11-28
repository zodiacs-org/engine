import { natalChart, synastry } from "../../src/index.js";
import type { InterAspect } from "../../src/index.js";
import { createNatalEnvelope } from "../../src/receipt.js";
import type { NatalEnvelope } from "../../src/receipt.js";
import { canonicalJson } from "./canonical-json.js";
import { snapshotSyntheticNatal } from "./synthetic-natal.js";
import type { SyntheticNatalInput } from "./synthetic-natal.js";
import type { JsonValue } from "./types.js";

export interface StaticSynastryRequest {
  readonly first: SyntheticNatalInput;
  readonly second: SyntheticNatalInput;
}

export interface StaticSynastryParticipant {
  readonly chartId: string;
  readonly synthetic: true;
  readonly calculation: NatalEnvelope;
}

/** Fixed natal geometry has no occurrence instant to export as a VEVENT. */
export interface StaticSynastryAnalysis {
  readonly convention: "static-natal/1";
  readonly timing: "undated";
  readonly first: StaticSynastryParticipant;
  readonly second: StaticSynastryParticipant;
  /** All major aspects under the engine's default synastry orb policy. */
  readonly aspects: readonly Readonly<InterAspect>[];
  /** Strictly zero engine-reported orb, without a widened tolerance. */
  readonly exactAspects: readonly Readonly<InterAspect>[];
}

/** Compute two fixed charts and preserve their ordered, undated engine analysis. */
export function analyzeStaticSynastry(input: StaticSynastryRequest): StaticSynastryAnalysis {
  // Snapshot both participants before either engine calculation can run.
  const request = JSON.parse(canonicalJson(input as unknown as JsonValue)) as StaticSynastryRequest;
  if (!request || typeof request !== "object" || Array.isArray(request) ||
      Object.keys(request).length !== 2 || !Object.hasOwn(request, "first") || !Object.hasOwn(request, "second")) {
    throw new TypeError("Static synastry requires only first and second chart inputs.");
  }
  const first = snapshotSyntheticNatal(request.first);
  const second = snapshotSyntheticNatal(request.second);
  if (first.id === second.id) throw new RangeError("Synastry participants require distinct chart identities.");
  const firstChart = natalChart(first.birth);
  const secondChart = natalChart(second.birth);
  const pair = synastry(firstChart, secondChart);
  const aspects = pair.aspects.map(aspect => ({ ...aspect }));
  return {
    convention: "static-natal/1", timing: "undated",
    first: {
      chartId: first.id, synthetic: true,
      calculation: createNatalEnvelope(firstChart, { sourceInstant: first.birth.utc })
    },
    second: {
      chartId: second.id, synthetic: true,
      calculation: createNatalEnvelope(secondChart, { sourceInstant: second.birth.utc })
    },
    aspects,
    exactAspects: aspects.filter(aspect => aspect.orb === 0).map(aspect => ({ ...aspect }))
  };
}
