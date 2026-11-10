import { describe, expect, it } from "vitest";
import { mundaneBodyArc, MundaneDirectionError } from "../src/index.js";
import type { DirectionEquatorialPoint, MundaneBodyInput, MundaneContact } from "../src/index.js";

// Independent arithmetic examples. At observer latitude zero, the horizon
// equation gives H=+/-90 for every nonpolar declination. Thus D=N=90 and
// proportional position is simply H modulo a turn. All dyadic inputs below
// are exactly representable, so their stated identities require no tolerance.
// The sphere relation and coordinate convention are derived in
// ../evidence/M3-derivations.md; these cases target arithmetic boundaries,
// not ephemeris accuracy or historical natal examples.
const point = (rightAscensionDegrees: number, declinationDegrees = 0): DirectionEquatorialPoint => ({
  rightAscensionDegrees, declinationDegrees
});
const motions = ["direct", "converse"] as const;

function request(motion: typeof motions[number], ramcDegrees: number,
  fixed: DirectionEquatorialPoint, moving: DirectionEquatorialPoint,
  contact: MundaneContact = { kind: "conjunction" }, latitudeDegrees = 0): MundaneBodyInput {
  const roles = motion === "direct"
    ? { significator: fixed, promissor: moving }
    : { significator: moving, promissor: fixed };
  return {
    system: "placidus-semiarc", mode: "mundane", latitude: "retain-both",
    ...(motion === "direct" ? { motion } : { motion, converseConstruction: "placidus-role-swap" }),
    geometry: { ramcDegrees, latitudeDegrees }, ...roles, contact
  };
}

function degenerate(input: MundaneBodyInput): void {
  let caught: unknown;
  try { mundaneBodyArc(input); } catch (error) { caught = error; }
  expect(caught).toBeInstanceOf(MundaneDirectionError);
  expect(caught).toMatchObject({ code: "numerical-degeneracy" });
}

