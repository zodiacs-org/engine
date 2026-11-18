/*
 * The atlas's tzdb comparison zones on tzdata 2025c and 2026f: for each zone
 * named by atlas/data (a place's tzdbZone or compareZones), the initial
 * offset and every transition up to 1920-01-02T00:00:00Z, read with
 * atlas/tools/tzdb-extract.mjs's own extraction from two trees compiled the
 * same way, by the same zic:
 *
 * - "2025c": tzdata 2025c's pinnedSources() (scripts/build-tz-shards.mjs):
 *   the main data without `backward`, backzone, and `backward`'s zone lines;
 * - "2026f": tzdata 2026f's pinnedSources(), which add the held
 *   America/Yellowknife file, as the shard generator compiles them.
 *
 * It also compares each zone with the committed extract,
 * atlas/tzdb/tzdb-2025c.json, which the L3 recipe built with the archive's
 * ziguard.awk and zishrink.awk. Those programs are not run here, so the
 * trees are not the L3 tree, and their TZif files can differ from the
 * committed ones byte for byte; the comparison with the committed extract
 * is of offsets, abbreviations, DST flags and instants only. Nothing is
 * written to atlas/.
 *
 *   ZIC=<zic from tzcode 2026f> node docs/evidence/tzdb-2026f-20261118/tools/atlas-zones-2026f.mjs \
 *     <tzdata2025c.tar.gz> <tzdata2026f.tar.gz> [out.json]
 *
 * Needs zic; runs no other program.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";

const root = new URL("../../../../", import.meta.url).pathname;
const zic = process.env.ZIC ?? "zic";
const [tarball2025c, tarball2026f, out] = process.argv.slice(2);
if (!tarball2025c || !tarball2026f) throw new Error("give <tzdata2025c.tar.gz> <tzdata2026f.tar.gz> [out.json]");

/** SHA-256 of each archive, as fetched/MANIFEST.tsv records it. */
const EXPECTED = {
  "2025c": "4aa79e4effee53fc4029ffe5f6ebe97937282ebcdf386d5d2da91ce84142f957",
  "2026f": "01b4a91cec5167ed48c11e8ab78f2048cead78ce94b0cafcad0ae8c5a3044d3d"
};
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
for (const [release, path] of [["2025c", tarball2025c], ["2026f", tarball2026f]]) {
  const digest = sha256(readFileSync(path));
  if (digest !== EXPECTED[release]) throw new Error(`${path} has sha256 ${digest}, expected ${EXPECTED[release]}`);
}

process.env.TZDATA_TARBALL = tarball2026f;
const generator = await import(join(root, "scripts/build-tz-shards.mjs"));
const { buildExtract, EXTRACT_PATH } = await import(join(root, "atlas/tools/tzdb-extract.mjs"));

const release2026f = (await generator.loadRelease(root)).files;
const release2025c = generator.untar(gunzipSync(readFileSync(tarball2025c)));
if (release2025c.get("version")?.trim() !== "2025c") throw new Error("the 2025c archive reports another version");

/** Compile a release's pinned sources and read the atlas zones with tzdb-extract's own code. */
function extract(files) {
  const { files: sources, names } = generator.pinnedSources(files);
  const work = mkdtempSync(join(tmpdir(), "atlas-zones-"));
  try {
    for (const name of names) writeFileSync(join(work, name), sources.get(name));
    execFileSync(zic, ["-d", join(work, "out"), ...names.map((name) => join(work, name))], { stdio: ["ignore", "ignore", "pipe"] });
    const parsed = JSON.parse(buildExtract(join(work, "out")));
    return { sources: names, zones: parsed.zones };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

const a = extract(release2025c);
const b = extract(release2026f);
const committed = JSON.parse(readFileSync(EXTRACT_PATH, "utf8")).zones;
const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
const offsets = (zone) => ({ initial: zone.initial, transitions: zone.transitions });

const zones = {};
for (const name of Object.keys(committed).sort()) {
  const x = a.zones[name];
  const y = b.zones[name];
  zones[name] = {
    transitionsTo1920: { "2025c": x.transitions.length, "2026f": y.transitions.length },
    initial: { "2025c": x.initial, "2026f": y.initial },
    initialSame: same(x.initial, y.initial),
    transitionsSame: same(x.transitions, y.transitions),
    tzifSha256: { "2025c": x.sha256, "2026f": y.sha256, committedExtract: committed[name].sha256 },
    matchesCommittedExtract: { "2025c": same(offsets(x), offsets(committed[name])), "2026f": same(offsets(y), offsets(committed[name])) }
  };
}
const report = {
  compared: "per atlas zone: the initial offset, abbreviation and DST flag, and every transition before 1920-01-02T00:00:00Z, as atlas/tools/tzdb-extract.mjs reads them",
  zic: execFileSync(zic, ["--version"]).toString().trim(),
  tzdata: { "2025c": EXPECTED["2025c"], "2026f": EXPECTED["2026f"] },
  sources: { "2025c": a.sources, "2026f": b.sources },
  committedExtract: "atlas/tzdb/tzdb-2025c.json",
  summary: {
    zones: Object.keys(zones).length,
    initialSame: Object.values(zones).filter((zone) => zone.initialSame).length,
    transitionsSame: Object.values(zones).filter((zone) => zone.transitionsSame).length,
    tzifSame: Object.values(zones).filter((zone) => zone.tzifSha256["2025c"] === zone.tzifSha256["2026f"]).length,
    tzifSameAsCommittedExtract: Object.values(zones).filter((zone) => zone.tzifSha256["2026f"] === zone.tzifSha256.committedExtract).length,
    matchCommittedExtract2025c: Object.values(zones).filter((zone) => zone.matchesCommittedExtract["2025c"]).length,
    matchCommittedExtract2026f: Object.values(zones).filter((zone) => zone.matchesCommittedExtract["2026f"]).length
  },
  zones
};
const text = `${JSON.stringify(report, null, 1)}\n`;
if (out) writeFileSync(out, text);
process.stdout.write(text);
