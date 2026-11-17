#!/usr/bin/env node
/*
 * Runs the conformance suite's 500 requests through @zodiacs/engine in Node,
 * Bun, Deno, Chromium, Firefox and WebKit, each through the unchanged harness
 * (conformance/harness/run.mjs) and the same adapter code, and writes for
 * each runtime its results file, the adapter's own lines and a summary that
 * compares it with Node's run. Exits 1 when a runtime's verdict differs from
 * Node's for a vector that does not depend on host zone data, when a run is
 * incomplete, or when Node's verdicts differ from the committed results.
 *
 *   node run-all.mjs --out <dir> [--runtimes node,bun,deno,chromium,firefox,webkit]
 *
 * Bun and Deno are the versions this folder's lockfile pins
 * (node_modules/.bin); the browsers are Playwright's, installed with
 * `npx playwright install --with-deps chromium firefox webkit`. Build the
 * engine first (`npm run build` at the repository root).
 *
 * Per runtime, <dir>/<runtime>/ holds results.json (the harness's results
 * file, whose adapter.runtime names the runtime and its version),
 * responses.jsonl (every line the adapter wrote) and summary.json. <dir>
 * holds matrix.json, every summary's headline in one file.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readSuite } from '../../conformance/harness/lib.mjs';
import { BROWSER_RUNTIMES, NATIVE_RUNTIMES, RUNTIMES, compareWithNode, readRaw } from './compare.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const COMMITTED = resolve(root, 'conformance/results/zodiacs-engine.json');

function option(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
}
const out = option('out');
const selected = option('runtimes', RUNTIMES.join(',')).split(',');
if (!out || selected.some((name) => !RUNTIMES.includes(name))) {
  console.error(`usage: run-all.mjs --out <dir> [--runtimes ${RUNTIMES.join(',')}]`);
  process.exit(2);
}
if (!selected.includes('node')) selected.unshift('node');
const outDir = resolve(out);

const quote = (word) => `'${String(word).replaceAll("'", "'\\''")}'`;
const BIN = { bun: resolve(here, 'node_modules/.bin/bun'), deno: resolve(here, 'node_modules/.bin/deno') };
/** The command that runs a script in a native runtime. */
const nativeCommand = (name, script) => ({
  node: [process.execPath, script],
  bun: [BIN.bun, script],
  deno: [BIN.deno, 'run', '-A', script],
})[name];

function run(command, args, { input } = {}) {
  return new Promise((fulfil) => {
    const child = spawn(command, args, { cwd: root, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; process.stderr.write(chunk); });
    child.on('error', (error) => fulfil({ code: 127, stdout, stderr: `${stderr}${error.message}` }));
    child.on('close', (code) => fulfil({ code, stdout, stderr }));
    child.stdin.end(input ?? '');
  });
}

const vectors = readSuite().flatMap((level) => level.file.vectors);
/** The runtime facts and receipt texts pass through here; they are not part of the evidence. */
const scratch = mkdtempSync(join(tmpdir(), 'runtime-conformance-'));
process.on('exit', () => rmSync(scratch, { recursive: true, force: true }));
const runs = {};
for (const name of RUNTIMES.filter((one) => selected.includes(one))) {
  const dir = resolve(outDir, name);
  mkdirSync(dir, { recursive: true });
  const files = { results: resolve(dir, 'results.json'), raw: resolve(dir, 'responses.jsonl'), runtime: resolve(scratch, `${name}.runtime.json`), receipts: resolve(scratch, `${name}.receipts.json`) };
  console.log(`\n== ${name}`);
  let adapter;
  if (NATIVE_RUNTIMES.includes(name)) {
    const [command, ...args] = nativeCommand(name, resolve(here, 'native-extras.mjs'));
    const extras = await run(command, args);
    if (extras.code !== 0) {
      runs[name] = { error: `native-extras.mjs failed in ${name} (status ${extras.code}): ${extras.stderr.trim().slice(-2000)}` };
      continue;
    }
    const parsed = JSON.parse(extras.stdout);
    writeFileSync(files.runtime, JSON.stringify(parsed.runtime));
    writeFileSync(files.receipts, JSON.stringify(parsed));
    adapter = [process.execPath, resolve(here, 'tee-adapter.mjs'), '--raw', files.raw, '--runtime', files.runtime, '--', ...nativeCommand(name, resolve(root, 'conformance/adapters/zodiacs-engine.mjs'))];
  } else {
    adapter = [process.execPath, resolve(here, 'tee-adapter.mjs'), '--raw', files.raw, '--', process.execPath, resolve(here, 'browser-adapter.mjs'), name, '--receipts', files.receipts];
  }
  const harness = await run(process.execPath, [resolve(root, 'conformance/harness/run.mjs'), '--adapter', adapter.map(quote).join(' '), '--out', files.results]);
  process.stdout.write(harness.stdout);
  if (harness.code !== 0) {
    runs[name] = { error: `the harness failed for ${name} (status ${harness.code}): ${harness.stderr.trim().slice(-2000)}` };
    continue;
  }
  runs[name] = {
    results: JSON.parse(readFileSync(files.results, 'utf8')),
    raw: readRaw(readFileSync(files.raw, 'utf8')),
    receipts: JSON.parse(readFileSync(files.receipts, 'utf8')).receipts,
  };
}

