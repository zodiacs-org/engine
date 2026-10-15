/** Explicit data generation. Importing this module has no I/O or network side effects. */
import assert from "node:assert/strict";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join } from "node:path";
import { fitChebyshevSegment } from "../src/chebyshev.ts";
import {
  assertShardContinuity, encodeCoefficientShard, SHARD_CONVENTIONS, SHARD_SCHEMA,
  validateCoefficientShard
} from "../src/coefficient-shard.ts";
import { createHorizonsClient, sha256 } from "../src/horizons-client.ts";
import type { HorizonsCapture } from "../src/horizons-client.ts";
import { assertSameHorizonsSolution } from "../src/horizons-parser.ts";
import {
  PILOT_RECIPE, pilotSegments,
  pilotTrainingEpochs, pilotValidationEpochs
} from "../src/pilot-recipe.ts";

import {
  assertPilotFileSize, encodePilotSourceManifest, PILOT_GENERATOR, PILOT_IMPLEMENTATION_FILES,
  PILOT_SOURCE_SCHEMA, pilotRequests, verifyPilotSources
} from "../src/pilot-sources.ts";
import type { PilotGeneratorIdentity, PilotSourceEntry, PilotSourceManifest } from "../src/pilot-sources.ts";
export { pilotRequests, verifyPilotSources } from "../src/pilot-sources.ts";
export type { PilotSourceManifest } from "../src/pilot-sources.ts";

const project = new URL("../", import.meta.url);
export async function pilotGeneratorIdentity(): Promise<PilotGeneratorIdentity> {
  const files = [];
  for (const path of PILOT_IMPLEMENTATION_FILES) {
    files.push(Object.freeze({ path, sha256: sha256(await readFile(new URL(path, project))) }));
  }
  return Object.freeze({ name: PILOT_GENERATOR, nodeVersion: process.version, files: Object.freeze(files) });
}

async function readBounded(path: string): Promise<string> {
  assertPilotFileSize((await stat(path)).size);
  return readFile(path, "utf8");
}

/** Frozen original inputs regenerate the pilot offline. No outputs are written here. */
export async function preparePilot(options: Readonly<{ fixtureDirectory?: string }> = {}) {
  const fixtureDirectory = options.fixtureDirectory ?? fileURLToPath(new URL("tests/fixtures/pilot/", project));
  const sourceManifestText = await readBounded(join(fixtureDirectory, "manifest.json"));
  const rawFiles = new Map<string, string>();
  // Read only registered local filenames, never unvalidated manifest paths.
  for (const request of pilotRequests()) rawFiles.set(request.rawFile, await readBounded(join(fixtureDirectory, request.rawFile)));
  const { sourceManifest, captures } = verifyPilotSources(sourceManifestText, rawFiles);
  assert.deepEqual(await pilotGeneratorIdentity(), sourceManifest.generator,
    "Pilot generator implementation or Node runtime differs from the frozen source manifest.");
  const trainingRows = captures.filter(record => record.role === "training").flatMap(record => [...record.capture.response.rows]);
  const validationRows = captures.filter(record => record.role === "validation").flatMap(record => [...record.capture.response.rows]);
  assert.deepEqual(trainingRows.map(row => row.jdTt), pilotTrainingEpochs());
  assert.deepEqual(validationRows.map(row => row.jdTt), pilotValidationEpochs());
  const byEpoch = new Map(trainingRows.map(row => [row.jdTt, row]));
  const segments = pilotSegments().map(segment => fitChebyshevSegment({
    startJdTt: segment.startJdTt, endJdTt: segment.endJdTt, degree: PILOT_RECIPE.degree,
    samples: segment.trainingEpochs.map(epoch => byEpoch.get(epoch)!)
  }));
  const shard = validateCoefficientShard({
    schema: SHARD_SCHEMA, body: PILOT_RECIPE.body, conventions: SHARD_CONVENTIONS,
    provenance: { source: "jpl-horizons", sourceManifestSha256: sha256(sourceManifestText),
      generator: PILOT_GENERATOR, generatorSha256: sourceManifest.generatorSha256 },
    validation: "unvalidated", segments
  });
  const seams = assertShardContinuity(shard, PILOT_RECIPE.seamLimits);
  const { text, descriptor } = encodeCoefficientShard(shard);
  return Object.freeze({ sourceManifest, sourceManifestText, captures, shard, descriptor, text,
    validationRows: Object.freeze(validationRows), recipe: PILOT_RECIPE, seams });
}

/** Live intake writes proposed original fixtures only under ignored generated/. */
async function capturePilot(): Promise<void> {
  assert(/^v22\./.test(process.version), "Use Node 22 for the pilot generator.");
  const directory = fileURLToPath(new URL("generated/pilot-sources/", project));
  await mkdir(directory, { recursive: true });
  const client = createHorizonsClient({ cacheDirectory: fileURLToPath(new URL(".cache/horizons-pilot/", project)) });
  const entries: PilotSourceEntry[] = [];
  let first: HorizonsCapture | undefined;
  for (const request of pilotRequests()) {
    const capture = await client.load(request.request);
    if (first) assertSameHorizonsSolution(first.response, capture.response);
    else first = capture;
    await writeFile(join(directory, request.rawFile), capture.raw);
    entries.push(Object.freeze({ role: request.role, request: capture.request, manifest: capture.manifest,
      rawFile: request.rawFile }));
    console.log(`${request.rawFile}: ${capture.response.rows.length} source rows, ${capture.manifest.responseSha256}`);
  }
  const generator = await pilotGeneratorIdentity();
  const manifest: PilotSourceManifest = {
    schema: PILOT_SOURCE_SCHEMA, recipe: PILOT_RECIPE, recipeSha256: sha256(JSON.stringify(PILOT_RECIPE)),
    generator, generatorSha256: sha256(JSON.stringify(generator)), identity: first!.response.identity,
    signature: first!.response.signature, entries
  };
  const text = encodePilotSourceManifest(manifest);
  assertPilotFileSize(Buffer.byteLength(text));
  await writeFile(join(directory, "manifest.json"), text);
  console.log("Proposed sources written to generated/pilot-sources/. Review before retaining the originals.");
}

async function main(): Promise<void> {
  const mode = process.argv[2] ?? "--check";
  assert(process.argv.length <= 3 && ["--capture", "--check", "--build"].includes(mode),
    "Usage: node --experimental-strip-types scripts/generate-pilot.ts [--capture|--check|--build]");
  if (mode === "--capture") return capturePilot();
  const result = await preparePilot();
  if (mode === "--build") {
    const directory = new URL("generated/pilot/", project);
    await mkdir(directory, { recursive: true });
    await writeFile(new URL("chiron.json", directory), result.text);
    await writeFile(new URL("descriptor.json", directory), JSON.stringify(result.descriptor) + "\n");
  }
  console.log(JSON.stringify({ body: result.shard.body, sourceManifestSha256: sha256(result.sourceManifestText),
    shard: result.descriptor, validation: result.shard.validation,
    seamMaxima: { positionAu: Math.max(...result.seams.map(seam => seam.positionAu)),
      velocityAuPerDay: Math.max(...result.seams.map(seam => seam.velocityAuPerDay)) } }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
