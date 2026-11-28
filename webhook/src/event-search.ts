import { calc } from "../../src/calc.js";
import type { CalcPosition } from "../../src/calc.js";
import { elapsedDays, timeBasis } from "../../src/time-scale.js";
import { searchExactAspects } from "../vendor/events/src/aspects.js";
import { EvaluationContext, SearchInterrupted } from "../vendor/events/src/context.js";
import { searchEclipses } from "../vendor/events/src/eclipses.js";
import { COORDINATES, EngineAdapter, EngineRefused } from "../vendor/events/src/engine.js";
import { searchSignIngresses } from "../vendor/events/src/longitude.js";
import { searchStations } from "../vendor/events/src/stations.js";
import type { SearchResult } from "../vendor/events/src/types.js";
import { parseEventFilter, parseScheduleWindow } from "./subscription.js";
import type { EventBody } from "./types.js";
import { CUSTOM_QUERY_SCHEMA, parseCustomQuery, requiresEclipse } from "./custom-query.js";
import { searchCustom } from "./custom-search.js";
import type {
  DiscoveredEvent, EventDefinition, EventSearchDependencies, EventSearchMetadata,
  EventSearchRequest, EventSearchResult
} from "./event-search-types.js";

export const EVENT_SEARCH_SOURCE = Object.freeze({
  repository: "zodiacs-org/engine",
  commit: "7d6fb88d03b3896ee1e5496ed99961015d291d3c"
} as const);

// calc's speed half-width for the supported planets (src/calc.ts STEP_DAYS).
// The receipt integration test checks this against the engine's speed bound.
const SPEED_HALF_WIDTH_MS = 86_400;

/** Detach results before freezing, including objects supplied by trusted test seams. */
function snapshot<T>(value: T): T {
  function freeze(object: unknown): void {
    if (object !== null && typeof object === "object") {
      for (const child of Object.values(object)) freeze(child);
      Object.freeze(object);
    }
  }
  const result = structuredClone(value);
  freeze(result);
  return result;
}

function record(input: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input) ||
      ![null, Object.prototype].includes(Object.getPrototypeOf(input))) {
    throw new TypeError("Invalid event search options.");
  }
  const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of Reflect.ownKeys(input)) {
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (typeof key !== "string" || !keys.includes(key) || !descriptor?.enumerable || !("value" in descriptor)) {
      throw new TypeError("Invalid event search options.");
    }
    result[key] = descriptor.value;
  }
  return result;
}

function positiveInteger(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new RangeError("Event search steps and budgets must be positive safe integers.");
  }
  return value;
}

function options(input: EventSearchRequest): { search: EventSearchMetadata; signal?: AbortSignal } {
  const value = record(input, ["filter", "window", "stepMs", "maxEvaluations", "signal", "eclipse"]);
  const filter = parseEventFilter(value.filter);
  const window = parseScheduleWindow(value.window);
  const stepMs = positiveInteger(value.stepMs);
  const maxEvaluations = positiveInteger(value.maxEvaluations);
  if (Object.hasOwn(value, "signal") && !(value.signal instanceof AbortSignal)) {
    throw new TypeError("Event search signal must be an AbortSignal.");
  }
  let eclipse: EventSearchMetadata["eclipse"] = null;
  if (requiresEclipse(filter)) {
    const config = record(value.eclipse, ["model", "derivativeStepMs"]);
    const model = record(config.model, ["sunRadiusAu", "moonRadiusAu", "earthRadiusAu"]);
    const { sunRadiusAu, moonRadiusAu, earthRadiusAu } = model;
    if (typeof sunRadiusAu !== "number" || typeof moonRadiusAu !== "number" || typeof earthRadiusAu !== "number" ||
        ![sunRadiusAu, moonRadiusAu, earthRadiusAu].every(n => Number.isFinite(n) && n > 0) ||
        sunRadiusAu <= Math.max(moonRadiusAu, earthRadiusAu)) {
      throw new RangeError("Eclipse search requires explicit positive spherical radii with the Sun largest.");
    }
    eclipse = {
      model: { sunRadiusAu, moonRadiusAu, earthRadiusAu },
      derivativeStepMs: positiveInteger(config.derivativeStepMs)
    };
  } else if (Object.hasOwn(value, "eclipse")) {
    throw new TypeError("Eclipse options require a built-in or custom eclipse filter.");
  }
  let custom: EventSearchMetadata["custom"];
  if (filter.kind === "custom") {
    const query = parseCustomQuery(filter.expression);
    const start = Math.max(Date.parse(window.start), query.range.startMs);
    const end = Math.min(Date.parse(window.end), query.range.endMs);
    custom = { schema: CUSTOM_QUERY_SCHEMA, query, intervals: "refused",
      effectiveWindow: start < end ? { start: new Date(start).toISOString(), end: new Date(end).toISOString() } : null };
  }
  // The fixed grid gives the same interior root brackets for repeated and partitioned scans.
  // A full cell beyond each edge confirms sampled touches and outgoing station motion.
  const padding = stepMs + (eclipse?.derivativeStepMs ?? 0);
  const owned = custom?.effectiveWindow ?? window;
  const startMs = Math.floor((Date.parse(owned.start) - padding) / stepMs) * stepMs;
  const endMs = Math.ceil((Date.parse(owned.end) + padding) / stepMs) * stepMs;
  const search: EventSearchMetadata = snapshot({
    schema: "zodiacs.webhook-search.v1", source: EVENT_SEARCH_SOURCE, filter, window,
    scanWindow: { startMs, endMs, clock: "utc" }, stepMs, gridOriginMs: 0, maxEvaluations,
    eclipse, ownership: "[start,end)", coordinates: COORDINATES,
    completeness: "conditional-on-sampling-assumptions", ...(custom ? { custom } : {})
  });
  return { search, ...(value.signal instanceof AbortSignal ? { signal: value.signal } : {}) };
}

