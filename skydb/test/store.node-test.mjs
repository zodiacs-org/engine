import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, readFile, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateDatabase, verifyStoredTile } from '../src/store.mjs';
import { planPositionTiles, generatePositionTiles } from '../src/generate.mjs';
import { generateEventTiles } from '../src/events.mjs';
const startMs = Date.parse('2001-01-01Z');
const config = { startMs, endMs: startMs + 10_800_000, stepMs: 3_600_000, tileMs: 3_600_000, bodies: ['Sun', 'Moon'] };
async function temporary(t) {
  const path = await mkdtemp(join(tmpdir(), 'skydb-store-'));
  t.after(() => rm(path, { recursive: true, force: true }));
  return path;
}
async function snapshot(path) {
  const result = {};
  for (const file of (await readdir(path, { recursive: true })).sort()) {
    if (file.endsWith('.json') || file.endsWith('.sky') || file.endsWith('.gz')) result[file] = await readFile(join(path, file));
  }
  return result;
}
test('published tile recovery and checkpoint recovery equal uninterrupted generation', async t => {
  const baseline = await temporary(t);
  await generateDatabase(baseline, config);
  for (const phase of ['published', 'checkpoint']) {
    const path = await temporary(t);
    await assert.rejects(generateDatabase(path, config, { onProgress: event => {
      if (event.phase === phase) throw new Error('simulated interruption');
    } }), /interruption/);
    await generateDatabase(path, config);
    assert.deepEqual(await snapshot(path), await snapshot(baseline));
    await generateDatabase(path, config);
    assert.deepEqual(await snapshot(path), await snapshot(baseline));
  }
  const positions = generatePositionTiles(config), events = generateEventTiles(config);
  for (const descriptor of planPositionTiles(config)) {
    const stored = await verifyStoredTile(baseline, descriptor);
    assert.deepEqual(await readFile(join(baseline, `tile-${String(descriptor.index).padStart(8,'0')}`, 'positions.sky')),
      (await positions.next()).value.bytes);
    assert.deepEqual(stored.events, (await events.next()).value.events);
  }
});
test('exclusive lock, abort, stale staging and configuration mismatch', async t => {
  const path = await temporary(t);
  await writeFile(join(path, '.lock'), 'stale lock');
  await assert.rejects(generateDatabase(path, config), { code: 'EEXIST' });
  assert.equal(await readFile(join(path, '.lock'), 'utf8'), 'stale lock');
  await rm(join(path, '.lock'));
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(generateDatabase(path, config, { signal: controller.signal }), { name: 'AbortError' });
  await mkdir(join(path, '.tile.tmp'));
  await writeFile(join(path, '.tile.tmp', 'partial'), 'unfinished');
  await generateDatabase(path, config);
  await assert.rejects(readFile(join(path, '.tile.tmp', 'partial')), { code: 'ENOENT' });
  await assert.rejects(generateDatabase(path, { ...config, bodies: ['Sun'] }), /configuration mismatch/);

});
test('rejects corrupt, missing and invalid checkpoint data without overwriting tiles', async t => {
  for (const failure of ['checksum', 'missing', 'checkpoint']) {
    const path = await temporary(t);
    await generateDatabase(path, config);
    const file = join(path, 'tile-00000000', 'positions.sky');
    if (failure === 'checksum') await writeFile(file, Buffer.from('corrupt'));
    if (failure === 'missing') await rm(join(path, 'tile-00000000'), { recursive: true });
    if (failure === 'checkpoint') await writeFile(join(path, 'checkpoint.json'), '{}');
    await assert.rejects(generateDatabase(path, config), /checksum|missing|checkpoint/);
  }
});
test('concurrent generation is rejected while progress callback holds the lock', async t => {
  const path = await temporary(t);
  await generateDatabase(path, config, { onProgress: async () => {
    await assert.rejects(generateDatabase(path, config), { code: 'EEXIST' });
  } });
});
