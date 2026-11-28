import { describe, expect, it } from "vitest";

import {
  evaluateArcusVisibility, horizonArcusVisionis, rozenbergAirmass
} from "../src/index.js";
import reference from "./fixtures/visibility-reference.json" with { type: "json" };

// These checks use published criterion constants and independently constructed
// arithmetic, not this library's prior output or historical observation dates.
// Source locators, conventions and gates were written before running the tests.
describe("independent visibility criterion references", () => {
  it.each(reference.horizonCases)("uses the published threshold in $id", (row) => {
    const result = horizonArcusVisionis(row.sunAltitudeDeg, row.requiredSolarDepressionDeg);
    expect(result.solarDepressionDeg).toBe(row.expected.solarDepressionDeg);
    expect(Math.abs(result.marginDeg - row.expected.marginDeg))
      .toBeLessThanOrEqual(reference.tolerance.horizonMarginDeg);
    expect(result.passesCriterion).toBe(row.expected.passesCriterion);
  });

  it.each(reference.airmassCases)(
    "matches Schaefer Table 3 at apparent altitude $apparentAltitudeDeg degrees",
    (row) => {
      expect(Math.abs(rozenbergAirmass(row.apparentAltitudeDeg) - row.expectedAirmass))
        .toBeLessThanOrEqual(reference.tolerance.tableAirmass);
    }
  );

  it("matches the exact constructed kX screen with an explicit refraction offset", () => {
    const row = reference.extinctionCase;
    const result = evaluateArcusVisibility(
      { ...row.sample, body: "Venus" },
      { ...row.parameters, model: "arcus-visionis-altitude/1" }
    );

    // This is an arithmetic check of the custom scalar extinction screen.
    // Schaefer requires separate atmospheric components for physical accuracy
    // near the horizon. No such accuracy is asserted by this synthetic case.
    expect(result.photometry).toMatchObject(row.expected);
    // Airless body altitude fails the geometric gate even though the explicit
    // refraction offset puts its apparent altitude on the photometric boundary.
    expect(result.passesCriterion).toBe(row.expectedOverallPassesCriterion);
  });
});
