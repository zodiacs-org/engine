#!/usr/bin/env node
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

// Compile the checkout-local CLI in memory. Resolve the engine's pinned
// dependency here, just as Vitest does, without a root install or dist/ build.
try {
  const bundle = await build({
    entryPoints: [fileURLToPath(new URL("../src/cli.ts", import.meta.url))],
    bundle: true,
    write: false,
    platform: "node",
    format: "esm",
    target: "node22",
    logLevel: "silent",
    alias: { "astronomy-engine": fileURLToPath(import.meta.resolve("astronomy-engine")) }
  });
  const { runCli } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString("base64")}`);
  const result = runCli(process.argv.slice(2));
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  process.exitCode = result.exitCode;
} catch {
  process.stderr.write("mansions: CLI startup failed; run npm ci --ignore-scripts inside mansions/.\n");
  process.exitCode = 1;
}
