/*
 * Builds src/geo/host-probes-data.ts: the intervals from 1970 on in which a
 * host whose time zone data is older than the pinned tzdb release can give a
 * different UTC offset, and src/geo/host-probes-intervals.json, the same
 * intervals spelled out for the tests and the zdump check
 * (docs/evidence/host-zone-probes-20261117/).
 *
 * From 1970 on the engine reads a wall time on the host's Intl. A phone or a
 * browser that has not updated its time zone data gives last year's rules,
 * and nothing in Intl says which release it carries (browsers expose no
 * version). So the engine carries, for each zone and link name whose offsets
 * from 1970 on differ between an old baseline release and the pinned release,
 * the intervals that differ and the pinned offset in each. When a wall time
 * resolves on the host inside such an interval, the engine asks the host for
 * the offset at one instant inside it (the probe) and compares (docs/time.md,
 * "Host time zone data").
 *
 * - The pinned release is the newest tzdata on the day the table was built.
 *   The baseline is tzdata 2021a: five years is the oldest device data worth
 *   describing. A host older than that still differs where 2021a does, and
 *   is flagged there; where it differs and 2021a does not, it is not.
 * - zic compiles each release's default build (the main data files with
 *   `backward` and `etcetera`, no `backzone`), which is what browsers and
 *   Node carry, with `-b fat`, so every transition up to 2037 is written out
 *   and no rule is reimplemented here.
 * - For every name in both builds, from 1970-01-01T00:00:00Z to the pinned
 *   release's date plus three years, each maximal run of time in which the
 *   two offsets differ and neither changes is one interval: from, to
 *   (exclusive; null when the run reaches the horizon) and the pinned offset.
 *   An interval that reaches the horizon is open-ended.
 * - The probe is derived, not stored: the interval's midpoint, rounded down
 *   to the minute, or from + 45 days when it is open-ended.
 * - Names are keyed by the 32-bit FNV-1a hash of the lower-cased name, the
 *   hash src/geo/zone-history.ts uses; the hash is checked unique among every
 *   name of both builds. Names with the same intervals share one row.
 *
 * Output (all generated; do not edit):
 * - src/geo/host-probes-data.ts: HOST_PROBES, rows joined by ";": the
 *   names' hashes in base 36 joined by ",", ":", then per interval three
 *   base-36 integers in minutes, joined by ",": the time from the previous
 *   interval's end (from 1970 for the first), the length (0 when open-ended)
 *   and the pinned offset east.
 * - src/geo/host-probes-intervals.json: per name, each interval as ISO
 *   instants with its probe, the pinned offset and the baseline offset, in
 *   seconds.
 *
 *   node scripts/build-host-zone-probes.mjs          rebuild both files
 *   node scripts/build-host-zone-probes.mjs --check  exit 1 if either differs
 *
 * Each release is read from TZDATA_<VERSION>_TARBALL (TZDATA_2026F_TARBALL,
 * TZDATA_2021A_TARBALL) when set, otherwise downloaded once into .cache/
 * (gitignored); either way its SHA-256 must match. Needs zic (libc-bin on
 * Debian and Ubuntu, or tzcode).
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

import { MAIN_FILES, nameHash, readTzif, untar } from "./build-tz-shards.mjs";

/** The newest tzdata on 2026-11-17 (https://data.iana.org/time-zones/tzdb/version), released 2026-10-27. */
export const PINNED = Object.freeze({
  version: "2026f",
  sha256: "01b4a91cec5167ed48c11e8ab78f2048cead78ce94b0cafcad0ae8c5a3044d3d",
  released: "2026-10-27"
});
/** The oldest device data worth describing: five years before the pinned release. */
export const BASELINE = Object.freeze({
  version: "2021a",
  sha256: "39e7d2ba08c68cbaefc8de3227aab0dec2521be8042cf56855f7dc3a9fb14e08"
});
/** Unix seconds: 1970-01-01T00:00:00Z, where the host starts to answer. */
export const START = 0;
/** Unix seconds: the pinned release's date plus three years. */
export const HORIZON = Date.UTC(Number(PINNED.released.slice(0, 4)) + 3, Number(PINNED.released.slice(5, 7)) - 1, Number(PINNED.released.slice(8, 10))) / 1000;
/** An open-ended interval's probe: this long after its start. */
export const OPEN_PROBE_SECONDS = 45 * 86_400;

export const releaseUrl = (version) => `https://data.iana.org/time-zones/releases/tzdata${version}.tar.gz`;

