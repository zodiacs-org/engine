/*
 * Checks src/geo/host-probes-data.ts and src/geo/host-probes-intervals.json
 * against zdump's text, never against the engine or the generator's code.
 *
 * Each release is unpacked from its archive (SHA-256 checked against the
 * values below, copied from the fetch job's MANIFEST.tsv), its default build
 * (the main data files with `backward` and `etcetera`, no `backzone`) is
 * compiled with `zic -b fat`, and for every compiled name
 * `zdump -v -c 1970,2030` lists each transition, with `zdump -i -c 1970,2030`
 * for the offset in force on 1970-01-01. From the two texts this script
 * finds, on its own, every maximal run from 1970-01-01 to 2029-10-27 (tzdata
 * 2026f's release date plus three years) in which the two offsets differ and
 * neither changes, and requires, to the second:
 *
 * - the spelled-out intervals to be exactly these runs, with the pinned and
 *   baseline offsets zdump gives;
 * - each probe to lie inside its run, at the midpoint rounded down to the
 *   minute (from + 45 days when the run reaches the horizon), with zdump's
 *   pinned offset there equal to the stored one;
 * - the shipped table, decoded here by its own reading of the format in the
 *   generator's header, to give the same names (by FNV-1a hash), runs and
 *   pinned offsets.
 *
 *   TZDATA_2026F_TARBALL=... TZDATA_2021A_TARBALL=... \
 *     node docs/evidence/host-zone-probes-20261117/tools/zdump-check.mjs \
 *     [--table src/geo/host-probes-data.ts] [--intervals src/geo/host-probes-intervals.json]
 *
 * Exit 0 when everything matches; 1 with each difference listed otherwise.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const RELEASES = {
  pinned: { version: "2026f", sha256: "01b4a91cec5167ed48c11e8ab78f2048cead78ce94b0cafcad0ae8c5a3044d3d" },
  baseline: { version: "2021a", sha256: "39e7d2ba08c68cbaefc8de3227aab0dec2521be8042cf56855f7dc3a9fb14e08" }
};
const FILES = ["africa", "antarctica", "asia", "australasia", "europe", "northamerica", "southamerica", "etcetera", "backward"];
const START = 0;
const HORIZON = Date.UTC(2029, 9, 27) / 1000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const arg = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index > 0 ? process.argv[index + 1] : fallback;
};
const tablePath = resolve(arg("--table", "src/geo/host-probes-data.ts"));
const intervalsPath = resolve(arg("--intervals", "src/geo/host-probes-intervals.json"));

function compile(release, work) {
  const archive = process.env[`TZDATA_${release.version.toUpperCase()}_TARBALL`];
  if (!archive) throw new Error(`set TZDATA_${release.version.toUpperCase()}_TARBALL`);
  const digest = createHash("sha256").update(readFileSync(archive)).digest("hex");
  if (digest !== release.sha256) throw new Error(`${archive}: sha256 ${digest}, expected ${release.sha256}`);
  const source = join(work, `src-${release.version}`);
  const out = join(work, `zi-${release.version}`);
  execFileSync("mkdir", ["-p", source]);
  execFileSync("tar", ["-xzf", archive, "-C", source, ...FILES, "version"]);
  if (readFileSync(join(source, "version"), "utf8").trim() !== release.version) throw new Error(`${archive}: wrong version`);
  execFileSync("zic", ["-b", "fat", "-d", out, ...FILES.map((file) => join(source, file))], { stdio: ["ignore", "ignore", "pipe"] });
  const names = [];
  const walk = (directory, prefix) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const name = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(join(directory, entry.name), name);
      else names.push(name);
    }
  };
  walk(out, "");
  return { out, names: new Set(names) };
}

/** "+0530", "-05", "-033", "+054500" (zdump -i) to seconds. */
function utoff(text) {
  const match = /^([+-])(\d\d)(\d\d)?(\d\d)?$/.exec(text);
  if (!match) throw new Error(`unread offset ${text}`);
  return (match[1] === "-" ? -1 : 1) * (Number(match[2]) * 3600 + Number(match[3] ?? 0) * 60 + Number(match[4] ?? 0));
}

/** A name's clock from zdump: the offset from 1970-01-01, then [UT second, offset] at each change. */
function clock(file) {
  const initial = execFileSync("zdump", ["-i", "-c", "1970,2030", file], { encoding: "utf8" })
    .split("\n")
    .find((line) => line.startsWith("-\t-\t"));
  if (!initial) throw new Error(`${file}: no initial line in zdump -i`);
  let offset = utoff(initial.split("\t")[2]);
  const changes = [];
  const text = execFileSync("zdump", ["-v", "-c", "1970,2030", file], { encoding: "utf8" });
  for (const line of text.split("\n")) {
    const match = / \w{3} (\w{3}) +(\d+) (\d\d):(\d\d):(\d\d) (\d+) UT = .* gmtoff=(-?\d+)$/.exec(line);
    if (!match) continue;
    const ut = Date.UTC(Number(match[6]), MONTHS.indexOf(match[1]), Number(match[2]), Number(match[3]), Number(match[4]), Number(match[5])) / 1000;
    const gmtoff = Number(match[7]);
    if (gmtoff !== offset) {
      changes.push([ut, gmtoff]);
      offset = gmtoff;
    }
  }
  const at = (s) => {
    let value = utoff(initial.split("\t")[2]);
    for (const [ut, gmtoff] of changes) if (ut <= s) value = gmtoff;
    return value;
  };
  return { changes, at };
}

