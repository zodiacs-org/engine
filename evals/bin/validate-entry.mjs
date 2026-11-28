import { open } from "node:fs/promises";
import { validateEntry } from "../lib/validate-entry.mjs";

const usage = "Usage: node evals/bin/validate-entry.mjs <entry.json>";
// A byte limit for this CLI's single-entry JSON input, not an accuracy tolerance.
const MAX_ENTRY_BYTES = 64 * 1024;

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
  let entry;
  try {
    handle = await open(args[0], "r");
    if (!(await handle.stat()).isFile()) throw new Error("not a regular file");
    const bytes = Buffer.alloc(MAX_ENTRY_BYTES + 1);
    let size = 0;
    while (size < bytes.length) {
      const { bytesRead } = await handle.read(bytes, size, bytes.length - size, null);
      if (bytesRead === 0) break;
      size += bytesRead;
    }
    if (size > MAX_ENTRY_BYTES) throw new Error("input exceeds byte limit");
    entry = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, size)));
  } catch {
    // Do not echo input contents or raw JSON parser diagnostics.
    process.stderr.write("Cannot read entry: expected a UTF-8 JSON file within the byte limit.\n");
    process.exitCode = 2;
    return;
  } finally {
    await handle?.close();
  }
  const report = validateEntry(entry);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = report.valid ? 0 : 1;
}

await main(process.argv.slice(2));
