import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const project = fileURLToPath(new URL("..", import.meta.url));
const repository = fileURLToPath(new URL("../..", import.meta.url));
const ignored = new Set(["node_modules", ".generated", ".cache", "coverage"]);

function inspect(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name) || entry.name.endsWith(".tsbuildinfo")) continue;
    const path = join(directory, entry.name);
    assert(!entry.isSymbolicLink(), `unexpected source symlink: ${path}`);
    if (entry.isDirectory()) inspect(path);
    else {
      const bytes = readFileSync(path);
      assert(bytes.length < 2_000_000, `source file exceeds the project size limit: ${path}`);
      if (entry.name.endsWith(".md") || entry.name.endsWith(".txt")) {
        assert(!bytes.toString("utf8").includes("\u2014"), `em dash in documentation: ${path}`);
      }
    }
  }
}
inspect(project);

const rootManifest = JSON.parse(readFileSync(join(repository, "package.json"), "utf8"));
const manifest = JSON.parse(readFileSync(join(project, "package.json"), "utf8"));
assert.equal(manifest.private, true, "mansions must stay private");
assert.equal(manifest.dependencies["astronomy-engine"], rootManifest.dependencies["astronomy-engine"],
  "the local ephemeris version must match the engine's pinned dependency");

// Dry-run only: never build dist/ or create an archive. This also works in a
// source checkout without dist/. The full engine package gate needs dist/.
const report = JSON.parse(execFileSync("npm", [
  "pack", "--dry-run", "--json", "--ignore-scripts"
], { cwd: repository, encoding: "utf8" }));
assert.equal(report.length, 1);
assert(report[0].files.every(({ path }) => !path.startsWith("mansions/")),
  "mansions files must not enter the engine's npm package");
console.log("Project files satisfy size/text constraints; mansions/ is excluded from the engine package.");
