import { describe, expect, it, vi } from "vitest";
import * as engine from "../src/engine.js";
import { analyze, analyzeCast, explain } from "../src/index.js";
import type { HoraryAnalysisOptions } from "../src/index.js";
import { aspectFixture, questionInput } from "./fixtures.js";

export const geometryOnly = {
  considerations: { rules: { "moon-void-of-course": false } },
  aspects: { search: false }
} as const satisfies HoraryAnalysisOptions;

describe("composed horary API", () => {
  it("preserves hand-derived roles, considerations, scores, reception and exact motion", () => {
    const result = aspectFixture();
    result.chart.angles.asc = 2;
    const report = analyzeCast(result, geometryOnly);
    expect(report.schema).toBe("horary.analysis/v1");
    expect(report.significators.assignments.map(row => [row.role, row.planet]))
      .toEqual([["querent", "Mars"], ["quesited", "Venus"], ["moon", "Moon"]]);
    expect(report.considerations.observations.filter(row => row.status === "triggered").map(row => row.rule))
      .toEqual(["early-ascendant", "saturn-seventh"]);
    expect(report.essential.conditions.find(row => row.planet === "Mars")?.score).toBe(6);
    expect(report.essential.conditions.find(row => row.planet === "Venus")?.score).toBe(-3);
    expect(report.essential.directionalReceptions.find(row => row.host === "Mars" && row.guest === "Venus"))
      .toMatchObject({ status: "received", dignities: ["domicile", "face"] });
    expect(report.essential.mutualReceptions).toEqual([]);
    expect(report.accidental.conditions.find(row => row.planet === "Mars")?.score).toBe(11);
    expect(report.aspects.aspects.find(row => row.a.planet === "Mars" && row.b.planet === "Venus" && row.type === "conjunction"))
      .toMatchObject({ current: { motion: "applying", orb: 6, withinOrb: true }, timeToPerfection: null });
    expect(report.aspects).toBe(report.direct.aspects);
    expect(report.aspects.search.status).toBe("disabled");
    expect(report.timing.policy.enabled).toBe(false);
    expect(report).not.toHaveProperty("verdict");
  });

  it("returns frozen detached JSON data without freezing or editing the caller's cast", () => {
    const result = aspectFixture(), before = structuredClone(result);
    const report = analyzeCast(result, geometryOnly);
    expect(result).toEqual(before);
    expect(Object.isFrozen(result.chart.houses.cusps)).toBe(false);
    expect(Object.isFrozen(report.chart.bodies[0])).toBe(true);
    expect(Object.isFrozen(report.chart.houses.cusps)).toBe(true);
    expect(Object.isFrozen(report.input.question.naturalSignificators)).toBe(true);
    expect(report.chart.input.utc).toBe("2000-01-01T12:00:00.000Z");
    expect(JSON.parse(JSON.stringify(report))).toEqual(report);
    result.chart.bodies[0]!.lon = 99;
    result.chart.houses.cusps[0] = 29;
    result.chart.input.utc.setUTCFullYear(2001);
    expect(report.chart.bodies[0]!.lon).toBe(before.chart.bodies[0]!.lon);
    expect(report.chart.houses.cusps[0]).toBe(0);
    expect(report.chart.input.utc).toBe("2000-01-01T12:00:00.000Z");
  });

  it("passes all policy groups through and performs no disabled scans", () => {
    const recast = vi.spyOn(engine, "natalChart"), longitude = vi.spyOn(engine, "bodyLongitude"),
      speed = vi.spyOn(engine, "longitudeSpeed"), voidScan = vi.spyOn(engine, "voidOfCourseAt");
    try {
      const report = analyzeCast(aspectFixture(), {
        ...geometryOnly, considerations: { rules: { "moon-void-of-course": false, "early-ascendant": false } },
        essential: { weights: { domicile: false }, receptionDignities: [] },
        accidental: { weights: { direct: false } },
        direct: { directAspect: false, stations: false, signChanges: false },
        translation: { translationOfLight: false }, collection: { collectionOfLight: false },
        impediments: { prohibition: false, frustration: false, refranation: false },
        timing: { enabled: true, units: { cardinal: { angular: { unit: "weeks", unitsPerDegree: 2 } } } }
      });
      expect(report.considerations.observations.find(row => row.rule === "early-ascendant")?.status).toBe("disabled");
      expect(report.essential.policy.weights.domicile).toBe(false);
      expect(report.essential.directionalReceptions.every(row => row.status === "disabled")).toBe(true);
      expect(report.accidental.policy.weights.direct).toBe(false);
      expect(report.direct.direct.every(row => row.status === "disabled")).toBe(true);
      expect(report.translation.assessment).toBe("disabled");
      expect(report.collection.assessment).toBe("disabled");
      expect(report.impediments.assessment).toBe("disabled");
      expect(report.timing.policy.units.cardinal.angular).toEqual({ unit: "weeks", unitsPerDegree: 2 });
      expect(report.timing.assessments.every(row => row.hints.length === 0)).toBe(true);
      expect(recast).not.toHaveBeenCalled();
      expect(longitude).not.toHaveBeenCalled();
      expect(speed).not.toHaveBeenCalled();
      expect(voidScan).not.toHaveBeenCalled();
    } finally { recast.mockRestore(); longitude.mockRestore(); speed.mockRestore(); voidScan.mockRestore(); }
  });

  it("validates all options before casting or scanning", () => {
    const recast = vi.spyOn(engine, "natalChart"), voidScan = vi.spyOn(engine, "voidOfCourseAt");
    try {
      for (const options of [null, [], { unknown: {} }, { timing: undefined }, { timing: { enabled: "yes" } },
        { essential: null }, { aspects: { horizonDays: 0 } }, { direct: { stations: null } },
        { considerations: { rules: { invented: false } } }]) {
        expect(() => analyze(questionInput, options as HoraryAnalysisOptions)).toThrow(RangeError);
      }
      expect(recast).not.toHaveBeenCalled();
      expect(voidScan).not.toHaveBeenCalled();
    } finally { recast.mockRestore(); voidScan.mockRestore(); }
  });

  it("casts once, retains real engine provenance and exposes refused scans independently", () => {
    const recast = vi.spyOn(engine, "natalChart");
    try {
      const report = analyze(questionInput, { considerations: geometryOnly.considerations,
        aspects: { horizonDays: 0.5, maxSamples: 1 }, direct: { maxSamples: 1 },
        translation: { maxSamples: 1 }, collection: { maxSamples: 1 }, impediments: { maxSamples: 1, stationMaxSamples: 1 } });
      expect(recast).toHaveBeenCalledTimes(1);
      expect(report.aspects.search.status).toBe("refused");
      expect(report.aspects.aspects.every(row => row.contacts.length === 0)).toBe(true);
      expect(report.chart.engineVersion).not.toBe("synthetic-adapter-fixture");
      expect(report.chart.timeScale.input).toBe("utc");
      expect(report.chart.houses.system).toBe("regiomontanus");
      expect(report.significators.houses).toEqual({ requested: "regiomontanus", actual: "regiomontanus" });
      expect(report.timing.aspects.search.status).toBe("disabled");
      expect(explain(report).entries.find(row => row.section === "aspects" && row.subject === "search")?.status).toBe("refused");
    } finally { recast.mockRestore(); }
  });

  it("explains a typed or JSON-restored report without calculations, with sources and disabled states", () => {
    const report = analyzeCast(aspectFixture(), geometryOnly);
    const restored = JSON.parse(JSON.stringify(report));
    const recast = vi.spyOn(engine, "natalChart"), longitude = vi.spyOn(engine, "bodyLongitude");
    try {
      const output = explain(restored);
      expect(output).toEqual(explain(report));
      expect(output.entries.find(row => row.subject === "moon-void-of-course")?.status).toBe("disabled");
      expect(output.entries.find(row => row.section === "essential" && row.subject === "Mars: domicile"))
        .toMatchObject({ status: "applied", source: { id: "lilly-essential-weights" } });
      expect(output.text).toContain("Source: Lilly");
      expect(output.text).toContain("future");
      expect(output.limitations).toContain(report.limitations[0]);
      expect(Object.isFrozen(output.entries[0])).toBe(true);
      expect(Object.isFrozen(restored.considerations.observations[0].source)).toBe(false);
      expect(recast).not.toHaveBeenCalled();
      expect(longitude).not.toHaveBeenCalled();
      expect(() => explain({ schema: "unknown" } as never)).toThrow(RangeError);
    } finally { recast.mockRestore(); longitude.mockRestore(); }
  });
});
