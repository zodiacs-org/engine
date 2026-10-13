import { describe, expect, it } from "vitest";
import { searchEvents } from "../src/event-search.js";
import type { DiscoveredEvent, EventSearchRequest } from "../src/event-search-types.js";
import { createOccurrence, occurrencePolicy, stableJson } from "../src/occurrence.js";

const BASE = Date.parse("2000-01-01T12:00:00Z");
const request: EventSearchRequest = {
  filter: { kind: "aspect-exact", bodies: ["Mars", "Sun"], angle: 90 },
  window: { start: new Date(BASE).toISOString(), end: new Date(BASE + 12_000).toISOString() },
  stepMs: 1000, maxEvaluations: 10_000
};
const search = searchEvents(request, { motion: context => ({
  context,
  sample: (body, atMs) => context.evaluate(() => ({
    longitude: (10 + (body === "Mars" ? 0.03 * (atMs - BASE) : 0) + 360) % 360,
    speedDegreesPerDay: body === "Mars" ? 2_592_000 : 0
  }))
}) });
const policy = occurrencePolicy(search.search);
const first = search.events[0]!;

describe("stable occurrence identity and payloads", () => {
  it("preserves full definitions, positions and receipts without subscription or scan bookkeeping", () => {
    expect(search.status).toBe("complete");
    expect(search.events).toHaveLength(2);
    const value = createOccurrence("sub-a", first, policy);
    expect(JSON.parse(value.payload)).toEqual({
      schema: "zodiacs.webhook-event.v1", id: value.id, occurrenceKey: value.occurrenceKey,
      idempotencyKey: value.idempotencyKey, subscriptionId: "sub-a", event: first, policy
    });
    expect(value.occurredAt).toBe(first.atMs);
    expect(JSON.parse(value.payload).event.positions[0].receipt.schema).toBe("zodiacs.calc-receipt.v1");
    expect(policy).not.toHaveProperty("window");
    expect(policy).not.toHaveProperty("scanWindow");
    expect(policy).not.toHaveProperty("maxEvaluations");
    expect(policy).not.toHaveProperty("filter");
    expect(createOccurrence("sub-a", first, occurrencePolicy({ ...search.search,
      window: { start: first.at, end: new Date(first.atMs + 1).toISOString() },
      maxEvaluations: 100_000, filter: { kind: "eclipse", type: "any" }
    }))).toEqual(value);
  });

  it("separates subscriptions, opposite branches, event times and numerical policies", () => {
    const a = createOccurrence("sub-a", first, policy);
    const b = createOccurrence("sub-b", first, policy);
    expect(b.occurrenceKey).toBe(a.occurrenceKey);
    expect(b.id).not.toBe(a.id);
    expect(b.idempotencyKey).not.toBe(a.idempotencyKey);
    const otherBranch: DiscoveredEvent = { ...search.events[1]!, at: first.at, atMs: first.atMs,
      definition: { ...search.events[1]!.definition, atMs: first.atMs } };
    expect(createOccurrence("sub-a", otherBranch, policy).occurrenceKey).not.toBe(a.occurrenceKey);
    expect(createOccurrence("sub-a", { ...first, atMs: first.atMs + 1 }, policy).occurrenceKey)
      .not.toBe(a.occurrenceKey);
    expect(createOccurrence("sub-a", first, { ...policy, stepMs: 2000 }).occurrenceKey).not.toBe(a.occurrenceKey);
  });

  it("keeps identity when numerical details change so storage detects a payload conflict", () => {
    const original = createOccurrence("sub-a", first, policy);
    const event: DiscoveredEvent = { ...first, definition: { ...first.definition,
      bracket: [first.atMs - 1, first.atMs + 1]
    } };
    const changed = createOccurrence("sub-a", event, policy);
    expect(changed.id).toBe(original.id);
    expect(changed.idempotencyKey).toBe(original.idempotencyKey);
    expect(changed.occurrenceKey).toBe(original.occurrenceKey);
    expect(changed.payload).not.toBe(original.payload);
  });

  it("canonicalizes object order but preserves array order and finite numerical precision", () => {
    const reversed = Object.fromEntries(Object.entries(first).reverse()) as unknown as DiscoveredEvent;
    expect(createOccurrence("sub-a", reversed, policy)).toEqual(createOccurrence("sub-a", first, policy));
    const value = { x: 1.0000000000000002, a: [{ y: 2, x: 1 }, null, "☾"] };
    expect(JSON.parse(stableJson(value))).toEqual(value);
    expect(stableJson(value)).toBe(stableJson({ a: [{ x: 1, y: 2 }, null, "☾"], x: value.x }));
    expect(stableJson([1, 2])).not.toBe(stableJson([2, 1]));
    for (const invalid of [NaN, Infinity, undefined, { x: undefined }, [undefined], new Date()]) {
      expect(() => stableJson(invalid)).toThrow(TypeError);
    }
  });
});
