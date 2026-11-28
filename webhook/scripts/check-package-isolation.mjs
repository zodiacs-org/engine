import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import "./check-runtime.mjs";

if (process.exitCode) process.exit(process.exitCode);

const project = new URL("../", import.meta.url);
const checkout = new URL("../../", import.meta.url);
const cache = new URL(".cache/npm/", project);
mkdirSync(cache, { recursive: true });
const manifest = JSON.parse(readFileSync(new URL("package.json", project), "utf8"));
assert.equal(manifest.private, true, "the webhook project must remain private");

const report = JSON.parse(execFileSync("npm", ["pack", "--dry-run", "--ignore-scripts", "--json"], {
  cwd: checkout,
  encoding: "utf8",
  env: { ...process.env, npm_config_cache: fileURLToPath(cache) },
  maxBuffer: 2_000_000
}));
assert.equal(report.length, 1, "expected one root package inventory");
assert(report[0].files.length > 0, "root inventory must not be empty");
assert(report[0].files.every(({ path }) => path !== "webhook" && !path.startsWith("webhook/")),
  "webhook files must not enter the root npm package");
console.log("Package isolation passed: webhook/ is absent from the root npm dry-run inventory.");
console.log("This checks file selection only; it does not build dist/ or replace the parent package-content gate.");
