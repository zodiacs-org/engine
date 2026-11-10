import { describe, expect, it } from "vitest";
import { MINOR_BODY_NAMES } from "../src/catalog.ts";
import { ACCEPTANCE_POLICY } from "../src/acceptance.ts";
import { fullTrainingEpochs } from "../src/full-recipe.ts";
import { pilotTrainingEpochs } from "../src/pilot-recipe.ts";
import { INGRESS_REFERENCE_RECIPE, ingressReferenceBrackets, ingressRefinementEpochs, readIngressReference } from "../src/ingress-reference.ts";
import type { IndependentEclipticRow } from "../src/pilot-validation.ts";

const row = (jdTt: number, longitudeDeg: number): IndependentEclipticRow => ({ jdTt, longitudeDeg, latitudeDeg: 0, distanceAu: 1 });
const wrap = (degrees: number) => ((degrees % 360) + 360) % 360;

describe("independent ingress reference recipe", () => {
  it("fixes the refinement and existing event gates before comparison", () => {
    expect(INGRESS_REFERENCE_RECIPE).toMatchObject({
      startJdTt: 2451544.625003, endJdTt: 2451909.625003,
      refinementSubdivisions: 32, refinementPasses: 2, requestedEpochPrecisionDecimals: 6,
      fineStepDays: 0.25, coarseStepDays: 0.5,
      maxReferenceBracketSeconds: 85, ingressAgreementMarginSeconds: 300,
      maxReferenceLongitudeSpeedDifferenceArcsecPerDay: 0.01
    });
    const training = new Set([...pilotTrainingEpochs(), ...fullTrainingEpochs()]);
    const subdivisions = INGRESS_REFERENCE_RECIPE.refinementSubdivisions ** INGRESS_REFERENCE_RECIPE.refinementPasses;
    // Every possible refinement position and endpoint stencil lies on this lattice.
    for (let i = -2 * subdivisions; i <= 367 * subdivisions; i++) {
      const jd = Number((INGRESS_REFERENCE_RECIPE.startJdTt + i / subdivisions).toFixed(6));
      if (training.has(jd)) throw new Error(`Ingress reference lattice overlaps training at ${jd}`);
    }
    const bracket = { longitudeDeg: 30, direction: "direct" as const,
      before: row(2451544.625003, 29), after: row(2451545.625003, 31) };
    expect(ingressRefinementEpochs(bracket)).toHaveLength(33);
  });

  it("independently brackets wraparound and repeated direct/retrograde passes", () => {
    for (const boundary of [0, 30, 300]) {
      const samples = [row(1, wrap(boundary - 0.1)), row(2, wrap(boundary + 0.1)),
        row(3, wrap(boundary - 0.1)), row(4, wrap(boundary + 0.1))];
      const brackets = ingressReferenceBrackets(samples);
      expect(brackets.map(bracket => bracket.longitudeDeg)).toEqual([boundary, boundary, boundary]);
      expect(brackets.map(bracket => bracket.direction)).toEqual(["direct", "retrograde", "direct"]);
    }
  });

  it("checks analytic close pairs around a station and rejects unsupported scan ambiguity", () => {
    // The independent curve is 30 + t^2 - epsilon^2; the station is exactly t=0.
    const epsilon = 1 / 86400;
    const samples = [-2 * epsilon, 0, 2 * epsilon].map(t => row(2451545 + t, 30 + t * t - epsilon * epsilon));
    const brackets = ingressReferenceBrackets(samples);
    expect(brackets.map(bracket => bracket.direction)).toEqual(["retrograde", "direct"]);
    const touches = [-epsilon, epsilon].map(t => row(2451545 + t, 30 + t * t));
    expect(ingressReferenceBrackets(touches)).toEqual([]);
    expect(() => ingressReferenceBrackets([row(1, 29), row(2, 30)])).toThrow(/Exact sampled/);
    expect(() => ingressReferenceBrackets([row(1, 29), row(2, 61)])).toThrow(/adjacent-step/);
    expect(() => ingressReferenceBrackets([row(2, 29), row(1, 31)])).toThrow(/increase/);
    expect(() => ingressReferenceBrackets([row(1, Number.NaN)])).toThrow(/Invalid/);
  });
});

describe("retained original Horizons ingress references", () => {
  it.each(MINOR_BODY_NAMES)("replays %s from original held-out sources and independent ERFA only", async body => {
    const reference = await readIngressReference(body);
    expect(reference.recipe).toEqual(INGRESS_REFERENCE_RECIPE);
    expect(reference.reference.tool).toBe("minorbodies-erfa-reference-v1");
    expect(reference.scan).toHaveLength(366);
    const counts = { Chiron: 0, Ceres: 4, Pallas: 5, Juno: 2, Vesta: 4 };
    expect(reference.events).toHaveLength(counts[body]);
    for (const event of reference.events) {
      expect(event.widthSeconds).toBeLessThanOrEqual(INGRESS_REFERENCE_RECIPE.maxReferenceBracketSeconds);
      expect(event.bracketStartJdTt).toBeGreaterThan(INGRESS_REFERENCE_RECIPE.startJdTt);
      expect(event.bracketEndJdTt).toBeLessThan(INGRESS_REFERENCE_RECIPE.endJdTt);
      for (const rate of [event.beforeRate, event.afterRate]) {
        expect(rate.convergenceArcsecPerDay).toBeLessThanOrEqual(INGRESS_REFERENCE_RECIPE.maxReferenceLongitudeSpeedDifferenceArcsecPerDay);
        expect(rate.fineLongitudeSpeedDegPerDay).not.toBe(0);
        expect(rate.coarseLongitudeSpeedDegPerDay).not.toBe(0);
        expect(Math.sign(rate.fineLongitudeSpeedDegPerDay)).toBe(Math.sign(rate.coarseLongitudeSpeedDegPerDay));
        expect(Math.abs(rate.fineLongitudeSpeedDegPerDay) * 3600).toBeGreaterThan(ACCEPTANCE_POLICY.limits.longitudeSpeedArcsecPerDay);
        expect(Math.abs(rate.coarseLongitudeSpeedDegPerDay) * 3600).toBeGreaterThan(ACCEPTANCE_POLICY.limits.longitudeSpeedArcsecPerDay);
        expect(rate.fineLongitudeSpeedDegPerDay < 0 ? "retrograde" : "direct").toBe(event.direction);
      }
    }
    if (body === "Vesta") {
      expect(reference.events.filter(event => event.longitudeDeg === 300).map(event => event.direction)).toEqual(["direct", "retrograde", "direct"]);
    }
  }, 30000);
});
