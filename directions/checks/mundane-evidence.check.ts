import { describe, expect, it } from "vitest";
import { mundaneBodyArc } from "../src/index.js";
import { MUNDANE_EXAMPLES, MUNDANE_FIXTURE_TOLERANCE_DEGREES } from "../evidence/mundane-examples.js";

function near(actual: number, expected: number): void {
  expect(Number.isFinite(actual)).toBe(true);
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(MUNDANE_FIXTURE_TOLERANCE_DEGREES);
}

describe("independently derived mundane body directions", () => {
  for (const fixture of MUNDANE_EXAMPLES) {
    it(fixture.id, () => {
      const motion = fixture.motion === "direct" ? { motion: "direct" as const }
        : { motion: "converse" as const, converseConstruction: "placidus-role-swap" as const };
      const result = mundaneBodyArc({
        system: "placidus-semiarc", mode: "mundane", latitude: "retain-both", ...motion,
        geometry: fixture.geometry, significator: fixture.significator,
        promissor: fixture.promissor, contact: fixture.contact
      });
      const expected = fixture.expected;
      const geometry = result.geometry;
      near(result.arcDegrees, expected.arcDegrees);
      for (const role of ["significator", "promissor"] as const) {
        expect(result[role]).toEqual(fixture[role]);
        expect(geometry[role].rightAscensionDegrees).toBe(fixture[role].rightAscensionDegrees);
        expect(geometry[role].semiArcs.declinationDegrees).toBe(fixture[role].declinationDegrees);
        near(geometry[role].hourAngleDegrees, expected[`${role}HourAngleDegrees`]);
        near(geometry[role].semiArcPositionDegrees, expected[`${role}PositionDegrees`]);
        near(geometry[role].semiArcs.diurnalSemiArcDegrees, expected[`${role}DiurnalDegrees`]);
        near(geometry[role].semiArcs.nocturnalSemiArcDegrees, expected[`${role}NocturnalDegrees`]);
      }
      near(geometry.targetSemiArcPositionDegrees, expected.targetPositionDegrees);
      near(geometry.targetHourAngleDegrees, expected.targetHourAngleDegrees);
      expect(geometry.aspectOffsetDegrees).toBe(expected.rayOffsetDegrees);
      expect(geometry.targetOffsetDegrees).toBe(expected.rayOffsetDegrees === 0 ? 0
        : fixture.motion === "direct" ? -expected.rayOffsetDegrees : expected.rayOffsetDegrees);
      expect(geometry.movingRole).toBe(fixture.motion === "direct" ? "promissor" : "significator");
      expect(geometry.fixedRole).toBe(fixture.motion === "direct" ? "significator" : "promissor");
      const q = expected.targetPositionDegrees;
      const axis = q === 0 ? "upper-meridian" : q === 90 ? "setting"
        : q === 180 ? "lower-meridian" : q === 270 ? "rising" : null;
      // Oblique trigonometric input rounding can move an ideal axis to the
      // neighboring quadrant. Assert exact axes only for equatorial sources.
      const fixed = fixture.motion === "direct" ? fixture.significator : fixture.promissor;
      if (axis === null) {
        expect(geometry.targetBoundary).toBeNull();
        expect(geometry.targetQuadrant).toBe(q < 90 ? "above-west" : q < 180 ? "below-west"
          : q < 270 ? "below-east" : "above-east");
      } else if (fixed.declinationDegrees === 0 || fixture.geometry.latitudeDegrees === 0) {
        expect(geometry.targetBoundary).toBe(axis);
        expect(geometry.targetQuadrant).toBeNull();
        expect(geometry.targetSemiArcDegrees).toBeNull();
        expect(geometry.targetMeridianFraction).toBeNull();
      }
      if (expected.arcDegrees === 0) {
        // All initial contacts in these fixtures use exact equatorial geometry
        // or two bodies on the same exact meridian, not rounded oblique rays.
        expect(Object.is(result.arcDegrees, 0)).toBe(true);
        expect(geometry.coincident).toBe(true);
      }
    });
  }
});
