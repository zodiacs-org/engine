// Read-only parent checks. Do not invoke its prepack script or rebuild dist/.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { prepareEvents } from "./prepare-events.mjs";

assert.equal(process.argv.length, 2, "Usage: node scripts/verify-isolation.mjs");
const calendar = fileURLToPath(new URL("..", import.meta.url));
const repository = path.resolve(calendar, "..");
const insideCalendar = filename => filename === calendar || filename.startsWith(calendar + path.sep);
const git = (...args) => execFileSync("git", ["--no-optional-locks", ...args], { cwd: repository, encoding: "utf8" });
const paths = output => output.split("\0").filter(Boolean);

await prepareEvents({ check: true });
for (const name of paths(git("diff", "--no-ext-diff", "--name-only", "-z", "HEAD")).concat(
  paths(git("ls-files", "--others", "--exclude-standard", "-z")))) {
  assert(name.startsWith("calendar/"), `Session changed a file outside calendar/: ${name}`);
}
const authored = paths(git("ls-files", "--cached", "--others", "--exclude-standard", "-z", "--", "calendar"));
for (const name of authored) {
  const filename = path.join(repository, name);
  const stat = lstatSync(filename);
  assert(stat.isFile() && !stat.isSymbolicLink(), `Authored path must be a regular file: ${name}`);
  assert(stat.size < 2_000_000, `Authored file exceeds the size limit: ${name}`);
  if (name.endsWith(".md") || name.endsWith(".txt")) assert(!readFileSync(filename, "utf8").includes("\u2014"), `Em dash in documentation: ${name}`);
  assert(!/(?:^|\/)(?:node_modules|dist|build|generated|coverage|\.cache)(?:\/|$)/u.test(name), `Generated file is tracked: ${name}`);
}
// TypeScript parses inherited include/exclude settings; checking a substring of
// the config would miss inherited globs or unexpected source expansion.
for (const configName of ["tsconfig.json", "tsconfig.build.json", "tsconfig.typecheck.json"]) {
  const configPath = path.join(repository, configName);
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  assert(!config.error, `Cannot parse ${configName}`);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, repository);
  assert.equal(parsed.errors.length, 0, `Invalid ${configName}`);
  assert(parsed.fileNames.length > 0, `No parent sources in ${configName}`);
  assert(!parsed.fileNames.some(insideCalendar), `Parent TypeScript inputs include calendar/: ${configName}`);
}
// Check imports, exports, dynamic literal imports and reference directives in
// the parent source tree, including tests. This is source isolation, not a
// substitute for the parent's compiled import-graph/size checks.
for (const name of paths(git("ls-files", "-z", "--", "src")).filter(name => /\.[cm]?[jt]sx?$/u.test(name))) {
  const filename = path.join(repository, name);
  const info = ts.preProcessFile(readFileSync(filename, "utf8"), true, true);
  for (const reference of [...info.importedFiles, ...info.referencedFiles]) {
    assert(!reference.fileName.startsWith("@zodiacs/calendar"), `Parent imports calendar package: ${name}`);
    if (reference.fileName.startsWith(".")) assert(!insideCalendar(path.resolve(path.dirname(filename), reference.fileName)), `Parent source reaches calendar/: ${name}`);
  }
}
// npm's actual file selection is stronger than assuming files[] excludes a
// nested README or a future allowlist pattern. A dry run creates no archive.
const pack = JSON.parse(execFileSync("npm", ["pack", "--dry-run", "--ignore-scripts", "--json"], {
  cwd: repository, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, PATH: path.dirname(process.execPath) + path.delimiter + process.env.PATH,
    npm_config_cache: path.join(calendar, ".cache", "npm"), npm_config_ignore_scripts: "true",
    npm_config_update_notifier: "false" }
}));
assert.equal(pack.length, 1);
assert(pack[0].files.length > 0);
assert(!pack[0].files.some(file => file.path === "calendar" || file.path.startsWith("calendar/")), "Calendar files leaked into npm package selection.");
process.stdout.write("Verified calendar-only edits, file limits, parent source inputs/imports and npm dry-run exclusion.\n");