describe("independent mundane arithmetic boundary examples", () => {
  for (const motion of motions) {
    it(`${motion}: preserves self-conjunction through nonidentity proportional round trips`, () => {
      // Identical bodily coordinates already coincide in every quadrant.
      // 5/7 is deliberately not an exactly represented decimal or fraction;
      // identity requires equality of the supplied doubles, not of real 5/7.
      for (const ramcDegrees of [5 / 7, 90 + 5 / 7, 180 + 5 / 7, 270 + 5 / 7]) {
        const result = mundaneBodyArc(request(motion, ramcDegrees, point(0), point(0)));
        expect(Object.is(result.arcDegrees, 0)).toBe(true);
        expect(result.geometry.coincident).toBe(true);
        expect(result.geometry.targetHourAngleDegrees).toBe(
          result.geometry[result.geometry.movingRole].hourAngleDegrees);
      }
    });

    it(`${motion}: preserves positive subnormal and small conjunction arcs`, () => {
      // Fixed H=0; moving H=-gap. The next westward contact is exactly gap.
      for (const gap of [Number.MIN_VALUE, 2 ** -49]) {
        const result = mundaneBodyArc(request(motion, 0, point(0), point(gap)));
        expect(result.arcDegrees).toBe(gap);
        expect(result.geometry).toMatchObject({ coincident: false, wholeTurnsAdded: 0 });
      }
    });

    it(`${motion}: refuses a near-full turn that rounds to 360 instead of reporting zero`, () => {
      // The fixed point is gap east of H=0, so westward rotation is 360-gap.
      // This is too close to 360 to have a distinct binary64 representation.
      for (const gap of [Number.MIN_VALUE, 2 ** -49]) {
        degenerate(request(motion, 0, point(gap), point(0)));
      }
      const gap = 2 ** -38;
      const result = mundaneBodyArc(request(motion, 0, point(gap), point(0)));
      expect(result.arcDegrees).toBe(360 - gap);
      expect(result.geometry.coincident).toBe(false);
    });

    it(`${motion}: retains the small arc through the lower-meridian cut`, () => {
      // Fixed H=-180; moving H=180-gap. The westward gap is 2^-45,
      // even though rounded target-minus-moving equals -360.
      const gap = 2 ** -45;
      const result = mundaneBodyArc(request(motion, 0, point(180), point(180 + gap)));
      expect(result.arcDegrees).toBe(gap);
      expect(result.geometry).toMatchObject({
        targetHourAngleDegrees: -180, unreducedArcDegrees: -360,
        wholeTurnsAdded: 1, coincident: false
      });
    });

    it(`${motion}: refuses distinct equal-circle RAs collapsed by hour-angle subtraction`, () => {
      // Mathematically H differs by the smallest positive double. Subtracting
      // either RA from 90 rounds to H=90, which cannot prove coincidence.
      degenerate(request(motion, 90, point(0), point(Number.MIN_VALUE)));
    });

    it(`${motion}: refuses collapsed meridian coincidence even with unequal semi-arcs`, () => {
      // Both RAs round to H=-180 at RAMC=180. A meridian conjunction still
      // requires equal RAs, regardless of the distinct declination circles.
      degenerate(request(motion, 180, point(0), point(Number.MIN_VALUE, 10),
        { kind: "conjunction" }, 45));
    });

    it(`${motion}: preserves an exact dyadic square already in contact`, () => {
      // Hfixed=-149.984375, Hmoving=-59.984375, so qmoving=qfixed+90.
      // Branch names refer to original P->S, hence role-swap changes the
      // label needed to describe this same fixed/moving arrangement.
      const contact: MundaneContact = {
        kind: "aspect", aspect: "square", branch: motion === "direct" ? "eastward" : "westward"
      };
      const result = mundaneBodyArc(request(motion, 0, point(149.984375), point(59.984375), contact));
      expect(result.arcDegrees).toBe(0);
      expect(result.geometry).toMatchObject({
        targetOffsetDegrees: 90, targetHourAngleDegrees: -59.984375,
        targetSemiArcPositionDegrees: 300.015625, coincident: true
      });
    });

    it(`${motion}: preserves an exact dyadic sextile without reusing rounded audit q`, () => {
      // Hfixed=60.046875; Hmoving=0.046875. Their exact q difference is 60.
      // Recomputing H/90*90 may perturb the fixed q before subtraction.
      const contact: MundaneContact = {
        kind: "aspect", aspect: "sextile", branch: motion === "direct" ? "westward" : "eastward"
      };
      const result = mundaneBodyArc(request(motion, 90, point(29.953125), point(89.953125), contact));
      expect(result.arcDegrees).toBe(0);
      expect(result.geometry).toMatchObject({
        fixedSemiArcPositionDegrees: 60.046875, targetOffsetDegrees: -60,
        targetHourAngleDegrees: 0.046875, coincident: true
      });
    });

    it(`${motion}: refuses an interior fixed q rounded onto an axis before aspect transfer`, () => {
      const contact: MundaneContact = { kind: "aspect", aspect: "square", branch: "westward" };
      // The first H lies strictly east of MC. The others straddle the rising
      // horizon. Their q values have insufficient resolution at 360 or 270.
      for (const rightAscension of [2 ** -49, 90 - 2 ** -46, 90 + 2 ** -46]) {
        degenerate(request(motion, 0, point(rightAscension), point(0), contact));
      }
    });

    it(`${motion}: refuses an apparent aspect caused by hour-angle subtraction collapse`, () => {
      // Fixed H=90-gap; moving H=0. A target offset of -90 puts the target
      // at -gap, requiring a nearly full turn, never natal coincidence.
      // The fixed subtraction rounds onto the setting axis before its q
      // offset is applied, so checking the offset residual alone misses it.
      const contact: MundaneContact = {
        kind: "aspect", aspect: "square", branch: motion === "direct" ? "westward" : "eastward"
      };
      for (const gap of [Number.MIN_VALUE, 1e-16]) {
        degenerate(request(motion, 90, point(gap), point(90), contact));
      }
    });

    it(`${motion}: refuses an unresolved offset residual at an apparent coincidence`, () => {
      // Fixed H=gap. The target is gap+60, which has no exact binary64
      // representation. The moving hour angle also rounds to 60. The exact
      // input geometry is coincident, but these intermediate values cannot
      // independently establish it, so the explicit degeneracy policy refuses.
      const gap = 2 ** -49;
      const contact: MundaneContact = {
        kind: "aspect", aspect: "sextile", branch: motion === "direct" ? "eastward" : "westward"
      };
      degenerate(request(motion, gap, point(0), point(300), contact));
    });
  }
});
