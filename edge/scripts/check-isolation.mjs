import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, readdir, stat } from "node:fs/promises";
import { resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { edgeRoot, requireNode22 } from "./build-reference.mjs";

requireNode22();
const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const manifest = JSON.parse(await readFile(resolve(edgeRoot, "package.json"), "utf8"));
assert.equal(manifest.private, true, "The edge project must remain private.");
const ignored = new Set(["node_modules", ".cache", ".generated", "results"]);

async function inspect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (directory === edgeRoot && ignored.has(entry.name)) continue;
    const path = resolve(directory, entry.name);
    assert(!entry.isSymbolicLink(), `Unexpected project symlink: ${path}`);
    if (entry.isDirectory()) {
      await inspect(path);
    } else {
      assert((await stat(path)).size < 2_000_000, `Project file exceeds size limit: ${path}`);
      if (/\.(md|txt)$/.test(path)) {
        assert(!(await readFile(path, "utf8")).includes("\u2014"), `Em dash in documentation: ${path}`);
      }
    }
  }
}

await inspect(edgeRoot);
// A dry run neither creates an archive nor runs the root prepack/build hook.
const packed = JSON.parse(execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
  cwd: repositoryRoot,
  env: { ...process.env, npm_config_cache: resolve(edgeRoot, ".cache/npm") },
  encoding: "utf8",
  maxBuffer: 2_000_000
}));
assert.equal(packed.length, 1);
assert(packed[0].files.length > 0, "Packing inspection returned no files.");
for (const { path } of packed[0].files) {
  assert(path !== "edge" && !path.startsWith("edge/"), `Edge file leaked into the engine package: ${path}`);
}
console.log(`${relative(repositoryRoot, edgeRoot)} files satisfy project limits and are excluded from the root packing list.`);
console.log("This checks edge exclusion only; the repository package-content gate also requires root dist/.");
