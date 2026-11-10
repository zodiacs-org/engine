/** M5 full-coverage comparison with frozen held-out Horizons rows and independent ERFA. */
import { ACCEPTANCE_POLICY } from "./acceptance.ts";
import { isMinorBody } from "./catalog.ts";
import type { MinorBody } from "./catalog.ts";
import { evaluateCoefficientShard, measureSegmentJoin, measureShardSeams, validateCoefficientShard } from "./coefficient-shard.ts";
import type { CoefficientShard } from "./coefficient-shard.ts";
import { FULL_RECIPE, assertFullEpochDisjointness, fullPrintedJd, fullSegments, fullValidationCenters, fullValidationEpochs } from "./full-recipe.ts";
import type { HorizonsRow } from "./horizons-parser.ts";
import { independentReferenceRate, reduceWithIndependentErfa, REFERENCE_CONVERGENCE_LIMITS } from "./pilot-validation.ts";
import type { IndependentEclipticRow, IndependentReference, PilotMeasuredPosition } from "./pilot-validation.ts";

export const FULL_REFERENCE_BATCH_ROWS = 2_000;
interface Maximum { value: number; jdTt: number; }
type AccuracyMetric = keyof typeof ACCEPTANCE_POLICY.limits;
type ConvergenceMetric = keyof typeof REFERENCE_CONVERGENCE_LIMITS;

function fail(message: string): never { throw new Error(`Full validation: ${message}`); }
function wrappedDifference(a: number, b: number): number { return ((a - b + 540) % 360 + 360) % 360 - 180; }
function directionArcsec(a: readonly number[], b: readonly number[]): number {
  const na = Math.hypot(...a);
  const nb = Math.hypot(...b);
  if (!(na > 0) || !(nb > 0)) fail("direction needs nonzero vectors.");
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
  if (!Number.isFinite(value) || value < 0) fail("nonfinite or negative error measurement.");
  if (value > maximum.value) { maximum.value = value; maximum.jdTt = jdTt; }
}

/** Every subprocess stays below the reference tool's bounded request/response limits. */
export async function reduceFullWithIndependentErfa(rows: readonly HorizonsRow[]): Promise<IndependentReference> {
  if (rows.length === 0) fail("cannot reduce an empty reference corpus.");
  const samples: IndependentEclipticRow[] = [];
  let identity: IndependentReference["reference"] | undefined;
  for (let offset = 0; offset < rows.length; offset += FULL_REFERENCE_BATCH_ROWS) {
    const reference = await reduceWithIndependentErfa(rows.slice(offset, offset + FULL_REFERENCE_BATCH_ROWS));
    if (identity && JSON.stringify(identity) !== JSON.stringify(reference.reference)) fail("reference identity changed between batches.");
    identity = reference.reference;
    samples.push(...reference.samples);
  }
  return { schema: "minorbodies-erfa-reference-v1", reference: identity!, samples };
}

export interface FullAccuracyInput {
  readonly body: MinorBody;
  readonly shards: readonly CoefficientShard[];
  readonly validationRows: readonly HorizonsRow[];
  readonly calculateAt: (jdTt: number) => PilotMeasuredPosition;
}

/** Reject invalid result fields at every position sample, including samples outside speed stencils. */
export function assertFullMeasuredPosition(actual: PilotMeasuredPosition, expectedJdTt: number): void {
  const numbers = [actual.jdTt, actual.longitudeDeg, actual.latitudeDeg, actual.distanceAu,
    actual.longitudeSpeedDegPerDay, actual.latitudeSpeedDegPerDay, actual.distanceSpeedAuPerDay];
  if (!numbers.every(Number.isFinite) || actual.longitudeDeg < 0 || actual.longitudeDeg >= 360 ||
      Math.abs(actual.latitudeDeg) > 90 || actual.distanceAu <= 0) fail("result has invalid numeric fields.");
  if (actual.jdTt !== expectedJdTt || actual.retrograde !== (actual.longitudeSpeedDegPerDay < 0)) {
    fail("result clock or retrograde state is inconsistent.");
  }
}

/** Reject omitted/reordered holdouts or a different recipe before running the independent reference. */
function checkInputs(options: FullAccuracyInput) {
  if (!isMinorBody(options.body)) fail("unknown body.");
  const expectedEpochs = fullValidationEpochs();
  if (options.validationRows.length !== expectedEpochs.length || options.validationRows.some((row, i) =>
    row.jdTt !== expectedEpochs[i] || row.positionAu.length !== 3 || !row.positionAu.every(Number.isFinite) ||
    !(Math.hypot(...row.positionAu) > 0))) fail("comparison requires the complete registered held-out corpus.");
  assertFullEpochDisjointness();
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
    fail("coefficient coverage or degree differs from the registered full recipe.");
  }
  return { expectedEpochs, shards, segments, provenance };
}

