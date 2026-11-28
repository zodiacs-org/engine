import { describe, expect, it } from "vitest";
import { z } from "zod";
import { natalChart } from "@zodiacs/engine";
import { lunarReturn, solarReturn } from "@zodiacs/engine/techniques";
import { natalReplayInput, parseNatalEnvelope } from "@zodiacs/engine/receipt";
import { chartReceipt, toJson } from "../src/serialization.js";
import { lunarReturnOutputSchema, lunarReturnTool, solarReturnOutputSchema, solarReturnTool } from "../src/tools/returns.js";

const birth = { utc: "2000-02-03T04:05:06.123+05:30", latitude: 12, longitude: 34 };
const at = "2026-03-04T05:06:07.890-04:00";
const cases = [
  { birth },
  { birth: { utc: birth.utc } },
  { birth, location: null },
  { birth, location: { latitude: -23, longitude: -45 }, houseSystem: "equal" as const },
  { birth: { ...birth, latitude: 78, houseSystem: "placidus" as const } },
  { birth: { ...birth, timeScale: "tt" as const, deltaT: 42 } },
  { birth: { ...birth, timeScale: "ut1" as const } }
];

describe.each(["solar", "lunar"] as const)("%s return tool", (kind) => {
  it.each(cases)("preserves native output and replayable receipts for %j", (options) => {
    const original = structuredClone(options);
    const natal = natalChart(options.birth);
    const { birth: _birth, ...returnOptions } = options;
    const expected = kind === "solar" ? solarReturn(natal, at, returnOptions) : lunarReturn(natal, at, returnOptions);
    const result = kind === "solar" ? solarReturnTool({ ...options, near: at }) : lunarReturnTool({ ...options, after: at });
    expect(options).toEqual(original);
    expect(result.structuredContent.data.return).toEqual(toJson(expected));
    expect(result.structuredContent.receipts).toEqual([
      chartReceipt("natal", natal, options.birth.utc),
      chartReceipt(`${kind}-return`, expected.chart, expected.instant.toISOString())
    ]);
    expect(JSON.parse(result.content[0]!.text)).toEqual(result.structuredContent);
    const schema = kind === "solar" ? solarReturnOutputSchema : lunarReturnOutputSchema;
    expect(schema.parse(result.structuredContent)).toEqual(result.structuredContent);
    for (const receipt of result.structuredContent.receipts) {
      const parsed = parseNatalEnvelope(JSON.stringify(receipt.envelope));
      expect(parsed.ok).toBe(true);
      if (parsed.ok) {
        const replay = natalChart(natalReplayInput(parsed.envelope));
        const chart = receipt.role === "natal" ? natal : expected.chart;
        expect(toJson(replay.bodies)).toEqual(toJson(chart.bodies));
        expect(toJson(replay.houses)).toEqual(toJson(chart.houses));
        expect(replay.flags).toEqual(chart.flags);
      }
    }
    expect(result.structuredContent.data.return.chart.timeScale.input).toBe("utc");
    expect(result.structuredContent.data.return.chart.deltaT.model).not.toBe("pinned");
  });
  it("exports a concrete JSON Schema and rejects malformed output", () => {
    const schema = kind === "solar" ? solarReturnOutputSchema : lunarReturnOutputSchema;
    expect(z.toJSONSchema(schema).properties?.data).toHaveProperty("properties.return.properties.natalLongitude");
    const result = kind === "solar" ? solarReturnTool({ birth, near: at }) : lunarReturnTool({ birth, after: at });
    const damaged = structuredClone(result.structuredContent);
    damaged.data.return.natalLongitude = 360;
    expect(schema.safeParse(damaged).success).toBe(false);
    expect(schema.safeParse({ ...result.structuredContent, data: { return: { ...result.structuredContent.data.return, score: 100 } } }).success).toBe(false);
  });
  it.each([
    {}, { birth }, { birth, date: at },
    { birth, near: at, after: at },
    { birth, near: at, after: at, location: { latitude: 91, longitude: 0 } }
  ])("rejects invalid requests %j", (request) => {
    expect(() => kind === "solar" ? solarReturnTool(request) : lunarReturnTool(request)).toThrow(z.ZodError);
  });
  it("rejects invalid dates and options and propagates range failures", () => {
    const invoke = (extra: Record<string, unknown>) => kind === "solar"
      ? solarReturnTool({ birth, near: at, ...extra }) : lunarReturnTool({ birth, after: at, ...extra });
    expect(() => invoke({ location: { latitude: 0 } })).toThrow(z.ZodError);
    expect(() => invoke({ houseSystem: "invalid" })).toThrow(z.ZodError);
    expect(() => invoke({ [kind === "solar" ? "near" : "after"]: "2026-02-30T00:00:00Z" })).toThrow(z.ZodError);
    expect(() => invoke({ birth: { utc: "0000-01-01T00:00:00Z" } })).toThrow(RangeError);
    expect(() => invoke({ [kind === "solar" ? "near" : "after"]: "3998-09-01T00:00:00Z" })).toThrow(RangeError);
  });
  it("keeps search-window coverage separate from return-chart coverage", () => {
    const anchor = "1800-01-02T00:00:00Z";
    const oldBirth = { utc: "1799-02-03T00:00:00Z" };
    const result = kind === "solar" ? solarReturnTool({ birth: oldBirth, near: anchor }) : lunarReturnTool({ birth: oldBirth, after: anchor });
    expect(result.structuredContent.data.return.flags).toContain("outside-reference-span");
    expect(result.structuredContent.data.return.chart.flags).not.toContain("outside-reference-span");
  });
});

