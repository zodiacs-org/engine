/** Explicit full-range capture and reproducible offline build. No import-time I/O. */
import assert from "node:assert/strict";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { sha256 } from "../src/horizons-client.ts";
import { createHorizonsFileClient } from "../src/horizons-file.ts";
import { isMinorBody, MINOR_BODY_NAMES } from "../src/catalog.ts";
import type { MinorBody } from "../src/catalog.ts";
import { FULL_RECIPE, fullSegments, fullTrainingEpochs, fullValidationEpochs } from "../src/full-recipe.ts";
import { fitChebyshevSegment } from "../src/chebyshev.ts";
import { assertShardContinuity, encodeCoefficientShard, measureSegmentJoin, SHARD_CONVENTIONS, SHARD_SCHEMA,
  validateCoefficientShard } from "../src/coefficient-shard.ts";
import { FULL_GENERATOR, FULL_IMPLEMENTATION_FILES, FULL_SOURCE_SCHEMA, assertFullFileSize,
  encodeFullSourceManifest, fullRequests, verifyFullManifest, verifyFullSources } from "../src/full-sources.ts";
import type { FullGeneratorIdentity, FullSourceEntry, FullSourceManifest } from "../src/full-sources.ts";

const project = new URL("../", import.meta.url);
export const fullCacheDirectory = fileURLToPath(new URL(".cache/horizons-full/", project));
export async function fullGeneratorIdentity(): Promise<FullGeneratorIdentity> {
  const files = [];
  for (const path of FULL_IMPLEMENTATION_FILES) files.push({ path, sha256: sha256(await readFile(new URL(path, project))) });
  return { name: FULL_GENERATOR, nodeVersion: process.version, files };
}
export async function readFullBounded(url: URL): Promise<string> {
  assertFullFileSize((await stat(url)).size);
  return readFile(url, "utf8");
}
export async function writeFullBounded(url: URL, text: string): Promise<void> {
  assertFullFileSize(Buffer.byteLength(text));
  await writeFile(url, text);
}

export async function readFullBodySources(body: MinorBody) {
  const sourceManifestText = await readFullBounded(new URL(`data/manifests/${body.toLowerCase()}.json`, project));
  const { sourceManifest, requests } = verifyFullManifest(sourceManifestText);
  assert.equal(sourceManifest.body, body);
  const client = createHorizonsFileClient({ cacheDirectory: fullCacheDirectory, offline: true });
  const rawSources = new Map<string, string>();
  for (let i = 0; i < requests.length; i++) {
    const request = requests[i]!;
    const capture = await client.load(request.request, sourceManifest.entries[i]!.manifest.responseSha256);
    assert.deepEqual(capture.manifest, sourceManifest.entries[i]!.manifest);
    rawSources.set(request.rawFile, capture.raw);
  }
  const verified = verifyFullSources(sourceManifestText, rawSources);
  return { ...verified, sourceManifestText, sourceManifestSha256: sha256(sourceManifestText), rawSources };
}

/** Build all segments from frozen training rows. Held-out rows cannot enter the fit. */
export async function prepareFullBody(body: MinorBody) {
  const source = await readFullBodySources(body);
  assert.deepEqual(await fullGeneratorIdentity(), source.sourceManifest.generator,
    "Full generator implementation or Node runtime differs from the frozen manifest.");
  const trainingRows = source.captures.filter(item => item.role === "training").flatMap(item => [...item.capture.response.rows]);
  const validationRows = source.captures.filter(item => item.role === "validation").flatMap(item => [...item.capture.response.rows]);
  assert.deepEqual(trainingRows.map(row => row.jdTt), fullTrainingEpochs());
  assert.deepEqual(validationRows.map(row => row.jdTt), fullValidationEpochs());
  const byEpoch = new Map(trainingRows.map(row => [row.jdTt, row]));
  const segments = fullSegments().map(segment => fitChebyshevSegment({
    startJdTt: segment.startJdTt, endJdTt: segment.endJdTt, degree: FULL_RECIPE.degree,
    samples: segment.trainingEpochs.map(epoch => byEpoch.get(epoch)!)
  }));
  const shards = [];
  const seams = [];
  for (let i = 0; i < segments.length; i += FULL_RECIPE.segmentsPerShard) {
    const shard = validateCoefficientShard({ schema: SHARD_SCHEMA, body, conventions: SHARD_CONVENTIONS,
      provenance: { source: "jpl-horizons", sourceManifestSha256: source.sourceManifestSha256,
        generator: FULL_GENERATOR, generatorSha256: source.sourceManifest.generatorSha256 },
      validation: "unvalidated", segments: segments.slice(i, i + FULL_RECIPE.segmentsPerShard) });
    seams.push(...assertShardContinuity(shard, FULL_RECIPE.seamLimits));
    if (i > 0) {
      const seam = measureSegmentJoin(segments[i - 1]!, segments[i]!);
      assert(seam.positionAu <= FULL_RECIPE.seamLimits.positionAu && seam.velocityAuPerDay <= FULL_RECIPE.seamLimits.velocityAuPerDay,
        "Full dataset has a discontinuous shard boundary.");
      seams.push(seam);
    }
    shards.push({ shard, ...encodeCoefficientShard(shard) });
  }
  // Dynamic import keeps capture/build intake usable without resolving the engine source graph.
  const { loadMinorBodyEphemeris } = await import("../src/ephemeris.ts");
  const ephemeris = await loadMinorBodyEphemeris({ sourceManifestText: source.sourceManifestText,
    sourceManifestSha256: source.sourceManifestSha256, rawSources: source.rawSources, shards });
  return { shards, validationRows, sourceManifestSha256: source.sourceManifestSha256,
    sourceIdentity: source.sourceManifest.identity, generatorSha256: source.sourceManifest.generatorSha256,
    ephemeris, seams };
}