const failures = [];
const matrix = { suite: null, runtimes: {} };
const node = runs.node;
if (!node || node.error) {
  failures.push(`node: ${node?.error ?? 'did not run'}`);
} else {
  matrix.suite = { version: node.results.suiteVersion, vectors: node.results.vectors };
  const committed = JSON.parse(readFileSync(COMMITTED, 'utf8'));
  const before = new Map(committed.results.map((entry) => [entry.id, entry.verdict]));
  for (const entry of node.results.results) {
    if (before.get(entry.id) !== entry.verdict) failures.push(`node: ${entry.id} is ${entry.verdict} where conformance/results/zodiacs-engine.json has ${before.get(entry.id)}`);
  }
}
for (const name of RUNTIMES.filter((one) => selected.includes(one))) {
  const one = runs[name];
  if (one?.error || !node || node.error) {
    const error = one?.error ?? 'Node did not run, so nothing was compared';
    writeFileSync(resolve(outDir, name, 'summary.json'), `${JSON.stringify({ runtime: { name }, error, gate: { pass: false, problems: [error] } }, null, 2)}\n`);
    matrix.runtimes[name] = { error };
    failures.push(`${name}: ${error}`);
    continue;
  }
  const summary = compareWithNode({ vectors, node, runtime: one, expected: name });
  writeFileSync(resolve(outDir, name, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  matrix.runtimes[name] = {
    runtime: summary.runtime,
    verdicts: summary.verdicts.byLevel,
    differsFromNode: summary.differsFromNode.map(({ id, class: why, node: theirs, runtime: mine }) => ({ id, class: why, node: theirs, runtime: mine })),
    largestDifferenceFromNode: Object.fromEntries(Object.entries(summary.largestDifferenceFromNode).map(([kind, fields]) => [kind, Object.fromEntries(Object.entries(fields).map(([field, entry]) => [field, entry.unit === 'deg' ? { arcsec: entry.maxAbsArcsec ?? null, identical: `${entry.identical} of ${entry.compared}` } : entry.unit === 'exact' ? { identical: `${entry.identical} of ${entry.compared}` } : { [entry.unit]: entry.maxAbs ?? null, identical: `${entry.identical} of ${entry.compared}` }]))])),
    outputsIdenticalToNode: `${summary.outputsIdenticalToNode.identical} of ${summary.outputsIdenticalToNode.compared}`,
    receiptsSameAsNode: summary.receipts.allSameAsNode,
    gate: summary.gate.pass,
  };
  for (const problem of summary.gate.problems) failures.push(`${name}: ${problem}`);
}
for (const name of RUNTIMES.filter((one) => !selected.includes(one))) matrix.runtimes[name] = { notRun: true };
matrix.gate = { pass: failures.length === 0, failures };
writeFileSync(resolve(outDir, 'matrix.json'), `${JSON.stringify(matrix, null, 2)}\n`);

console.log('\nruntime   version          L1       L2       L3 (pass/unsupported)  differs  identical outputs  receipts');
for (const [name, row] of Object.entries(matrix.runtimes)) {
  if (row.notRun || row.error) {
    console.log(`${name.padEnd(9)} ${row.notRun ? 'not run' : `error: ${row.error.split('\n')[0]}`}`);
    continue;
  }
  const level = (id) => `${row.verdicts[id].pass}/${row.verdicts[id].count}`;
  console.log(`${name.padEnd(9)} ${String(row.runtime?.version).padEnd(16)} ${level('L1').padEnd(8)} ${level('L2').padEnd(8)} ${`${row.verdicts.L3.pass}/${row.verdicts.L3.unsupported}`.padEnd(22)} ${String(row.differsFromNode.length).padEnd(8)} ${row.outputsIdenticalToNode.padEnd(18)} ${row.receiptsSameAsNode ? 'same' : 'differ'}`);
}
if (failures.length) {
  console.error(`\nruntime conformance: ${failures.length} problem(s):\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log('\nruntime conformance: every runtime has Node\'s verdicts where the host\'s zone data is not read');
