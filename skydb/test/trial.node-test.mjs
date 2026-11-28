import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import { createConfig } from '../src/config.mjs';
import { ENGINE_IDENTITY } from '../src/identity.mjs';
import { verifyDatabase } from '../src/verify.mjs';
import { TRIAL_CONFIG, runTrial } from '../benchmarks/trial.mjs';
import { DISK_CAP_BYTES, TILE_RESERVE_BYTES, FREE_RESERVE_BYTES, storageUsage,
  checkBudget, tileCount, projectFullCost } from '../benchmarks/trial-support.mjs';

const root = fileURLToPath(new URL('../generated/', import.meta.url));
const config = createConfig({ startMs: Date.parse('2001-01-01T00:00:00Z'), endMs: Date.parse('2001-01-03T00:00:00Z') });

test('full cost arithmetic uses planner tiles, CPU milliseconds and retained trial storage', () => {
  const measured = { config, tiles: 2, wallMs: 100, cpuUserMs: 80, cpuSystemMs: 10,
    storage: { bytes: 1000, allocatedBytes: 4000 }, generatedBefore: { bytes: 3000, allocatedBytes: 5000 } };
  const estimate = projectFullCost(measured), factor = tileCount(createConfig()) / 2;
  assert.equal(estimate.factor, factor);
  assert.equal(estimate.wallMs, 100 * factor);
  assert.equal(estimate.cpuUserMs, 80 * factor);
  assert.equal(estimate.cpuSystemMs, 10 * factor);
  assert.equal(estimate.bytes, Math.ceil(1000 * factor));
  assert.equal(estimate.allocatedBytes, Math.ceil(4000 * factor));
  assert.equal(estimate.coexistBytes, 5000 + 4000 + estimate.allocatedBytes + TILE_RESERVE_BYTES);
  assert.equal(estimate.fitsDiskCap, true);
  assert.equal(projectFullCost({ ...measured, storage: { bytes: 2_000_000, allocatedBytes: 2_000_000 } }).fitsDiskCap, false);
  for (const change of [{ tiles: 1 }, { wallMs: NaN }, { cpuUserMs: -1 }, { cpuSystemMs: Infinity },
    { storage: { bytes: 0, allocatedBytes: 0 } }, { config: { ...config, bodies: ['Moon'] } }]) {
    assert.throws(() => projectFullCost({ ...measured, ...change }));
  }
});

test('disk budget includes allocated storage, exact cap equality and free filesystem reserve', () => {
  const available = TILE_RESERVE_BYTES + FREE_RESERVE_BYTES;
  assert.doesNotThrow(() => checkBudget({ bytes: 0, allocatedBytes: DISK_CAP_BYTES - TILE_RESERVE_BYTES }, available));
  assert.throws(() => checkBudget({ bytes: 0, allocatedBytes: DISK_CAP_BYTES - TILE_RESERVE_BYTES + 1 }, available), /Disk cap/);
  assert.throws(() => checkBudget({ bytes: DISK_CAP_BYTES, allocatedBytes: 0 }, available), /Disk cap/);
  assert.throws(() => checkBudget({ bytes: 0, allocatedBytes: 0 }, available - 1), /free disk/);
  assert.throws(() => checkBudget({ bytes: NaN, allocatedBytes: 0 }, available), /Invalid/);
});

test('storage walk counts other datasets and staging without following symbolic links', async () => {
  await mkdir(root, { recursive: true });
  const directory = await mkdtemp(join(root, 'budget-test-'));
  try {
    await mkdir(join(directory, 'other-dataset'));
    await mkdir(join(directory, '.tile.tmp'));
    await writeFile(join(directory, 'other-dataset', 'data'), 'abc');
    await writeFile(join(directory, '.tile.tmp', 'data'), 'defgh');
    const usage = await storageUsage(directory);
    assert.equal(usage.bytes, 8);
    assert.equal(usage.files, 2);
    assert.equal(usage.directories, 3);
    assert.ok(usage.allocatedBytes >= usage.bytes);
    await symlink(join(directory, 'other-dataset'), join(directory, 'link'));
    await assert.rejects(storageUsage(directory), /symbolic links/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('small trial persists a fresh completed database and interruption cannot yield a report', async () => {
  let interrupted;
  try {
    await assert.rejects(runTrial(config, { onProgress: async ({ directory }) => {
      interrupted = directory;
      throw new Error('Controlled interruption');
    } }), /Controlled interruption/);
    const checkpoint = JSON.parse(await readFile(join(interrupted, 'checkpoint.json'), 'utf8'));
    assert.equal(checkpoint.complete, false);
    const report = await runTrial(config);
    const directory = resolve(fileURLToPath(new URL('../../', import.meta.url)), report.directory);
    try {
      assert.notEqual(directory, interrupted);
      const verified = await verifyDatabase(directory);
      assert.equal(verified.tiles, 2);
      assert.equal(report.results.tiles, 2);
      assert.ok(report.results.wallMs > 0);
      assert.ok(report.results.cpuUserMs >= 0 && report.results.cpuSystemMs >= 0);
      assert.equal(report.runtime.generatorProcesses, 1);
      assert.deepEqual(report.runtime.engine, ENGINE_IDENTITY);
      assert.ok(report.budget.generatedBefore.bytes > 0);
      assert.deepEqual(report.fullSpanEstimate.config, createConfig());
    } finally { await rm(directory, { recursive: true, force: true }); }
  } finally { if (interrupted) await rm(interrupted, { recursive: true, force: true }); }
});

test('committed decade trial report agrees with reproducible cost arithmetic and workload scope', async () => {
  const report = JSON.parse(await readFile(new URL('../benchmarks/trial-output.json', import.meta.url), 'utf8'));
  assert.deepEqual(report.config, TRIAL_CONFIG);
  assert.deepEqual(report.runtime.engine, ENGINE_IDENTITY);
  assert.match(report.runtime.node, /^v22\./);
  assert.equal(report.runtime.generatorProcesses, 1);
  assert.match(report.directory, /^skydb\/generated\/trial-/);
  assert.equal(report.results.tiles, tileCount(TRIAL_CONFIG));
  assert.equal(report.results.storage.files, 3 * report.results.tiles + 2);
  assert.equal(report.results.storage.directories, report.results.tiles + 1);
  assert.ok(report.results.storage.bytes > 0 && report.results.storage.allocatedBytes > 0);
  assert.ok(report.results.wallMs > 0 && report.results.peakRssBytes > 0);
  assert.ok(report.results.cpuUserMs > 0 && report.results.cpuSystemMs >= 0);
  assert.ok(Math.abs(report.results.cpuPercentOfOneCore -
    (report.results.cpuUserMs + report.results.cpuSystemMs) / report.results.wallMs * 100) < 1e-10);
  assert.ok(Math.max(report.budget.generatedAfter.bytes, report.budget.generatedAfter.allocatedBytes) < DISK_CAP_BYTES);
  assert.deepEqual(report.fullSpanEstimate, projectFullCost({ config: report.config, ...report.results,
    generatedBefore: report.budget.generatedBefore }));
});
