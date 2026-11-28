import assert from "node:assert/strict";
import { mkdir, writeFile, copyFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { build } from "esbuild";
import { edgeRoot, repositoryRoot, readToolchain } from "./build-support.mjs";

export { edgeRoot, requireNode22 } from "./build-support.mjs";
const generated = resolve(edgeRoot, ".generated/reference");

export async function buildReference({ write = true } = {}) {
  const { alias } = await readToolchain();

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
    alias,
    tsconfig: resolve(edgeRoot, "tsconfig.json"),
    minify: false,
    legalComments: "inline",
    metafile: true,
    write: false,
    logLevel: "silent"
  });
  assert.equal(result.warnings.length, 0, "Reference warnings require investigation.");
  for (const output of result.outputFiles) {
    assert(output.contents.byteLength < 2_000_000, "Reference output must remain below the project file limit.");
  }
  const bytes = Buffer.from(result.outputFiles[0].contents);
  if (write) {
    await mkdir(generated, { recursive: true });
    for (const output of result.outputFiles) await writeFile(output.path, output.contents);
    await writeFile(resolve(generated, "metafile.json"), JSON.stringify(result.metafile, null, 2) + "\n");
    for (const name of ["LICENSE", "LICENSING.md", "NOTICE"]) {
      await copyFile(resolve(repositoryRoot, name), resolve(generated, name));
    }
  }
  return {
    moduleUrl: write ? pathToFileURL(outfile) : new URL(`data:text/javascript;base64,${bytes.toString("base64")}`),
    bytes, metafile: result.metafile
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await buildReference();
  console.log("Built edge/.generated/reference/workloads.mjs");
}
