import { describe, expect, it } from "vitest";
import { HOUSE_SYSTEMS } from "../src/engine.js";
import { cast } from "../src/index.js";
import { questionInput } from "./fixtures.js";

describe("real engine integration (structural checks, not accuracy evidence)", () => {
  it.each(HOUSE_SYSTEMS)("casts with requested house system %s", (houseSystem) => {
    const result = cast({ ...questionInput, houseSystem });
    expect(result.input.houseSystem).toBe(houseSystem);
    expect(result.chart.input.houseSystem).toBe(houseSystem);
    expect(result.chart.houses.system).toBe(houseSystem);
    expect(result.chart.houses.cusps).toHaveLength(12);
    for (const cusp of result.chart.houses.cusps) {
      expect(cusp).toBeGreaterThanOrEqual(0);
      expect(cusp).toBeLessThan(360);
    }
    expect(result.chart.input.utc.toISOString()).toBe(result.input.instant);
    expect(result.chart.timeScale.input).toBe("utc");
    for (const body of result.chart.bodies) {
      expect(body.lon).toBeGreaterThanOrEqual(0);
      expect(body.lon).toBeLessThan(360);
      expect(Number.isFinite(body.speed)).toBe(true);
    }
    if (houseSystem === "whole") {
      const first = Math.floor(result.chart.angles.asc / 30) * 30;
      expect(result.chart.houses.cusps).toEqual(Array.from({ length: 12 }, (_, i) => (first + i * 30) % 360));
    }
  });

  it("casts with the project default", () => {
    expect(cast(questionInput).chart.houses.system).toBe("regiomontanus");
  });

  it("preserves polar fallback and coverage flags", () => {
    const polar = cast({ ...questionInput, location: { latitude: 80, longitude: 34 }, houseSystem: "placidus" });
    expect(polar.chart.input.houseSystem).toBe("placidus");
    expect(polar.chart.houses.system).toBe("whole");
    expect(polar.chart.flags).toContain("polar-fallback");
    const historical = cast({ ...questionInput, instant: "1700-01-01T12:00:00Z" });
    expect(historical.chart.flags).toContain("outside-reference-span");
  });

  it("delegates ephemeris span refusals", () => {
    expect(() => cast({ ...questionInput, instant: "5000-01-01T12:00:00Z" })).toThrow(RangeError);
  });

  it("allocates independent charts and does not mutate the input", () => {
    const first = cast(questionInput);
    const second = cast(questionInput);
    first.chart.bodies[0]!.lon = -1;
    first.chart.houses.cusps[0] = -1;
    expect(second.chart.bodies[0]!.lon).toBeGreaterThanOrEqual(0);
    expect(second.chart.houses.cusps[0]).toBeGreaterThanOrEqual(0);
    expect(questionInput.instant).toBe("2000-01-01T12:00:00Z");
  });
});
