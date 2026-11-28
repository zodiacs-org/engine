import { open } from "node:fs/promises";
import { validateDataset } from "../lib/validate-dataset.mjs";

const usage = "Usage: node evals/bin/validate-dataset.mjs [--seed] <dataset.json>";
const MAX_DATASET_BYTES = 1024 * 1024;

async function main(args) {
  if (args.length === 1 && args[0] === "--help") {
    process.stdout.write(`${usage}\n`);
    return;
  }
  const seed = args[0] === "--seed";
  const paths = seed ? args.slice(1) : args;
  if (paths.length !== 1 || paths[0].startsWith("-")) {
    process.stderr.write(`${usage}\n`);
    process.exitCode = 2;
    return;
  }
  let handle;
  let dataset;
  try {
    handle = await open(paths[0], "r");
    if (!(await handle.stat()).isFile()) throw new Error("not a regular file");
    const bytes = Buffer.alloc(MAX_DATASET_BYTES + 1);
    let size = 0;
    while (size < bytes.length) {
      const { bytesRead } = await handle.read(bytes, size, bytes.length - size, null);
      if (bytesRead === 0) break;
      size += bytesRead;
    }
    if (size > MAX_DATASET_BYTES) throw new Error("input exceeds byte limit");
    dataset = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, size)));
  } catch {
    process.stderr.write("Cannot read dataset: expected a UTF-8 JSON file within the byte limit.\n");
    process.exitCode = 2;
    return;
  } finally {
    await handle?.close();
  }
  const report = validateDataset(dataset, { seed });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = report.valid ? 0 : 1;
}

await main(process.argv.slice(2));
