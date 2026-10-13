import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";
import { INDEX_FILE_LIMIT } from "./build-index.js";

export async function readIndexBytes(path: string): Promise<Buffer> {
  const before = await lstat(path);
  if (!before.isFile() || before.size >= INDEX_FILE_LIMIT) throw new TypeError("Invalid local index file.");
  // Refuse final-component symlinks and avoid blocking on special files.
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size >= INDEX_FILE_LIMIT || stat.dev !== before.dev || stat.ino !== before.ino) {
      throw new TypeError("Invalid local index file.");
    }
    // One extra byte detects growth without permitting an unbounded read.
    const bytes = Buffer.allocUnsafe(stat.size + 1);
    let used = 0;
    while (used < bytes.length) {
      const result = await file.read(bytes, used, bytes.length - used, null);
      if (result.bytesRead === 0) break;
      used += result.bytesRead;
    }
    const after = await file.stat();
    if (used !== stat.size || after.size !== stat.size || after.mtimeMs !== stat.mtimeMs
        || after.ctimeMs !== stat.ctimeMs) {
      throw new TypeError("Invalid local index file.");
    }
    return bytes.subarray(0, used);
  } finally {
    await file.close();
  }
}

