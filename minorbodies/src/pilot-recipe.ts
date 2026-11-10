/** Fixed before the first pilot source retrieval. No fitting decisions use holdouts. */
export const PILOT_RECIPE_V1 = Object.freeze({
  schema: "minorbodies-chiron-pilot-recipe-v1",
  body: "Chiron",
  startJdTt: 2451544.5,
  endJdTt: 2451910.5,
  interval: "start-inclusive;end-exclusive",
  segmentDays: 16,
  degree: 14,
  trainingNodesPerSegment: 17,
  trainingNodes: "Chebyshev-Gauss;ascending;rounded-to-JD9",
  holdoutInteriorFractions: Object.freeze([0.1732050807, 0.4312345679, 0.7919876543]),
  holdoutSeamOffsetsDays: Object.freeze([-0.02, 0, 0.02]),
  finalHoldoutInsetDays: 0.000001,
  referenceStencilOffsetsDays: Object.freeze([-0.01, -0.005, 0, 0.005, 0.01]),
  tuningEpochs: Object.freeze([] as number[]),
  seamLimits: Object.freeze({ positionAu: 1e-9, velocityAuPerDay: 1e-9 })
} as const);

/**
 * V1 stopped during source intake, before any fit or held-out inspection:
 * requested 2451665.969996143 TT returned 2451665.969996144 TT. Keep strict
 * parser equality and request microday epochs instead. No degree, segment,
 * sample-selection fraction, accuracy budget or seam limit was changed.
 */
export const PILOT_RECIPE = Object.freeze({
  ...PILOT_RECIPE_V1,
  schema: "minorbodies-chiron-pilot-recipe-v2",
  requestedEpochPrecisionDecimals: 6,
  trainingNodes: "Chebyshev-Gauss;ascending;rounded-to-JD6"
} as const);

export function printedJd(jdTt: number): number {
  return Number(jdTt.toFixed(PILOT_RECIPE.requestedEpochPrecisionDecimals));
}

export function pilotSegments() {
  const segments: Readonly<{ startJdTt: number; endJdTt: number; trainingEpochs: readonly number[] }>[] = [];
  for (let start = PILOT_RECIPE.startJdTt; start < PILOT_RECIPE.endJdTt; start += PILOT_RECIPE.segmentDays) {
    const end = Math.min(start + PILOT_RECIPE.segmentDays, PILOT_RECIPE.endJdTt);
    const count = PILOT_RECIPE.trainingNodesPerSegment;
    const trainingEpochs = Array.from({ length: count }, (_, k) =>
      printedJd(start + (end - start) * (1 - Math.cos(Math.PI * (k + 0.5) / count)) / 2));
    segments.push(Object.freeze({ startJdTt: start, endJdTt: end, trainingEpochs: Object.freeze(trainingEpochs) }));
  }
  return Object.freeze(segments);
}

export function pilotTrainingEpochs(): readonly number[] {
  return Object.freeze(pilotSegments().flatMap(segment => [...segment.trainingEpochs]));
}

export function pilotValidationCenters(): readonly number[] {
  const centers = [PILOT_RECIPE.startJdTt, printedJd(PILOT_RECIPE.endJdTt - PILOT_RECIPE.finalHoldoutInsetDays)];
  for (const segment of pilotSegments()) {
    for (const fraction of PILOT_RECIPE.holdoutInteriorFractions) {
      centers.push(printedJd(segment.startJdTt + fraction * (segment.endJdTt - segment.startJdTt)));
    }
    if (segment.startJdTt !== PILOT_RECIPE.startJdTt) {
      for (const offset of PILOT_RECIPE.holdoutSeamOffsetsDays) centers.push(printedJd(segment.startJdTt + offset));
    }
  }
  return Object.freeze([...new Set(centers)].sort((a, b) => a - b));
}

/** Reference-only stencils can extend past coverage; no fitted position is evaluated there. */
export function pilotValidationEpochs(): readonly number[] {
  const epochs = pilotValidationCenters().flatMap(center =>
    PILOT_RECIPE.referenceStencilOffsetsDays.map(offset => printedJd(center + offset)));
  return Object.freeze([...new Set(epochs)].sort((a, b) => a - b));
}

/** Epoch-set equality is on Horizons' printed precision, including every reference stencil. */
export function assertPilotEpochDisjointness(): void {
  const training = new Set(pilotTrainingEpochs());
  if (training.size !== pilotTrainingEpochs().length ||
      pilotValidationEpochs().some(epoch => training.has(epoch))) {
    throw new Error("Pilot training and held-out reference epochs must be distinct.");
  }
}
