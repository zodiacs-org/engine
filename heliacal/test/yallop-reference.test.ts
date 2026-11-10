import { describe, expect, it } from "vitest";

import { evaluateYallop, yallopBestTime, yallopCategory } from "../src/index.js";
import reference from "./fixtures/yallop-reference.json" with { type: "json" };

// Expected numbers come from separate Decimal arithmetic, never this library.
// Formula locators, synthetic inputs and comparison gates were fixed before
// evaluating the implementation. This tests the criterion, not sighting dates.
describe("independent Yallop criterion worked calculations", () => {
  const fields = [
    "arcOfVisionDeg",
    "geocentricSemidiameterArcmin",
    "topocentricSemidiameterArcmin",
    "crescentWidthArcmin",
    "referenceArcOfVisionDeg",
    "q"
  ] as const;

  it.each(reference.criterionCases)("matches Decimal arithmetic for $id", (row) => {
    const result = evaluateYallop(row.sample);
    for (const field of fields) {
      expect(Math.abs(result[field] - row.expected[field]), field)
        .toBeLessThanOrEqual(reference.tolerance.numericAbsolute);
    }
    expect(result.category).toBe(row.expected.category);

    // An absolute gate alone would permit cancellation to zero for a tiny
    // positive elongation. Retain the source formula's nonzero width there.
    if (row.expected.crescentWidthArcmin > 0) {
      expect(Math.abs(result.crescentWidthArcmin / row.expected.crescentWidthArcmin - 1))
        .toBeLessThanOrEqual(reference.tolerance.nonzeroWidthRelative);
    } else {
      expect(result.crescentWidthArcmin).toBe(0);
    }
  });

  it("covers every published category and both signs of lunar altitude", () => {
    expect(new Set(reference.criterionCases.map((row) => row.expected.category)))
      .toEqual(new Set(["A", "B", "C", "D", "E", "F"]));
    expect(reference.criterionCases.some((row) => row.sample.moonAltitudeGeocentricDeg < 0))
      .toBe(true);
    expect(reference.criterionCases.some((row) => row.sample.moonAltitudeGeocentricDeg > 0))
      .toBe(true);
    expect(reference.tolerance.declaredBeforeImplementationComparison).toBe(true);
  });

  it.each(reference.categoryCases)("uses Table 5 interval inclusion at $id", (row) => {
    expect(yallopCategory(row.q)).toBe(row.category);
  });

  it("preserves the optical-aid distinctions of the published categories", () => {
    // Public labels are this library's paraphrases, not quotations. This is
    // a semantic contract check alongside the independent numeric checks.
    const meanings: Record<string, string> = {
      A: "unaided-eye-easy",
      B: "unaided-eye-under-ideal-conditions",
      C: "optical-location-may-be-needed-before-unaided-sighting",
      D: "optical-aid-required",
      E: "below-usual-telescopic-detection",
      F: "below-model-danjon-limit"
    };
    for (const row of reference.criterionCases) {
      expect(evaluateYallop(row.sample).categoryMeaning).toBe(meanings[row.expected.category]);
    }
  });

  it.each(reference.bestTimeCases)("uses exact rational best-time arithmetic for $id", (row) => {
    expect(yallopBestTime(row.sunset, row.moonset)).toMatchObject(row.expected);
  });
});
