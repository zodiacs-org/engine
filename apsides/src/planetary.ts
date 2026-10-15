import type { Apsis, ApsisSearchDiagnostics, ApsisSearchOptions, ApsisSearchResult } from "./search.js";
import { searchApsides } from "./search.js";
import { PLANETARY_BODIES } from "./targets.js";
import type { PlanetaryBody } from "./targets.js";

const policy = (stepDays: number, method: "bisected-analytic-rate" | "golden-section-distance" = "bisected-analytic-rate") => Object.freeze({
  originJdTt: 2_451_545,
  stepSeconds: stepDays * 86_400,
  paddingSteps: 2,
  toleranceSeconds: 1,
  defaultMaxEvaluations: 100_000,
  method
} as const);

/** Fixed grids, not inferred orbital periods or a guarantee of completeness. */
export const PLANETARY_SEARCH_POLICIES = Object.freeze({
  Mercury: policy(0.5),
  Venus: policy(1),
  Earth: policy(0.5),
  Mars: policy(2),
  Jupiter: policy(8),
  Saturn: policy(16),
  Uranus: policy(16),
  Neptune: policy(32),
  Pluto: policy(32, "golden-section-distance")
} satisfies Record<PlanetaryBody, ReturnType<typeof policy>>);

export type PlanetarySearchOptions = ApsisSearchOptions;
export type PlanetaryApsis = Apsis<PlanetaryBody, "perihelion" | "aphelion">;
export type PlanetarySearchDiagnostics = ApsisSearchDiagnostics<ReturnType<typeof policy>>;
export type PlanetarySearchResult = ApsisSearchResult<PlanetaryBody, "perihelion" | "aphelion", ReturnType<typeof policy>>;
export type {
  ApsisSearchWindow as PlanetarySearchWindow,
  ApsisSearchRefusalReason as PlanetarySearchRefusalReason
} from "./search.js";

/** Search one heliocentric target with the engine's disclosed reference point. */
export function searchPlanetaryApsides(body: PlanetaryBody, options: PlanetarySearchOptions): PlanetarySearchResult {
  if (!(PLANETARY_BODIES as readonly unknown[]).includes(body)) {
    throw new RangeError("Planetary search requires Mercury through Pluto, including Earth.");
  }
  return searchApsides(body, ["perihelion", "aphelion"], PLANETARY_SEARCH_POLICIES[body], options);
}
