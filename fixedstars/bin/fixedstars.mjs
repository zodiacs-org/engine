#!/usr/bin/env node
import { loadCli } from "../scripts/load-cli.mjs";
import { prepareStarSky } from "../node.mjs";

try {
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major < 22 || (major === 22 && minor < 7)) throw new Error("fixedstars requires Node 22.7.0 or later.");
  const { runCli } = await loadCli();
  const reply = await runCli(process.argv.slice(2), { prepareSky: prepareStarSky });
  if (reply.stdout) process.stdout.write(reply.stdout);
  if (reply.stderr) process.stderr.write(reply.stderr);
  process.exitCode = reply.exitCode;
} catch (error) {
  process.stderr.write(`${JSON.stringify({ schema: "fixedstars-cli/1", command: null, status: "error",
    error: { code: "runtime", message: error instanceof Error ? error.message : "CLI preparation failed." } })}\n`);
  process.exitCode = 1;
}