/** A release's files, checked against its pinned SHA-256 and its version file. */
export async function loadRelease(root, release) {
  let archive = process.env[`TZDATA_${release.version.toUpperCase()}_TARBALL`];
  if (!archive) {
    const cache = resolve(root, ".cache");
    await mkdir(cache, { recursive: true });
    archive = resolve(cache, `tzdata${release.version}.tar.gz`);
    try {
      await access(archive);
    } catch {
      console.log(`downloading ${releaseUrl(release.version)} ...`);
      const response = await fetch(releaseUrl(release.version));
      if (!response.ok) throw new Error(`host-probes: download failed (${response.status})`);
      await writeFile(archive, Buffer.from(await response.arrayBuffer()));
    }
  }
  const bytes = await readFile(archive);
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (digest !== release.sha256) throw new Error(`host-probes: ${archive} has sha256 ${digest}, expected ${release.sha256}`);
  const files = untar(gunzipSync(bytes));
  const version = files.get("version")?.trim();
  if (version !== release.version) throw new Error(`host-probes: archive reports version ${version}`);
  return files;
}

/** The default build compiled with `zic -b fat` into a temporary directory: every name's TZif data. */
export function compileDefault(files) {
  const work = mkdtempSync(join(tmpdir(), "host-probes-"));
  try {
    for (const file of MAIN_FILES) writeFileSync(join(work, file), files.get(file) ?? "");
    const out = join(work, "zoneinfo");
    execFileSync("zic", ["-b", "fat", "-d", out, ...MAIN_FILES.map((file) => join(work, file))], { stdio: ["ignore", "ignore", "pipe"] });
    const compiled = new Map();
    const walk = (directory, prefix) => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const name = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) walk(join(directory, entry.name), name);
        else compiled.set(name, readTzif(readFileSync(join(directory, entry.name))));
      }
    };
    walk(out, "");
    return compiled;
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

/** The offset, seconds east, in force at Unix second s: type 0 before the first transition (RFC 8536). */
export function offsetAtSecond(tzif, s) {
  let lo = 0;
  let hi = tzif.t.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (tzif.t[mid] <= s) lo = mid + 1;
    else hi = mid;
  }
  return tzif.offsets[lo === 0 ? 0 : tzif.typeOf[lo - 1]];
}

/**
 * Every maximal run in [start, horizon) in which the two clocks differ and
 * neither changes: [from, to or null (reaches the horizon), pinned offset,
 * baseline offset], seconds.
 */
export function differences(pinned, baseline, start = START, horizon = HORIZON) {
  const marks = [...new Set([start, horizon, ...pinned.t, ...baseline.t].filter((s) => s >= start && s <= horizon))].sort((a, b) => a - b);
  const out = [];
  for (let index = 0; index + 1 < marks.length; index += 1) {
    const from = marks[index];
    const p = offsetAtSecond(pinned, from);
    const b = offsetAtSecond(baseline, from);
    if (p === b) continue;
    const last = out[out.length - 1];
    if (last && last[1] === from && last[2] === p && last[3] === b) last[1] = marks[index + 1];
    else out.push([from, marks[index + 1], p, b]);
  }
  return out.map(([from, to, p, b]) => [from, to === horizon ? null : to, p, b]);
}

/** The probe of an interval, Unix seconds: its midpoint rounded down to the minute, or from + 45 days if open-ended. */
export function probeOf(from, to) {
  return to === null ? from + OPEN_PROBE_SECONDS : from + Math.floor((to - from) / 120) * 60;
}

const b36 = (n) => n.toString(36);

/** One row's intervals as base-36 minutes (see the header). */
export function encodeIntervals(intervals) {
  let previous = START;
  const numbers = [];
  for (const [from, to, offset] of intervals) {
    for (const value of [from, to ?? from, offset, from - previous]) {
      if (value % 60 !== 0) throw new Error(`host-probes: ${value} is not a whole minute`);
    }
    if (to !== null && to <= from) throw new Error("host-probes: empty interval");
    numbers.push(b36((from - previous) / 60), b36(to === null ? 0 : (to - from) / 60), b36(offset / 60));
    previous = to ?? from;
  }
  return numbers.join(",");
}

/** The table's text from intervals by name: rows sorted by their first hash, hashes ascending within a row. */
export function encodeTable(byName) {
  const rows = new Map();
  for (const [name, intervals] of byName) {
    const key = encodeIntervals(intervals);
    if (!rows.has(key)) rows.set(key, []);
    rows.get(key).push(nameHash(name));
  }
  return [...rows]
    .map(([key, hashes]) => [hashes.sort((a, b) => a - b), key])
    .sort((a, b) => a[0][0] - b[0][0])
    .map(([hashes, key]) => `${hashes.map(b36).join(",")}:${key}`)
    .join(";");
}

