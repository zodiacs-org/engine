import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

const project = fileURLToPath(new URL("../", import.meta.url));
const repository = fileURLToPath(new URL("../../", import.meta.url));
const ignored = new Set(["node_modules", ".cache", "generated", "build", "coverage"]);

function checkFiles(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name) || entry.name.endsWith(".tsbuildinfo")) continue;
    const path = `${directory}/${entry.name}`;
    assert(!entry.isSymbolicLink(), `Unexpected source symlink: ${path}`);
    if (entry.isDirectory()) {
      checkFiles(path);
    } else {
      assert(statSync(path).size < 2_000_000, `File must be under 2 MB: ${path}`);
      if (entry.name.endsWith(".md") || entry.name.endsWith(".txt")) {
        assert(!readFileSync(path, "utf8").includes("\u2014"), `Em dash in documentation: ${path}`);
      }
    }
  }
}

checkFiles(project);
// This lists the current root package without executing prepack or writing an archive.
// It works even when this checkout intentionally has no root dist/ build.
const report = JSON.parse(execFileSync("npm", [
  "pack", "--dry-run", "--ignore-scripts", "--json", "--cache", `${project}/.cache/npm`
], { cwd: repository, encoding: "utf8" }));
assert(Array.isArray(report) && report.length === 1, "Expected one root package report");
assert(report[0].files.every(({ path }) => !path.startsWith("minorbodies/")),
  "minorbodies must not enter the root npm package");
console.log("Source file sizes, documentation punctuation and root package exclusion passed.");
console.log("This is an exclusion check, not the engine's dist/ completeness check.");
