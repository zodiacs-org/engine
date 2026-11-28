import { describe, expect, it } from "vitest";
import { z } from "zod";
import { natalChart } from "@zodiacs/engine";
import { createNatalEnvelope, parseNatalEnvelope } from "@zodiacs/engine/receipt";
import { birthSchema, inputSchemas, instantSchema, outputSchema } from "../src/contracts.js";
import { chartReceipt, structuredResult, toJson } from "../src/serialization.js";
const utc = "2000-02-03T04:05:06Z";
const birth = { utc };

describe("validated tool contracts", () => {
  it.each(["2000-02-30T12:00:00Z", "2001-02-29T12:00:00Z", "2000-01-01T24:00:00Z",
    "2000-01-01T12:00:60Z", "2000-01-01", "2000-01-01T12:00:00",
    "2000-01-01T12:00:00.1234Z", "2000-01-01T12:00:00+24:00"])("rejects unresolved or invalid instant %s", (value) => {
    expect(instantSchema.safeParse(value).success).toBe(false);
  });
  it.each([utc, "2000-02-29T04:05:06.123+05:30", "0001-05-02T00:00:00Z"])("accepts %s without normalization", (value) => {
    expect(instantSchema.parse(value)).toBe(value);
  });
  it.each([{ ...birth, latitude: 0 }, { ...birth, longitude: 0 }, { ...birth, latitude: 91, longitude: 0 },
    { ...birth, latitude: 0, longitude: Infinity }, { ...birth, timeKnown: null },
    { ...birth, timeScale: "tai" }, { ...birth, houseSystem: "unknown" },
    { ...birth, deltaT: NaN }, { ...birth, deltaT: 1e11 }, { ...birth, timescale: "tt" },
    { ...birth, name: "unneeded personal data" }])("rejects invalid birth %j", (value) => {
    expect(birthSchema.safeParse(value).success).toBe(false);
  });
  it("accepts zero coordinates, unknown time and explicit engine settings", () => {
    const value = { ...birth, latitude: 0, longitude: 0, timeKnown: false, timeScale: "tt", deltaT: 0, houseSystem: "whole" };
    expect(birthSchema.parse(value)).toEqual(value);
  });
  it("exports JSON schemas for every planned input and output", () => {
    for (const schema of Object.values(inputSchemas)) {
      expect(z.toJSONSchema(schema).type).toBe("object");
    }
    expect(z.toJSONSchema(outputSchema(z.strictObject({ at: instantSchema }))).type).toBe("object");
  });
  it("requires explicit dates except for transits_now", () => {
    expect(inputSchemas.transits_now.parse({ birth })).toEqual({ birth });
    expect(inputSchemas.transits_at.safeParse({ birth }).success).toBe(false);
    expect(inputSchemas.moon_phase.safeParse({}).success).toBe(false);
    expect(inputSchemas.natal_chart.safeParse({ birth, extra: true }).success).toBe(false);
  });
  it("bounds search windows and evaluation budgets", () => {
    const search = { body: "Moon", longitude: 0, from: utc, to: utc };
    expect(inputSchemas.event_search.parse(search)).toEqual(search);
    for (const change of [{ to: "1999-01-01T00:00:00Z" }, { to: "2002-01-01T00:00:00Z" },
      { longitude: 360 }, { maxSamples: 100001 }, { maxSamples: 0 }, { maxSamples: 1.5 }]) {
      expect(inputSchemas.event_search.safeParse({ ...search, ...change }).success).toBe(false);
    }
  });
});
describe("structured results and receipts", () => {
  it("preserves native precision, requested houses and fallback, flags and provenance", () => {
    const chart = natalChart({ utc, latitude: 78, longitude: 15, houseSystem: "placidus" });
    const receipt = chartReceipt("natal", chart, utc);
    expect(receipt.envelope).toEqual(toJson(createNatalEnvelope(chart, { sourceInstant: utc })));
    expect(parseNatalEnvelope(JSON.stringify(receipt.envelope)).ok).toBe(true);
    expect(chart.flags).toContain("polar-fallback");
    const result = structuredResult(z.strictObject({ longitude: z.number(), at: instantSchema }),
      { longitude: chart.bodies[0]!.lon, at: chart.input.utc }, [receipt]);
    expect(JSON.parse(result.content[0]!.text)).toEqual(result.structuredContent);
    expect(result.structuredContent.data.longitude).toBe(chart.bodies[0]!.lon);
  });
  it("rejects invalid receipt claims and missing receipts", () => {
    const schema = outputSchema(z.strictObject({}));
    expect(schema.safeParse({ schemaVersion: "zodiacs-astro/1", data: {}, receipts: [] }).success).toBe(false);
    expect(schema.safeParse({ schemaVersion: "zodiacs-astro/1", data: {}, receipts: [{ role: "natal", envelope: {} }] }).success).toBe(false);
  });
  it.each([undefined, NaN, Infinity, 1n, new Date(NaN), new Map(), Array(1), { missing: undefined }])("rejects lossy JSON %s", (value) => {
    expect(() => toJson(value)).toThrow(TypeError);
  });
  it("rejects cycles while allowing shared references and safe special keys", () => {
    const cycle: unknown[] = []; cycle.push(cycle);
    expect(() => toJson(cycle)).toThrow(TypeError);
    const shared = { value: 1 };
    expect(toJson([shared, shared])).toEqual([{ value: 1 }, { value: 1 }]);
    expect(toJson(JSON.parse('{"__proto__":{"value":1}}'))).toEqual(JSON.parse('{"__proto__":{"value":1}}'));
  });
});
