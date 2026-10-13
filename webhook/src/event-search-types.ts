import type { CalcPosition, CalcRefusal, calc } from "../../src/calc.js";
import type { ExactAspect } from "../vendor/events/src/aspects.js";
import type { EvaluationContext } from "../vendor/events/src/context.js";
import type { EclipseEvent, EclipseModel, EclipseProvider } from "../vendor/events/src/eclipses.js";
import type { SignIngress } from "../vendor/events/src/longitude.js";
import type { MotionProvider, Station } from "../vendor/events/src/stations.js";
import type { SearchWindow } from "../vendor/events/src/types.js";
import type { EventFilter, ScheduleWindow } from "./types.js";
import type { CustomQuery, CUSTOM_QUERY_SCHEMA } from "./custom-query.js";

export interface EventSearchRequest {
  readonly filter: EventFilter;
  readonly window: ScheduleWindow;
  /** Explicit sampling policy, not an accuracy guarantee. Grid origin is Unix epoch. */
  readonly stepMs: number;
  /** Includes search samples and calculations capturing the emitted events' receipts. */
  readonly maxEvaluations: number;
  readonly signal?: AbortSignal;
  /** Required for built-in and custom eclipse filters. No implicit model. */
  readonly eclipse?: { readonly model: EclipseModel; readonly derivativeStepMs: number };
}

/** Trusted local test/alternate-source seam. Providers must charge the supplied context. */
export interface EventSearchDependencies {
  readonly motion?: (context: EvaluationContext) => MotionProvider;
  readonly eclipse?: (context: EvaluationContext) => EclipseProvider;
  readonly calculate?: typeof calc;
}

export type EventDefinition = ExactAspect | SignIngress | Station | EclipseEvent;

export interface DiscoveredEvent {
  readonly kind: EventFilter["kind"];
  readonly at: string;
  readonly atMs: number;
  /** Original search definition, numerical bracket, residual and motion/model fields. */
  readonly definition: EventDefinition;
  /** Engine results at the emitted UTC label, including full receipts and bounds. */
  readonly positions: readonly CalcPosition[];
}

export interface EventSearchMetadata {
  readonly schema: "zodiacs.webhook-search.v1";
  readonly source: { readonly repository: "zodiacs-org/engine"; readonly commit: string };
  readonly filter: EventFilter;
  readonly window: ScheduleWindow;
  readonly scanWindow: SearchWindow;
  readonly stepMs: number;
  readonly gridOriginMs: 0;
  readonly maxEvaluations: number;
  readonly eclipse: NonNullable<EventSearchRequest["eclipse"]> | null;
  readonly ownership: "[start,end)";
  readonly coordinates: {
    readonly center: "geocentric"; readonly frame: "ecliptic-true-of-date";
    readonly zodiac: "tropical"; readonly correction: "apparent"; readonly units: "degrees";
  };
  readonly completeness: "conditional-on-sampling-assumptions";
  readonly custom?: {
    readonly schema: typeof CUSTOM_QUERY_SCHEMA;
    readonly query: CustomQuery;
    readonly effectiveWindow: ScheduleWindow | null;
    readonly intervals: "refused";
  };
}

interface SearchEnvelope {
  readonly search: EventSearchMetadata;
  readonly evaluations: number;
}

export type EventSearchResult = SearchEnvelope & (
  | { readonly status: "complete"; readonly events: readonly DiscoveredEvent[] }
  | { readonly status: "refused"; readonly events: readonly [];
      readonly reason: "evaluation-budget" | "cancelled" | "time-discontinuity" | "unsupported-filter" }
  | { readonly status: "refused"; readonly events: readonly [];
      readonly reason: "engine-refused"; readonly engineRefusal: CalcRefusal }
);
