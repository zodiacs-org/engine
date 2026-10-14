import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const project = fileURLToPath(new URL("..", import.meta.url));
await build({
  absWorkingDir: project,
  entryPoints: ["src/cli.ts"],
  outfile: "build/cli.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22.7",
  sourcemap: false,
  legalComments: "inline",
  alias: {
    "astronomy-engine": fileURLToPath(new URL("../node_modules/astronomy-engine/esm/astronomy.js", import.meta.url))
  },
  logLevel: "silent"
});
