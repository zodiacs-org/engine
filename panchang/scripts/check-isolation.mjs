import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

const project = fileURLToPath(new URL("../", import.meta.url));
const checkout = fileURLToPath(new URL("../../", import.meta.url));
const ignored = new Set(["node_modules", ".cache", "generated", "coverage", "build"]);

function inspect(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const path = `${directory}/${entry.name}`;
    assert(!entry.isSymbolicLink(), `Unexpected symlink: ${path}`);
    if (entry.isDirectory()) inspect(path);
    else {
      assert(statSync(path).size < 2_000_000, `File exceeds project limit: ${path}`);
      if (entry.name.endsWith(".md") || entry.name === "CHANGES.txt") {
        assert(!readFileSync(path, "utf8").includes(String.fromCodePoint(0x2014)), `Em dash in documentation: ${path}`);
      }
    }
  }
}
inspect(project);

// A dry run with lifecycle scripts disabled creates no archive or build output.
const report = JSON.parse(execFileSync("npm", ["pack", "--dry-run", "--ignore-scripts", "--json"], {
  cwd: checkout,
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"]
}))[0];
assert(report?.files?.length, "No npm package report");
assert(!report.files.some(({ path }) => path.startsWith("panchang/")), "panchang leaked into the engine package");
console.log("Panchang files satisfy size/documentation rules and are excluded from the engine npm package.");
