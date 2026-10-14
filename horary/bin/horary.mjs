#!/usr/bin/env node
import { register } from "node:module";
import { createReadStream } from "node:fs";

register("../scripts/source-loader.mjs", import.meta.url);
const { runCli, CLI_INPUT_LIMIT_BYTES } = await import("../src/cli.js");

async function readInput(path) {
  const stream = path === "-" ? process.stdin : createReadStream(path);
  const chunks = [];
  let bytes = 0;
  try {
    for await (const chunk of stream) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      bytes += buffer.length;
      if (bytes > CLI_INPUT_LIMIT_BYTES) throw new RangeError("CLI input exceeds its byte limit.");
      chunks.push(buffer);
    }
    return Buffer.concat(chunks).toString("utf8");
  } catch (error) {
    if (error instanceof RangeError) throw error;
    throw new RangeError("Unable to read CLI input.");
  }
}

process.exitCode = await runCli(process.argv.slice(2), {
  readInput, stdout: text => process.stdout.write(text), stderr: text => process.stderr.write(text)
});