function completed<T>(result: SearchResult<T>): readonly T[] {
  if (result.status === "refused") throw new SearchInterrupted(result.reason);
  return result.events;
}

/** Validate and describe a scan without performing calculations or consuming a budget. */
export function describeEventSearch(input: EventSearchRequest): EventSearchMetadata {
  return options(input).search;
}

/**
 * Synchronous local search. Completion means the prescribed scan finished under the
 * pinned scanners' sampling assumptions, not a certified inventory of sky events.
 * No cursor or outbox mutation takes place here.
 */
export function searchEvents(input: EventSearchRequest, dependencies: EventSearchDependencies = {}): EventSearchResult {
  const { search, signal } = options(input);
  const context = new EvaluationContext(search.scanWindow, {
    maxEvaluations: search.maxEvaluations, ...(signal ? { signal } : {})
  });
  const { filter, window, stepMs } = search;
  const refused = (reason: "cancelled" | "evaluation-budget" | "time-discontinuity" | "unsupported-filter"): EventSearchResult =>
    snapshot({ status: "refused", reason, events: [], search, evaluations: context.evaluations });
  try {
    context.checkpoint();
    if (search.custom?.effectiveWindow === null) {
      return snapshot({ status: "complete", events: [], search, evaluations: 0 });
    }
    // Search inputs use UTC labels. Known steps of the engine's clock violate the
    // scanners' continuity assumptions. Include the speed stencil for stations.
    const station = filter.kind === "station" || search.custom?.query.event.kind === "station";
    const speedGuard = station ? SPEED_HALF_WIDTH_MS : 0;
    if (!Number.isNaN(elapsedDays(
      timeBasis(context.window.startMs - speedGuard, "utc"),
      timeBasis(context.window.endMs + speedGuard, "utc"), Number.NaN
    ))) return refused("time-discontinuity");

    const motion = () => dependencies.motion?.(context) ?? new EngineAdapter(context);
    let definitions: readonly EventDefinition[];
    let bodies: readonly EventBody[];
    switch (filter.kind) {
      case "custom":
        ({ definitions, bodies } = searchCustom(search.custom!.query, search, context, dependencies));
        break;
      case "aspect-exact":
        definitions = completed(searchExactAspects(context, filter.bodies[0],
          { kind: "moving", body: filter.bodies[1] },
          { aspects: [{ id: "subscription", angleDegrees: filter.angle }] }, { stepMs }, motion()));
        bodies = filter.bodies;
        break;
      case "ingress":
        definitions = completed(searchSignIngresses(context, filter.body, { stepMs }, motion()))
          .filter(event => event.toSign.toLowerCase() === filter.sign &&
            (filter.direction === "any" || event.direction === filter.direction));
        bodies = [filter.body];
        break;
      case "station":
        definitions = completed(searchStations(context, filter.body, { stepMs }, motion()))
          .filter(event => filter.direction === "any" || event.direction === filter.direction);
        bodies = [filter.body];
        break;
      case "eclipse": {
        const eclipse = search.eclipse!;
        const provider = dependencies.eclipse?.(context);
        // Share one context for both kinds. Failure of the second discards the first.
        definitions = (filter.type === "any" ? ["solar", "lunar"] as const : [filter.type])
          .flatMap(kind => completed(searchEclipses(context, kind, eclipse.model,
            { stepMs, derivativeStepMs: eclipse.derivativeStepMs }, provider)))
          .sort((a, b) => a.atMs - b.atMs || a.kind.localeCompare(b.kind));
        bodies = ["Sun", "Moon"];
        break;
      }
    }
    const owned = search.custom?.effectiveWindow ?? window;
    const start = Date.parse(owned.start), end = Date.parse(owned.end);
    const calculate = dependencies.calculate ?? calc;
    const events: DiscoveredEvent[] = [];
    for (const definition of definitions) {
      if (definition.atMs < start || definition.atMs >= end) continue;
      const at = new Date(definition.atMs).toISOString();
      const positions: CalcPosition[] = bodies.map(body => context.evaluate(() => {
        const position = calculate({ body, time: at,
          center: COORDINATES.center, frame: COORDINATES.frame, zodiac: COORDINATES.zodiac,
          flags: { correction: COORDINATES.correction, units: COORDINATES.units,
            speeds: station, cartesian: search.eclipse !== null }
        });
        if (position.status === "refused") throw new EngineRefused(position);
        return position;
      }));
      events.push({ kind: filter.kind, at, atMs: definition.atMs, definition, positions });
    }
    context.checkpoint();
    return snapshot({ status: "complete", events, search, evaluations: context.evaluations });
  } catch (error) {
    if (error instanceof SearchInterrupted) return refused(error.reason);
    if (error instanceof EngineRefused) return snapshot({
      status: "refused", reason: "engine-refused", engineRefusal: error.refusal,
      events: [], search, evaluations: context.evaluations
    });
    // Invalid computation/provider output must never turn into an empty completed scan.
    throw error;
  }
}
