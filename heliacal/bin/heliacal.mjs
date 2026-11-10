#!/usr/bin/env node
import { register } from "node:module";

// A closed downstream pipe is normal for commands such as `heliacal ... | head`.
for (const stream of [process.stdout, process.stderr]) {
  stream.on("error", (error) => {
    if (error.code === "EPIPE") process.exit(0);
    process.exitCode = 1;
  });
}

try {
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (!((major === 22 && minor >= 7) || major >= 24)) {
    throw new Error("requires Node 22.7+ in the 22.x series, or Node 24+.");
  }

  // The hook lives only in this CLI process. It emits no build files and is
  // never installed by imports of the pure library API.
  register(new URL("../scripts/source-loader.mjs", import.meta.url), import.meta.url);
  const { runCli } = await import("../src/cli.ts");
  const result = runCli(process.argv.slice(2));
  process.exitCode = result.exitCode;
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
} catch (error) {
  const message = error instanceof Error ? error.message : "unable to start the CLI.";
  // Keep startup errors on one line, without a stack or control characters.
  process.stderr.write(`heliacal: ${message.replace(/[\u0000-\u001f\u007f-\u009f]/gu, " ")}\n`);
  process.exitCode = 1;
}
