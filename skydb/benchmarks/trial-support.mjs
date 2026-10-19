import { lstat, readdir, statfs } from 'node:fs/promises';
import { join } from 'node:path';
import { planPositionTiles } from '../src/generate.mjs';
import { createConfig } from '../src/config.mjs';
import { STORE_LIMIT } from '../src/store.mjs';

export const DISK_CAP_BYTES = 12_000_000_000;
// Three bounded tile files, metadata replacements and directory allocation.
export const TILE_RESERVE_BYTES = 5 * STORE_LIMIT + 65_536;
export const FREE_RESERVE_BYTES = 64 * 1024 * 1024;

export async function storageUsage(directory) {
  const info = await lstat(directory);
  if (info.isSymbolicLink()) throw new Error('Storage measurement refuses symbolic links');
  if (info.isFile()) return { bytes: info.size, allocatedBytes: info.blocks * 512, files: 1, directories: 0 };
  if (!info.isDirectory()) throw new Error('Storage measurement requires regular files and directories');
  const total = { bytes: 0, allocatedBytes: info.blocks * 512, files: 0, directories: 1 };
  for (const name of await readdir(directory)) {
    const child = await storageUsage(join(directory, name));
    for (const field of Object.keys(total)) total[field] += child[field];
  }
  return total;
}

export function checkBudget(usage, availableBytes) {
  for (const value of [usage.bytes, usage.allocatedBytes, availableBytes]) {
    if (!Number.isFinite(value) || value < 0) throw new Error('Invalid disk measurement');
  }
  if (Math.max(usage.bytes, usage.allocatedBytes) + TILE_RESERVE_BYTES > DISK_CAP_BYTES) {
    throw new Error('Disk cap would be exceeded by the next tile; record this stop in PHASE2.md');
  }
  if (availableBytes < TILE_RESERVE_BYTES + FREE_RESERVE_BYTES) {
    throw new Error('Insufficient free disk space for the next tile; record this stop in PHASE2.md');
  }
}

export async function availableBytes(directory) {
  const info = await statfs(directory);
  return info.bavail * info.bsize;
}

export function tileCount(config) {
  let count = 0;
  for (const descriptor of planPositionTiles(config)) count++;
  return count;
}

export function projectFullCost({ config, tiles, wallMs, cpuUserMs, cpuSystemMs, storage, generatedBefore }) {
  if (tiles !== tileCount(config)) throw new Error('Trial tile count does not match configuration');
  for (const value of [tiles, wallMs, storage.bytes, storage.allocatedBytes]) {
    if (!Number.isFinite(value) || value <= 0) throw new Error('Invalid trial measurement');
  }
  for (const value of [cpuUserMs, cpuSystemMs, generatedBefore.bytes, generatedBefore.allocatedBytes]) {
    if (!Number.isFinite(value) || value < 0) throw new Error('Invalid trial measurement');
  }
  const fullConfig = createConfig();
  if (config.stepMs !== fullConfig.stepMs || config.tileMs !== fullConfig.tileMs ||
      config.timeScale !== fullConfig.timeScale || JSON.stringify(config.bodies) !== JSON.stringify(fullConfig.bodies)) {
    throw new Error('Trial must use default cadence, tiles, time basis and bodies');
  }
  const fullTiles = tileCount(fullConfig), factor = fullTiles / tiles;
  const bytes = Math.ceil(storage.bytes * factor);
  const allocatedBytes = Math.ceil(storage.allocatedBytes * factor);
  // Retain the trial and everything already under generated/ in this decision.
  const coexistBytes = Math.max(generatedBefore.bytes, generatedBefore.allocatedBytes) +
    Math.max(storage.bytes, storage.allocatedBytes) + Math.max(bytes, allocatedBytes) + TILE_RESERVE_BYTES;
  return { config: fullConfig, tiles: fullTiles, factor, wallMs: wallMs * factor,
    cpuUserMs: cpuUserMs * factor, cpuSystemMs: cpuSystemMs * factor,
    bytes, allocatedBytes, coexistBytes, diskCapBytes: DISK_CAP_BYTES,
    fitsDiskCap: coexistBytes <= DISK_CAP_BYTES };
}
