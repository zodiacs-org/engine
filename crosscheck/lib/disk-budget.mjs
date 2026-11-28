import { lstat, mkdir, readdir, rmdir } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DISK_LIMIT_BYTES = 6_000_000_000;
export const MAX_FILE_BYTES = 2_000_000;
const defaultProject = fileURLToPath(new URL('../', import.meta.url));
const lockName = '.acquisition.lock';

function requireBytes(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`${name} must be a nonnegative safe integer`);
}

export function checkFileBytes(bytes) {
  requireBytes(bytes, 'fileBytes');
  if (bytes >= MAX_FILE_BYTES) throw new RangeError(`File must be below ${MAX_FILE_BYTES} bytes`);
  return bytes;
}

// Pure arithmetic keeps the actual cap testable without creating large files.
// The fixed production limit cannot be increased by a caller or environment.
export function checkDiskBudget(usedBytes, additionalBytes) {
  requireBytes(usedBytes, 'usedBytes');
  requireBytes(additionalBytes, 'additionalBytes');
  if (usedBytes > DISK_LIMIT_BYTES || additionalBytes > DISK_LIMIT_BYTES - usedBytes) {
    throw new RangeError(`Disk budget exceeded: ${usedBytes} used + ${additionalBytes} additional bytes exceeds ${DISK_LIMIT_BYTES}`);
  }
  const totalBytes = usedBytes + additionalBytes;
  return { usedBytes, additionalBytes, totalBytes, remainingBytes: DISK_LIMIT_BYTES - totalBytes, limitBytes: DISK_LIMIT_BYTES };
}

async function projectDirectory(project) {
  if (typeof project !== 'string' || !project) throw new TypeError('Project directory required');
  const directory = resolve(project), info = await lstat(directory);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Regular project directory required');
  return directory;
}

// Count logical file sizes, including abandoned downloads and dot files.
// runtime/cache is already part of runtime and is never scanned a second time.
export async function measureDiskUsage({ project = defaultProject } = {}) {
  project = await projectDirectory(project);
  let usedBytes = 0, fileCount = 0;
  async function visit(path, missingAllowed = false) {
    let info;
    try { info = await lstat(path); }
    catch (error) { if (missingAllowed && error.code === 'ENOENT') return; throw error; }
    const label = relative(project, path);
    if (info.isSymbolicLink()) throw new Error(`${label}: symbolic link forbidden in disk budget`);
    if (missingAllowed && !info.isDirectory()) throw new Error(`${label}: regular directory required in disk budget`);
    if (info.isDirectory()) {
      for (const name of (await readdir(path)).sort()) await visit(join(path, name));
    } else if (info.isFile()) {
      try { usedBytes += checkFileBytes(info.size); }
      catch (error) { throw new Error(`${label}: ${error.message}`); }
      fileCount++;
      requireBytes(usedBytes, 'usedBytes');
      requireBytes(fileCount, 'fileCount');
    } else throw new Error(`${label}: regular file or directory required in disk budget`);
  }
  await visit(join(project, 'runtime'), true);
  await visit(join(project, 'cache'), true);
  return { usedBytes, fileCount, limitBytes: DISK_LIMIT_BYTES };
}

export async function assertDiskBudget(additionalBytes, options = {}) {
  requireBytes(additionalBytes, 'additionalBytes');
  const usage = await measureDiskUsage(options);
  return { ...usage, ...checkDiskBudget(usage.usedBytes, additionalBytes) };
}

// All reference acquisition writers share this lock. It stays held through
// publication and cleanup so simultaneous downloads cannot spend the same space.
// A stopped writer's lock requires manual review; existing locks are never stolen.
export async function withAcquisitionBudget(additionalBytes, action, { project = defaultProject } = {}) {
  requireBytes(additionalBytes, 'additionalBytes');
  if (typeof action !== 'function') throw new TypeError('Acquisition action required');
  project = await projectDirectory(project);
  const runtime = join(project, 'runtime');
  try { await mkdir(runtime); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
  const runtimeInfo = await lstat(runtime);
  if (!runtimeInfo.isDirectory() || runtimeInfo.isSymbolicLink()) throw new Error('Regular runtime directory required');
  const lock = join(runtime, lockName);
  try { await mkdir(lock); }
  catch (error) {
    if (error.code === 'EEXIST') throw new Error('Reference acquisition is locked; verify the existing writer has stopped before removing its lock');
    throw error;
  }
  const owner = await lstat(lock);
  try {
    const budget = await assertDiskBudget(additionalBytes, { project });
    return await action(budget);
  } finally {
    let current;
    try { current = await lstat(lock); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (current && current.isDirectory() && !current.isSymbolicLink() && current.dev === owner.dev && current.ino === owner.ino) await rmdir(lock);
  }
}
