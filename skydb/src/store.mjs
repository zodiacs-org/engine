import { mkdir, open, rename, rm, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createConfig } from './config.mjs';
import { databaseManifest, defaultLayout, manifestLayout, tileDirectory, validateLayout } from './layout.mjs';
import { planPositionTiles, generatePositionTiles } from './generate.mjs';
import { generateEventTiles, EVENT_SCAN_MAX_MS } from './events.mjs';
import { decodePositionTile } from './tile.mjs';
import { validateEvents } from './validate-events.mjs';

export const STORE_LIMIT = 1_500_000;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const json = value => Buffer.from(JSON.stringify(value) + '\n');
async function exists(path) {
  try { await stat(path); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}
async function boundedRead(path) {
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
    return bytes.subarray(0, length);
  } finally { await handle.close(); }
}
async function write(path, bytes) {
  if (bytes.length > STORE_LIMIT) throw new Error('Store file exceeds size limit');
  const handle = await open(path, 'wx');
  try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
}
async function atomicJson(path, value) {
  const temporary = `${path}.tmp`;
  await rm(temporary, { force: true });
  await write(temporary, json(value));
  await rename(temporary, path);
}

export { boundedRead as readStoreFile, atomicJson as writeStoreJson, exists as storePathExists };

export async function assertNoLayoutMigration(directory) {
  if (await exists(join(directory, '.layout-migration.json'))) {
    throw new Error('Database layout migration is incomplete; resume the migration before generation or queries');
  }
}

/** Verify a committed tile against its receipt in the distributed manifest. */
export async function verifyStoredTile(directory, descriptor, config, layout) {
  if (layout === undefined) {
    await assertNoLayoutMigration(directory);
    layout = manifestLayout(JSON.parse(await boundedRead(join(directory, 'manifest.json'))));
  }
  const folder = tileDirectory(directory, descriptor.index, layout);
  const receipt = JSON.parse(await boundedRead(join(folder, 'receipt.json')));
  if (receipt.version !== 1 || JSON.stringify(receipt.descriptor) !== JSON.stringify(descriptor) ||
      Object.keys(receipt.files ?? {}).sort().join() !== 'events.json.gz,positions.sky') {
    throw new Error('Tile receipt mismatch');
  }
  const files = {};
  for (const filename of ['positions.sky', 'events.json.gz']) {
    const bytes = await boundedRead(join(folder, filename));
    const entry = receipt.files[filename];
    if (entry.bytes !== bytes.length || entry.sha256 !== digest(bytes)) throw new Error('Tile checksum mismatch');
    files[filename] = bytes;
  }
  const positions = decodePositionTile(files['positions.sky']);
  const events = JSON.parse(gunzipSync(files['events.json.gz'], { maxOutputLength: STORE_LIMIT }));
  if (positions.metadata.startMs !== descriptor.startMs || positions.metadata.endMs !== descriptor.endMs ||
      positions.samples[0].atMs !== descriptor.startMs || positions.samples.at(-1).atMs !== descriptor.lastSampleMs ||
      events.version !== 1 || JSON.stringify(events.descriptor) !== JSON.stringify(descriptor) || !Array.isArray(events.events)) {
    throw new Error('Tile content mismatch');
  }
  validateEvents(events.events, descriptor, positions.metadata.bodies);
  if (config) {
    if (JSON.stringify(positions.metadata.bodies) !== JSON.stringify(config.bodies)) throw new Error('Tile bodies mismatch');
    let atMs = descriptor.startMs;
    for (const sample of positions.samples) {
      if (sample.atMs !== atMs) throw new Error('Tile sample cadence mismatch');
      atMs = Math.min(atMs + config.stepMs, descriptor.lastSampleMs);
    }
    const expectedCount = Math.ceil((descriptor.lastSampleMs - descriptor.startMs) / config.stepMs) + 1;
    if (positions.samples.length !== expectedCount) throw new Error('Tile sample cadence mismatch');
  }
  return { receipt, positions, events: events.events };
}

