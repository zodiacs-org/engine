import { describe, expect, it } from "vitest";
import { ACCEPTANCE_POLICY } from "../src/acceptance.ts";
import type { MinorBody } from "../src/catalog.ts";
import { SHARD_CONVENTIONS, SHARD_SCHEMA, validateCoefficientShard } from "../src/coefficient-shard.ts";
import { finalEpochs } from "../src/final-recipe.ts";
import { finalAcceptanceFailures, measureFinalAccuracy } from "../src/final-validation.ts";
import { FULL_RECIPE } from "../src/full-recipe.ts";
import type { HorizonsRow } from "../src/horizons-parser.ts";
import { REFERENCE_CONVERGENCE_LIMITS } from "../src/pilot-validation.ts";

describe("final comparison corpus integrity before ERFA or fit evaluation", () => {
  const calculateAt = (): never => { throw new Error("Invalid corpus reached evaluation."); };
  const rows = (): HorizonsRow[] => finalEpochs().map(jdTt => ({
    jdTt, positionAu: [1, 2, 3], velocityAuPerDay: [0, 0, 0]
  }));
  const measure = (validationRows: HorizonsRow[]) => measureFinalAccuracy({
    body: "Chiron", shards: [], validationRows, calculateAt
  });

  it("rejects absent, truncated, reordered and duplicate epochs", async () => {
    const duplicate = rows();
    duplicate[1] = duplicate[0]!;
    for (const corpus of [[], rows().slice(1), rows().reverse(), duplicate]) {
      await expect(measure(corpus)).rejects.toThrow("complete registered final held-out corpus");
    }
  });

  it("rejects sparse input arrays instead of silently omitting a row", async () => {
    const sparse = rows();
    delete sparse[1];
    await expect(measure(sparse)).rejects.toThrow("complete registered final held-out corpus");
  });

  it("rejects nonfinite positions and source velocities even though speeds use positions only", async () => {
    for (const key of ["positionAu", "velocityAuPerDay"] as const) {
      for (const value of [NaN, Infinity, -Infinity]) {
        const corpus = rows();
        corpus[1] = { ...corpus[1]!, [key]: [1, value, 2] };
        await expect(measure(corpus)).rejects.toThrow("finite nonzero vectors");
      }
    }
    const zero = rows();
    zero[1] = { ...zero[1]!, positionAu: [0, 0, 0] };
    await expect(measure(zero)).rejects.toThrow("finite nonzero vectors");
    const overflow = rows();
    overflow[1] = { ...overflow[1]!, positionAu: [1.7e308, 1.7e308, 1.7e308] };
    await expect(measure(overflow)).rejects.toThrow("finite nonzero vectors");
  });

  it("rejects empty coefficients after verifying the full registered corpus", async () => {
    await expect(measure(rows())).rejects.toThrow("missing coefficient shards");
  });

  it("rejects a body outside the registered catalogue", async () => {
    await expect(measureFinalAccuracy({ body: "Eris" as MinorBody, shards: [], validationRows: [], calculateAt }))
      .rejects.toThrow("unknown body");
  });

  it("rejects synthetic provenance and incomplete coefficient coverage", async () => {
    // Invented input exercises rejection, not an astronomical reference or accepted Horizons dataset.
    const shard = validateCoefficientShard({ schema: SHARD_SCHEMA, body: "Chiron", conventions: SHARD_CONVENTIONS,
      provenance: { source: "analytic-test", sourceManifestSha256: "1".repeat(64), generator: "synthetic-rejection",
        generatorSha256: "2".repeat(64) }, validation: "unvalidated",
      segments: [{ startJdTt: FULL_RECIPE.startJdTt, endJdTt: FULL_RECIPE.startJdTt + FULL_RECIPE.segmentDays,
        coefficientsAu: [[1, ...Array(14).fill(0)], Array(15).fill(0), Array(15).fill(0)] }] });
    await expect(measureFinalAccuracy({ body: "Chiron", shards: [shard], validationRows: rows(), calculateAt }))
      .rejects.toThrow("shard body or provenance differs");
    const falseLabel = validateCoefficientShard({ ...shard, provenance: { ...shard.provenance, source: "jpl-horizons" } });
    await expect(measureFinalAccuracy({ body: "Chiron", shards: [falseLabel], validationRows: rows(), calculateAt }))
      .rejects.toThrow("coverage or degree differs");
  });
});

