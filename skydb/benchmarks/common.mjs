import { cpus } from 'node:os';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { ENGINE_IDENTITY, requireNode22 } from '../src/identity.mjs';
export const hour = 3_600_000;
export function environment() {
  requireNode22();
  return { node: process.version, platform: process.platform, arch: process.arch,
    cpu: cpus()[0]?.model ?? 'unknown', engine: ENGINE_IDENTITY };
}
export async function withWorkspace(task) {
  const root = fileURLToPath(new URL('../generated/', import.meta.url));
  await mkdir(root, { recursive: true });
  const directory = await mkdtemp(join(root, 'measurement-'));
  try { return await task(directory); }
  finally { await rm(directory, { recursive: true, force: true }); }
}
export function maximum(previous, error, atMs) {
  if (!Number.isFinite(error) || error < 0) throw new Error('Invalid measured error');
  return !previous || error > previous.error ? { error, atMs } : previous;
}
