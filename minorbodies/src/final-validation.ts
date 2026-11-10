/** M11 final corpus comparison. Coefficients and original acceptance gates stay frozen. */
import { ACCEPTANCE_POLICY } from "./acceptance.ts";
import { isMinorBody } from "./catalog.ts";
import type { MinorBody } from "./catalog.ts";
import { evaluateCoefficientShard, measureSegmentJoin, measureShardSeams, validateCoefficientShard } from "./coefficient-shard.ts";
import type { CoefficientShard } from "./coefficient-shard.ts";
import { FINAL_RECIPE, finalEpochs, finalPositionEpochs, finalSpeedCenters } from "./final-recipe.ts";
import { FULL_RECIPE, fullPrintedJd, fullSegments, fullTrainingEpochs } from "./full-recipe.ts";
import { assertFullMeasuredPosition, reduceFullWithIndependentErfa } from "./full-validation.ts";
import type { HorizonsRow } from "./horizons-parser.ts";
import { REFERENCE_CONVERGENCE_LIMITS } from "./pilot-validation.ts";
import type { IndependentEclipticRow, PilotMeasuredPosition } from "./pilot-validation.ts";
import { sevenPointReferenceRate } from "./reference-derivative.ts";

interface Maximum { value: number; jdTt: number; }
type AccuracyMetric = keyof typeof ACCEPTANCE_POLICY.limits;
type ConvergenceMetric = keyof typeof REFERENCE_CONVERGENCE_LIMITS;
type SeamMetric = keyof typeof FULL_RECIPE.seamLimits;

function fail(message: string): never { throw new Error(`Final validation: ${message}`); }
function wrappedDifference(a: number, b: number): number { return ((a - b + 540) % 360 + 360) % 360 - 180; }
function directionArcsec(a: readonly number[], b: readonly number[]): number {
  const na = Math.hypot(...a);
  const nb = Math.hypot(...b);
  if (!(na > 0) || !(nb > 0) || !Number.isFinite(na) || !Number.isFinite(nb)) fail("direction needs finite nonzero vectors.");
  const u = a.map(value => value / na);
  const v = b.map(value => value / nb);
  const cross = Math.hypot(u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!,
    u[0]! * v[1]! - u[1]! * v[0]!);
  return Math.atan2(cross, u[0]! * v[0]! + u[1]! * v[1]! + u[2]! * v[2]!) * 180 / Math.PI * 3600;
}
function maximaFor<T extends string>(keys: readonly T[]): Record<T, Maximum> {
  return Object.fromEntries(keys.map(key => [key, { value: 0, jdTt: FULL_RECIPE.startJdTt }])) as Record<T, Maximum>;
}
function update(maximum: Maximum, value: number, jdTt: number): void {
  if (!Number.isFinite(value) || value < 0 || !Number.isFinite(jdTt)) fail("nonfinite or negative error measurement.");
  if (value > maximum.value) { maximum.value = value; maximum.jdTt = jdTt; }
}
function span(epochs: readonly number[]) {
  if (epochs.length === 0) fail("empty measurement epoch list.");
  return { first: epochs[0]!, last: epochs.at(-1)!, count: epochs.length };
}

export interface FinalAccuracyInput {
  readonly body: MinorBody;
  readonly shards: readonly CoefficientShard[];
  readonly validationRows: readonly HorizonsRow[];
  readonly calculateAt: (jdTt: number) => PilotMeasuredPosition;
}

/** All numerical failures are retained together instead of aborting at the first failed gate. */
export function finalAcceptanceFailures(measurements: Readonly<{
  maxima: Readonly<Record<AccuracyMetric, Maximum>>;
  convergenceMaxima: Readonly<Record<ConvergenceMetric, Maximum>>;
  seamMaxima: Readonly<Record<SeamMetric, Maximum>>;
  retrogradeMismatches: number;
}>): string[] {
  const failures: string[] = [];
  const check = <T extends string>(maxima: Readonly<Record<T, Maximum>>, limits: Readonly<Record<T, number>>, suffix: string) => {
    for (const metric of Object.keys(limits) as T[]) {
      const maximum = maxima[metric];
      if (!maximum || !Number.isFinite(maximum.value) || maximum.value < 0 || !Number.isFinite(maximum.jdTt)) {
        fail(`missing or invalid ${metric} maximum.`);
      }
      if (maximum.value > limits[metric]) failures.push(`${metric} ${suffix}`);
    }
  };
  check(measurements.maxima, ACCEPTANCE_POLICY.limits, "exceeds acceptance");
  check(measurements.convergenceMaxima, REFERENCE_CONVERGENCE_LIMITS, "reference difference has not converged");
  check(measurements.seamMaxima, FULL_RECIPE.seamLimits, "seam exceeds acceptance");
  if (!Number.isSafeInteger(measurements.retrogradeMismatches) || measurements.retrogradeMismatches < 0) fail("invalid retrograde mismatch count.");
  if (measurements.retrogradeMismatches) failures.push("retrograde state disagrees with the independent reference away from stations");
  return failures;
}