function runs(pinned, baseline) {
  const marks = [...new Set([START, HORIZON, ...pinned.changes.map(([s]) => s), ...baseline.changes.map(([s]) => s)])]
    .filter((s) => s >= START && s <= HORIZON)
    .sort((a, b) => a - b);
  const out = [];
  for (let index = 0; index + 1 < marks.length; index += 1) {
    const p = pinned.at(marks[index]);
    const b = baseline.at(marks[index]);
    if (p === b) continue;
    const last = out[out.length - 1];
    if (last && last[1] === marks[index] && last[2] === p && last[3] === b) last[1] = marks[index + 1];
    else out.push([marks[index], marks[index + 1], p, b]);
  }
  return out.map(([from, to, p, b]) => [from, to === HORIZON ? null : to, p, b]);
}

function fnv(name) {
  let hash = 0x811c9dc5;
  for (const char of name.toLowerCase()) hash = Math.imul(hash ^ char.charCodeAt(0), 0x01000193) >>> 0;
  return hash;
}

/** The table's string, read from the TypeScript file, decoded from the format the generator's header describes. */
function shippedTable(file) {
  const match = /export const HOST_PROBES = "([^"]*)";/.exec(readFileSync(file, "utf8"));
  if (!match) throw new Error(`${file}: no HOST_PROBES`);
  const table = new Map();
  for (const row of match[1].split(";")) {
    const [hashes, body] = row.split(":");
    const numbers = body.split(",").map((value) => parseInt(value, 36));
    const list = [];
    let end = 0;
    for (let index = 0; index < numbers.length; index += 3) {
      const from = end + numbers[index] * 60;
      const to = numbers[index + 1] === 0 ? null : from + numbers[index + 1] * 60;
      list.push([from, to, numbers[index + 2] * 60]);
      end = to ?? from;
    }
    for (const hash of hashes.split(",")) table.set(parseInt(hash, 36), list);
  }
  return table;
}

const iso = (s) => new Date(s * 1000).toISOString().replace(".000Z", "Z");
const work = mkdtempSync(join(tmpdir(), "zdump-check-"));
const problems = [];
try {
  const pinned = compile(RELEASES.pinned, work);
  const baseline = compile(RELEASES.baseline, work);
  const spelled = JSON.parse(readFileSync(intervalsPath, "utf8")).byName;
  const table = shippedTable(tablePath);
  const expected = new Map();
  let compared = 0;
  for (const name of [...pinned.names].sort()) {
    if (!baseline.names.has(name)) continue;
    compared += 1;
    const p = clock(join(pinned.out, name));
    const b = clock(join(baseline.out, name));
    const found = runs(p, b);
    if (!found.length) continue;
    expected.set(name, found);
    const rows = spelled[name] ?? [];
    const want = found.map(([from, to, po, bo]) => [iso(from), to === null ? null : iso(to), po, bo]);
    const have = rows.map(([from, to, , po, bo]) => [from, to, po, bo]);
    if (JSON.stringify(want) !== JSON.stringify(have)) problems.push(`${name}: intervals ${JSON.stringify(have)} != zdump ${JSON.stringify(want)}`);
    rows.forEach(([from, to, probe, po], index) => {
      const f = Date.parse(from) / 1000;
      const t = to === null ? null : Date.parse(to) / 1000;
      const s = Date.parse(probe) / 1000;
      const place = t === null ? f + 45 * 86_400 : f + Math.floor((t - f) / 120) * 60;
      if (s !== place || s < f || (t !== null && s >= t)) problems.push(`${name} #${index}: probe ${probe} not at ${iso(place)}`);
      if (p.at(s) !== po) problems.push(`${name} #${index}: zdump gives ${p.at(s)} at the probe, stored ${po}`);
    });
    const shipped = table.get(fnv(name));
    const wantShipped = found.map(([from, to, po]) => [from, to, po]);
    if (JSON.stringify(shipped) !== JSON.stringify(wantShipped)) problems.push(`${name}: shipped table ${JSON.stringify(shipped)} != zdump ${JSON.stringify(wantShipped)}`);
  }
  for (const name of Object.keys(spelled)) if (!expected.has(name)) problems.push(`${name}: in the intervals, zdump finds no difference`);
  const hashes = new Set([...expected.keys()].map(fnv));
  for (const hash of table.keys()) if (!hashes.has(hash)) problems.push(`table row ${hash.toString(36)}: zdump finds no such name`);
  const total = [...expected.values()].reduce((sum, list) => sum + list.length, 0);
  console.log(`zdump-check: ${compared} names in both default builds; zdump finds ${total} intervals in ${expected.size} names from ${iso(START)} to ${iso(HORIZON)}`);
  console.log(`zdump-check: tzdata ${RELEASES.pinned.version} (sha256 ${RELEASES.pinned.sha256}) against ${RELEASES.baseline.version} (sha256 ${RELEASES.baseline.sha256}); zic -b fat; ${execFileSync("zdump", ["--version"], { encoding: "utf8" }).trim()}`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
if (problems.length) {
  console.error(`zdump-check: ${problems.length} difference(s):\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
console.log("zdump-check: every interval, probe and pinned offset matches zdump, to the second");