describe("final acceptance accounting retains every original gate", () => {
  const maximaAt = <T extends string>(limits: Readonly<Record<T, number>>, factor = 1) => Object.fromEntries(
    Object.entries(limits).map(([key, value]) => [key, { value: (value as number) * factor, jdTt: FULL_RECIPE.startJdTt }])
  ) as Record<T, { value: number; jdTt: number }>;
  const exact = () => ({ maxima: maximaAt(ACCEPTANCE_POLICY.limits),
    convergenceMaxima: maximaAt(REFERENCE_CONVERGENCE_LIMITS), seamMaxima: maximaAt(FULL_RECIPE.seamLimits),
    retrogradeMismatches: 0 });

  it("admits equality at every original acceptance threshold", () => {
    expect(Object.keys(ACCEPTANCE_POLICY.limits)).toEqual([
      "fitDirectionArcsec", "longitudeArcsec", "latitudeArcsec", "distanceAu",
      "longitudeSpeedArcsecPerDay", "latitudeSpeedArcsecPerDay", "distanceSpeedAuPerDay"
    ]);
    expect(finalAcceptanceFailures(exact())).toEqual([]);
  });

  for (const metric of Object.keys(ACCEPTANCE_POLICY.limits) as (keyof typeof ACCEPTANCE_POLICY.limits)[]) {
    it(`retains the original ${metric} failure`, () => {
      const measurements = exact();
      measurements.maxima[metric].value *= 1.000001;
      expect(finalAcceptanceFailures(measurements)).toEqual([`${metric} exceeds acceptance`]);
    });
  }

  it("collects angular, speed, distance, convergence, seam and state failures together", () => {
    const measurements = { maxima: maximaAt(ACCEPTANCE_POLICY.limits, 2),
      convergenceMaxima: maximaAt(REFERENCE_CONVERGENCE_LIMITS, 2),
      seamMaxima: maximaAt(FULL_RECIPE.seamLimits, 2), retrogradeMismatches: 1 };
    expect(finalAcceptanceFailures(measurements)).toEqual([
      ...Object.keys(ACCEPTANCE_POLICY.limits).map(key => `${key} exceeds acceptance`),
      ...Object.keys(REFERENCE_CONVERGENCE_LIMITS).map(key => `${key} reference difference has not converged`),
      ...Object.keys(FULL_RECIPE.seamLimits).map(key => `${key} seam exceeds acceptance`),
      "retrograde state disagrees with the independent reference away from stations"
    ]);
  });

  it("cannot turn missing, nonfinite or negative maxima into passing results", () => {
    for (const value of [NaN, Infinity, -Infinity, -1]) {
      const measurements = exact();
      measurements.maxima.longitudeArcsec.value = value;
      expect(() => finalAcceptanceFailures(measurements)).toThrow("invalid longitudeArcsec maximum");
    }
    const badEpoch = exact();
    badEpoch.convergenceMaxima.longitudeSpeedArcsecPerDay.jdTt = NaN;
    expect(() => finalAcceptanceFailures(badEpoch)).toThrow("invalid longitudeSpeedArcsecPerDay maximum");
    const missing = exact();
    delete (missing.seamMaxima as Partial<typeof missing.seamMaxima>).positionAu;
    expect(() => finalAcceptanceFailures(missing)).toThrow("invalid positionAu maximum");
    for (const retrogradeMismatches of [NaN, Infinity, -1, 0.5]) {
      expect(() => finalAcceptanceFailures({ ...exact(), retrogradeMismatches })).toThrow("invalid retrograde mismatch count");
    }
  });
});
