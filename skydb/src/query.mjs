import { open } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { createConfig, COVERAGE } from './config.mjs';
import { ENGINE_IDENTITY } from './identity.mjs';
import { TIME_BOUNDARIES, planPositionTiles } from './generate.mjs';
import { signedAngle } from './events.mjs';
import { STORE_LIMIT, verifyStoredTile } from './store.mjs';

async function readJson(path) {
  const handle = await open(path, 'r');
  try {
    const bytes = Buffer.alloc(STORE_LIMIT + 1);
    let length = 0;
    while (length < bytes.length) {
      const result = await handle.read(bytes, length, bytes.length - length, null);
      if (!result.bytesRead) break;
      length += result.bytesRead;
    }
    if (length > STORE_LIMIT) throw new Error('Store file exceeds size limit');
    return { bytes: bytes.subarray(0, length), value: JSON.parse(bytes.subarray(0, length)) };
  } finally { await handle.close(); }
}

/** Locate a tile without building an index proportional to database coverage. */
export function descriptorAt(input, atMs) {
  const config = createConfig(input);
  if (!Number.isSafeInteger(atMs) || atMs < config.startMs || atMs >= config.endMs) {
    throw new RangeError('Query instant outside database coverage');
  }
  const baseIndex = Math.floor((atMs - config.startMs) / config.tileMs);
  const base = config.startMs + baseIndex * config.tileMs;
  const stop = Math.min(base + config.tileMs, config.endMs);
  const splits = TIME_BOUNDARIES.filter(at => at > base && at < stop);
  const previousSplits = TIME_BOUNDARIES.filter(at => at > config.startMs && at < base &&
    (at - config.startMs) % config.tileMs !== 0).length;
  const localIndex = splits.filter(at => at <= atMs).length;
  const startMs = localIndex ? splits[localIndex - 1] : base;
  const endMs = splits[localIndex] ?? stop;
  return { index: baseIndex + previousSplits + localIndex, startMs, endMs,
    lastSampleMs: TIME_BOUNDARIES.includes(endMs) || endMs === COVERAGE.endMs ? endMs - 1 : endMs };
}

/** Interpolate a validated decoded tile, preserving exact stored samples. */
export function interpolatePositions(tile, atMs) {
  const { metadata, samples } = tile;
  if (!Number.isSafeInteger(atMs) || atMs < metadata.startMs || atMs >= metadata.endMs ||
      atMs < samples[0].atMs || atMs > samples.at(-1).atMs ||
      TIME_BOUNDARIES.some(at => at > samples[0].atMs && at <= samples.at(-1).atMs)) {
    throw new RangeError('Query outside smooth tile support');
  }
  let low = 0, high = samples.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (samples[middle].atMs < atMs) low = middle + 1;
    else high = middle;
  }
  const right = samples[low];
  if (right.atMs === atMs) return structuredClone(right.rows);
  const left = samples[low - 1];
  const fraction = (atMs - left.atMs) / (right.atMs - left.atMs);
  return left.rows.map((row, index) => {
    const next = right.rows[index], delta = signedAngle(next.lon - row.lon);
    if (Math.abs(delta) === 180) throw new RangeError('Ambiguous longitude interpolation');
    const lon = row.lon + delta * fraction;
    return { body: row.body, lon: ((lon % 360) + 360) % 360,
      lat: row.lat + (next.lat - row.lat) * fraction,
      speed: row.speed + (next.speed - row.speed) * fraction };
  });
}

/** Open a completed, immutable local database. Tiles are verified lazily. */
export async function openDatabase(directory, options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options) ||
      Object.keys(options).some(key => key !== 'cacheTiles')) throw new RangeError('Invalid query options');
  const cacheTiles = options.cacheTiles ?? 4;
  if (!Number.isSafeInteger(cacheTiles) || cacheTiles < 1 || cacheTiles > 64) throw new RangeError('Invalid cacheTiles');
  directory = resolve(directory);
  const manifest = await readJson(join(directory, 'manifest.json'));
  const config = createConfig(manifest.value.config);
  const expected = { version: 1, engineSha256: ENGINE_IDENTITY.sha256, config,
    tiles: 'tile-NNNNNNNN/receipt.json', positionFormat: 1, eventFormat: 1 };
  if (JSON.stringify(manifest.value) !== JSON.stringify(expected)) throw new Error('Invalid database manifest');
  planPositionTiles(config).next(); // Validate tile capacity.
  const checkpoint = (await readJson(join(directory, 'checkpoint.json'))).value;
  const count = descriptorAt(config, config.endMs - 1).index + 1;
  if (checkpoint.version !== 1 || checkpoint.complete !== true || checkpoint.nextIndex !== count ||
      checkpoint.manifestSha256 !== createHash('sha256').update(manifest.bytes).digest('hex')) {
    throw new Error('Database checkpoint is incomplete or invalid');
  }
  const cache = new Map();
  let queue = Promise.resolve();
  const load = descriptor => {
    // Serialize disk loads, including concurrent callers, to bound decode work.
    const result = queue.then(async () => {
      let tile = cache.get(descriptor.index);
      if (!tile) {
        tile = await verifyStoredTile(directory, descriptor);
        if (JSON.stringify(tile.positions.metadata.bodies) !== JSON.stringify(config.bodies)) throw new Error('Tile bodies mismatch');
        let previous = -Infinity;
        for (const event of tile.events) {
          if (!event || !Number.isSafeInteger(event.atMs) || event.atMs < descriptor.startMs ||
              event.atMs >= descriptor.endMs || event.atMs < previous ||
              !['aspect', 'ingress', 'station', 'lunation'].includes(event.kind) ||
              !Array.isArray(event.bodies) || !event.bodies.length ||
              event.bodies.some(body => !config.bodies.includes(body)) || !Number.isFinite(event.residual)) {
            throw new Error('Invalid event record');
          }
          previous = event.atMs;
        }
      }
      cache.delete(descriptor.index);
      cache.set(descriptor.index, tile);
      while (cache.size > cacheTiles) cache.delete(cache.keys().next().value);
      return tile;
    });
    queue = result.then(() => undefined, () => undefined);
    return result;
  };
  return Object.freeze({
    config,
    cacheInfo: () => ({ size: cache.size, capacity: cacheTiles, indices: [...cache.keys()] }),
    async positions(atMs) {
      const descriptor = descriptorAt(config, atMs);
      const tile = await load(descriptor);
      return { atMs, rows: interpolatePositions(tile.positions, atMs) };
    },
    async *events(startMs, endMs, filter = {}) {
      if (![startMs, endMs].every(Number.isSafeInteger) || startMs < config.startMs || endMs > config.endMs || startMs >= endMs ||
          !filter || typeof filter !== 'object' || Array.isArray(filter) ||
          Object.keys(filter).some(key => !['kind', 'body'].includes(key)) ||
          (filter.kind !== undefined && !['aspect', 'ingress', 'station', 'lunation'].includes(filter.kind)) ||
          (filter.body !== undefined && !config.bodies.includes(filter.body))) throw new RangeError('Invalid event query');
      for (let atMs = startMs; atMs < endMs;) {
        const descriptor = descriptorAt(config, atMs);
        const tile = await load(descriptor);
        for (const event of tile.events) {
          if (event.atMs >= startMs && event.atMs < endMs &&
              (filter.kind === undefined || event.kind === filter.kind) &&
              (filter.body === undefined || event.bodies.includes(filter.body))) yield structuredClone(event);
        }
        atMs = descriptor.endMs;
      }
    }
  });
}
