/** Independent pilot comparison. Explicit calls only; no import-time I/O. */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { ACCEPTANCE_POLICY } from "./acceptance.ts";
import { evaluateCoefficientShard, measureShardSeams } from "./coefficient-shard.ts";
import type { CoefficientShard } from "./coefficient-shard.ts";
import type { HorizonsRow } from "./horizons-parser.ts";
import { PILOT_RECIPE, pilotValidationCenters, pilotValidationEpochs, printedJd } from "./pilot-recipe.ts";

/** Fixed before observing the pilot: reference differences receive a tenth of the speed budgets. */
export const REFERENCE_CONVERGENCE_LIMITS = Object.freeze({
  longitudeSpeedArcsecPerDay: ACCEPTANCE_POLICY.limits.longitudeSpeedArcsecPerDay / 10,
  latitudeSpeedArcsecPerDay: ACCEPTANCE_POLICY.limits.latitudeSpeedArcsecPerDay / 10,
  distanceSpeedAuPerDay: ACCEPTANCE_POLICY.limits.distanceSpeedAuPerDay / 10
});

export interface IndependentEclipticRow {
  readonly jdTt: number;
  readonly longitudeDeg: number;
  readonly latitudeDeg: number;
  readonly distanceAu: number;
}
export interface IndependentReference {
  readonly schema: "minorbodies-erfa-reference-v1";
  readonly reference: Readonly<Record<string, string>>;
  readonly samples: readonly IndependentEclipticRow[];
}
export interface PilotMeasuredPosition extends IndependentEclipticRow {
  readonly longitudeSpeedDegPerDay: number;
  readonly latitudeSpeedDegPerDay: number;
  readonly distanceSpeedAuPerDay: number;
  readonly retrograde: boolean;
}
interface Maximum { value: number; jdTt: number; }
type AccuracyMetric = keyof typeof ACCEPTANCE_POLICY.limits;
type ConvergenceMetric = keyof typeof REFERENCE_CONVERGENCE_LIMITS;

function hash(text: string): string { return createHash("sha256").update(text).digest("hex"); }
function fail(message: string): never { throw new Error(`Pilot validation: ${message}`); }

/** Runs the separately installed reference dependency. Missing Python/ERFA is an error, never a skip. */
export async function reduceWithIndependentErfa(
  rows: readonly Pick<HorizonsRow, "jdTt" | "positionAu">[],
  options: Readonly<{ pythonExecutable?: string }> = {}
): Promise<IndependentReference> {
  const root = new URL("../", import.meta.url);
  const script = new URL("scripts/reference-erfa.py", root);
  const requirements = new URL("scripts/requirements-reference.txt", root);
  const python = options.pythonExecutable ?? fileURLToPath(new URL(".cache/reference-venv/bin/python", root));
  const input = JSON.stringify({ samples: rows.map(row => ({ jdTt: row.jdTt, positionAu: row.positionAu })) });
  if (Buffer.byteLength(input) >= ACCEPTANCE_POLICY.maxCommittedFileBytesExclusive) fail("reference request is too large.");
  const completed = spawnSync(python, [fileURLToPath(script)], {
    input, encoding: "utf8", timeout: 60_000,
    maxBuffer: ACCEPTANCE_POLICY.maxCommittedFileBytesExclusive - 1,
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" }
  });
  if (completed.error || completed.status !== 0) {
    fail(`independent ERFA reducer failed; install scripts/requirements-reference.txt in .cache/reference-venv. ${completed.error?.message ?? completed.stderr}`);
  }
  const result = JSON.parse(completed.stdout) as IndependentReference;
  if (result.schema !== "minorbodies-erfa-reference-v1" || !result.reference || !Array.isArray(result.samples)) {
    fail("unknown ERFA result schema.");
  }
  const expected = {
    tool: "minorbodies-erfa-reference-v1", pyerfa: "2.0.1.5", erfa: "2.0.1", sofa: "20231011", numpy: "2.2.6",
    scriptSha256: hash(await readFile(script, "utf8")),
    requirementsSha256: hash(await readFile(requirements, "utf8")),
    frame: "ecliptic-true-of-date;IAU2006/2000A", inputFrame: "ICRF-aligned-geocentric", timeScale: "TT",
    correctionsApplied: "rotation-only;input-already-LT+S;no-deflection",
    formula: "rx(obl06+nut06a.deps,pnm06a) * positionAu"
  };
  if (JSON.stringify(result.reference) !== JSON.stringify(expected)) fail("ERFA result identity differs from the pinned reference.");
  if (result.samples.length !== rows.length) fail("ERFA reference row count differs from the source.");
  result.samples.forEach((row, index) => {
    if (Object.keys(row).join(",") !== "jdTt,longitudeDeg,latitudeDeg,distanceAu" ||
        row.jdTt !== rows[index]!.jdTt || !Object.values(row).every(Number.isFinite) ||
        row.longitudeDeg < 0 || row.longitudeDeg >= 360 || Math.abs(row.latitudeDeg) > 90 || row.distanceAu <= 0) {
      fail("invalid or reordered ERFA reference row.");
    }
  });
  return result;
}

