/** Explicit serialized final reference capture. Frozen manifests are never overwritten. */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { isMinorBody, MINOR_BODY_NAMES } from "../src/catalog.ts";
import type { MinorBody } from "../src/catalog.ts";
import { createHorizonsFileClient } from "../src/horizons-file.ts";
import { sha256 } from "../src/horizons-client.ts";
import { verifyFullManifest } from "../src/full-sources.ts";
import { FINAL_RECIPE } from "../src/final-recipe.ts";
import { finalCacheDirectory, finalGeneratorIdentity, finalRequests, readFinalBounded, verifyFinalManifest, encodeFinalManifest } from "../src/final-sources.ts";
import type { FinalSourceManifest } from "../src/final-sources.ts";

async function capture(body: MinorBody) {
  assert.equal(process.version, "v22.22.2");
  const root = new URL("../", import.meta.url);
  const baseText = await readFinalBounded(new URL(`data/manifests/${body.toLowerCase()}.json`, root));
  const base = verifyFullManifest(baseText).sourceManifest;
  assert.equal(base.body, body);
  const generator = await finalGeneratorIdentity();
  const client = createHorizonsFileClient({ cacheDirectory: finalCacheDirectory });
  const requests = finalRequests(body);
  const entries = [];
  for (const [index, request] of requests.entries()) {
    const capture = await client.load(request);
    assert.deepEqual(capture.response.identity, base.identity, "Final reference solution changed.");
    entries.push(capture.manifest);
    console.log(`${body} final ${index + 1}/${requests.length}: ${capture.manifest.responseSha256}`);
  }
  assert.deepEqual(await finalGeneratorIdentity(), generator, "Generator changed during capture.");
  const source: FinalSourceManifest = { schema: "minorbodies-final-sources-v1", body,
    baseSourceManifestSha256: sha256(baseText), recipe: FINAL_RECIPE, generator, entries };
  const text = encodeFinalManifest(source);
  verifyFinalManifest(text, baseText);
  const directory = new URL("generated/final-sources/", root);
  await mkdir(directory, { recursive: true });
  await writeFile(new URL(`${body.toLowerCase()}.json`, directory), text);
}
async function main() {
  const args = process.argv.slice(2);
  assert(args.length === 0 || args.length === 1 && isMinorBody(args[0]), "Usage: capture-final.ts [body]");
  for (const body of args.length ? [args[0] as MinorBody] : MINOR_BODY_NAMES) await capture(body);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
