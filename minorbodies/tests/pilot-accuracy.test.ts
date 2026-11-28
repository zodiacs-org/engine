import { beforeAll, describe, expect, it } from "vitest";
import { ACCEPTANCE_POLICY } from "../src/acceptance.ts";
import { PILOT_RECIPE, pilotValidationCenters, pilotValidationEpochs } from "../src/pilot-recipe.ts";
import { independentReferenceRate, measurePilotAccuracy, REFERENCE_CONVERGENCE_LIMITS } from "../src/pilot-validation.ts";
import { validatePilot } from "../scripts/validate-pilot.ts";

describe("Chiron pilot versus held-out JPL Horizons and independent ERFA", () => {
  let validation: Awaited<ReturnType<typeof validatePilot>>;
  beforeAll(async () => { validation = await validatePilot(); }, 60_000);

  it("checks the entire registered corpus and records its limited coverage", () => {
    const { report, pilot } = validation;
    expect(report.referenceEpochs.count).toBe(pilotValidationEpochs().length);
    expect(report.speedSamples).toBe(pilotValidationCenters().length);
    expect(report.positionSamples).toBe(pilot.validationRows.filter(row =>
      row.jdTt >= PILOT_RECIPE.startJdTt && row.jdTt < PILOT_RECIPE.endJdTt).length);
    expect(report.coverage).toEqual({ startJdTt: PILOT_RECIPE.startJdTt,
      endJdTtExclusive: PILOT_RECIPE.endJdTt, scale: "tt" });
    expect(report.scope).toBe("finite-held-out-pilot-samples;not-full-span-or-physical-error-bounds");
    expect(report.sourceManifestSha256).toBe(pilot.descriptor.sourceManifestSha256);
    expect(report.reference.frame).toBe("ecliptic-true-of-date;IAU2006/2000A");
    expect(report.reference.correctionsApplied).toBe("rotation-only;input-already-LT+S;no-deflection");
  });

  for (const metric of Object.keys(ACCEPTANCE_POLICY.limits) as (keyof typeof ACCEPTANCE_POLICY.limits)[]) {
    it(`asserts the independent ${metric} maximum`, () => {
      const maximum = validation.report.maxima[metric];
      expect(maximum.value).toBeGreaterThanOrEqual(0);
      expect(maximum.value).toBeLessThanOrEqual(ACCEPTANCE_POLICY.limits[metric]);
      expect(maximum.jdTt).toBeGreaterThanOrEqual(PILOT_RECIPE.startJdTt);
      expect(maximum.jdTt).toBeLessThan(PILOT_RECIPE.endJdTt);
    });
  }

  it("requires convergence of the independent position differences", () => {
    for (const metric of Object.keys(REFERENCE_CONVERGENCE_LIMITS) as (keyof typeof REFERENCE_CONVERGENCE_LIMITS)[]) {
      expect(validation.report.convergenceMaxima[metric].value).toBeLessThanOrEqual(REFERENCE_CONVERGENCE_LIMITS[metric]);
    }
  });

  it("gates every position and velocity join", () => {
    expect(validation.report.seams).toBe(validation.pilot.shard.segments.length - 1);
    expect(validation.report.seamMaxima.positionAu.value).toBeLessThanOrEqual(PILOT_RECIPE.seamLimits.positionAu);
    expect(validation.report.seamMaxima.velocityAuPerDay.value).toBeLessThanOrEqual(PILOT_RECIPE.seamLimits.velocityAuPerDay);
    expect(validation.report.passed).toBe(true);
    expect(validation.report.failures).toEqual([]);
  });

  it("checks both direct and retrograde states against reference speeds away from stations", () => {
    expect(validation.report.directSamples).toBeGreaterThan(0);
    expect(validation.report.retrogradeSamples).toBeGreaterThan(0);
  });

  it("fails the accuracy gate for a deliberately biased public longitude", () => {
    const { pilot, reference, ephemeris } = validation;
    const report = measurePilotAccuracy({ shard: pilot.shard, validationRows: pilot.validationRows, reference,
      calculateAt: jdTt => {
        const result = ephemeris.calculate("Chiron", { jd: jdTt, scale: "tt" });
        if (result.status !== "ok") throw new Error("Unexpected pilot refusal");
        return { ...result, longitudeDeg: (result.longitudeDeg + 0.001) % 360 };
      }
    });
    expect(report.passed).toBe(false);
    expect(report.failures).toContain("longitudeArcsec exceeds acceptance");
  });
});

it("differences independent longitudes through the zero-degree wrap using the actual epoch spacing", () => {
  expect(independentReferenceRate({ jdTt: 100, longitudeDeg: 359.75, latitudeDeg: 1, distanceAu: 10 },
    { jdTt: 100.5, longitudeDeg: 0.25, latitudeDeg: 1.5, distanceAu: 10.125 })).toEqual({
    longitudeSpeedDegPerDay: 1, latitudeSpeedDegPerDay: 1, distanceSpeedAuPerDay: 0.25
  });
});
