import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createConfig } from '../src/config.mjs';
import { databaseManifest, SHARD_SIZE } from '../src/layout.mjs';
import { ENGINE_IDENTITY } from '../src/identity.mjs';
import { DISK_CAP_BYTES } from '../benchmarks/trial-support.mjs';

test('directory-limit evidence records a stopped flat store below the disk cap', async () => {
  const report = JSON.parse(await readFile(new URL('../benchmarks/layout-limit-output.json', import.meta.url)));
  const previous = JSON.parse(await readFile(new URL('../benchmarks/full-sessions/session-0010.json', import.meta.url)));
  assert.equal(report.version, 1);
  assert.equal(report.command, 'node skydb/benchmarks/layout-limit.mjs');
  assert.equal(report.directory, 'skydb/generated/full');
  assert.deepEqual(report.runtime.engine, ENGINE_IDENTITY);
  assert.match(report.runtime.node, /^v22\./);
  assert.deepEqual(report.config, createConfig());
  assert.equal(report.failure.code, 'EMLINK');
  assert.equal(report.failure.syscall, 'mkdir');
  assert.equal(report.writerLockPresent, false);
  assert.equal(report.tileDirectories, report.checkpoint.nextIndex);
  assert.equal(report.directoryEntries, report.tileDirectories + 2);
  assert.equal(report.directoryLinks, report.tileDirectories + 2);
  assert.equal(report.checkpoint.complete, false);
  assert.equal(report.manifestSha256, previous.finalCheckpoint.manifestSha256);
  assert.equal(report.checkpoint.manifestSha256, report.manifestSha256);
  assert.ok(report.checkpoint.nextIndex > previous.finalCheckpoint.nextIndex);
  assert.ok(Date.parse(report.measuredAt) >= Date.parse(previous.finishedAt));
  assert.equal(report.budget.diskCapBytes, DISK_CAP_BYTES);
  for (const value of Object.values(report.budget.generatedUsage)) assert.ok(Number.isSafeInteger(value) && value >= 0);
  assert.ok(Math.max(report.budget.generatedUsage.bytes, report.budget.generatedUsage.allocatedBytes) < DISK_CAP_BYTES);
  assert.ok(report.budget.availableBytes > 0);
});

test('migration evidence preserves the retained checkpoint and binds the sharded manifest', async () => {
  const diagnostic = JSON.parse(await readFile(new URL('../benchmarks/layout-limit-output.json', import.meta.url)));
  const report = JSON.parse(await readFile(new URL('../benchmarks/layout-migration-output.json', import.meta.url)));
  assert.equal(report.version, 1);
  assert.equal(report.command, 'node skydb/benchmarks/migrate-layout.mjs');
  assert.equal(report.directory, 'skydb/generated/full');
  assert.deepEqual(report.runtime.engine, ENGINE_IDENTITY);
  assert.match(report.runtime.node, /^v22\./);
  assert.equal(report.runtime.generatorProcesses, 1);
  assert.equal(report.diskCapBytes, DISK_CAP_BYTES);
  assert.ok(Date.parse(report.startedAt) <= Date.parse(report.finishedAt));
  assert.deepEqual(report.before.checkpoint, diagnostic.checkpoint);
  assert.equal(report.before.manifestSha256, diagnostic.manifestSha256);
  const expectedHash = createHash('sha256').update(JSON.stringify(databaseManifest(createConfig(), 'sharded')) + '\n').digest('hex');
  assert.equal(report.after.manifestSha256, expectedHash);
  assert.deepEqual(report.after.checkpoint, { ...diagnostic.checkpoint, manifestSha256: expectedHash });
  const migration = report.migration;
  assert.equal(migration.migrated, true);
  assert.deepEqual(migration.config, createConfig());
  assert.equal(migration.originalManifestSha256, report.before.manifestSha256);
  assert.equal(migration.manifestSha256, report.after.manifestSha256);
  assert.deepEqual(migration.initialCheckpoint, report.before.checkpoint);
  assert.deepEqual(migration.finalCheckpoint, report.after.checkpoint);
  assert.equal(migration.verifiedTiles, diagnostic.tileDirectories);
  assert.equal(migration.movedTiles, diagnostic.tileDirectories);
  assert.equal(report.before.usage.files, report.after.usage.files);
  assert.equal(report.after.usage.directories - report.before.usage.directories, Math.ceil(migration.verifiedTiles / SHARD_SIZE));
  for (const side of [report.before, report.after]) {
    for (const value of Object.values(side.usage)) assert.ok(Number.isSafeInteger(value) && value >= 0);
    assert.ok(Math.max(side.usage.bytes, side.usage.allocatedBytes) < DISK_CAP_BYTES);
    assert.ok(side.availableBytes > 0);
  }
  for (const key of ['wallMs', 'peakRssBytes']) assert.ok(report.results[key] > 0);
  for (const key of ['cpuUserMs', 'cpuSystemMs']) assert.ok(report.results[key] >= 0);
});

test('session checkpoints remain continuous through the recorded failure and migration', async () => {
  const migration = JSON.parse(await readFile(new URL('../benchmarks/layout-migration-output.json', import.meta.url)));
  const reports = new URL('../benchmarks/full-sessions/', import.meta.url);
  const files = (await readdir(reports)).sort();
  let previous = null, first = null;
  for (const filename of files) {
    const report = JSON.parse(await readFile(new URL(filename, reports)));
    first ??= report;
    assert.deepEqual(report.config, first.config);
    assert.deepEqual(report.runtime.engine, first.runtime.engine);
    assert.equal(report.selection.trialSha256, first.selection.trialSha256);
    if (filename === 'session-0011.json') {
      assert.ok(migration.before.checkpoint.nextIndex > previous.finalCheckpoint.nextIndex);
      assert.equal(migration.before.manifestSha256, previous.finalCheckpoint.manifestSha256);
      assert.deepEqual(report.initialCheckpoint, migration.after.checkpoint);
    } else if (previous) assert.deepEqual(report.initialCheckpoint, previous.finalCheckpoint);
    previous = report;
  }
  assert.ok(files.includes('session-0011.json'));
});
