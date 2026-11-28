import { describe, expect, it } from "vitest";
import { HOUSE_SYSTEMS, houseOf } from "../src/engine.js";
import { cast, evaluateConsiderations } from "../src/index.js";
import { questionInput } from "./fixtures.js";

describe("consideration integration (delegation, not accuracy evidence)", () => {
  it.each(HOUSE_SYSTEMS)("consumes a cast with actual %s houses", (houseSystem) => {
    const result = cast({ ...questionInput, houseSystem });
    const before = structuredClone(result);
    const evaluated = evaluateConsiderations(result);
    const saturn = result.chart.bodies.find(({ body }) => body === "Saturn")!;
    const house = houseOf(saturn.lon, result.chart.houses.cusps);
    for (const [rule, target] of [["saturn-first", 1], ["saturn-seventh", 7]] as const) {
      const item = evaluated.observations.find((item) => item.rule === rule)!;
      expect(item.status).toBe(house === target ? "triggered" : "not-triggered");
      expect(item.evidence).toContainEqual({ fact: "actual-house-system", value: houseSystem });
    }
    expect(result).toEqual(before);
  });

  it("uses the engine's actual whole-sign polar fallback", () => {
    const result = cast({ ...questionInput, location: { latitude: 80, longitude: 34 }, houseSystem: "placidus" });
    expect(result.chart.flags).toContain("polar-fallback");
    const evaluated = evaluateConsiderations(result);
    for (const item of evaluated.observations.filter(({ rule }) => rule.startsWith("saturn-"))) {
      expect(item.evidence).toContainEqual({ fact: "actual-house-system", value: "whole" });
    }
    expect(result.input.houseSystem).toBe("placidus");
  });
});
