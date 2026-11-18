import { describe, expect, it } from "vitest";
import { absoluteError, evaluateEventReference, loadEventReferences, quantityFor, timingSensitivity } from "./event-validation.js";
import { assertReferenceChecks } from "./reference-checks.js";

// Chosen AFTER the first held-out evaluation, solely to keep RESULTS.md's
// outward-rounded presentation reproducible. The original independent
// acceptance gates above each assertion remain unchanged in the frozen data.
const presentation = {
  "coarse-planet-coordinate-conjunction-time": [0.01, 1647.09, 1266.89],
  "moon-coordinate-conjunction-time": [0.01, 23.58, 33.11],
  "coarse-planet-appulse-occurrence": [0.01, 1598.61, 512.45],
  "historical-stellar-contact-time": [0.01, 28.35, 73.27],
  "planet-contact-time": [0.01, 20.49, 2.21],
  "topocentric-local-minimum-time": [0.01, 18.29, 35.03],
  "planet-disk-crossing-duration": [0.01, 0.19, 0.44],
  "contact-position-angle": [0.001, 0.399, 1.326],
  "contact-refracted-moon-altitude": [0.001, 0.067, 0.056],
  "outline-latitude-at-exact-longitude": [0.001, 0.127, 0.044]
} as const;
const angularSensitivities: number[] = [], transverseSensitivities: number[] = [];

// M12: unlike the earlier development gates, all frozen cases and complete
// check sets are now enforced, including the local minimum and held-out rows.
for (const partition of ["development", "held-out"] as const) {
  const references = loadEventReferences(partition);
  const measured = new Map<string, number>();
  describe(`complete independent event references: ${partition}`, () => {
    it("requires the exact frozen corpus and check count", () => {
      expect(references.length).toBe(partition === "development" ? 8 : 12);
      expect(references.reduce((sum, row) => sum + row.checks.length, 0)).toBe(partition === "development" ? 32 : 39);
    });
    it.each(references)("passes every unchanged maximum-error assertion: $id", (reference) => {
      const result = evaluateEventReference(reference);
      assertReferenceChecks(reference.checks, result.actual);
      for (const check of reference.checks) {
        const quantity = quantityFor(reference, check);
        measured.set(quantity, Math.max(measured.get(quantity) ?? 0, absoluteError(check, result.actual[check.key]!)));
      }
      const contactCount = reference.kind === "stellar-contacts" ? 2 : reference.kind === "planetary-contacts" ? 4 : 0;
      expect(result.contactSensitivities).toHaveLength(contactCount);
      for (const sensitivity of result.contactSensitivities) {
        expect(sensitivity.stencilSecondsEachSide).toBe(1);
        expect(sensitivity.physicalTimingErrorSeconds).toBeNull();
        expect(sensitivity.secondsPerArcsecond).toBeGreaterThan(0);
        expect(sensitivity.secondsPerKilometerTransverse).toBeGreaterThan(0);
        angularSensitivities.push(sensitivity.secondsPerArcsecond!);
        transverseSensitivities.push(sensitivity.secondsPerKilometerTransverse!);
      }
    }, 120_000);
    it("enforces the post-validation outward-rounded table, separately from acceptance", () => {
      expect([...measured.keys()].sort()).toEqual(Object.keys(presentation).sort());
      for (const [quantity, [resolution, development, heldOut]] of Object.entries(presentation)) {
        const digits = resolution === 0.01 ? 2 : 3;
        const ceiling = Number((Math.ceil(measured.get(quantity)! / resolution) * resolution).toFixed(digits));
        expect(ceiling, `${partition}:${quantity}`).toBe(partition === "development" ? development : heldOut);
      }
    });
  });
}

describe("first-order sensitivity conversions, not physical timing accuracy", () => {
  it("enforces the displayed outward-rounded sensitivity span for all reference contacts", () => {
    expect(angularSensitivities).toHaveLength(14);
    expect(transverseSensitivities).toHaveLength(14);
    expect(Math.floor(Math.min(...angularSensitivities) * 100) / 100).toBe(2.30);
    expect(Math.ceil(Math.max(...angularSensitivities) * 100) / 100).toBe(2.91);
    expect(Math.floor(Math.min(...transverseSensitivities) * 100) / 100).toBe(1.25);
    expect(Math.ceil(Math.max(...transverseSensitivities) * 100) / 100).toBe(1.55);
  });
  it("converts an analytic angular rate and transverse distance with units intact", () => {
    // Synthetic range: one km subtends one arcsecond in the small-angle model.
    const range = 180 * 3600 / Math.PI;
    expect(timingSensitivity(-0.5, range)).toEqual({ signedClearanceRateArcsecondsPerSecond: -0.5,
      secondsPerArcsecond: 2, secondsPerKilometerTransverse: 2 });
    expect(timingSensitivity(2, range)).toEqual({ signedClearanceRateArcsecondsPerSecond: 2,
      secondsPerArcsecond: 0.5, secondsPerKilometerTransverse: 0.5 });
  });
  it.each([[0, 1], [NaN, 1], [Infinity, 1], [1, 0], [1, -1], [1, Infinity], [Number.MIN_VALUE, 1]])(
    "leaves unavailable sensitivity null for rate %s and range %s", (rate, range) => {
      expect(timingSensitivity(rate, range)).toEqual({ signedClearanceRateArcsecondsPerSecond: null,
        secondsPerArcsecond: null, secondsPerKilometerTransverse: null });
    });
});
