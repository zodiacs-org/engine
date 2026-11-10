/** Reference-only station brackets from original Horizons positions and ERFA. */
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { sha256 } from "./horizons-client.ts";
import { decodeHorizonsFileCapture, makeHorizonsFileRequest } from "./horizons-file.ts";
import type { HorizonsFileCapture, HorizonsFileRequest } from "./horizons-file.ts";
import { fullTrainingEpochs } from "./full-recipe.ts";
import { pilotTrainingEpochs } from "./pilot-recipe.ts";
import { sevenPointReferenceRate } from "./reference-derivative.ts";
import { reduceWithIndependentErfa } from "./pilot-validation.ts";
import type { IndependentEclipticRow } from "./pilot-validation.ts";
import { isMinorBody } from "./catalog.ts";
import type { MinorBody } from "./catalog.ts";

/** Frozen before requesting station sources or evaluating package station results. */
export const STATION_REFERENCE_RECIPE_V1 = Object.freeze({
  schema: "minorbodies-station-reference-recipe-v1",
  startJdTt: 2451544.5,
  endJdTtExclusive: 2451910.5,
  scanFirstCenterJdTt: 2451544.625,
  scanLastCenterJdTt: 2451910.625,
  scanStepDays: 1,
  scanFineStepDays: 1,
  scanCoarseStepDays: 2,
  refinementSubdivisions: 32,
  refinementPasses: 2,
  fineStepDays: 0.25,
  coarseStepDays: 0.5,
  requestedEpochPrecisionDecimals: 6,
  referenceDerivative: "seven-point-centered;sixth-order;position-only;no-source-velocity",
  maxReferenceLongitudeSpeedDifferenceArcsecPerDay: 0.01,
  maxReferenceBracketSeconds: 85,
  stationAgreementMarginSeconds: 300,
  sourceIdentity: "must-match-frozen-full-range-and-pilot-for-Chiron",
  scope: "synthetic-calendar-2000-TT;finite-reference-brackets;not-full-range-event-completeness"
} as const);
/** V1 stopped on a training-midpoint overlap after its first scan, before package evaluation. */
export const STATION_REFERENCE_RECIPE = Object.freeze({
  ...STATION_REFERENCE_RECIPE_V1,
  schema: "minorbodies-station-reference-recipe-v2",
  reason: "v1-refinement-epochs-overlap-training-midpoints;only-scan-phase-shifted",
  scanFirstCenterJdTt: 2451544.625003,
  scanLastCenterJdTt: 2451910.625003
} as const);
const project = new URL("../", import.meta.url);
export const STATION_REFERENCE_IMPLEMENTATION_FILES = Object.freeze([
  "src/station-reference.ts", "scripts/capture-station-reference.ts", "src/reference-derivative.ts",
  "src/pilot-validation.ts", "src/pilot-recipe.ts", "src/full-recipe.ts",
  "scripts/reference-erfa.py", "scripts/requirements-reference.txt", "src/horizons-file.ts",
  "src/horizons-client.ts", "src/horizons-parser.ts", "src/horizons-request.ts", "src/catalog.ts"
]);
export async function stationReferenceGeneratorIdentity() {
  const files = [];
  for (const path of STATION_REFERENCE_IMPLEMENTATION_FILES) files.push({ path, sha256: sha256(await readFile(new URL(path, project))) });
  return { name: "minorbodies-station-reference-generator-v1", nodeVersion: process.version, files };
}
const printed = (jd: number) => Number(jd.toFixed(STATION_REFERENCE_RECIPE.requestedEpochPrecisionDecimals));
export function stationScanCenters() {
  const centers = [];
  for (let jd = STATION_REFERENCE_RECIPE.scanFirstCenterJdTt; jd <= STATION_REFERENCE_RECIPE.scanLastCenterJdTt; jd += STATION_REFERENCE_RECIPE.scanStepDays) centers.push(jd);
  return centers;
}
export function stationReferenceEpochs(centers: readonly number[], fineStep: number, coarseStep: number) {
  const epochs = [...new Set(centers.flatMap(center => [fineStep, coarseStep].flatMap(step =>
    Array.from({ length: 7 }, (_, i) => printed(center + (i - 3) * step)))))].sort((a, b) => a - b);
  const training = new Set([...pilotTrainingEpochs(), ...fullTrainingEpochs()]);
  assert(!epochs.some(epoch => training.has(epoch)), "Station reference epochs overlap coefficient training.");
  return epochs;
}
export interface StationReferenceRate {
  jdTt: number;
  longitudeDeg: number;
  fineLongitudeSpeedDegPerDay: number;
  coarseLongitudeSpeedDegPerDay: number;
  convergenceArcsecPerDay: number;
}
export interface StationReferenceBracket {
  direction: "direct-to-retrograde" | "retrograde-to-direct";
  before: StationReferenceRate;
  after: StationReferenceRate;
}
export function stationReferenceRates(rows: readonly IndependentEclipticRow[], centers: readonly number[], fineStep: number, coarseStep: number) {
  const byEpoch = new Map(rows.map(row => [row.jdTt, row]));
  assert.equal(byEpoch.size, rows.length, "Duplicate station reference epochs.");
  return centers.map(jdTt => {
    const rateAt = (step: number) => sevenPointReferenceRate(Array.from({ length: 7 }, (_, i) => {
      const row = byEpoch.get(printed(jdTt + (i - 3) * step));
      assert(row, "Missing station reference stencil position.");
      return row;
    })).longitudeSpeedDegPerDay;
    const fineLongitudeSpeedDegPerDay = rateAt(fineStep);
    const coarseLongitudeSpeedDegPerDay = rateAt(coarseStep);
    const center = byEpoch.get(jdTt);
    assert(center, "Missing station reference center.");
    return { jdTt, longitudeDeg: center.longitudeDeg, fineLongitudeSpeedDegPerDay,
      coarseLongitudeSpeedDegPerDay,
      convergenceArcsecPerDay: Math.abs(fineLongitudeSpeedDegPerDay - coarseLongitudeSpeedDegPerDay) * 3600 };
  });
}
export function stationReferenceBrackets(rates: readonly StationReferenceRate[]) {
  const brackets: StationReferenceBracket[] = [];
  for (let i = 0; i < rates.length; i++) {
    const row = rates[i]!;
    assert(row.fineLongitudeSpeedDegPerDay !== 0 && row.coarseLongitudeSpeedDegPerDay !== 0,
      "Exact sampled reference station requires a revised preregistered bracketing recipe.");
    assert.equal(Math.sign(row.fineLongitudeSpeedDegPerDay), Math.sign(row.coarseLongitudeSpeedDegPerDay),
      "Independent derivative stencils disagree about a sampled station side.");
    if (i === 0) continue;
    const before = rates[i - 1]!;
    assert(before.jdTt < row.jdTt, "Station reference centers must increase.");
    if (Math.sign(before.fineLongitudeSpeedDegPerDay) !== Math.sign(row.fineLongitudeSpeedDegPerDay)) {
      brackets.push({ direction: before.fineLongitudeSpeedDegPerDay > 0 ? "direct-to-retrograde" : "retrograde-to-direct", before, after: row });
    }
  }
  return brackets;
}
function refineCenters(bracket: StationReferenceBracket) {
  return Array.from({ length: STATION_REFERENCE_RECIPE.refinementSubdivisions + 1 }, (_, i) =>
    printed(bracket.before.jdTt + (bracket.after.jdTt - bracket.before.jdTt) * i / STATION_REFERENCE_RECIPE.refinementSubdivisions));
}
export async function stationReferenceSourceIdentity(body: MinorBody) {
  assert(isMinorBody(body), "Unknown minor body.");
  const text = await readFile(new URL(`data/manifests/${body.toLowerCase()}.json`, project), "utf8");
  const base = JSON.parse(text) as { body: MinorBody; identity: unknown };
  assert.equal(base.body, body);
  if (body === "Chiron") {
    const pilot = JSON.parse(await readFile(new URL("tests/fixtures/pilot/manifest.json", project), "utf8")) as { identity: unknown };
    assert.deepEqual(base.identity, pilot.identity, "Station reference must match both Chiron datasets.");
  }
  return { identity: base.identity, sourceManifestSha256: sha256(text) };
}
/** Loader receives only independently chosen epochs; it cannot consult fitted outputs. */
export async function deriveStationReference(body: MinorBody,
  load: (name: string, request: HorizonsFileRequest) => Promise<HorizonsFileCapture>) {
  const base = await stationReferenceSourceIdentity(body);
  const sources: { name: string; requestSha256: string; responseSha256: string; epochs: number }[] = [];
  let referenceMetadata: Readonly<Record<string, string>> | undefined;
  const ratesAt = async (name: string, centers: readonly number[], fineStep: number, coarseStep: number) => {
    const request = makeHorizonsFileRequest(body, stationReferenceEpochs(centers, fineStep, coarseStep));
    const capture = await load(name, request);
    assert.deepEqual(capture.request, request);
    assert.deepEqual(capture.response.identity, base.identity, "Station reference source solution differs from fitted source.");
    const reference = await reduceWithIndependentErfa(capture.response.rows);
    if (referenceMetadata) assert.deepEqual(reference.reference, referenceMetadata); else referenceMetadata = reference.reference;
    sources.push({ name, requestSha256: capture.manifest.requestSha256,
      responseSha256: capture.manifest.responseSha256, epochs: request.epochs.length });
    return stationReferenceRates(reference.samples, centers, fineStep, coarseStep);
  };
  const scan = await ratesAt("scan", stationScanCenters(), STATION_REFERENCE_RECIPE.scanFineStepDays, STATION_REFERENCE_RECIPE.scanCoarseStepDays);
  const initialBrackets = stationReferenceBrackets(scan);
  assert(initialBrackets.length > 0, "Reference scan found no station brackets.");
  const events = [];
  for (const [index, initialBracket] of initialBrackets.entries()) {
    let bracket = initialBracket;
    for (let pass = 0; pass < STATION_REFERENCE_RECIPE.refinementPasses; pass++) {
      const rates = await ratesAt(`event-${index}-pass-${pass}`, refineCenters(bracket), STATION_REFERENCE_RECIPE.fineStepDays, STATION_REFERENCE_RECIPE.coarseStepDays);
      assert(rates.every(rate => rate.convergenceArcsecPerDay <= STATION_REFERENCE_RECIPE.maxReferenceLongitudeSpeedDifferenceArcsecPerDay),
        "Reference station derivative did not converge.");
      const refined = stationReferenceBrackets(rates);
      assert.equal(refined.length, 1, "A daily bracket must refine to one independently bracketed event.");
      assert.equal(refined[0]!.direction, initialBracket.direction);
      bracket = refined[0]!;
    }
    const widthSeconds = (bracket.after.jdTt - bracket.before.jdTt) * 86400;
    assert(widthSeconds <= STATION_REFERENCE_RECIPE.maxReferenceBracketSeconds);
    assert(bracket.before.jdTt >= STATION_REFERENCE_RECIPE.startJdTt && bracket.after.jdTt < STATION_REFERENCE_RECIPE.endJdTtExclusive);
    events.push({ ...bracket, bracketStartJdTt: bracket.before.jdTt, bracketEndJdTt: bracket.after.jdTt,
      jdTt: (bracket.before.jdTt + bracket.after.jdTt) / 2, widthSeconds });
  }
  return { schema: "minorbodies-station-reference-v1", body, recipe: STATION_REFERENCE_RECIPE,
    recipeSha256: sha256(JSON.stringify(STATION_REFERENCE_RECIPE)), baseSourceManifestSha256: base.sourceManifestSha256,
    sourceIdentity: base.identity, reference: referenceMetadata!, sources, events };
}

