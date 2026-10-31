#!/usr/bin/env node
import { fileURLToPath } from "node:url";

// Resolve the source runtime from this file, independent of the caller's cwd.
// No engine build or global tsx installation is needed.
process.stdout.on("error", (error) => {
  if (error.code === "EPIPE") process.exitCode = 1;
  else throw error;
});
try {
  const { tsImport } = await import("tsx/esm/api");
  const { runCli } = await tsImport("../src/cli.ts", {
    parentURL: import.meta.url,
    tsconfig: fileURLToPath(new URL("../tsconfig.runtime.json", import.meta.url))
  });
  process.exitCode = await runCli(process.argv.slice(2), process.stdout, process.stderr);
} catch {
  const args = process.argv.slice(2);
  const json = args.some((arg, i) => arg === "--format" && args[i + 1] === "json");
  const message = "Unable to load the source runtime; install this project's dependencies and use a supported Node version.";
  process.stderr.write(json ? JSON.stringify({ status: "error", reason: "internal-error", message }) + "\n" : `Error: ${message}\n`);
  process.exitCode = 1;
}
