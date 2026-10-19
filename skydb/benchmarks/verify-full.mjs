import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { release, totalmem } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { environment } from './common.mjs';
import { storageUsage } from './trial-support.mjs';
import { verifyEngineArchive } from '../src/identity.mjs';
import { planPositionTiles } from '../src/generate.mjs';
import { openDatabase } from '../src/query.mjs';
import { readStoreFile, storePathExists } from '../src/store.mjs';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const fullDirectory = fileURLToPath(new URL('../generated/full/', import.meta.url));
const run = promisify(execFile);

async function metadata(directory) {
  if (await storePathExists(join(directory, '.lock'))) throw new Error('Database has a writer lock');
  const database = await openDatabase(directory, { cacheTiles: 1 });
  const manifest = await readStoreFile(join(directory, 'manifest.json'));
  const checkpoint = await readStoreFile(join(directory, 'checkpoint.json'));
  return { config: database.config, manifest, checkpoint };
}

/** Measure the existing verification CLI without writing to the database. */
export async function measureVerification(directory) {
  directory = resolve(directory);
  const runtime = { ...environment(), osRelease: release(), memoryBytes: totalmem() };
  await verifyEngineArchive();
  const before = await metadata(directory);
  const path = relative(repoRoot, directory);
  const args = ['skydb/scripts/skydb.mjs', 'verify', '--directory', path];
  const startedAt = new Date().toISOString(), start = performance.now();
  // No shell and only one verifier child; stdout is an aggregate, not tile data.
  // A failing CLI or oversized output rejects before any report can be emitted.
  const { stdout } = await run(process.execPath, args, {
    cwd: repoRoot, encoding: 'utf8', maxBuffer: 65_536
  });
  const elapsedMs = performance.now() - start;
  const summary = JSON.parse(stdout);
  let tiles = 0, samples = 0;
  for (const descriptor of planPositionTiles(before.config)) {
    tiles++;
    samples += Math.ceil((descriptor.lastSampleMs - descriptor.startMs) / before.config.stepMs) + 1;
  }
  assert.deepEqual(summary.config, before.config, 'CLI configuration mismatch');
  assert.equal(summary.tiles, tiles, 'CLI tile count mismatch');
  assert.equal(summary.samples, samples, 'CLI sample count mismatch');
  assert.ok(Number.isSafeInteger(summary.events) && summary.events >= 0, 'Invalid CLI event count');
  const storage = await storageUsage(directory);
  const after = await metadata(directory);
  assert.deepEqual(after.manifest, before.manifest, 'Manifest changed during verification');
  assert.deepEqual(after.checkpoint, before.checkpoint, 'Checkpoint changed during verification');
  return {
    version: 1, command: 'node skydb/benchmarks/verify-full.mjs', directory: path,
    startedAt, finishedAt: new Date().toISOString(), runtime,
    method: 'One sequential verification CLI child; elapsedMs includes process startup and the complete CLI traversal, excludes archive checks, metadata reads and storage walk; filesystem cache and host load uncontrolled; storage counts all files and directory allocation under the database directory',
    manifest: { sha256: createHash('sha256').update(before.manifest).digest('hex'),
      bytes: before.manifest.length, value: JSON.parse(before.manifest) },
    checkpoint: JSON.parse(before.checkpoint),
    verification: { command: { executable: 'node', args }, elapsedMs, summary }, storage
  };
}

async function main() {
  if (process.argv.length !== 2) throw new Error('Full verification script takes no arguments');
  console.log(JSON.stringify(await measureVerification(fullDirectory), null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
