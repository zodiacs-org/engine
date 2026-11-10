import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile, mkdtemp, rm, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArguments, runCli } from '../src/cli.mjs';
import { generateDatabase, verifyStoredTile } from '../src/store.mjs';
import { planPositionTiles } from '../src/generate.mjs';
import { loadEngine } from '../src/engine.mjs';
import { verifyDatabase } from '../src/verify.mjs';
const sample = fileURLToPath(new URL('../samples/database/', import.meta.url));
const config = JSON.parse(await readFile(new URL('../samples/config.json', import.meta.url), 'utf8'));

test('strict arguments reject guessing, unknown options and missing values', () => {
  for (const args of [[], ['help'], ['verify'], ['verify', '--directory', 'x', '--directory', 'y'],
    ['verify', '--directory'], ['verify', '--directory', 'x', '--extra', 'x'],
    ['positions', '--directory', 'x', '--at', '1e3'], ['positions', '--directory', 'x', '--at', '1.5'],
    ['positions', '--directory', 'x', '--at', '9007199254740992']]) assert.throws(() => parseArguments(args));
  assert.equal(parseArguments(['positions', '--directory', 'x', '--at', '-1']).options.at, -1);
});
test('sample exactly reproduces persisted bytes and agrees with direct engine samples', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'skydb-sample-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await generateDatabase(directory, config);
  for (const filename of await readdir(sample, { recursive: true })) {
    if (!/\.(json|sky|gz)$/.test(filename)) continue;
    assert.deepEqual(await readFile(join(directory, filename)), await readFile(join(sample, filename)), filename);
  }
  const engine = await loadEngine();
  for (const descriptor of planPositionTiles(config)) {
    const tile = await verifyStoredTile(sample, descriptor);
    for (const record of tile.positions.samples) assert.deepEqual(record.rows, engine.sample(record.atMs, { bodies: config.bodies }));
  }
  const report = await verifyDatabase(sample);
  assert.equal(report.tiles, 2);
  assert.equal(report.samples, 50);
  assert.ok(report.events > 0);
});
test('CLI end-to-end generation, resume, verification, queries and corrupt tile failure', async t => {
  const directory = fileURLToPath(new URL(`../generated/cli-test-${process.pid}/`, import.meta.url));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const configPath = fileURLToPath(new URL('../samples/config.json', import.meta.url));
  const output = [];
  const emit = value => output.push(value);
  await runCli(['generate', '--directory', directory, '--config', configPath], emit);
  await runCli(['generate', '--directory', directory, '--config', configPath], emit);
  await runCli(['verify', '--directory', directory], emit);
  assert.equal(output.at(-1).tiles, 2);
  await runCli(['positions', '--directory', directory, '--at', String(config.startMs)], emit);
  assert.deepEqual(output.at(-1).rows, (await loadEngine()).sample(config.startMs, config));
  const before = output.length;
  await runCli(['events', '--directory', directory, '--start', String(config.startMs), '--end', String(config.endMs)], emit);
  assert.ok(output.length > before);
  await assert.rejects(runCli(['generate', '--directory', sample, '--config', configPath]), /child of/);
  await writeFile(join(directory, 'tile-00000001', 'positions.sky'), 'corrupt');
  await assert.rejects(runCli(['verify', '--directory', directory], emit), /checksum/);
});
test('executable reports errors with nonzero exit and JSON verification output', () => {
  const script = fileURLToPath(new URL('../scripts/skydb.mjs', import.meta.url));
  const bad = spawnSync(process.execPath, [script, 'verify'], { encoding: 'utf8' });
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /Missing/);
  const good = spawnSync(process.execPath, [script, 'verify', '--directory', sample], { encoding: 'utf8' });
  assert.equal(good.status, 0, good.stderr);
  assert.equal(JSON.parse(good.stdout).tiles, 2);
});
