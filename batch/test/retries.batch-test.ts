import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { MemoryQueue } from "../src/memory-queue.js";
import { SqliteQueue } from "../src/sqlite-queue.js";
import { retryContract } from "./retry-contract.js";

retryContract("in-memory", async (now) => {
  const queue = new MemoryQueue({ now });
  return { queue, peer: queue, cleanup: () => queue.close() };
});

const generated = fileURLToPath(new URL("../.generated/retry-tests/", import.meta.url));

retryContract("SQLite independent connections", async (now) => {
  await mkdir(generated, { recursive: true });
  const directory = await mkdtemp(join(generated, "queue-"));
  const filename = join(directory, "queue.sqlite");
  let queue: SqliteQueue | undefined;
  let peer: SqliteQueue | undefined;
  async function cleanup(): Promise<void> {
    try { await queue?.close(); await peer?.close(); }
    finally { await rm(directory, { recursive: true, force: true }); }
  }
  try {
    queue = new SqliteQueue(filename, { now });
    peer = new SqliteQueue(filename, { now });
    return { queue, peer, cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  }
});
