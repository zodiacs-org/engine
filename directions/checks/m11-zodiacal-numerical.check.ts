import { describe, expect, it } from "vitest";
import { zodiacalBodyArc, ZodiacalDirectionError } from "../src/zodiacal.js";
import type { ZodiacalBodyInput, ZodiacalContact } from "../src/zodiacal.js";

const equatorial: ZodiacalBodyInput = {
  system: "placidus-semiarc", mode: "zodiacal", latitude: "zero-both", motion: "direct",
  geometry: { ramcDegrees: 0, latitudeDegrees: 0, trueObliquityDegrees: 0 },
  significator: { longitudeDegrees: 0, latitudeDegrees: 0 },
  promissor: { longitudeDegrees: 0, latitudeDegrees: 0 },
  contact: { kind: "conjunction" }
};

function input(s: number, p: number, contact: ZodiacalContact): ZodiacalBodyInput {
  return {
    ...equatorial, significator: { longitudeDegrees: s, latitudeDegrees: 0 },
    promissor: { longitudeDegrees: p, latitudeDegrees: 0 }, contact
  };
}

function numerical(request: ZodiacalBodyInput): void {
  let caught: unknown;
  try { zodiacalBodyArc(request); } catch (error) { caught = error; }
  expect(caught).toBeInstanceOf(ZodiacalDirectionError);
  expect(caught).toMatchObject({ code: "numerical-degeneracy" });
}

describe("M11 independent zodiacal coincidence boundaries", () => {
  it("refuses lower-meridian subtraction collapse on unequal declination circles", () => {
    // At RAMC=180, lambdaS=0 is on IC. For epsilon=23 and any tiny
    // positive lambdaP, alphaP=atan2(sin(lambdaP)cos(23),cos(lambdaP))
    // is strictly positive. Contact at that meridian therefore needs a
    // positive arc, independent of P's declination. Both rounded H values
    // can equal -180 while the high-latitude semi-arcs still differ.
    // Reversing S and P also cannot establish zero from the collapsed H.
    for (const latitudeDegrees of [-89, -80, 80, 89]) {
      for (const [s, p] of [[0, 1e-14], [1e-14, 0]] as const) {
        numerical({
          ...input(s, p, { kind: "conjunction" }),
          geometry: { ramcDegrees: 180, latitudeDegrees, trueObliquityDegrees: 23 }
        });
      }
    }
  });

  it("refuses an apparent contact when an ecliptic ray addition loses its separation", () => {
    // epsilon=phi=0 gives alpha=lambda, D=N=90, so direct arc is
    // lambdaP + rayOffset - lambdaS modulo 360. Each listed addition
    // rounds to lambdaS although its exact residual is strictly positive.
    // For the last row that residual is 2^-46: an exact dyadic input step
    // at 90 which disappears in the addition to 180.
    for (const [s, p, aspect, branch] of [
      [90, Number.MIN_VALUE, "square", "sinister"],
      [60, 1e-16, "sextile", "sinister"],
      [120, Number.MIN_VALUE, "trine", "sinister"],
      [270, Number.MIN_VALUE, "square", "dexter"],
      [300, Number.MIN_VALUE, "sextile", "dexter"],
      [240, Number.MIN_VALUE, "trine", "dexter"],
      [180, 90 + 2 ** -46, "square", "sinister"]
    ] as const) {
      numerical(input(s, p, { kind: "aspect", aspect, branch }));
    }
    numerical(input(180, Number.MIN_VALUE, { kind: "aspect", aspect: "opposition" }));
  });

  it("preserves exact ray contacts and resolvable dyadic ray separations", () => {
    // Exact integer aspect sums require no residual refusal. With S at
    // the specified integer ray, adding the exactly represented 2^-40
    // to P advances that ray and the contact arc by exactly 2^-40.
    for (const [s, p, contact] of [
      [90, 0, { kind: "aspect", aspect: "square", branch: "sinister" }],
      [270, 0, { kind: "aspect", aspect: "square", branch: "dexter" }],
      [60, 0, { kind: "aspect", aspect: "sextile", branch: "sinister" }],
      [240, 0, { kind: "aspect", aspect: "trine", branch: "dexter" }],
      [0, 180, { kind: "aspect", aspect: "opposition" }]
    ] as const) {
      const coincident = zodiacalBodyArc(input(s, p, contact));
      expect(Object.is(coincident.arcDegrees, 0)).toBe(true);
      expect(coincident.geometry.coincident).toBe(true);
      const separated = zodiacalBodyArc(input(s, p + 2 ** -40, contact));
      expect(separated.arcDegrees).toBe(2 ** -40);
      expect(separated.geometry.coincident).toBe(false);
    }
  });

  it("allows ordinary rounded aspect sums away from coincidence", () => {
    // At epsilon=phi=0 the same longitude identity gives these rational
    // arcs directly: (1/10+90)-10=801/10, and
    // (1/10-90+360)-180=901/10. Decimal 0.1 and either sum are not
    // exact binary64 rationals; a nonzero residual alone is not a refusal.
    for (const [s, branch, expected] of [
      [10, "sinister", 801 / 10], [180, "dexter", 901 / 10]
    ] as const) {
      const result = zodiacalBodyArc(input(s, 0.1, { kind: "aspect", aspect: "square", branch }));
      expect(Math.abs(result.arcDegrees - expected)).toBeLessThanOrEqual(1e-12);
      expect(result.geometry.coincident).toBe(false);
    }
  });

  it("keeps exact shared meridian positions coincident in either hemisphere", () => {
    // Identical projected longitudes have identical alpha and delta.
    // At lambda=0 their RA is exactly zero, so RAMC=0 and 180 are
    // respectively upper and lower meridian contacts with arc zero.
    for (const latitudeDegrees of [-80, 80]) for (const ramcDegrees of [0, 180]) {
      const result = zodiacalBodyArc({
        ...equatorial, geometry: { ramcDegrees, latitudeDegrees, trueObliquityDegrees: 23 }
      });
      expect(Object.is(result.arcDegrees, 0)).toBe(true);
      expect(result.geometry.coincident).toBe(true);
    }
  });

  it("reports a known unresolved ecliptic-horizon coincidence", () => {
    // phi=-60, epsilon=30, RAMC=90 makes the ecliptic coincide with
    // the horizon. Both projected points have mathematically equal
    // declinations and are on that horizon. Rounded projections can put
    // one just inside a quadrant whose transferred point rounds onto its
    // boundary. This is a scope refusal, not an accuracy assertion.
    numerical({
      ...input(225, 315, { kind: "conjunction" }),
      geometry: { ramcDegrees: 90, latitudeDegrees: -60, trueObliquityDegrees: 30 }
    });
  });
});
