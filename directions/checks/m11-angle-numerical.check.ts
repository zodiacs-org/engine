import { describe, expect, it } from "vitest";
import { angleConjunctionArc, AngleDirectionError } from "../src/angles.js";
import type { AngleConjunctionInput } from "../src/angles.js";

function request(ramcDegrees: number, rightAscensionDegrees: number): AngleConjunctionInput {
  return { motion: "direct", angle: "ic", coordinates: {
    ramcDegrees, rightAscensionDegrees, latitudeDegrees: 0, declinationDegrees: 0
  } };
}

describe("M11 independent meridian coincidence boundaries", () => {
  it("refuses tiny distinct RAs lost at the lower-meridian subtraction", () => {
    // At theta=180, IC has RA=0: a promissor RA=g requires arc g.
    // At theta=g, a promissor RA=180 passed IC by g: arc 360-g.
    // All are nonzero
    // even when rounded signed H collapses to -180. No epsilon is used.
    for (const gap of [Number.MIN_VALUE, 1e-16, 2 ** -49]) {
      for (const input of [request(180, gap), request(gap, 180)]) {
        expect(() => angleConjunctionArc(input)).toThrow(AngleDirectionError);
        try { angleConjunctionArc(input); } catch (error) {
          expect(error).toMatchObject({ code: "numerical-degeneracy" });
        }
      }
    }
  });

  it("preserves exact meridian coincidence and a resolvable dyadic short arc", () => {
    for (const [ramc, ra] of [[0, 180], [180, 0], [210.5, 30.5], [30.5, 210.5]]) {
      const result = angleConjunctionArc(request(ramc!, ra!));
      expect(Object.is(result.arcDegrees, 0)).toBe(true);
      expect(result.geometry.coincident).toBe(true);
    }
    // 180 - 2^-45 is a distinct double; crossing IC next takes 2^-45.
    const result = angleConjunctionArc(request(180, 2 ** -45));
    expect(result.arcDegrees).toBe(2 ** -45);
    expect(result.geometry.coincident).toBe(false);
    // Advancing theta from 180-g to 180 closes the same westward gap.
    expect(angleConjunctionArc(request(180 - 2 ** -45, 0)).arcDegrees).toBe(2 ** -45);
  });
});
