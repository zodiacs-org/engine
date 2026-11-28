/** Explicit serialized capture or offline replay of independently chosen station references. */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { MINOR_BODY_NAMES, isMinorBody } from "../src/catalog.ts";
import type { MinorBody } from "../src/catalog.ts";
import { createHorizonsFileClient, encodeHorizonsFileCapture } from "../src/horizons-file.ts";
import { sha256 } from "../src/horizons-client.ts";
import { deriveStationReference, readStationReference, STATION_REFERENCE_RECIPE, stationReferenceGeneratorIdentity } from "../src/station-reference.ts";
import type { StationSourceManifest } from "../src/station-reference.ts";

async function capture(body: MinorBody) {
  const root = new URL("../", import.meta.url);
  const directory = new URL(`generated/station-reference-sources/${body.toLowerCase()}/`, root);
  await mkdir(directory, { recursive: true });
  const client = createHorizonsFileClient({ cacheDirectory: fileURLToPath(new URL(".cache/horizons-stations/", root)) });
  const captures: StationSourceManifest["captures"] = [];
  const result = await deriveStationReference(body, async (name, request) => {
    const captured = await client.load(request);
    const encoded = encodeHorizonsFileCapture(captured);
    assert(Buffer.byteLength(encoded) < 2_000_000);
    await writeFile(new URL(`${name}.json`, directory), encoded);
    captures.push({ name, sha256: sha256(encoded), byteLength: Buffer.byteLength(encoded) });
    console.log(`${body} ${name}: ${request.epochs.length} epochs, ${captured.manifest.responseSha256}`);
    return captured;
  });
  const manifest: StationSourceManifest = { schema: "minorbodies-station-sources-v1", body,
    recipe: STATION_REFERENCE_RECIPE, generator: await stationReferenceGeneratorIdentity(), captures };
  await writeFile(new URL("manifest.json", directory), JSON.stringify(manifest) + "\n");
  await writeFile(new URL("reference.json", directory), JSON.stringify(result, null, 2) + "\n");
  console.log(`${body}: independently bracketed ${result.events.length} stations`);
}
async function main() {
  assert(/^v22\./.test(process.version), "Station references require Node 22.");
  const [mode, body, ...extra] = process.argv.slice(2);
  assert((mode === "--capture" || mode === "--replay") && (!body || isMinorBody(body)) && extra.length === 0,
    "Usage: capture-station-reference.ts --capture|--replay [body]");
  for (const name of body ? [body as MinorBody] : MINOR_BODY_NAMES) {
    if (mode === "--capture") await capture(name);
    else {
      const result = await readStationReference(name);
      console.log(`${name}: replayed ${result.sources.length} original captures and ${result.events.length} independent station brackets`);
    }
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