async function captureBody(body: MinorBody): Promise<void> {
  assert(/^v22\./.test(process.version), "Use Node 22 for full-data generation.");
  const directory = new URL("generated/full-sources/", project);
  await mkdir(directory, { recursive: true });
  const client = createHorizonsFileClient({ cacheDirectory: fullCacheDirectory });
  const entries: FullSourceEntry[] = [];
  let identity;
  const requests = fullRequests(body);
  for (const [i, request] of requests.entries()) {
    const capture = await client.load(request.request);
    if (identity) assert.deepEqual(capture.response.identity, identity, "Mixed orbit solutions in full body capture.");
    else identity = capture.response.identity;
    entries.push({ role: request.role, index: request.index, manifest: capture.manifest });
    console.log(`${body} ${i + 1}/${requests.length} ${request.rawFile}: ${capture.manifest.responseSha256}`);
  }
  const generator = await fullGeneratorIdentity();
  const manifest: FullSourceManifest = { schema: FULL_SOURCE_SCHEMA, body, recipe: FULL_RECIPE,
    recipeSha256: sha256(JSON.stringify(FULL_RECIPE)), generator, generatorSha256: sha256(JSON.stringify(generator)),
    identity: identity!, entries };
  const text = encodeFullSourceManifest(manifest);
  verifyFullManifest(text);
  await writeFullBounded(new URL(`${body.toLowerCase()}.json`, directory), text);
}

export async function buildFullBody(body: MinorBody) {
  const prepared = await prepareFullBody(body);
  const directory = new URL(`generated/full/${body.toLowerCase()}/`, project);
  await mkdir(directory, { recursive: true });
  const shards = [];
  for (const [i, shard] of prepared.shards.entries()) {
    const file = `shard-${String(i).padStart(3, "0")}.json`;
    await writeFullBounded(new URL(file, directory), shard.text);
    shards.push({ file, descriptor: shard.descriptor });
  }
  const manifest = { schema: "minorbodies-full-build-v1", body, sourceManifestSha256: prepared.sourceManifestSha256,
    generatorSha256: prepared.generatorSha256, sourceIdentity: prepared.sourceIdentity, shards,
    totalBytes: shards.reduce((sum, item) => sum + item.descriptor.byteLength, 0),
    maxShardBytes: Math.max(...shards.map(item => item.descriptor.byteLength)),
    seamCount: prepared.seams.length,
    seamMaxima: { positionAu: Math.max(...prepared.seams.map(seam => seam.positionAu)),
      velocityAuPerDay: Math.max(...prepared.seams.map(seam => seam.velocityAuPerDay)) } };
  await writeFullBounded(new URL("manifest.json", directory), JSON.stringify(manifest) + "\n");
  console.log(JSON.stringify({ body, sourceManifestSha256: prepared.sourceManifestSha256,
    totalBytes: manifest.totalBytes, maxShardBytes: manifest.maxShardBytes, seamMaxima: manifest.seamMaxima }));
  return manifest;
}

async function main(): Promise<void> {
  const mode = process.argv[2];
  const selected = process.argv[3];
  assert(process.argv.length <= 4 && ["--capture", "--build", "--check"].includes(mode ?? ""),
    "Usage: generate-full.ts --capture|--build|--check [Chiron|Ceres|Pallas|Juno|Vesta]");
  assert(selected === undefined || isMinorBody(selected), "Unknown body.");
  for (const body of selected === undefined ? MINOR_BODY_NAMES : [selected as MinorBody]) {
    if (mode === "--capture") await captureBody(body);
    else if (mode === "--build") await buildFullBody(body);
    else {
      const text = await readFullBounded(new URL(`data/manifests/${body.toLowerCase()}.json`, project));
      const { sourceManifest } = verifyFullManifest(text);
      assert.equal(sourceManifest.body, body);
      assert.deepEqual(sourceManifest.generator, await fullGeneratorIdentity());
      console.log(`${body}: frozen request manifest and generator identity verified (bulk source bytes not checked).`);
    }
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
