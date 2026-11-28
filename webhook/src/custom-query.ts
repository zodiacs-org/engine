import { parseQuery, QUERY_ASPECTS } from "../vendor/events/src/query.js";
import type { EventQuery } from "../vendor/events/src/query.js";
import type { EventDefinition } from "./event-search-types.js";
import type { EventFilter } from "./types.js";

export const CUSTOM_QUERY_SCHEMA = "zodiacs.webhook-custom.v1" as const;

export type CustomQuery = EventQuery & {
  readonly mode: "all";
  readonly range: NonNullable<EventQuery["range"]>;
  readonly event: Exclude<EventQuery["event"], { kind: "retrograde" | "void-of-course" }>;
};

/** No evaluation. Subscription validation translates all failures to a fixed field error. */
export function parseCustomQuery(expression: string): CustomQuery {
  const query = parseQuery(expression);
  if (query.mode !== "all" || query.range === null || (query.clock !== null && query.clock !== "utc") ||
      query.event.kind === "retrograde" || query.event.kind === "void-of-course" ||
      (query.event.kind === "aspect" && query.event.target.kind !== "moving") ||
      (query.event.kind === "station" && (query.event.body === "Sun" || query.event.body === "Moon"))) {
    throw new TypeError("Unsupported webhook query semantics.");
  }
  return query as CustomQuery;
}

export function requiresEclipse(filter: EventFilter): boolean {
  return filter.kind === "eclipse" ||
    (filter.kind === "custom" && parseCustomQuery(filter.expression).event.kind === "eclipse");
}

/** Verify owned point results at the worker boundary; interval endpoints are never inferred. */
export function customQueryMatches(query: CustomQuery, definition: EventDefinition): boolean {
  if (definition.atMs < query.range.startMs || definition.atMs >= query.range.endMs) return false;
  const event = query.event;
  switch (event.kind) {
    case "aspect": return definition.kind === "exact-aspect" && definition.body === event.body &&
      definition.target.kind === "moving" && definition.target.body === event.target.body &&
      definition.aspect.id === event.aspect && definition.aspect.angleDegrees === QUERY_ASPECTS[event.aspect];
    case "ingress": return definition.kind === "sign-ingress" && definition.body === event.body &&
      (event.sign === null || definition.toSign === event.sign);
    case "station": return definition.kind === "station" && definition.body === event.body &&
      (event.direction === null || definition.direction === event.direction);
    case "eclipse": return definition.kind === event.eclipse;
  }
}
