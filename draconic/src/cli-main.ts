import { createReadStream } from "node:fs";
import type { Readable } from "node:stream";
import { CliError, INPUT_LIMIT_BYTES, runCli } from "./cli.js";

async function readInput(path: string): Promise<Uint8Array> {
  if (path === "-" && process.stdin.isTTY) {
    throw new CliError("Standard input is a terminal. Pipe synthetic JSON or use --input FILE.");
  }
  const stream: Readable = path === "-" ? process.stdin : createReadStream(path);
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    for await (const chunk of stream) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += bytes.byteLength;
      if (size > INPUT_LIMIT_BYTES) throw new CliError("Input exceeds the 64 KiB limit.");
      chunks.push(bytes);
    }
  } catch (error) {
    if (error instanceof CliError) throw error;
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") throw new CliError("Input file does not exist.", 1);
    if (code === "EACCES" || code === "EPERM") throw new CliError("Input cannot be read: permission denied.", 1);
    if (code === "EISDIR") throw new CliError("Input must be a file, not a directory.", 1);
    throw new CliError("Unable to read input.", 1);
  }
  return Buffer.concat(chunks, size);
}

process.exitCode = await runCli(process.argv.slice(2), {
  readInput,
  stdout: (text) => { process.stdout.write(text); },
  stderr: (text) => { process.stderr.write(text); }
});
