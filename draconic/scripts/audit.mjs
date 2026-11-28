import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const project = new URL("../", import.meta.url);
const checkout = new URL("../../", import.meta.url);
assert(Number(process.versions.node.split(".")[0]) >= 22, "Use Node 22 or later for the standalone audit.");

// Read-only git listing includes untracked work, while respecting ignored
// dependencies, caches and generated output. No index or refs are written.
const paths = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard", "--", "draconic/"], {
  cwd: checkout, encoding: "utf8"
}).split("\0").filter(Boolean);
assert(paths.length > 0, "No project files found.");
for (const path of paths) {
  const file = new URL(path, checkout);
  const stat = lstatSync(file);
  assert(stat.isFile(), `Project path is not a regular file: ${path}`);
  assert(stat.size < 2_000_000, `Project file exceeds the size limit: ${path}`);
  if (/\.(?:md|txt)$/.test(path)) {
    assert(!readFileSync(file, "utf8").includes("\u2014"), `Documentation contains an em dash: ${path}`);
  }
}
console.log("PASS: nonignored project files are regular files below 2 MB; documentation has no em dashes.");

const local = JSON.parse(readFileSync(new URL("package.json", project), "utf8"));
const engine = JSON.parse(readFileSync(new URL("package.json", checkout), "utf8"));
assert.equal(local.private, true, "The source project must remain private.");
assert.equal(local.dependencies["astronomy-engine"], engine.dependencies["astronomy-engine"], "Ephemeris pins differ.");
console.log("PASS: private project and ephemeris dependency pin match the source-checkout contract.");

// Scripts disabled is essential: the engine's prepack would write dist/.
// A dry run creates no tarball and needs no dependency installation.
const output = execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts", "--offline"], {
  cwd: checkout, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, npm_config_cache: fileURLToPath(new URL(".cache/npm/", project)) }
});
const reports = JSON.parse(output);
assert.equal(reports.length, 1, "Expected one engine npm dry-run report.");
const files = reports[0].files.map((file) => file.path);
assert(files.includes("package.json"), "Engine package report is incomplete.");
assert(!files.some((path) => path === "draconic" || path.startsWith("draconic/")), "Draconic files leaked into the engine package.");
console.log("PASS: engine npm dry run with scripts disabled excludes draconic/; no archive created.");
console.log("This exclusion audit does not replace engine build, size-budget or archive-binding gates.");
