import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, sep } from "node:path";
import ts from "typescript";

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

// Read the engine build graph without emitting or changing any engine file.
const configPath = resolve(checkout, "tsconfig.build.json");
const config = ts.readConfigFile(configPath, ts.sys.readFile);
assert(!config.error, "Cannot read the engine build configuration");
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, checkout);
assert.equal(parsed.errors.length, 0, "Cannot parse the engine build configuration");
const program = ts.createProgram(parsed.fileNames, { ...parsed.options, noEmit: true });
// TypeScript itself is installed here; its standard library declarations are
// compiler inputs, not project-owned sources or emitted engine code.
const dependencies = resolve(project, "node_modules") + sep;
assert(!program.getSourceFiles().some((file) => resolve(file.fileName).startsWith(project) &&
  !resolve(file.fileName).startsWith(dependencies)),
  "panchang entered the engine build graph");

// Check imports owned by this library. Engine imports retain the engine's own
// I/O and dependency contracts; the CLI and source tools stay outside the API.
const source = resolve(project, "src") + sep;
const engineSource = resolve(checkout, "src") + sep;
const visited = new Set();
function libraryImports(path) {
  if (visited.has(path)) return;
  visited.add(path);
  assert(!["cli.ts", "cli-text.ts"].includes(path.slice(source.length)), "CLI entered the library graph");
  const imports = ts.preProcessFile(readFileSync(path, "utf8"), true, true).importedFiles;
  for (const { fileName } of imports) {
    assert(fileName.startsWith("."), `Library added a non-relative dependency: ${fileName}`);
    const target = ts.resolveModuleName(fileName, path, parsed.options, ts.sys).resolvedModule;
    assert(target, `Unresolved library import: ${fileName}`);
    const dependency = resolve(dirname(path), target.resolvedFileName);
    assert(dependency.startsWith(source) || dependency.startsWith(engineSource),
      `Library import leaves the project and engine source: ${fileName}`);
    if (dependency.startsWith(source)) libraryImports(dependency);
  }
}
libraryImports(resolve(source, "index.ts"));

// A dry run with lifecycle scripts disabled creates no archive or build output.
// Use an ignored project-local cache even when the user's npm cache is read-only.
const report = JSON.parse(execFileSync("npm", ["pack", "--dry-run", "--ignore-scripts", "--json",
  "--cache", resolve(project, ".cache/npm")], {
  cwd: checkout,
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"]
}))[0];
assert(report?.files?.length, "No npm package report");
assert(!report.files.some(({ path }) => path.startsWith("panchang/")), "panchang leaked into the engine package");
console.log("Panchang size/documentation rules, library imports, engine build graph and npm package exclusion passed without emitting build output.");
