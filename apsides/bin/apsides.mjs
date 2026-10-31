#!/usr/bin/env node

// Leave stdout to the result, including when the pipe is closed by its reader.
// Do not force process.exit(): Node must finish writing large JSON records.
process.stdout.on("error", () => { process.exitCode = 1; });
process.stderr.on("error", () => { process.exitCode = 1; });

try {
  const { runCli } = await import("../.generated/cli/cli.js");
  const result = runCli(process.argv.slice(2));
  process.exitCode = result.exitCode;
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
} catch {
  process.exitCode = 1;
  process.stderr.write(`${JSON.stringify({
    status: "error", code: "unexpected-error",
    message: "The CLI could not load. In apsides/, run npm ci --ignore-scripts and npm run build."
  })}\n`);
}
