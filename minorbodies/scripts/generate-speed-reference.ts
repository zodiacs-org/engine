/** Explicit supplemental reference intake; never modifies coefficients or base manifests. */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { MINOR_BODY_NAMES, isMinorBody } from "../src/catalog.ts";
import type { MinorBody } from "../src/catalog.ts";
import { createHorizonsFileClient } from "../src/horizons-file.ts";
import { sha256 } from "../src/horizons-client.ts";
import { verifyFullManifest, assertFullFileSize } from "../src/full-sources.ts";
import { SPEED_REFERENCE_RECIPE, encodeSpeedManifest, speedGeneratorIdentity, speedRequests,
  speedCacheDirectory, readSpeedBounded, verifySpeedManifest } from "../src/speed-reference-sources.ts";
import type { SpeedSourceManifest } from "../src/speed-reference-sources.ts";

async function capture(body: MinorBody) {
  assert(/^v22\./.test(process.version));
  const root = new URL("../", import.meta.url);
  const baseSource = await readSpeedBounded(new URL(`data/manifests/${body.toLowerCase()}.json`, root));
  const base = verifyFullManifest(baseSource).sourceManifest;
  assert.equal(base.body, body);
  const client = createHorizonsFileClient({ cacheDirectory: speedCacheDirectory });
  const requests = speedRequests(body);
  const entries = [];
  for (const [i, request] of requests.entries()) {
    const capture = await client.load(request.request);
    assert.deepEqual(capture.response.identity, base.identity, "Supplemental reference changed source solution.");
    entries.push({ index: request.index, manifest: capture.manifest });
    console.log(`${body} speed ${i + 1}/${requests.length}: ${capture.manifest.responseSha256}`);
  }
  const generator = await speedGeneratorIdentity();
  const source: SpeedSourceManifest = { schema: "minorbodies-speed-reference-sources-v2", body,
    baseSourceManifestSha256: sha256(baseSource), recipe: SPEED_REFERENCE_RECIPE,
    recipeSha256: sha256(JSON.stringify(SPEED_REFERENCE_RECIPE)), generator,
    generatorSha256: sha256(JSON.stringify(generator)), entries };
  const text = encodeSpeedManifest(source);
  verifySpeedManifest(text, baseSource);
  assertFullFileSize(Buffer.byteLength(text));
  const directory = new URL("generated/speed-reference-sources/", root);
  await mkdir(directory, { recursive: true });
  await writeFile(new URL(`${body.toLowerCase()}.json`, directory), text);
}
async function main() {
  const args = process.argv.slice(2);
  assert(args.length === 0 || args.length === 1 && isMinorBody(args[0]), "Usage: generate-speed-reference.ts [body]");
  for (const body of args.length ? [args[0] as MinorBody] : MINOR_BODY_NAMES) await capture(body);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
