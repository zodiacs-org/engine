import { describe, expect, it, vi } from "vitest";
import * as engine from "../src/engine.js";
import { cast, evaluateAccidentalCondition } from "../src/index.js";
import { questionInput } from "./fixtures.js";

describe("accidental engine delegation (not independent accuracy evidence)", () => {
  it("delegates houses and sect and consumes speeds from the existing engine helper without recalculating", () => {
    const result = cast(questionInput);
    const houseSpy = vi.spyOn(engine, "houseOf");
    const sectSpy = vi.spyOn(engine, "sectOf");
    const speedSpy = vi.spyOn(engine, "longitudeSpeed");
    const castSpy = vi.spyOn(engine, "natalChart");
    try {
      const before = structuredClone(result);
      const report = evaluateAccidentalCondition(result);
      expect(sectSpy).toHaveBeenCalledTimes(1);
      expect(sectSpy).toHaveBeenCalledWith(result.chart.angles.asc, report.sect.sunLongitude);
      expect(houseSpy).toHaveBeenCalledTimes(report.conditions.length);
      expect(speedSpy).not.toHaveBeenCalled();
      expect(castSpy).not.toHaveBeenCalled();
      for (const row of report.conditions) {
        expect(houseSpy).toHaveBeenCalledWith(row.longitude, result.chart.houses.cusps);
        expect(row.speed).toBe(result.chart.bodies.find(({ body }) => body === row.planet)!.speed);
        expect(row.speed).toBe(engine.longitudeSpeed(row.planet, new Date(result.input.instant)));
      }
      expect(result).toEqual(before);
    } finally { houseSpy.mockRestore(); sectSpy.mockRestore(); speedSpy.mockRestore(); castSpy.mockRestore(); }
  });

  it("consumes every actual engine house system, including polar fallback", () => {
    for (const houseSystem of engine.HOUSE_SYSTEMS) {
      const result = cast({ ...questionInput, houseSystem });
      const report = evaluateAccidentalCondition(result);
      expect(report.significators.houses).toEqual({ requested: houseSystem, actual: result.chart.houses.system });
      expect(report.cusps).toEqual(result.chart.houses.cusps);
      expect(report.sect.ascendant).toBe(result.chart.angles.asc);
      for (const row of report.conditions) expect(row.house).toBe(engine.houseOf(row.longitude, result.chart.houses.cusps));
    }
    const result = cast({ ...questionInput, location: { latitude: 80, longitude: 34 }, houseSystem: "placidus" });
    expect(result.chart.flags).toContain("polar-fallback");
    expect(evaluateAccidentalCondition(result).significators.houses).toEqual({ requested: "placidus", actual: "whole" });
  });
});
