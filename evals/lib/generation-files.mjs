import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, mkdtemp, open, readdir, rename, rm, rmdir, writeFile } from "node:fs/promises";
import { dirname, join, parse, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalJson, GENERATOR_FILE_BYTES } from "./generator-data.mjs";

export const GENERATION_FILE_BYTES = GENERATOR_FILE_BYTES;
export const GENERATION_DIRECTORY = fileURLToPath(new URL("../generated", import.meta.url));

export class GenerationFileError extends Error {
  constructor(operation) {
    super(operation === "read"
      ? "Cannot read generation input: expected a regular UTF-8 JSON file within the byte limit."
      : "Cannot write generation output: expected a safe, available output directory and bounded JSON artifacts.");
    this.name = "GenerationFileError";
    this.code = operation === "read" ? "read" : "write";
  }
}

// Refuse symlinked components, including parents of a supplied input file.
// Checks do not sandbox another process that concurrently replaces directories.
async function directories(path) {
  const absolute = resolve(path);
  let current = parse(absolute).root;
  for (const part of absolute.slice(current.length).split(sep).filter(Boolean)) {
    current = join(current, part);
    if (!(await lstat(current)).isDirectory()) throw new Error("unsafe directory");
  }
}

async function readBytes(path) {
  if (typeof path !== "string" || path.length === 0) throw new Error("invalid path");
  const absolute = resolve(path);
  await directories(dirname(absolute));
  const before = await lstat(absolute);
  if (!before.isFile() || before.size > GENERATION_FILE_BYTES) throw new Error("invalid file");
  // O_NONBLOCK also keeps a raced replacement FIFO from waiting for a writer.
  const handle = await open(absolute, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const actual = await handle.stat();
    if (!actual.isFile() || actual.size > GENERATION_FILE_BYTES ||
        actual.dev !== before.dev || actual.ino !== before.ino) throw new Error("invalid file");
    const buffer = Buffer.alloc(GENERATION_FILE_BYTES + 1);
    let size = 0;
    while (size < buffer.length) {
      const { bytesRead } = await handle.read(buffer, size, buffer.length - size, null);
      if (bytesRead === 0) break;
      size += bytesRead;
    }
    if (size > GENERATION_FILE_BYTES) throw new Error("file too large");
    return buffer.subarray(0, size);
  } finally {
    await handle.close();
  }
}

/** Read at most the file-byte limit, with fatal UTF-8 decoding and no path echoes. */
export async function readGenerationJson(path) {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(await readBytes(path)));
  } catch {
    throw new GenerationFileError("read");
  }
}

async function existing(directory, files) {
  let info;
  try {
    info = await lstat(directory);
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
  if (!info.isDirectory()) throw new Error("unsafe destination");
  const names = await readdir(directory);
  if (names.length !== files.length || files.some(([name]) => !names.includes(name))) {
    throw new Error("conflicting destination");
  }
  for (const [name, bytes] of files) {
    if (!(await readBytes(join(directory, name))).equals(bytes)) throw new Error("conflicting artifact");
  }
  return true;
}

/**
 * Publish a complete pair in evals/generated, named by both canonical artifacts.
 * A held lock refuses another writer; a crash may leave a lock or staging folder
 * for manual removal. Existing output is reused only when both files match bytes.
 */
export async function writeGeneration(value) {
  let staging;
  let lock;
  try {
    const { dataset, manifest } = value;
    const files = [["dataset.json", dataset], ["manifest.json", manifest]].map(([name, value]) => [
      name, Buffer.from(`${canonicalJson(value, GENERATION_FILE_BYTES - 1)}\n`, "utf8")
    ]);
    const hash = createHash("sha256").update("zodiacs-generation-files-v1\n");
    for (const [name, bytes] of files) hash.update(`${name}:${bytes.length}:`).update(bytes);
    const id = hash.digest("hex");
    const directory = join(GENERATION_DIRECTORY, id);
    const summary = (reused) => Object.freeze({ directory: `evals/generated/${id}`, reused });

    await directories(dirname(GENERATION_DIRECTORY));
    try {
      await mkdir(GENERATION_DIRECTORY, { mode: 0o700 });
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
    await directories(GENERATION_DIRECTORY);
    const lockPath = join(GENERATION_DIRECTORY, `.lock-${id}`);
    await mkdir(lockPath, { mode: 0o700 });
    lock = lockPath;
    if (await existing(directory, files)) return summary(true);

    staging = await mkdtemp(join(GENERATION_DIRECTORY, ".staging-"));
    for (const [name, bytes] of files) {
      await writeFile(join(staging, name), bytes, { flag: "wx", mode: 0o600 });
    }
    await directories(GENERATION_DIRECTORY);
    // Recheck before publishing; cooperating writers cannot pass the held lock.
    if (await existing(directory, files)) return summary(true);
    await rename(staging, directory);
    staging = undefined;
    return summary(false);
  } catch {
    throw new GenerationFileError("write");
  } finally {
    try {
      if (staging) await rm(staging, { recursive: true, force: true });
      if (lock) await rmdir(lock);
    } catch {
      throw new GenerationFileError("write");
    }
  }
}
