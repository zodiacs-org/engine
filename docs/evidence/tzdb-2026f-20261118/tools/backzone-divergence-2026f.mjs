/*
 * The pre-1970 divergence figures of docs/time.md, measured on the tzdata
 * release the package ships (2026f, with America/Yellowknife held at 2025c).
 *
 * An adapted copy of docs/evidence/rc15-20260929/backzone-divergence.mjs,
 * which measured them on 2025c. It differs in two ways only:
 *
 * - the pinned build is compiled from pinnedSources() of
 *   scripts/build-tz-shards.mjs, the files the shard generator itself
 *   compiles: the main data without `backward`, backzone, the held
 *   Yellowknife file, and `backward`'s zone lines without its links (2026f
 *   moved CST6CDT, EST5EDT, MST7MDT and PST8PDT there). The 2025c script
 *   compiled the main data and backzone only, which on 2026f leaves those
 *   five zones out;
 * - the two Makefile builds, which need the archive's ziguard.awk, are not
 *   made. Running a program from the downloaded archive is not allowed for
 *   this measurement, so pinnedVersusMakefileAll and
 *   pinnedVersusMakefileZoneTab are reported as not measured.
 *
 * Everything else (the default build, the shards' decoding, the instants
 * compared, the three remaining figures) is the 2025c script's code.
 *
 *   TZDATA_TARBALL=<tzdata2026f.tar.gz> ZIC=<zic from tzcode 2026f> \
 *     node docs/evidence/tzdb-2026f-20261118/tools/backzone-divergence-2026f.mjs [out.json]
 *
 * Needs zic; runs no other program.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const generator = await import(new URL("../../../../scripts/build-tz-shards.mjs", import.meta.url).href);
const { MAIN_FILES, TZDB_VERSION, TZDB_SHA256, HELD_ZONES, loadRelease, pinnedSources, readTzif, zoneNames } = generator;
const root = new URL("../../../../", import.meta.url).pathname;
const zic = process.env.ZIC ?? "zic";
const { files, main, backzone } = await loadRelease(root);

function compile(sources, fileMap = files) {
  const work = mkdtempSync(join(tmpdir(), "backzone-divergence-"));
  try {
    for (const file of sources) writeFileSync(join(work, file), fileMap.get(file));
    execFileSync(zic, ["-d", join(work, "out"), ...sources.map((file) => join(work, file))], { stdio: ["ignore", "ignore", "pipe"] });
    const out = new Map();
    const walk = (directory, prefix) => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const name = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) walk(join(directory, entry.name), name);
        else out.set(name, readTzif(readFileSync(join(directory, entry.name))));
      }
    };
    walk(join(work, "out"), "");
    return out;
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

/** A clock from a compiled zone: [transitions, offset of each span (null for "-00")]. */
function clockOf(tzif) {
  const offset = (type) => (tzif.designations[type] === "-00" ? null : tzif.offsets[type]);
  return { t: tzif.t, offsets: [offset(0), ...tzif.typeOf.map(offset)] };
}
const at = (clock, s) => {
  let lo = 0;
  let hi = clock.t.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (clock.t[mid] <= s) lo = mid + 1;
    else hi = mid;
  }
  return clock.offsets[lo];
};

/** The shipped shard of each name, decoded as src/geo/zone-history.ts decodes it. */
const shards = new Map();
for (const file of readdirSync(join(root, "src/tzdb")).filter((name) => /-\d\d\.ts$/.test(name))) {
  const bucket = JSON.parse(/JSON\.parse\('(.*)'\);/.exec(readFileSync(join(root, "src/tzdb", file), "utf8"))[1]);
  for (const entry of Object.values(bucket)) {
    const t = [];
    let previous = 0;
    if (entry.t) entry.t.split(",").forEach((part, index) => t.push((previous = index === 0 ? parseInt(part, 36) : previous + parseInt(part, 36))));
    const types = [0];
    for (let index = 0; index < entry.k.length; index += 2) types.push(parseInt(entry.k[index], 36));
    shards.set(entry.n, { t, offsets: types.map((type) => entry.y[type][0]), hostLegal: entry.h === 1 });
  }
}

