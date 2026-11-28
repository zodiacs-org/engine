import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { parseRuleSet, RULE_LIMITS } from '../build/index.js';

assert(process.version.startsWith('v22.'), 'Check the executable on its declared Node 22 runtime.');
const project = fileURLToPath(new URL('../', import.meta.url));
const executable = fileURLToPath(new URL('../bin/electional.mjs', import.meta.url));
const run = async args => {
  try {
    const result = await promisify(execFile)(process.execPath, [executable, ...args], { cwd: project, timeout: 20000, maxBuffer: 2000000 });
    return { code: 0, ...result };
  } catch (error) {
    if (!Number.isInteger(error.code)) throw error;
    return { code: error.code, stdout: error.stdout, stderr: error.stderr };
  }
};
await mkdir(new URL('../generated/', import.meta.url), { recursive: true });
const directory = await mkdtemp(join(fileURLToPath(new URL('../generated/', import.meta.url)), 'cli-esm-'));
try {
  const help = await run(['help']); assert.equal(help.code, 0); assert(help.stdout.includes('facts-only')); assert.equal(help.stderr, '');
  const catalog = await run(['presets']); assert.equal(catalog.code, 0);
  assert.deepEqual(JSON.parse(catalog.stdout).map(pack => pack.name), ['launch', 'contract-signing', 'travel']);
  for (const name of ['launch', 'contract-signing', 'travel']) {
    const pack = await run(['preset', name, '--start', '2000-01-02T06:00:00Z', '--end', '2000-01-02T07:00:00Z',
      '--latitude', '0', '--longitude', '0', '--house-system', 'whole', '--utc-offset-minutes', '0']);
    assert.equal(pack.code, 0); assert.equal(pack.stderr, ''); parseRuleSet(pack.stdout, 'json');
    const path = join(directory, `${name}.json`); await writeFile(path, pack.stdout);
    const validated = await run(['validate', '--rules', path]); assert.equal(validated.code, 0);
    assert.deepEqual(JSON.parse(validated.stdout), { status: 'valid', schemaVersion: 'electional/v1' });
  }
  const example = parseRuleSet(await readFile(new URL('../examples/synthetic-hours.yaml', import.meta.url), 'utf8'), 'yaml');
  const controls = JSON.parse(await readFile(new URL('../examples/controls.json', import.meta.url), 'utf8'));
  const validation = await run(['validate', '--rules', 'examples/synthetic-hours.yaml']); assert.equal(validation.code, 0);
  const search = await run(['search', '--rules', 'examples/synthetic-hours.yaml', '--controls', 'examples/controls.json']);
  assert.equal(search.code, 0, search.stderr); assert.equal(search.stderr, '');
  const frames = search.stdout.trim().split('\n').map(line => JSON.parse(line));
  assert.equal(frames.length, 2); assert.equal(frames[0].type, 'chunk'); assert.equal(frames[1].type, 'end');
  assert.equal(frames[1].status, 'complete'); assert.equal(frames[1].remaining, null);
  // Selecting every possible classical ruler independently implies full
  // eligibility wherever the source establishes an hour, without pinning an
  // engine-produced astronomical instant as an accuracy expectation.
  assert.deepEqual(frames[0].facts.eligible, [{ startMs: Date.parse(example.range.start), endMs: Date.parse(example.range.end) }]);
  assert(frames[0].fragments.length > 0); assert(frames[0].facts.receipts.length > 0);
  assert(frames[0].facts.receipts.every(receipt => receipt.engine.ephemeris.version === '2.1.19'));
  assert(!('scoring' in frames[0].facts)); assert(!('ranking' in frames[0].facts));
  assert(frames[0].fragments.every(fragment => !('internalScore' in fragment) && !('chunkRank' in fragment)
    && fragment.receipts.length > 0 && fragment.explanations.every(e => !('contribution' in e))));
  // Bound the read in the real executable, including multibyte UTF-8.
  const oversized = join(directory, 'oversized.json'); await writeFile(oversized, 'é'.repeat(RULE_LIMITS.documentBytes / 2 + 1));
  const rejected = await run(['validate', '--rules', oversized]); assert.equal(rejected.code, 1); assert.equal(rejected.stdout, '');
  assert(!rejected.stderr.includes(directory));
  const bad = await run(['validate', '--rules', 'private-secret-file.json']); assert.equal(bad.code, 1); assert.equal(bad.stdout, '');
  assert(!bad.stderr.includes('private-secret')); assert(!bad.stderr.includes('Error:'));
  const longRulePath = join(directory, 'long.json'), controlsPath = join(directory, 'controls.json');
  await writeFile(longRulePath, JSON.stringify({ ...example, range: { ...example.range, end: '2000-02-01T00:00:00Z' } }));
  await writeFile(controlsPath, JSON.stringify({ ...controls, chunkMs: 60000, maxChunks: 100000, maxEvaluations: 100000, maxSkySamples: 1000000 }));
  async function interruptAfterFirstLine(signal) {
    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [executable, 'search', '--rules', longRulePath, '--controls', controlsPath], { cwd: project });
      let stdout = '', stderr = '', interrupted = false;
      const timeout = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('Executable did not stop at a chunk boundary.')); }, 20000);
      child.on('error', error => { clearTimeout(timeout); reject(error); });
      child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
      child.stdout.on('data', text => {
        stdout += text;
        if (!interrupted && stdout.includes('\n')) { interrupted = true; child.kill(signal); }
      });
      child.stderr.on('data', text => { stderr += text; });
      child.on('close', (code, terminatingSignal) => { clearTimeout(timeout); resolve({ code, terminatingSignal, stdout, stderr }); });
    });
  }
  for (const [signal, expected] of [['SIGINT', 130], ['SIGTERM', 143]]) {
    const stopped = await interruptAfterFirstLine(signal);
    assert.equal(stopped.code, expected, stopped.stderr); assert.equal(stopped.terminatingSignal, null);
    assert.equal(stopped.stderr, '');
    const terminal = stopped.stdout.trim().split('\n').map(line => JSON.parse(line)).at(-1);
    assert.equal(terminal.type, 'end'); assert.equal(terminal.reason, 'cancelled'); assert.equal(terminal.status, 'refused');
    assert(terminal.remaining);
  }
  const broken = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [executable, 'search', '--rules', longRulePath, '--controls', controlsPath], { cwd: project });
    let stderr = '';
    const timeout = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('Broken pipe did not stop the executable.')); }, 20000);
    child.on('error', error => { clearTimeout(timeout); reject(error); });
    child.stderr.setEncoding('utf8'); child.stderr.on('data', text => { stderr += text; });
    child.stdout.once('data', () => child.stdout.destroy());
    child.on('close', (code, signal) => { clearTimeout(timeout); resolve({ code, signal, stderr }); });
  });
  assert.equal(broken.code, 1, broken.stderr); assert.equal(broken.signal, null); assert(!broken.stderr.includes('Error:'));
  const record = { schema: 'electional-m12-cli-esm-record/v1', runtime: process.version,
    command: 'node scripts/check-cli-esm.mjs', status: 'passed',
    checked: ['help', 'catalog', 'preset JSON round trips', 'YAML validation', 'native facts-only hour search and receipts',
      'bounded UTF-8 reads', 'value-free errors', 'SIGINT cancellation', 'SIGTERM cancellation', 'broken pipe'],
    nativeSpan: example.range, location: example.location,
    reference: 'All-ruler set membership and transport invariants, no pinned engine astronomical instants.',
    scope: 'Executable transport and native receipt preservation, not astronomical accuracy or exhaustive completeness.' };
  await writeFile(new URL('../generated/m12-cli-esm.json', import.meta.url), JSON.stringify(record, null, 2) + '\n');
  console.log('Built CLI ESM, presets, JSON/YAML validation, native facts/receipts, read bounds, signals and broken pipe passed.');
} finally { await rm(directory, { recursive: true, force: true }); }
