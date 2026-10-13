import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase, descriptorAt, interpolatePositions } from '../src/query.mjs';
import { generateDatabase, verifyStoredTile } from '../src/store.mjs';
import { planPositionTiles, TIME_BOUNDARIES } from '../src/generate.mjs';
import { createConfig, COVERAGE } from '../src/config.mjs';
import { loadEngine } from '../src/engine.mjs';
const hour = 3_600_000, startMs = Date.parse('2001-01-01Z');
async function temporary(t) {
  const directory = await mkdtemp(join(tmpdir(), 'skydb-query-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}
async function collect(iterator) { const result = []; for await (const item of iterator) result.push(item); return result; }

test('constant-space descriptor lookup agrees with lazy planner across full coverage and seams', () => {
  for (const input of [ {}, { tileMs: 31 * 86_400_000, stepMs: hour },
    ...TIME_BOUNDARIES.map(at => ({ startMs: at - hour, endMs: at + hour, tileMs: hour * 2, stepMs: hour })),
    { startMs: COVERAGE.endMs - hour, endMs: COVERAGE.endMs, tileMs: hour, stepMs: hour } ]) {
    const config = createConfig(input);
    for (const descriptor of planPositionTiles(config)) {
      assert.deepEqual(descriptorAt(config, descriptor.startMs), descriptor);
      assert.deepEqual(descriptorAt(config, descriptor.endMs - 1), descriptor);
    }
  }
});

test('circular interpolation forward, retrograde, exact samples, single sample and ambiguity', () => {
  const row = (lon, lat, speed) => ({ body: 'Sun', lon, lat, speed });
  const tile = { metadata: { startMs, endMs: startMs + 101 }, samples: [
    { atMs: startMs, rows: [row(359, -2, 2)] }, { atMs: startMs + 100, rows: [row(1, 2, 4)] } ] };
  assert.deepEqual(interpolatePositions(tile, startMs + 50), [row(0, 0, 3)]);
  tile.samples[0].rows[0].lon = 1; tile.samples[1].rows[0].lon = 359;
  assert.equal(interpolatePositions(tile, startMs + 50)[0].lon, 0);
  const exact = interpolatePositions(tile, startMs); exact[0].lon = 88;
  assert.equal(tile.samples[0].rows[0].lon, 1);
  tile.samples[1].rows[0].lon = 181;
  assert.throws(() => interpolatePositions(tile, startMs + 50), /Ambiguous/);
  assert.throws(() => interpolatePositions(tile, startMs + 101), /support/);
  tile.samples.pop(); tile.metadata.endMs = startMs + 1;
  assert.deepEqual(interpolatePositions(tile, startMs), tile.samples[0].rows);
});

test('stored exact and interpolated positions, half-open boundaries and concurrent LRU bound', async t => {
  const directory = await temporary(t);
  const config = { startMs, endMs: startMs + 3 * hour, tileMs: hour, stepMs: hour, bodies: ['Sun', 'Moon'] };
  await generateDatabase(directory, config);
  const db = await openDatabase(directory, { cacheTiles: 1 });
  const engine = await loadEngine();
  for (const atMs of [startMs, startMs + hour, config.endMs - 1]) {
    const result = await db.positions(atMs);
    if (atMs !== config.endMs - 1) assert.deepEqual(result.rows, engine.sample(atMs, config));
  }
  const descriptor = descriptorAt(config, startMs);
  const tile = (await verifyStoredTile(directory, descriptor)).positions;
  const middle = await db.positions(startMs + hour / 2);
  assert.deepEqual(middle.rows, interpolatePositions(tile, middle.atMs));
  const direct = engine.sample(middle.atMs, config);
  // Consumer agreement for this midpoint only, not an accuracy or coverage bound.
  for (let i = 0; i < direct.length; i++) {
    assert.ok(Math.abs(middle.rows[i].lon - direct[i].lon) < 0.001);
    assert.ok(Math.abs(middle.rows[i].lat - direct[i].lat) < 0.001);
    assert.ok(Math.abs(middle.rows[i].speed - direct[i].speed) < 0.001);
  }
  await Promise.all([0, 1, 2, 0].map(i => db.positions(startMs + i * hour)));
  assert.deepEqual(db.cacheInfo(), { size: 1, capacity: 1, indices: [0] });
  await assert.rejects(db.positions(config.endMs), /coverage/);
  await assert.rejects(db.positions(startMs + 0.5), /coverage/);
  middle.rows[0].lon = 99;
  assert.notEqual((await db.positions(middle.atMs)).rows[0].lon, 99);
});

test('clock seams and global coverage endpoints return separate direct samples', async t => {
  const engine = await loadEngine();
  for (const at of [TIME_BOUNDARIES[0], TIME_BOUNDARIES[1], TIME_BOUNDARIES.at(-2), TIME_BOUNDARIES.at(-1), COVERAGE.startMs, COVERAGE.endMs - 1]) {
    const directory = await temporary(t);
    const config = { startMs: Math.max(COVERAGE.startMs, at - 1),
      endMs: Math.min(COVERAGE.endMs, at + 2), tileMs: hour, stepMs: hour, bodies: ['Moon'] };
    await generateDatabase(directory, config);
    const db = await openDatabase(directory);
    for (let instant = config.startMs; instant < config.endMs; instant++) {
      const descriptor = descriptorAt(config, instant);
      if (instant === descriptor.startMs || instant === descriptor.lastSampleMs) {
        assert.deepEqual((await db.positions(instant)).rows, engine.sample(instant, config));
      }
    }
  }
});

test('event queries stream sorted records with range, kind and body filters, independent results', async t => {
  const directory = await temporary(t);
  const config = { startMs, endMs: startMs + 4 * 86_400_000, tileMs: 86_400_000, stepMs: hour, bodies: ['Sun', 'Moon'] };
  await generateDatabase(directory, config);
  const db = await openDatabase(directory, { cacheTiles: 1 });
  const expected = [];
  for (const descriptor of planPositionTiles(config)) expected.push(...(await verifyStoredTile(directory, descriptor)).events);
  assert.ok(expected.length > 0);
  assert.deepEqual(await collect(db.events(config.startMs, config.endMs)), expected);
  const event = expected[0];
  const selected = await collect(db.events(event.atMs, event.atMs + 1, { kind: event.kind, body: 'Moon' }));
  assert.deepEqual(selected, expected.filter(item => item.atMs === event.atMs && item.kind === event.kind && item.bodies.includes('Moon')));
  assert.deepEqual(await collect(db.events(config.startMs, event.atMs)), []);
  selected[0].bodies[0] = 'mutated';
  assert.deepEqual(await collect(db.events(config.startMs, config.endMs)), expected);
  await assert.rejects(collect(db.events(startMs, config.endMs, { kind: 'typo' })), /Invalid/);
  await assert.rejects(collect(db.events(startMs, config.endMs, { body: 'Pluto' })), /Invalid/);
});

test('invalid manifests, incomplete checkpoints, bad options and missing or corrupt tiles reject', async t => {
  const directory = await temporary(t);
  const config = { startMs, endMs: startMs + hour, tileMs: hour, stepMs: hour, bodies: ['Sun'] };
  await generateDatabase(directory, config);
  for (const options of [{ cacheTiles: 0 }, { cacheTiles: 65 }, { typo: true }]) await assert.rejects(openDatabase(directory, options), /Invalid/);
  const checkpointPath = join(directory, 'checkpoint.json'), original = await readFile(checkpointPath);
  const checkpoint = JSON.parse(original); checkpoint.complete = false;
  await writeFile(checkpointPath, JSON.stringify(checkpoint));
  await assert.rejects(openDatabase(directory), /checkpoint/);
  await writeFile(checkpointPath, original);
  const manifestPath = join(directory, 'manifest.json'), manifestBytes = await readFile(manifestPath);
  const manifest = JSON.parse(manifestBytes); manifest.engineSha256 = 'bad';
  await writeFile(manifestPath, JSON.stringify(manifest));
  await assert.rejects(openDatabase(directory), /manifest/);
  await writeFile(manifestPath, manifestBytes);
  const file = join(directory, 'tile-00000000', 'positions.sky'), bytes = await readFile(file);
  const db = await openDatabase(directory);
  await writeFile(file, 'bad');
  await assert.rejects(db.positions(startMs), /checksum/);
  await writeFile(file, bytes);
  await db.positions(startMs); // Failed loads can retry.
  const fresh = await openDatabase(directory);
  await rm(file);
  await assert.rejects(fresh.positions(startMs), { code: 'ENOENT' });
});
