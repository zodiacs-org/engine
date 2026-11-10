import { describe, expect, it } from "vitest";
import { mundaneBodyArc } from "../src/mundane.js";
import { zodiacalBodyArc } from "../src/zodiacal.js";
import { M11_ANGLE_CASES, M11_MUNDANE_CASES, M11_ZODIACAL_CASES } from "../evidence/m11-geometry-cases.js";
import { measureM11Geometry } from "../evidence/m11-geometry.js";

describe("M11 independent temporal-hour construction matrix", () => {
  it("matches every declared arc and intermediate coordinate", () => {
    expect(M11_ANGLE_CASES).toHaveLength(192);
    expect(M11_MUNDANE_CASES).toHaveLength(512);
    expect(M11_ZODIACAL_CASES).toHaveLength(496);
    const { numeric } = measureM11Geometry();
    expect(numeric.length).toBeGreaterThan(0);
    expect(numeric.filter(row => !row.passed)).toEqual([]);
  });

  it("preserves role exchange and exact versus interior target labels", () => {
    const axes = ["upper-meridian", "setting", "lower-meridian", "rising"];
    const quadrants = ["above-west", "below-west", "below-east", "above-east"];
    for (const row of M11_MUNDANE_CASES) {
      const { geometry: g } = mundaneBodyArc(row.input);
      const q = row.expected.targetQ;
      expect(g.movingRole).toBe(row.input.motion === "direct" ? "promissor" : "significator");
      expect(g.coincident).toBe(false);
      expect(g.targetBoundary).toBe(q % 90 === 0 ? axes[q / 90] : null);
      expect(g.targetQuadrant).toBe(q % 90 === 0 ? null : quadrants[Math.floor(q / 90)]);
    }
  });

  it("keeps the explicitly projected ray separate from bodily input latitude", () => {
    for (const row of M11_ZODIACAL_CASES) {
      const result = zodiacalBodyArc(row.input);
      expect(result.significator.latitudeDegrees).toBe(8);
      expect(result.promissor.latitudeDegrees).toBe(-11);
      expect(result.geometry.significator.latitudeDegrees).toBe(0);
      expect(result.geometry.promissor.latitudeDegrees).toBe(0);
      expect(result.geometry.promissor.longitudeDegrees).toBe(row.expected.ray);
    }
  });
});
