import { describe, expect, it } from "vitest";

import { evaluateOdeh, odehBestTime, odehCategory } from "../src/index.js";
import reference from "./fixtures/odeh-reference.json" with { type: "json" };

// Expected values and gates were written before any implementation comparison.
// They come from separate Decimal arithmetic and selected published criterion
// boundaries. No ephemeris output or observation database is the reference.
describe("independent Odeh criterion worked calculations", () => {
  const fields = ["arcOfVisionDeg", "crescentWidthArcmin", "referenceArcOfVisionDeg", "v"] as const;

  it.each(reference.criterionCases)("matches Decimal arithmetic for $id", (row) => {
    const result = evaluateOdeh(row.sample);
    for (const field of fields) {
      expect(Math.abs(result[field] - row.expected[field]), field)
        .toBeLessThanOrEqual(reference.tolerance.numericAbsolute);
    }
    expect(result.crescentWidthArcmin).toBe(row.sample.crescentWidthTopocentricArcmin);
    expect(result.category).toBe(row.expected.category);
  });

  it("covers each published category and both signs of lunar altitude", () => {
    expect(new Set(reference.criterionCases.map((row) => row.expected.category)))
      .toEqual(new Set(["A", "B", "C", "D"]));
    expect(reference.criterionCases.some((row) => row.sample.moonAltitudeTopocentricDeg < 0))
      .toBe(true);
    expect(reference.criterionCases.some((row) => row.sample.moonAltitudeTopocentricDeg > 0))
      .toBe(true);
    expect(reference.tolerance.declaredBeforeImplementationComparison).toBe(true);
  });

  it.each(reference.categoryCases)("uses the published inclusive category interval at $id", (row) => {
    expect(odehCategory(row.v)).toBe(row.category);
  });

  it.each(reference.publishedBoundaries)("matches Table V at width $widthArcmin arcminutes", (row) => {
    const result = evaluateOdeh({
      moonAltitudeTopocentricDeg: 0,
      sunAltitudeTopocentricDeg: 0,
      crescentWidthTopocentricArcmin: row.widthArcmin
    });
    // Equation (2) shifted by each exact published category threshold yields
    // Table V's ARCV1, ARCV2 and ARCV3 curves. Printed values are rounded.
    const offsets = { arcv1Deg: -0.96, arcv2Deg: 2, arcv3Deg: 5.65 } as const;
    for (const field of ["arcv1Deg", "arcv2Deg", "arcv3Deg"] as const) {
      const boundary = result.referenceArcOfVisionDeg + offsets[field];
      expect(Math.abs(boundary - row[field]), field)
        .toBeLessThanOrEqual(reference.tolerance.publishedBoundaryAbsoluteDeg);
    }
  });

  it("preserves the distinct optical-aid meanings of Odeh's categories", () => {
    // These are the API's paraphrases, not quotations from the paper.
    const meanings: Record<string, string> = {
      A: "unaided-eye",
      B: "optical-aid;unaided-eye-possible",
      C: "optical-aid-only",
      D: "below-optical-detection"
    };
    for (const row of reference.criterionCases) {
      expect(evaluateOdeh(row.sample).categoryMeaning).toBe(meanings[row.expected.category]);
    }
  });

  it.each(reference.bestTimeCases)("uses exact rational evening timing for $id", (row) => {
    expect(odehBestTime(row.sunset, row.moonset)).toMatchObject(row.expected);
  });
});