function wrappedDifference(a: number, b: number): number { return ((a - b + 540) % 360 + 360) % 360 - 180; }

/** Position-only finite difference: never reads Horizons velocity columns. */
export function independentReferenceRate(before: IndependentEclipticRow, after: IndependentEclipticRow) {
  const days = after.jdTt - before.jdTt;
  if (!(days > 0)) fail("reference stencil epochs must be ordered.");
  return {
    longitudeSpeedDegPerDay: wrappedDifference(after.longitudeDeg, before.longitudeDeg) / days,
    latitudeSpeedDegPerDay: (after.latitudeDeg - before.latitudeDeg) / days,
    distanceSpeedAuPerDay: (after.distanceAu - before.distanceAu) / days
  };
}

function directionArcsec(a: readonly number[], b: readonly number[]): number {
  const na = Math.hypot(...a);
  const nb = Math.hypot(...b);
  if (!(na > 0) || !(nb > 0)) fail("direction needs nonzero vectors.");
  const u = a.map(value => value / na);
  const v = b.map(value => value / nb);
  const cross = Math.hypot(u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!,
    u[0]! * v[1]! - u[1]! * v[0]!);
  const dot = u[0]! * v[0]! + u[1]! * v[1]! + u[2]! * v[2]!;
  return Math.atan2(cross, dot) * 180 / Math.PI * 3600;
}

function maximaFor<T extends string>(keys: readonly T[], initialEpoch: number): Record<T, Maximum> {
  return Object.fromEntries(keys.map(key => [key, { value: 0, jdTt: initialEpoch }])) as Record<T, Maximum>;
}
function update(maximum: Maximum, value: number, jdTt: number): void {
  if (!Number.isFinite(value) || value < 0) fail("nonfinite or negative error measurement.");
  if (value > maximum.value) { maximum.value = value; maximum.jdTt = jdTt; }
}

