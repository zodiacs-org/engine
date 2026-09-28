// Regression cases for scripts/verify-archive-binding.mjs on synthetic git
// repositories, including every bypass the independent reviews of rc.13 and
// rc.14 found: a rewrite hidden by merge simplification, superseded bytes
// restored later, a rewritten manifest, a symbolic link in place of
// artifacts/, an archive present only in the working tree, other files under
// artifacts/, a packed file changed after its archive was carried, a second
// archive under a version npm reads as an existing one, a HEAD version
// changed only by build metadata, a case variant of artifacts/, and a
// checkout whose node_modules would decide the rebuild.
import { spawnSync, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

const SCRIPT = fileURLToPath(new URL("./verify-archive-binding.mjs", import.meta.url));
const made = [];
afterAll(() => { for (const dir of made) rmSync(dir, { recursive: true, force: true }); });
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const scratch = (prefix) => { const dir = mkdtempSync(join(tmpdir(), prefix)); made.push(dir); return dir; };

function repository() {
  const dir = scratch("zodiacs-binding-case-");
  const git = (...args) => execFileSync("git", ["-c", "user.name=Case", "-c", "user.email=case@example.invalid",
    "-c", "commit.gpgsign=false", ...args], { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const write = (path, text) => {
    mkdirSync(join(dir, path, ".."), { recursive: true });
    writeFileSync(join(dir, path), text);
  };
  const commit = (message) => {
    git("add", "-A");
    git("commit", "-q", "--allow-empty", "-m", message);
    return git("rev-parse", "HEAD").trim();
  };
  const metadata = (version, readme = `Synthetic ${version}\n`) => ({
    "package.json": `${JSON.stringify({ name: "synthetic", version })}\n`, "README.md": readme,
    "CHANGELOG.md": "changes\n", LICENSE: "MIT\n", "LICENSING.md": "licensing\n", NOTICE: "notice\n"
  });
  /** An npm-like .tgz of package/<file> for the given metadata and a dist file. */
  const pack = (files, dist = "export {};\n") => {
    const stage = scratch("zodiacs-binding-stage-");
    for (const [name, text] of Object.entries({ ...files, "dist/index.js": dist })) {
      mkdirSync(join(stage, "package", name, ".."), { recursive: true });
      writeFileSync(join(stage, "package", name), text);
    }
    execFileSync("tar", ["--format=ustar", "-czf", join(stage, "out.tgz"), "-C", stage, "package"]);
    return readFileSync(join(stage, "out.tgz"));
  };
  const entries = [];
  const writeManifest = () => {
    write("artifacts/archives.json", `${JSON.stringify({ schema: "zodiacs.engine-archives.v1", archives: entries }, null, 2)}\n`);
    write("artifacts/README.md", entries.map((entry) => `${entry.version} ${entry.sha256}`).join("\n") + "\n");
  };
  const carry = (version, bytes, sourceCommit, extra = {}) => {
    const file = `zodiacs-engine-${version}.tgz`;
    mkdirSync(join(dir, "artifacts"), { recursive: true });
    writeFileSync(join(dir, "artifacts", file), bytes);
    write(`artifacts/zodiacs-engine-${version}.sha256`, `${sha256(bytes)}  ${file}\n`);
    const files = execFileSync("tar", ["-tzf", join(dir, "artifacts", file)], { encoding: "utf8" }).split("\n").filter((line) => line && !line.endsWith("/")).length;
    entries.push({ version, file, sha256: sha256(bytes), bytes: bytes.length, files, sourceCommit, status: "carried", ...extra });
    writeManifest();
  };
  const source = (version, readme) => {
    for (const [name, text] of Object.entries(metadata(version, readme))) write(name, text);
    return commit(`source ${version}`);
  };
  const check = (...args) => {
    const run = spawnSync(process.execPath, [SCRIPT, "--root", dir, ...args], { encoding: "utf8" });
    return { status: run.status, output: `${run.stdout}${run.stderr}` };
  };
  /** The check as `npm run archive:binding` starts it in this checkout: its node_modules/.bin first on PATH. */
  const checkAsNpmRun = (...args) => {
    const env = { ...process.env, PATH: `${join(dir, "node_modules", ".bin")}${delimiter}${process.env.PATH}`,
      INIT_CWD: dir, npm_config_local_prefix: dir, npm_package_json: join(dir, "package.json"), npm_lifecycle_event: "archive:binding" };
    const run = spawnSync(process.execPath, [SCRIPT, "--root", dir, ...args], { encoding: "utf8", env });
    return { status: run.status, output: `${run.stdout}${run.stderr}` };
  };
  mkdirSync(join(dir, "artifacts"), { recursive: true });
  git("init", "-q", "-b", "main");
  return { dir, git, write, commit, metadata, pack, carry, entries, writeManifest, source, check, checkAsNpmRun };
}

/** A clean history: 0.0.1 carried from its source commit, then work on 0.0.2 with no archive yet. */
function carriedOnce() {
  const r = repository();
  const s1 = r.source("0.0.1");
  const bytes = r.pack(r.metadata("0.0.1"));
  r.carry("0.0.1", bytes, s1);
  const c1 = r.commit("carry 0.0.1");
  r.source("0.0.2");
  return { ...r, s1, c1, bytes };
}

/** A JSON file listing superseded entries, for --pinned-superseded. */
function pinnedFile(entries) {
  const path = join(scratch("zodiacs-binding-pinned-"), "pinned.json");
  writeFileSync(path, JSON.stringify(entries));
  return path;
}

/**
 * Commit files through the index alone, never the working tree, which on a
 * case-insensitive disk could not hold names that differ only in case.
 */
function commitBlobs(r, files, message) {
  for (const [path, bytes] of Object.entries(files)) {
    const blob = execFileSync("git", ["hash-object", "-w", "--stdin"], { cwd: r.dir, input: bytes, encoding: "utf8" }).trim();
    r.git("update-index", "--add", "--cacheinfo", `100644,${blob},${path}`);
  }
  r.git("commit", "-q", "-m", message);
  return r.git("rev-parse", "HEAD").trim();
}

/** Replace artifacts/ in the working tree with a symbolic link to a directory holding other bytes for 0.0.1. */
function linkArtifacts(r, evil) {
  r.git("mv", "artifacts", "real");
  writeFileSync(join(r.dir, "real", "zodiacs-engine-0.0.1.tgz"), evil);
  symlinkSync("real", join(r.dir, "artifacts"), "dir");
}

describe("archive binding check", () => {
  it("passes a clean history and skips the rebuild until the version's archive exists", () => {
    const r = carriedOnce();
    const result = r.check();
    expect(result.output).toContain("skipping the rebuild of HEAD");
    expect(result.status).toBe(0);
  });

  it("sees a rewrite on a side branch hidden by merge simplification", () => {
    const r = carriedOnce();
    r.git("checkout", "-q", "-b", "side", r.c1);
    const other = r.pack(r.metadata("0.0.1"), "export const repacked = true;\n");
    r.carry("0.0.1", other, r.s1);
    r.entries.pop(); // the manifest keeps the original entry
    r.writeManifest();
    r.commit("repack 0.0.1 (breach)");
    r.carry("0.0.1", r.bytes, r.s1);
    r.entries.pop();
    r.writeManifest();
    r.commit("restore 0.0.1");
    r.git("checkout", "-q", "main");
    r.git("merge", "-q", "--no-edit", "side");
    const result = r.check();
    expect(result.status).toBe(1);
    expect(result.output).toContain(`sha256 ${sha256(other)}`);
  });

  it("sees an archive carried and removed on a merged side branch", () => {
    const r = carriedOnce();
    r.git("checkout", "-q", "-b", "side");
    r.carry("0.0.2", r.pack(r.metadata("0.0.2")), r.git("rev-parse", "HEAD").trim());
    r.commit("carry 0.0.2");
    r.git("rm", "-q", "artifacts/zodiacs-engine-0.0.2.tgz", "artifacts/zodiacs-engine-0.0.2.sha256");
    r.entries.pop();
    r.writeManifest();
    r.commit("remove 0.0.2");
    r.git("checkout", "-q", "main");
    r.git("merge", "-q", "--no-edit", "side");
    const result = r.check();
    expect(result.status).toBe(1);
    expect(result.output).toContain("artifacts/zodiacs-engine-0.0.2.tgz was committed and is missing from HEAD");
  });

  it("allows pinned superseded bytes only in their pinned commit, and refuses any other superseded entry", () => {
    // As with rc.11: the first packing is carried with its source, then one
    // commit changes the source and replaces the archive under the same
    // version. As in the real history, the manifest is written afterwards.
    const breachHistory = (lingering) => {
      const r = repository();
      const place = (bytes) => {
        writeFileSync(join(r.dir, "artifacts", "zodiacs-engine-0.0.1.tgz"), bytes);
        r.write("artifacts/zodiacs-engine-0.0.1.sha256", `${sha256(bytes)}  zodiacs-engine-0.0.1.tgz\n`);
      };
      const entry = (bytes, sourceCommit, extra = {}) => ({ version: "0.0.1", file: "zodiacs-engine-0.0.1.tgz", sha256: sha256(bytes),
        bytes: bytes.length, files: 7, sourceCommit, status: "carried", ...extra });
      for (const [name, text] of Object.entries(r.metadata("0.0.1"))) r.write(name, text);
      const first = r.pack(r.metadata("0.0.1"), "export const first = true;\n");
      place(first);
      const early = r.commit("source and first packing of 0.0.1");
      if (lingering) r.commit("unrelated work that still carries the first packing");
      r.write("CHANGELOG.md", "repaired\n");
      const second = r.pack({ ...r.metadata("0.0.1"), "CHANGELOG.md": "repaired\n" });
      place(second);
      const repaired = r.commit("repair and repack 0.0.1 under the same version");
      r.entries.push(entry(first, early, { status: "superseded", onlyInCommit: early }), entry(second, repaired));
      r.writeManifest();
      r.commit("record the manifest");
      r.source("0.0.2");
      return { ...r, first, pin: pinnedFile([r.entries[0]]) };
    };
    const r = breachHistory(false);
    const clean = r.check("--pinned-superseded", r.pin);
    expect(clean.output).toContain("1 superseded");
    expect(clean.status).toBe(0);
    // The same manifest without the pin: a superseded entry cannot be added through the manifest.
    const unpinned = r.check();
    expect(unpinned.status).toBe(1);
    expect(unpinned.output).toContain("is a superseded entry that this script does not pin");
    // Restoring the superseded bytes later is refused, as in the review's synthetic breach.
    writeFileSync(join(r.dir, "artifacts", "zodiacs-engine-0.0.1.tgz"), r.first);
    r.commit("swap back to the superseded bytes");
    const restored = r.check("--pinned-superseded", r.pin);
    expect(restored.status).toBe(1);
    // Both the pinned commit and the swap hold them; only the swap is disallowed, and one
    // report names every commit that holds the digest.
    expect(restored.output).toContain(`sha256 ${sha256(r.first)} in 2 commit(s)`);
    // So is a second commit holding them, even one that merely follows the first.
    const l = breachHistory(true);
    const lingering = l.check("--pinned-superseded", l.pin);
    expect(lingering.status).toBe(1);
    expect(lingering.output).toContain(`sha256 ${sha256(l.first)} in 2 commit(s)`);
  });

  it("refuses a rewritten manifest that whitelists replaced bytes", () => {
    // The rc.14 review's case 1b: a new source commit for the same version, new bytes carried
    // from it, and the old bytes turned into superseded entries, one per commit that held them.
    const r = carriedOnce();
    r.commit("more work");
    for (const [name, text] of Object.entries(r.metadata("0.0.1"))) r.write(name, text);
    const again = r.commit("source 0.0.1 again");
    const holders = r.git("rev-list", "HEAD").trim().split("\n").filter((commit) => {
      try { return r.git("rev-parse", `${commit}:artifacts/zodiacs-engine-0.0.1.tgz`).trim() !== ""; } catch { return false; }
    });
    const original = r.entries[0];
    r.entries.length = 0;
    for (const commit of holders) r.entries.push({ ...original, status: "superseded", onlyInCommit: commit });
    r.carry("0.0.1", r.pack(r.metadata("0.0.1"), "export const replaced = true;\n"), again);
    r.commit("replace 0.0.1 and whitelist the old bytes");
    r.source("0.0.2");
    // Even with every whitelisted entry pinned, the manifest has changed an entry it had.
    const result = r.check("--pinned-superseded", pinnedFile(r.entries.filter((entry) => entry.status === "superseded")));
    expect(result.status).toBe(1);
    expect(result.output).toContain("is not a prefix of HEAD's (the manifest is append-only)");
    expect(result.output).toContain("drops or changes entries of its parent");
  });

  it("refuses artifacts/ as a symbolic link, at HEAD or in a middle commit restored by a merge", () => {
    const atHead = carriedOnce();
    linkArtifacts(atHead, atHead.pack(atHead.metadata("0.0.1"), "export const evil = true;\n"));
    atHead.commit("artifacts is now a symbolic link to other bytes");
    const head = atHead.check();
    expect(head.status).toBe(1);
    expect(head.output).toContain("artifacts is not a directory (git mode 120000, blob) in 1 commit(s)");

    // The rc.14 review's case 2c: main swaps artifacts/ for a link, and a merge of a side
    // branch that still holds the original restores it.
    const r = carriedOnce();
    r.git("checkout", "-q", "-b", "side");
    r.write("side.txt", "side work\n");
    r.commit("side work, archive untouched");
    r.git("checkout", "-q", "main");
    linkArtifacts(r, r.pack(r.metadata("0.0.1"), "export const evil = true;\n"));
    const linked = r.commit("artifacts is a symbolic link to other bytes");
    try { r.git("merge", "-q", "--no-commit", "--no-ff", "side"); } catch { /* resolved below */ }
    r.git("rm", "-r", "-q", "--cached", "--ignore-unmatch", "artifacts", "real");
    rmSync(join(r.dir, "artifacts"), { recursive: true, force: true });
    rmSync(join(r.dir, "real"), { recursive: true, force: true });
    r.git("checkout", "side", "--", "artifacts");
    r.commit("merge side");
    const merged = r.check();
    expect(merged.status).toBe(1);
    expect(merged.output).toContain(`artifacts is not a directory (git mode 120000, blob) in 1 commit(s): ${linked.slice(0, 12)}`);
  });

  it("refuses anything under artifacts/ but archives, receipts, the manifest and its README", () => {
    const r = carriedOnce();
    r.write("artifacts/old/zodiacs-engine-0.0.1.tgz", "");
    writeFileSync(join(r.dir, "artifacts/old/zodiacs-engine-0.0.1.tgz"), r.pack(r.metadata("0.0.1"), "export const evil = true;\n"));
    r.write("artifacts/notes.txt", "notes\n");
    r.commit("another copy under artifacts/old, and a note");
    const result = r.check();
    expect(result.status).toBe(1);
    expect(result.output).toContain("artifacts/old is not README.md, archives.json, or an archive or receipt named for a strict semantic version (git mode 040000, tree)");
    expect(result.output).toContain("artifacts/notes.txt is not README.md");
  });

  it("reads HEAD from git objects, never the working tree", () => {
    // An archive that HEAD no longer holds does not pass for being on disk (the rc.14 review's case 5).
    const untracked = carriedOnce();
    untracked.git("rm", "-q", "--cached", "artifacts/zodiacs-engine-0.0.1.tgz");
    untracked.git("commit", "-q", "-m", "stop tracking 0.0.1, leaving the file on disk");
    expect(untracked.git("status", "--porcelain", "--untracked-files=all")).toContain("?? artifacts/zodiacs-engine-0.0.1.tgz");
    const gone = untracked.check();
    expect(gone.status).toBe(1);
    expect(gone.output).toContain("artifacts/zodiacs-engine-0.0.1.tgz is recorded as carried but HEAD does not hold it");
    expect(gone.output).toContain("artifacts/zodiacs-engine-0.0.1.tgz was committed and is missing from HEAD");
    // Uncommitted bytes in the working tree neither pass nor fail the check.
    const dirty = carriedOnce();
    writeFileSync(join(dirty.dir, "artifacts", "zodiacs-engine-0.0.1.tgz"), dirty.pack(dirty.metadata("0.0.1"), "export const evil = true;\n"));
    unlinkSync(join(dirty.dir, "artifacts", "zodiacs-engine-0.0.1.sha256"));
    expect(dirty.check().status).toBe(0);
  });

  it("rebuilds HEAD in both modes, so a packed file changed after the carrier fails either way", () => {
    // A buildable package, packed by npm itself, as the check packs it.
    const r = repository();
    const manifest = `${JSON.stringify({ name: "@zodiacs/engine", version: "0.0.1", scripts: { build: "node -e 0" },
      files: ["dist", "README.md", "CHANGELOG.md", "LICENSE", "LICENSING.md", "NOTICE"] }, null, 2)}\n`;
    for (const [name, text] of Object.entries({ ...r.metadata("0.0.1"), "package.json": manifest, "dist/index.js": "export {};\n" })) r.write(name, text);
    const s1 = r.commit("source 0.0.1");
    const stage = scratch("zodiacs-binding-npm-");
    const [report] = JSON.parse(execFileSync("npm", ["pack", "--ignore-scripts", "--json", "--pack-destination", stage], { cwd: r.dir, encoding: "utf8" }));
    r.carry("0.0.1", readFileSync(join(stage, report.filename)), s1);
    r.commit("carry 0.0.1");
    const carriedHead = r.check();
    expect(carriedHead.status).toBe(0);
    expect(carriedHead.output).toContain("artifacts/zodiacs-engine-0.0.1.tgz is byte-identical to a rebuild of HEAD");
    // The rc.14 review's blocker: a merge brings a new LICENSING.md, packed, under the same version.
    r.write("LICENSING.md", "licensing, with a new section\n");
    r.commit("merge a change to a packed file");
    const changed = r.check();
    expect(changed.status).toBe(1);
    expect(changed.output).toContain("is not the archive HEAD");
    expect(changed.output).toContain("package/LICENSING.md");
    const all = r.check("--rebuild-all");
    expect(all.status).toBe(1);
    expect(all.output).toContain("is not the archive HEAD");
    expect(all.output).toContain(`is byte-identical to a rebuild of source commit ${s1.slice(0, 12)}`);
  });

  it("checks the receipt of every version, not only the current one", () => {
    const r = carriedOnce();
    r.write("artifacts/zodiacs-engine-0.0.1.sha256", `${"0".repeat(64)}  zodiacs-engine-0.0.1.tgz\n`);
    r.commit("edit an old receipt");
    const result = r.check();
    expect(result.status).toBe(1);
    expect(result.output).toContain("The receipt for 0.0.1 at HEAD does not name its recorded bytes");
  });

  it("binds each archive to its recorded source commit", () => {
    const r = repository();
    const s1 = r.source("0.0.1");
    r.carry("0.0.1", r.pack(r.metadata("0.0.1", "A README that source commit never had.\n")), s1);
    r.commit("carry 0.0.1");
    r.source("0.0.2");
    const result = r.check();
    expect(result.status).toBe(1);
    expect(result.output).toContain("packs a README.md that is not byte-identical to its source commit's");
  });

  it("refuses an archive carried by a commit that does not follow its source commit", () => {
    const r = repository();
    const s1 = r.source("0.0.1");
    r.write("unrelated.txt", "later work\n");
    r.commit("unrelated");
    r.carry("0.0.1", r.pack(r.metadata("0.0.1")), s1);
    r.commit("carry 0.0.1 two commits later");
    r.source("0.0.2");
    const result = r.check();
    expect(result.status).toBe(1);
    expect(result.output).toContain("which is neither its source commit nor a child of it");
  });

  it("refuses a second archive under a version npm reads as an existing one, and a HEAD changed only by build metadata", () => {
    // The final rc.14 review's attack D and its variants: npm's semver.eq takes
    // 0.0.1+evil and v0.0.1 for 0.0.1, so either could be installed for it.
    for (const version of ["0.0.1+evil", "v0.0.1"]) {
      const r = carriedOnce();
      const source = r.source(version);
      r.carry(version, r.pack(r.metadata(version), "export const evil = true;\n"), source);
      r.commit(`carry ${version}`);
      r.source("0.0.2");
      const result = r.check();
      expect(result.status).toBe(1);
      expect(result.output).toContain(`artifacts/zodiacs-engine-${version}.tgz is not README.md, archives.json, or an archive or receipt named for a strict semantic version`);
      expect(result.output).toContain(`The recorded version "${version}" is not a strict semantic version`);
      expect(result.output).toContain(`The carried versions 0.0.1 and ${version} are equal as npm compares versions (semver.eq)`);
    }
    // A packed file changed after 0.0.1 is carried, the version changed only by build
    // metadata: no archive is carried for "0.0.1+changed", so HEAD's rebuild would be skipped.
    const r = carriedOnce();
    r.source("0.0.1+changed", "Synthetic 0.0.1, with a changed README\n");
    const result = r.check();
    expect(result.status).toBe(1);
    expect(result.output).toContain('The version in package.json at HEAD, "0.0.1+changed", is not a strict semantic version');
    expect(result.output).not.toContain("skipping the rebuild of HEAD");
  });

  it("refuses names that differ only in case: a variant of artifacts/, or two archives in it", () => {
    // A case-insensitive checkout would write Artifacts/'s bytes over artifacts/'s.
    const variant = carriedOnce();
    const evil = variant.pack(variant.metadata("0.0.1"), "export const evil = true;\n");
    const commit = commitBlobs(variant, { "Artifacts/zodiacs-engine-0.0.1.tgz": evil }, "Artifacts/ with other bytes for 0.0.1");
    const top = variant.check();
    expect(top.status).toBe(1);
    expect(top.output).toContain(`Artifacts differs from artifacts only in case in 1 commit(s): ${commit.slice(0, 12)}`);
    // Two strict versions that npm tells apart but such a disk does not.
    const inside = carriedOnce();
    commitBlobs(inside, { "artifacts/zodiacs-engine-0.0.1-RC.1.tgz": evil, "artifacts/zodiacs-engine-0.0.1-rc.1.tgz": evil }, "two archive names that differ only in case");
    const pair = inside.check();
    expect(pair.status).toBe(1);
    expect(pair.output).toContain("artifacts/zodiacs-engine-0.0.1-rc.1.tgz and artifacts/zodiacs-engine-0.0.1-RC.1.tgz differ only in case");
  });

  it("rebuilds from the worktree's own npm ci, whatever the checkout's node_modules holds", () => {
    // The final rc.14 review's working-tree demonstration. The build runs tsup, which the
    // lockfile provides from a local builder (a file: dependency, so npm ci needs no
    // registry). The checkout's ignored node_modules/.bin/tsup is then replaced: first by
    // one that fails, then by one that copies dist from the carried archive.
    const r = repository();
    const packageJson = `${JSON.stringify({ name: "@zodiacs/engine", version: "0.0.1", type: "module", scripts: { build: "tsup" },
      devDependencies: { builder: "file:tools/builder" }, files: ["dist", "README.md", "CHANGELOG.md", "LICENSE", "LICENSING.md", "NOTICE"] }, null, 2)}\n`;
    const builder = `${JSON.stringify({ name: "builder", version: "1.0.0", type: "module", bin: { tsup: "bin.js" } }, null, 2)}\n`;
    const copySource = "#!/usr/bin/env node\nimport { cpSync, rmSync } from \"node:fs\";\nrmSync(\"dist\", { recursive: true, force: true });\ncpSync(\"src\", \"dist\", { recursive: true });\n";
    for (const [name, text] of Object.entries({ ...r.metadata("0.0.1"), "package.json": packageJson, ".gitignore": "node_modules/\ndist/\n",
      "src/index.js": "export const phase = \"New Moon\";\n", "tools/builder/package.json": builder, "tools/builder/bin.js": copySource })) r.write(name, text);
    chmodSync(join(r.dir, "tools", "builder", "bin.js"), 0o755);
    const npm = (...args) => execFileSync("npm", args, { cwd: r.dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    npm("install", "--ignore-scripts", "--no-audit", "--no-fund"); // writes package-lock.json
    const s1 = r.commit("source 0.0.1 and its lockfile");
    const packHere = () => {
      const stage = scratch("zodiacs-binding-npm-");
      const [report] = JSON.parse(npm("pack", "--ignore-scripts", "--json", "--pack-destination", stage));
      return readFileSync(join(stage, report.filename));
    };
    npm("run", "build");
    const carried = packHere();
    r.carry("0.0.1", carried, s1);
    r.commit("carry 0.0.1");
    expect(r.check().status).toBe(0);
    const tsup = join(r.dir, "node_modules", ".bin", "tsup");
    const replaceTsup = (script) => { unlinkSync(tsup); writeFileSync(tsup, script, { mode: 0o755 }); };

    // A. A tsup that fails: it would fail any build that used it, and the check still passes.
    replaceTsup("#!/bin/sh\necho 'tsup replaced in the checkout' >&2\nexit 1\n");
    expect(() => npm("run", "build")).toThrow();
    expect(r.git("status", "--porcelain")).toBe("");
    for (const result of [r.check(), r.checkAsNpmRun()]) {
      expect(result.output).toContain("artifacts/zodiacs-engine-0.0.1.tgz is byte-identical to a rebuild of HEAD");
      expect(result.status).toBe(0);
    }

    // B. The packed code changes under 0.0.1, and a tsup that copies dist from the carried
    // archive would rebuild the recorded bytes; the check still fails, in both modes.
    r.write("src/index.js", "export const phase = \"Full Moon\";\n");
    r.commit("change the packed code under 0.0.1");
    replaceTsup("#!/bin/sh\nrm -rf dist && mkdir -p dist && git show HEAD:artifacts/zodiacs-engine-0.0.1.tgz | tar -xzf - -C dist --strip-components=2 package/dist\n");
    npm("run", "build");
    expect(packHere().equals(carried)).toBe(true);
    expect(r.git("status", "--porcelain")).toBe("");
    for (const result of [r.check(), r.checkAsNpmRun(), r.check("--rebuild-all")]) {
      expect(result.status).toBe(1);
      expect(result.output).toContain("is not the archive HEAD");
      expect(result.output).toContain("package/dist/index.js");
    }
  });

  it("never finds a build tool through the checkout's node_modules/.bin on PATH", () => {
    // A build that names a tool its commit does not install. Started as npm run starts
    // it, the check has the checkout's node_modules/.bin on PATH, where a planted tool
    // would copy dist from the carried archive; the rebuild must not find it there.
    const r = repository();
    const packageJson = `${JSON.stringify({ name: "@zodiacs/engine", version: "0.0.1", scripts: { build: "zodiacs-synthetic-build" },
      files: ["dist", "README.md", "CHANGELOG.md", "LICENSE", "LICENSING.md", "NOTICE"] }, null, 2)}\n`;
    for (const [name, text] of Object.entries({ ...r.metadata("0.0.1"), "package.json": packageJson, ".gitignore": "node_modules/\n",
      "dist/index.js": "export const phase = \"New Moon\";\n" })) r.write(name, text);
    const s1 = r.commit("source 0.0.1");
    const stage = scratch("zodiacs-binding-npm-");
    const [report] = JSON.parse(execFileSync("npm", ["pack", "--ignore-scripts", "--json", "--pack-destination", stage], { cwd: r.dir, encoding: "utf8" }));
    r.carry("0.0.1", readFileSync(join(stage, report.filename)), s1);
    r.commit("carry 0.0.1");
    r.write("dist/index.js", "export const phase = \"Full Moon\";\n");
    r.commit("change the packed code under 0.0.1");
    r.write("node_modules/.bin/zodiacs-synthetic-build", "#!/bin/sh\nrm -rf dist && mkdir -p dist && git show HEAD:artifacts/zodiacs-engine-0.0.1.tgz | tar -xzf - -C dist --strip-components=2 package/dist\n");
    chmodSync(join(r.dir, "node_modules", ".bin", "zodiacs-synthetic-build"), 0o755);
    expect(r.git("status", "--porcelain")).toBe("");
    const result = r.checkAsNpmRun();
    expect(result.status).toBe(1);
    expect(result.output).toContain("The 0.0.1 source could not be rebuilt and packed.");
    expect(result.output).not.toContain("is byte-identical to a rebuild of HEAD");
  });

  it("refuses an archive without a manifest entry, and a shallow checkout", () => {
    const r = carriedOnce();
    writeFileSync(join(r.dir, "artifacts", "zodiacs-engine-0.0.9.tgz"), r.bytes);
    r.commit("carry an unrecorded archive");
    const unrecorded = r.check();
    expect(unrecorded.status).toBe(1);
    expect(unrecorded.output).toContain("is carried without a carried entry");

    const clone = scratch("zodiacs-binding-shallow-");
    execFileSync("git", ["clone", "-q", "--depth", "1", `file://${r.dir}`, join(clone, "tree")]);
    const shallow = spawnSync(process.execPath, [SCRIPT, "--root", join(clone, "tree")], { encoding: "utf8" });
    expect(shallow.status).toBe(1);
    expect(`${shallow.stdout}${shallow.stderr}`).toContain("The checkout is shallow");
  });
});
