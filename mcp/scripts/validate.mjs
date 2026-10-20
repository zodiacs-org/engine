import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

// Run from any directory. Only build output and raw reports under mcp/ are written.
const project = fileURLToPath(new URL("../", import.meta.url));
const root = dirname(project);
const generated = join(project, ".generated");
mkdirSync(generated, { recursive: true });
assert.equal(process.versions.node.split(".")[0], "22", "Run final validation on Node 22.");
const env = { ...process.env, PATH: `${dirname(process.execPath)}:${process.env.PATH ?? ""}`,
  npm_config_cache: join(project, ".cache/npm") };
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", env });
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const ignored = new Set(["node_modules", "build", "coverage", ".cache", ".generated"]);
function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (ignored.has(entry.name)) return [];
    const path = join(directory, entry.name);
    assert(!entry.isSymbolicLink(), `Unexpected symlink: ${path}`);
    return entry.isDirectory() ? files(path) : [path];
  }).sort();
}
function assertScope() {
  const changed = [...git("diff", "HEAD", "--name-only", "-z").split("\0"),
    ...git("ls-files", "--others", "--exclude-standard", "-z").split("\0")].filter(Boolean);
  assert(changed.every((path) => path.startsWith("mcp/")), "Changes outside mcp/.");
}
assertScope();
// Include tracked parent files and existing ignored dist output in the snapshot.
const parentPaths = git("ls-files", "-z").split("\0").filter((path) => path && !path.startsWith("mcp/"));
function snapshot() {
  const paths = [...parentPaths];
  function distFiles(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) distFiles(path);
      else paths.push(relative(root, path));
    }
  }
  try { distFiles(join(root, "dist")); } catch (error) { if (error.code !== "ENOENT") throw error; }
  return paths.sort().map((path) => [path, sha256(readFileSync(join(root, path)))]);
}
const before = snapshot();
const manifest = JSON.parse(readFileSync(join(root, "artifacts/archives.json"), "utf8"));
const archive = manifest.archives.find((entry) => entry.version === "1.0.0");
assert(archive, "Missing carried engine archive.");
assert.equal(sha256(readFileSync(join(root, "artifacts", archive.file))), archive.sha256);
const lock = JSON.parse(readFileSync(join(project, "package-lock.json"), "utf8"));
assert.equal(lock.packages["node_modules/@zodiacs/engine"].resolved, "file:../artifacts/zodiacs-engine-1.0.0.tgz");

function run(name, args) {
  const output = execFileSync(process.execPath, args, { cwd: project, encoding: "utf8", env,
    maxBuffer: 1_900_000, timeout: 120_000 });
  writeFileSync(join(generated, `${name}.log`), output);
  console.log(`${name}: passed`);
}
console.log(`Node ${process.versions.node}`);
console.log(`Source baseline: ${git("rev-parse", "HEAD").trim()}`);
console.log(`Engine archive SHA-256: ${archive.sha256}`);
run("typecheck", ["node_modules/typescript/bin/tsc", "--noEmit"]);
// The search runner loads its compiled worker, including when Vitest imports source files.
run("build", ["node_modules/typescript/bin/tsc", "-p", "tsconfig.build.json"]);
run("vitest", ["node_modules/vitest/vitest.mjs", "run", "--config=vitest.config.ts", "--reporter=json", "--outputFile=.generated/vitest.json"]);
const tests = JSON.parse(readFileSync(join(generated, "vitest.json"), "utf8"));
assert.equal(tests.success, true);
assert.equal(tests.numFailedTests, 0);
assert.equal(tests.numPendingTests, 0);
console.log(`Vitest tests: ${tests.numPassedTests} passed; ${tests.numFailedTests} failed; ${tests.numPendingTests} pending`);
for (const path of files(project)) {
  assert(statSync(path).size < 2_000_000, `Oversized project file: ${path}`);
  if (path.endsWith(".md")) {
    const source = readFileSync(path, "utf8");
    assert(!source.includes("\u2014"), `Em dash in ${path}`);
    for (const match of source.matchAll(/```json\s*\n([\s\S]*?)```/g)) JSON.parse(match[1]);
  }
}
assertScope();
assert.deepEqual(snapshot(), before, "Parent files or dist changed during validation.");
git("diff", "--check");
console.log("Project file size, Markdown em-dash exclusion and JSON snippets: passed");
console.log("Working tree scope, parent file/dist snapshot and whitespace: passed");
console.log("Parent pack exclusion: passed in test/isolation.mcp-test.ts");
console.log("Raw reports: mcp/.generated/ (gitignored)");
console.log("Parent build-dependent gates: not run; parent dist must remain untouched");
