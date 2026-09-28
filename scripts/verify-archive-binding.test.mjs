// Regression cases for scripts/verify-archive-binding.mjs on synthetic git
// repositories, including the two bypasses an independent review found in the
// rc.13 script: a rewrite hidden by merge simplification, and superseded bytes
// restored in a later commit.
import { spawnSync, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

const SCRIPT = fileURLToPath(new URL("./verify-archive-binding.mjs", import.meta.url));
const made = [];
afterAll(() => { for (const dir of made) rmSync(dir, { recursive: true, force: true }); });
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function repository() {
  const dir = mkdtempSync(join(tmpdir(), "zodiacs-binding-case-"));
  made.push(dir);
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
    const stage = mkdtempSync(join(tmpdir(), "zodiacs-binding-stage-"));
    made.push(stage);
    for (const [name, text] of Object.entries({ ...files, "dist/index.js": dist })) {
      mkdirSync(join(stage, "package", name, ".."), { recursive: true });
      writeFileSync(join(stage, "package", name), text);
    }
    execFileSync("tar", ["--format=ustar", "-czf", join(stage, "out.tgz"), "-C", stage, "package"]);
    return execFileSync("cat", [join(stage, "out.tgz")]);
  };
  const entries = [];
  const writeManifest = () => {
    write("artifacts/archives.json", `${JSON.stringify({ schema: "zodiacs.engine-archives.v1", archives: entries }, null, 2)}\n`);
    write("artifacts/README.md", entries.map((entry) => `${entry.version} ${entry.sha256}`).join("\n") + "\n");
  };
  const carry = (version, bytes, sourceCommit, extra = {}) => {
    const file = `zodiacs-engine-${version}.tgz`;
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
  mkdirSync(join(dir, "artifacts"), { recursive: true });
  git("init", "-q", "-b", "main");
  return { dir, git, write, commit, metadata, pack, carry, entries, writeManifest, source, check };
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

describe("archive binding check", () => {
  it("passes a clean history and skips the rebuild until the version's archive exists", () => {
    const r = carriedOnce();
    const result = r.check();
    expect(result.output).toContain("skipping the rebuild");
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
    expect(result.output).toContain("artifacts/zodiacs-engine-0.0.2.tgz was committed and has since been removed");
  });

  it("allows superseded bytes only in their recorded commit", () => {
    // As with rc.11: the first packing is carried with its source, then one
    // commit changes the source and replaces the archive under the same version.
    const breachHistory = (lingering) => {
      const r = repository();
      for (const [name, text] of Object.entries(r.metadata("0.0.1"))) r.write(name, text);
      const first = r.pack(r.metadata("0.0.1"), "export const first = true;\n");
      r.carry("0.0.1", first, "0".repeat(40));
      const early = r.commit("source and first packing of 0.0.1");
      r.entries[0] = { ...r.entries[0], sourceCommit: early, status: "superseded", onlyInCommit: early };
      r.writeManifest();
      if (lingering) r.commit("unrelated work that still carries the first packing");
      r.write("CHANGELOG.md", "repaired\n");
      r.carry("0.0.1", r.pack({ ...r.metadata("0.0.1"), "CHANGELOG.md": "repaired\n" }), "0".repeat(40));
      const repaired = r.commit("repair and repack 0.0.1 under the same version");
      r.entries[1] = { ...r.entries[1], sourceCommit: repaired };
      r.writeManifest();
      r.commit("record the manifest");
      r.source("0.0.2");
      return { ...r, first };
    };
    const r = breachHistory(false);
    const clean = r.check();
    expect(clean.output).toContain("1 superseded");
    expect(clean.status).toBe(0);
    // Restoring the superseded bytes later is refused, as in the review's synthetic breach.
    writeFileSync(join(r.dir, "artifacts", "zodiacs-engine-0.0.1.tgz"), r.first);
    r.commit("swap back to the superseded bytes");
    const restored = r.check();
    expect(restored.status).toBe(1);
    // Both the recorded commit and the swap hold them; only the swap is disallowed, and one
    // report names every commit that holds the digest.
    expect(restored.output).toContain(`sha256 ${sha256(r.first)} in 2 commit(s)`);
    // So is a second commit holding them, even one that merely follows the first.
    const l = breachHistory(true);
    const lingering = l.check();
    expect(lingering.status).toBe(1);
    expect(lingering.output).toContain(`sha256 ${sha256(l.first)} in 2 commit(s)`);
  });

  it("checks the receipt of every version, not only the current one", () => {
    const r = carriedOnce();
    r.write("artifacts/zodiacs-engine-0.0.1.sha256", `${"0".repeat(64)}  zodiacs-engine-0.0.1.tgz\n`);
    r.commit("edit an old receipt");
    const result = r.check();
    expect(result.status).toBe(1);
    expect(result.output).toContain("The receipt for 0.0.1 does not name its recorded bytes");
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

  it("refuses an archive without a manifest entry, and a shallow checkout", () => {
    const r = carriedOnce();
    writeFileSync(join(r.dir, "artifacts", "zodiacs-engine-0.0.9.tgz"), r.bytes);
    r.commit("carry an unrecorded archive");
    const unrecorded = r.check();
    expect(unrecorded.status).toBe(1);
    expect(unrecorded.output).toContain("is carried without a carried entry");

    const clone = mkdtempSync(join(tmpdir(), "zodiacs-binding-shallow-"));
    made.push(clone);
    execFileSync("git", ["clone", "-q", "--depth", "1", `file://${r.dir}`, join(clone, "tree")]);
    const shallow = spawnSync(process.execPath, [SCRIPT, "--root", join(clone, "tree")], { encoding: "utf8" });
    expect(shallow.status).toBe(1);
    expect(`${shallow.stdout}${shallow.stderr}`).toContain("The checkout is shallow");
  });
});
