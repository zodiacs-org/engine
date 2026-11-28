import { mkdir, mkdtemp } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, relative, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { release, totalmem } from 'node:os';
import { environment } from './common.mjs';
import { createConfig } from '../src/config.mjs';
import { loadEngine } from '../src/engine.mjs';
import { generateDatabase } from '../src/store.mjs';
import { storageUsage, availableBytes, checkBudget, projectFullCost, tileCount,
  DISK_CAP_BYTES, TILE_RESERVE_BYTES, FREE_RESERVE_BYTES } from './trial-support.mjs';

export const TRIAL_CONFIG = createConfig({
  startMs: Date.parse('1970-01-01T00:00:00Z'), endMs: Date.parse('1980-01-01T00:00:00Z')
});
const generatedRoot = fileURLToPath(new URL('../generated/', import.meta.url));
const repoRoot = fileURLToPath(new URL('../../', import.meta.url));

export async function runTrial(config = TRIAL_CONFIG, { onProgress = async () => {} } = {}) {
  const runtime = { ...environment(), osRelease: release(), memoryBytes: totalmem(), generatorProcesses: 1 };
  config = createConfig(config);
  await mkdir(generatedRoot, { recursive: true });
  const generatedBefore = await storageUsage(generatedRoot);
  const freeBefore = await availableBytes(generatedRoot);
  checkBudget(generatedBefore, freeBefore);
  // Validate workload before writing a fresh directory. Never time a resumed run.
  projectFullCost({ config, tiles: tileCount(config), wallMs: 1, cpuUserMs: 0, cpuSystemMs: 0,
    storage: { bytes: 1, allocatedBytes: 1 }, generatedBefore });
  await loadEngine();
  const directory = await mkdtemp(join(generatedRoot, 'trial-'));
  const usage = { ...generatedBefore };
  const start = performance.now(), cpuStart = process.cpuUsage();
  const generation = await generateDatabase(directory, config, { onProgress: async progress => {
    if (progress.phase === 'published') {
      const tile = await storageUsage(progress.tileDirectory);
      for (const field of Object.keys(usage)) usage[field] += tile[field];
    }
    if (progress.phase === 'checkpoint') {
      // Reserve covers manifest/checkpoints and staging, absent from the running tile sum.
      if (progress.descriptor.endMs < config.endMs) checkBudget(usage, await availableBytes(generatedRoot));
      await onProgress({ ...progress, directory });
    }
  } });
  const cpu = process.cpuUsage(cpuStart);
  const wallMs = performance.now() - start;
  const storage = await storageUsage(directory);
  const measured = { config, tiles: generation.tileCount, wallMs,
    cpuUserMs: cpu.user / 1000, cpuSystemMs: cpu.system / 1000, storage, generatedBefore };
  return { version: 1, measurement: 'Fresh default-workload trial and linear full-span cost arithmetic',
    command: 'node skydb/benchmarks/trial.mjs > skydb/benchmarks/trial-output.json',
    runtime, directory: relative(repoRoot, directory), config,
    method: 'One sequential generator; engine load and final storage walk excluded; positions, events, compression, persistence, disk guards and progress included; filesystem cache and host load uncontrolled',
    budget: { diskCapBytes: DISK_CAP_BYTES, tileReserveBytes: TILE_RESERVE_BYTES,
      freeReserveBytes: FREE_RESERVE_BYTES, freeBefore, generatedBefore,
      generatedAfter: await storageUsage(generatedRoot) },
    results: { tiles: measured.tiles, wallMs, cpuUserMs: measured.cpuUserMs, cpuSystemMs: measured.cpuSystemMs,
      cpuPercentOfOneCore: (cpu.user + cpu.system) / (wallMs * 10),
      peakRssBytes: process.resourceUsage().maxRSS * 1024, storage },
    fullSpanEstimate: projectFullCost(measured),
    estimateMethod: 'Multiply trial totals by full planner tile count / measured trial tiles, rounding storage up; fixed metadata is scaled too; assumes similar event density, compression, hardware and load; excludes resume verification, later verification and query costs; not a full-run measurement or upper bound' };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 2) throw new Error('Trial script takes no arguments');
  let lastLog = 0;
  const report = await runTrial(TRIAL_CONFIG, { onProgress: async ({ descriptor }) => {
    if (performance.now() - lastLog > 30_000) {
      console.error(JSON.stringify({ completedTiles: descriptor.index + 1, through: new Date(descriptor.endMs).toISOString() }));
      lastLog = performance.now();
    }
  } });
  console.log(JSON.stringify(report, null, 2));
}
