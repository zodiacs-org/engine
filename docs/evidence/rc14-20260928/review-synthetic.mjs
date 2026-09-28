// Runs the independent review's two synthetic repositories through the rc.13
// archive check and the rc.14 one. The repositories are copied, never touched in
// place. Each copy gets one extra commit that records the manifest the rc.14
// check reads (artifacts/archives.json, the receipt and artifacts/README.md);
// their history is otherwise the review's.
//
// Usage: node review-synthetic.mjs <review directory> <engine checkout>
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [review, engine] = process.argv.slice(2);
if (!review || !engine) throw new Error("usage: node review-synthetic.mjs <review directory> <engine checkout>");
const RC13_CARRIER = "4eee700";
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const work = mkdtempSync(join(tmpdir(), "review-synthetic-"));
const realManifest = JSON.parse(readFileSync(join(engine, "artifacts", "archives.json"), "utf8"));

function run(label, command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  console.log(`$ ${label}`);
  for (const line of `${result.stdout}${result.stderr}`.trim().split("\n")) console.log(`  ${line}`);
  console.log(`  exit ${result.status}\n`);
  return result.status;
}

function study(name, entriesFor) {
  const dir = join(work, name);
  cpSync(join(review, name), dir, { recursive: true });
  const git = (...args) => execFileSync("git", ["-c", "user.name=Case", "-c", "user.email=case@example.invalid",
    "-c", "commit.gpgsign=false", ...args], { cwd: dir, encoding: "utf8" });
  console.log(`== ${name}`);
  console.log(git("log", "--graph", "--format=%h %s", "--all").trimEnd().split("\n").map((line) => `  ${line}`).join("\n"));
  console.log("");
  // The rc.13 check, run as the review ran it: from the repository's own scripts directory.
  writeFileSync(join(dir, "scripts", "rc13-check.mjs"), execFileSync("git", ["show", `${RC13_CARRIER}:scripts/verify-archive-binding.mjs`], { cwd: engine }));
  const before = run("rc.13 check (scripts/verify-archive-binding.mjs at 4eee700)", process.execPath, [join(dir, "scripts", "rc13-check.mjs")], dir);
  rmSync(join(dir, "scripts", "rc13-check.mjs"));
  // The manifest commit.
  const entries = entriesFor(git);
  writeFileSync(join(dir, "artifacts", "archives.json"), `${JSON.stringify({ schema: "zodiacs.engine-archives.v1", archives: entries }, null, 2)}\n`);
  writeFileSync(join(dir, "artifacts", "README.md"), entries.map((entry) => `${entry.version} ${entry.sha256}`).join("\n") + "\n");
  for (const entry of entries.filter((item) => item.status === "carried")) {
    writeFileSync(join(dir, "artifacts", entry.file.replace(/\.tgz$/u, ".sha256")), `${entry.sha256}  ${entry.file}\n`);
  }
  git("add", "-A", "artifacts");
  git("commit", "-q", "-m", "record the archive manifest");
  console.log(`  manifest commit ${git("rev-parse", "--short", "HEAD").trim()}: ${JSON.stringify(entries.map(({ version, sha256: digest, status }) => `${version} ${digest.slice(0, 12)} ${status}`))}\n`);
  const after = run("rc.14 check (scripts/verify-archive-binding.mjs in this checkout)", process.execPath,
    [join(engine, "scripts", "verify-archive-binding.mjs"), "--root", dir], engine);
  return { before, after };
}

// synthetic-binding: 0.0.1 carried at 2a35b85, repacked and restored on a merged
// side branch; 0.0.2 carried and removed on another. The manifest records the
// bytes HEAD carries, which are the first commit's.
const binding = study("synthetic-binding", (git) => {
  const bytes = execFileSync("git", ["show", "HEAD:artifacts/zodiacs-engine-0.0.1.tgz"], { cwd: join(work, "synthetic-binding") });
  const first = git("rev-list", "--max-parents=0", "HEAD").trim();
  return [{ version: "0.0.1", file: "zodiacs-engine-0.0.1.tgz", sha256: sha256(bytes), bytes: bytes.length, files: 0, sourceCommit: first, status: "carried" }];
});

// synthetic-breach: rc.11 carried as d88e0ff8, then swapped back to 13d637db.
// The manifest records rc.11 exactly as the engine's does.
const breach = study("synthetic-breach", () => realManifest.archives.filter((entry) => entry.version === "0.1.1-rc.11"));

rmSync(work, { recursive: true, force: true });
console.log(`summary: synthetic-binding rc.13 exit ${binding.before}, rc.14 exit ${binding.after}; ` +
  `synthetic-breach rc.13 exit ${breach.before}, rc.14 exit ${breach.after}`);
process.exitCode = binding.before === 0 && breach.before === 0 && binding.after === 1 && breach.after === 1 ? 0 : 1;
