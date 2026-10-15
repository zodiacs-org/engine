import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// A manifest-only check: never run the engine prepack script or write an archive.
const output = execFileSync("npm", ["pack", "--dry-run", "--ignore-scripts", "--json"], {
  cwd: new URL("../../", import.meta.url),
  encoding: "utf8",
  env: {
    ...process.env,
    npm_config_cache: fileURLToPath(new URL("../node_modules/.cache/", import.meta.url))
  }
});
const reports = JSON.parse(output);
assert.equal(reports.length, 1, "expected one engine package manifest");
const files = reports[0].files;
assert(Array.isArray(files) && files.length > 0, "expected package file entries");
assert(files.every(file => file.path !== "mundane" && !file.path.startsWith("mundane/")),
  "mundane files must stay outside the engine package");
console.log("PASS: npm dry-run manifest contains no mundane files; scripts disabled, no archive written.");
console.log("This is an isolation check; the full package gate also needs a built dist tree.");
