import { describe, expect, it } from "vitest";
import { zodiacalBodyArc, ZodiacalDirectionError } from "../src/index.js";
import type { ZodiacalBodyInput } from "../src/index.js";
import { ZODIACAL_EXAMPLES, ZODIACAL_FIXTURE_TOLERANCE_DEGREES } from "../evidence/zodiacal-examples.js";

function near(actual: number, expected: number): void {
  expect(Number.isFinite(actual)).toBe(true);
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(ZODIACAL_FIXTURE_TOLERANCE_DEGREES);
}

describe("independent hand-derived zodiacal body arcs", () => {
  for (const fixture of ZODIACAL_EXAMPLES) {
    it(fixture.id, () => {
      const result = zodiacalBodyArc({
        system: "placidus-semiarc", mode: "zodiacal", latitude: "zero-both", motion: "direct",
        geometry: fixture.geometry, significator: fixture.significator,
        promissor: fixture.promissor, contact: fixture.contact
      });
      const e = fixture.expected;
      const g = result.geometry;
      near(result.arcDegrees, e.arcDegrees);
      near(g.significator.rightAscensionDegrees, e.significatorRaDegrees);
      near(g.significator.declinationDegrees, e.significatorDeclinationDegrees);
      near(g.promissor.rightAscensionDegrees, e.promissorRaDegrees);
      near(g.promissor.declinationDegrees, e.promissorDeclinationDegrees);
      near(g.significator.position.hourAngleDegrees, e.significatorHourAngleDegrees);
      near(g.promissor.position.hourAngleDegrees, e.promissorHourAngleDegrees);
      near(g.significator.position.semiArcs.diurnalSemiArcDegrees, e.significatorDiurnalDegrees);
      near(g.significator.position.semiArcs.nocturnalSemiArcDegrees, 180 - e.significatorDiurnalDegrees);
      near(g.promissor.position.semiArcs.diurnalSemiArcDegrees, e.promissorDiurnalDegrees);
      near(g.promissor.position.semiArcs.nocturnalSemiArcDegrees, 180 - e.promissorDiurnalDegrees);
      near(g.targetHourAngleDegrees, e.targetHourAngleDegrees);
      expect(g.promissor.longitudeDegrees).toBe(e.rayLongitudeDegrees);
      expect(g.significator.latitudeDegrees).toBe(0);
      expect(g.promissor.latitudeDegrees).toBe(0);
      expect(result.significator).toEqual(fixture.significator);
      expect(result.promissor).toEqual(fixture.promissor);
      expect(result.contact).toEqual(fixture.contact);
      expect(result.kind).toBe(fixture.contact.kind === "conjunction" ? "conjunction-to-body" : "aspect-to-body");
      expect(g).toMatchObject({ movingRole: "promissor-ray", fixedRole: "significator", rotation: "westward" });
      expect(g.wholeTurnsAdded).toBe(e.targetHourAngleDegrees < e.promissorHourAngleDegrees ? 1 : 0);
      if (fixture.id.startsWith("body-on-")) {
        expect(g.significator.position.kind).toBe("boundary");
        expect(g.fixedMeridianFraction).toBeNull();
        expect(g.targetSemiArcDegrees).toBeNull();
      } else if (fixture.geometry.trueObliquityDegrees !== 0) {
        // Every non-boundary oblique fixture sets S halfway from a meridian.
        near(g.fixedMeridianFraction!, 1 / 2);
      }
    });
  }
});

const equatorial: ZodiacalBodyInput = {
  system: "placidus-semiarc", mode: "zodiacal", latitude: "zero-both", motion: "direct",
  geometry: { ramcDegrees: 0, latitudeDegrees: 0, trueObliquityDegrees: 0 },
  significator: { longitudeDegrees: 0, latitudeDegrees: 0 },
  promissor: { longitudeDegrees: 0, latitudeDegrees: 0 }, contact: { kind: "conjunction" }
};

function numerical(input: ZodiacalBodyInput): void {
  let caught: unknown;
  try { zodiacalBodyArc(input); } catch (error) { caught = error; }
  expect(caught).toBeInstanceOf(ZodiacalDirectionError);
  expect(caught).toMatchObject({ code: "numerical-degeneracy" });
}

describe("independently derived binary64 contact boundaries", () => {
  it("retains a tiny equatorial contact when it is representable in the supplied frame", () => {
    for (const gap of [Number.MIN_VALUE, 1e-16, 2 ** -45]) {
      const result = zodiacalBodyArc({ ...equatorial, promissor: { longitudeDegrees: gap, latitudeDegrees: 0 } });
      // At zero obliquity the arc is exactly lambdaP - lambdaS = gap.
      expect(result.arcDegrees).toBe(gap);
      expect(result.geometry.coincident).toBe(false);
    }
  });

  it("refuses a longitude lost to underflow during nonzero-obliquity projection", () => {
    for (const longitudeDegrees of [Number.MIN_VALUE, 1e-322]) {
      numerical({ ...equatorial, geometry: { ...equatorial.geometry, trueObliquityDegrees: 23.4 },
        promissor: { longitudeDegrees, latitudeDegrees: 0 } });
    }
  });

  it("refuses distinct points rounded to the same hour angle", () => {
    // At epsilon=phi=0, arc=P-S for any RAMC. Losing 1e-16 in
    // RAMC-minus-RA subtraction must not manufacture a zero contact.
    for (const ramcDegrees of [30, 90, 180, 270]) {
      numerical({ ...equatorial, geometry: { ...equatorial.geometry, ramcDegrees },
        promissor: { longitudeDegrees: 1e-16, latitudeDegrees: 0 } });
    }
  });

  it("preserves a short arc across the signed hour-angle seam", () => {
    const gap = 2 ** -45;
    const result = zodiacalBodyArc({ ...equatorial,
      geometry: { ...equatorial.geometry, ramcDegrees: 180 },
      promissor: { longitudeDegrees: gap, latitudeDegrees: 0 } });
    expect(result.arcDegrees).toBe(gap);
    expect(result.geometry).toMatchObject({ wholeTurnsAdded: 1, unreducedArcDegrees: -360, coincident: false });
  });

  it("distinguishes a tiny ray after the longitude seam from an unrepresentable ray before it", () => {
    // Ray = P + 180 modulo 360; at P=180 +/- 2^-45 this is respectively
    // gap or 360-gap. The latter is halfway to 360 in binary64 and rounds
    // out of the canonical interval; it must not be returned as zero.
    const gap = 2 ** -45;
    const after = zodiacalBodyArc({ ...equatorial, contact: { kind: "aspect", aspect: "opposition" },
      promissor: { longitudeDegrees: 180 + gap, latitudeDegrees: 0 } });
    expect(after.geometry.promissor.longitudeDegrees).toBe(gap);
    expect(after.arcDegrees).toBe(gap);
    numerical({ ...equatorial, contact: { kind: "aspect", aspect: "opposition" },
      promissor: { longitudeDegrees: 180 - gap, latitudeDegrees: 0 } });
  });

  it("refuses an interior target that cannot retain its quadrant after scaling", () => {
    // S has the least positive H, half-subnormal after its meridian ratio.
    // With an oblique moving circle, that ratio underflows to an axis.
    numerical({ ...equatorial,
      geometry: { ramcDegrees: Number.MIN_VALUE, latitudeDegrees: 45, trueObliquityDegrees: 30 },
      promissor: { longitudeDegrees: 90, latitudeDegrees: 0 } });
  });
});
