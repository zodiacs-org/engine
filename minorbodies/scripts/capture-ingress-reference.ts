/** Explicit serial capture and offline replay of independent ingress references. */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { MINOR_BODY_NAMES, isMinorBody } from "../src/catalog.ts";
import type { MinorBody } from "../src/catalog.ts";
import { createHorizonsFileClient, encodeHorizonsFileCapture } from "../src/horizons-file.ts";
import { sha256 } from "../src/horizons-client.ts";
import { deriveIngressReference, readIngressReference, INGRESS_REFERENCE_RECIPE, ingressReferenceGeneratorIdentity } from "../src/ingress-reference.ts";
import type { IngressSourceManifest } from "../src/ingress-reference.ts";

async function capture(body: MinorBody) {
  const root = new URL("../", import.meta.url);
  const directory = new URL(`generated/ingress-reference-sources/${body.toLowerCase()}/`, root);
  await mkdir(directory, { recursive: true });
  const client = createHorizonsFileClient({ cacheDirectory: fileURLToPath(new URL(".cache/horizons-ingresses/", root)) });
  const captures: IngressSourceManifest["captures"] = [];
  const result = await deriveIngressReference(body, async (name, request) => {
    const captured = await client.load(request);
    const encoded = encodeHorizonsFileCapture(captured);
    assert(Buffer.byteLength(encoded) < 2_000_000);
    await writeFile(new URL(`${name}.json`, directory), encoded);
    captures.push({ name, sha256: sha256(encoded), byteLength: Buffer.byteLength(encoded) });
    console.log(`${body} ${name}: ${request.epochs.length} epochs, ${captured.manifest.responseSha256}`);
    return captured;
  });
  const manifest: IngressSourceManifest = { schema: "minorbodies-ingress-sources-v1", body,
    recipe: INGRESS_REFERENCE_RECIPE, generator: await ingressReferenceGeneratorIdentity(), captures };
  await writeFile(new URL("manifest.json", directory), JSON.stringify(manifest) + "\n");
  await writeFile(new URL("reference.json", directory), JSON.stringify(result, null, 2) + "\n");
  console.log(`${body}: independently bracketed ${result.events.length} sign ingresses`);
}
async function main() {
  assert(/^v22\./.test(process.version), "Ingress references require Node 22.");
  const [mode, body, ...extra] = process.argv.slice(2);
  assert((mode === "--capture" || mode === "--replay") && (!body || isMinorBody(body)) && extra.length === 0,
    "Usage: capture-ingress-reference.ts --capture|--replay [body]");
  for (const name of body ? [body as MinorBody] : MINOR_BODY_NAMES) {
    if (mode === "--capture") await capture(name);
    else {
      const result = await readIngressReference(name);
      console.log(`${name}: replayed ${result.sources.length} original captures and ${result.events.length} independent ingress brackets`);
    }
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
