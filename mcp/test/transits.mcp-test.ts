import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { natalChart, transits } from "@zodiacs/engine";
import { natalReplayInput, parseNatalEnvelope } from "@zodiacs/engine/receipt";
import { transitsAtTool, transitsNowTool, transitOutputSchema } from "../src/tools/transits.js";
import { chartReceipt, toJson } from "../src/serialization.js";

const birth = { utc: "2000-02-03T04:05:06.123+05:30", latitude: 12, longitude: 34 };
const at = "2026-03-04T05:06:07.890-04:00";

describe("transit tools", () => {
  it.each([
    birth, { utc: birth.utc }, { ...birth, timeKnown: false },
    { ...birth, timeScale: "tt" as const, deltaT: 42 },
    { ...birth, timeScale: "ut1" as const },
    { ...birth, latitude: 78, houseSystem: "placidus" as const }
  ])("preserves native transits and separate sky provenance for %j", (input) => {
    const natal = natalChart(input);
    const expected = transits(natal, at);
    const result = transitsAtTool({ birth: input, at });
    const data = result.structuredContent.data;
    expect(data.transit).toEqual(toJson(expected));
    expect(data.sky).toEqual(toJson(natalChart({ utc: at })));
    expect(data.sky.bodies).toEqual(data.transit.positions);
    expect(data.sky.angles).toBeNull();
    expect(data.sky.houses).toBeNull();
    expect(data.sky.timeScale.input).toBe("utc");
    expect(result.structuredContent.receipts).toEqual([
      chartReceipt("natal", natal, input.utc), chartReceipt("transit-sky", natalChart({ utc: at }), at)
    ]);
    expect(JSON.parse(result.content[0]!.text)).toEqual(result.structuredContent);
    expect(transitOutputSchema.parse(result.structuredContent)).toEqual(result.structuredContent);
    for (const receipt of result.structuredContent.receipts) {
      const parsed = parseNatalEnvelope(JSON.stringify(receipt.envelope));
      expect(parsed.ok).toBe(true);
      if (parsed.ok) {
        const replay = natalChart(natalReplayInput(parsed.envelope));
        expect(toJson(replay.bodies)).toEqual(receipt.role === "natal" ? data.transit.natal.bodies : data.transit.positions);
      }
    }
  });
  it("retains independent natal and sky reference coverage flags", () => {
    const data = transitsAtTool({ birth, at: "1700-03-04T00:00:00Z" }).structuredContent.data;
    expect(data.sky.flags).toContain("outside-reference-span");
    expect(data.transit.natal.flags).not.toContain("outside-reference-span");
  });
  it("captures now once, matches explicit transits and leaves clock values and inputs unchanged", () => {
    const date = new Date(at);
    const clock = vi.fn(() => date);
    const request = structuredClone({ birth });
    const result = transitsNowTool(request, clock);
    expect(clock).toHaveBeenCalledTimes(1);
    expect(result).toEqual(transitsAtTool({ birth, at: date.toISOString() }));
    expect(date.toISOString()).toBe(new Date(at).toISOString());
    expect(request).toEqual({ birth });
  });
  it("uses the default wall clock", () => {
    const before = Date.now();
    const result = transitsNowTool({ birth });
    const after = Date.now();
    const captured = result.structuredContent.data.transit.at;
    expect(Date.parse(captured)).toBeGreaterThanOrEqual(before);
    expect(Date.parse(captured)).toBeLessThanOrEqual(after);
    expect(result).toEqual(transitsAtTool({ birth, at: captured }));
  });
  it.each([{}, { birth }, { birth, at: "2026-02-30T00:00:00Z" },
    { birth, at: "2026-03-04T05:06:07" }, { birth, at, extra: true },
    { birth: { ...birth, longitude: 181 }, at }])("rejects invalid date-tool request %j", (input) => {
    expect(() => transitsAtTool(input)).toThrow(z.ZodError);
  });
  it("validates now inputs before reading the clock", () => {
    const clock = vi.fn(() => new Date(at));
    expect(() => transitsNowTool({ birth, at }, clock)).toThrow(z.ZodError);
    expect(clock).not.toHaveBeenCalled();
  });
  it("rejects invalid clocks and propagates clock failures", () => {
    expect(() => transitsNowTool({ birth }, () => new Date(NaN))).toThrow(RangeError);
    expect(() => transitsNowTool({ birth }, () => "now" as unknown as Date)).toThrow(RangeError);
    const error = new Error("clock failure");
    expect(() => transitsNowTool({ birth }, () => { throw error; })).toThrow(error);
  });
  it("propagates engine range errors for birth, supplied date and captured now", () => {
    const outside = "0000-01-01T00:00:00Z";
    expect(() => transitsAtTool({ birth: { utc: outside }, at })).toThrow(RangeError);
    expect(() => transitsAtTool({ birth, at: outside })).toThrow(RangeError);
    expect(() => transitsNowTool({ birth }, () => new Date(outside))).toThrow(RangeError);
  });
  it("exports concrete JSON Schema and rejects damaged data", () => {
    expect(z.toJSONSchema(transitOutputSchema).properties?.data)
      .toHaveProperty("properties.transit.properties.aspects.items.properties.aLon");
    const result = transitsAtTool({ birth, at }).structuredContent;
    const damaged = structuredClone(result);
    damaged.data.transit.positions[0]!.lon = 360;
    expect(transitOutputSchema.safeParse(damaged).success).toBe(false);
    expect(transitOutputSchema.safeParse({ ...result, data: { transit: {} } }).success).toBe(false);
  });
});
