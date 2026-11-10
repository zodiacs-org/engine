import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { version as esbuildVersion } from "esbuild";

export const edgeRoot = fileURLToPath(new URL("../", import.meta.url));
export const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
export const EPHEMERIS_SOURCE = "node_modules/astronomy-engine/esm/astronomy.js";

export function requireNode22() {
  assert.equal(process.versions.node.split(".")[0], "22", "Use Node 22 for the edge reference build and tests.");
}

export async function readToolchain() {
  requireNode22();
  const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
  const [rootPackage, localPackage, dependency, lock] = await Promise.all([
    readJson(resolve(repositoryRoot, "package.json")),
    readJson(resolve(edgeRoot, "package.json")),
    readJson(resolve(edgeRoot, "node_modules/astronomy-engine/package.json")),
    readJson(resolve(edgeRoot, "package-lock.json"))
  ]);
  const expected = rootPackage.dependencies["astronomy-engine"];
  assert.equal(localPackage.devDependencies["astronomy-engine"], expected, "Keep the engine's ephemeris pin.");
  assert.equal(dependency.version, expected, "Installed ephemeris differs from the engine's pin.");
  assert.equal(dependency.exports["."].import, "./esm/astronomy.js", "Unexpected ephemeris ESM entry.");
  for (const [name, version] of [["astronomy-engine", expected], ["esbuild", esbuildVersion]]) {
    assert.equal(localPackage.devDependencies[name], version, `Installed ${name} differs from its exact pin.`);
    assert.equal(lock.packages[""].devDependencies[name], version, `Stale lockfile pin for ${name}.`);
    assert.equal(lock.packages[`node_modules/${name}`].version, version, `Stale lockfile entry for ${name}.`);
  }
  return {
    engineVersion: rootPackage.version,
    ephemeris: { name: "astronomy-engine", version: expected },
    toolchain: { node: process.version, esbuild: esbuildVersion },
    alias: { "astronomy-engine": resolve(edgeRoot, EPHEMERIS_SOURCE) }
  };
}
