/** Explicit serialized M11 event capture; committed manifests are never overwritten. */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { MINOR_BODY_NAMES, isMinorBody } from "../src/catalog.ts";
import type { MinorBody } from "../src/catalog.ts";
import { createHorizonsFileClient, encodeHorizonsFileCapture } from "../src/horizons-file.ts";
import { sha256 } from "../src/horizons-client.ts";
import { buildFinalEventReference, finalEventGeneratorIdentity, readFinalEventReference, FINAL_EVENT_RECIPE } from "../src/final-event-reference.ts";
import type { FinalEventSourceManifest } from "../src/final-event-reference.ts";

async function boundedWrite(url: URL, text: string) {
  assert(Buffer.byteLength(text) < 2_000_000, "Final event generated file exceeds cap.");
  await writeFile(url, text);
}

export async function captureFinalEvents(body: MinorBody) {
  const root = new URL("../", import.meta.url);
  const directory = new URL(`generated/final-events/${body.toLowerCase()}/`, root);
  await mkdir(directory, { recursive: true });
  const generator = await finalEventGeneratorIdentity();
  const client = createHorizonsFileClient({ cacheDirectory: fileURLToPath(new URL(".cache/horizons-final-events/", root)) });
  const captures: FinalEventSourceManifest["captures"] = [];
  let result;
  try {
    result = await buildFinalEventReference(body, async (name, request) => {
      const captured = await client.load(request);
      const encoded = encodeHorizonsFileCapture(captured);
      await boundedWrite(new URL(`${name}.json`, directory), encoded);
      captures.push({ name, sha256: sha256(encoded), byteLength: Buffer.byteLength(encoded) });
      console.log(`${body} ${name}: ${request.epochs.length} epochs, ${captured.manifest.responseSha256}`);
      return captured;
    });
  } catch (error) {
    const failures = new URL("failures/", directory);
    await mkdir(failures, { recursive: true });
    await boundedWrite(new URL(`reference-${Date.now()}.json`, failures), JSON.stringify({
      schema: "minorbodies-final-event-reference-failure-v1", body, recipe: FINAL_EVENT_RECIPE, generator,
      stage: "source-reference-before-package-evaluation", captures,
      error: String(error).slice(0, 4000)
    }, null, 2) + "\n");
    throw error;
  }
  assert.deepEqual(await finalEventGeneratorIdentity(), generator, "Final event generator changed during capture.");
  const manifest: FinalEventSourceManifest = { schema: "minorbodies-final-event-sources-v1", body,
    recipe: FINAL_EVENT_RECIPE, generator, captures };
  await boundedWrite(new URL("manifest.json", directory), JSON.stringify(manifest) + "\n");
  await boundedWrite(new URL("reference.json", directory), JSON.stringify(result) + "\n");
  console.log(`${body}: ${result.windows.reduce((sum, window) => sum + window.stations.length, 0)} station brackets; ${result.windows.reduce((sum, window) => sum + window.ingresses.length, 0)} ingress brackets`);
}

async function main() {
  assert(/^v22\./.test(process.version), "Final event references require Node 22.");
  const [mode, body, ...extra] = process.argv.slice(2);
  assert((mode === "--capture" || mode === "--replay") && (!body || isMinorBody(body)) && extra.length === 0,
    "Usage: capture-final-events.ts --capture|--replay [body]");
  for (const name of body ? [body as MinorBody] : MINOR_BODY_NAMES) {
    if (mode === "--capture") await captureFinalEvents(name);
    else {
      const result = await readFinalEventReference(name);
      console.log(`${name}: replayed ${result.sources.length} captures over ${result.windows.length} independent event windows`);
    }
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
