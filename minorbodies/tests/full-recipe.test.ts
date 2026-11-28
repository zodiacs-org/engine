import { describe, expect, it } from "vitest";
import { ACCEPTANCE_POLICY } from "../src/acceptance.ts";
import { FULL_RECIPE, assertFullEpochDisjointness, fullSegments, fullTrainingEpochs,
  fullValidationCenters, fullValidationEpochs } from "../src/full-recipe.ts";
import { fullRequests } from "../src/full-sources.ts";
import { MAX_FILE_EPOCHS } from "../src/horizons-file.ts";

describe("preregistered M5 coverage corpus", () => {
  it("covers the target calendar interval with the pilot fit settings", () => {
    const jd = (date: string) => Date.parse(`${date}Z`) / 86400000 + 2440587.5;
    expect(FULL_RECIPE.startJdTt).toBe(jd(ACCEPTANCE_POLICY.targetSpan.start));
    expect(FULL_RECIPE.endJdTt).toBe(jd(ACCEPTANCE_POLICY.targetSpan.endExclusive));
    expect(FULL_RECIPE.bodies).toEqual(["Chiron", "Ceres", "Pallas", "Juno", "Vesta"]);
    expect(FULL_RECIPE.segmentDays).toBe(16);
    expect(FULL_RECIPE.degree).toBe(14);
    expect(FULL_RECIPE.trainingNodesPerSegment).toBe(17);
    expect(FULL_RECIPE.seamLimits).toEqual({ positionAu: 1e-9, velocityAuPerDay: 1e-9 });
    expect(FULL_RECIPE.tuningEpochs).toEqual([]);
    const segments = fullSegments();
    expect(segments).toHaveLength(9154);
    expect(segments[0]!.startJdTt).toBe(FULL_RECIPE.startJdTt);
    expect(segments.at(-1)!.endJdTt).toBe(FULL_RECIPE.endJdTt);
    segments.forEach((segment, index) => {
      expect(segment.endJdTt - segment.startJdTt).toBeLessThanOrEqual(16);
      if (index) expect(segment.startJdTt).toBe(segments[index - 1]!.endJdTt);
      expect(segment.trainingEpochs).toHaveLength(17);
      expect(segment.trainingEpochs[0]).toBeGreaterThan(segment.startJdTt);
      expect(segment.trainingEpochs.at(-1)).toBeLessThan(segment.endJdTt);
    });
  });

  it("keeps every held-out stencil off the training set, including endpoint probes", () => {
    expect(assertFullEpochDisjointness).not.toThrow();
    expect(fullTrainingEpochs()).toHaveLength(155618);
    expect(fullValidationCenters()).toHaveLength(10014);
    const epochs = fullValidationEpochs();
    expect(epochs).toHaveLength(49498);
    expect(epochs[0]).toBe(FULL_RECIPE.startJdTt - 0.01);
    expect(epochs.at(-1)).toBeGreaterThan(FULL_RECIPE.endJdTt);
    expect(new Set(epochs).size).toBe(epochs.length);
    const centers = new Set(fullValidationCenters());
    fullSegments().forEach((segment, i) => {
      if (i > 0 && i % FULL_RECIPE.segmentsPerShard === 0) {
        expect(centers.has(segment.startJdTt)).toBe(true);
        expect(centers.has(segment.startJdTt - 0.02)).toBe(true);
        expect(centers.has(segment.startJdTt + 0.02)).toBe(true);
      }
    });
  });

  it("reconstructs every request exactly in bounded batches", () => {
    const requests = fullRequests("Vesta");
    expect(requests).toHaveLength(101);
    for (const role of ["training", "validation"] as const) {
      const selected = requests.filter(item => item.role === role);
      expect(selected.flatMap(item => [...item.request.epochs])).toEqual(
        role === "training" ? fullTrainingEpochs() : fullValidationEpochs());
      selected.forEach((item, i) => {
        expect(item.index).toBe(i);
        expect(item.request.epochs.length).toBeLessThanOrEqual(MAX_FILE_EPOCHS);
        expect(item.rawFile).toMatch(/^(training|validation)-\d{3}\.json$/);
      });
    }
    expect(fullRequests("Vesta")).toEqual(requests);
  });
});
