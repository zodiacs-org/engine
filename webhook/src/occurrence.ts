import { createHash } from "node:crypto";
import { ENGINE_VERSION, EPHEMERIS } from "../../src/types.js";
import type { DiscoveredEvent, EventDefinition, EventSearchMetadata } from "./event-search-types.js";
import type { NewEvent } from "./storage-types.js";

/** Canonical object ordering for this service's JSON data, not a general JSON signing standard. */
export function stableJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${Array.from(value, item => stableJson(item)).join(",")}]`;
  if (value && typeof value === "object" && [Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
  }
  throw new TypeError("Webhook occurrence requires JSON data.");
}

export function digest(value: unknown): string {
  return createHash("sha256").update(stableJson(value), "utf8").digest("hex");
}

/** Excludes filter selection and operating budgets, which do not define a root. */
export function occurrencePolicy(search: EventSearchMetadata) {
  return {
    schema: "zodiacs.webhook-occurrence-policy.v1" as const,
    source: search.source,
    engine: { name: "@zodiacs/engine", version: ENGINE_VERSION, ephemeris: EPHEMERIS },
    runtime: { node: process.versions.node, v8: process.versions.v8, arch: process.arch, platform: process.platform },
    stepMs: search.stepMs, gridOriginMs: search.gridOriginMs, eclipse: search.eclipse,
    ownership: search.ownership, coordinates: search.coordinates, completeness: search.completeness
  };
}

function definitionIdentity(definition: EventDefinition): unknown {
  // Brackets, residuals and calculated geometry belong in the immutable payload,
  // not in the identity. A mismatch must conflict instead of creating a new event.
  switch (definition.kind) {
    case "exact-aspect": return {
      kind: definition.kind, body: definition.body, target: definition.target,
      angle: definition.aspect.angleDegrees, branch: definition.relativeLongitude, direction: definition.direction
    };
    case "sign-ingress": return {
      kind: definition.kind, body: definition.body, longitude: definition.longitude,
      fromSign: definition.fromSign, toSign: definition.toSign, direction: definition.direction
    };
    case "station": return { kind: definition.kind, body: definition.body, direction: definition.direction };
    case "solar": case "lunar": return { kind: definition.kind, definition: definition.definition };
  }
}

/** Same event and fixed numerical policy produce identical bytes across scan partitions and revisions. */
export function createOccurrence(subscriptionId: string, event: DiscoveredEvent,
  policy: ReturnType<typeof occurrencePolicy>): NewEvent {
  const occurrenceKey = `occ_v1_${digest({ policy, atMs: event.atMs, definition: definitionIdentity(event.definition) })}`;
  const deliveryDigest = digest({ schema: "zodiacs.webhook-delivery.v1", subscriptionId, occurrenceKey });
  const id = `evt_v1_${deliveryDigest}`;
  const idempotencyKey = `wh_v1_${deliveryDigest}`;
  const payload = stableJson({
    schema: "zodiacs.webhook-event.v1", id, occurrenceKey, idempotencyKey, subscriptionId, event, policy
  });
  return { id, occurrenceKey, idempotencyKey, occurredAt: event.atMs, payload };
}
