/** Supplemental reference-only corpus. Never used by the coefficient generator. */
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { sha256 } from "./horizons-client.ts";
import { createHorizonsFileClient, makeHorizonsFileRequest, HORIZONS_FILE_GENERATOR, MAX_FILE_RESPONSE_BYTES } from "./horizons-file.ts";
import type { HorizonsFileManifest } from "./horizons-file.ts";
import { assertFullFileSize, verifyFullManifest } from "./full-sources.ts";
import { fullPrintedJd, fullTrainingEpochs, fullValidationCenters } from "./full-recipe.ts";
import type { MinorBody } from "./catalog.ts";
import type { HorizonsRow } from "./horizons-parser.ts";

/** Registered after the original short-difference convergence failure, before this intake. */
export const SPEED_REFERENCE_RECIPE = Object.freeze({
  schema: "minorbodies-speed-reference-recipe-v2",
  reason: "v1-short-distance-differences-failed-convergence;coefficient-fit-and-all-budgets-unchanged",
  centers: "full-recipe-v1-validation-centers",
  offsetsDays: Object.freeze([-1.5, -1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1, 1.5]),
  fineStepDays: 0.25,
  coarseStepDays: 0.5,
  derivative: "seven-point-centered;sixth-order;pair-differences;weights=45,-9,1;denominator=60h",
  requestEpochsPerBatch: 2048,
  requestGrouping: "whole-stencils;overlapping-stencil-ranges-in-one-request;ascending-cluster-packing",
  requestedEpochPrecisionDecimals: 6,
  convergence: "unchanged-v1;one-tenth-of-speed-acceptance-budgets"
} as const);
export const SPEED_GENERATOR = "minorbodies-speed-reference-generator-v2";
export const SPEED_IMPLEMENTATION_FILES = Object.freeze([
  "src/speed-reference-sources.ts", "scripts/generate-speed-reference.ts", "src/horizons-file.ts",
  "src/full-recipe.ts", "src/full-sources.ts", "src/horizons-client.ts", "src/horizons-parser.ts",
  "src/horizons-request.ts", "src/catalog.ts", "src/acceptance.ts"
]);
const project = new URL("../", import.meta.url);
export const speedCacheDirectory = fileURLToPath(new URL(".cache/horizons-speed-reference/", project));
export async function speedGeneratorIdentity() {
  const files = [];
  for (const path of SPEED_IMPLEMENTATION_FILES) files.push({ path, sha256: sha256(await readFile(new URL(path, project))) });
  return { name: SPEED_GENERATOR, nodeVersion: process.version, files };
}
export function speedReferenceEpochs(): readonly number[] {
  const epochs = [...new Set(fullValidationCenters().flatMap(center =>
    SPEED_REFERENCE_RECIPE.offsetsDays.map(offset => fullPrintedJd(center + offset))))].sort((a, b) => a - b);
  const training = new Set(fullTrainingEpochs());
  assert(!epochs.some(epoch => training.has(epoch)), "Supplemental reference epochs must be disjoint from training.");
  return Object.freeze(epochs);
}
export function speedRequests(body: MinorBody) {
  const epochs = speedReferenceEpochs();
  // Adjacent responses can carry tiny numerical offsets. A derivative must never
  // mix responses: merge overlapping stencil ranges and pack whole clusters.
  const clusters: number[][] = [];
  let previous = -Infinity;
  for (const center of fullValidationCenters()) {
    if (center - previous > 3) clusters.push([]);
    clusters.at(-1)!.push(...SPEED_REFERENCE_RECIPE.offsetsDays.map(offset => fullPrintedJd(center + offset)));
    previous = center;
  }
  const batches: number[][] = [];
  let pending: number[] = [];
  for (const cluster of clusters) {
    const ordered = [...new Set(cluster)].sort((a, b) => a - b);
    assert(ordered.length <= SPEED_REFERENCE_RECIPE.requestEpochsPerBatch, "A reference cluster exceeds its request cap.");
    if (pending.length + ordered.length > SPEED_REFERENCE_RECIPE.requestEpochsPerBatch) {
      batches.push(pending);
      pending = [];
    }
    pending.push(...ordered);
  }
  if (pending.length) batches.push(pending);
  assert.deepEqual(batches.flat(), epochs, "Reference batching omitted, duplicated or reordered epochs.");
  const requests = [];
  for (const [index, batch] of batches.entries()) requests.push({ index, request: makeHorizonsFileRequest(body, batch) });
  return requests;
}
export interface SpeedSourceManifest {
  schema: "minorbodies-speed-reference-sources-v2";
  body: MinorBody;
  baseSourceManifestSha256: string;
  recipe: typeof SPEED_REFERENCE_RECIPE;
  recipeSha256: string;
  generator: Awaited<ReturnType<typeof speedGeneratorIdentity>>;
  generatorSha256: string;
  entries: { index: number; manifest: HorizonsFileManifest }[];
}
export function encodeSpeedManifest(source: SpeedSourceManifest): string { return JSON.stringify(source) + "\n"; }

