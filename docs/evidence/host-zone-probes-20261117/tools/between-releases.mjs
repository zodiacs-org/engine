/*
 * What a host between the baseline and the pinned release can get wrong
 * unflagged: compiles tzdata 2025c (the release Node 22.22.2 carries and the
 * shipped pre-1970 history, scripts/build-tz-shards.mjs) and 2026f with the
 * generator's own functions, finds every run from 1970-01-01 to the horizon
 * in which they differ, and lists those the 2021a table
 * (src/geo/host-probes-intervals.json) does not hold. A host with 2025c's data
 * is wrong there and its check says "current" or "unchecked".
 *
 *   TZDATA_2026F_TARBALL=... TZDATA_2025C_TARBALL=... \
 *     node docs/evidence/host-zone-probes-20261117/tools/between-releases.mjs
 */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";

const { PINNED, compileDefault, differences } = await import(resolve("scripts/build-host-zone-probes.mjs"));
const { TZDB_SHA256, untar } = await import(resolve("scripts/build-tz-shards.mjs"));

const load = (variable, sha256) => {
  const bytes = readFileSync(process.env[variable]);
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (digest !== sha256) throw new Error(`${variable}: sha256 ${digest}, expected ${sha256}`);
  return untar(gunzipSync(bytes));
};
const pinned = compileDefault(load("TZDATA_2026F_TARBALL", PINNED.sha256));
const other = compileDefault(load("TZDATA_2025C_TARBALL", TZDB_SHA256));
const table = JSON.parse(readFileSync(resolve("src/geo/host-probes-intervals.json"), "utf8")).byName;

const iso = (s) => (s === null ? null : new Date(s * 1000).toISOString().replace(".000Z", "Z"));
let runs = 0;
const missing = [];
for (const name of [...pinned.keys()].sort()) {
  if (!other.has(name)) continue;
  const known = new Set((table[name] ?? []).map(([from, to, , p, b]) => `${from} ${to} ${p} ${b}`));
  for (const [from, to, p, b] of differences(pinned.get(name), other.get(name))) {
    runs += 1;
    if (!known.has(`${iso(from)} ${iso(to)} ${p} ${b}`)) missing.push({ name, from: iso(from), to: iso(to), pinned: p, other: b });
  }
}
console.log(`between-releases: tzdata 2025c (sha256 ${TZDB_SHA256}) against ${PINNED.version}: ${runs} runs, ${missing.length} not in the 2021a table`);
for (const row of missing) console.log(JSON.stringify(row));
