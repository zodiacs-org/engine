import { EvaluationContext, SearchInterrupted } from "../vendor/events/src/context.js";
import { EclipseEngineAdapter } from "../vendor/events/src/eclipses.js";
import { EngineAdapter, EngineRefused } from "../vendor/events/src/engine.js";
import { executeQuery } from "../vendor/events/src/search.js";
import type { CustomQuery } from "./custom-query.js";
import type { EventDefinition, EventSearchDependencies, EventSearchMetadata } from "./event-search-types.js";
import type { EventBody } from "./types.js";

/** Execute the pinned dispatcher on the adapter's padded window and shared budget. */
export function searchCustom(query: CustomQuery, search: EventSearchMetadata,
  context: EvaluationContext, dependencies: EventSearchDependencies): {
    definitions: readonly EventDefinition[]; bodies: readonly EventBody[];
  } {
  // The upstream executor redacts engine refusals. Preserve the original object
  // at the local provider seam for the service's existing refusal envelope.
  let engineFailure: EngineRefused | undefined;
  function preserve<T>(run: () => T): T {
    try { return run(); } catch (error) {
      if (error instanceof EngineRefused) engineFailure = error;
      throw error;
    }
  }
  const result = executeQuery(query, {
    clock: "utc", stepMs: search.stepMs, maxEvaluations: search.maxEvaluations,
    ...(search.eclipse ? { eclipse: search.eclipse } : {})
  }, {
    motion: shared => {
      const provider = dependencies.motion?.(shared) ?? new EngineAdapter(shared);
      if (provider.context !== shared) throw new TypeError("Provider must share the search context.");
      return { context: shared, sample: (body, atMs, speed) => preserve(() => provider.sample(body, atMs, speed)) };
    },
    eclipse: shared => {
      const provider = dependencies.eclipse?.(shared) ?? new EclipseEngineAdapter(shared);
      return { sample: atMs => preserve(() => provider.sample(atMs)) };
    }
  }, context);
  if (result.status === "refused") {
    if (result.reason === "engine-refused") {
      if (engineFailure) throw engineFailure;
      throw new Error("Missing engine refusal from the query provider.");
    }
    throw new SearchInterrupted(result.reason);
  }
  if (result.unresolved.length !== 0 || result.events.some(event => !("atMs" in event))) {
    throw new Error("Unsupported interval result from a point query.");
  }
  const event = query.event;
  const bodies: readonly EventBody[] = event.kind === "aspect" ? [event.body, event.target.body]
    : event.kind === "eclipse" ? ["Sun", "Moon"] : [event.body];
  return { definitions: result.events as readonly EventDefinition[], bodies };
}