/** Reports all registered gates; a failed result is retained by validate-pilot.ts. */
export function measurePilotAccuracy(options: Readonly<{
  shard: CoefficientShard;
  validationRows: readonly HorizonsRow[];
  reference: IndependentReference;
  calculateAt: (jdTt: number) => PilotMeasuredPosition;
}>) {
  const { shard, validationRows, reference, calculateAt } = options;
  const expectedEpochs = pilotValidationEpochs();
  if (JSON.stringify(validationRows.map(row => row.jdTt)) !== JSON.stringify(expectedEpochs) ||
      JSON.stringify(reference.samples.map(row => row.jdTt)) !== JSON.stringify(expectedEpochs)) {
    fail("comparison requires the complete registered held-out corpus.");
  }
  const first = shard.segments[0]!.startJdTt;
  const endExclusive = shard.segments.at(-1)!.endJdTt;
  if (first !== PILOT_RECIPE.startJdTt || endExclusive !== PILOT_RECIPE.endJdTt) fail("unexpected pilot coverage.");
  const centers = pilotValidationCenters();
  const maxima = maximaFor(Object.keys(ACCEPTANCE_POLICY.limits) as AccuracyMetric[], first);
  const convergenceMaxima = maximaFor(Object.keys(REFERENCE_CONVERGENCE_LIMITS) as ConvergenceMetric[], first);
  const reducedByEpoch = new Map(reference.samples.map(row => [row.jdTt, row]));
  let positionSamples = 0;
  let retrogradeSamples = 0;
  let directSamples = 0;
  for (const row of validationRows) {
    if (row.jdTt < first || row.jdTt >= endExclusive) continue; // Reference-only edge stencils.
    const reduced = reducedByEpoch.get(row.jdTt)!;
    const fitted = evaluateCoefficientShard(shard, row.jdTt);
    const actual = calculateAt(row.jdTt);
    if (actual.jdTt !== row.jdTt || actual.retrograde !== (actual.longitudeSpeedDegPerDay < 0)) fail("result clock or retrograde state is inconsistent.");
    positionSamples++;
    update(maxima.fitDirectionArcsec, directionArcsec(fitted.positionAu, row.positionAu), row.jdTt);
    update(maxima.longitudeArcsec, Math.abs(wrappedDifference(actual.longitudeDeg, reduced.longitudeDeg)) * 3600, row.jdTt);
    update(maxima.latitudeArcsec, Math.abs(actual.latitudeDeg - reduced.latitudeDeg) * 3600, row.jdTt);
    update(maxima.distanceAu, Math.abs(actual.distanceAu - reduced.distanceAu), row.jdTt);
  }
  const referenceAt = (jdTt: number): IndependentEclipticRow => {
    const row = reducedByEpoch.get(printedJd(jdTt));
    if (!row) fail("missing reference stencil sample.");
    return row;
  };
  for (const jdTt of centers) {
    const fine = independentReferenceRate(referenceAt(jdTt - 0.005), referenceAt(jdTt + 0.005));
    const coarse = independentReferenceRate(referenceAt(jdTt - 0.01), referenceAt(jdTt + 0.01));
    const actual = calculateAt(jdTt);
    update(maxima.longitudeSpeedArcsecPerDay, Math.abs(actual.longitudeSpeedDegPerDay - fine.longitudeSpeedDegPerDay) * 3600, jdTt);
    update(maxima.latitudeSpeedArcsecPerDay, Math.abs(actual.latitudeSpeedDegPerDay - fine.latitudeSpeedDegPerDay) * 3600, jdTt);
    update(maxima.distanceSpeedAuPerDay, Math.abs(actual.distanceSpeedAuPerDay - fine.distanceSpeedAuPerDay), jdTt);
    update(convergenceMaxima.longitudeSpeedArcsecPerDay, Math.abs(fine.longitudeSpeedDegPerDay - coarse.longitudeSpeedDegPerDay) * 3600, jdTt);
    update(convergenceMaxima.latitudeSpeedArcsecPerDay, Math.abs(fine.latitudeSpeedDegPerDay - coarse.latitudeSpeedDegPerDay) * 3600, jdTt);
    update(convergenceMaxima.distanceSpeedAuPerDay, Math.abs(fine.distanceSpeedAuPerDay - coarse.distanceSpeedAuPerDay), jdTt);
    // Reference states are checked only where their speed exceeds the entire acceptance budget.
    if (Math.abs(fine.longitudeSpeedDegPerDay) * 3600 > ACCEPTANCE_POLICY.limits.longitudeSpeedArcsecPerDay) {
      if (actual.retrograde !== (fine.longitudeSpeedDegPerDay < 0)) fail("retrograde state disagrees with the independent reference away from a station.");
      if (actual.retrograde) retrogradeSamples++; else directSamples++;
    }
  }
  const seams = measureShardSeams(shard);
  const seamMaxima = maximaFor(["positionAu", "velocityAuPerDay"] as const, first);
  for (const seam of seams) {
    update(seamMaxima.positionAu, seam.positionAu, seam.jdTt);
    update(seamMaxima.velocityAuPerDay, seam.velocityAuPerDay, seam.jdTt);
  }
  const failures: string[] = [];
  for (const metric of Object.keys(maxima) as AccuracyMetric[]) {
    if (maxima[metric].value > ACCEPTANCE_POLICY.limits[metric]) failures.push(`${metric} exceeds acceptance`);
  }
  for (const metric of Object.keys(convergenceMaxima) as ConvergenceMetric[]) {
    if (convergenceMaxima[metric].value > REFERENCE_CONVERGENCE_LIMITS[metric]) failures.push(`${metric} reference difference has not converged`);
  }
  for (const metric of ["positionAu", "velocityAuPerDay"] as const) {
    if (seamMaxima[metric].value > PILOT_RECIPE.seamLimits[metric]) failures.push(`${metric} seam exceeds acceptance`);
  }
  return {
    schema: "minorbodies-pilot-accuracy-v1" as const,
    scope: "finite-held-out-pilot-samples;not-full-span-or-physical-error-bounds",
    body: PILOT_RECIPE.body,
    coverage: { startJdTt: first, endJdTtExclusive: endExclusive, scale: "tt" },
    referenceEpochs: { first: expectedEpochs[0]!, last: expectedEpochs.at(-1)!, count: expectedEpochs.length },
    positionSamples, speedSamples: centers.length, seams: seams.length, retrogradeSamples, directSamples,
    acceptance: ACCEPTANCE_POLICY, reference: reference.reference,
    sourceManifestSha256: shard.provenance.sourceManifestSha256,
    generatorSha256: shard.provenance.generatorSha256,
    referenceSpeed: "centered-position-differences;fine=0.005d;coarse=0.01d;actual-epoch-durations",
    maxima, convergenceMaxima, convergenceLimits: REFERENCE_CONVERGENCE_LIMITS,
    seamMaxima, seamLimits: PILOT_RECIPE.seamLimits,
    passed: failures.length === 0, failures
  };
}
