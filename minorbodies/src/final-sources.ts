/** Reference-only M11 source corpus. Never imported by the coefficient generator. */
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { sha256 } from "./horizons-client.ts";
import { createHorizonsFileClient, makeHorizonsFileRequest, HORIZONS_FILE_GENERATOR, MAX_FILE_RESPONSE_BYTES } from "./horizons-file.ts";
import type { HorizonsFileManifest } from "./horizons-file.ts";
import { verifyFullManifest } from "./full-sources.ts";
import { FINAL_RECIPE, finalEpochBatches, finalEpochs } from "./final-recipe.ts";
import type { MinorBody } from "./catalog.ts";
import type { HorizonsRow } from "./horizons-parser.ts";

const project = new URL("../", import.meta.url);
export const finalCacheDirectory = fileURLToPath(new URL(".cache/horizons-final/", project));
export const FINAL_SOURCE_FILES = Object.freeze([
  "src/final-recipe.ts", "src/final-sources.ts", "scripts/capture-final.ts", "src/full-recipe.ts",
  "src/full-sources.ts", "src/horizons-file.ts", "src/horizons-client.ts", "src/horizons-parser.ts",
  "src/horizons-request.ts", "src/catalog.ts", "src/acceptance.ts"
]);
export async function finalGeneratorIdentity() {
  const files = [];
  for (const path of FINAL_SOURCE_FILES) files.push({ path, sha256: sha256(await readFile(new URL(path, project))) });
  return { name: "minorbodies-final-source-generator-v1", nodeVersion: process.version, files };
}
export function finalRequests(body: MinorBody) {
  return finalEpochBatches().map(epochs => makeHorizonsFileRequest(body, epochs));
}
export interface FinalSourceManifest {
  schema: "minorbodies-final-sources-v1";
  body: MinorBody;
  baseSourceManifestSha256: string;
  recipe: typeof FINAL_RECIPE;
  generator: Awaited<ReturnType<typeof finalGeneratorIdentity>>;
  entries: HorizonsFileManifest[];
}
export const encodeFinalManifest = (source: FinalSourceManifest) => JSON.stringify(source) + "\n";
export async function readFinalBounded(url: URL) {
  assert((await stat(url)).size < 2_000_000, "Final source file exceeds cap.");
  return readFile(url, "utf8");
}
export function verifyFinalManifest(text: string, baseText: string) {
  assert(Buffer.byteLength(text) < 2_000_000);
  const source = JSON.parse(text) as FinalSourceManifest;
  assert.deepEqual(Object.keys(source), ["schema", "body", "baseSourceManifestSha256", "recipe", "generator", "entries"]);
  assert.equal(source.schema, "minorbodies-final-sources-v1");
  const base = verifyFullManifest(baseText).sourceManifest;
  assert.equal(source.body, base.body);
  assert.equal(source.baseSourceManifestSha256, sha256(baseText));
  assert.deepEqual(source.recipe, FINAL_RECIPE);
  assert.deepEqual(Object.keys(source.generator), ["name", "nodeVersion", "files"]);
  assert.equal(source.generator.name, "minorbodies-final-source-generator-v1");
  assert.equal(source.generator.nodeVersion, "v22.22.2");
  assert.deepEqual(source.generator.files.map(file => file.path), FINAL_SOURCE_FILES);
  for (const file of source.generator.files) {
    assert.deepEqual(Object.keys(file), ["path", "sha256"]);
    assert(/^[a-f0-9]{64}$/.test(file.sha256));
  }
  const requests = finalRequests(source.body);
  assert.equal(source.entries.length, requests.length);
  source.entries.forEach((entry, index) => {
    assert.deepEqual(Object.keys(entry), ["schema", "generator", "requestSha256", "responseSha256", "retrievedAt", "byteLength", "signature", "identity"]);
    assert.equal(entry.schema, "minorbodies-horizons-file-capture-v1");
    assert.equal(entry.generator, HORIZONS_FILE_GENERATOR);
    assert.equal(entry.requestSha256, sha256(JSON.stringify(requests[index])));
    assert(/^[a-f0-9]{64}$/.test(entry.responseSha256));
    assert.equal(new Date(entry.retrievedAt).toISOString(), entry.retrievedAt);
    assert(Number.isSafeInteger(entry.byteLength) && entry.byteLength > 0 && entry.byteLength <= MAX_FILE_RESPONSE_BYTES);
    assert.deepEqual(entry.signature, { source: "NASA/JPL Horizons API", version: "1.0" });
    assert.deepEqual(entry.identity, base.identity, "Final reference solution must match frozen fit.");
  });
  assert.equal(text, encodeFinalManifest(source));
  return { source, requests };
}
export async function readFinalBodySources(body: MinorBody) {
  const text = await readFinalBounded(new URL(`data/final-manifests/${body.toLowerCase()}.json`, project));
  const base = await readFinalBounded(new URL(`data/manifests/${body.toLowerCase()}.json`, project));
  const { source, requests } = verifyFinalManifest(text, base);
  assert.equal(source.body, body);
  assert.deepEqual(source.generator, await finalGeneratorIdentity());
  const client = createHorizonsFileClient({ cacheDirectory: finalCacheDirectory, offline: true });
  const rows: HorizonsRow[] = [];
  for (const [index, request] of requests.entries()) {
    const capture = await client.load(request, source.entries[index]!.responseSha256);
    assert.deepEqual(capture.manifest, source.entries[index]);
    rows.push(...capture.response.rows);
  }
  assert.deepEqual(rows.map(row => row.jdTt), finalEpochs());
  return { rows, sourceManifestSha256: sha256(text), source };
}
