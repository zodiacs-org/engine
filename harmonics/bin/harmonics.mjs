#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

// Compile relative TypeScript source imports in memory. No engine build output
// or generated bundle is written, and nothing is downloaded at command time.
try {
  const result = await build({
    absWorkingDir: fileURLToPath(new URL("..", import.meta.url)),
    entryPoints: ["src/cli.ts"],
    alias: {
      "astronomy-engine": fileURLToPath(new URL("../node_modules/astronomy-engine/esm/astronomy.js", import.meta.url))
    },
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    write: false,
    logLevel: "silent"
  });
  const encoded = Buffer.from(result.outputFiles[0].contents).toString("base64");
  const { runCli } = await import(`data:text/javascript;base64,${encoded}`);
  process.exitCode = await runCli(process.argv.slice(2));
} catch {
  process.stderr.write(`${JSON.stringify({ error: {
    code: "execution-failed", message: "Could not load harmonics source. Run npm ci in harmonics first."
  } })}\n`);
  process.exitCode = 1;
}
