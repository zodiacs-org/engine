import { describe, expect, it } from "vitest";
import { z } from "zod";
import { moonPhase, natalChart, searchLongitudeCrossings } from "@zodiacs/engine";
import { natalReplayInput, parseNatalEnvelope } from "@zodiacs/engine/receipt";
import { bodySchema } from "../src/contracts.js";
import { chartReceipt, toJson } from "../src/serialization.js";
import { EVENT_DEFAULT_MAX_SAMPLES, EVENT_STEP_DAYS, eventSearchOutputSchema, eventSearchTool,
  moonPhaseOutputSchema, moonPhaseTool } from "../src/tools/events.js";

const from = "2026-01-01T00:00:00+02:00";
const to = "2026-02-01T00:00:00+02:00";
function replay(receipts: ReturnType<typeof chartReceipt>[]) {
  for (const receipt of receipts) {
    const parsed = parseNatalEnvelope(JSON.stringify(receipt.envelope));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      const chart = natalChart(natalReplayInput(parsed.envelope));
      expect(chartReceipt(receipt.role, chart).envelope.result).toEqual(receipt.envelope.result);
    }
  }
}

describe("Moon phase", () => {
  it.each([from, "2026-01-10T12:34:56.789-04:00", "2026-01-18T00:00:00Z",
    "2026-01-26T00:00:00Z", "1700-01-01T00:00:00Z"])("preserves phase and sky receipt at %s", (at) => {
    const result = moonPhaseTool({ at });
    expect(result.structuredContent.data.phase).toEqual(toJson(moonPhase(at)));
    expect(result.structuredContent.data.sky).toEqual(toJson(natalChart({ utc: at })));
    expect(result.structuredContent.receipts).toEqual([chartReceipt("phase-sky", natalChart({ utc: at }), at)]);
    expect(JSON.parse(result.content[0]!.text)).toEqual(result.structuredContent);
    expect(moonPhaseOutputSchema.parse(result.structuredContent)).toEqual(result.structuredContent);
    replay(result.structuredContent.receipts);
  });
  it("retains coverage flags", () => {
    expect(moonPhaseTool({ at: "1700-01-01T00:00:00Z" }).structuredContent.data.sky.flags).toContain("outside-reference-span");
  });
  it.each([{}, { at: "2026-02-30T00:00:00Z" }, { at: from, location: {} }])("rejects %j", (input) => {
    expect(() => moonPhaseTool(input)).toThrow(z.ZodError);
  });
  it("exports concrete schema and refuses damaged results and unsupported dates", () => {
    expect(z.toJSONSchema(moonPhaseOutputSchema).properties?.data).toHaveProperty("properties.phase.properties.illumination");
    const damaged = moonPhaseTool({ at: from }).structuredContent;
    damaged.data.phase.illumination = 2;
    expect(moonPhaseOutputSchema.safeParse(damaged).success).toBe(false);
    expect(() => moonPhaseTool({ at: "0000-01-01T00:00:00Z" })).toThrow(RangeError);
  });
});

