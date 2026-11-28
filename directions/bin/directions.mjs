#!/usr/bin/env node

// The local build contains the CLI and its engine source dependencies. It never
// reads root dist/ or needs a root dependency installation.
// A closed pipe also emits an error event after write's callback. The CLI
// handles callback failures; consume the event so Node does not print a stack.
process.stdout.on("error", () => {});
process.stderr.on("error", () => {});
const [major, minor] = process.versions.node.split(".").map(Number);
function fail(code, message) {
  process.stderr.write(`${JSON.stringify({ status: "error", stage: "cli", code, message })}\n`);
  process.exitCode = 1;
}

if (major !== 22 || minor < 7) {
  fail("runtime", "Use Node 22.7 or later within Node 22 for this workbench.");
} else {
  const { existsSync } = await import("node:fs");
  const bundle = new URL("../build/cli.mjs", import.meta.url);
  if (!existsSync(bundle)) {
    fail("build-missing", "Build the local CLI first: npm --prefix directions run build:cli");
  } else {
    try {
      const { main } = await import(bundle.href);
      process.exitCode = await main(process.argv.slice(2));
    } catch {
      fail("unexpected-error", "Could not load or run the local CLI; rebuild it with npm --prefix directions run build:cli");
    }
  }
}