const EARLIEST = -(2 ** 40);
const FROM_1850 = Date.UTC(1850, 0, 1) / 1000;
/** The instants before 1970 at which two clocks give different offsets; `fill` supplies a clock's "-00" spans. */
function differences(a, b, { fillA = null, skipNull = false } = {}) {
  const points = new Set([EARLIEST]);
  for (const clock of [a, b, fillA].filter(Boolean)) for (const s of clock.t) if (s < 0) points.add(s).add(s - 1);
  const found = [];
  for (const s of [...points].filter((point) => point < 0).sort((x, y) => x - y)) {
    let x = at(a, s);
    const y = at(b, s);
    if (x === null && fillA) x = at(fillA, s);
    if (skipNull && (x === null || y === null)) continue;
    if (x !== y) found.push(s);
  }
  return found;
}

const defaultBuild = compile(MAIN_FILES);
const pinned = pinnedSources(files);
const pinnedBuild = compile(pinned.names, pinned.files);
const { zoneOf } = zoneNames(main, backzone);

const names = [...shards.keys()].sort();
const rows = [];
const missing = [];
for (const name of names) {
  const shipped = shards.get(name);
  const standardTzif = defaultBuild.get(name);
  const pinnedTzif = pinnedBuild.get(zoneOf(name));
  if (!standardTzif || !pinnedTzif) {
    missing.push({ name, defaultBuild: Boolean(standardTzif), pinnedBuild: Boolean(pinnedTzif) });
    continue;
  }
  const standard = clockOf(standardTzif);
  const pinnedClock = clockOf(pinnedTzif);
  rows.push({
    name,
    hostLegal: shipped.hostLegal,
    shipped: differences(shipped, standard, { fillA: standard }),
    pinned: differences(pinnedClock, standard, { skipNull: true })
  });
}
if (missing.length) throw new Error(`backzone-divergence-2026f: names absent from a build: ${JSON.stringify(missing)}`);
const list = (key, from = -Infinity) => rows.filter((row) => row[key].some((s) => s >= from)).map((row) => row.name);
const audit = JSON.parse(readFileSync(join(root, "src/fixtures/tzdb-divergence-98.json"), "utf8")).zones.map((zone) => zone.tz);
const shipped = list("shipped");
const pinnedList = list("pinned");
const notMeasured = "not measured: this build needs the archive's ziguard.awk, and no program from the downloaded archive was run";
const report = {
  tzdata: { version: TZDB_VERSION, sha256: TZDB_SHA256 },
  held: HELD_ZONES.map(({ name, file, sha256, release }) => ({ name, file, sha256, release })),
  zic: execFileSync(zic, ["--version"]).toString().trim(),
  pinnedSources: pinned.names,
  names: names.length,
  compared: "UTC offsets at every instant before 1970-01-01T00:00Z (each transition of either clock before 1970, the second before it, and a date before all of them)",
  shippedVersusDefault: {
    meaning: `names whose answer before 1970 differs from a host with tzdb ${TZDB_VERSION}: the package's shards, with -00 spans read from the default build, against tzdata ${TZDB_VERSION}'s default build`,
    count: shipped.length,
    from1850: list("shipped", FROM_1850).length,
    names: shipped
  },
  pinnedVersusDefault: {
    meaning: "names whose history before 1970 differs between the two builds, the pinned build (pinnedSources of scripts/build-tz-shards.mjs, names resolved as the generator resolves them) and the default, -00 spans skipped",
    count: pinnedList.length,
    from1850: list("pinned", FROM_1850).length,
    names: pinnedList,
    notShippedBecauseHostLegal: pinnedList.filter((name) => !shipped.includes(name) && rows.find((row) => row.name === name).hostLegal),
    notShippedOtherwise: pinnedList.filter((name) => !shipped.includes(name) && !rows.find((row) => row.name === name).hostLegal),
    shippedOnly: shipped.filter((name) => !pinnedList.includes(name))
  },
  hostLegal: rows.filter((row) => row.hostLegal).map((row) => row.name),
  pinnedVersusMakefileAll: { meaning: "the pinned build against the Makefile's PACKRATDATA=backzone with PACKRATLIST empty", count: null, status: notMeasured },
  pinnedVersusMakefileZoneTab: { meaning: "the pinned build against PACKRATDATA=backzone PACKRATLIST=zone.tab", count: null, status: notMeasured },
  auditList: {
    file: "src/fixtures/tzdb-divergence-98.json",
    zones: audit.length,
    listedButUnchanged: audit.filter((name) => !shipped.includes(name)).sort(),
    changedButNotListed: shipped.filter((name) => !audit.includes(name))
  }
};
const text = `${JSON.stringify(report, null, 1)}\n`;
if (process.argv[2]) writeFileSync(process.argv[2], text);
process.stdout.write(text);
