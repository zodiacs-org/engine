import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const project = new URL("../", import.meta.url);
// A standalone local CLI, including the exact pinned ephemeris. This never
// writes the engine's dist/ or depends on root node_modules/.
await build({
  entryPoints: [fileURLToPath(new URL("src/cli.ts", project))],
  outfile: fileURLToPath(new URL("build/cli.mjs", project)),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  alias: {
    "astronomy-engine": fileURLToPath(new URL("node_modules/astronomy-engine/esm/astronomy.js", project))
  }
});
