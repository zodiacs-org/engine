// The second review of the rebuilt rc.14's synthetic attacks (its r2/new-attacks-2.mjs), as the
// review wrote them. R1, R1b, R3, R4 and R5 passed the check at b221534.
// Round-two synthetic attacks on the rebuilt rc.14 check (03db4bb). Usage: node new-attacks-2.mjs <check> <scratch dir>
import { spawnSync, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { delimiter, join } from "node:path";

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
  const carry = (version, bytes, sourceCommit) => {
    const file = `zodiacs-engine-${version}.tgz`;
    mkdirSync(join(dir, "artifacts"), { recursive: true });
    writeFileSync(join(dir, "artifacts", file), bytes);
    write(`artifacts/zodiacs-engine-${version}.sha256`, `${sha256(bytes)}  ${file}\n`);
    const files = execFileSync("tar", ["-tzf", join(dir, "artifacts", file)], { encoding: "utf8" }).split("\n").filter((l) => l && !l.endsWith("/")).length;
    entries.push({ version, file, sha256: sha256(bytes), bytes: bytes.length, files, sourceCommit, status: "carried" });
    writeManifest();
  };
  const source = (version) => { for (const [name, text] of Object.entries(metadata(version))) write(name, text); return commit(`source ${version}`); };
  const check = (args = [], env = process.env) => {
    const run = spawnSync(process.execPath, [SCRIPT, "--root", dir, ...args], { encoding: "utf8", env });
    return { status: run.status, output: `${run.stdout}${run.stderr}`.trim() };
  };
  mkdirSync(join(dir, "artifacts"), { recursive: true });
  git("init", "-q", "-b", "main");
  return { dir, git, write, commit, metadata, pack, carry, entries, writeManifest, source, check };
}
function carriedOnce(label, version = "0.0.1") {
  const r = repository(label);
  const s1 = r.source(version);
  const bytes = r.pack(r.metadata(version));
  r.carry(version, bytes, s1);
  r.commit(`carry ${version}`);
  return { ...r, s1, bytes };
}
function commitBlobs(r, files, message) {
  for (const [path, bytes] of Object.entries(files)) {
    const blob = execFileSync("git", ["hash-object", "-w", "--stdin"], { cwd: r.dir, input: bytes }).toString().trim();
    r.git("update-index", "--add", "--cacheinfo", `100644,${blob},${path}`);
  }
  r.git("commit", "-q", "-m", message);
}
const report = (name, expect, result) => {
  const verdict = expect === "fail" ? (result.status === 1 ? "REFUSED (good)" : "PASSED (BYPASS)") : (result.status === 0 ? "passed" : "refused");
  console.log(`\n### ${name}\nexpectation: check should ${expect}; exit ${result.status}: ${verdict}\n${result.output.split("\n").map((l) => `  ${l}`).join("\n")}`);
};

// R1. Two strict versions that npm's semver.eq takes for one: numeric prerelease identifiers beyond 2^53.
{
  const a = "0.0.1-9007199254740992", b = "0.0.1-9007199254740993";
  const r = carriedOnce("eqprecision", a);
  const s2 = r.source(b);
  r.carry(b, r.pack(r.metadata(b), "export const evil = true;\n"), s2);
  r.commit(`carry ${b}`);
  r.source("0.0.2");
  report(`R1. second carried archive ${b} beside ${a} (semver.eq true)`, "fail", r.check());
}
// R1b. HEAD's version semver.eq to a carried one under another spelling: HEAD's rebuild is skipped.
{
  const a = "0.0.1-9007199254740992", b = "0.0.1-9007199254740993";
  const r = carriedOnce("eqhead", a);
  for (const [name, text] of Object.entries(r.metadata(b))) r.write(name, text);
  r.write("README.md", "A packed file changed; HEAD's version is npm-equal to the carried one\n");
  r.commit(`packed change under ${b}`);
  report(`R1b. packed change with HEAD at ${b}, semver.eq to carried ${a}`, "fail", r.check());
}
// R2. Unicode case variants of artifacts at the top level (long s, dotless i), and ARTIFACTS as a file.
for (const [label, name] of [["longs", "artifactſ"], ["dotless", "artıfacts"], ["upperfile", "ARTIFACTS"]]) {
  const r = carriedOnce(label);
  commitBlobs(r, { [label === "upperfile" ? name : `${name}/zodiacs-engine-0.0.1.tgz`]: r.pack(r.metadata("0.0.1"), "export const evil = true;\n") }, `add ${name}`);
  report(`R2-${label}. top-level ${JSON.stringify(name)}`, "fail", r.check());
}
// R3. An HFS+-ignorable code point: artifacts‌ (legacy HFS+ treats it as artifacts; APFS and Linux do not).
{
  const r = carriedOnce("hfs");
  commitBlobs(r, { "artifacts‌/zodiacs-engine-0.0.1.tgz": r.pack(r.metadata("0.0.1"), "export const evil = true;\n") }, "artifacts + ZWNJ");
  r.source("0.0.2");
  report("R3. top-level \"artifacts\\u200c\" (information: only legacy HFS+ folds it)", "fail", r.check());
}

