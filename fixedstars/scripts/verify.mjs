import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { delimiter, dirname } from "node:path";
import { fileURLToPath } from "node:url";

assert.equal(process.argv.length, 2, "usage: node fixedstars/scripts/verify.mjs");
const [major, minor] = process.versions.node.split(".").map(Number);
assert(major > 22 || (major === 22 && minor >= 7), "fixedstars requires Node 22.7.0 or later");
const project = fileURLToPath(new URL("../", import.meta.url));
// Children, including npm's dry run in the isolation check, use this Node.
const env = { ...process.env, PATH: `${dirname(process.execPath)}${delimiter}${process.env.PATH ?? ""}` };
console.log(`Fixedstars local verification on Node ${process.versions.node}`);
for (const path of ["package-lock.json", "sources/engine-sky-contract.json"]) {
  console.log(`SHA-256 ${path}: ${createHash("sha256").update(readFileSync(new URL(`../${path}`, import.meta.url))).digest("hex")}`);
}
const steps = [
  ["TypeScript, no emit", "node_modules/typescript/bin/tsc", "-p", "tsconfig.json", "--pretty", "false"],
  ["Vitest synthetic and geometric suite", "node_modules/vitest/vitest.mjs", "run", "--config", "vitest.config.mjs"],
  ["Documentation links and executable examples", "scripts/check-docs.mjs"],
  ["Offline catalog regeneration", "scripts/build-catalog.mjs", "--check"],
  ["Unchanged sky solver compatibility", "scripts/build-sky-adapter.mjs"],
  ["Authored file limits and engine-package exclusion", "scripts/verify-isolation.mjs"]
];
for (const [label, ...args] of steps) {
  console.log(`\nChecking ${label}`);
  execFileSync(process.execPath, args, { cwd: project, env, stdio: "inherit" });
}
console.log("\nFixedstars local verification passed. No engine build, archive, or remote source retrieval was performed.");
