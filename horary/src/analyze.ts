import { cast } from "./cast.js";
import { normalizeHoraryInput } from "./input.js";
import { selectSignificators } from "./significators.js";
import { evaluateConsiderations } from "./considerations.js";
import { createRulePolicy } from "./policy.js";
import type { RulePolicyInput } from "./policy.js";
import { evaluateEssentialCondition } from "./essential.js";
import { createEssentialPolicy } from "./essential-policy.js";
import type { EssentialPolicyInput } from "./essential-policy.js";
import { evaluateAccidentalCondition } from "./accidental.js";
import { createAccidentalPolicy } from "./accidental-policy.js";
import type { AccidentalPolicyInput } from "./accidental-policy.js";
import { createAspectSearchPolicy } from "./aspect-policy.js";
import type { AspectSearchPolicyInput } from "./aspect-policy.js";
import { evaluateDirectPerfection } from "./direct-perfection.js";
import { createDirectPerfectionPolicy } from "./direct-policy.js";
import type { DirectPerfectionPolicyInput } from "./direct-policy.js";
import { evaluateTranslation } from "./translation.js";
import { createTranslationPolicy } from "./translation-policy.js";
import type { TranslationPolicyInput } from "./translation-policy.js";
import { evaluateCollection } from "./collection.js";
import { createCollectionPolicy } from "./collection-policy.js";
import type { CollectionPolicyInput } from "./collection-policy.js";
import { evaluateImpediments } from "./impediments.js";
import { createImpedimentPolicy } from "./impediment-policy.js";
import type { ImpedimentPolicyInput } from "./impediment-policy.js";
import { evaluateTimingHints } from "./timing.js";
import { createTimingPolicy } from "./timing-policy.js";
import type { TimingPolicyInput } from "./timing-policy.js";
import type { HoraryCast, HoraryInput, LocatedChart, NormalizedHoraryInput } from "./types.js";

/** Factory input fields, not serialized policy snapshots. Omitted groups use their existing defaults. */
export interface HoraryAnalysisOptions {
  readonly considerations?: RulePolicyInput;
  readonly essential?: EssentialPolicyInput;
  readonly accidental?: AccidentalPolicyInput;
  readonly aspects?: AspectSearchPolicyInput;
  readonly direct?: DirectPerfectionPolicyInput;
  readonly translation?: TranslationPolicyInput;
  readonly collection?: CollectionPolicyInput;
  readonly impediments?: ImpedimentPolicyInput;
  readonly timing?: TimingPolicyInput;
}

export type DeepReadonly<T> = T extends object ? { readonly [K in keyof T]: DeepReadonly<T[K]> } : T;
export type HoraryChartSnapshot = DeepReadonly<Omit<LocatedChart, "input"> & {
  input: Omit<LocatedChart["input"], "utc"> & { utc: string };
}>;

export interface HoraryAnalysis {
  readonly schema: "horary.analysis/v1";
  readonly input: NormalizedHoraryInput;
  /** Detached engine data. The engine input Date is represented by an ISO string. */
  readonly chart: HoraryChartSnapshot;
  readonly significators: ReturnType<typeof selectSignificators>;
  readonly considerations: ReturnType<typeof evaluateConsiderations>;
  readonly essential: ReturnType<typeof evaluateEssentialCondition>;
  readonly accidental: ReturnType<typeof evaluateAccidentalCondition>;
  /** Same report as direct.aspects; no additional standalone aspect scan. */
  readonly aspects: ReturnType<typeof evaluateDirectPerfection>["aspects"];
  readonly direct: ReturnType<typeof evaluateDirectPerfection>;
  readonly translation: ReturnType<typeof evaluateTranslation>;
  readonly collection: ReturnType<typeof evaluateCollection>;
  readonly impediments: ReturnType<typeof evaluateImpediments>;
  readonly timing: ReturnType<typeof evaluateTimingHints>;
  readonly limitations: readonly string[];
}

function policies(value: HoraryAnalysisOptions) {
  const keys = ["considerations", "essential", "accidental", "aspects", "direct", "translation", "collection", "impediments", "timing"];
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value) as typeof Object.prototype)) {
    throw new RangeError("Analysis options must be an ordinary object.");
  }
  for (const key of Reflect.ownKeys(value)) {
    const slot = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key !== "string" || !keys.includes(key) || !slot || !("value" in slot) || !slot.enumerable || slot.value === undefined) {
      throw new RangeError("Analysis options contain an unsupported or undefined field.");
    }
  }
  // Validate every group before casting or running any enabled scanner.
  return {
    considerations: createRulePolicy(value.considerations), essential: createEssentialPolicy(value.essential),
    accidental: createAccidentalPolicy(value.accidental), aspects: createAspectSearchPolicy(value.aspects),
    direct: createDirectPerfectionPolicy(value.direct), translation: createTranslationPolicy(value.translation),
    collection: createCollectionPolicy(value.collection), impediments: createImpedimentPolicy(value.impediments),
    timing: createTimingPolicy(value.timing)
  };
}

function freeze<T>(value: T): DeepReadonly<T> {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value as DeepReadonly<T>;
}

function compose(result: HoraryCast, policy: ReturnType<typeof policies>): HoraryAnalysis {
  const significators = selectSignificators(result);
  const considerations = evaluateConsiderations(result, policy.considerations);
  const essential = evaluateEssentialCondition(result, policy.essential);
  const accidental = evaluateAccidentalCondition(result, policy.accidental);
  const direct = evaluateDirectPerfection(result, policy.aspects, policy.direct);
  const translation = evaluateTranslation(result, policy.aspects, policy.translation);
  const collection = evaluateCollection(result, policy.aspects, policy.collection);
  const impediments = evaluateImpediments(result, policy.aspects, policy.impediments);
  const timing = evaluateTimingHints(result, policy.aspects, policy.timing);
  const chart = freeze(structuredClone({ ...result.chart,
    input: { ...result.chart.input, utc: result.chart.input.utc.toISOString() } }));
  return Object.freeze({ schema: "horary.analysis/v1", input: normalizeHoraryInput(result.input), chart, significators,
    considerations, essential, accidental, aspects: direct.aspects, direct, translation, collection, impediments, timing,
    limitations: Object.freeze([
      "These observations and scores establish no authoritative yes/no outcome or predictive validity.",
      "Each mode retains its own policy, sampled search status and limitations; a candidate is partial eligibility evidence.",
      "Search budgets apply separately to each report, including repeated aspect and station scans; there is no combined global budget.",
      "The void-of-course scanner has its own fixed horizon and no configurable sample budget.",
      "Perfection modes and impediments can overlap. No priority, reception exception or final adjudication is inferred.",
      "Symbolic timing uses caller-selected units and is separate from ephemeris elapsed UTC days.",
      "A supplied cast is trusted numerical input, not authenticated against its instant, location or motion scans."
    ]) });
}

/** Synchronous, offline composition with one cast and no I/O. */
export function analyze(input: HoraryInput, options: HoraryAnalysisOptions = {}): HoraryAnalysis {
  const policy = policies(options);
  return compose(cast(input), policy);
}

/** Analyze a typed cast without recasting. This is not a JSON chart importer. */
export function analyzeCast(result: HoraryCast, options: HoraryAnalysisOptions = {}): HoraryAnalysis {
  const policy = policies(options);
  // Validate the base cast before cloning; snapshots never freeze caller data.
  selectSignificators(result);
  const snapshot = structuredClone(result);
  return compose(snapshot, policy);
}
