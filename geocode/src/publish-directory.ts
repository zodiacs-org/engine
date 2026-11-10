import { lstat, mkdir, mkdtemp, rename, rm } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

async function requireAbsent(path: string): Promise<void> {
  try {
    await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  throw new Error("Output directory must not exist.");
}

/** Stage beside the destination, then publish by rename on the same filesystem.
 * The sibling lock excludes other cooperating builders. The parent must be trusted.
 * Abrupt process termination leaves staging and the lock for explicit recovery.
 */
export async function publishDirectory<T>(output: string, build: (staging: string) => Promise<T>): Promise<T> {
  const destination = resolve(output);
  const parent = dirname(destination);
  const name = basename(destination);
  const lock = join(parent, `.${name}.build-lock`);
  await mkdir(lock); // Never remove another builder's lock.
  let staging: string | undefined;
  try {
    await requireAbsent(destination);
    staging = await mkdtemp(join(parent, `.${name}.building-`));
    const result = await build(staging);
    await requireAbsent(destination);
    await rename(staging, destination);
    staging = undefined;
    return result;
  } finally {
    try {
      if (staging !== undefined) await rm(staging, { recursive: true, force: true });
    } finally {
      await rm(lock, { recursive: true, force: true });
    }
  }
}
