// Acceptance checks for a locally built index. This is not the production loader.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createPlaceLookup } from "../.cache/tools/src/index.js";

const directory = process.argv[2];
assert(directory && process.argv.length === 3, "usage: node evidence/check-m3-lookup.mjs INDEX_DIRECTORY");
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const manifestBytes = await readFile(join(directory, "manifest.json"));
const manifest = JSON.parse(manifestBytes);
assert.equal(manifest.format, "geocode-index");
assert.equal(manifest.schemaVersion, 1);
const places = [];
for (const shard of manifest.shards) {
  assert.match(shard.file, /^places-\d{6}\.json$/u);
  const bytes = await readFile(join(directory, shard.file));
  assert.equal(bytes.byteLength, shard.bytes);
  assert.equal(digest(bytes), shard.sha256);
  const dataset = JSON.parse(bytes);
  assert.equal(dataset.schemaVersion, manifest.schemaVersion);
  assert.deepEqual(dataset.provenance, manifest.provenance);
  assert.equal(dataset.places.length, shard.count);
  places.push(...dataset.places);
}
assert.equal(places.length, manifest.count);
const index = createPlaceLookup({ schemaVersion: 1, provenance: manifest.provenance, places });

// Synthetic requests against the supplied dataset, never personal birth details.
// IDs assert inclusion only, without asserting uniqueness or geographic truth.
const requests = [
  { query: "Paris, France", id: "geonames:2988507" },
  { query: "Springfield", options: { country: "US" }, id: "geonames:4409896" },
  { query: "Springfield, IL, US", id: "geonames:4250542" },
  { query: "sa\u0303o paulo", options: { country: "BR" }, id: "geonames:3448439" },
  { query: "東京", options: { country: "JP" }, id: "geonames:1850147" },
  { query: "Longyearbyen", id: "geonames:2729907" },
  { query: "Mianzhu, Deyang, Sichuan", id: "geonames:12492662" },
  { query: "Sant Pere, Santa Caterina i La Ribera", id: "geonames:3119123" },
  { query: "Kralendijk", options: { country: "Bonaire, Saint Eustatius and Saba" }, id: "geonames:3513563" },
  { query: "a" },
  { query: "Invented Undiscovered Harbour" }
];
const queries = requests.map(({ query, options, id }) => {
  const full = index.lookup(query, { ...options, limit: 100 });
  const short = index.lookup(query, { ...options, limit: 1 });
  if (id) assert(full.candidates.some((candidate) => candidate.place.id === id), `missing expected source ID for ${query}`);
  assert.equal(full.total, short.total);
  assert.equal(full.status, short.status);
  assert.deepEqual(short.candidates, full.candidates.slice(0, 1));
  assert.equal(short.truncated, short.total > short.candidates.length);
  assert.equal(full.status, full.total === 0 ? "no-match" : full.total === 1 ? "unique" : "ambiguous");
  return {
    query, ...(options ? { options } : {}), status: short.status, total: short.total,
    truncated: short.truncated, firstId: short.candidates[0]?.place.id ?? null
  };
});
assert.equal(queries.at(-1).status, "no-match");
console.log(JSON.stringify({
  runtime: process.version,
  manifestSha256: digest(manifestBytes),
  placeCount: index.size,
  verified: "local shard bytes, inclusion of source IDs, stable ordering and ambiguity under truncation",
  limitation: "Checks this local snapshot and synthetic queries only; not geographic accuracy or worldwide completeness.",
  queries
}, null, 2));
