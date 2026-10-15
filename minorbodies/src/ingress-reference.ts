/** Independent sign-boundary brackets from retained Horizons positions and ERFA. */
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { isMinorBody } from "./catalog.ts";
import type { MinorBody } from "./catalog.ts";
import { sha256 } from "./horizons-client.ts";
import { decodeHorizonsFileCapture, encodeHorizonsFileCapture, makeHorizonsFileRequest } from "./horizons-file.ts";
import type { HorizonsFileCapture, HorizonsFileRequest } from "./horizons-file.ts";
import { reduceWithIndependentErfa } from "./pilot-validation.ts";
import type { IndependentEclipticRow } from "./pilot-validation.ts";
import { STATION_REFERENCE_RECIPE, stationReferenceEpochs, stationReferenceGeneratorIdentity,
  stationReferenceRates, stationReferenceSourceIdentity, stationScanCenters } from "./station-reference.ts";
import type { StationSourceManifest } from "./station-reference.ts";

/** Fixed before new captures and before comparison with fitted ingress searches. */
export const INGRESS_REFERENCE_RECIPE = Object.freeze({
  schema: "minorbodies-ingress-reference-recipe-v1",
  startJdTt: 2451544.625003,
  endJdTt: 2451909.625003,
  scan: "retained-station-scan;daily-positions;independent-ERFA",
  refinementSubdivisions: 32,
  refinementPasses: 2,
  requestedEpochPrecisionDecimals: 6,
  maximumAdjacentLongitudeStepDeg: 15,
  fineStepDays: 0.25,
  coarseStepDays: 0.5,
  maxReferenceBracketSeconds: STATION_REFERENCE_RECIPE.maxReferenceBracketSeconds,
  ingressAgreementMarginSeconds: STATION_REFERENCE_RECIPE.stationAgreementMarginSeconds,
  maxReferenceLongitudeSpeedDifferenceArcsecPerDay: STATION_REFERENCE_RECIPE.maxReferenceLongitudeSpeedDifferenceArcsecPerDay,
  sourceIdentity: "must-match-frozen-full-range-and-pilot-for-Chiron",
  scope: "finite-calendar-2000-TT-scan;not-full-range-event-completeness"
} as const);
const project = new URL("../", import.meta.url);
const printed = (jd: number) => Number(jd.toFixed(INGRESS_REFERENCE_RECIPE.requestedEpochPrecisionDecimals));
const offset = (longitude: number, boundary: number) => ((longitude - boundary + 540) % 360) - 180;
const boundaries = Object.freeze(Array.from({ length: 12 }, (_, index) => index * 30));
export const INGRESS_REFERENCE_IMPLEMENTATION_FILES = Object.freeze([
  "src/ingress-reference.ts", "scripts/capture-ingress-reference.ts", "src/station-reference.ts",
  "src/reference-derivative.ts", "src/pilot-validation.ts", "src/pilot-recipe.ts", "src/full-recipe.ts",
  "scripts/reference-erfa.py", "scripts/requirements-reference.txt", "src/horizons-file.ts",
  "src/horizons-client.ts", "src/horizons-parser.ts", "src/horizons-request.ts", "src/catalog.ts"
]);
export async function ingressReferenceGeneratorIdentity() {
  const files = [];
  for (const path of INGRESS_REFERENCE_IMPLEMENTATION_FILES) files.push({ path, sha256: sha256(await readFile(new URL(path, project))) });
  return { name: "minorbodies-ingress-reference-generator-v1", nodeVersion: process.version, files };
}
export interface IngressReferenceBracket {
  longitudeDeg: number;
  direction: "direct" | "retrograde";
  before: IndependentEclipticRow;
  after: IndependentEclipticRow;
}

/** A finite reference scan, deliberately separate from the engine root solver. */
export function ingressReferenceBrackets(rows: readonly IndependentEclipticRow[]): IngressReferenceBracket[] {
  const result: IngressReferenceBracket[] = [];
  for (const [index, after] of rows.entries()) {
    assert(Number.isFinite(after.jdTt) && Number.isFinite(after.longitudeDeg) && after.longitudeDeg >= 0 && after.longitudeDeg < 360,
      "Invalid ingress reference position.");
    assert(!boundaries.includes(after.longitudeDeg), "Exact sampled reference ingress requires a revised bracketing recipe.");
    if (index === 0) continue;
    const before = rows[index - 1]!;
    assert(before.jdTt < after.jdTt, "Ingress reference epochs must increase.");
    assert(Math.abs(offset(after.longitudeDeg, before.longitudeDeg)) < INGRESS_REFERENCE_RECIPE.maximumAdjacentLongitudeStepDeg,
      "Reference scan motion exceeds its adjacent-step guard.");
    for (const longitudeDeg of boundaries) {
      const left = offset(before.longitudeDeg, longitudeDeg);
      const right = offset(after.longitudeDeg, longitudeDeg);
      if (Math.abs(left) < 90 && Math.abs(right) < 90 && left * right < 0) {
        result.push({ longitudeDeg, direction: right > left ? "direct" : "retrograde", before, after });
      }
    }
  }
  return result;
}

