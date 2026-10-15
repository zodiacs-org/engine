/** Explicit loading convenience for the source-checkout Chiron pilot. */
import { readFile, stat } from "node:fs/promises";
import { loadMinorBodyEphemeris } from "./ephemeris.ts";
import type { ShardDescriptor } from "./coefficient-shard.ts";
import { pilotRequests } from "./pilot-sources.ts";

async function readBounded(url: URL): Promise<string> {
  const size = (await stat(url)).size;
  if (size < 1 || size >= 2_000_000) throw new RangeError("Pilot source or shard exceeds file-size limit.");
  return readFile(url, "utf8");
}

/** Run pilot:build first. Missing data fails; this helper never fetches or fits. */
export async function loadChironPilot() {
  const sources = new URL("../tests/fixtures/pilot/", import.meta.url);
  const generated = new URL("../generated/pilot/", import.meta.url);
  const sourceManifestText = await readBounded(new URL("manifest.json", sources));
  const rawSources = new Map<string, string>();
  for (const request of pilotRequests()) {
    rawSources.set(request.rawFile, await readBounded(new URL(request.rawFile, sources)));
  }
  const text = await readBounded(new URL("chiron.json", generated));
  const descriptor = JSON.parse(await readBounded(new URL("descriptor.json", generated))) as ShardDescriptor;
  return loadMinorBodyEphemeris({ sourceManifestText,
    sourceManifestSha256: descriptor.sourceManifestSha256, rawSources, shards: [{ text, descriptor }] });
}
