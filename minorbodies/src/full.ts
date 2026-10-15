/** Explicit offline full-range loading. This module never fetches or fits. */
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { minorBodyDefinition } from "./catalog.ts";
import type { MinorBody } from "./catalog.ts";
import { createHorizonsFileClient } from "./horizons-file.ts";
import { sha256 } from "./horizons-client.ts";
import { verifyFullManifest, assertFullFileSize } from "./full-sources.ts";
import type { ShardDescriptor } from "./coefficient-shard.ts";
import { loadMinorBodyEphemeris } from "./ephemeris.ts";

async function readBounded(url: URL): Promise<string> {
  assertFullFileSize((await stat(url)).size);
  return readFile(url, "utf8");
}

/** Needs full:build and the pinned original source cache. Missing data is an error. */
export async function loadFullBody(body: MinorBody) {
  minorBodyDefinition(body);
  const root = new URL("../", import.meta.url);
  const name = body.toLowerCase();
  const sourceManifestText = await readBounded(new URL(`data/manifests/${name}.json`, root));
  const { sourceManifest, requests } = verifyFullManifest(sourceManifestText);
  assert.equal(sourceManifest.body, body);
  // This committed receipt pins the generated coefficient bytes separately from their source.
  const receipt = JSON.parse(await readBounded(new URL(`data/receipts/${name}.json`, root))) as {
    schema: string; body: string; sourceManifestSha256: string; generatorSha256: string;
    sourceIdentity: unknown; shards: { file: string; descriptor: ShardDescriptor }[];
  };
  assert.equal(receipt.schema, "minorbodies-full-build-v1");
  assert.equal(receipt.body, body);
  assert.equal(receipt.sourceManifestSha256, sha256(sourceManifestText));
  assert.equal(receipt.generatorSha256, sourceManifest.generatorSha256);
  assert.deepEqual(receipt.sourceIdentity, sourceManifest.identity);
  assert(Array.isArray(receipt.shards) && receipt.shards.length > 0 && receipt.shards.length <= 64);
  const shards = [];
  for (const [index, item] of receipt.shards.entries()) {
    assert.equal(item.file, `shard-${String(index).padStart(3, "0")}.json`);
    shards.push({ text: await readBounded(new URL(`generated/full/${name}/${item.file}`, root)), descriptor: item.descriptor });
  }
  const client = createHorizonsFileClient({ cacheDirectory: fileURLToPath(new URL(".cache/horizons-full/", root)), offline: true });
  const rawSources = new Map<string, string>();
  for (const [i, request] of requests.entries()) {
    const capture = await client.load(request.request, sourceManifest.entries[i]!.manifest.responseSha256);
    assert.deepEqual(capture.manifest, sourceManifest.entries[i]!.manifest);
    rawSources.set(request.rawFile, capture.raw);
  }
  return loadMinorBodyEphemeris({ sourceManifestText, sourceManifestSha256: receipt.sourceManifestSha256, rawSources, shards });
}
