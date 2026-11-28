import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const repository = fileURLToPath(new URL("../..", import.meta.url));
const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z", "--", "rustcore/"], {
  cwd: repository, encoding: "utf8"
}).split("\0").filter(Boolean);
assert(files.length > 0, "No rustcore source files found.");
for (const relative of files) {
  const file = join(repository, relative);
  assert(lstatSync(file).isFile(), `Source must be a regular file: ${relative}`);
  assert(lstatSync(file).size < 2_000_000, `File reaches the user's size cap: ${relative}`);
  assert(!/^rustcore\/(target|pkg|node_modules|\.cache|\.tools|generated|coverage)\//.test(relative),
    `Generated file is not ignored: ${relative}`);
  if (/\.(md|txt)$/i.test(relative)) {
    assert(!readFileSync(file, "utf8").includes("\u2014"), `Em dash in documentation: ${relative}`);
  }
  assert(!/\.(test|spec)\.[cm]?[jt]sx?$/.test(relative),
    `Root Vitest would discover this separate workspace test: ${relative}`);
}

// npm's real file selection is authoritative. This produces a listing only;
// ignore-scripts prevents the root prepack hook from building dist/.
const report = JSON.parse(execFileSync("npm", ["pack", "--dry-run", "--ignore-scripts", "--json"], {
  cwd: repository,
  encoding: "utf8",
  env: { ...process.env, npm_config_cache: join(root, ".cache", "npm") }
}))[0];
assert(report?.files?.length, "npm returned no package listing.");
assert(report.files.every(({ path }) => !path.startsWith("rustcore/")), "rustcore leaked into the root package.");
console.log("rustcore sources meet the file rules and are excluded from the root npm package.");