/** Reports every acceptance gate without promoting a finite sample to a continuous error bound. */
export async function measureFullAccuracy(options: FullAccuracyInput) {
  const { expectedEpochs, shards, segments, provenance } = checkInputs(options);
  const { body, validationRows, calculateAt } = options;
  const reference = await reduceFullWithIndependentErfa(validationRows);
  const centers = fullValidationCenters();
  const maxima = maximaFor(Object.keys(ACCEPTANCE_POLICY.limits) as AccuracyMetric[]);
  const convergenceMaxima = maximaFor(Object.keys(REFERENCE_CONVERGENCE_LIMITS) as ConvergenceMetric[]);
  const reducedByEpoch = new Map(reference.samples.map(row => [row.jdTt, row]));
  const actualByCenter = new Map<number, PilotMeasuredPosition>();
  const centerSet = new Set(centers);
  let positionSamples = 0;
  let retrogradeSamples = 0;
  let directSamples = 0;
  let retrogradeMismatches = 0;
  let shardIndex = 0;
  for (const row of validationRows) {
    if (row.jdTt < FULL_RECIPE.startJdTt || row.jdTt >= FULL_RECIPE.endJdTt) continue;
    while (row.jdTt >= shards[shardIndex]!.segments.at(-1)!.endJdTt) shardIndex++;
    const reduced = reducedByEpoch.get(row.jdTt)!;
    const fitted = evaluateCoefficientShard(shards[shardIndex]!, row.jdTt);
    const actual = calculateAt(row.jdTt);
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
    if (!row) fail("missing reference stencil sample.");
    return row;
  };
  for (const jdTt of centers) {
    const fine = independentReferenceRate(referenceAt(jdTt - 0.005), referenceAt(jdTt + 0.005));
    const coarse = independentReferenceRate(referenceAt(jdTt - 0.01), referenceAt(jdTt + 0.01));
    const actual = actualByCenter.get(jdTt)!;
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
  const failures: string[] = [];
  for (const metric of Object.keys(maxima) as AccuracyMetric[]) {
    if (maxima[metric].value > ACCEPTANCE_POLICY.limits[metric]) failures.push(`${metric} exceeds acceptance`);
  }
  for (const metric of Object.keys(convergenceMaxima) as ConvergenceMetric[]) {
    if (convergenceMaxima[metric].value > REFERENCE_CONVERGENCE_LIMITS[metric]) failures.push(`${metric} reference difference has not converged`);
  }
  for (const metric of ["positionAu", "velocityAuPerDay"] as const) {
    if (seamMaxima[metric].value > FULL_RECIPE.seamLimits[metric]) failures.push(`${metric} seam exceeds acceptance`);
  }
  if (retrogradeMismatches) failures.push("retrograde state disagrees with the independent reference away from stations");
  return {
    schema: "minorbodies-full-accuracy-v1" as const,
    scope: "finite-held-out-full-coverage-samples;not-continuous-or-physical-error-bounds",
    validationStage: FULL_RECIPE.validationScope,
    body, coverage: { startJdTt: FULL_RECIPE.startJdTt, endJdTtExclusive: FULL_RECIPE.endJdTt, scale: "tt" },
    referenceEpochs: { first: expectedEpochs[0]!, last: expectedEpochs.at(-1)!, count: expectedEpochs.length },
    positionSamples, speedSamples: centers.length, segments: segments.length, shards: shards.length,
    seams: internalSeams + crossShardSeams, internalSeams, crossShardSeams,
    retrogradeSamples, directSamples, retrogradeMismatches,
    acceptance: ACCEPTANCE_POLICY, reference: reference.reference,
    sourceManifestSha256: provenance.sourceManifestSha256, generatorSha256: provenance.generatorSha256,
    referenceSpeed: "centered-position-differences;fine=0.005d;coarse=0.01d;actual-epoch-durations",
    maxima, convergenceMaxima, convergenceLimits: REFERENCE_CONVERGENCE_LIMITS,
    seamMaxima, seamLimits: FULL_RECIPE.seamLimits,
    passed: failures.length === 0, failures
  };
}