/** Validate and snapshot the complete corpus before invoking the independent reducer. */
function checkInputs(options: FinalAccuracyInput) {
  if (!isMinorBody(options.body)) fail("unknown body.");
  const expectedEpochs = finalEpochs();
  if (!Array.isArray(options.validationRows) || options.validationRows.length !== expectedEpochs.length) {
    fail("comparison requires the complete registered final held-out corpus.");
  }
  const rows: HorizonsRow[] = [];
  for (let index = 0; index < expectedEpochs.length; index++) {
    const row = options.validationRows[index];
    if (!row || row.jdTt !== expectedEpochs[index] || !Array.isArray(row.positionAu) || row.positionAu.length !== 3 ||
        !Array.isArray(row.velocityAuPerDay) || row.velocityAuPerDay.length !== 3 ||
        ![...row.positionAu, ...row.velocityAuPerDay].every(Number.isFinite) ||
        !(Math.hypot(...row.positionAu) > 0) || !Number.isFinite(Math.hypot(...row.positionAu))) {
      fail("comparison requires the complete registered final held-out corpus with finite nonzero vectors.");
    }
    rows.push(Object.freeze({ jdTt: row.jdTt,
      positionAu: Object.freeze([...row.positionAu]) as HorizonsRow["positionAu"],
      velocityAuPerDay: Object.freeze([...row.velocityAuPerDay]) as HorizonsRow["velocityAuPerDay"] }));
  }
  const training = new Set(fullTrainingEpochs());
  if (expectedEpochs.some(epoch => training.has(epoch))) fail("final corpus overlaps a training epoch.");
  if (!Array.isArray(options.shards) || options.shards.length === 0) fail("missing coefficient shards.");
  const shards = options.shards.map(validateCoefficientShard);
  const provenance = shards[0]!.provenance;
  if (shards.some(shard => shard.body !== options.body || shard.provenance.source !== "jpl-horizons" ||
      JSON.stringify(shard.provenance) !== JSON.stringify(provenance))) fail("shard body or provenance differs.");
  const registeredSegments = fullSegments();
  const segments = shards.flatMap(shard => [...shard.segments]);
  if (segments.length !== registeredSegments.length || segments.some((segment, i) =>
      segment.startJdTt !== registeredSegments[i]!.startJdTt || segment.endJdTt !== registeredSegments[i]!.endJdTt ||
      segment.coefficientsAu.some(axis => axis.length !== FULL_RECIPE.degree + 1))) {
    fail("coefficient coverage or degree differs from the frozen full recipe.");
  }
  return { expectedEpochs, rows, shards, segments, provenance };
}

