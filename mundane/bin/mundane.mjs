#!/usr/bin/env node
import { runCli } from "../build/cli.mjs";

// Preserve buffered output on refusals and errors. A closed output pipe is
// normal for shell consumers such as head; do not print a stack trace.
process.stdout.on("error", error => {
  if (error.code !== "EPIPE") {
    process.stderr.write("mundane: output write failed.\n");
    process.exitCode = 1;
  }
});
const result = await runCli(process.argv.slice(2));
process.exitCode = result.exitCode;
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
