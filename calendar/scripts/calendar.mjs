#!/usr/bin/env node
import { register } from "node:module";
import { prepareEvents } from "./prepare-events.mjs";

try {
  register(new URL("./typescript-loader.mjs", import.meta.url));
  const { parseCliArguments, CLI_HELP } = await import("../src/cli-options.ts");
  const args = parseCliArguments(process.argv.slice(2));
  if (args.help) process.stdout.write(CLI_HELP);
  else {
    await prepareEvents();
    const { runCli } = await import("../src/cli.ts");
    const controller = new AbortController();
    const cancel = () => controller.abort();
    process.once("SIGINT", cancel);
    process.once("SIGTERM", cancel);
    try { process.exitCode = await runCli(args, { signal: controller.signal }); }
    finally { process.removeListener("SIGINT", cancel); process.removeListener("SIGTERM", cancel); }
  }
} catch (error) {
  // Do not print submitted JSON, birth details, raw filesystem paths or stacks.
  process.stderr.write(`calendar: ${error instanceof Error ? error.message : "Unexpected failure."}\n`);
  process.exitCode = 1;
}
