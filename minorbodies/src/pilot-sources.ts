/** Frozen pilot source verification. Importing this module performs no I/O. */
import assert from "node:assert/strict";
import { decodeHorizonsCapture, sha256 } from "./horizons-client.ts";
import type { HorizonsManifest } from "./horizons-client.ts";
import { assertSameHorizonsSolution } from "./horizons-parser.ts";
import type { HorizonsIdentity, HorizonsResponse } from "./horizons-parser.ts";
import { makeHorizonsRequest, MAX_HORIZONS_EPOCHS } from "./horizons-request.ts";
import type { HorizonsRequest } from "./horizons-request.ts";
import { assertPilotEpochDisjointness, PILOT_RECIPE, pilotTrainingEpochs, pilotValidationEpochs } from "./pilot-recipe.ts";

export const PILOT_GENERATOR = "minorbodies-chiron-pilot-v1";
export const PILOT_SOURCE_SCHEMA = "minorbodies-pilot-sources-v1";
export const PILOT_IMPLEMENTATION_FILES = Object.freeze([
  "scripts/generate-pilot.ts", "src/pilot-recipe.ts", "src/pilot-sources.ts", "src/chebyshev.ts",
  "src/coefficient-shard.ts", "src/horizons-client.ts", "src/horizons-parser.ts",
  "src/horizons-request.ts", "src/acceptance.ts", "src/catalog.ts"
]);

export type PilotSourceRole = "training" | "validation";
export interface PilotSourceEntry {
  readonly role: PilotSourceRole;
  readonly request: HorizonsRequest;
  readonly manifest: HorizonsManifest;
  readonly rawFile: string;
}
export interface PilotGeneratorIdentity {
  readonly name: typeof PILOT_GENERATOR;
  readonly nodeVersion: string;
  readonly files: readonly Readonly<{ path: string; sha256: string }>[];
}
export interface PilotSourceManifest {
  readonly schema: typeof PILOT_SOURCE_SCHEMA;
  readonly recipe: typeof PILOT_RECIPE;
  readonly recipeSha256: string;
  readonly generator: PilotGeneratorIdentity;
  readonly generatorSha256: string;
  readonly identity: HorizonsIdentity;
  readonly signature: HorizonsResponse["signature"];
  readonly entries: readonly PilotSourceEntry[];
}

export const MAX_PILOT_REQUEST_EPOCHS = Math.min(32, MAX_HORIZONS_EPOCHS);

export function pilotRequests() {
  assertPilotEpochDisjointness();
  const requests: Readonly<{ role: PilotSourceRole; request: HorizonsRequest; rawFile: string }>[] = [];
  for (const role of ["training", "validation"] as const) {
    const epochs = role === "training" ? pilotTrainingEpochs() : pilotValidationEpochs();
    for (let offset = 0, index = 0; offset < epochs.length; offset += MAX_PILOT_REQUEST_EPOCHS, index++) {
      requests.push(Object.freeze({ role,
        request: makeHorizonsRequest(PILOT_RECIPE.body, epochs.slice(offset, offset + MAX_PILOT_REQUEST_EPOCHS)),
        rawFile: `${role}-${String(index).padStart(3, "0")}.json`
      }));
    }
  }
  return Object.freeze(requests);
}

export function encodePilotSourceManifest(manifest: PilotSourceManifest): string { return JSON.stringify(manifest) + "\n"; }
export function assertPilotFileSize(bytes: number): void {
  assert(bytes > 0 && bytes < 2_000_000, "Pilot files must stay below 2 MB.");
}
function freezeJson(value: unknown): void {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) freezeJson(child);
    Object.freeze(value);
  }
}
/** No filesystem or network access. Verifies the full corpus before any fit. */
export function verifyPilotSources(sourceManifestText: string, rawFiles: ReadonlyMap<string, string>) {
  assertPilotFileSize(Buffer.byteLength(sourceManifestText));
  const sourceManifest = JSON.parse(sourceManifestText) as PilotSourceManifest;
  assert.equal(sourceManifest.schema, PILOT_SOURCE_SCHEMA, "Unknown pilot source schema.");
  assert.deepEqual(Object.keys(sourceManifest), ["schema", "recipe", "recipeSha256", "generator",
    "generatorSha256", "identity", "signature", "entries"], "Unexpected pilot source fields.");
  assert.deepEqual(sourceManifest.recipe, PILOT_RECIPE, "Pilot recipe changed after preregistration.");
  assert.equal(sourceManifest.recipeSha256, sha256(JSON.stringify(PILOT_RECIPE)), "Pilot recipe hash mismatch.");
  assert.equal(sourceManifest.generator.name, PILOT_GENERATOR, "Unknown pilot generator.");
  assert.deepEqual(Object.keys(sourceManifest.generator), ["name", "nodeVersion", "files"]);
  assert(/^v22\./.test(sourceManifest.generator.nodeVersion), "Pilot sources require the Node 22 generator.");
  assert.deepEqual(sourceManifest.generator.files.map(file => file.path), PILOT_IMPLEMENTATION_FILES);
  for (const file of sourceManifest.generator.files) {
    assert.deepEqual(Object.keys(file), ["path", "sha256"]);
    assert(/^[a-f0-9]{64}$/.test(file.sha256), "Invalid generator source digest.");
  }
  assert.equal(sourceManifest.generatorSha256, sha256(JSON.stringify(sourceManifest.generator)),
    "Pilot generator hash mismatch.");
  assert.equal(sourceManifestText, encodePilotSourceManifest(sourceManifest), "Pilot manifest must use canonical JSON and LF.");
  const requests = pilotRequests();
  assert.equal(sourceManifest.entries.length, requests.length, "Pilot source batch count changed.");
  assert.equal(rawFiles.size, requests.length, "Pilot requires exactly its registered raw responses.");
  const captures = sourceManifest.entries.map((entry, index) => {
    assert.deepEqual(Object.keys(entry), ["role", "request", "manifest", "rawFile"]);
    const expected = requests[index]!;
    assert.deepEqual({ role: entry.role, request: entry.request, rawFile: entry.rawFile }, expected,
      "Pilot request or source role differs from preregistration.");
    const raw = rawFiles.get(entry.rawFile);
    assert(typeof raw === "string", "Missing frozen pilot response.");
    const capture = decodeHorizonsCapture(JSON.stringify({ request: entry.request, manifest: entry.manifest, raw }),
      expected.request);
    assert.deepEqual(capture.response.identity, sourceManifest.identity, "Mixed pilot source identity.");
    assert.deepEqual(capture.response.signature, sourceManifest.signature, "Mixed pilot API signature.");
    return Object.freeze({ role: entry.role, capture });
  });
  for (const record of captures.slice(1)) assertSameHorizonsSolution(captures[0]!.capture.response, record.capture.response);
  freezeJson(sourceManifest);
  return Object.freeze({ sourceManifest, captures: Object.freeze(captures) });
}

