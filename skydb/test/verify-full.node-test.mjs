import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { createConfig } from '../src/config.mjs';
import { planPositionTiles } from '../src/generate.mjs';
import { ENGINE_IDENTITY } from '../src/identity.mjs';
import { databaseManifest } from '../src/layout.mjs';
import { generateDatabase } from '../src/store.mjs';
import { measureVerification } from '../benchmarks/verify-full.mjs';

const generatedRoot = fileURLToPath(new URL('../generated/', import.meta.url));
const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const startMs = Date.parse('2001-01-01T00:00:00Z');
const config = createConfig({ startMs, endMs: startMs + 10_800_000,
  stepMs: 3_600_000, tileMs: 3_600_000, bodies: ['Sun', 'Moon'] });

async function temporary(t) {
  await mkdir(generatedRoot, { recursive: true });
  const directory = await mkdtemp(join(generatedRoot, 'verify-full-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

async function snapshot(directory) {
  const files = {};
  for (const name of (await readdir(directory, { recursive: true })).sort()) {
    const path = join(directory, name);
    if ((await lstat(path)).isFile()) files[name] = await readFile(path);
  }
  return files;
}

function expectedCounts(input) {
  let tiles = 0, samples = 0;
  for (const descriptor of planPositionTiles(input)) {
    tiles++;
    samples += Math.ceil((descriptor.lastSampleMs - descriptor.startMs) / input.stepMs) + 1;
  }
  return { tiles, samples };
}

function checkMeasurements(report) {
  assert.equal(report.version, 1);
  assert.equal(report.command, 'node skydb/benchmarks/verify-full.mjs');
  assert.ok(Number.isFinite(Date.parse(report.startedAt)));
  assert.ok(Date.parse(report.startedAt) <= Date.parse(report.finishedAt));
  assert.deepEqual(report.runtime.engine, ENGINE_IDENTITY);
  assert.match(report.runtime.node, /^v22\./);
  assert.ok(report.runtime.osRelease.length > 0);
  assert.ok(Number.isSafeInteger(report.runtime.memoryBytes) && report.runtime.memoryBytes > 0);
  assert.ok(typeof report.method === 'string' && report.method.length > 0);
  assert.deepEqual(report.verification.command, { executable: 'node',
    args: ['skydb/scripts/skydb.mjs', 'verify', '--directory', report.directory] });
  assert.ok(Number.isFinite(report.verification.elapsedMs) && report.verification.elapsedMs > 0);
  for (const value of Object.values(report.storage)) {
    assert.ok(Number.isSafeInteger(value) && value >= 0);
  }
  assert.ok(Number.isSafeInteger(report.verification.summary.events) && report.verification.summary.events >= 0);
}

test('verification measurement runs the CLI and records exact metadata without changing the database', async t => {
  const directory = await temporary(t);
  const successConfig = createConfig({ startMs, endMs: startMs + 172_800_000,
    stepMs: 3_600_000, tileMs: 86_400_000 });
  await generateDatabase(directory, successConfig, { layout: 'sharded' });
  const before = await snapshot(directory);
  const report = await measureVerification(directory);
  checkMeasurements(report);
  assert.equal(report.directory, relative(repoRoot, directory));
  assert.deepEqual(report.manifest.value, databaseManifest(successConfig, 'sharded'));
  assert.equal(report.manifest.bytes, before['manifest.json'].length);
  assert.equal(report.manifest.sha256, createHash('sha256').update(before['manifest.json']).digest('hex'));
  assert.deepEqual(report.checkpoint, JSON.parse(before['checkpoint.json']));
  assert.equal(report.checkpoint.manifestSha256, report.manifest.sha256);
  assert.equal(report.checkpoint.complete, true);
  const expected = expectedCounts(successConfig);
  assert.equal(report.verification.summary.tiles, expected.tiles);
  assert.equal(report.verification.summary.samples, expected.samples);
  const storedEvents = Object.entries(before).filter(([name]) => name.endsWith('/events.json.gz'))
    .reduce((sum, [, bytes]) => sum + JSON.parse(gunzipSync(bytes)).events.length, 0);
  assert.ok(storedEvents > 0);
  assert.equal(report.verification.summary.events, storedEvents);
  assert.deepEqual(report.verification.summary.config, successConfig);
  assert.equal(report.storage.bytes, Object.values(before).reduce((sum, bytes) => sum + bytes.length, 0));
  assert.equal(report.storage.files, Object.keys(before).length);
  assert.equal(report.storage.files, 3 * expected.tiles + 2);
  assert.equal(report.storage.directories, expected.tiles + 2);
  assert.deepEqual(await snapshot(directory), before);
});

test('verification rejects incomplete, corrupt and locked databases before measuring their storage', async t => {
  for (const failure of ['incomplete', 'corrupt', 'locked']) {
    const directory = await temporary(t);
    await generateDatabase(directory, config);
    // A storage walk would reject this unrelated entry, exposing wrong failure order.
    await symlink('manifest.json', join(directory, 'unrelated-link'));
    if (failure === 'incomplete') {
      const path = join(directory, 'checkpoint.json');
      const checkpoint = JSON.parse(await readFile(path));
      await writeFile(path, JSON.stringify({ ...checkpoint, complete: false }) + '\n');
      await assert.rejects(measureVerification(directory), /incomplete|checkpoint/i);
    } else if (failure === 'corrupt') {
      const path = join(directory, 'tile-00000000', 'positions.sky');
      await writeFile(path, 'corrupt');
      await assert.rejects(measureVerification(directory), /checksum/i);
      assert.equal(await readFile(path, 'utf8'), 'corrupt');
    } else {
      const path = join(directory, '.lock');
      await writeFile(path, 'existing writer');
      await assert.rejects(measureVerification(directory), /lock|writer/i);
      assert.equal(await readFile(path, 'utf8'), 'existing writer');
    }
  }
});

test('committed full verification evidence binds the completed generation, manifest, scope and engine pin', async () => {
  const report = JSON.parse(await readFile(new URL('../benchmarks/verify-full-output.json', import.meta.url)));
  const completed = JSON.parse(await readFile(new URL('../benchmarks/full-sessions/session-0036.json', import.meta.url)));
  const full = createConfig(), manifest = databaseManifest(full, 'sharded');
  const manifestBytes = Buffer.from(JSON.stringify(manifest) + '\n');
  checkMeasurements(report);
  assert.equal(report.directory, 'skydb/generated/full');
  assert.deepEqual(report.manifest.value, manifest);
  assert.equal(report.manifest.bytes, manifestBytes.length);
  assert.equal(report.manifest.sha256, createHash('sha256').update(manifestBytes).digest('hex'));
  assert.equal(report.manifest.value.engineSha256, ENGINE_IDENTITY.sha256);
  assert.deepEqual(report.checkpoint, completed.finalCheckpoint);
  assert.equal(report.checkpoint.complete, true);
  assert.equal(report.checkpoint.manifestSha256, report.manifest.sha256);
  const expected = expectedCounts(full);
  assert.equal(report.verification.summary.tiles, expected.tiles);
  assert.equal(report.verification.summary.samples, expected.samples);
  assert.equal(report.verification.summary.tiles, report.checkpoint.nextIndex);
  assert.deepEqual(report.verification.summary.config, full);
  assert.ok(report.storage.files >= 3 * expected.tiles + 2);
  assert.ok(report.storage.directories >= expected.tiles + 1);
  assert.ok(report.storage.bytes > 0);
  assert.deepEqual(report.storage, completed.results.storage);
  assert.ok(Date.parse(report.startedAt) >= Date.parse(completed.finishedAt));
});