// Packages npm can pack, for the rebuild cases.
function npmPackage(label, buildScript, extraFiles = {}) {
  const r = repository(label);
  const packageJson = `${JSON.stringify({ name: "@zodiacs/engine", version: "0.0.1", type: "module", scripts: { build: buildScript },
    files: ["dist", "README.md", "CHANGELOG.md", "LICENSE", "LICENSING.md", "NOTICE"] }, null, 2)}\n`;
  for (const [name, text] of Object.entries({ ...r.metadata("0.0.1"), "package.json": packageJson, ".gitignore": "node_modules/\n.tmp/\n", ...extraFiles })) r.write(name, text);
  return r;
}
const npm = (dir, ...args) => execFileSync("npm", args, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
function packHere(r) {
  const stage = mkdtempSync(join(SCRATCH, "npm-"));
  const [rep] = JSON.parse(npm(r.dir, "pack", "--ignore-scripts", "--json", "--pack-destination", stage));
  return readFileSync(join(stage, rep.filename));
}
const COPY_FROM_ARCHIVE = "#!/bin/sh\nrm -rf dist && mkdir -p dist && git show HEAD:artifacts/zodiacs-engine-0.0.1.tgz | tar -xzf - -C dist --strip-components=2 package/dist\n";

// R4. TMPDIR inside the checkout: npm run adds every ancestor's node_modules/.bin, the checkout's included.
{
  const r = npmPackage("tmpinside", "zodiacs-synthetic-build", { "dist/index.js": "export const phase = \"New Moon\";\n" });
  const s1 = r.commit("source 0.0.1");
  r.carry("0.0.1", packHere(r), s1);
  r.commit("carry 0.0.1");
  r.write("dist/index.js", "export const phase = \"Full Moon\";\n");
  r.commit("change the packed code under 0.0.1");
  r.write("node_modules/.bin/zodiacs-synthetic-build", COPY_FROM_ARCHIVE);
  chmodSync(join(r.dir, "node_modules/.bin/zodiacs-synthetic-build"), 0o755);
  mkdirSync(join(r.dir, ".tmp"), { recursive: true });
  const clean = r.git("status", "--porcelain");
  report("R4-control. packed change under 0.0.1, TMPDIR outside the checkout", "fail", r.check([], { ...process.env, TMPDIR: SCRATCH }));
  report(`R4. the same with TMPDIR inside the checkout (git status: ${JSON.stringify(clean)})`, "fail", r.check([], { ...process.env, TMPDIR: join(r.dir, ".tmp") }));
}
// R5. A post-checkout hook in the checkout's .git (local, never committed) restores the old source in the rebuild's worktree.
{
  const r = npmPackage("hook", "node build.mjs", { "src/index.js": "export const phase = \"New Moon\";\n",
    "build.mjs": "import { cpSync, rmSync } from \"node:fs\";\nrmSync(\"dist\", { recursive: true, force: true });\ncpSync(\"src\", \"dist\", { recursive: true });\n" });
  const s1 = r.commit("source 0.0.1");
  npm(r.dir, "run", "build");
  r.carry("0.0.1", packHere(r), s1);
  const c1 = r.commit("carry 0.0.1");
  r.write("src/index.js", "export const phase = \"Full Moon\";\n");
  r.commit("change the packed code under 0.0.1");
  report("R5-control. packed change under 0.0.1, no hook", "fail", r.check());
  r.write(".git/hooks/post-checkout", `#!/bin/sh\ngit checkout ${c1} -- src 2>/dev/null\nexit 0\n`);
  chmodSync(join(r.dir, ".git/hooks/post-checkout"), 0o755);
  report(`R5. the same with a local post-checkout hook (git status: ${JSON.stringify(r.git("status", "--porcelain"))})`, "fail", r.check());
}
