import { describe, expect, it } from "vitest";
import { FINAL_RECIPE, finalEpochBatches, finalEpochs, finalPositionEpochs, finalSpeedCenters } from "../src/final-recipe.ts";
import { FULL_RECIPE, fullPrintedJd, fullSegments, fullTrainingEpochs } from "../src/full-recipe.ts";

describe("M11 preregistered final corpus", () => {
  it("fixes the coverage, random seed, density and unchanged derivative settings", () => {
    expect(FINAL_RECIPE).toMatchObject({ schema: "minorbodies-final-recipe-v1", seed: 0x4d31314a,
      startJdTt: 2378496.5, endJdTt: 2524958.5, interiorSamplesPerSegment: 3,
      seamOffsetsDays: [-0.001, 0, 0.001], speedEverySegments: 16,
      fineStepDays: 0.25, coarseStepDays: 0.5, requestEpochsPerBatch: 2048 });
    expect(finalPositionEpochs()[0]).toBe(FULL_RECIPE.startJdTt);
    expect(finalPositionEpochs().at(-1)).toBe(fullPrintedJd(FULL_RECIPE.endJdTt - FULL_RECIPE.finalHoldoutInsetDays));
    expect(finalPositionEpochs()).toHaveLength(54_923);
    expect(finalSpeedCenters()).toHaveLength(592);
    expect(finalEpochs()).toHaveLength(60_843);
    expect(Object.isFrozen(finalEpochs())).toBe(true);
    expect(finalEpochs()).toEqual([...new Set(finalEpochs())].sort((a, b) => a - b));
  });
  it("covers every join on both sides and spreads independent interiors through every segment", () => {
    const epochs = new Set(finalPositionEpochs());
    const ordered = finalPositionEpochs();
    let cursor = 0;
    for (const [index, segment] of fullSegments().entries()) {
      while (cursor < ordered.length && ordered[cursor]! <= segment.startJdTt + 0.01) cursor++;
      const interior = [];
      while (cursor < ordered.length && ordered[cursor]! < segment.endJdTt - 0.01) interior.push(ordered[cursor++]!);
      expect(interior).toHaveLength(FINAL_RECIPE.interiorSamplesPerSegment);
      if (index) for (const offset of FINAL_RECIPE.seamOffsetsDays) expect(epochs.has(fullPrintedJd(segment.startJdTt + offset))).toBe(true);
    }
  });
  it("keeps all final position and derivative epochs outside coefficient training", () => {
    const training = new Set(fullTrainingEpochs());
    expect(finalEpochs().some(epoch => training.has(epoch))).toBe(false);
    const epochs = new Set(finalEpochs());
    for (const center of finalSpeedCenters()) for (const offset of FINAL_RECIPE.offsetsDays) {
      expect(epochs.has(fullPrintedJd(center + offset))).toBe(true);
    }
  });
  it("packs every complete stencil into one bounded source response with no omitted epochs", () => {
    const batches = finalEpochBatches();
    expect(batches.flat()).toEqual(finalEpochs());
    for (const batch of batches) expect(batch.length).toBeLessThanOrEqual(FINAL_RECIPE.requestEpochsPerBatch);
    const batchAt = new Map(batches.flatMap((batch, index) => batch.map(epoch => [epoch, index] as const)));
    for (const center of finalSpeedCenters()) {
      const owners = new Set(FINAL_RECIPE.offsetsDays.map(offset => batchAt.get(fullPrintedJd(center + offset))));
      expect(owners.size).toBe(1);
      expect(owners.has(undefined)).toBe(false);
    }
  });
});
