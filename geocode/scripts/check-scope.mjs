import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const project = fileURLToPath(new URL("../", import.meta.url));
const repository = fileURLToPath(new URL("../../", import.meta.url));
const candidates = execFileSync("git", [
  "ls-files", "-z", "--cached", "--others", "--exclude-standard", "--", "geocode/"
], { cwd: repository, encoding: "utf8" }).split("\0").filter(Boolean);

assert(candidates.length > 0, "no geocode candidate files found");
for (const path of new Set(candidates)) {
  const absolute = join(repository, path);
  const stat = lstatSync(absolute);
  assert(stat.isFile(), `candidate is not a regular file: ${path}`);
  assert(stat.size < 2_000_000, `candidate reaches the file-size limit: ${path}`);
  if (/\.(?:md|txt)$/iu.test(path)) {
    assert(!readFileSync(absolute, "utf8").includes("\u2014"), `documentation contains an em dash: ${path}`);
  }
}

// No lifecycle scripts, archive creation or engine build. Keep npm's cache local.
const report = JSON.parse(execFileSync("npm", [
  "pack", "--dry-run", "--json", "--ignore-scripts", "--cache", join(project, ".cache/npm")
], { cwd: repository, encoding: "utf8" }));
assert.equal(report.length, 1, "expected one root package report");
assert(report[0].files.length > 0, "empty root package report");
for (const file of report[0].files) {
  assert(!file.path.startsWith("geocode/"), `geocode file leaked into the engine package: ${file.path}`);
}

console.log("PASS: geocode candidate files are regular files below 2 MB; documentation has no em dashes.");
console.log("PASS: npm pack --dry-run --ignore-scripts excludes geocode/ from the engine package.");
console.log("Scope checks do not substitute for the root package's build and size-budget checks.");
