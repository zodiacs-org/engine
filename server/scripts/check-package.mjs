import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const cache = fileURLToPath(new URL("../.cache/npm/", import.meta.url));
mkdirSync(cache, { recursive: true });
const output = execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
  cwd: new URL("../../", import.meta.url),
  env: { ...process.env, npm_config_cache: cache },
  encoding: "utf8"
});
const [report] = JSON.parse(output);
assert(report && Array.isArray(report.files), "npm did not return a file list");
assert(!report.files.some(({ path }) => path === "server" || path.startsWith("server/")),
  "server files must not enter the engine package");
console.log("Package exclusion passed: server/ is absent from npm's dry-run file list.");
console.log("This check does not build dist/ or replace the root package contents gate.");