/** The table's text back to intervals by hash: [from, to or null, pinned offset], seconds. As src/geo/timezone.ts reads it. */
export function decodeTable(text) {
  const table = new Map();
  for (const row of text ? text.split(";") : []) {
    const [hashes, body] = row.split(":");
    const numbers = body.split(",").map((value) => parseInt(value, 36) * 60);
    const intervals = [];
    let previous = START;
    for (let index = 0; index < numbers.length; index += 3) {
      const from = previous + numbers[index];
      const to = numbers[index + 1] === 0 ? null : from + numbers[index + 1];
      intervals.push([from, to, numbers[index + 2]]);
      previous = to ?? from;
    }
    for (const hash of hashes.split(",")) table.set(parseInt(hash, 36), intervals);
  }
  return table;
}

const iso = (s) => new Date(s * 1000).toISOString().replace(".000Z", "Z");

/** Both outputs from two compiled builds. */
export function buildFromCompiled(pinned, baseline) {
  const hashes = new Map();
  for (const name of new Set([...pinned.keys(), ...baseline.keys()])) {
    const hash = nameHash(name);
    if (hashes.has(hash) && hashes.get(hash).toLowerCase() !== name.toLowerCase()) {
      throw new Error(`host-probes: ${name} and ${hashes.get(hash)} share a hash`);
    }
    hashes.set(hash, name);
  }
  const byName = new Map();
  const spelled = {};
  for (const name of [...pinned.keys()].sort()) {
    if (!baseline.has(name)) continue;
    const found = differences(pinned.get(name), baseline.get(name));
    if (!found.length) continue;
    byName.set(name, found.map(([from, to, p]) => [from, to, p]));
    spelled[name] = found.map(([from, to, p, b]) => [iso(from), to === null ? null : iso(to), iso(probeOf(from, to)), p, b]);
  }
  const table = encodeTable(byName);
  const intervals = [...byName.values()].reduce((sum, list) => sum + list.length, 0);
  const data = `// Generated by scripts/build-host-zone-probes.mjs from tzdata ${PINNED.version} (sha256 ${PINNED.sha256}) against tzdata ${BASELINE.version} (sha256 ${BASELINE.sha256}), default builds. Do not edit.

/** The pinned release whose offsets the probes carry. */
export const HOST_PROBES_TZDB = "${PINNED.version}";

/**
 * ${intervals} intervals in ${byName.size} names from 1970-01-01 to ${iso(HORIZON).slice(0, 10)} in which tzdata ${BASELINE.version} and
 * ${PINNED.version} give different offsets: rows joined by ";", each the names' FNV-1a hashes in base 36 joined by
 * ",", then ":", then per interval three base-36 integers in minutes joined by ",": the time from the previous
 * interval's end (from 1970 for the first), the length (0: open-ended) and the ${PINNED.version} offset east.
 */
export const HOST_PROBES = "${table}";
`;
  const head = JSON.stringify({
    generator: "scripts/build-host-zone-probes.mjs",
    pinned: { ...PINNED, url: releaseUrl(PINNED.version) },
    baseline: { ...BASELINE, url: releaseUrl(BASELINE.version) },
    from: iso(START),
    horizon: iso(HORIZON),
    columns: ["from", "to (exclusive; null: reaches the horizon)", "probe", "pinned offset (s east)", "baseline offset (s east)"],
    names: byName.size,
    intervals
  });
  const rows = Object.entries(spelled).map(([name, list]) => `  ${JSON.stringify(name)}: ${JSON.stringify(list)}`);
  const json = `${head.slice(0, -1)},\n "byName": {\n${rows.join(",\n")}\n }\n}\n`;
  return { data, json, table, names: byName.size, intervals };
}

export async function build(root) {
  const pinned = compileDefault(await loadRelease(root, PINNED));
  const baseline = compileDefault(await loadRelease(root, BASELINE));
  return buildFromCompiled(pinned, baseline);
}

async function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const targets = { data: resolve(root, "src/geo/host-probes-data.ts"), json: resolve(root, "src/geo/host-probes-intervals.json") };
  const built = await build(root);
  if (process.argv.includes("--check")) {
    const stale = Object.entries(targets).filter(([key, file]) => !existsSync(file) || readFileSync(file, "utf8") !== built[key]);
    if (stale.length) {
      console.error(`host-probes: ${stale.map(([, file]) => file).join(", ")} differ from tzdata ${PINNED.version} against ${BASELINE.version}; run node scripts/build-host-zone-probes.mjs`);
      process.exit(1);
    }
    console.log(`host-probes: match tzdata ${PINNED.version} against ${BASELINE.version} (${built.intervals} intervals in ${built.names} names, table ${built.table.length} bytes)`);
    return;
  }
  writeFileSync(targets.data, built.data);
  writeFileSync(targets.json, built.json);
  console.log(`host-probes: ${built.intervals} intervals in ${built.names} names, table ${built.table.length} bytes -> src/geo/host-probes-data.ts`);
}

const direct = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (direct) await main();
