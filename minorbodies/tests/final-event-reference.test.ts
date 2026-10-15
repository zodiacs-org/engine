import { describe, expect, it } from "vitest";
import { ACCEPTANCE_POLICY } from "../src/acceptance.ts";
import { FINAL_EVENT_RECIPE, finalEventWindows, finalEventRefinementCenters,
  assertFinalEventReferenceRates, FINAL_EVENT_IMPLEMENTATION_FILES } from "../src/final-event-reference.ts";
import { finalEventOutsideBracketSeconds } from "../src/final-event-validation.ts";
import { fullTrainingEpochs, FULL_RECIPE } from "../src/full-recipe.ts";
import { pilotTrainingEpochs } from "../src/pilot-recipe.ts";
import { stationReferenceEpochs, STATION_REFERENCE_RECIPE } from "../src/station-reference.ts";
import { INGRESS_REFERENCE_RECIPE } from "../src/ingress-reference.ts";

describe("preregistered M11 finite independent event windows", () => {
  it("fixes the four new calendar years and exact safe TT intervals", () => {
    expect(FINAL_EVENT_RECIPE.years).toEqual([1800, 1900, 2100, 2200]);
    expect(FINAL_EVENT_RECIPE.scope).toBe("four-finite-364-day-TT-windows;retained-2000-suites-separate;not-full-range-event-completeness");
    for (const window of finalEventWindows()) {
      expect(window.centers).toHaveLength(365);
      expect(window.toJdTt - window.fromJdTt).toBe(364);
      expect(window.fromJdTt).toBe(Date.parse(`${window.year}-01-01T00:00:00Z`) / 86400000 + 2440587.5 + 0.125003);
      expect(window.fromJdTt).toBeGreaterThanOrEqual(FULL_RECIPE.startJdTt);
      expect(window.toJdTt).toBeLessThan(FULL_RECIPE.endJdTt);
      for (let index = 1; index < window.centers.length; index++) expect(window.centers[index]! - window.centers[index - 1]!).toBe(1);
    }
    expect(ACCEPTANCE_POLICY.targetSpan.endExclusive).toBe("2201-01-01T00:00:00");
    expect(FINAL_EVENT_RECIPE.requireStationEventsPerBody).toBe(true);
    expect(FINAL_EVENT_RECIPE.requireIngressEventsPerBody).toBe(true);
  });

  it("preserves the original station and ingress gates instead of widening them", () => {
    expect(FINAL_EVENT_RECIPE.maxReferenceBracketSeconds).toBe(85);
    expect(FINAL_EVENT_RECIPE.maxReferenceBracketSeconds).toBe(STATION_REFERENCE_RECIPE.maxReferenceBracketSeconds);
    expect(FINAL_EVENT_RECIPE.maxReferenceBracketSeconds).toBe(INGRESS_REFERENCE_RECIPE.maxReferenceBracketSeconds);
    expect(FINAL_EVENT_RECIPE.eventAgreementMarginSeconds).toBe(300);
    expect(FINAL_EVENT_RECIPE.eventAgreementMarginSeconds).toBe(STATION_REFERENCE_RECIPE.stationAgreementMarginSeconds);
    expect(FINAL_EVENT_RECIPE.eventAgreementMarginSeconds).toBe(INGRESS_REFERENCE_RECIPE.ingressAgreementMarginSeconds);
    expect(FINAL_EVENT_RECIPE.maxReferenceLongitudeSpeedDifferenceArcsecPerDay).toBe(0.01);
    expect(FINAL_EVENT_RECIPE.fineStepDays).toBe(0.25);
    expect(FINAL_EVENT_RECIPE.coarseStepDays).toBe(0.5);
    expect(FINAL_EVENT_RECIPE.maximumAdjacentLongitudeStepDeg).toBe(INGRESS_REFERENCE_RECIPE.maximumAdjacentLongitudeStepDeg);
  });

  it("excludes every initial scan stencil epoch from both coefficient training sets", () => {
    const training = new Set([...fullTrainingEpochs(), ...pilotTrainingEpochs()]);
    for (const window of finalEventWindows()) {
      const epochs = stationReferenceEpochs(window.centers, FINAL_EVENT_RECIPE.scanFineStepDays, FINAL_EVENT_RECIPE.scanCoarseStepDays);
      expect(epochs.some(epoch => training.has(epoch))).toBe(false);
      expect(epochs.length).toBeLessThanOrEqual(FINAL_EVENT_RECIPE.maximumRequestEpochs);
      expect(epochs[0]).toBe(window.fromJdTt - 6);
      expect(epochs.at(-1)).toBe(window.toJdTt + 6);
    }
  });

  it("refines a daily bracket to the unchanged width gate at the registered decimal precision", () => {
    const first = finalEventWindows()[0]!.fromJdTt;
    const initial = finalEventRefinementCenters(first, first + 1);
    expect(initial).toHaveLength(33);
    for (let index = 1; index < initial.length; index++) {
      const second = finalEventRefinementCenters(initial[index - 1]!, initial[index]!);
      expect(second).toHaveLength(33);
      expect(stationReferenceEpochs(second, 0.25, 0.5).length).toBeLessThanOrEqual(FINAL_EVENT_RECIPE.maximumRequestEpochs);
      for (let slot = 1; slot < second.length; slot++) expect((second[slot]! - second[slot - 1]!) * 86400).toBeLessThanOrEqual(85);
    }
    expect(() => finalEventRefinementCenters(first, first)).toThrow("Invalid reference refinement bracket");
  });

  it("rejects unconverged, empty, zero or sign-inconsistent independent derivative references", () => {
    const valid = { jdTt: 2451545, longitudeDeg: 1, fineLongitudeSpeedDegPerDay: 0.2,
      coarseLongitudeSpeedDegPerDay: 0.2, convergenceArcsecPerDay: 0 };
    expect(() => assertFinalEventReferenceRates([valid])).not.toThrow();
    expect(() => assertFinalEventReferenceRates([])).toThrow("Empty final event derivative corpus");
    for (const convergenceArcsecPerDay of [0.010001, NaN, Infinity, -1]) {
      expect(() => assertFinalEventReferenceRates([{ ...valid, convergenceArcsecPerDay }])).toThrow("did not converge");
    }
    for (const fineLongitudeSpeedDegPerDay of [0, -0.2, NaN, Infinity]) {
      expect(() => assertFinalEventReferenceRates([{ ...valid, fineLongitudeSpeedDegPerDay }])).toThrow("disagree about motion");
    }
  });

  it("identifies the independent source graph and requires both data-only reference recipes", () => {
    expect(FINAL_EVENT_IMPLEMENTATION_FILES).toContain("src/final-event-reference.ts");
    expect(FINAL_EVENT_IMPLEMENTATION_FILES).toContain("scripts/capture-final-events.ts");
    expect(FINAL_EVENT_IMPLEMENTATION_FILES).toContain("scripts/reference-erfa.py");
    expect(FINAL_EVENT_IMPLEMENTATION_FILES).toContain("src/station-reference.ts");
    expect(FINAL_EVENT_IMPLEMENTATION_FILES).toContain("src/ingress-reference.ts");
    expect(FINAL_EVENT_IMPLEMENTATION_FILES).not.toContain("src/ephemeris.ts");
    expect(FINAL_EVENT_IMPLEMENTATION_FILES).not.toContain("src/stations.ts");
    expect(FINAL_EVENT_IMPLEMENTATION_FILES).not.toContain("src/ingresses.ts");
  });

  it("measures agreement against bracket extents without pretending the midpoint is exact", () => {
    const bracket = { bracketStartJdTt: 2451545, bracketEndJdTt: 2451545.001 };
    expect(finalEventOutsideBracketSeconds(2451545.0005, bracket)).toBe(0);
    expect(finalEventOutsideBracketSeconds(2451545, bracket)).toBe(0);
    expect(finalEventOutsideBracketSeconds(2451545.001, bracket)).toBe(0);
    expect(finalEventOutsideBracketSeconds(2451544, bracket)).toBe(86400);
    expect(() => finalEventOutsideBracketSeconds(NaN, bracket)).toThrow("Invalid event agreement bracket");
    expect(() => finalEventOutsideBracketSeconds(2451545, { ...bracket, bracketEndJdTt: 2451545 })).toThrow("Invalid event agreement bracket");
  });
});
