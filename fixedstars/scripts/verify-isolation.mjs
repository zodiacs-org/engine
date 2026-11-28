import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const project = fileURLToPath(new URL("../", import.meta.url));
const parent = fileURLToPath(new URL("../../", import.meta.url));
const ignored = new Set(["node_modules", ".cache", "generated", "coverage"]);
let checked = 0;

function visit(directory) {
  for (const name of readdirSync(directory)) {
    if (ignored.has(name) || name.endsWith(".tsbuildinfo")) continue;
    const path = `${directory}/${name}`;
    const stat = lstatSync(path);
    assert(!stat.isSymbolicLink(), `authored files must not be symbolic links: ${path}`);
    if (stat.isDirectory()) {
      visit(path);
      continue;
    }
    assert(stat.isFile(), `unexpected file type: ${path}`);
    assert(stat.size < 2_000_000, `file exceeds the project size limit: ${path}`);
    if (/\.(md|txt)$/u.test(name)) {
      assert(!readFileSync(path, "utf8").includes("\u2014"), `em dash in documentation: ${path}`);
    }
    checked += 1;
  }
}

visit(project);

// Dry-run only. Never build, write dist/, create an archive, or publish.
const report = JSON.parse(execFileSync("npm", ["pack", "--dry-run", "--ignore-scripts", "--json"], {
  cwd: parent,
  encoding: "utf8",
  env: { ...process.env, npm_config_cache: `${project}/.cache/npm` }
}));
assert.equal(report.length, 1, "expected one parent engine package report");
assert(report[0].files.every(({ path }) => !path.startsWith("fixedstars/")), "fixedstars files reached the engine package");

console.log(`Fixedstars isolation passed: ${checked} authored files checked; no fixedstars files in the engine package dry run.`);
