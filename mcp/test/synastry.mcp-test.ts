import { describe, expect, it } from "vitest";
import { z } from "zod";
import { natalChart, synastry } from "@zodiacs/engine";
import { natalReplayInput, parseNatalEnvelope } from "@zodiacs/engine/receipt";
import { chartReceipt, toJson } from "../src/serialization.js";
import { synastryOutputSchema, synastryTool } from "../src/tools/synastry.js";

const first = { utc: "2000-02-03T04:05:06.123+05:30", latitude: 12, longitude: 34 };
const second = { utc: "2003-07-08T09:10:11.456-04:00", latitude: -23, longitude: -45 };

describe("synastry tool", () => {
  it.each([
    { first, second },
    { first: { utc: first.utc }, second: { utc: second.utc } },
    { first: { ...first, timeKnown: false }, second },
    { first, second: { ...second, timeKnown: false } },
    { first: { ...first, timeScale: "tt" as const, deltaT: 42 }, second: { ...second, timeScale: "ut1" as const } },
    { first: { ...first, latitude: 78, houseSystem: "placidus" as const }, second: { ...second, houseSystem: "equal" as const } }
  ])("preserves native pair summary, charts and receipts for %j", (input) => {
    const original = structuredClone(input);
    const a = natalChart(input.first);
    const b = natalChart(input.second);
    const result = synastryTool(input);
    expect(input).toEqual(original);
    expect(result.structuredContent.data.synastry).toEqual(toJson(synastry(a, b)));
    expect(result.structuredContent.receipts).toEqual([
      chartReceipt("first-natal", a, input.first.utc), chartReceipt("second-natal", b, input.second.utc)
    ]);
    expect(JSON.parse(result.content[0]!.text)).toEqual(result.structuredContent);
    expect(synastryOutputSchema.parse(result.structuredContent)).toEqual(result.structuredContent);
    for (const [index, receipt] of result.structuredContent.receipts.entries()) {
      const parsed = parseNatalEnvelope(JSON.stringify(receipt.envelope));
      expect(parsed.ok).toBe(true);
      if (parsed.ok) {
        const replay = natalChart(natalReplayInput(parsed.envelope));
        const chart = index === 0 ? a : b;
        expect(toJson(replay.bodies)).toEqual(toJson(chart.bodies));
        expect(toJson(replay.houses)).toEqual(toJson(chart.houses));
        expect(replay.flags).toEqual(chart.flags);
      }
    }
  });
  it("keeps chart identity when reversed and aspect longitudes tied to their charts", () => {
    for (const input of [{ first, second }, { first: second, second: first }]) {
      const pair = synastryTool(input).structuredContent.data.synastry;
      expect(pair.a.input.utc).toBe(new Date(input.first.utc).toISOString());
      expect(pair.b.input.utc).toBe(new Date(input.second.utc).toISOString());
      expect(pair.aspects.length).toBeGreaterThan(0);
      for (const aspect of pair.aspects) {
        expect(aspect.aLon).toBe(pair.a.bodies.find((body) => body.body === aspect.a)!.lon);
        expect(aspect.bLon).toBe(pair.b.bodies.find((body) => body.body === aspect.b)!.lon);
      }
      expect(pair.easeful).toBe(pair.counts.trine + pair.counts.sextile);
      expect(pair.charged).toBe(pair.counts.square + pair.counts.opposition);
      expect(pair).not.toHaveProperty("score");
    }
  });
  it("keeps coverage flags independent and supports identical charts", () => {
    const pair = synastryTool({ first: { utc: "1700-03-04T00:00:00Z" }, second }).structuredContent.data.synastry;
    expect(pair.a.flags).toContain("outside-reference-span");
    expect(pair.b.flags).not.toContain("outside-reference-span");
    const identical = synastryTool({ first, second: first }).structuredContent.data.synastry;
    expect(identical.a).toEqual(identical.b);
    expect(identical).toEqual(toJson(synastry(natalChart(first), natalChart(first))));
  });
  it.each([{}, { first }, { second }, { first, second, score: true },
    { first: { ...first, latitude: 91 }, second },
    { first, second: { utc: "2003-02-30T00:00:00Z" } },
    { first: { utc: first.utc, latitude: 0 }, second },
    { first, second: { ...second, timeKnown: null } }
  ])("rejects invalid requests %j", (input) => {
    expect(() => synastryTool(input)).toThrow(z.ZodError);
  });
  it("propagates engine range errors for either birth", () => {
    const outside = { utc: "0000-01-01T00:00:00Z" };
    expect(() => synastryTool({ first: outside, second })).toThrow(RangeError);
    expect(() => synastryTool({ first, second: outside })).toThrow(RangeError);
  });
  it("exports concrete JSON Schema and rejects malformed summaries and added scores", () => {
    expect(z.toJSONSchema(synastryOutputSchema).properties?.data)
      .toHaveProperty("properties.synastry.properties.elements.properties.a.properties.fire");
    const result = synastryTool({ first, second }).structuredContent;
    const damaged = structuredClone(result);
    damaged.data.synastry.aspects[0]!.aLon = 360;
    expect(synastryOutputSchema.safeParse(damaged).success).toBe(false);
    damaged.data.synastry = { ...result.data.synastry, counts: { ...result.data.synastry.counts, square: -1 } };
    expect(synastryOutputSchema.safeParse(damaged).success).toBe(false);
    expect(synastryOutputSchema.safeParse({ ...result,
      data: { synastry: { ...result.data.synastry, score: 100 } } }).success).toBe(false);
  });
});
