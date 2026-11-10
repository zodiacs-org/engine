import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const project = fileURLToPath(new URL("..", import.meta.url));
const repository = fileURLToPath(new URL("../..", import.meta.url));
const ignored = new Set(["node_modules", ".cache", "build", "coverage", "generated"]);
let checkedFiles = 0;
let largestFileBytes = 0;

function visit(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    assert(!entry.isSymbolicLink(), `Unexpected project symlink: ${path}`);
    if (entry.isDirectory()) {
      if (!ignored.has(entry.name)) visit(path);
      continue;
    }
    assert(entry.isFile(), `Unexpected project file type: ${path}`);
    const size = statSync(path).size;
    assert(size < 2_000_000, `Project file must be below 2 MB: ${path}`);
    assert(!/\.(test|spec)\.[cm]?[jt]sx?$/.test(entry.name),
      `Use *.check.ts so root Vitest does not collect project checks: ${path}`);
    if (entry.name.endsWith(".md") || entry.name.endsWith(".txt")) {
      assert(!readFileSync(path, "utf8").includes("\u2014"), `Em dash in documentation: ${path}`);
    }
    checkedFiles++;
    largestFileBytes = Math.max(largestFileBytes, size);
  }
}
visit(project);

// This dry run does not build, write dist, or create an archive. It checks only
// package inclusion, not the root gate's build completeness or size budgets.
const output = execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
  cwd: repository,
  encoding: "utf8",
  env: { ...process.env, npm_config_cache: join(project, ".cache", "npm") }
});
const reports = JSON.parse(output);
assert(Array.isArray(reports) && reports.length === 1, "Expected one npm dry-run report");
const files = reports[0].files.map(entry => entry.path);
assert(!files.some(path => path === "directions" || path.startsWith("directions/")),
  "directions leaked into the engine package");
console.log(JSON.stringify({
  checkedFiles,
  largestFileBytes,
  npmDryRunExcludesDirections: true,
  engineBuildPresent: files.includes("dist/index.js")
}, null, 2));
