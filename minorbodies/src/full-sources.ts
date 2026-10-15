/** Reconstructible request manifests. Bulk original bytes stay in the ignored cache. */
import assert from "node:assert/strict";
import { sha256 } from "./horizons-client.ts";
import { createHorizonsFileCapture, makeHorizonsFileRequest, HORIZONS_FILE_GENERATOR, MAX_FILE_RESPONSE_BYTES } from "./horizons-file.ts";
import type { HorizonsFileManifest } from "./horizons-file.ts";
import type { HorizonsIdentity } from "./horizons-parser.ts";
import { isMinorBody, minorBodyDefinition } from "./catalog.ts";
import type { MinorBody } from "./catalog.ts";
import { FULL_RECIPE, assertFullEpochDisjointness, fullTrainingEpochs, fullValidationEpochs } from "./full-recipe.ts";

export const FULL_SOURCE_SCHEMA = "minorbodies-full-sources-v1";
export const FULL_GENERATOR = "minorbodies-full-generator-v1";
export const FULL_IMPLEMENTATION_FILES = Object.freeze([
  "scripts/generate-full.ts", "src/full-recipe.ts", "src/full-sources.ts", "src/horizons-file.ts",
  "src/chebyshev.ts", "src/coefficient-shard.ts", "src/horizons-client.ts", "src/horizons-parser.ts",
  "src/horizons-request.ts", "src/acceptance.ts", "src/catalog.ts"
]);
export interface FullGeneratorIdentity {
  readonly name: typeof FULL_GENERATOR;
  readonly nodeVersion: string;
  readonly files: readonly Readonly<{ path: string; sha256: string }>[];
}
export type FullSourceRole = "training" | "validation";
export interface FullSourceEntry {
  readonly role: FullSourceRole;
  readonly index: number;
  readonly manifest: HorizonsFileManifest;
}
export interface FullSourceManifest {
  readonly schema: typeof FULL_SOURCE_SCHEMA;
  readonly body: MinorBody;
  readonly recipe: typeof FULL_RECIPE;
  readonly recipeSha256: string;
  readonly generator: FullGeneratorIdentity;
  readonly generatorSha256: string;
  readonly identity: HorizonsIdentity;
  readonly entries: readonly FullSourceEntry[];
}

export function fullRequests(body: MinorBody) {
  assert(isMinorBody(body), "Unknown full-dataset body.");
  assertFullEpochDisjointness();
  const requests = [];
  for (const role of ["training", "validation"] as const) {
    const epochs = role === "training" ? fullTrainingEpochs() : fullValidationEpochs();
    for (let offset = 0, index = 0; offset < epochs.length; offset += FULL_RECIPE.requestEpochsPerBatch, index++) {
      requests.push(Object.freeze({ role, index, rawFile: `${role}-${String(index).padStart(3, "0")}.json`,
        request: makeHorizonsFileRequest(body, epochs.slice(offset, offset + FULL_RECIPE.requestEpochsPerBatch)) }));
    }
  }
  return Object.freeze(requests);
}

export function encodeFullSourceManifest(source: FullSourceManifest): string { return JSON.stringify(source) + "\n"; }
export function assertFullFileSize(bytes: number): void {
  assert(bytes > 0 && bytes < 2_000_000, "Full dataset files must be smaller than 2 MB.");
}
function freezeJson(value: unknown): void {
  if (value !== null && typeof value === "object") {
    Object.values(value).forEach(freezeJson);
    Object.freeze(value);
  }
}

