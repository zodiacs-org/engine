import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const repository = fileURLToPath(new URL("../../", import.meta.url));
const project = fileURLToPath(new URL("../", import.meta.url));
const rootPackage = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
const localPackage = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
assert.equal(localPackage.private, true, "the workbench must remain private");
assert.equal(localPackage.dependencies["astronomy-engine"], rootPackage.dependencies["astronomy-engine"],
  "the workbench must use the engine's pinned ephemeris dependency");

// Read git metadata only. Ignored dependencies, caches and generated outputs
// are not source files and must not become commit candidates.
const paths = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z", "--", "horary/"], {
  cwd: repository, encoding: "utf8"
}).split("\0").filter(Boolean);
assert(paths.length > 0, "no horary source files found");
for (const path of paths) {
  const url = new URL(path, new URL("../../", import.meta.url));
  const stat = lstatSync(url);
  assert(stat.isFile(), `${path} must be a regular file`);
  assert(stat.size < 2_000_000, `${path} reaches the user's file-size limit`);
  if (/\.(md|txt)$/i.test(path)) {
    assert(!readFileSync(url, "utf8").includes("\u2014"), `${path} contains an em-dash character`);
  }
}

// A dry run invokes no lifecycle hooks and creates no packed archive. This
// establishes folder exclusion even when the checkout has no engine dist/.
const report = JSON.parse(execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
  cwd: repository,
  encoding: "utf8",
  env: { ...process.env, npm_config_cache: `${project}.cache/npm` }
}))[0];
assert(report && Array.isArray(report.files), "npm returned no package file list");
assert(!report.files.some(({ path }) => path === "horary" || path.startsWith("horary/")),
  "horary leaked into the engine package");
console.log("Horary source files satisfy the size and documentation punctuation rules; npm dry-run excludes horary/.");
