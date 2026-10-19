import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createConfig } from '../src/config.mjs';
import { loadEngine } from '../src/engine.mjs';
import { planPositionTiles, TIME_BOUNDARIES } from '../src/generate.mjs';
import { databaseManifest, defaultLayout, manifestLayout, SHARD_SIZE, tileDirectory } from '../src/layout.mjs';
import { openDatabase } from '../src/query.mjs';
import { generateDatabase, verifyStoredTile } from '../src/store.mjs';
import { verifyDatabase } from '../src/verify.mjs';

const generated = fileURLToPath(new URL('../generated/', import.meta.url));
const startMs = Date.parse('2001-01-01T00:00:00Z');
const tinyConfig = count => createConfig({ startMs, endMs: startMs + count, stepMs: 1, tileMs: 1, bodies: ['Sun'] });
async function temporary(t) {
  await mkdir(generated, { recursive: true });
  const directory = await mkdtemp(join(generated, 'layout-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}
async function snapshot(directory) {
  const result = {};
  for (const filename of (await readdir(directory, { recursive: true })).sort()) {
    if (/\.(json|sky|gz)$/.test(filename)) result[filename] = await readFile(join(directory, filename));
  }
  return result;
}
async function collect(iterator) {
  const result = [];
  for await (const item of iterator) result.push(item);
  return result;
}

test('layout paths are bounded by shard size and reject unsafe indices or unknown layouts', () => {
  assert.equal(SHARD_SIZE, 1024);
  assert.equal(tileDirectory(generated, 0), join(generated, 'tile-00000000'));
  assert.equal(tileDirectory(generated, 1023, 'flat'), join(generated, 'tile-00001023'));
  for (const [index, shard] of [[0, 0], [1023, 0], [1024, 1], [2048, 2]]) {
    assert.equal(tileDirectory(generated, index, 'sharded'),
      join(generated, `shard-${String(shard).padStart(8, '0')}`, `tile-${String(index).padStart(8, '0')}`));
  }
  for (const index of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '0', null, undefined, {}]) {
    assert.throws(() => tileDirectory(generated, index, 'flat'), /tile index/);
    assert.throws(() => tileDirectory(generated, index, 'sharded'), /tile index/);
  }
  for (const layout of ['', 'shard', '../escape', null, 0, {}]) {
    assert.throws(() => tileDirectory(generated, 0, layout), /layout/);
    assert.throws(() => databaseManifest(tinyConfig(1), layout), /layout/);
  }
});

test('automatic layout counts split descriptors and preserves the version-one small manifest', () => {
  assert.equal(defaultLayout(tinyConfig(1024)), 'flat');
  assert.equal(defaultLayout(tinyConfig(1025)), 'sharded');
  const split = createConfig({ startMs: TIME_BOUNDARIES[0] - 1, endMs: TIME_BOUNDARIES[0] + 2047,
    stepMs: 1, tileMs: 2, bodies: ['Sun'] });
  assert.equal([...planPositionTiles(split)].length, 1025);
  assert.equal(defaultLayout(split), 'sharded');
  const flat = databaseManifest(tinyConfig(1), 'flat');
  const sharded = databaseManifest(tinyConfig(1), 'sharded');
  assert.equal(flat.version, 1);
  assert.equal(flat.tiles, 'tile-NNNNNNNN/receipt.json');
  assert.equal(sharded.version, 2);
  assert.equal(sharded.tiles, 'shard-NNNNNNNN/tile-NNNNNNNN/receipt.json');
  assert.equal(manifestLayout(flat), 'flat');
  assert.equal(manifestLayout(sharded), 'sharded');
  assert.equal(sharded.positionFormat, flat.positionFormat);
  assert.equal(sharded.eventFormat, flat.eventFormat);
});

test('automatic sharding crosses its first boundary, resumes unchanged and serves both shards', async t => {
  const directory = await temporary(t), config = tinyConfig(1025);
  const progress = { published: 0, checkpoint: 0 };
  const result = await generateDatabase(directory, config, { onProgress: event => {
    assert.ok(isAbsolute(event.tileDirectory));
    assert.equal(event.tileDirectory, tileDirectory(directory, event.descriptor.index, 'sharded'));
    progress[event.phase]++;
  } });
  assert.equal(result.tileCount, 1025);
  assert.deepEqual(progress, { published: 1025, checkpoint: 1025 });
  const manifest = JSON.parse(await readFile(join(directory, 'manifest.json')));
  assert.deepEqual(manifest, databaseManifest(config, 'sharded'));
  const roots = (await readdir(directory, { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
  assert.deepEqual(roots, ['shard-00000000', 'shard-00000001']);
  assert.equal((await readdir(join(directory, roots[0]))).length, SHARD_SIZE);
  assert.equal((await readdir(join(directory, roots[1]))).length, 1);
  for (const root of roots) assert.ok((await readdir(join(directory, root))).length <= SHARD_SIZE);
  const checkpoint = JSON.parse(await readFile(join(directory, 'checkpoint.json')));
  assert.equal(checkpoint.nextIndex, 1025);
  assert.equal(checkpoint.complete, true);

  const descriptors = [...planPositionTiles(config)];
  const preserved = new Map();
  for (const index of [0, 1023, 1024]) {
    const filename = join(tileDirectory(directory, index, 'sharded'), 'positions.sky');
    preserved.set(filename, { bytes: await readFile(filename), mtimeMs: (await stat(filename)).mtimeMs });
  }
  await generateDatabase(directory, config, { onProgress: () => assert.fail('completed resume must skip publication and checkpoint progress') });
  for (const [filename, original] of preserved) {
    assert.deepEqual(await readFile(filename), original.bytes);
    assert.equal((await stat(filename)).mtimeMs, original.mtimeMs);
  }
  const database = await openDatabase(directory, { cacheTiles: 1 }), engine = await loadEngine();
  for (const index of [0, 1023, 1024]) {
    const descriptor = descriptors[index];
    const automatic = await verifyStoredTile(directory, descriptor, config);
    assert.deepEqual(automatic, await verifyStoredTile(directory, descriptor, config, 'sharded'));
    assert.deepEqual((await database.positions(descriptor.startMs)).rows, engine.sample(descriptor.startMs, config));
  }
  assert.deepEqual(await collect(database.events(startMs + 1023, config.endMs)), []);
  assert.deepEqual(database.cacheInfo(), { size: 1, capacity: 1, indices: [1024] });
  const verified = await verifyDatabase(directory);
  assert.equal(verified.tiles, 1025);
  assert.equal(verified.samples, 2050);
  assert.equal(verified.events, 0);
});

test('explicit small sharded stores recover both publication phases and stale shard staging', async t => {
  const config = tinyConfig(3), baseline = await temporary(t);
  await generateDatabase(baseline, config, { layout: 'sharded' });
  for (const phase of ['published', 'checkpoint']) {
    const directory = await temporary(t);
    await assert.rejects(generateDatabase(directory, config, { layout: 'sharded', onProgress: event => {
      if (event.phase === phase) throw new Error('simulated interruption');
    } }), /interruption/);
    const staging = join(dirname(tileDirectory(directory, 1, 'sharded')), '.tile.tmp');
    await mkdir(staging, { recursive: true });
    await writeFile(join(staging, 'partial'), 'unfinished');
    await generateDatabase(directory, config);
    await assert.rejects(stat(staging), { code: 'ENOENT' });
    assert.deepEqual(await snapshot(directory), await snapshot(baseline));
    assert.equal((await verifyDatabase(directory)).tiles, 3);
    await assert.rejects(generateDatabase(directory, config, { layout: 'flat' }), /configuration mismatch/);
    assert.deepEqual(await snapshot(directory), await snapshot(baseline));
  }
});

test('sharded corruption and checkpoint-owned missing tiles fail without replacing data', async t => {
  for (const failure of ['checksum', 'missing']) {
    const directory = await temporary(t), config = tinyConfig(3);
    await generateDatabase(directory, config, { layout: 'sharded' });
    const folder = tileDirectory(directory, 0, 'sharded');
    if (failure === 'checksum') await writeFile(join(folder, 'positions.sky'), 'corrupt');
    else await rm(folder, { recursive: true });
    const damaged = await snapshot(directory);
    const database = await openDatabase(directory);
    await assert.rejects(database.positions(startMs), /checksum|ENOENT/);
    await assert.rejects(collect(database.events(startMs, config.endMs)), /checksum|ENOENT/);
    await assert.rejects(verifyDatabase(directory), /checksum|ENOENT/);
    await assert.rejects(generateDatabase(directory, config), /checksum|missing/);
    assert.deepEqual(await snapshot(directory), damaged);
  }
});

test('manifest layout and version mismatches reject reads and resume without rewriting files', async t => {
  const directory = await temporary(t), config = tinyConfig(1);
  await generateDatabase(directory, config, { layout: 'sharded' });
  const manifestPath = join(directory, 'manifest.json'), bytes = await readFile(manifestPath);
  const original = JSON.parse(bytes);
  for (const patch of [{ version: 1 }, { tiles: 'tile-NNNNNNNN/receipt.json' },
    { tiles: '../tile-NNNNNNNN/receipt.json' }, { version: 3 }, { positionFormat: 2 }, { eventFormat: 2 }]) {
    await writeFile(manifestPath, JSON.stringify({ ...original, ...patch }) + '\n');
    const mismatched = await snapshot(directory);
    await assert.rejects(openDatabase(directory), /manifest/);
    await assert.rejects(verifyDatabase(directory), /manifest/);
    await assert.rejects(generateDatabase(directory, config), /manifest|configuration mismatch/);
    assert.deepEqual(await snapshot(directory), mismatched);
  }
  await writeFile(manifestPath, bytes);
  assert.equal((await verifyDatabase(directory)).tiles, 1);
});

test('invalid requested layouts fail before creating the database directory', async t => {
  const directory = await temporary(t);
  for (const [index, layout] of ['', 'shard', '../escape', null, 0, {}].entries()) {
    const target = join(directory, `invalid-${index}`);
    await assert.rejects(generateDatabase(target, tinyConfig(1), { layout }), /layout/);
    await assert.rejects(stat(target), { code: 'ENOENT' });
  }
});
