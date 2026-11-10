import test from 'node:test';
import assert from 'node:assert/strict';
import { access, cp, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createConfig } from '../src/config.mjs';
import { planPositionTiles } from '../src/generate.mjs';
import { SHARD_SIZE, tileDirectory } from '../src/layout.mjs';
import { migrateDatabaseLayout } from '../src/migrate-layout.mjs';
import { openDatabase } from '../src/query.mjs';
import { generateDatabase, verifyStoredTile } from '../src/store.mjs';
import { verifyDatabase } from '../src/verify.mjs';

const startMs = Date.parse('2001-01-01T00:00:00Z');
const config = createConfig({ startMs, endMs: startMs + 3, stepMs: 1, tileMs: 1, bodies: ['Sun'] });
const script = fileURLToPath(new URL('../scripts/migrate-layout.mjs', import.meta.url));
async function temporary(t) {
  const directory = await mkdtemp(join(tmpdir(), 'skydb-migration-'));
  t.after(async () => {
    await rm(directory, { recursive: true, force: true });
    await rm(join(dirname(directory), `.${basename(directory)}.layout.tmp`), { recursive: true, force: true });
  });
  return directory;
}
async function tiles(directory, layout) {
  const result = {};
  for (const descriptor of planPositionTiles(config)) {
    const folder = tileDirectory(directory, descriptor.index, layout);
    try {
      for (const name of await readdir(folder)) result[`${descriptor.index}/${name}`] = await readFile(join(folder, name));
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return result;
}
async function collect(iterator) {
  const result = [];
  for await (const item of iterator) result.push(item);
  return result;
}

test('migration preserves tile bytes, timestamps, complete checkpoints and query results', async t => {
  const directory = await temporary(t);
  await generateDatabase(directory, config, { layout: 'flat' });
  const original = await tiles(directory, 'flat'), before = await openDatabase(directory);
  const position = await before.positions(startMs + 1), events = await collect(before.events(startMs, config.endMs));
  const mtime = (await stat(join(tileDirectory(directory, 0), 'positions.sky'))).mtimeMs;
  const report = await migrateDatabaseLayout(directory);
  assert.equal(report.migrated, true);
  assert.equal(report.plannedTiles, 3);
  assert.equal(report.verifiedTiles, 3);
  assert.equal(report.movedTiles, 3);
  assert.equal(report.initialCheckpoint.nextIndex, report.finalCheckpoint.nextIndex);
  assert.equal(report.finalCheckpoint.complete, true);
  assert.notEqual(report.originalManifestSha256, report.manifestSha256);
  assert.deepEqual(await tiles(directory, 'sharded'), original);
  assert.equal((await stat(join(tileDirectory(directory, 0, 'sharded'), 'positions.sky'))).mtimeMs, mtime);
  await assert.rejects(access(join(directory, '.layout-migration.json')), { code: 'ENOENT' });
  await assert.rejects(access(join(directory, '.lock')), { code: 'ENOENT' });
  const after = await openDatabase(directory);
  assert.deepEqual(await after.positions(startMs + 1), position);
  assert.deepEqual(await collect(after.events(startMs, config.endMs)), events);
  assert.equal((await verifyDatabase(directory)).tiles, 3);
  await generateDatabase(directory, config);
  assert.deepEqual(await tiles(directory, 'sharded'), original);
  assert.equal((await migrateDatabaseLayout(directory)).migrated, false);
});

test('every migration cut resumes while marker blocks generation, queries and default tile reads', async t => {
  for (const phase of ['journal-created', 'staging-created', 'tile-staged', 'shard-published', 'tile-moved',
    'tile-verified', 'manifest-updated', 'checkpoint-updated', 'staging-removed']) {
    const directory = await temporary(t);
    await generateDatabase(directory, config, { layout: 'flat' });
    const original = await tiles(directory, 'flat');
    await assert.rejects(migrateDatabaseLayout(directory, { onProgress: event => {
      if (event.phase === phase) throw new Error(`interrupted ${phase}`);
    } }), /interrupted/);
    await assert.rejects(access(join(directory, '.lock')), { code: 'ENOENT' });
    await assert.rejects(generateDatabase(directory, config), /migration/);
    await assert.rejects(openDatabase(directory), /migration/);
    await assert.rejects(verifyStoredTile(directory, planPositionTiles(config).next().value, config), /migration/);
    const report = await migrateDatabaseLayout(directory);
    assert.equal(report.finalCheckpoint.complete, true);
    assert.deepEqual(await tiles(directory, 'sharded'), original);
    assert.equal((await verifyDatabase(directory)).tiles, 3);
  }
});

test('published but uncheckpointed tiles survive migration and resume generation unchanged', async t => {
  const directory = await temporary(t), baseline = await temporary(t);
  await generateDatabase(baseline, config, { layout: 'sharded' });
  await assert.rejects(generateDatabase(directory, config, { layout: 'flat', onProgress: event => {
    if (event.phase === 'published' && event.descriptor.index === 1) throw new Error('publication interruption');
  } }), /interruption/);
  const report = await migrateDatabaseLayout(directory);
  assert.equal(report.verifiedTiles, 2);
  assert.equal(report.initialCheckpoint.nextIndex, 1);
  assert.equal(report.finalCheckpoint.nextIndex, 1);
  assert.equal(report.finalCheckpoint.complete, false);
  await generateDatabase(directory, config);
  assert.deepEqual(await tiles(directory, 'sharded'), await tiles(baseline, 'sharded'));
});

test('migration crosses a shard boundary and stages its first tile before adding a root child', async t => {
  const directory = await temporary(t);
  const wide = createConfig({ ...config, endMs: startMs + SHARD_SIZE + 1 });
  await generateDatabase(directory, wide, { layout: 'flat' });
  const firstShard = dirname(tileDirectory(directory, 0, 'sharded'));
  const preserved = await readFile(join(tileDirectory(directory, SHARD_SIZE), 'positions.sky'));
  let observedStaging = false;
  const report = await migrateDatabaseLayout(directory, { onProgress: async event => {
    if (event.phase === 'tile-staged' && event.descriptor.index === 0) {
      observedStaging = true;
      await assert.rejects(access(firstShard), { code: 'ENOENT' });
      await assert.rejects(access(tileDirectory(directory, 0)), { code: 'ENOENT' });
      const staged = join(dirname(directory), `.${basename(directory)}.layout.tmp`);
      await access(tileDirectory(staged, 0, 'sharded'));
    }
  } });
  assert.equal(observedStaging, true);
  assert.equal(report.verifiedTiles, SHARD_SIZE + 1);
  assert.equal((await readdir(firstShard)).length, SHARD_SIZE);
  assert.equal((await readdir(dirname(tileDirectory(directory, SHARD_SIZE, 'sharded')))).length, 1);
  assert.deepEqual(await readFile(join(tileDirectory(directory, SHARD_SIZE, 'sharded'), 'positions.sky')), preserved);
  assert.equal((await verifyDatabase(directory)).tiles, SHARD_SIZE + 1);
});

test('a first uncheckpointed tile and cancellation retain resumable migration state', async t => {
  const directory = await temporary(t);
  await assert.rejects(generateDatabase(directory, config, { layout: 'flat', onProgress: event => {
    if (event.phase === 'published') throw new Error('publication interruption');
  } }), /interruption/);
  const controller = new AbortController();
  await assert.rejects(migrateDatabaseLayout(directory, { signal: controller.signal, onProgress: event => {
    if (event.phase === 'tile-staged') controller.abort();
  } }), { name: 'AbortError' });
  const report = await migrateDatabaseLayout(directory);
  assert.equal(report.initialCheckpoint, null);
  assert.equal(report.finalCheckpoint.nextIndex, 0);
  await generateDatabase(directory, config);
  assert.equal((await verifyDatabase(directory)).tiles, 3);
});

test('migration refuses locks, unowned staging, missing, corrupt and conflicting tile locations', async t => {
  for (const failure of ['lock', 'staging', 'missing', 'corrupt', 'duplicate']) {
    const directory = await temporary(t);
    await generateDatabase(directory, config, { layout: 'flat' });
    const source = tileDirectory(directory, 0), target = tileDirectory(directory, 0, 'sharded');
    if (failure === 'lock') await writeFile(join(directory, '.lock'), 'live writer');
    if (failure === 'staging') await mkdir(join(dirname(directory), `.${basename(directory)}.layout.tmp`));
    if (failure === 'missing') await rm(source, { recursive: true });
    if (failure === 'corrupt') await writeFile(join(source, 'positions.sky'), 'corrupt');
    if (failure === 'duplicate') { await mkdir(dirname(target)); await cp(source, target, { recursive: true }); }
    await assert.rejects(migrateDatabaseLayout(directory), /EEXIST|staging|missing|checksum|Conflicting/);
    if (failure === 'lock') assert.equal(await readFile(join(directory, '.lock'), 'utf8'), 'live writer');
    if (failure === 'corrupt') assert.equal(await readFile(join(source, 'positions.sky'), 'utf8'), 'corrupt');
  }
});

test('invalid journals and metadata conflicts leave the migration blocked without replacing metadata', async t => {
  for (const failure of ['journal', 'manifest', 'checkpoint']) {
    const directory = await temporary(t);
    await generateDatabase(directory, config, { layout: 'flat' });
    await assert.rejects(migrateDatabaseLayout(directory, { onProgress: event => {
      if (event.phase === 'journal-created') throw new Error('interruption');
    } }), /interruption/);
    const path = join(directory, failure === 'journal' ? '.layout-migration.json' : `${failure}.json`);
    const changed = JSON.parse(await readFile(path));
    if (failure === 'journal') changed.directory += '-other';
    if (failure === 'manifest') changed.engineSha256 = '0'.repeat(64);
    if (failure === 'checkpoint') changed.nextIndex = 0;
    const bytes = Buffer.from(JSON.stringify(changed) + '\n');
    await writeFile(path, bytes);
    await assert.rejects(migrateDatabaseLayout(directory), /journal/);
    assert.deepEqual(await readFile(path), bytes);
    await access(join(directory, '.layout-migration.json'));
    await assert.rejects(openDatabase(directory), /migration/);
  }
});

test('manifest encoding and invalid checkpoints fail before creating a migration journal', async t => {
  for (const failure of ['encoding', 'checkpoint']) {
    const directory = await temporary(t);
    await generateDatabase(directory, config, { layout: 'flat' });
    const path = join(directory, failure === 'encoding' ? 'manifest.json' : 'checkpoint.json');
    const original = await readFile(path);
    if (failure === 'encoding') await writeFile(path, ` ${original}`);
    else {
      const checkpoint = JSON.parse(original);
      checkpoint.nextIndex++;
      await writeFile(path, JSON.stringify(checkpoint) + '\n');
    }
    const changed = await readFile(path);
    await assert.rejects(migrateDatabaseLayout(directory), /manifest|checkpoint/);
    assert.deepEqual(await readFile(path), changed);
    await assert.rejects(access(join(directory, '.layout-migration.json')), { code: 'ENOENT' });
    await assert.rejects(access(join(directory, '.lock')), { code: 'ENOENT' });
  }
});

test('CLI rejects missing, duplicate, unknown and outside-generated arguments before filesystem writes', () => {
  for (const args of [[], ['--directory'], ['--directory', 'skydb/generated'], ['--directory', 'skydb/samples'],
    ['--directory', 'skydb/generated/x', '--directory', 'skydb/generated/y'], ['--unknown', 'skydb/generated/x']]) {
    const result = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Usage|child/);
    assert.equal(result.stdout, '');
  }
});
