/*
 * Which zone names answer differently before 1970 under the history this
 * package ships than under tzdata 2025c's default build, which is what Intl
 * carries on a host with tzdb 2025c and what rc.14 read for every date.
 *
 * Every comparison is of UTC offsets, in seconds, at every instant before
 * 1970-01-01T00:00Z: the offsets are constant between transitions, so each
 * pair of clocks is compared at every transition of either before 1970, the
 * second before it, and a date before all of them. zic 2025c compiles every
 * build from tzdata2025c.tar.gz (the pinned digest):
 *
 * - "default": the main data files with `backward` (the tzdb Makefile's
 *   default, which ICU and so Intl carry);
 * - "pinned": the main data files without `backward`, and `backzone`, a name
 *   resolving as scripts/build-tz-shards.mjs resolves it (backzone's zone of
 *   that name, then the main data's, then a link, backzone's first);
 * - "shipped": what the package answers: the shard of each name as the
 *   engine decodes it (the pinned history, or the default build's for the 16
 *   names marked host-legal), with spans tzdb marks "-00" read from the
 *   default build, as the engine reads them from Intl;
 * - the Makefile's two backzone forms, from its own ziguard.awk: "all"
 *   (PACKRATDATA=backzone, PACKRATLIST empty) and "zone.tab"
 *   (PACKRATDATA=backzone PACKRATLIST=zone.tab, the form Debian builds and the
 *   audit's list, src/fixtures/tzdb-divergence-98.json, compared with ICU).
 *
 *   TZDATA_TARBALL=<tzdata2025c.tar.gz> [ZIC=<zic>] node docs/evidence/rc15-20260929/backzone-divergence.mjs [out.json]
 *
 * Needs zic and awk.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const generator = await import(new URL("../../../scripts/build-tz-shards.mjs", import.meta.url).href);
const { MAIN_FILES, BACKZONE, TZDB_VERSION, TZDB_SHA256, loadRelease, readTzif, zoneNames } = generator;
const root = new URL("../../../", import.meta.url).pathname;
const zic = process.env.ZIC ?? "zic";
const { files, main, backzone } = await loadRelease(root);

function compile(sources, zi = null) {
  const work = mkdtempSync(join(tmpdir(), "backzone-divergence-"));
  try {
    for (const file of sources) writeFileSync(join(work, file), files.get(file));
    const inputs = zi === null ? sources.map((file) => join(work, file)) : [join(work, "input.zi")];
    if (zi !== null) {
      const [dataform, packratlist] = zi;
      writeFileSync(join(work, "ziguard.awk"), files.get("ziguard.awk"));
      writeFileSync(join(work, "zone.tab"), files.get("zone.tab"));
      const text = execFileSync(
        "awk",
        ["-v", `DATAFORM=${dataform}`, "-v", "PACKRATDATA=backzone", "-v", `PACKRATLIST=${packratlist}`, "-f", "ziguard.awk", ...sources],
        { cwd: work, maxBuffer: 1 << 26 }
      );
      writeFileSync(join(work, "input.zi"), text);
    }
    execFileSync(zic, ["-d", join(work, "out"), ...inputs], { stdio: ["ignore", "ignore", "pipe"] });
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
const pinnedBuild = compile(MAIN_FILES.filter((file) => file !== "backward").concat(BACKZONE));
const makefile = MAIN_FILES.filter((file) => file !== "backward").concat("factory", "backward", BACKZONE);
const allBuild = compile(makefile, ["main", ""]);
const zoneTabBuild = compile(makefile, ["main", "zone.tab"]);
const { zoneOf } = zoneNames(main, backzone);

const names = [...shards.keys()].sort();
const rows = [];
for (const name of names) {
  const shipped = shards.get(name);
  const standard = clockOf(defaultBuild.get(name));
  const pinned = clockOf(pinnedBuild.get(zoneOf(name)));
  const shippedDiff = differences(shipped, standard, { fillA: standard });
  const pinnedDiff = differences(pinned, standard, { skipNull: true });
  rows.push({
    name,
    hostLegal: shipped.hostLegal,
    shipped: shippedDiff,
    pinned: pinnedDiff,
    all: differences(pinned, clockOf(allBuild.get(name))),
    zoneTab: differences(pinned, clockOf(zoneTabBuild.get(name)), { skipNull: true })
  });
}
const list = (key, from = -Infinity) => rows.filter((row) => row[key].some((s) => s >= from)).map((row) => row.name);
const audit = JSON.parse(readFileSync(join(root, "src/fixtures/tzdb-divergence-98.json"), "utf8")).zones.map((zone) => zone.tz);
const shipped = list("shipped");
const pinned = list("pinned");
const report = {
  tzdata: { version: TZDB_VERSION, sha256: TZDB_SHA256 },
  zic: execFileSync(zic, ["--version"]).toString().trim(),
  names: names.length,
  compared: "UTC offsets at every instant before 1970-01-01T00:00Z (each transition of either clock before 1970, the second before it, and a date before all of them)",
  shippedVersusDefault: {
    meaning: "names whose answer before 1970 differs from rc.14's on a host with tzdb 2025c: the package's shards, with -00 spans read from the default build, against the default build",
    count: shipped.length,
    from1850: list("shipped", FROM_1850).length,
    names: shipped
  },
  pinnedVersusDefault: {
    meaning: "names whose history before 1970 differs between the two builds, main+backzone (as the generator resolves names) and the default, -00 spans skipped",
    count: pinned.length,
    from1850: list("pinned", FROM_1850).length,
    names: pinned,
    notShippedBecauseHostLegal: pinned.filter((name) => !shipped.includes(name) && rows.find((row) => row.name === name).hostLegal),
    notShippedOtherwise: pinned.filter((name) => !shipped.includes(name) && !rows.find((row) => row.name === name).hostLegal),
    shippedOnly: shipped.filter((name) => !pinned.includes(name))
  },
  pinnedVersusMakefileAll: {
    meaning: "main+backzone as the generator compiles it against the Makefile's PACKRATDATA=backzone with PACKRATLIST empty, every offset before 1970, -00 included",
    count: list("all").length,
    names: list("all"),
    // Each is a Link in backzone to a zone that backzone adds in place of a Link of backward.
    links: list("all").map((name) => {
      const follows = (target) => target !== undefined && JSON.stringify(allBuild.get(name)) === JSON.stringify(allBuild.get(target));
      const backzoneLink = backzone.links.get(name);
      const backwardLink = main.links.get(name);
      return {
        name,
        backzoneLink,
        backwardLink,
        makefileFollows: follows(backwardLink) ? "backward" : follows(backzoneLink) ? "backzone" : "other"
      };
    })
  },
  pinnedVersusMakefileZoneTab: {
    meaning: "the same against PACKRATDATA=backzone PACKRATLIST=zone.tab, -00 spans skipped",
    count: list("zoneTab").length,
    names: list("zoneTab")
  },
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