export interface StationSourceManifest {
  schema: "minorbodies-station-sources-v1";
  body: MinorBody;
  recipe: typeof STATION_REFERENCE_RECIPE;
  generator: Awaited<ReturnType<typeof stationReferenceGeneratorIdentity>>;
  captures: { name: string; sha256: string; byteLength: number }[];
}
export async function readStationReference(body: MinorBody) {
  assert(isMinorBody(body), "Unknown minor body.");
  const directory = new URL(`tests/fixtures/stations/${body.toLowerCase()}/`, project);
  const readBounded = async (url: URL) => {
    assert((await stat(url)).size < 2_000_000, "Reference fixture exceeds file cap.");
    return readFile(url, "utf8");
  };
  const manifest = JSON.parse(await readBounded(new URL("manifest.json", directory))) as StationSourceManifest;
  assert.deepEqual(Object.keys(manifest), ["schema", "body", "recipe", "generator", "captures"]);
  assert.equal(manifest.schema, "minorbodies-station-sources-v1");
  assert.equal(manifest.body, body);
  assert.deepEqual(manifest.recipe, STATION_REFERENCE_RECIPE);
  assert.deepEqual(manifest.generator, await stationReferenceGeneratorIdentity());
  let next = 0;
  const result = await deriveStationReference(body, async (name, request) => {
    const item = manifest.captures[next++];
    assert(item, "Missing station source manifest entry.");
    assert.deepEqual(Object.keys(item), ["name", "sha256", "byteLength"]);
    assert.equal(item.name, name);
    const encoded = await readBounded(new URL(`${name}.json`, directory));
    assert.equal(Buffer.byteLength(encoded), item.byteLength);
    assert.equal(sha256(encoded), item.sha256);
    return decodeHorizonsFileCapture(encoded, request);
  });
  assert.equal(next, manifest.captures.length, "Unexpected extra station source manifest entries.");
  return result;
}
