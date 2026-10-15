import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const project = fileURLToPath(new URL("../", import.meta.url));
const repository = fileURLToPath(new URL("../../", import.meta.url));
const ignored = new Set(["node_modules", ".cache", "generated", "build", "coverage"]);
const skipped = new Set([...ignored].map(name => `minorbodies/${name}/`));
skipped.add("minorbodies/scope-probe.tsbuildinfo");

function git(args, input) {
  // These commands only read the index and ignore rules; no git metadata is written.
  return execFileSync("git", ["--no-optional-locks", ...args], {
    cwd: repository, encoding: "utf8", ...(input === undefined ? {} : { input })
  });
}

function repositoryPath(path) {
  return relative(repository, path).split(sep).join("/");
}

function isBulkPath(path) {
  return path.split("/").some(part => ignored.has(part)) || path.endsWith(".tsbuildinfo");
}

function checkFiles(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    assert(!entry.isSymbolicLink(), `Unexpected source symlink: ${path}`);
    if (ignored.has(entry.name) || entry.name.endsWith(".tsbuildinfo")) {
      assert(ignored.has(entry.name) ? entry.isDirectory() : entry.isFile(),
        `Bulk directories and TypeScript cache files must have the expected kind: ${path}`);
      skipped.add(repositoryPath(path) + (entry.isDirectory() ? "/" : ""));
      continue;
    }
    if (entry.isDirectory()) {
      checkFiles(path);
    } else {
      assert(entry.isFile(), `Source must be a regular file: ${path}`);
      assert(statSync(path).size < 2_000_000, `File must be under 2 MB: ${path}`);
      if (/\.(?:md|txt)$/i.test(entry.name) || ["LICENSE", "NOTICE"].includes(entry.name)) {
        assert(!readFileSync(path, "utf8").includes("\u2014"), `Em dash in documentation: ${path}`);
      }
    }
  }
}

checkFiles(project);
// Verify exclusions against Git instead of trusting names in this script. This
// also checks the rules when the directories have not been generated yet.
const ignoredPaths = new Set(git(["check-ignore", "--no-index", "-z", "--stdin"],
  [...skipped].join("\0") + "\0").split("\0").filter(Boolean));
for (const path of skipped) assert(ignoredPaths.has(path), `Bulk path must be gitignored: ${path}`);
for (const path of git(["ls-files", "-z", "--", "minorbodies/"]).split("\0").filter(Boolean)) {
  assert(!isBulkPath(path), `Generated/dependency files must not be tracked: ${path}`);
}
const companion = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const engine = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
assert.equal(companion.private, true, "The source-checkout companion must stay private");
assert.equal(companion.devDependencies["astronomy-engine"], engine.dependencies["astronomy-engine"],
  "The companion must use the engine's exact ephemeris dependency version");
// This lists the current root package without executing prepack or writing an archive.
// It works even when this checkout intentionally has no root dist/ build.
const report = JSON.parse(execFileSync("npm", [
  "pack", "--dry-run", "--ignore-scripts", "--json", "--cache", `${project}/.cache/npm`
], { cwd: repository, encoding: "utf8" }));
assert(Array.isArray(report) && report.length === 1, "Expected one root package report");
assert(report[0].files.every(({ path }) => path !== "minorbodies" && !path.startsWith("minorbodies/")),
  "minorbodies must not enter the root npm package");
console.log("Source file sizes, documentation punctuation, ignored bulk data, dependency pins and root package exclusion passed.");
console.log("This is an exclusion check, not the engine's dist/ completeness check.");