/** Checks the compact manifest even when the bulk originals are not installed. */
export function verifyFullManifest(text: string) {
  assertFullFileSize(Buffer.byteLength(text));
  const source = JSON.parse(text) as FullSourceManifest;
  assert.deepEqual(Object.keys(source), ["schema", "body", "recipe", "recipeSha256", "generator", "generatorSha256", "identity", "entries"]);
  assert.equal(source.schema, FULL_SOURCE_SCHEMA);
  assert(isMinorBody(source.body));
  assert.deepEqual(Object.keys(source.identity), ["body", "targetNumber", "targetName", "targetSource", "orbitSolutionDate",
    "orbitEpochJdTdb", "initialPositionAu", "initialVelocityAuPerDay", "centerName", "centerSource", "smallPerturbersSource", "eopFile"]);
  assert.equal(source.identity.body, source.body);
  assert.equal(source.identity.targetNumber, minorBodyDefinition(source.body).number);
  assert.equal(source.identity.centerName, "Earth (399)");
  for (const key of ["targetName", "targetSource", "orbitSolutionDate", "centerSource", "smallPerturbersSource", "eopFile"] as const) {
    assert.equal(typeof source.identity[key], "string");
  }
  assert(new RegExp(`^${source.identity.targetNumber} ${source.body}(?: \\([^()]+\\))?$`).test(source.identity.targetName));
  assert(/^JPL#\d+$/.test(source.identity.targetSource));
  assert(/^\d{4}-[A-Za-z]{3}-\d{2}_\d{2}:\d{2}:\d{2}$/.test(source.identity.orbitSolutionDate));
  assert(Number.isFinite(source.identity.orbitEpochJdTdb) && source.identity.orbitEpochJdTdb > 0);
  for (const vector of [source.identity.initialPositionAu, source.identity.initialVelocityAuPerDay]) {
    assert(Array.isArray(vector) && vector.length === 3 && vector.every(Number.isFinite));
  }
  assert(/^[A-Za-z0-9_.#+-]+$/.test(source.identity.centerSource));
  assert(/^[A-Za-z0-9_.#+-]+$/.test(source.identity.smallPerturbersSource));
  assert(/^eop\.[A-Za-z0-9.]+$/.test(source.identity.eopFile));
  assert.deepEqual(source.recipe, FULL_RECIPE, "Full recipe differs from preregistration.");
  assert.equal(source.recipeSha256, sha256(JSON.stringify(FULL_RECIPE)));
  assert.deepEqual(Object.keys(source.generator), ["name", "nodeVersion", "files"]);
  assert.equal(source.generator.name, FULL_GENERATOR);
  assert(/^v22\./.test(source.generator.nodeVersion));
  assert.deepEqual(source.generator.files.map(file => file.path), FULL_IMPLEMENTATION_FILES);
  for (const file of source.generator.files) {
    assert.deepEqual(Object.keys(file), ["path", "sha256"]);
    assert.equal(typeof file.sha256, "string");
    assert(/^[a-f0-9]{64}$/.test(file.sha256));
  }
  assert.equal(source.generatorSha256, sha256(JSON.stringify(source.generator)));
  assert.equal(text, encodeFullSourceManifest(source), "Noncanonical full source manifest.");
  const requests = fullRequests(source.body);
  assert.equal(source.entries.length, requests.length);
  source.entries.forEach((entry, i) => {
    assert.deepEqual(Object.keys(entry), ["role", "index", "manifest"]);
    assert.deepEqual(Object.keys(entry.manifest), ["schema", "generator", "requestSha256", "responseSha256", "retrievedAt", "byteLength", "signature", "identity"]);
    assert.equal(entry.manifest.schema, "minorbodies-horizons-file-capture-v1");
    assert.equal(entry.manifest.generator, HORIZONS_FILE_GENERATOR);
    assert.deepEqual({ role: entry.role, index: entry.index }, { role: requests[i]!.role, index: requests[i]!.index });
    assert.equal(entry.manifest.requestSha256, sha256(JSON.stringify(requests[i]!.request)));
    assert.deepEqual(entry.manifest.identity, source.identity, "Mixed full-dataset solution identities.");
    assert.deepEqual(entry.manifest.signature, { source: "NASA/JPL Horizons API", version: "1.0" });
    assert.equal(typeof entry.manifest.responseSha256, "string");
    assert(/^[a-f0-9]{64}$/.test(entry.manifest.responseSha256));
    assertFullFileSize(entry.manifest.byteLength);
    assert(Number.isSafeInteger(entry.manifest.byteLength) && entry.manifest.byteLength <= MAX_FILE_RESPONSE_BYTES);
    assert.equal(typeof entry.manifest.retrievedAt, "string");
    assert.equal(new Date(entry.manifest.retrievedAt).toISOString(), entry.manifest.retrievedAt);
  });
  freezeJson(source);
  return Object.freeze({ sourceManifest: source, requests });
}

/** Verifies every original response before admitting coefficients to the evaluator. */
export function verifyFullSources(text: string, rawFiles: ReadonlyMap<string, string>) {
  const { sourceManifest, requests } = verifyFullManifest(text);
  assert.equal(rawFiles.size, requests.length, "Full source corpus is incomplete or has extra files.");
  const captures = requests.map((request, i) => {
    const entry = sourceManifest.entries[i]!;
    const raw = rawFiles.get(request.rawFile);
    assert(typeof raw === "string", "Missing original full dataset response.");
    const capture = createHorizonsFileCapture(request.request, raw, entry.manifest.retrievedAt);
    assert.deepEqual(capture.manifest, entry.manifest, "Full source digest or metadata mismatch.");
    return Object.freeze({ role: request.role, capture });
  });
  return Object.freeze({ sourceManifest, captures: Object.freeze(captures) });
}
