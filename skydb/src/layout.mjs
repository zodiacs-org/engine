import { join } from 'node:path';
import { ENGINE_IDENTITY } from './identity.mjs';
import { planPositionTiles } from './generate.mjs';

export const SHARD_SIZE = 1024;
const flatReceipts = 'tile-NNNNNNNN/receipt.json';
const shardedReceipts = 'shard-NNNNNNNN/tile-NNNNNNNN/receipt.json';

export function validateLayout(layout) {
  if (layout !== 'flat' && layout !== 'sharded') throw new RangeError('Invalid database layout');
  return layout;
}

export function tileDirectory(directory, index, layout = 'flat') {
  validateLayout(layout);
  if (!Number.isSafeInteger(index) || index < 0) throw new RangeError('Invalid tile index');
  const name = `tile-${String(index).padStart(8, '0')}`;
  return layout === 'flat' ? join(directory, name) :
    join(directory, `shard-${String(Math.floor(index / SHARD_SIZE)).padStart(8, '0')}`, name);
}

export function databaseManifest(config, layout) {
  validateLayout(layout);
  return { version: layout === 'flat' ? 1 : 2, engineSha256: ENGINE_IDENTITY.sha256, config,
    tiles: layout === 'flat' ? flatReceipts : shardedReceipts, positionFormat: 1, eventFormat: 1 };
}

export function manifestLayout(manifest) {
  if (manifest?.version === 1 && manifest.tiles === flatReceipts) return 'flat';
  if (manifest?.version === 2 && manifest.tiles === shardedReceipts) return 'sharded';
  throw new Error('Invalid database manifest layout');
}

export function defaultLayout(config) {
  for (const descriptor of planPositionTiles(config)) {
    if (descriptor.index >= SHARD_SIZE) return 'sharded';
  }
  return 'flat';
}
