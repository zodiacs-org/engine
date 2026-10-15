import { build } from "esbuild";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const result = await build({
  absWorkingDir: root,
  entryPoints: { index: "src/index.ts", cli: "scripts/cli-entry.ts" },
  outdir: ".generated",
  outExtension: { ".js": ".mjs" },
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  legalComments: "eof",
  metafile: true,
  alias: { "astronomy-engine": fileURLToPath(import.meta.resolve("astronomy-engine")) }
});
await mkdir(new URL("../.generated/", import.meta.url), { recursive: true });
await writeFile(new URL("../.generated/metafile.json", import.meta.url), JSON.stringify(result.metafile, null, 2) + "\n");
// The local bundle contains the engine's attributed data as well as MIT code.
for (const name of ["LICENSE", "LICENSING.md", "NOTICE"]) {
  await copyFile(new URL(`../../${name}`, import.meta.url), new URL(`../.generated/${name}`, import.meta.url));
}
for (const name of ["SAO-NOTICE.txt", "sao-documentation.txt", "sao-rights.json", "sao-aliases.json", "radii-source.json"]) {
  await copyFile(new URL(`../data/${name}`, import.meta.url), new URL(`../.generated/${name}`, import.meta.url));
}
console.log("Built occultations/.generated/index.mjs and cli.mjs using adjacent engine source.");
