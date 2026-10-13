import { fileURLToPath } from "node:url";
import { isAbsolute, relative, resolve } from "node:path";
import { build } from "esbuild";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== "--outdir")) {
  throw new Error("Usage: node scripts/build.mjs [--outdir .generated/subdirectory]");
}
const generatedRoot = resolve(projectRoot, ".generated");
const outdir = resolve(projectRoot, args[1] ?? ".generated");
const outputRelative = relative(generatedRoot, outdir);
if (isAbsolute(outputRelative) || outputRelative === ".." || outputRelative.startsWith("../")) {
  throw new Error("Build output must stay inside batch/.generated/.");
}

await build({
  absWorkingDir: projectRoot,
  entryPoints: ["src/index.ts", "src/worker-entry.ts"],
  outdir,
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