export function ingressRefinementEpochs(bracket: IngressReferenceBracket) {
  const centers = Array.from({ length: INGRESS_REFERENCE_RECIPE.refinementSubdivisions + 1 }, (_, index) =>
    printed(bracket.before.jdTt + (bracket.after.jdTt - bracket.before.jdTt) * index / INGRESS_REFERENCE_RECIPE.refinementSubdivisions));
  // Zero-width stencils use the existing independent training-exclusion gate.
  return stationReferenceEpochs(centers, 0, 0);
}

async function readBounded(url: URL) {
  assert((await stat(url)).size < 2_000_000, "Reference fixture exceeds file cap.");
  return readFile(url, "utf8");
}
async function retainedScan(body: MinorBody) {
  const directory = new URL(`tests/fixtures/stations/${body.toLowerCase()}/`, project);
  const manifest = JSON.parse(await readBounded(new URL("manifest.json", directory))) as StationSourceManifest;
  assert.equal(manifest.schema, "minorbodies-station-sources-v1");
  assert.equal(manifest.body, body);
  assert.deepEqual(manifest.recipe, STATION_REFERENCE_RECIPE);
  assert.deepEqual(manifest.generator, await stationReferenceGeneratorIdentity());
  const item = manifest.captures.find(capture => capture.name === "scan");
  assert(item, "Missing original station scan capture.");
  const encoded = await readBounded(new URL("scan.json", directory));
  assert.equal(Buffer.byteLength(encoded), item.byteLength);
  assert.equal(sha256(encoded), item.sha256);
  const request = makeHorizonsFileRequest(body, stationReferenceEpochs(stationScanCenters(),
    STATION_REFERENCE_RECIPE.scanFineStepDays, STATION_REFERENCE_RECIPE.scanCoarseStepDays));
  return { capture: decodeHorizonsFileCapture(encoded, request), fixtureSha256: item.sha256 };
}

