#!/usr/bin/env node
// Source-checkout example: no engine build and no copied atlas or chart math.
process.env.TSX_DISABLE_CACHE = "1";

if (process.argv.length !== 3 || !process.argv[2]) {
  process.stderr.write("Usage: node examples/run.mjs <local-index>\n");
  process.exitCode = 2;
} else {
  try {
    const { tsImport } = await import("tsx/esm/api");
    const { runEngineExample } = await tsImport("./engine-input.ts", { parentURL: import.meta.url, tsconfig: false });
    process.stdout.write(`${JSON.stringify(await runEngineExample(process.argv[2]))}\n`);
  } catch {
    process.stderr.write("Cannot run the example. Check the local index and geocode's runtime dependencies.\n");
    process.exitCode = 1;
  }
}
