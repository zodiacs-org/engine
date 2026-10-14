import { describe, expect, it, vi } from "vitest";
import * as engine from "../src/engine.js";
import { cast, selectSignificators } from "../src/index.js";
import type { HouseSignificator } from "../src/index.js";
import { questionInput } from "./fixtures.js";

describe("significator engine integration (delegation, not accuracy evidence)", () => {
  it.each(engine.HOUSE_SYSTEMS)("selects from actual %s cusps without recalculating", (houseSystem) => {
    const result = cast({ ...questionInput, houseSystem, question: { id: "job", quesitedHouse: 10 } });
    const before = structuredClone(result);
    const spy = vi.spyOn(engine, "natalChart");
    try {
      const selected = selectSignificators(result);
      expect(spy).not.toHaveBeenCalled();
      expect(result).toEqual(before);
      for (const index of [0, 1]) {
        const assignment = selected.assignments[index] as HouseSignificator;
        const longitude = result.chart.houses.cusps[assignment.basis.house - 1]!;
        const rulers = engine.dignityRulersAt(longitude);
        expect(assignment.basis.longitude).toBe(longitude);
        expect(assignment.basis.sign).toBe(rulers.sign);
        expect(assignment.planet).toBe(rulers.domicile);
      }
      for (const { planet } of selected.planets) {
        expect(result.chart.bodies.some(({ body }) => body === planet)).toBe(true);
      }
    } finally {
      spy.mockRestore();
    }
  });

  it("retains requested Placidus and actual whole-sign fallback in selection metadata", () => {
    const result = cast({ ...questionInput, location: { latitude: 80, longitude: 34 }, houseSystem: "placidus" });
    const selected = selectSignificators(result);
    expect(result.chart.flags).toContain("polar-fallback");
    expect(selected.houses).toEqual({ requested: "placidus", actual: "whole" });
    expect((selected.assignments[0] as HouseSignificator).basis.longitude).toBe(result.chart.houses.cusps[0]);
    expect((selected.assignments[1] as HouseSignificator).basis.longitude).toBe(result.chart.houses.cusps[1]);
  });
});