/** Epoch selection uses only original source positions; fitted outputs are never consulted. */
export async function deriveIngressReference(body: MinorBody,
  load: (name: string, request: HorizonsFileRequest) => Promise<HorizonsFileCapture>) {
  const base = await stationReferenceSourceIdentity(body);
  const original = await retainedScan(body);
  assert.deepEqual(original.capture.response.identity, base.identity, "Ingress scan solution differs from fitted source.");
  const initial = await reduceWithIndependentErfa(original.capture.response.rows);
  const scan = initial.samples.filter(row => row.jdTt >= INGRESS_REFERENCE_RECIPE.startJdTt && row.jdTt <= INGRESS_REFERENCE_RECIPE.endJdTt);
  assert.equal(scan[0]!.jdTt, INGRESS_REFERENCE_RECIPE.startJdTt);
  assert.equal(scan.at(-1)!.jdTt, INGRESS_REFERENCE_RECIPE.endJdTt);
  const sources = [{ name: "retained-station-scan", requestSha256: original.capture.manifest.requestSha256,
    responseSha256: original.capture.manifest.responseSha256, epochs: original.capture.request.epochs.length,
    fixtureSha256: original.fixtureSha256 }];
  const samplesAt = async (name: string, epochs: readonly number[]) => {
    const request = makeHorizonsFileRequest(body, epochs);
    const capture = await load(name, request);
    assert.deepEqual(capture.request, request);
    assert.deepEqual(capture.response.identity, base.identity, "Ingress reference source solution differs from fitted source.");
    const reduced = await reduceWithIndependentErfa(capture.response.rows);
    assert.deepEqual(reduced.reference, initial.reference);
    sources.push({ name, requestSha256: capture.manifest.requestSha256,
      responseSha256: capture.manifest.responseSha256, epochs: request.epochs.length,
      fixtureSha256: sha256(encodeHorizonsFileCapture(capture)) });
    return reduced.samples;
  };
  let brackets = ingressReferenceBrackets(scan);
  for (let pass = 0; pass < INGRESS_REFERENCE_RECIPE.refinementPasses && brackets.length; pass++) {
    const epochsByBracket = brackets.map(ingressRefinementEpochs);
    const epochs = [...new Set(epochsByBracket.flat())].sort((a, b) => a - b);
    const samples = await samplesAt(`refinement-${pass}`, epochs);
    const byEpoch = new Map(samples.map(row => [row.jdTt, row]));
    brackets = brackets.map((bracket, index) => {
      const refined = ingressReferenceBrackets(epochsByBracket[index]!.map(epoch => byEpoch.get(epoch)!));
      assert.equal(refined.length, 1, "Daily bracket must refine to one independent ingress.");
      assert.equal(refined[0]!.longitudeDeg, bracket.longitudeDeg);
      assert.equal(refined[0]!.direction, bracket.direction);
      return refined[0]!;
    });
  }
  const centers = [...new Set(brackets.flatMap(bracket => [bracket.before.jdTt, bracket.after.jdTt]))].sort((a, b) => a - b);
  const rates = centers.length ? stationReferenceRates(await samplesAt("endpoint-stencils", stationReferenceEpochs(centers,
    INGRESS_REFERENCE_RECIPE.fineStepDays, INGRESS_REFERENCE_RECIPE.coarseStepDays)), centers,
  INGRESS_REFERENCE_RECIPE.fineStepDays, INGRESS_REFERENCE_RECIPE.coarseStepDays) : [];
  const byEpoch = new Map(rates.map(rate => [rate.jdTt, rate]));
  const events = brackets.map(bracket => {
    const widthSeconds = (bracket.after.jdTt - bracket.before.jdTt) * 86400;
    assert(widthSeconds <= INGRESS_REFERENCE_RECIPE.maxReferenceBracketSeconds);
    const beforeRate = byEpoch.get(bracket.before.jdTt)!;
    const afterRate = byEpoch.get(bracket.after.jdTt)!;
    for (const rate of [beforeRate, afterRate]) {
      assert(rate.convergenceArcsecPerDay <= INGRESS_REFERENCE_RECIPE.maxReferenceLongitudeSpeedDifferenceArcsecPerDay,
        "Ingress endpoint reference derivative did not converge.");
      assert.equal(rate.fineLongitudeSpeedDegPerDay < 0 ? "retrograde" : "direct", bracket.direction);
      assert.equal(Math.sign(offset(rate.longitudeDeg, bracket.longitudeDeg)),
        Math.sign(offset(rate.jdTt === bracket.before.jdTt ? bracket.before.longitudeDeg : bracket.after.longitudeDeg, bracket.longitudeDeg)),
      "New endpoint capture disagrees with reference bracket side.");
    }
    return { ...bracket, beforeRate, afterRate, widthSeconds,
      bracketStartJdTt: bracket.before.jdTt, bracketEndJdTt: bracket.after.jdTt };
  });
  return { schema: "minorbodies-ingress-reference-v1", body, recipe: INGRESS_REFERENCE_RECIPE,
    recipeSha256: sha256(JSON.stringify(INGRESS_REFERENCE_RECIPE)), baseSourceManifestSha256: base.sourceManifestSha256,
    sourceIdentity: base.identity, reference: initial.reference, sources, scan, events };
}

export interface IngressSourceManifest {
  schema: "minorbodies-ingress-sources-v1";
  body: MinorBody;
  recipe: typeof INGRESS_REFERENCE_RECIPE;
  generator: Awaited<ReturnType<typeof ingressReferenceGeneratorIdentity>>;
  captures: { name: string; sha256: string; byteLength: number }[];
}
export async function readIngressReference(body: MinorBody) {
  assert(isMinorBody(body), "Unknown minor body.");
  const directory = new URL(`tests/fixtures/ingresses/${body.toLowerCase()}/`, project);
  const manifest = JSON.parse(await readBounded(new URL("manifest.json", directory))) as IngressSourceManifest;
  assert.deepEqual(Object.keys(manifest), ["schema", "body", "recipe", "generator", "captures"]);
  assert.equal(manifest.schema, "minorbodies-ingress-sources-v1");
  assert.equal(manifest.body, body);
  assert.deepEqual(manifest.recipe, INGRESS_REFERENCE_RECIPE);
  assert.deepEqual(manifest.generator, await ingressReferenceGeneratorIdentity());
  let next = 0;
  const result = await deriveIngressReference(body, async (name, request) => {
    const item = manifest.captures[next++];
    assert(item, "Missing ingress source manifest entry.");
    assert.deepEqual(Object.keys(item), ["name", "sha256", "byteLength"]);
    assert.equal(item.name, name);
    const encoded = await readBounded(new URL(`${name}.json`, directory));
    assert.equal(Buffer.byteLength(encoded), item.byteLength);
    assert.equal(sha256(encoded), item.sha256);
    return decodeHorizonsFileCapture(encoded, request);
  });
  assert.equal(next, manifest.captures.length, "Unexpected extra ingress source manifest entries.");
  return result;
}
