/** M11 final holdouts, registered before their capture and residual inspection. */
import assert from "node:assert/strict";
import { FULL_RECIPE, fullPrintedJd, fullSegments, fullTrainingEpochs } from "./full-recipe.ts";

export const FINAL_RECIPE = Object.freeze({
  schema: "minorbodies-final-recipe-v1",
  startJdTt: FULL_RECIPE.startJdTt,
  endJdTt: FULL_RECIPE.endJdTt,
  seed: 0x4d31314a,
  random: "uint32-LCG;state=imul(1664525,state)+1013904223;fraction=0.1+0.8*state/2^32",
  interiorSamplesPerSegment: 3,
  seamOffsetsDays: Object.freeze([-0.001, 0, 0.001]),
  speedEverySegments: 16,
  speedSelection: "first-interior-every-16th-segment;every-shard-join;coverage-endpoints",
  offsetsDays: Object.freeze([-1.5, -1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1, 1.5]),
  fineStepDays: 0.25,
  coarseStepDays: 0.5,
  requestedEpochPrecisionDecimals: 6,
  trainingCollisionPolicy: "advance-center-by-0.000001-day-until-entire-stencil-is-disjoint;before-intake",
  requestEpochsPerBatch: 2048,
  batching: "whole-overlapping-speed-stencil-clusters;positions-filled-between-clusters",
  scope: "finite-final-holdouts-throughout-coverage;not-continuous-or-physical-error-bounds",
  fit: "unchanged-frozen-M5-coefficients;M5-suite-remains-mandatory"
} as const);

function corpus() {
  const training = new Set(fullTrainingEpochs());
  let state = FINAL_RECIPE.seed;
  const positions = [FINAL_RECIPE.startJdTt, fullPrintedJd(FINAL_RECIPE.endJdTt - FULL_RECIPE.finalHoldoutInsetDays)];
  const speeds = [...positions];
  for (const [index, segment] of fullSegments().entries()) {
    for (let sample = 0; sample < FINAL_RECIPE.interiorSamplesPerSegment; sample++) {
      state = (Math.imul(1664525, state) + 1013904223) >>> 0;
      let jd = fullPrintedJd(segment.startJdTt + (segment.endJdTt - segment.startJdTt) * (0.1 + 0.8 * state / 2 ** 32));
      const isSpeed = sample === 0 && index % FINAL_RECIPE.speedEverySegments === 0;
      const offsets = isSpeed ? FINAL_RECIPE.offsetsDays : [0];
      while (offsets.some(offset => training.has(fullPrintedJd(jd + offset)))) jd = fullPrintedJd(jd + 0.000001);
      assert(jd > segment.startJdTt && jd < segment.endJdTt);
      positions.push(jd);
      if (isSpeed) speeds.push(jd);
    }
    if (index > 0) {
      positions.push(...FINAL_RECIPE.seamOffsetsDays.map(offset => fullPrintedJd(segment.startJdTt + offset)));
      if (index % FULL_RECIPE.segmentsPerShard === 0) speeds.push(segment.startJdTt);
    }
  }
  const ordered = (values: number[]) => Object.freeze([...new Set(values)].sort((a, b) => a - b));
  const speedCenters = ordered(speeds);
  const positionEpochs = ordered(positions);
  const epochs = ordered([...positions, ...speedCenters.flatMap(center => FINAL_RECIPE.offsetsDays.map(offset => fullPrintedJd(center + offset)))]);
  assert(!epochs.some(jd => training.has(jd)), "Final holdouts must exclude every training epoch.");
  return { positionEpochs, speedCenters, epochs };
}

// Pure construction only; the frozen recipe never reads a fit or a residual.
const registered = corpus();
export const finalPositionEpochs = () => registered.positionEpochs;
export const finalSpeedCenters = () => registered.speedCenters;
export const finalEpochs = () => registered.epochs;

/** No independent derivative ever spans two source responses. */
export function finalEpochBatches(): readonly (readonly number[])[] {
  const ranges: { start: number; end: number }[] = [];
  for (const center of finalSpeedCenters()) {
    const start = fullPrintedJd(center - 1.5);
    const end = fullPrintedJd(center + 1.5);
    const previous = ranges.at(-1);
    if (previous && start <= previous.end) previous.end = Math.max(previous.end, end);
    else ranges.push({ start, end });
  }
  const groups: number[][] = [];
  let rangeIndex = 0;
  let active: number[] | undefined;
  for (const epoch of finalEpochs()) {
    while (ranges[rangeIndex] && epoch > ranges[rangeIndex]!.end) { rangeIndex++; active = undefined; }
    const range = ranges[rangeIndex];
    if (range && epoch >= range.start) {
      if (!active) { active = []; groups.push(active); }
      active.push(epoch);
    } else groups.push([epoch]);
  }
  const batches: number[][] = [];
  let pending: number[] = [];
  for (const group of groups) {
    assert(group.length <= FINAL_RECIPE.requestEpochsPerBatch);
    if (pending.length + group.length > FINAL_RECIPE.requestEpochsPerBatch) { batches.push(pending); pending = []; }
    pending.push(...group);
  }
  if (pending.length) batches.push(pending);
  assert.deepEqual(batches.flat(), finalEpochs());
  return Object.freeze(batches.map(batch => Object.freeze(batch)));
}
