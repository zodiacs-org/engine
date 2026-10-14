import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { assertChangedPaths, assertSourceFiles, assertPackageExclusion } from "./scope-checks.mjs";

const repository = fileURLToPath(new URL("../../", import.meta.url));
const project = fileURLToPath(new URL("../", import.meta.url));
const rootPackage = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
const localPackage = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
assert.equal(localPackage.private, true, "the workbench must remain private");
assert.equal(localPackage.dependencies["astronomy-engine"], rootPackage.dependencies["astronomy-engine"],
  "the workbench must use the engine's pinned ephemeris dependency");

// Read git metadata only. Ignored dependencies, caches and generated outputs
// are not source files and must not become commit candidates.
function gitPaths(args) {
  return execFileSync("git", args, { cwd: repository, encoding: "utf8" }).split("\0").filter(Boolean);
}
assertChangedPaths([...gitPaths(["diff", "--name-only", "--no-renames", "-z", "HEAD"]),
  ...gitPaths(["ls-files", "--others", "--exclude-standard", "-z"])]);
const paths = gitPaths(["ls-files", "--cached", "--others", "--exclude-standard", "-z", "--", "horary/"])
  .filter(path => {
    try { lstatSync(new URL(path, new URL("../../", import.meta.url))); return true; }
    catch (error) { if (error.code === "ENOENT") return false; throw error; }
  });
assertSourceFiles(paths, repository);

// A dry run invokes no lifecycle hooks and creates no packed archive. This
// establishes folder exclusion even when the checkout has no engine dist/.
const report = JSON.parse(execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
  cwd: repository,
  encoding: "utf8",
  env: { ...process.env, npm_config_cache: `${project}.cache/npm` }
}))[0];
assertPackageExclusion(report);
console.log("Changes stay in horary/; source files satisfy size, punctuation and generated-file rules; npm dry-run excludes horary/.");