describe("return selection and casting", () => {
  it("supports both solar selections and defaults to nearest", () => {
    expect(solarReturnTool({ birth, near: at })).toEqual(solarReturnTool({ birth, near: at, selection: "nearest" }));
    const recent = solarReturnTool({ birth, near: at, selection: "most-recent" }).structuredContent.data.return;
    expect(recent.selection).toBe("most-recent");
    expect(Date.parse(recent.instant)).toBeLessThanOrEqual(Date.parse(at));
    expect(recent).toEqual(toJson(solarReturn(natalChart(birth), at, { selection: "most-recent" })));
    expect(() => solarReturnTool({ birth, near: at, selection: "next" })).toThrow(z.ZodError);
  });
  it("preserves location defaults, explicit null and house overrides", () => {
    const defaultResult = lunarReturnTool({ birth, after: at }).structuredContent.data.return;
    expect(defaultResult.location).toEqual({ latitude: birth.latitude, longitude: birth.longitude });
    const relocated = solarReturnTool({ birth, near: at, location: { latitude: 78, longitude: 15 }, houseSystem: "placidus" }).structuredContent.data.return;
    expect(relocated.chart.input.houseSystem).toBe("placidus");
    expect(relocated.chart.houses?.system).toBe("whole");
    expect(relocated.chart.flags).toContain("polar-fallback");
    for (const result of [solarReturnTool({ birth, near: at, location: null }), lunarReturnTool({ birth: { utc: birth.utc }, after: at })]) {
      expect(result.structuredContent.data.return.location).toBeNull();
      expect(result.structuredContent.data.return.chart.houses).toBeNull();
      expect(result.structuredContent.data.return.chart.angles).toBeNull();
    }
  });
  it("allows unknown time for solar, refuses it for lunar and refuses after before birth", () => {
    expect(solarReturnTool({ birth: { ...birth, timeKnown: false }, near: at }).structuredContent.data.return.chart.input.timeKnown).toBe(true);
    expect(() => lunarReturnTool({ birth: { ...birth, timeKnown: false }, after: at })).toThrow(/known, unambiguous/);
    expect(() => lunarReturnTool({ birth, after: "1999-01-01T00:00:00Z" })).toThrow(/must not precede/);
  });
  it("selects a lunar instant strictly after the supplied anchor, including birth", () => {
    for (const after of [birth.utc, at]) {
      const result = lunarReturnTool({ birth, after }).structuredContent.data.return;
      expect(Date.parse(result.instant)).toBeGreaterThan(Date.parse(after));
      expect(result).toEqual(toJson(lunarReturn(natalChart(birth), after)));
    }
  });
});
