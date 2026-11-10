// Acceptance check for indexes produced locally by the M2 builder.
// This is not an index loader for untrusted input. Compile with index:build first.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { parsePlaceDataset } from "../.cache/tools/src/dataset.js";
import { DEFAULT_SHARD_BYTES, INDEX_FILE_LIMIT } from "../.cache/tools/src/build-index.js";

const [sourceDirectory, first, second, ...extra] = process.argv.slice(2);
assert(sourceDirectory && first && second && !extra.length,
  "Usage: node evidence/check-m2-build.mjs SOURCE_DIR FIRST_INDEX SECOND_INDEX");
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function belowLimit(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await belowLimit(path);
    else {
      assert(entry.isFile(), "expected regular build files");
      assert((await stat(path)).size < INDEX_FILE_LIMIT, "file reaches repository limit");
    }
  }
}

await belowLimit(sourceDirectory);
await belowLimit(first);
await belowLimit(second);
const manifestBytes = await readFile(join(first, "manifest.json"));
const manifest = JSON.parse(manifestBytes.toString("utf8"));
const expectedFiles = ["manifest.json", ...manifest.shards.map((shard) => shard.file)].sort();
assert.deepEqual((await readdir(first)).sort(), expectedFiles);
assert.deepEqual((await readdir(second)).sort(), expectedFiles);
for (const file of expectedFiles) {
  assert.deepEqual(await readFile(join(first, file)), await readFile(join(second, file)),
    "repeat builds must be byte-identical");
}
let count = 0;
let largestShardBytes = 0;
const ids = new Set();
for (const shard of manifest.shards) {
  const bytes = await readFile(join(first, shard.file));
  assert.equal(bytes.length, shard.bytes);
  assert(bytes.length <= DEFAULT_SHARD_BYTES);
  assert.equal(digest(bytes), shard.sha256);
  const dataset = parsePlaceDataset(JSON.parse(bytes.toString("utf8")));
  assert.deepEqual(dataset.provenance, manifest.provenance);
  assert.equal(dataset.places.length, shard.count);
  for (const place of dataset.places) {
    assert(!ids.has(place.id), "duplicate identifier across shards");
    ids.add(place.id);
  }
  count += dataset.places.length;
  largestShardBytes = Math.max(largestShardBytes, bytes.length);
}
assert.equal(count, manifest.count);
console.log(JSON.stringify({
  node: process.version,
  check: "M2 locally produced city index: schema, receipts, counts, unique IDs, file limits and identical rebuild",
  manifestSha256: digest(manifestBytes),
  sources: manifest.provenance.sources,
  count,
  shards: manifest.shards.length,
  largestShardBytes,
  transformations: manifest.transformations,
  identicalRebuild: true,
  sourceAndOutputFilesBelowLimit: true
}, null, 2));
