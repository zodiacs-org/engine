import { createHash } from 'node:crypto';
import { access, lstat, mkdir, open, readFile, readdir, rmdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { environment } from './common.mjs';
import { availableBytes, checkBudget, DISK_CAP_BYTES, storageUsage } from './trial-support.mjs';

// Run only on the stopped flat dataset, before migration. This records a fresh
// filesystem probe, not reconstructed timings for the failed generation run.
if (process.argv.length !== 2) throw new Error('Layout diagnostic takes no arguments');
const directory = fileURLToPath(new URL('../generated/full/', import.meta.url));
try { await access(`${directory}/.lock`); throw new Error('A database writer lock exists'); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const manifestBytes = await readFile(`${directory}/manifest.json`);
const manifest = JSON.parse(manifestBytes);
if (manifest.version !== 1) throw new Error('Diagnostic requires the original flat layout');
const checkpoint = JSON.parse(await readFile(`${directory}/checkpoint.json`));
const entries = await readdir(directory);
const info = await lstat(directory);
let failure;
const probe = `${directory}/.layout-probe.tmp`;
try { await mkdir(probe); }
catch (error) {
  if (error.code !== 'EMLINK') throw error;
  failure = { code: error.code, errno: error.errno, syscall: error.syscall };
}
if (!failure) { await rmdir(probe); throw new Error('Directory link limit was not reproduced'); }
const generatedUsage = await storageUsage(fileURLToPath(new URL('../generated/', import.meta.url)));
const freeBytes = await availableBytes(directory);
checkBudget(generatedUsage, freeBytes);
const report = { version: 1, command: 'node skydb/benchmarks/layout-limit.mjs',
  measuredAt: new Date().toISOString(), runtime: environment(), directory: 'skydb/generated/full',
  method: 'Stopped writer; fresh mkdir probe reproduces EMLINK; counts and storage measured before layout migration; failed generation wall time and CPU were not captured',
  failure, checkpoint, manifestSha256: createHash('sha256').update(manifestBytes).digest('hex'),
  config: manifest.config, directoryEntries: entries.length,
  tileDirectories: entries.filter(name => /^tile-\d+$/.test(name)).length,
  directoryLinks: info.nlink, writerLockPresent: false,
  budget: { diskCapBytes: DISK_CAP_BYTES, generatedUsage, availableBytes: freeBytes } };
const output = fileURLToPath(new URL('./layout-limit-output.json', import.meta.url));
const handle = await open(output, 'wx');
try { await handle.writeFile(JSON.stringify(report, null, 2) + '\n'); await handle.sync(); }
finally { await handle.close(); }
console.log(JSON.stringify(report));
