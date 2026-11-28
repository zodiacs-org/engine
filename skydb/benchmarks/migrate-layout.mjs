import { access, open, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { release, totalmem } from 'node:os';
import { environment } from './common.mjs';
import { availableBytes, checkBudget, DISK_CAP_BYTES, storageUsage } from './trial-support.mjs';
import { migrateDatabaseLayout } from '../src/migrate-layout.mjs';

if (process.argv.length !== 2) throw new Error('Migration measurement takes no arguments');
const runtime = { ...environment(), osRelease: release(), memoryBytes: totalmem(), generatorProcesses: 1 };
const root = fileURLToPath(new URL('../generated/', import.meta.url));
const directory = fileURLToPath(new URL('../generated/full/', import.meta.url));
const output = fileURLToPath(new URL('./layout-migration-output.json', import.meta.url));
try { await access(output); throw new Error('Migration report already exists'); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const startedAt = new Date().toISOString(), started = performance.now(), cpuStart = process.cpuUsage();
const before = { usage: await storageUsage(root), availableBytes: await availableBytes(root),
  manifestSha256: createHash('sha256').update(await readFile(`${directory}/manifest.json`)).digest('hex'),
  checkpoint: JSON.parse(await readFile(`${directory}/checkpoint.json`)) };
checkBudget(before.usage, before.availableBytes);
let callbacks = 0, lastLog = 0;
const controller = new AbortController();
const stop = () => controller.abort();
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
let result;
try { result = await migrateDatabaseLayout(directory, { signal: controller.signal, onProgress: async progress => {
  callbacks++;
  if (performance.now() - lastLog >= 30_000) {
    console.error(JSON.stringify({ phase: progress.phase, callbacks }));
    lastLog = performance.now();
  }
  if (callbacks % 8192 === 0) checkBudget(await storageUsage(root), await availableBytes(root));
} }); } finally {
  process.removeListener('SIGINT', stop);
  process.removeListener('SIGTERM', stop);
}
const after = { usage: await storageUsage(root), availableBytes: await availableBytes(root),
  manifestSha256: createHash('sha256').update(await readFile(`${directory}/manifest.json`)).digest('hex'),
  checkpoint: JSON.parse(await readFile(`${directory}/checkpoint.json`)) };
checkBudget(after.usage, after.availableBytes);
const cpu = process.cpuUsage(cpuStart);
const report = { version: 1, command: 'node skydb/benchmarks/migrate-layout.mjs', startedAt,
  finishedAt: new Date().toISOString(), runtime, directory: 'skydb/generated/full',
  method: 'One sequential migration; verifies receipts and tile contents before directory renames; wall and CPU include whole-generated storage walks and metadata rebinding; no tile recomputation or copies; failed earlier generation timings unavailable',
  diskCapBytes: DISK_CAP_BYTES, before, after, migration: result,
  results: { wallMs: performance.now() - started, cpuUserMs: cpu.user / 1000,
    cpuSystemMs: cpu.system / 1000, peakRssBytes: process.resourceUsage().maxRSS * 1024 } };
const bytes = Buffer.from(JSON.stringify(report, null, 2) + '\n');
if (bytes.length >= 2_000_000) throw new Error('Migration report exceeds file limit');
const handle = await open(output, 'wx');
try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
console.log(JSON.stringify({ report: 'skydb/benchmarks/layout-migration-output.json',
  checkpointedTiles: after.checkpoint.nextIndex, manifestSha256: after.manifestSha256,
  generatedAllocatedBytes: after.usage.allocatedBytes }));
