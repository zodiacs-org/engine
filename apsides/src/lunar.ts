import type { Apsis, ApsisSearchDiagnostics, ApsisSearchOptions, ApsisSearchResult } from "./search.js";
import { searchApsides } from "./search.js";

/** Fixed numerical policy, independent of the requested window and its edges. */
export const LUNAR_SEARCH_POLICY = Object.freeze({
  originJdTt: 2_451_545,
  stepSeconds: 43_200,
  paddingSteps: 2,
  toleranceSeconds: 1,
  defaultMaxEvaluations: 100_000
} as const);

export type LunarSearchOptions = ApsisSearchOptions;
export type LunarApsis = Apsis<"Moon", "perigee" | "apogee">;
export type LunarSearchDiagnostics = ApsisSearchDiagnostics<typeof LUNAR_SEARCH_POLICY>;
export type LunarSearchResult = ApsisSearchResult<"Moon", "perigee" | "apogee", typeof LUNAR_SEARCH_POLICY>;
export type {
  TtDistancePoint, ApsisSearchWindow as LunarSearchWindow,
  ApsisSearchRefusalReason as LunarSearchRefusalReason
} from "./search.js";

/**
 * Search geocentric geometric lunar distance on TT, returning events in (from,to].
 * Endpoint pins resolve endpoints only; internal samples use the normal engine
 * time basis. Fixed grid witnesses preserve event identity across window splits.
 * All refusals discard the entire event list. No I/O or ephemeris reimplementation.
 */
export function searchLunarApsides(options: LunarSearchOptions): LunarSearchResult {
  return searchApsides("Moon", ["perigee", "apogee"], LUNAR_SEARCH_POLICY, options);
}
