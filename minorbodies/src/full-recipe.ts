/** M5 coverage corpus, fixed before fitting or inspecting full-range residuals. */
import { MINOR_BODY_NAMES } from "./catalog.ts";

export const FULL_RECIPE = Object.freeze({
  schema: "minorbodies-full-recipe-v1",
  bodies: MINOR_BODY_NAMES,
  startJdTt: 2378496.5,
  endJdTt: 2524958.5,
  interval: "start-inclusive;end-exclusive",
  segmentDays: 16,
  degree: 14,
  trainingNodesPerSegment: 17,
  requestedEpochPrecisionDecimals: 6,
  trainingNodes: "Chebyshev-Gauss;ascending;rounded-to-JD6",
  holdoutInteriorFractions: Object.freeze([0.1732050807, 0.4312345679, 0.7919876543]),
  holdoutInteriorSelection: "one-per-segment;fraction-index=segment-index-modulo-3",
  holdoutSeamEverySegments: 32,
  holdoutSeamOffsetsDays: Object.freeze([-0.02, 0, 0.02]),
  finalHoldoutInsetDays: 0.000001,
  referenceStencilOffsetsDays: Object.freeze([-0.01, -0.005, 0, 0.005, 0.01]),
  tuningEpochs: Object.freeze([] as number[]),
  segmentsPerShard: 512,
  requestEpochsPerBatch: 2048,
  seamLimits: Object.freeze({ positionAu: 1e-9, velocityAuPerDay: 1e-9 }),
  validationScope: "M5-coverage-samples;M11-final-corpus-pending"
} as const);

export function fullPrintedJd(jd: number): number { return Number(jd.toFixed(6)); }

export function fullSegments() {
  const segments = [];
  for (let start = FULL_RECIPE.startJdTt; start < FULL_RECIPE.endJdTt; start += FULL_RECIPE.segmentDays) {
    const end = Math.min(start + FULL_RECIPE.segmentDays, FULL_RECIPE.endJdTt);
    const count = FULL_RECIPE.trainingNodesPerSegment;
    const trainingEpochs = Array.from({ length: count }, (_, k) =>
      fullPrintedJd(start + (end - start) * (1 - Math.cos(Math.PI * (k + 0.5) / count)) / 2));
    segments.push(Object.freeze({ startJdTt: start, endJdTt: end, trainingEpochs: Object.freeze(trainingEpochs) }));
  }
  return Object.freeze(segments);
}

export function fullTrainingEpochs(): readonly number[] {
  return Object.freeze(fullSegments().flatMap(segment => [...segment.trainingEpochs]));
}

export function fullValidationCenters(): readonly number[] {
  const centers = [FULL_RECIPE.startJdTt, fullPrintedJd(FULL_RECIPE.endJdTt - FULL_RECIPE.finalHoldoutInsetDays)];
  fullSegments().forEach((segment, index) => {
    const fraction = FULL_RECIPE.holdoutInteriorFractions[index % FULL_RECIPE.holdoutInteriorFractions.length]!;
    centers.push(fullPrintedJd(segment.startJdTt + fraction * (segment.endJdTt - segment.startJdTt)));
    if (index > 0 && index % FULL_RECIPE.holdoutSeamEverySegments === 0) {
      for (const offset of FULL_RECIPE.holdoutSeamOffsetsDays) centers.push(fullPrintedJd(segment.startJdTt + offset));
    }
  });
  return Object.freeze([...new Set(centers)].sort((a, b) => a - b));
}

export function fullValidationEpochs(): readonly number[] {
  return Object.freeze([...new Set(fullValidationCenters().flatMap(center =>
    FULL_RECIPE.referenceStencilOffsetsDays.map(offset => fullPrintedJd(center + offset))))].sort((a, b) => a - b));
}

export function assertFullEpochDisjointness(): void {
  const epochs = fullTrainingEpochs();
  const training = new Set(epochs);
  if (training.size !== epochs.length || fullValidationEpochs().some(epoch => training.has(epoch))) {
    throw new Error("Full training and held-out stencil epochs must be disjoint.");
  }
}