/** Finite final measurements only, with no continuous-error or physical-uncertainty claim. */
export async function measureFinalAccuracy(options: FinalAccuracyInput) {
  const { expectedEpochs, rows, shards, segments, provenance } = checkInputs(options);
  const reference = await reduceFullWithIndependentErfa(rows);
  // The shared reducer checks each batch; retain an explicit whole-corpus ordering check here.
  if (reference.samples.length !== expectedEpochs.length || reference.samples.some((row, index) =>
      row.jdTt !== expectedEpochs[index] || ![row.jdTt, row.longitudeDeg, row.latitudeDeg, row.distanceAu].every(Number.isFinite) ||
      row.longitudeDeg < 0 || row.longitudeDeg >= 360 || Math.abs(row.latitudeDeg) > 90 || row.distanceAu <= 0)) {
    fail("independent reference omitted, reordered or corrupted a final sample.");
  }
  const centers = finalSpeedCenters();
  const maxima = maximaFor(Object.keys(ACCEPTANCE_POLICY.limits) as AccuracyMetric[]);
  const convergenceMaxima = maximaFor(Object.keys(REFERENCE_CONVERGENCE_LIMITS) as ConvergenceMetric[]);
  const reducedByEpoch = new Map(reference.samples.map(row => [row.jdTt, row]));
  const actualByCenter = new Map<number, PilotMeasuredPosition>();
  const centerSet = new Set(centers);
  let positionSamples = 0;
  let directSamples = 0;
  let retrogradeSamples = 0;
  let retrogradeMismatches = 0;
  let shardIndex = 0;
  for (const row of rows) {
    if (row.jdTt < FULL_RECIPE.startJdTt || row.jdTt >= FULL_RECIPE.endJdTt) continue;
    while (row.jdTt >= shards[shardIndex]!.segments.at(-1)!.endJdTt) shardIndex++;
    const reduced = reducedByEpoch.get(row.jdTt)!;
    const fitted = evaluateCoefficientShard(shards[shardIndex]!, row.jdTt);
    const actual = options.calculateAt(row.jdTt);
    assertFullMeasuredPosition(actual, row.jdTt);
    if (centerSet.has(row.jdTt)) actualByCenter.set(row.jdTt, actual);
    positionSamples++;
    update(maxima.fitDirectionArcsec, directionArcsec(fitted.positionAu, row.positionAu), row.jdTt);
    update(maxima.longitudeArcsec, Math.abs(wrappedDifference(actual.longitudeDeg, reduced.longitudeDeg)) * 3600, row.jdTt);
    update(maxima.latitudeArcsec, Math.abs(actual.latitudeDeg - reduced.latitudeDeg) * 3600, row.jdTt);
    update(maxima.distanceAu, Math.abs(actual.distanceAu - reduced.distanceAu), row.jdTt);
  }
  const referenceAt = (jdTt: number): IndependentEclipticRow => {
    const row = reducedByEpoch.get(fullPrintedJd(jdTt));
    if (!row) fail("missing final reference stencil sample.");
    return row;
  };
  for (const jdTt of centers) {
    const stencil = (step: number) => [-3, -2, -1, 0, 1, 2, 3].map(offset => referenceAt(jdTt + offset * step));
    const fine = sevenPointReferenceRate(stencil(FINAL_RECIPE.fineStepDays));
    const coarse = sevenPointReferenceRate(stencil(FINAL_RECIPE.coarseStepDays));
    const actual = actualByCenter.get(jdTt);
    if (!actual) fail("missing measured final speed center.");
    update(maxima.longitudeSpeedArcsecPerDay, Math.abs(actual.longitudeSpeedDegPerDay - fine.longitudeSpeedDegPerDay) * 3600, jdTt);
    update(maxima.latitudeSpeedArcsecPerDay, Math.abs(actual.latitudeSpeedDegPerDay - fine.latitudeSpeedDegPerDay) * 3600, jdTt);
    update(maxima.distanceSpeedAuPerDay, Math.abs(actual.distanceSpeedAuPerDay - fine.distanceSpeedAuPerDay), jdTt);
    update(convergenceMaxima.longitudeSpeedArcsecPerDay, Math.abs(fine.longitudeSpeedDegPerDay - coarse.longitudeSpeedDegPerDay) * 3600, jdTt);
    update(convergenceMaxima.latitudeSpeedArcsecPerDay, Math.abs(fine.latitudeSpeedDegPerDay - coarse.latitudeSpeedDegPerDay) * 3600, jdTt);
    update(convergenceMaxima.distanceSpeedAuPerDay, Math.abs(fine.distanceSpeedAuPerDay - coarse.distanceSpeedAuPerDay), jdTt);
    if (Math.abs(fine.longitudeSpeedDegPerDay) * 3600 > ACCEPTANCE_POLICY.limits.longitudeSpeedArcsecPerDay) {
      if (actual.retrograde !== (fine.longitudeSpeedDegPerDay < 0)) retrogradeMismatches++;
      if (fine.longitudeSpeedDegPerDay < 0) retrogradeSamples++; else directSamples++;
    }
  }
  const seamMaxima = maximaFor(["positionAu", "velocityAuPerDay"] as const);
  let internalSeams = 0;
  let crossShardSeams = 0;
  for (let index = 0; index < shards.length; index++) {
    const seams = [...measureShardSeams(shards[index]!)];
    internalSeams += seams.length;
    if (index > 0) {
      seams.push(measureSegmentJoin(shards[index - 1]!.segments.at(-1)!, shards[index]!.segments[0]!));
      crossShardSeams++;
    }
    for (const seam of seams) {
      update(seamMaxima.positionAu, seam.positionAu, seam.jdTt);
      update(seamMaxima.velocityAuPerDay, seam.velocityAuPerDay, seam.jdTt);
    }
  }
  if (internalSeams + crossShardSeams !== segments.length - 1) fail("a coefficient join was omitted.");
  const failures = finalAcceptanceFailures({ maxima, convergenceMaxima, seamMaxima, retrogradeMismatches });
  return {
    schema: "minorbodies-final-accuracy-v1" as const,
    scope: "finite-final-held-out-full-coverage-samples;not-continuous-or-physical-error-bounds",
    validationStage: "M11-final-position-corpus",
    body: options.body,
    coverage: { startJdTt: FULL_RECIPE.startJdTt, endJdTtExclusive: FULL_RECIPE.endJdTt, scale: "tt" },
    referenceEpochs: span(expectedEpochs),
    registeredPositionEpochs: span(finalPositionEpochs()),
    measuredPositionEpochs: span(expectedEpochs.filter(jd => jd >= FULL_RECIPE.startJdTt && jd < FULL_RECIPE.endJdTt)),
    speedCenterEpochs: span(centers),
    positionSamples, speedSamples: centers.length, segments: segments.length, shards: shards.length,
    seams: internalSeams + crossShardSeams, internalSeams, crossShardSeams,
    directSamples, retrogradeSamples, retrogradeMismatches,
    acceptance: ACCEPTANCE_POLICY, reference: reference.reference, finalRecipe: FINAL_RECIPE,
    sourceManifestSha256: provenance.sourceManifestSha256, generatorSha256: provenance.generatorSha256,
    referenceSpeed: "seven-point-centered-position-differences;sixth-order;fine=0.25d;coarse=0.5d;actual-epoch-spacing",
    maxima, convergenceMaxima, convergenceLimits: REFERENCE_CONVERGENCE_LIMITS,
    seamMaxima, seamLimits: FULL_RECIPE.seamLimits,
    passed: failures.length === 0, failures
  };
}