/** Persist one tile at a time; hooks support controlled interruption and progress. */
export async function generateDatabase(directory, input = {}, { signal, onProgress = async () => {}, layout } = {}) {
  const config = createConfig(input);
  if (layout !== undefined) validateLayout(layout);
  if (config.stepMs > EVENT_SCAN_MAX_MS) throw new RangeError('Event scan step must not exceed one hour');
  // Force capacity validation before any filesystem mutation.
  planPositionTiles(config).next();
  directory = resolve(directory);
  await mkdir(directory, { recursive: true });
  const lockPath = join(directory, '.lock');
  const lock = await open(lockPath, 'wx');
  try {
    await lock.writeFile(json({ pid: process.pid, started: new Date().toISOString() }));
    await assertNoLayoutMigration(directory);
    const manifestPath = join(directory, 'manifest.json');
    const existing = await exists(manifestPath) ? await boundedRead(manifestPath) : null;
    const storedLayout = existing ? manifestLayout(JSON.parse(existing)) : null;
    if (storedLayout && layout !== undefined && layout !== storedLayout) throw new Error('Database configuration mismatch');
    layout = storedLayout ?? layout ?? defaultLayout(config);
    const manifest = databaseManifest(config, layout);
    if (existing) {
      if (existing.toString() !== json(manifest).toString()) throw new Error('Database configuration mismatch');
    } else await atomicJson(manifestPath, manifest);
    const checkpointPath = join(directory, 'checkpoint.json');
    let nextIndex = 0;
    if (await exists(checkpointPath)) {
      const checkpoint = JSON.parse(await boundedRead(checkpointPath));
      if (checkpoint.version !== 1 || checkpoint.manifestSha256 !== digest(json(manifest)) ||
          !Number.isSafeInteger(checkpoint.nextIndex) || checkpoint.nextIndex < 0 || typeof checkpoint.complete !== 'boolean') {
        throw new Error('Invalid checkpoint');
      }
      nextIndex = checkpoint.nextIndex;
    }
    let count = 0;
    for (const descriptor of planPositionTiles(config)) {
      signal?.throwIfAborted();
      count++;
      const folder = tileDirectory(directory, descriptor.index, layout);
      if (descriptor.index < nextIndex && !await exists(folder)) throw new Error('Checkpoint tile missing');
      if (await exists(folder)) {
        await verifyStoredTile(directory, descriptor, config, layout);
      } else {
        await mkdir(dirname(folder), { recursive: true });
        const staging = join(dirname(folder), '.tile.tmp');
        await rm(staging, { recursive: true, force: true });
        await mkdir(staging);
        const tileConfig = { ...config, startMs: descriptor.startMs, endMs: descriptor.endMs };
        const positions = (await generatePositionTiles(tileConfig).next()).value.bytes;
        const events = (await generateEventTiles(tileConfig).next()).value.events;
        const eventRaw = json({ version: 1, descriptor, events });
        if (eventRaw.length > STORE_LIMIT) throw new Error('Event tile exceeds capacity; shorten tile duration');
        const eventBytes = gzipSync(eventRaw, { level: 9, mtime: 0 });
        const files = {};
        for (const [filename, bytes] of [['positions.sky', positions], ['events.json.gz', eventBytes]]) {
          await write(join(staging, filename), bytes);
          files[filename] = { bytes: bytes.length, sha256: digest(bytes) };
        }
        await write(join(staging, 'receipt.json'), json({ version: 1, descriptor, files }));
        signal?.throwIfAborted();
        await rename(staging, folder);
        await onProgress({ phase: 'published', descriptor, tileDirectory: folder });
      }
      if (descriptor.index >= nextIndex) {
        nextIndex = descriptor.index + 1;
        await atomicJson(checkpointPath, { version: 1, manifestSha256: digest(json(manifest)), nextIndex, complete: false });
        await onProgress({ phase: 'checkpoint', descriptor, tileDirectory: folder });
      }
    }
    if (nextIndex !== count) throw new Error('Checkpoint exceeds planned tiles');
    await atomicJson(checkpointPath, { version: 1, manifestSha256: digest(json(manifest)), nextIndex, complete: true });
    return { directory, tileCount: count };
  } finally {
    await lock.close();
    await rm(lockPath, { force: true });
  }
}
