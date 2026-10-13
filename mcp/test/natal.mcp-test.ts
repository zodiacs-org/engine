import { describe, expect, it } from "vitest";
import { z } from "zod";
import { natalChart } from "@zodiacs/engine";
import { createNatalEnvelope, natalReplayInput, parseNatalEnvelope } from "@zodiacs/engine/receipt";
import { natalChartTool, natalOutputSchema } from "../src/tools/natal.js";
import { toJson } from "../src/serialization.js";

const birth = { utc: "2000-02-03T04:05:06.123+05:30", latitude: 12, longitude: 34 };

describe("natal chart tool", () => {
  it.each([
    birth,
    { utc: birth.utc },
    { ...birth, timeKnown: false },
    { ...birth, latitude: 78, longitude: 15, houseSystem: "placidus" as const },
    { ...birth, timeScale: "tt" as const, deltaT: 42 },
    { ...birth, timeScale: "ut1" as const },
    { utc: "1700-02-03T04:05:06Z" }
  ])("preserves the native chart and replayable receipt for %j", (input) => {
    const expected = natalChart(input);
    const result = natalChartTool({ birth: input });
    expect(result.structuredContent.data.chart).toEqual(toJson(expected));
    expect(result.structuredContent.receipts).toEqual([
      { role: "natal", envelope: toJson(createNatalEnvelope(expected, { sourceInstant: input.utc })) }
    ]);
    expect(JSON.parse(result.content[0]!.text)).toEqual(result.structuredContent);
    expect(natalOutputSchema.parse(result.structuredContent)).toEqual(result.structuredContent);
    const parsed = parseNatalEnvelope(JSON.stringify(result.structuredContent.receipts[0]!.envelope));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      // The native replay codec explicitly supplies an empty assertion list.
      const replay = natalChart(natalReplayInput(parsed.envelope));
      expect(replay.input).toEqual({ ...expected.input, flags: [] });
      expect(toJson({ ...replay, input: expected.input })).toEqual(toJson(expected));
    }
  });
  it("keeps unknown time at the supplied reference instant and suppresses houses", () => {
    const chart = natalChartTool({ birth: { ...birth, timeKnown: false } }).structuredContent.data.chart;
    expect(chart.input.utc).toBe(new Date(birth.utc).toISOString());
    expect(chart.angles).toBeNull();
    expect(chart.houses).toBeNull();
    expect(chart.flags).toContain("no-time");
  });
  it("distinguishes requested houses from polar fallback and retains coverage flags", () => {
    const chart = natalChartTool({ birth: { ...birth, latitude: 78, houseSystem: "placidus" } }).structuredContent.data.chart;
    expect(chart.input.houseSystem).toBe("placidus");
    expect(chart.houses?.system).toBe("whole");
    expect(chart.flags).toContain("polar-fallback");
    expect(natalChartTool({ birth: { utc: "1700-02-03T04:05:06Z" } }).structuredContent.data.chart.flags)
      .toContain("outside-reference-span");
  });
  it.each([{}, { birth: { ...birth, latitude: 91 } }, { birth: { utc: birth.utc, latitude: 0 } },
    { birth: { ...birth, utc: "2000-02-30T00:00:00Z" } }, { birth, name: "extra" }])("rejects invalid request %j", (input) => {
    expect(() => natalChartTool(input)).toThrow(z.ZodError);
  });
  it("propagates engine range errors without returning a receipt", () => {
    expect(() => natalChartTool({ birth: { utc: "0000-01-01T00:00:00Z" } })).toThrow(RangeError);
  });
  it("exports a concrete JSON Schema and rejects damaged output", () => {
    const schema = z.toJSONSchema(natalOutputSchema);
    expect(schema.properties?.data).toHaveProperty("properties.chart.properties.bodies");
    const result = natalChartTool({ birth }).structuredContent;
    expect(natalOutputSchema.safeParse({ ...result, data: { chart: {} } }).success).toBe(false);
    const damaged = structuredClone(result);
    damaged.data.chart.bodies[0]!.lon = 360;
    expect(natalOutputSchema.safeParse(damaged).success).toBe(false);
    expect(() => natalChartTool({ birth })).not.toThrow();
  });
});
