import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, lstatSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const project = fileURLToPath(new URL("../", import.meta.url));
const repository = fileURLToPath(new URL("../../", import.meta.url));
const ignored = new Set(["node_modules", ".cache", ".generated", "coverage"]);

function checkFiles(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const path = join(directory, entry.name);
    assert(!entry.isSymbolicLink(), `project source must not be a symlink: ${path}`);
    if (entry.isDirectory()) checkFiles(path);
    else {
      assert(lstatSync(path).size < 2_000_000, `project source must be under 2 MB: ${path}`);
      if (/\.(?:md|txt)$/u.test(entry.name)) {
        assert(!readFileSync(path, "utf8").includes("\u2014"), `documentation contains an em dash: ${path}`);
      }
    }
  }
}
checkFiles(project);

const manifest = JSON.parse(readFileSync(join(project, "package.json"), "utf8"));
const engine = JSON.parse(readFileSync(join(repository, "package.json"), "utf8"));
assert.equal(manifest.private, true, "the workbench must remain private");
assert.equal(manifest.dependencies["astronomy-engine"], engine.dependencies["astronomy-engine"],
  "use the engine's exact ephemeris dependency");

// Dry run only: this never calls prepack, builds dist or writes an archive.
const packed = JSON.parse(execFileSync("npm", ["pack", "--dry-run", "--ignore-scripts", "--json"], {
  cwd: repository,
  env: { ...process.env, npm_config_cache: join(project, ".cache/npm") },
  encoding: "utf8"
}))[0];
assert.equal(packed.name, engine.name, "dry run must inspect the engine package");
assert.equal(packed.version, engine.version, "dry run must inspect the current engine version");
assert(packed.files.every((file) => !file.path.startsWith("occultations/")),
  "occultations must be absent from the engine's npm file selection");

for (const args of [["diff", "--name-only", "HEAD", "-z"], ["ls-files", "--others", "--exclude-standard", "-z"]]) {
  const changed = execFileSync("git", args, { cwd: repository, encoding: "utf8" }).split("\0").filter(Boolean);
  assert(changed.every((file) => file.startsWith("occultations/")), "changes outside occultations are out of scope");
}
console.log("Scope passed: source sizes, documentation, dependency pin, private package, npm exclusion and changed paths.");
