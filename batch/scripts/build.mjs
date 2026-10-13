import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

await build({
  absWorkingDir: projectRoot,
  entryPoints: ["src/index.ts"],
  outfile: ".generated/index.js",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  sourcemap: false,
  // Root engine imports must use this private project's pinned dependency.
  alias: {
    "astronomy-engine": fileURLToPath(import.meta.resolve("astronomy-engine")),
  },
});
