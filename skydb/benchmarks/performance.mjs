import { performance } from 'node:perf_hooks';
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { environment, withWorkspace, hour } from './common.mjs';
import { createConfig } from '../src/config.mjs';
import { generateDatabase } from '../src/store.mjs';
import { verifyDatabase } from '../src/verify.mjs';
import { openDatabase } from '../src/query.mjs';
import { loadEngine } from '../src/engine.mjs';
if (process.argv.length !== 2) throw new Error('Benchmark script takes no arguments');
const runtime = environment();
async function timed(task) { const start = performance.now(); const value = await task(); return { elapsedMs: performance.now() - start, value }; }
async function size(directory) {
  let bytes = 0, files = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) { const child = await size(path); bytes += child.bytes; files += child.files; }
    else { bytes += (await stat(path)).size; files++; }
  }
  return { bytes, files };
}
const config = createConfig({ startMs: Date.parse('2001-01-01T00:00:00Z'), endMs: Date.parse('2001-01-03T00:00:00Z'), stepMs: hour, tileMs: 24 * hour });
const engine = await loadEngine(); // Setup and module load excluded from timings.
const results = await withWorkspace(async directory => {
  const generation = await timed(() => generateDatabase(directory, config));
  const resume = await timed(() => generateDatabase(directory, config));
  const verification = await timed(() => verifyDatabase(directory));
  const opening = await timed(() => openDatabase(directory, { cacheTiles: 2 }));
  const database = opening.value;
  const instants = Array.from({ length: 200 }, (_, i) => config.startMs + (i * 7919 * 1000) % (config.endMs - config.startMs));
  const firstPass = await timed(async () => { for (const at of instants) await database.positions(at); });
  const warmPass = await timed(async () => { for (const at of instants) await database.positions(at); });
  const direct = await timed(() => { for (const at of instants) engine.sample(at, config); });
  const events = await timed(async () => { let count = 0; for await (const event of database.events(config.startMs, config.endMs)) count++; return count; });
  return { generationMs: generation.elapsedMs, verifiedResumeMs: resume.elapsedMs,
    verification: { elapsedMs: verification.elapsedMs, ...verification.value }, openMs: opening.elapsedMs,
    positionQueries: { count: instants.length, schedule: 'start + (index * 7919000) modulo range duration',
      firstPassMs: firstPass.elapsedMs, warmPassMs: warmPass.elapsedMs, directEngineMs: direct.elapsedMs },
    eventQuery: { elapsedMs: events.elapsedMs, count: events.value }, storage: await size(directory), cache: database.cacheInfo() };
});
console.log(JSON.stringify({ version: 1, measurement: 'Single local workload; no full-dataset estimate', runtime, config,
  method: 'Sequential calls, no timed warmup, engine loaded before timing; first pass has empty application cache, OS cache uncontrolled; warm pass reuses decoded tiles; generation includes positions, events and persistence', results }, null, 2));
