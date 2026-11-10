import { open } from "node:fs/promises";
import { constants } from "node:fs";
import { validateReading } from "../lib/validate-reading.mjs";

const usage = "Usage: node evals/bin/validate-reading.mjs <reading.json>";
const MAX_READING_BYTES = 1024 * 1024;

async function main(args) {
  if (args.length === 1 && args[0] === "--help") {
    process.stdout.write(`${usage}\n`);
    return;
  }
  if (args.length !== 1 || args[0].startsWith("-")) {
    process.stderr.write(`${usage}\n`);
    process.exitCode = 2;
    return;
  }
  let handle;
  let reading;
  try {
    // Check the opened object without waiting for a writer on a FIFO input.
    handle = await open(args[0], constants.O_RDONLY | constants.O_NONBLOCK);
    if (!(await handle.stat()).isFile()) throw new Error("not a regular file");
    const bytes = Buffer.alloc(MAX_READING_BYTES + 1);
    let size = 0;
    while (size < bytes.length) {
      const { bytesRead } = await handle.read(bytes, size, bytes.length - size, null);
      if (bytesRead === 0) break;
      size += bytesRead;
    }
    if (size > MAX_READING_BYTES) throw new Error("input exceeds byte limit");
    reading = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, size)));
  } catch {
    process.stderr.write("Cannot read reading: expected a UTF-8 JSON file within the byte limit.\n");
    process.exitCode = 2;
    return;
  } finally {
    await handle?.close();
  }
  const report = validateReading(reading);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = report.valid ? 0 : 1;
}

await main(process.argv.slice(2));
