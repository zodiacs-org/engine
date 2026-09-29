// The final rc.14 review's synthetic attacks (its new-attacks.mjs), as the
// review wrote them. Cases N3, N3b, N9 and N10 passed the check at 90d6cdb.
// New synthetic attacks on scripts/verify-archive-binding.mjs (independent review of rc.14's final build).
// Usage: node new-attacks.mjs <path to verify-archive-binding.mjs> <scratch dir>
// Each case prints the check's exit status and output. "SHOULD FAIL" cases are attacks.
import { spawnSync, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
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
    mkdirSync(join(dir, "artifacts"), { recursive: true });
    writeFileSync(join(dir, "artifacts", file), bytes);
    write(`artifacts/zodiacs-engine-${version}.sha256`, `${sha256(bytes)}  ${file}\n`);
    const files = execFileSync("tar", ["-tzf", join(dir, "artifacts", file)], { encoding: "utf8" }).split("\n").filter((line) => line && !line.endsWith("/")).length;
    entries.push({ version, file, sha256: sha256(bytes), bytes: bytes.length, files, sourceCommit, status: "carried", ...extra });
    writeManifest();
  };
  const source = (version) => { for (const [name, text] of Object.entries(metadata(version))) write(name, text); return commit(`source ${version}`); };
  const check = (args = [], env = {}) => {
    const run = spawnSync(process.execPath, [SCRIPT, "--root", dir, ...args], { encoding: "utf8", env: { ...process.env, ...env } });
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
const report = (name, expect, result) => {
  const verdict = expect === "fail" ? (result.status === 1 ? "REFUSED (good)" : "PASSED (BYPASS)") : (result.status === 0 ? "passed" : "refused");
  console.log(`\n### ${name}\nexpectation: check should ${expect}; exit ${result.status}: ${verdict}\n${result.output.split("\n").map((l) => `  ${l}`).join("\n")}`);
};

// N1. Change an archive's file mode to executable in a middle commit, then back.
{
  const r = carriedOnce("mode");
  r.git("update-index", "--chmod=+x", "artifacts/zodiacs-engine-0.0.1.tgz");
  r.git("commit", "-q", "-m", "make the archive executable");
  r.git("update-index", "--chmod=-x", "artifacts/zodiacs-engine-0.0.1.tgz");
  r.git("commit", "-q", "-m", "and back");
  report("N1. archive mode 100755 in a middle commit", "fail", r.check());
}
// N1b. Mode change at HEAD only.
{
  const r = carriedOnce("modehead");
  r.git("update-index", "--chmod=+x", "artifacts/zodiacs-engine-0.0.1.sha256");
  r.git("commit", "-q", "-m", "make the receipt executable");
  report("N1b. receipt mode 100755 at HEAD", "fail", r.check());
}
// N2. artifacts/ replaced by a gitlink (submodule entry) in a middle commit, restored later.
{
  const r = carriedOnce("gitlink");
  const tree = r.git("rev-parse", "HEAD:artifacts").trim();
  r.git("rm", "-r", "-q", "--cached", "artifacts");
  r.git("update-index", "--add", "--cacheinfo", `160000,${r.c1},artifacts`);
  r.git("commit", "-q", "-m", "artifacts is a gitlink");
  r.git("rm", "-q", "--cached", "artifacts");
  r.git("read-tree", "--prefix=artifacts/", tree);
  r.git("commit", "-q", "-m", "restore artifacts");
  report("N2. artifacts/ as a gitlink (mode 160000) in a middle commit", "fail", r.check());
}
// N3. A second archive for an npm-equivalent version: semver build metadata (0.0.1+evil) — npm reads it as 0.0.1.
{
  const r = carriedOnce("buildmeta");
  const s = r.source("0.0.1+evil");
  r.carry("0.0.1+evil", r.pack(r.metadata("0.0.1+evil"), "export const evil = true;\n"), s);
  r.commit("carry 0.0.1+evil");
  r.source("0.0.2");
  report("N3. second archive for 0.0.1 via build metadata (0.0.1+evil)", "fail", r.check());
}
// N3b. The same with a v prefix (npm normalizes v0.0.1 to 0.0.1).
{
  const r = carriedOnce("vprefix");
  const s = r.source("v0.0.1");
  r.carry("v0.0.1", r.pack(r.metadata("v0.0.1"), "export const evil = true;\n"), s);
  r.commit("carry v0.0.1");
  r.source("0.0.2");
  report("N3b. second archive for 0.0.1 via a v prefix (v0.0.1)", "fail", r.check());
}
// N4. A second carried entry for an existing version (same file name) appended to the manifest.
{
  const r = carriedOnce("dupcarried");
  r.entries.push({ ...r.entries[0], sha256: "0".repeat(64) });
  r.writeManifest();
  r.commit("append a second carried entry for 0.0.1");
  report("N4. duplicate carried entry for 0.0.1", "fail", r.check());
}
// N4b. A duplicate of an existing carried entry, byte for byte (same digest).
{
  const r = carriedOnce("dupsame");
  r.entries.push({ ...r.entries[0] });
  r.writeManifest();
  r.commit("append an identical carried entry for 0.0.1");
  report("N4b. identical duplicate carried entry for 0.0.1", "fail", r.check());
}
// N5. Edit a recorded source commit in a later commit (point 0.0.1 at the carrier itself).
{
  const r = carriedOnce("editsource");
  r.entries[0] = { ...r.entries[0], sourceCommit: r.c1 };
  r.writeManifest();
  r.commit("re-point 0.0.1's source commit");
  report("N5. later commit edits 0.0.1's sourceCommit", "fail", r.check());
}
// N5b. Rewrite the carrier before anyone sees it: same bytes, sourceCommit recorded as a different commit
//      whose metadata is identical (an unrelated commit that merely has the same six files), then merged in.
{
  const r = repository("rewritesource");
  const s1 = r.source("0.0.1");
  const bytes = r.pack(r.metadata("0.0.1"));
  r.write("src.txt", "real source\n");
  r.commit("source changes after the pack, still 0.0.1");
  // Orphan branch whose root commit carries the same six metadata files and nothing else.
  r.git("checkout", "-q", "--orphan", "fake");
  r.git("rm", "-r", "-q", "--cached", ".");
  rmSync(join(r.dir, "src.txt"), { force: true });
  const fake = r.commit("fake source commit with identical metadata");
  r.git("checkout", "-q", "-f", "main");
  r.git("merge", "-q", "--allow-unrelated-histories", "--no-edit", "-s", "ours", "fake");
  // The carrier is a child of the merge, not of fake: expect the introducer rule to refuse it.
  r.carry("0.0.1", bytes, fake);
  r.commit("carry 0.0.1 recorded against the orphan");
  r.source("0.0.2");
  report("N5b. sourceCommit re-pointed at an unrelated orphan with identical metadata (carrier not its child)", "fail", r.check());
  void s1;
}
// N6. --pinned-superseded through the environment: a superseded entry is only allowed with the flag.
{
  const r = repository("envpin");
  const place = (bytes) => {
    writeFileSync(join(r.dir, "artifacts", "zodiacs-engine-0.0.1.tgz"), bytes);
    r.write("artifacts/zodiacs-engine-0.0.1.sha256", `${sha256(bytes)}  zodiacs-engine-0.0.1.tgz\n`);
  };
  for (const [name, text] of Object.entries(r.metadata("0.0.1"))) r.write(name, text);
  const first = r.pack(r.metadata("0.0.1"), "export const first = true;\n");
  place(first);
  const early = r.commit("source and first packing");
  r.write("CHANGELOG.md", "repaired\n");
  const second = r.pack({ ...r.metadata("0.0.1"), "CHANGELOG.md": "repaired\n" });
  place(second);
  const repaired = r.commit("repack under the same version");
  r.entries.push({ version: "0.0.1", file: "zodiacs-engine-0.0.1.tgz", sha256: sha256(first), bytes: first.length, files: 7, sourceCommit: early, status: "superseded", onlyInCommit: early },
    { version: "0.0.1", file: "zodiacs-engine-0.0.1.tgz", sha256: sha256(second), bytes: second.length, files: 7, sourceCommit: repaired, status: "carried" });
  r.writeManifest();
  r.commit("record the manifest");
  r.source("0.0.2");
  const pin = join(r.dir, "..", `pin-${Date.now()}.json`);
  writeFileSync(pin, JSON.stringify([r.entries[0]]));
  report("N6-control. with --pinned-superseded on the command line", "pass", r.check(["--pinned-superseded", pin]));
  const env = { PINNED_SUPERSEDED: pin, pinned_superseded: pin, npm_config_pinned_superseded: pin, ZODIACS_PINNED_SUPERSEDED: pin,
    npm_config_argv: JSON.stringify({ original: ["run", "archive:binding", "--pinned-superseded", pin] }) };
  report("N6. the same pin offered through environment variables only", "fail", r.check([], env));
  report("N6b. --pinned-superseded=FILE (equals form) on the command line", "fail", r.check([`--pinned-superseded=${pin}`]));
  rmSync(pin, { force: true });
}
// N7. Reorder the manifest (same entries, different order).
{
  const r = carriedOnce("reorder");
  const s2 = r.git("rev-parse", "HEAD").trim();
  r.carry("0.0.2", r.pack(r.metadata("0.0.2")), s2);
  r.commit("carry 0.0.2");
  r.entries.reverse();
  r.writeManifest();
  r.commit("reorder the manifest");
  r.source("0.0.3");
  report("N7. manifest reordered", "fail", r.check());
}
// N8. A symbolic link named like a receipt inside a real artifacts/ directory.
{
  const r = carriedOnce("innerlink");
  r.git("rm", "-q", "artifacts/zodiacs-engine-0.0.1.sha256");
  const blob = execFileSync("git", ["hash-object", "-w", "--stdin"], { cwd: r.dir, input: "zodiacs-engine-0.0.1.tgz", encoding: "utf8" }).trim();
  r.git("update-index", "--add", "--cacheinfo", `120000,${blob},artifacts/zodiacs-engine-0.0.1.sha256`);
  r.git("commit", "-q", "-m", "receipt becomes a symbolic link");
  report("N8. receipt as a symbolic link inside artifacts/", "fail", r.check());
}
// N9. A case-variant sibling directory outside artifacts/ (not checked; on case-insensitive checkouts it merges with artifacts/).
{
  const r = carriedOnce("casedir");
  r.write("Artifacts/zodiacs-engine-0.0.1.tgz", "");
  writeFileSync(join(r.dir, "Artifacts/zodiacs-engine-0.0.1.tgz"), r.pack(r.metadata("0.0.1"), "export const evil = true;\n"));
  r.commit("Artifacts/ with other bytes for 0.0.1");
  report("N9. Artifacts/ (capital A) with other bytes for 0.0.1", "fail", r.check());
}
// N10. HEAD's version string changed only by build metadata after the archive is carried: the HEAD rebuild is skipped.
{
  const r = carriedOnce("headmeta");
  // carriedOnce leaves HEAD at 0.0.2 with no archive; build a history where HEAD is 0.0.1+x instead.
  for (const [name, text] of Object.entries(r.metadata("0.0.1+changed"))) r.write(name, text);
  r.write("README.md", "Synthetic 0.0.1, with a changed README\n");
  r.commit("change a packed file; version 0.0.1+changed");
  report("N10. packed file changed after 0.0.1 is carried, version bumped only by build metadata (0.0.1+changed)", "fail", r.check());
}
