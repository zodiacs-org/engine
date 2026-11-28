#!/usr/bin/env node
// This source-checkout command uses scoped TypeScript loading, without
// compiling or copying the repository's engine or historical atlas.
process.env.TSX_DISABLE_CACHE = "1";

try {
  const { tsImport } = await import("tsx/esm/api");
  const { runCli } = await tsImport("../src/cli.ts", { parentURL: import.meta.url, tsconfig: false });
  process.exitCode = await runCli(process.argv.slice(2), {
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text)
  });
} catch {
  process.stderr.write(`${JSON.stringify({ error: {
    code: "runtime-error", message: "Cannot start geocode. Use the supported Node runtime and install geocode's locked dependencies."
  } })}\n`);
  process.exitCode = 1;
}
