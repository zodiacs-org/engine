import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { link, lstat, mkdir, mkdtemp, open, rm, rmdir, writeFile } from "node:fs/promises";
import { dirname, join, parse, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalJson } from "./generator-data.mjs";
import { GENERATION_FILE_BYTES, readGenerationJson } from "./generation-files.mjs";

export const EVALUATION_FILE_BYTES = GENERATION_FILE_BYTES;
export const EVALUATION_DIRECTORY = fileURLToPath(new URL("../reports", import.meta.url));

export class EvaluationFileError extends Error {
  constructor(operation) {
    super(operation === "read"
      ? "Cannot read evaluation input: expected a regular UTF-8 JSON file within the byte limit."
      : "Cannot write evaluation report: expected a safe, available destination and bounded JSON data.");
    this.name = "EvaluationFileError";
    this.code = operation === "read" ? "read" : "write";
  }
}

/** Read bounded, strict UTF-8 JSON without exposing paths or parser diagnostics. */
export async function readEvaluationJson(path) {
  try {
    return await readGenerationJson(path);
  } catch {
    throw new EvaluationFileError("read");
  }
}

// Refuse symlinked directories including parents. As with generation IO, these
// checks do not sandbox a process concurrently replacing parent directories.
async function directories(path) {
  const absolute = resolve(path);
  let current = parse(absolute).root;
  for (const part of absolute.slice(current.length).split(sep).filter(Boolean)) {
    current = join(current, part);
    if (!(await lstat(current)).isDirectory()) throw new Error("unsafe directory");
  }
}

async function existing(path, expected) {
  let before;
  try {
    before = await lstat(path);
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
  if (!before.isFile() || before.size !== expected.length) throw new Error("conflicting report");
  // O_NONBLOCK prevents a replacement FIFO from waiting for another process.
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const actual = await handle.stat();
    if (!actual.isFile() || actual.size !== expected.length ||
        actual.dev !== before.dev || actual.ino !== before.ino) throw new Error("conflicting report");
    const buffer = Buffer.alloc(expected.length + 1);
    let size = 0;
    while (size < buffer.length) {
      const { bytesRead } = await handle.read(buffer, size, buffer.length - size, null);
      if (bytesRead === 0) break;
      size += bytesRead;
    }
    if (!buffer.subarray(0, size).equals(expected)) throw new Error("conflicting report");
    return true;
  } finally {
    await handle.close();
  }
}

/**
 * Publish canonical JSON plus a newline under its exact SHA-256 byte digest.
 * Locks reject cooperating concurrent writers; hard links never replace an
 * existing destination. A crash may leave a lock or staging folder for removal.
 */
export async function writeEvaluationReport(value) {
  let staging;
  let lock;
  try {
    const bytes = Buffer.from(`${canonicalJson(value, EVALUATION_FILE_BYTES - 1)}\n`, "utf8");
    const id = createHash("sha256").update(bytes).digest("hex");
    const destination = join(EVALUATION_DIRECTORY, `${id}.json`);
    const summary = (reused) => Object.freeze({
      report: `evals/reports/${id}.json`, reused, digest: `sha256:${id}`
    });

    await directories(dirname(EVALUATION_DIRECTORY));
    try {
      await mkdir(EVALUATION_DIRECTORY, { mode: 0o700 });
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
    await directories(EVALUATION_DIRECTORY);
    const lockPath = join(EVALUATION_DIRECTORY, `.lock-${id}`);
    await mkdir(lockPath, { mode: 0o700 });
    lock = lockPath;
    if (await existing(destination, bytes)) return summary(true);

    staging = await mkdtemp(join(EVALUATION_DIRECTORY, ".staging-"));
    const temporary = join(staging, "report.json");
    await writeFile(temporary, bytes, { flag: "wx", mode: 0o600 });
    await directories(EVALUATION_DIRECTORY);
    // The hard link publishes the complete file atomically and cannot clobber
    // a destination created after this check, even by a noncooperating writer.
    if (await existing(destination, bytes)) return summary(true);
    await link(temporary, destination);
    return summary(false);
  } catch {
    throw new EvaluationFileError("write");
  } finally {
    let cleanupFailed = false;
    try {
      if (staging) await rm(staging, { recursive: true, force: true });
    } catch {
      cleanupFailed = true;
    }
    try {
      if (lock) await rmdir(lock);
    } catch {
      cleanupFailed = true;
    }
    if (cleanupFailed) throw new EvaluationFileError("write");
  }
}
