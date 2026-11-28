import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const names = ["pure-api", "natal-api", "compare-techniques"];
const name = process.argv[2];
assert(process.argv.length === 3 && names.includes(name),
  `Usage: node directions/scripts/run-example.mjs <${names.join("|")}>`);
assert(Number(process.versions.node.split(".")[0]) === 22, "Run the examples on Node 22.");
const project = fileURLToPath(new URL("..", import.meta.url));
await build({
  absWorkingDir: project,
  entryPoints: [`examples/${name}.ts`],
  outfile: `build/examples/${name}.mjs`,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22.7",
  legalComments: "inline",
  alias: {
    "astronomy-engine": fileURLToPath(new URL("../node_modules/astronomy-engine/esm/astronomy.js", import.meta.url))
  },
  logLevel: "silent"
});
const { runExample } = await import(new URL(`../build/examples/${name}.mjs`, import.meta.url));
console.log(JSON.stringify(runExample(), null, 2));
