import assert from "node:assert/strict";
import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { build } from "esbuild";

export const edgeRoot = fileURLToPath(new URL("../", import.meta.url));
const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const generated = resolve(edgeRoot, ".generated/reference");

export function requireNode22() {
  assert.equal(process.versions.node.split(".")[0], "22", "Use Node 22 for the edge reference build and tests.");
}

export async function buildReference() {
  requireNode22();
  const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
  const rootPackage = await readJson(resolve(repositoryRoot, "package.json"));
  const localPackage = await readJson(resolve(edgeRoot, "package.json"));
  const dependency = await readJson(resolve(edgeRoot, "node_modules/astronomy-engine/package.json"));
  assert.equal(localPackage.devDependencies["astronomy-engine"], rootPackage.dependencies["astronomy-engine"], "Keep the engine's ephemeris pin.");
  assert.equal(dependency.version, rootPackage.dependencies["astronomy-engine"], "Installed ephemeris differs from the engine's pin.");

  const outfile = resolve(generated, "workloads.mjs");
  const result = await build({
    absWorkingDir: edgeRoot,
    entryPoints: ["src/workloads.ts"],
    outfile,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "es2022",
    // Source files resolve through the edge installation even if the root has
    // no node_modules. Select the same ESM file as the package's import branch.
    alias: { "astronomy-engine": resolve(edgeRoot, "node_modules/astronomy-engine", dependency.exports["."].import) },
    tsconfig: resolve(edgeRoot, "tsconfig.json"),
    minify: false,
    legalComments: "inline",
    metafile: true,
    write: false,
    logLevel: "silent"
  });
  await mkdir(generated, { recursive: true });
  for (const output of result.outputFiles) {
    assert(output.contents.byteLength < 2_000_000, "Reference output must remain below the project file limit.");
    await writeFile(output.path, output.contents);
  }
  await writeFile(resolve(generated, "metafile.json"), JSON.stringify(result.metafile, null, 2) + "\n");
  for (const name of ["LICENSE", "LICENSING.md", "NOTICE"]) {
    await copyFile(resolve(repositoryRoot, name), resolve(generated, name));
  }
  return { moduleUrl: pathToFileURL(outfile), metafile: result.metafile };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await buildReference();
  console.log("Built edge/.generated/reference/workloads.mjs");
}
