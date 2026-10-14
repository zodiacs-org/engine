import { describe, expect, it, vi } from "vitest";
import * as engine from "../src/engine.js";
import { cast, createAspectSearchPolicy, createTimingPolicy, evaluateTimingHints } from "../src/index.js";
import { questionInput } from "./fixtures.js";

describe("timing engine delegation (not independent ephemeris accuracy evidence)", () => {
  const enabled = createTimingPolicy({ enabled: true, units: {
    cardinal: { angular: { unit: "days", unitsPerDegree: 1 } },
    fixed: { succedent: { unit: "weeks", unitsPerDegree: 1 } },
    mutable: { cadent: { unit: "months", unitsPerDegree: 1 } }
  } });

  it("reuses exact classification and relative crossings, retains the engine clock and never recasts", () => {
    const result = cast(questionInput), before = structuredClone(result);
    const classify = vi.spyOn(engine, "findConfiguredAspects");
    const crossing = vi.spyOn(engine, "searchLongitudeCrossingsWith");
    const longitude = vi.spyOn(engine, "bodyLongitude");
    const recast = vi.spyOn(engine, "natalChart");
    try {
      const report = evaluateTimingHints(result, createAspectSearchPolicy({ horizonDays: 0.5, maxSamples: 2000 }), enabled);
      expect(report.aspects.search).toMatchObject({ clock: "engine-utc-model", status: "complete" });
      expect(classify).toHaveBeenCalledTimes(report.aspects.aspects.length * 3);
      expect(crossing).toHaveBeenCalledTimes(report.aspects.aspects.reduce((count, row) =>
        count + (row.angle === 0 || row.angle === 180 ? 1 : 2), 0));
      expect(longitude).toHaveBeenCalledTimes(report.aspects.search.samples * 2);
      expect(recast).not.toHaveBeenCalled();
      expect(result).toEqual(before);
      expect(report.cusps).toEqual(result.chart.houses.cusps);
    } finally { classify.mockRestore(); crossing.mockRestore(); longitude.mockRestore(); recast.mockRestore(); }
  });

  it("preserves all actual house systems and polar fallback without seeking contacts", () => {
    const aspectPolicy = createAspectSearchPolicy({ search: false });
    for (const houseSystem of engine.HOUSE_SYSTEMS) {
      const result = cast({ ...questionInput, houseSystem });
      const report = evaluateTimingHints(result, aspectPolicy, enabled);
      expect(report.aspects.significators.houses).toEqual({ requested: houseSystem, actual: result.chart.houses.system });
      expect(report.cusps).toEqual(result.chart.houses.cusps);
      expect(report.aspects.search.samples).toBe(0);
    }
    const result = cast({ ...questionInput, location: { latitude: 80, longitude: 34 }, houseSystem: "placidus" });
    expect(evaluateTimingHints(result, aspectPolicy, enabled).aspects.significators.houses)
      .toEqual({ requested: "placidus", actual: "whole" });
  });

  it("does not spend ephemeris evaluations on default-disabled timing or budget preflight refusal", () => {
    const result = cast(questionInput);
    const longitude = vi.spyOn(engine, "bodyLongitude");
    try {
      expect(evaluateTimingHints(result).aspects.search).toMatchObject({ status: "disabled", samples: 0 });
      const report = evaluateTimingHints(result, createAspectSearchPolicy({ maxSamples: 1 }), enabled);
      expect(report.aspects.search.status).toBe("refused");
      expect(report.assessments.every(row => row.hints.length === 0)).toBe(true);
      expect(longitude).not.toHaveBeenCalled();
    } finally { longitude.mockRestore(); }
  });
});
