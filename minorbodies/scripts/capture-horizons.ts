/** Explicit source fixture capture/replay. No engine or fitted positions are used. */
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { MINOR_BODY_NAMES } from "../src/catalog.ts";
import { makeHorizonsRequest } from "../src/horizons-request.ts";
import { createHorizonsClient, decodeHorizonsCapture, sha256 } from "../src/horizons-client.ts";

const project = new URL("../", import.meta.url);
const fixtures = new URL("tests/fixtures/horizons/", project);
const generated = new URL("generated/horizons-fixtures/", project);
const cacheDirectory = fileURLToPath(new URL(".cache/horizons/", project));
const mode = process.argv[2] ?? "--check";
assert(process.argv.length <= 3 && ["--check", "--capture", "--replay"].includes(mode),
  "Usage: node --experimental-strip-types scripts/capture-horizons.ts [--check|--capture|--replay]");
const client = createHorizonsClient({ cacheDirectory, offline: mode !== "--capture" });

for (const body of MINOR_BODY_NAMES) {
  const stem = body.toLowerCase();
  const request = makeHorizonsRequest(body, [2451545, 2451545.125, 2451546]);
  if (mode === "--check" || mode === "--replay") {
    const raw = await readFile(new URL(`${stem}.json`, fixtures), "utf8");
    const sidecar = JSON.parse(await readFile(new URL(`${stem}.manifest.json`, fixtures), "utf8"));
    const stored = decodeHorizonsCapture(JSON.stringify({ ...sidecar, raw }), request);
    if (mode === "--replay") {
      const replay = await client.load(request, stored.manifest.responseSha256);
      assert.equal(replay.raw, raw, "Offline replay differs from the frozen fixture.");
    }
    console.log(`${body}: verified ${stored.manifest.responseSha256}`);
  } else {
    const capture = await client.load(request);
    await mkdir(generated, { recursive: true });
    // Re-running against the same cache writes identical source bytes. A live
    // replacement requires an explicit different/cleared cache and review.
    await writeFile(new URL(`${stem}.json`, generated), capture.raw);
    await writeFile(new URL(`${stem}.manifest.json`, generated),
      JSON.stringify({ request: capture.request, manifest: capture.manifest }, null, 2) + "\n");
    console.log(`${body}: captured ${sha256(capture.raw)} into generated/horizons-fixtures/`);
  }
}
