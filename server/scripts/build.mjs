import { build } from "esbuild";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const result = await build({
  absWorkingDir: root,
  entryPoints: ["src/main.ts"],
  outdir: "build",
  platform: "node",
  target: "node22",
  format: "esm",
  bundle: true,
  // External dependencies resolve from server/node_modules at runtime.
  // Relative engine source imports are bundled without touching root dist/.
  packages: "external",
  sourcemap: false,
  metafile: true,
  logLevel: "warning"
});
await mkdir(new URL("../build/", import.meta.url), { recursive: true });
await writeFile(new URL("../build/meta.json", import.meta.url), JSON.stringify(result.metafile, null, 2) + "\n");
