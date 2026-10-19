import { mkdir, open, readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, relative, resolve, sep } from 'node:path';
import { performance } from 'node:perf_hooks';
import { release, totalmem } from 'node:os';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { environment } from './common.mjs';
import { createConfig } from '../src/config.mjs';
import { ENGINE_IDENTITY } from '../src/identity.mjs';
import { loadEngine } from '../src/engine.mjs';
import { generateDatabase } from '../src/store.mjs';
import { storageUsage, availableBytes, checkBudget, projectFullCost, tileCount,
  DISK_CAP_BYTES, TILE_RESERVE_BYTES, FREE_RESERVE_BYTES } from './trial-support.mjs';

export const SESSION_BUDGET_MS = 600_000;
const generatedRoot = fileURLToPath(new URL('../generated/', import.meta.url));
const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const fullDirectory = join(generatedRoot, 'full');

async function checkpoint(directory) {
  try {
    const value = JSON.parse(await readFile(join(directory, 'checkpoint.json'), 'utf8'));
    if (value.version !== 1 || !Number.isSafeInteger(value.nextIndex) || value.nextIndex < 0 ||
        typeof value.complete !== 'boolean') throw new Error('Invalid checkpoint');
    return value;
  } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

/** Choose the default span only from validated trial arithmetic and current storage. */
export function selectFullCoverage(trial, generatedUsage, completedTiles = 0) {
  if (trial.version !== 1 || !isDeepStrictEqual(trial.runtime?.engine, ENGINE_IDENTITY)) {
    throw new Error('Trial engine identity mismatch');
  }
  const measured = { config: trial.config, ...trial.results, generatedBefore: trial.budget?.generatedBefore };
  const estimate = projectFullCost(measured);
  if (!isDeepStrictEqual(estimate, trial.fullSpanEstimate)) throw new Error('Trial cost arithmetic mismatch');
  if (!Number.isSafeInteger(completedTiles) || completedTiles < 0 || completedTiles > estimate.tiles) {
    throw new Error('Invalid completed tile count');
  }
  for (const value of [generatedUsage.bytes, generatedUsage.allocatedBytes]) {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error('Invalid disk measurement');
  }
  const estimatedRemainingAllocatedBytes = Math.ceil(Math.max(estimate.bytes, estimate.allocatedBytes) *
    (estimate.tiles - completedTiles) / estimate.tiles);
  const estimatedCoexistBytes = Math.max(generatedUsage.bytes, generatedUsage.allocatedBytes) +
    estimatedRemainingAllocatedBytes + TILE_RESERVE_BYTES;
  return { config: createConfig(), plannedTiles: estimate.tiles, estimatedRemainingAllocatedBytes,
    estimatedCoexistBytes, fitsDiskCap: estimatedCoexistBytes <= DISK_CAP_BYTES };
}

/** Cooperatively pause the unchanged store at its next safe boundary. */
export async function runGenerationSession(input = createConfig(), {
  directory = fullDirectory, maxWallMs = SESSION_BUDGET_MS,
  onProgress = async () => {}, signal, readAvailableBytes = availableBytes
} = {}) {
  const runtime = { ...environment(), osRelease: release(), memoryBytes: totalmem(), generatorProcesses: 1 };
  const config = createConfig(input);
  if (!Number.isSafeInteger(maxWallMs) || maxWallMs <= 0 || maxWallMs > SESSION_BUDGET_MS) {
    throw new RangeError('Session budget must be a positive integer no greater than SESSION_BUDGET_MS');
  }
  directory = resolve(directory);
  const child = relative(generatedRoot, directory);
  if (!child || child === '..' || child.startsWith(`..${sep}`) || resolve(generatedRoot, child) !== directory) {
    throw new Error('Session directory must be a child of generated/');
  }
  const plannedTiles = tileCount(config);
  const startedAt = new Date().toISOString();
  const start = performance.now(), cpuStart = process.cpuUsage();
  const controller = new AbortController();
  const pause = new Error('Generation session paused');
  let pauseReason = null, status = 'paused', stop = null, publishedTiles = 0, checkpointedTiles = 0;
  let prefixVerified = false;
  const requestPause = reason => {
    if (!controller.signal.aborted) { pauseReason = reason; controller.abort(pause); }
  };
  const forwardSignal = () => requestPause('signal');
  signal?.addEventListener('abort', forwardSignal, { once: true });
  if (signal?.aborted) forwardSignal();
  const timer = setTimeout(() => requestPause('session-budget'), maxWallMs);
  let generatedBefore, freeBefore, initialCheckpoint;
  try {
    await mkdir(generatedRoot, { recursive: true });
    generatedBefore = await storageUsage(generatedRoot);
    freeBefore = await readAvailableBytes(generatedRoot);
    initialCheckpoint = await checkpoint(directory);
    let usage = { ...generatedBefore };
    const enforceBudget = async (wholeRoot = false) => {
      if (wholeRoot) usage = await storageUsage(generatedRoot);
      const free = await readAvailableBytes(generatedRoot);
      try { checkBudget(usage, free); }
      catch (error) {
        stop = { message: error.message, usage: { ...usage }, availableBytes: free };
        throw stop;
      }
    };
    try {
      await enforceBudget();
      controller.signal.throwIfAborted();
      await loadEngine();
      await generateDatabase(directory, config, { signal: controller.signal, onProgress: async progress => {
        prefixVerified = true;
        if (progress.phase === 'published') {
          publishedTiles++;
          const tile = await storageUsage(progress.tileDirectory);
          for (const field of Object.keys(usage)) usage[field] += tile[field];
        } else if (progress.phase === 'checkpoint') {
          checkpointedTiles++;
          // Whole-root walks reconcile parent directories, metadata and recovered tiles.
          // The next-tile reserve covers those blocks between reconciliations.
          if (progress.descriptor.endMs < config.endMs) await enforceBudget(checkpointedTiles % 128 === 0);
        }
        await onProgress({ ...progress, directory });
      } });
      prefixVerified = true;
      status = 'complete';
      pauseReason = null;
    } catch (error) {
      if (stop && error === stop) { status = 'disk-stopped'; pauseReason = null; }
      else if (error !== pause) throw error;
    }
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', forwardSignal);
  }
  // These final measurements are outside the cooperative generation deadline.
  const generatedAfter = await storageUsage(generatedRoot);
  const freeAfter = await readAvailableBytes(generatedRoot);
  const finalCheckpoint = await checkpoint(directory);
  let storage = null;
  try { storage = await storageUsage(directory); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const cpu = process.cpuUsage(cpuStart), wallMs = performance.now() - start;
  if (Math.max(generatedAfter.bytes, generatedAfter.allocatedBytes) > DISK_CAP_BYTES) {
    status = 'disk-stopped'; pauseReason = null;
    stop = { message: 'Measured generated/ storage exceeds disk cap; record this stop in PHASE2.md',
      usage: generatedAfter, availableBytes: freeAfter };
  }
  return { version: 1, command: 'node skydb/benchmarks/full.mjs', startedAt, finishedAt: new Date().toISOString(),
    status, pauseReason, directory: relative(repoRoot, directory), config, runtime,
    method: 'One sequential generator; wall and CPU include preflight, engine load, resume verification, generation, disk guards and final storage walks; cooperative deadline excludes final reporting walks; filesystem cache and host load uncontrolled',
    maxWallMs, initialCheckpoint, finalCheckpoint,
    budget: { diskCapBytes: DISK_CAP_BYTES, tileReserveBytes: TILE_RESERVE_BYTES, freeReserveBytes: FREE_RESERVE_BYTES,
      generatedBefore, generatedAfter, freeBefore, freeAfter },
    results: { plannedTiles, publishedTiles, checkpointedTiles,
      resumedVerifiedTiles: prefixVerified ? (finalCheckpoint?.nextIndex ?? 0) - publishedTiles : null,
      wallMs, cpuUserMs: cpu.user / 1000, cpuSystemMs: cpu.system / 1000,
      peakRssBytes: process.resourceUsage().maxRSS * 1024, storage }, stop };
}

async function main() {
  if (process.argv.length !== 2) throw new Error('Full generation script takes no arguments');
  const trialBytes = await readFile(new URL('./trial-output.json', import.meta.url));
  const trial = JSON.parse(trialBytes);
  await mkdir(generatedRoot, { recursive: true });
  const selection = selectFullCoverage(trial, await storageUsage(generatedRoot), (await checkpoint(fullDirectory))?.nextIndex ?? 0);
  if (!selection.fitsDiskCap) {
    throw new Error(`Full-span allocation estimate ${selection.estimatedCoexistBytes} exceeds cap ${DISK_CAP_BYTES}; record this stop in PHASE2.md before selecting a smaller span`);
  }
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  let report, lastLog = 0;
  try {
    report = await runGenerationSession(selection.config, { signal: controller.signal, onProgress: async ({ phase, descriptor }) => {
      if (phase === 'checkpoint' && performance.now() - lastLog >= 30_000) {
        console.error(JSON.stringify({ checkpointedTiles: descriptor.index + 1, through: new Date(descriptor.endMs).toISOString() }));
        lastLog = performance.now();
      }
    } });
  } finally {
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
  }
  report.selection = { ...selection, trialSha256: createHash('sha256').update(trialBytes).digest('hex') };
  const reports = fileURLToPath(new URL('./full-sessions/', import.meta.url));
  await mkdir(reports, { recursive: true });
  const previous = (await readdir(reports)).filter(name => /^session-\d+\.json$/.test(name));
  const index = Math.max(0, ...previous.map(name => Number(name.match(/\d+/)[0]))) + 1;
  const path = join(reports, `session-${String(index).padStart(4, '0')}.json`);
  const bytes = Buffer.from(JSON.stringify(report, null, 2) + '\n');
  if (bytes.length >= 2_000_000) throw new Error('Session report exceeds file limit');
  const handle = await open(path, 'wx');
  try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
  console.log(JSON.stringify({ report: relative(repoRoot, path), status: report.status,
    checkpointedTiles: report.finalCheckpoint?.nextIndex ?? 0, plannedTiles: report.results.plannedTiles }));
  if (report.status === 'disk-stopped') process.exitCode = 2;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
