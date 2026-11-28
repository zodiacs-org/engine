import { snapshotMetadata } from "./eclipse-adapter.js";
import type { EclipseAdapter, EclipseMetadata, EclipseWindow, SuppliedEclipseInstant } from "./eclipse-adapter.js";

export interface EventsEclipseSettings {
  readonly model: {
    readonly sunRadiusAu: number;
    readonly moonRadiusAu: number;
    readonly earthRadiusAu: number;
  };
  readonly stepMs: number;
  readonly derivativeStepMs: number;
  readonly maxEvaluations: number;
}

// Structural boundary to an optional checkout module. No static dependency on
// another branch and no copy of its search implementation or geometry.
interface EventsModule {
  EvaluationContext: new (window: EclipseWindow, options: { maxEvaluations: number }) => unknown;
  searchEclipses(context: unknown, kind: "solar" | "lunar", model: EventsEclipseSettings["model"],
    options: { stepMs: number; derivativeStepMs: number }): unknown;
}

interface EventsResult {
  status: "complete" | "refused";
  reason?: "evaluation-budget" | "cancelled";
  evaluations: number;
  events: Array<{ kind: "solar" | "lunar"; atMs: number; clock: "utc";
    definition: "minimum-shadow-axis-distance" } & Record<string, EclipseMetadata>>;
}

/** Wrap the events workbench's existing solar and lunar minimum searches. */
export function createEventsEclipseAdapter(module: unknown, settings: EventsEclipseSettings): EclipseAdapter {
  const config = snapshotMetadata(settings) as unknown as EventsEclipseSettings;
  if (!config || typeof config !== "object" || Array.isArray(config) || Reflect.ownKeys(config).some(key =>
    !["model", "stepMs", "derivativeStepMs", "maxEvaluations"].includes(String(key))) ||
    !config.model || typeof config.model !== "object" || Array.isArray(config.model) || Reflect.ownKeys(config.model).some(key =>
      !["sunRadiusAu", "moonRadiusAu", "earthRadiusAu"].includes(String(key))) ||
    ![config.model.sunRadiusAu, config.model.moonRadiusAu, config.model.earthRadiusAu].every(
      value => typeof value === "number" && Number.isFinite(value) && value > 0) ||
    config.model.sunRadiusAu <= Math.max(config.model.moonRadiusAu, config.model.earthRadiusAu) ||
    ![config.stepMs, config.derivativeStepMs, config.maxEvaluations].every(
      value => Number.isSafeInteger(value) && value > 0)) {
    throw new RangeError("events eclipse settings require explicit positive radii, steps and evaluation budget.");
  }
  if (module === null) return Object.freeze({ status: "unavailable", reason: "not-installed" });
  const api = module as Partial<EventsModule> | undefined;
  if (!api || typeof api.EvaluationContext !== "function" || typeof api.searchEclipses !== "function") {
    return Object.freeze({ status: "unavailable", reason: "unsupported-api" });
  }
  const Context = api.EvaluationContext;
  const search = api.searchEclipses;
  return Object.freeze({ status: "available", search(window: EclipseWindow) {
    const context = new Context(window, { maxEvaluations: config.maxEvaluations });
    const options = Object.freeze({ stepMs: config.stepMs, derivativeStepMs: config.derivativeStepMs });
    const contacts: SuppliedEclipseInstant[] = [];
    const searches: EclipseMetadata[] = [];
    let evaluations = 0;
    const finish = () => ({ evaluations,
      completeness: "events-sampled-minima;conditional-on-scan-and-derivative-steps;not-contact-search;not-proven",
      provenance: snapshotMetadata({ source: "events-relative-checkout", settings: config, searches }) });
    for (const kind of ["solar", "lunar"] as const) {
      const result = snapshotMetadata(search(context, kind, config.model, options)) as unknown as EventsResult;
      if (!result || !Array.isArray(result.events) || !Number.isSafeInteger(result.evaluations) ||
        result.evaluations < evaluations || result.evaluations > config.maxEvaluations) {
        throw new RangeError("invalid events eclipse result.");
      }
      evaluations = result.evaluations; // Context counts are cumulative, not per scan.
      const { events: _sourceEvents, ...summary } = result;
      searches.push(snapshotMetadata({ kind, result: summary }));
      if (result.status === "refused") {
        if ((result.reason !== "evaluation-budget" && result.reason !== "cancelled") || result.events.length !== 0) {
          throw new RangeError("invalid events eclipse refusal.");
        }
        return Object.freeze({ ...finish(), status: "refused", reason: result.reason,
          events: Object.freeze([]) as readonly [] });
      }
      if (result.status !== "complete") throw new RangeError("invalid events eclipse status.");
      for (const event of result.events) {
        if (!event || event.kind !== kind || event.clock !== "utc" ||
          event.definition !== "minimum-shadow-axis-distance") {
          throw new RangeError("unsupported events eclipse definition or clock.");
        }
        contacts.push(Object.freeze({ eclipseKind: event.kind, atMs: event.atMs,
          clock: event.clock, contactKind: event.definition, provenance: snapshotMetadata(event) }));
      }
    }
    return Object.freeze({ ...finish(), status: "complete", events: Object.freeze(contacts) });
  } });
}
