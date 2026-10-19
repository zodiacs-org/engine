import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createConfig } from '../src/config.mjs';
import { ENGINE_IDENTITY } from '../src/identity.mjs';
import { generateDatabase } from '../src/store.mjs';
import { verifyDatabase } from '../src/verify.mjs';
import { runGenerationSession, selectFullCoverage, SESSION_BUDGET_MS } from '../benchmarks/full.mjs';
import { DISK_CAP_BYTES, TILE_RESERVE_BYTES, FREE_RESERVE_BYTES, tileCount } from '../benchmarks/trial-support.mjs';

const root = fileURLToPath(new URL('../generated/', import.meta.url));
const startMs = Date.parse('2001-01-01T00:00:00Z');
const config = createConfig({ startMs, endMs: startMs + 10_800_000,
  stepMs: 3_600_000, tileMs: 3_600_000, bodies: ['Sun', 'Moon'] });
const ampleFree = TILE_RESERVE_BYTES + FREE_RESERVE_BYTES + 1_000_000;

async function temporary(t) {
  await mkdir(root, { recursive: true });
  const directory = await mkdtemp(join(root, 'full-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

async function snapshot(directory) {
  const files = {};
  for (const path of (await readdir(directory, { recursive: true })).sort()) {
    if (path.endsWith('.json') || path.endsWith('.sky') || path.endsWith('.gz')) {
      files[path] = await readFile(join(directory, path));
    }
  }
  return files;
}

test('full coverage selection uses the pinned trial arithmetic and actual generated usage', async () => {
  const trial = JSON.parse(await readFile(new URL('../benchmarks/trial-output.json', import.meta.url), 'utf8'));
  const usage = { bytes: 40_000, allocatedBytes: 80_000, files: 10, directories: 4 };
  const full = createConfig(), plannedTiles = tileCount(full), completedTiles = 3;
  const selected = selectFullCoverage(trial, usage, completedTiles);
  const remaining = Math.ceil(Math.max(trial.fullSpanEstimate.bytes, trial.fullSpanEstimate.allocatedBytes) *
    (plannedTiles - completedTiles) / plannedTiles);
  assert.deepEqual(selected.config, full);
  assert.equal(selected.plannedTiles, plannedTiles);
  assert.equal(selected.estimatedRemainingAllocatedBytes, remaining);
  assert.equal(selected.estimatedCoexistBytes, usage.allocatedBytes + remaining + TILE_RESERVE_BYTES);
  assert.equal(selected.fitsDiskCap, true);
  assert.equal(selectFullCoverage(trial, { ...usage, allocatedBytes: DISK_CAP_BYTES }).fitsDiskCap, false);
  const mismatched = structuredClone(trial);
  mismatched.runtime.engine.sha256 = '0'.repeat(64);
  assert.throws(() => selectFullCoverage(mismatched, usage));
  const inconsistent = structuredClone(trial);
  inconsistent.fullSpanEstimate.allocatedBytes++;
  assert.throws(() => selectFullCoverage(inconsistent, usage));
});

test('bounded interruption and resume preserve uninterrupted database bytes', async t => {
  const baseline = await temporary(t), directory = await temporary(t);
  await generateDatabase(baseline, config);
  const controller = new AbortController();
  const paused = await runGenerationSession(config, { directory, signal: controller.signal,
    onProgress: async progress => {
      assert.equal(progress.directory, directory);
      if (progress.phase === 'checkpoint') controller.abort(new Error('Controlled session pause'));
    } });
  assert.equal(paused.version, 1);
  assert.equal(paused.status, 'paused');
  assert.equal(paused.pauseReason, 'signal');
  assert.equal(paused.initialCheckpoint, null);
  assert.equal(paused.finalCheckpoint.nextIndex, 1);
  assert.equal(paused.finalCheckpoint.complete, false);
  assert.equal(paused.results.publishedTiles, 1);
  assert.equal(paused.results.checkpointedTiles, 1);
  assert.equal(paused.stop, null);
  await assert.rejects(access(join(directory, '.lock')), { code: 'ENOENT' });

  const resumed = await runGenerationSession(config, { directory });
  assert.equal(resumed.status, 'complete');
  assert.equal(resumed.pauseReason, null);
  assert.deepEqual(resumed.initialCheckpoint, paused.finalCheckpoint);
  assert.equal(resumed.finalCheckpoint.nextIndex, 3);
  assert.equal(resumed.finalCheckpoint.complete, true);
  assert.equal(resumed.results.plannedTiles, 3);
  assert.equal(resumed.results.publishedTiles, 2);
  assert.equal(resumed.results.checkpointedTiles, 2);
  assert.equal(resumed.results.resumedVerifiedTiles, 1);
  assert.ok(resumed.results.wallMs > 0);
  assert.ok(resumed.results.cpuUserMs >= 0 && resumed.results.cpuSystemMs >= 0);
  assert.ok(resumed.results.peakRssBytes > 0);
  assert.ok(Math.max(resumed.budget.generatedAfter.bytes,
    resumed.budget.generatedAfter.allocatedBytes) < DISK_CAP_BYTES);
  assert.deepEqual(await snapshot(directory), await snapshot(baseline));
  assert.equal((await verifyDatabase(directory)).tiles, 3);

  const completed = await snapshot(directory);
  const again = await runGenerationSession(config, { directory });
  assert.equal(again.status, 'complete');
  assert.equal(again.results.publishedTiles, 0);
  assert.equal(again.results.checkpointedTiles, 0);
  assert.equal(again.results.resumedVerifiedTiles, 3);
  assert.deepEqual(await snapshot(directory), completed);
});

test('zero free space refuses generation before creating the database directory', async t => {
  const parent = await temporary(t), directory = join(parent, 'not-created');
  const report = await runGenerationSession(config, { directory, readAvailableBytes: async () => 0 });
  assert.equal(report.status, 'disk-stopped');
  assert.equal(report.pauseReason, null);
  assert.equal(report.results.publishedTiles, 0);
  assert.equal(report.initialCheckpoint, null);
  assert.equal(report.finalCheckpoint, null);
  assert.equal(report.stop.availableBytes, 0);
  assert.match(report.stop.message, /free disk/i);
  await assert.rejects(access(directory), { code: 'ENOENT' });
});

test('published tiles beyond the checkpoint recover without being counted as new allocation', async t => {
  const directory = await temporary(t);
  await generateDatabase(directory, config);
  const path = join(directory, 'checkpoint.json');
  const previous = JSON.parse(await readFile(path, 'utf8'));
  await writeFile(path, JSON.stringify({ ...previous, nextIndex: 0, complete: false }) + '\n');
  const report = await runGenerationSession(config, { directory });
  assert.equal(report.status, 'complete');
  assert.equal(report.initialCheckpoint.nextIndex, 0);
  assert.equal(report.finalCheckpoint.nextIndex, 3);
  assert.equal(report.finalCheckpoint.complete, true);
  assert.equal(report.results.publishedTiles, 0);
  assert.equal(report.results.checkpointedTiles, 3);
  assert.equal(report.results.resumedVerifiedTiles, 3);
  assert.deepEqual(report.finalCheckpoint, previous);
  assert.equal((await verifyDatabase(directory)).tiles, 3);
});

test('a disk stop after publication leaves a recoverable database and allocates no next tile', async t => {
  const baseline = await temporary(t), directory = await temporary(t);
  await generateDatabase(baseline, config);
  let blocked = false;
  const report = await runGenerationSession(config, { directory,
    readAvailableBytes: async () => blocked ? 0 : ampleFree,
    onProgress: async progress => { if (progress.phase === 'published') blocked = true; } });
  assert.equal(report.status, 'disk-stopped');
  assert.equal(report.pauseReason, null);
  assert.equal(report.results.publishedTiles, 1);
  assert.equal(report.stop.availableBytes, 0);
  assert.ok(report.stop.usage.allocatedBytes >= 0);
  assert.equal(report.finalCheckpoint.nextIndex, 1);
  assert.equal(report.results.checkpointedTiles, 1);
  await access(join(directory, 'tile-00000000', 'receipt.json'));
  await assert.rejects(access(join(directory, 'tile-00000001')), { code: 'ENOENT' });
  await assert.rejects(access(join(directory, '.lock')), { code: 'ENOENT' });
  const resumed = await runGenerationSession(config, { directory });
  assert.equal(resumed.status, 'complete');
  assert.deepEqual(await snapshot(directory), await snapshot(baseline));
});

test('configuration, corruption, lock and unexpected callback failures stay fatal', async t => {
  const mismatch = await temporary(t);
  await generateDatabase(mismatch, config);
  await assert.rejects(runGenerationSession({ ...config, bodies: ['Sun'] }, { directory: mismatch }),
    /configuration mismatch/);

  const corrupt = await temporary(t);
  await generateDatabase(corrupt, config);
  await writeFile(join(corrupt, 'tile-00000000', 'positions.sky'), 'corrupt');
  await assert.rejects(runGenerationSession(config, { directory: corrupt }), /checksum/);
  assert.equal(await readFile(join(corrupt, 'tile-00000000', 'positions.sky'), 'utf8'), 'corrupt');

  const locked = await temporary(t);
  await writeFile(join(locked, '.lock'), 'live writer');
  await assert.rejects(runGenerationSession(config, { directory: locked }), { code: 'EEXIST' });
  assert.equal(await readFile(join(locked, '.lock'), 'utf8'), 'live writer');

  const callback = await temporary(t);
  const unexpected = new DOMException('Unexpected callback failure', 'AbortError');
  await assert.rejects(runGenerationSession(config, { directory: callback,
    onProgress: async () => { throw unexpected; } }), error => error === unexpected);
  await assert.rejects(access(join(callback, '.lock')), { code: 'ENOENT' });
});

test('session limits and output containment are validated before writing data', async t => {
  const parent = await temporary(t), directory = join(parent, 'not-created');
  for (const maxWallMs of [0, -1, 1.5, NaN, Infinity, 600_001, Number.MAX_SAFE_INTEGER + 1, '1', null]) {
    await assert.rejects(runGenerationSession(config, { directory, maxWallMs }), RangeError);
  }
  await assert.rejects(access(directory), { code: 'ENOENT' });
  await assert.rejects(runGenerationSession(config, { directory: root }));
  await assert.rejects(runGenerationSession(config, {
    directory: fileURLToPath(new URL('../samples/', import.meta.url)) }));
});

test('a deadline before observable resume progress does not invent a verified count', async t => {
  const directory = await temporary(t);
  const prefix = createConfig({ startMs, endMs: startMs + 40, stepMs: 1, tileMs: 1, bodies: ['Sun'] });
  await generateDatabase(directory, prefix);
  const before = await snapshot(directory);
  let progressCalls = 0;
  const report = await runGenerationSession(prefix, { directory, maxWallMs: 1,
    onProgress: async () => { progressCalls++; } });
  assert.equal(report.status, 'paused');
  assert.equal(report.pauseReason, 'session-budget');
  assert.equal(progressCalls, 0);
  assert.equal(report.results.publishedTiles, 0);
  assert.equal(report.results.resumedVerifiedTiles, null);
  assert.equal(report.initialCheckpoint.complete, true);
  assert.deepEqual(report.finalCheckpoint, report.initialCheckpoint);
  assert.deepEqual(await snapshot(directory), before);
  await assert.rejects(access(join(directory, '.lock')), { code: 'ENOENT' });
});

test('committed full-session aggregates bind the workload, trial, counters and measured resources', async () => {
  const trialBytes = await readFile(new URL('../benchmarks/trial-output.json', import.meta.url));
  const trial = JSON.parse(trialBytes);
  const reports = new URL('../benchmarks/full-sessions/', import.meta.url);
  const files = (await readdir(reports)).sort();
  assert.ok(files.length > 0);
  for (const filename of files) {
    assert.match(filename, /^session-\d+\.json$/);
    const report = JSON.parse(await readFile(new URL(filename, reports), 'utf8'));
    assert.equal(report.version, 1);
    assert.equal(report.command, 'node skydb/benchmarks/full.mjs');
    assert.equal(report.directory, 'skydb/generated/full');
    assert.deepEqual(report.config, createConfig());
    assert.deepEqual(report.runtime.engine, ENGINE_IDENTITY);
    assert.match(report.runtime.node, /^v22\./);
    assert.equal(report.runtime.generatorProcesses, 1);
    assert.equal(report.maxWallMs, SESSION_BUDGET_MS);
    assert.ok(Date.parse(report.startedAt) <= Date.parse(report.finishedAt));
    assert.ok(['complete', 'paused', 'disk-stopped'].includes(report.status));
    assert.ok(report.finalCheckpoint);
    const initial = report.initialCheckpoint?.nextIndex ?? 0;
    const final = report.finalCheckpoint.nextIndex;
    assert.equal(report.results.plannedTiles, tileCount(createConfig()));
    assert.ok(final >= initial && final <= report.results.plannedTiles);
    assert.equal(report.finalCheckpoint.manifestSha256.length, 64);
    assert.equal(report.results.checkpointedTiles, final - initial);
    if (report.results.resumedVerifiedTiles === null) {
      assert.equal(report.results.publishedTiles, 0);
      assert.equal(report.results.checkpointedTiles, 0);
    } else {
      assert.equal(report.results.resumedVerifiedTiles + report.results.publishedTiles, final);
    }
    if (report.status === 'complete') {
      assert.equal(final, report.results.plannedTiles);
      assert.equal(report.finalCheckpoint.complete, true);
      assert.equal(report.pauseReason, null);
    } else if (report.status === 'paused') {
      assert.ok(['signal', 'session-budget'].includes(report.pauseReason));
    }
    for (const key of ['wallMs', 'peakRssBytes']) assert.ok(report.results[key] > 0);
    for (const key of ['cpuUserMs', 'cpuSystemMs']) assert.ok(report.results[key] >= 0);
    assert.equal(report.budget.diskCapBytes, DISK_CAP_BYTES);
    assert.equal(report.budget.tileReserveBytes, TILE_RESERVE_BYTES);
    assert.equal(report.budget.freeReserveBytes, FREE_RESERVE_BYTES);
    for (const usage of [report.results.storage, report.budget.generatedBefore, report.budget.generatedAfter]) {
      for (const value of Object.values(usage)) assert.ok(Number.isSafeInteger(value) && value >= 0);
    }
    assert.ok(report.results.storage.files >= 3 * final + 2);
    assert.ok(report.results.storage.directories >= final + 1);
    assert.ok(report.budget.generatedAfter.bytes >= report.results.storage.bytes);
    assert.ok(report.budget.generatedAfter.allocatedBytes >= report.results.storage.allocatedBytes);
    if (report.status !== 'disk-stopped') {
      assert.equal(report.stop, null);
      assert.ok(Math.max(report.budget.generatedAfter.bytes, report.budget.generatedAfter.allocatedBytes) <= DISK_CAP_BYTES);
    }
    assert.deepEqual(report.selection, { ...selectFullCoverage(trial, report.budget.generatedBefore, initial),
      trialSha256: createHash('sha256').update(trialBytes).digest('hex') });
  }
});