describe("bounded event search", () => {
  it.each(bodySchema.options)("preserves native scan for %s", (body) => {
    const input = { body, longitude: 0, from, to };
    const result = eventSearchTool(input);
    const expected = searchLongitudeCrossings(body, 0, new Date(from), new Date(to), {
      stepDays: EVENT_STEP_DAYS, maxSamples: EVENT_DEFAULT_MAX_SAMPLES
    });
    expect(result.structuredContent.data.search).toEqual(toJson(expected));
    expect(result.structuredContent.data.request).toEqual(input);
    expect(result.structuredContent.data.policy).toEqual({ stepDays: 0.25, maxSamples: 10000, interval: "(from,to]", completeness: "not-proven" });
    expect(result.structuredContent.receipts.slice(0, 2)).toEqual([
      chartReceipt("search-start", natalChart({ utc: from }), from), chartReceipt("search-end", natalChart({ utc: to }), to)
    ]);
    expect(result.structuredContent.receipts.slice(2)).toEqual(expected.crossings.map((crossing, index) => {
      const at = crossing.at.toISOString();
      return chartReceipt(`event-${index + 1}`, natalChart({ utc: at }), at);
    }));
    replay(result.structuredContent.receipts);
    expect(JSON.parse(result.content[0]!.text)).toEqual(result.structuredContent);
  });
  it("preserves direct and retrograde events in order with matching chart receipts", () => {
    const input = { body: "Mercury" as const, longitude: 350, from: "2026-02-01T00:00:00Z", to: "2026-04-15T00:00:00Z" };
    const data = eventSearchTool(input).structuredContent.data.search;
    expect(data.status).toBe("complete");
    expect(data.crossings.some((c) => c.retrograde)).toBe(true);
    expect(data.crossings.some((c) => !c.retrograde)).toBe(true);
    expect(data.crossings.map((c) => c.at)).toEqual(data.crossings.map((c) => c.at).sort());
  });
  it("returns whole refusals for coarse and refinement budgets", () => {
    for (const input of [
      { body: "Moon", longitude: 0, from, to, maxSamples: 1 },
      { body: "Sun", longitude: 0, from: "2026-03-19T00:00:00Z", to: "2026-03-22T00:00:00Z", maxSamples: 13 }
    ]) {
      const result = eventSearchTool(input).structuredContent;
      expect(result.data.search).toEqual(toJson(searchLongitudeCrossings(input.body as "Sun" | "Moon", input.longitude,
        new Date(input.from), new Date(input.to), { stepDays: EVENT_STEP_DAYS, maxSamples: input.maxSamples })));
      expect(result.data.search.status).toBe("refused");
      expect(result.data.search.crossings).toEqual([]);
      expect(result.receipts.map((r) => r.role)).toEqual(["search-start", "search-end"]);
    }
  });
  it("accepts empty and maximum windows with bounded work and endpoint provenance", () => {
    const empty = eventSearchTool({ body: "Sun", longitude: 0, from, to: from, maxSamples: 1 }).structuredContent;
    expect(empty.data.search).toEqual({ status: "complete", crossings: [], samples: 0 });
    expect(empty.receipts).toHaveLength(2);
    const full = eventSearchTool({ body: "Sun", longitude: 0, from: "2024-01-01T00:00:00Z", to: "2025-01-01T00:00:00Z" }).structuredContent;
    expect(full.data.search.status).toBe("complete");
    expect(full.data.search.samples).toBeLessThanOrEqual(EVENT_DEFAULT_MAX_SAMPLES);
    const historic = eventSearchTool({ body: "Sun", longitude: 0, from: "1700-01-01T00:00:00Z", to: "1700-01-01T00:00:00Z" });
    replay(historic.structuredContent.receipts);
  });
  it.each([{ body: "Earth" }, { longitude: 360 }, { maxSamples: 100001 }, { maxSamples: 0 },
    { to: "2028-01-01T00:00:00Z" }, { to: "2025-01-01T00:00:00Z" }, { stepDays: 1 }, { from: "2026-01-01" }])("rejects invalid search %j", (change) => {
    expect(() => eventSearchTool({ body: "Sun", longitude: 0, from, to, ...change })).toThrow(z.ZodError);
  });
  it("validates endpoints even for empty windows or coarse refusal", () => {
    const outside = "0000-01-01T00:00:00Z";
    expect(() => eventSearchTool({ body: "Sun", longitude: 0, from: outside, to: outside })).toThrow(RangeError);
    expect(() => eventSearchTool({ body: "Sun", longitude: 0, from: "3998-09-01T00:00:00Z", to: "3998-09-04T00:00:00Z", maxSamples: 1 })).toThrow(RangeError);
  });
  it("exports discriminated JSON Schema and rejects damaged refusal output", () => {
    expect(z.toJSONSchema(eventSearchOutputSchema).properties?.data).toHaveProperty("properties.search.oneOf");
    const result = eventSearchTool({ body: "Sun", longitude: 0, from, to, maxSamples: 1 }).structuredContent;
    expect(eventSearchOutputSchema.parse(result)).toEqual(result);
    expect(eventSearchOutputSchema.safeParse({ ...result, data: { ...result.data,
      search: { status: "refused", reason: "sample-budget", samples: 1, maxSamples: 1, crossings: [{ at: from, retrograde: false }] }
    } }).success).toBe(false);
  });
});
