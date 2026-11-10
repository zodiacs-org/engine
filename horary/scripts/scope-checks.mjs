import assert from "node:assert/strict";
import { lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";

function projectPath(path) {
  assert(typeof path === "string" && path.startsWith("horary/") &&
    !path.split("/").some(part => part === ".." || part === "." || part === ""),
  `${path} is outside the horary source folder`);
}

/** Paths come from read-only git queries, including staged and unstaged changes. */
export function assertChangedPaths(paths) {
  for (const path of paths) projectPath(path);
}

/** Inspect commit candidates, including tracked files in ignored directories. */
export function assertSourceFiles(paths, repository) {
  assert(paths.length > 0, "no horary source files found");
  for (const path of paths) {
    projectPath(path);
    assert(!path.split("/").some(part => ["node_modules", ".cache", "coverage", "generated", "output"].includes(part)) &&
      !path.endsWith(".tsbuildinfo"), `${path} is generated or installed material`);
    const file = join(repository, path), stat = lstatSync(file);
    assert(stat.isFile(), `${path} must be a regular file`);
    assert(stat.size < 2_000_000, `${path} reaches the user's file-size limit`);
    if (/\.(md|txt)$/i.test(path)) {
      assert(!readFileSync(file, "utf8").includes("\u2014"), `${path} contains an em-dash character`);
    }
  }
}

export function assertPackageExclusion(report) {
  assert(report && Array.isArray(report.files) && report.files.length > 0, "npm returned no package file list");
  for (const file of report.files) {
    assert(typeof file.path === "string", "npm returned an invalid package file path");
    assert(file.path !== "horary" && !file.path.startsWith("horary/"), "horary leaked into the engine package");
  }
}
