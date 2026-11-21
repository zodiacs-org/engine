// At each span's probe, compare the table's columns with the pinned release
// and the first baseline with a different offset. Compile each release with
// zic and read the offsets with GNU date (TZ=:file, %::z).
// Also list the names missing from each baseline and their span counts.
//
// Run from the repository root with the generator's tarball variables (TZDATA_2026F_TARBALL,
// TZDATA_2021A_TARBALL, TZDATA_2025C_TARBALL); each archive's SHA-256 is checked against tzdata-sources.tsv.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const evidence = "docs/evidence/host-zone-probes-20261118";
const table = JSON.parse(readFileSync("src/geo/host-probes-intervals.json", "utf8"));
const files = ["africa", "antarctica", "asia", "australasia", "europe", "northamerica", "southamerica", "etcetera", "backward"];
const digests = new Map(
  readFileSync(`${evidence}/results/tzdata-sources.tsv`, "utf8")
    .trim()
    .split("\n")
    .slice(1)
    .map((line) => line.split("\t"))
    .map(([, file, , sha256]) => [file.replace(/^\d+-tzdata|\.tar\.gz$/g, ""), sha256])
);

const work = mkdtempSync(join(tmpdir(), "check-probes-"));
const out = [];
try {
  out.push(execFileSync("zic", ["--version"], { encoding: "utf8" }).trim());
  out.push(execFileSync("date", ["--version"], { encoding: "utf8" }).split("\n")[0]);
  const versions = [table.pinned.version, ...table.baselines.map(({ version }) => version)];
  const builds = new Map();
  for (const version of versions) {
    const archive = process.env[`TZDATA_${version.toUpperCase()}_TARBALL`];
    assert.ok(archive, `set TZDATA_${version.toUpperCase()}_TARBALL`);
    const digest = createHash("sha256").update(readFileSync(archive)).digest("hex");
    assert.equal(digest, digests.get(version), `${archive}: sha256`);
    const source = join(work, version);
    mkdirSync(source);
    execFileSync("tar", ["--extract", "--gzip", "--file", archive, "--directory", source, "--no-same-owner", "--no-same-permissions", "version", ...files]);
    assert.equal(readFileSync(join(source, "version"), "utf8").trim(), version);
    const zoneinfo = join(work, `zi-${version}`);
    execFileSync("zic", ["-b", "fat", "-d", zoneinfo, ...files.map((file) => join(source, file))], { stdio: ["ignore", "ignore", "pipe"] });
    const names = new Set();
    const walk = (directory, prefix) => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const name = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) walk(join(directory, entry.name), name);
        else names.add(name);
      }
    };
    walk(zoneinfo, "");
    builds.set(version, { zoneinfo, names });
    out.push(`${version}: sha256 ${digest}, ${names.size} names`);
  }

  /** Offsets in seconds east at the given ISO instants, as glibc reads the compiled file. */
  const offsets = (version, name, instants) => {
    const list = join(work, "instants");
    writeFileSync(list, instants.map((instant) => `${instant}\n`).join(""));
    const text = execFileSync("date", ["--file", list, "+%::z"], {
      encoding: "utf8",
      env: { PATH: process.env.PATH, LC_ALL: "C", TZ: `:${join(builds.get(version).zoneinfo, name)}` }
    });
    const values = text
      .trim()
      .split("\n")
      .map((value) => {
        assert.match(value, /^[+-]\d{2}:\d{2}:\d{2}$/);
        const [h, m, s] = value.slice(1).split(":").map(Number);
        return (value[0] === "-" ? -1 : 1) * (h * 3600 + m * 60 + s);
      });
    assert.equal(values.length, instants.length);
    return values;
  };

  const [pinned, ...baselines] = versions;
  let spans = 0;
  const failures = [];
  for (const [name, rows] of Object.entries(table.byName)) {
    assert.ok(builds.get(pinned).names.has(name), `${name} is not in ${pinned}`);
    const probes = rows.map(([, , probe]) => probe);
    const pinnedAt = offsets(pinned, name, probes);
    const baselineAt = baselines.filter((version) => builds.get(version).names.has(name)).map((version) => offsets(version, name, probes));
    rows.forEach(([from, to, probe, pinnedColumn, baselineColumn], index) => {
      spans += 1;
      const first = baselineAt.map((list) => list[index]).find((offset) => offset !== pinnedAt[index]);
      if (pinnedAt[index] !== pinnedColumn || first === undefined || first !== baselineColumn) {
        failures.push(`${name} ${from} ${to} probe ${probe}: ${pinned} ${pinnedAt[index]} (table ${pinnedColumn}), first differing baseline ${first} (table ${baselineColumn})`);
      }
    });
  }
  assert.equal(spans, table.intervals);
  out.push(`${spans} spans in ${Object.keys(table.byName).length} names checked at their probes: ${failures.length} failures`);
  out.push(...failures);

  for (const baseline of baselines) {
    const missing = [...builds.get(pinned).names].filter((name) => !builds.get(baseline).names.has(name)).sort();
    out.push(`names in ${pinned} and not in ${baseline}: ${missing.length ? missing.join(", ") : "none"}`);
    for (const name of missing) out.push(`  ${name}: ${table.byName[name]?.length ?? 0} spans`);
  }
  assert.equal(failures.length, 0);
} finally {
  rmSync(work, { recursive: true, force: true });
  console.log(out.join("\n"));
}
