import type { Apsis, ApsisSearchDiagnostics, ApsisSearchOptions, ApsisSearchResult } from "./search.js";
import { readSearchOptions, searchApsides } from "./search.js";
import { describeLunarSyzygy, readSyzygyOrbDegrees, sampleSyzygyLongitude } from "./syzygy.js";
import type { LunarSyzygyAnnotation } from "./syzygy.js";

/** Fixed numerical policy, independent of the requested window and its edges. */
export const LUNAR_SEARCH_POLICY = Object.freeze({
  originJdTt: 2_451_545,
  stepSeconds: 43_200,
  paddingSteps: 2,
  toleranceSeconds: 1,
  defaultMaxEvaluations: 100_000
} as const);

export interface LunarSearchOptions extends ApsisSearchOptions {
  /** Enable phase annotations with this inclusive angular orb. No default. */
  readonly syzygyOrbDegrees?: number;
}
export type LunarApsis = Apsis<"Moon", "perigee" | "apogee"> & {
  /** Present only when the caller supplied syzygyOrbDegrees. */
  readonly syzygy?: LunarSyzygyAnnotation;
};
export type LunarSearchDiagnostics = ApsisSearchDiagnostics<typeof LUNAR_SEARCH_POLICY>;
type LunarBaseResult = ApsisSearchResult<"Moon", "perigee" | "apogee", typeof LUNAR_SEARCH_POLICY>;
export type LunarSearchResult =
  | (Omit<Extract<LunarBaseResult, { status: "complete" }>, "events"> & {
      readonly events: readonly LunarApsis[];
    })
  | Extract<LunarBaseResult, { status: "refused" }>;
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
  const searchOptions = readSearchOptions(options, LUNAR_SEARCH_POLICY, ["syzygyOrbDegrees"]);
  const orbDegrees = readSyzygyOrbDegrees(options);
  const result = searchApsides("Moon", ["perigee", "apogee"], LUNAR_SEARCH_POLICY, searchOptions);
  if (result.status === "refused" || orbDegrees === undefined) return result;

  let evaluations = result.diagnostics.evaluations;
  const events: LunarApsis[] = [];
  for (const event of result.events) {
    const samples = [];
    for (const body of ["Moon", "Sun"] as const) {
      if (evaluations === searchOptions.maxEvaluations) {
        return {
          status: "refused", reason: "evaluation-budget", events: [], window: result.window,
          detail: "The lunar syzygy annotation exhausted the apsis search's engine evaluation budget.",
          engineRefusal: null, diagnostics: { ...result.diagnostics, evaluations }
        };
      }
      evaluations += 1;
      const measured = sampleSyzygyLongitude(body, event.instant.jdTt);
      if (measured.status === "refused") {
        return {
          status: "refused", reason: "engine-refusal", events: [], window: result.window,
          detail: "The engine refused a required lunar syzygy longitude sample.",
          engineRefusal: measured, diagnostics: { ...result.diagnostics, evaluations }
        };
      }
      samples.push(measured.sample);
    }
    events.push({ ...event, syzygy: describeLunarSyzygy(event.kind, orbDegrees, samples[0]!, samples[1]!) });
  }
  return { ...result, events, diagnostics: { ...result.diagnostics, evaluations } };
}
