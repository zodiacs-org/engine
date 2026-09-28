// The rc.14 review's synthetic attacks on scripts/verify-archive-binding.mjs,
// as the review wrote them (review-logs/binding-attacks.mjs), with one change:
// case 5 now commits with `git commit` alone. The review's version committed
// through its helper, whose `git add -A` added the "untracked" archive back,
// so HEAD still held it and the check rightly passed.
// Synthetic histories that try to get past scripts/verify-archive-binding.mjs.
// Usage: node binding-attacks.mjs <path to verify-archive-binding.mjs> <scratch dir>
import { spawnSync, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, renameSync, symlinkSync, readFileSync, cpSync, unlinkSync } from "node:fs";
import { join } from "node:path";

const SCRIPT = process.argv[2];
const SCRATCH = process.argv[3];
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function repository(label) {
  const dir = mkdtempSync(join(SCRATCH, `case-${label}-`));
  const git = (...args) => execFileSync("git", ["-c", "user.name=Case", "-c", "user.email=case@example.invalid",
    "-c", "commit.gpgsign=false", ...args], { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const write = (path, text) => { mkdirSync(join(dir, path, ".."), { recursive: true }); writeFileSync(join(dir, path), text); };
  const commit = (message) => { git("add", "-A"); git("commit", "-q", "--allow-empty", "-m", message); return git("rev-parse", "HEAD").trim(); };
  const metadata = (version) => ({
    "package.json": `${JSON.stringify({ name: "synthetic", version })}\n`, "README.md": `Synthetic ${version}\n`,
    "CHANGELOG.md": "changes\n", LICENSE: "MIT\n", "LICENSING.md": "licensing\n", NOTICE: "notice\n"
  });
  const pack = (files, dist = "export {};\n") => {
    const stage = mkdtempSync(join(SCRATCH, "stage-"));
    for (const [name, text] of Object.entries({ ...files, "dist/index.js": dist })) {
      mkdirSync(join(stage, "package", name, ".."), { recursive: true });
      writeFileSync(join(stage, "package", name), text);
    }
    execFileSync("tar", ["--format=ustar", "-czf", join(stage, "out.tgz"), "-C", stage, "package"]);
    const bytes = readFileSync(join(stage, "out.tgz"));
    rmSync(stage, { recursive: true, force: true });
    return bytes;
  };
  const entries = [];
  const writeManifest = () => {
    write("artifacts/archives.json", `${JSON.stringify({ schema: "zodiacs.engine-archives.v1", archives: entries }, null, 2)}\n`);
    write("artifacts/README.md", entries.map((entry) => `${entry.version} ${entry.sha256}`).join("\n") + "\n");
  };
  const carry = (version, bytes, sourceCommit, extra = {}) => {
    const file = `zodiacs-engine-${version}.tgz`;
    write(`artifacts/${file}`, "");
    writeFileSync(join(dir, "artifacts", file), bytes);
    write(`artifacts/zodiacs-engine-${version}.sha256`, `${sha256(bytes)}  ${file}\n`);
    const files = execFileSync("tar", ["-tzf", join(dir, "artifacts", file)], { encoding: "utf8" }).split("\n").filter((line) => line && !line.endsWith("/")).length;
    entries.push({ version, file, sha256: sha256(bytes), bytes: bytes.length, files, sourceCommit, status: "carried", ...extra });
    writeManifest();
  };
  const source = (version) => { for (const [name, text] of Object.entries(metadata(version))) write(name, text); return commit(`source ${version}`); };
  const check = (...args) => {
    const run = spawnSync(process.execPath, [SCRIPT, "--root", dir, ...args], { encoding: "utf8" });
    return { status: run.status, output: `${run.stdout}${run.stderr}`.trim() };
  };
  mkdirSync(join(dir, "artifacts"), { recursive: true });
  git("init", "-q", "-b", "main");
  return { dir, git, write, commit, metadata, pack, carry, entries, writeManifest, source, check };
}
function carriedOnce(label) {
  const r = repository(label);
  const s1 = r.source("0.0.1");
  const bytes = r.pack(r.metadata("0.0.1"));
  r.carry("0.0.1", bytes, s1);
  const c1 = r.commit("carry 0.0.1");
  r.source("0.0.2");
  return { ...r, s1, c1, bytes };
}
const report = (name, result) => console.log(`\n### ${name}\nexit ${result.status}\n${result.output.split("\n").map((l) => `  ${l}`).join("\n")}`);

// 0. Baseline.
report("baseline clean history", carriedOnce("base").check());

// 1. Replace a long-carried archive, then whitelist the old bytes with one superseded entry per commit that held them.
{
  const r = carriedOnce("resupersede");
  r.commit("more work 1");
  r.commit("more work 2");
  const holders = r.git("rev-list", "HEAD").trim().split("\n").filter((c) => {
    try { return sha256(execFileSync("git", ["show", `${c}:artifacts/zodiacs-engine-0.0.1.tgz`], { cwd: r.dir, stdio: ["ignore", "pipe", "ignore"] })) === sha256(r.bytes); } catch { return false; }
  });
  const evil = r.pack(r.metadata("0.0.1"), "export const evil = true;\n");
  const original = r.entries[0];
  r.entries.length = 0;
  for (const commit of holders) r.entries.push({ ...original, status: "superseded", onlyInCommit: commit });
  // New carried bytes for the same version, bound to the same source commit (metadata unchanged, dist differs).
  r.carry("0.0.1", evil, r.s1);
  r.entries.push(r.entries.splice(holders.length, 1)[0]);
  r.writeManifest();
  // The replacement must be introduced by the source commit or its child: it is neither, so also try a
  // variant where the manifest names a new source commit S' that is the parent of the replacing commit.
  r.commit("replace 0.0.1 and whitelist the old bytes commit by commit");
  report(`1a. replaced archive + ${holders.length} superseded entries (same source commit)`, r.check());
}
{
  const r = carriedOnce("resupersede2");
  r.commit("more work 1");
  // New source commit for 0.0.1: same metadata as the old one (package.json says 0.0.1 again).
  for (const [name, text] of Object.entries(r.metadata("0.0.1"))) r.write(name, text);
  const s2 = r.commit("source 0.0.1 again");
  const holders = r.git("rev-list", "HEAD").trim().split("\n").filter((c) => {
    try { return sha256(execFileSync("git", ["show", `${c}:artifacts/zodiacs-engine-0.0.1.tgz`], { cwd: r.dir, stdio: ["ignore", "pipe", "ignore"] })) === sha256(r.bytes); } catch { return false; }
  });
  const evil = r.pack(r.metadata("0.0.1"), "export const evil = true;\n");
  const original = r.entries[0];
  r.entries.length = 0;
  for (const commit of holders) r.entries.push({ ...original, status: "superseded", onlyInCommit: commit });
  r.carry("0.0.1", evil, s2);
  r.commit("replace 0.0.1 from a new source commit and whitelist the old bytes");
  r.source("0.0.2");
  report(`1b. replaced archive from new source commit + ${holders.length} superseded entries`, r.check());
}

// 2. A middle commit turns artifacts/ into a symlink to a directory holding different bytes; a later commit restores it.
{
  const r = carriedOnce("symlinkdir");
  const evil = r.pack(r.metadata("0.0.1"), "export const evil = true;\n");
  r.git("mv", "artifacts", "real");
  writeFileSync(join(r.dir, "real", "zodiacs-engine-0.0.1.tgz"), evil);
  symlinkSync("real", join(r.dir, "artifacts"), "dir");
  const m = r.commit("artifacts is now a symlink to a directory with other bytes");
  const shown = sha256(readFileSync(join(r.dir, "artifacts", "zodiacs-engine-0.0.1.tgz")));
  unlinkSync(join(r.dir, "artifacts"));
  r.git("mv", "real", "artifacts");
  writeFileSync(join(r.dir, "artifacts", "zodiacs-engine-0.0.1.tgz"), r.bytes);
  r.commit("restore artifacts");
  console.log(`\n(2) at ${m.slice(0, 12)} artifacts/zodiacs-engine-0.0.1.tgz resolved to sha256 ${shown.slice(0, 16)}…, recorded ${sha256(r.bytes).slice(0, 16)}…`);
  report("2. symlinked artifacts directory in a middle commit", r.check());
}

// 3. A middle commit removes the archive and its receipt; the next restores identical bytes.
{
  const r = carriedOnce("gap");
  r.git("rm", "-q", "artifacts/zodiacs-engine-0.0.1.tgz", "artifacts/zodiacs-engine-0.0.1.sha256");
  r.commit("remove 0.0.1 for a while");
  writeFileSync(join(r.dir, "artifacts", "zodiacs-engine-0.0.1.tgz"), r.bytes);
  r.write("artifacts/zodiacs-engine-0.0.1.sha256", `${sha256(r.bytes)}  zodiacs-engine-0.0.1.tgz\n`);
  r.commit("bring it back");
  report("3. temporary removal and restore", r.check());
}

// 4. The archive at HEAD is committed correctly, but the working tree holds other bytes (dirty checkout).
{
  const r = carriedOnce("dirty");
  const evil = r.pack(r.metadata("0.0.1"), "export const evil = true;\n");
  writeFileSync(join(r.dir, "artifacts", "zodiacs-engine-0.0.1.tgz"), evil);
  report("4. dirty working tree (uncommitted different bytes)", r.check());
}

// 5. A removed archive re-created only in the working tree (untracked) at HEAD.
{
  const r = carriedOnce("untracked");
  r.git("rm", "-q", "--cached", "artifacts/zodiacs-engine-0.0.1.tgz");
  r.git("commit", "-q", "-m", "stop tracking 0.0.1 (file left in the working tree)");
  console.log(`\n(5) HEAD holds: ${r.git("ls-tree", "--name-only", "HEAD", "--", "artifacts/").trim().split("\n").join(" ")}`);
  report("5. archive untracked at HEAD but present on disk", r.check());
}

// 6. A carried archive copied into a subdirectory with different bytes (not a carried path).
{
  const r = carriedOnce("subdir");
  const evil = r.pack(r.metadata("0.0.1"), "export const evil = true;\n");
  r.write("artifacts/old/zodiacs-engine-0.0.1.tgz", "");
  writeFileSync(join(r.dir, "artifacts/old/zodiacs-engine-0.0.1.tgz"), evil);
  r.commit("another copy under artifacts/old");
  report("6. same file name under artifacts/old/ with other bytes", r.check());
}

// 2b. HEAD itself has artifacts/ as a symlink to a directory with other bytes for a carried version.
{
  const r = carriedOnce("symlinkhead");
  const evil = r.pack(r.metadata("0.0.1"), "export const evil = true;\n");
  r.git("mv", "artifacts", "real");
  writeFileSync(join(r.dir, "real", "zodiacs-engine-0.0.1.tgz"), evil);
  symlinkSync("real", join(r.dir, "artifacts"), "dir");
  r.commit("artifacts is now a symlink to a directory with other bytes");
  const shown = sha256(readFileSync(join(r.dir, "artifacts", "zodiacs-engine-0.0.1.tgz")));
  console.log(`\n(2b) at HEAD artifacts/zodiacs-engine-0.0.1.tgz resolves to sha256 ${shown.slice(0, 16)}..., recorded ${sha256(r.bytes).slice(0, 16)}...`);
  report("2b. symlinked artifacts directory at HEAD", r.check());
}

// 2c. A middle commit on main swaps artifacts/ for a symlink to other bytes; a merge with a side branch
// that still holds the original restores it, so no commit "introduces" the recorded bytes again.
{
  const r = carriedOnce("symlinkmerge");
  const base = r.git("rev-parse", "HEAD").trim();
  r.git("checkout", "-q", "-b", "side");
  r.write("side.txt", "side work\n");
  r.commit("side work, archive untouched");
  r.git("checkout", "-q", "main");
  const evil = r.pack(r.metadata("0.0.1"), "export const evil = true;\n");
  r.git("mv", "artifacts", "real");
  writeFileSync(join(r.dir, "real", "zodiacs-engine-0.0.1.tgz"), evil);
  symlinkSync("real", join(r.dir, "artifacts"), "dir");
  const m = r.commit("artifacts is a symlink to other bytes");
  const shown = sha256(readFileSync(join(r.dir, "artifacts", "zodiacs-engine-0.0.1.tgz")));
  // Merge side, resolving to side's tree for artifacts/ and dropping real/.
  try { r.git("merge", "-q", "--no-commit", "--no-ff", "side"); } catch { /* conflicts resolved below */ }
  r.git("rm", "-r", "-q", "--cached", "--ignore-unmatch", "artifacts", "real");
  rmSync(join(r.dir, "artifacts"), { recursive: true, force: true });
  rmSync(join(r.dir, "real"), { recursive: true, force: true });
  r.git("checkout", "side", "--", "artifacts");
  r.commit("merge side");
  console.log(`\n(2c) at ${m.slice(0, 12)} (reachable from HEAD) artifacts/zodiacs-engine-0.0.1.tgz resolved to ${shown.slice(0, 16)}..., recorded ${sha256(r.bytes).slice(0, 16)}...`);
  report("2c. symlinked artifacts in a middle commit, restored by a merge", r.check());
  console.log("  HEAD:", r.git("ls-tree", "HEAD", "--", "artifacts/").trim().split("\n").join(" | "));
}