export function verifySpeedManifest(text: string, baseSourceText: string) {
  assertFullFileSize(Buffer.byteLength(text));
  const source = JSON.parse(text) as SpeedSourceManifest;
  assert.deepEqual(Object.keys(source), ["schema", "body", "baseSourceManifestSha256", "recipe", "recipeSha256", "generator", "generatorSha256", "entries"]);
  assert.equal(source.schema, "minorbodies-speed-reference-sources-v2");
  const base = verifyFullManifest(baseSourceText).sourceManifest;
  assert.equal(source.body, base.body);
  assert.equal(source.baseSourceManifestSha256, sha256(baseSourceText));
  assert.deepEqual(source.recipe, SPEED_REFERENCE_RECIPE);
  assert.equal(source.recipeSha256, sha256(JSON.stringify(SPEED_REFERENCE_RECIPE)));
  assert.deepEqual(Object.keys(source.generator), ["name", "nodeVersion", "files"]);
  assert.equal(source.generator.name, SPEED_GENERATOR);
  assert(/^v22\./.test(source.generator.nodeVersion));
  assert.deepEqual(source.generator.files.map(file => file.path), SPEED_IMPLEMENTATION_FILES);
  for (const file of source.generator.files) {
    assert.deepEqual(Object.keys(file), ["path", "sha256"]);
    assert(typeof file.sha256 === "string" && /^[a-f0-9]{64}$/.test(file.sha256));
  }
  assert.equal(source.generatorSha256, sha256(JSON.stringify(source.generator)));
  assert.equal(text, encodeSpeedManifest(source));
  const requests = speedRequests(source.body);
  assert.equal(source.entries.length, requests.length);
  source.entries.forEach((entry, i) => {
    assert.deepEqual(Object.keys(entry), ["index", "manifest"]);
    assert.equal(entry.index, requests[i]!.index);
    const m = entry.manifest;
    assert.deepEqual(Object.keys(m), ["schema", "generator", "requestSha256", "responseSha256", "retrievedAt", "byteLength", "signature", "identity"]);
    assert.equal(m.schema, "minorbodies-horizons-file-capture-v1");
    assert.equal(m.generator, HORIZONS_FILE_GENERATOR);
    assert.equal(m.requestSha256, sha256(JSON.stringify(requests[i]!.request)));
    assert(typeof m.responseSha256 === "string" && /^[a-f0-9]{64}$/.test(m.responseSha256));
    assert(typeof m.retrievedAt === "string" && new Date(m.retrievedAt).toISOString() === m.retrievedAt);
    assert(Number.isSafeInteger(m.byteLength) && m.byteLength > 0 && m.byteLength <= MAX_FILE_RESPONSE_BYTES);
    assert.deepEqual(m.signature, { source: "NASA/JPL Horizons API", version: "1.0" });
    assert.deepEqual(m.identity, base.identity, "Supplemental source uses a different orbit solution.");
  });
  return { source, requests };
}

export async function readSpeedBounded(url: URL): Promise<string> {
  assertFullFileSize((await stat(url)).size);
  return readFile(url, "utf8");
}
/** Original reference bytes and generator identity are mandatory, even for offline validation. */
export async function readSpeedBodySources(body: MinorBody) {
  const text = await readSpeedBounded(new URL(`data/speed-manifests/${body.toLowerCase()}.json`, project));
  const base = await readSpeedBounded(new URL(`data/manifests/${body.toLowerCase()}.json`, project));
  const { source, requests } = verifySpeedManifest(text, base);
  assert.equal(source.body, body);
  assert.deepEqual(source.generator, await speedGeneratorIdentity());
  const client = createHorizonsFileClient({ cacheDirectory: speedCacheDirectory, offline: true });
  const rows: HorizonsRow[] = [];
  for (const [i, request] of requests.entries()) {
    const capture = await client.load(request.request, source.entries[i]!.manifest.responseSha256);
    assert.deepEqual(capture.manifest, source.entries[i]!.manifest);
    rows.push(...capture.response.rows);
  }
  assert.deepEqual(rows.map(row => row.jdTt), speedReferenceEpochs());
  return { rows, sourceManifestSha256: sha256(text), source };
}
