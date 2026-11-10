import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { createElectionalServer } from '../build/index.js';

assert(process.version.startsWith('v22.'), 'Run executable evidence on Node 22.');
const project = fileURLToPath(new URL('../', import.meta.url));
const limits = JSON.parse(await readFile(new URL('../examples/http-policy.json', import.meta.url), 'utf8'));
const rules = await readFile(new URL('../examples/synthetic-hours.yaml', import.meta.url), 'utf8');
const controls = JSON.parse(await readFile(new URL('../examples/http-controls.json', import.meta.url), 'utf8'));
const requestBody = JSON.stringify({ format: 'yaml', rules, controls });
// Inspect each consumer entry's real static bundle graph. A future accidental
// import of internal annotation must fail even if transport tests hide fields.
for (const entry of ['src/index.ts', 'src/cli.ts', 'src/http-worker.ts']) {
  const bundle = await build({ entryPoints: [fileURLToPath(new URL(`../${entry}`, import.meta.url))],
    bundle: true, write: false, metafile: true, packages: 'external', format: 'esm', platform: 'node', target: 'node22' });
  assert(!Object.keys(bundle.metafile.inputs).some(path => path.endsWith('internal-scoring.ts')),
    'Consumer entries must exclude the internal scoring module.');
}
function checkFrames(text) {
  const frames = text.trim().split('\n').map(line => JSON.parse(line));
  assert.equal(frames.at(-1).type, 'end'); assert.equal(frames.at(-1).status, 'complete');
  const chunks = frames.filter(frame => frame.type === 'chunk');
  assert(chunks.length > 0);
  for (const chunk of chunks) {
    assert(!('scoring' in chunk.facts)); assert(!('ranking' in chunk.facts));
    assert(chunk.facts.receipts.length > 0);
    for (const fragment of chunk.fragments) {
      assert(!('score' in fragment)); assert(!('rank' in fragment)); assert(!('internalScore' in fragment));
      assert(fragment.explanations.every(e => !('contribution' in e)));
      assert(fragment.receipts.every(r => r.engine.ephemeris.version === '2.1.19'));
    }
  }
}
async function fetchFacts(port) {
  const response = await fetch(`http://127.0.0.1:${port}/electional/search`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: requestBody,
    signal: AbortSignal.timeout(20000),
  });
  assert.equal(response.status, 200); assert(response.headers.get('content-type').includes('application/x-ndjson'));
  const text = await response.text(); checkFrames(text); return text;
}
const server = createElectionalServer({ limits });
server.listen(0, '127.0.0.1'); await once(server, 'listening');
const libraryPort = server.address().port;
try { await fetchFacts(libraryPort); }
finally { await new Promise(resolve => server.close(resolve)); }

function executable(args) {
  const child = spawn(process.execPath, ['bin/electional-http.mjs', ...args], { cwd: project, stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '', stdout = '';
  child.stderr.setEncoding('utf8'); child.stdout.setEncoding('utf8');
  child.stderr.on('data', text => { stderr += text; }); child.stdout.on('data', text => { stdout += text; });
  const timeout = setTimeout(() => child.kill('SIGKILL'), 20000);
  const closed = once(child, 'close').then(([code, signal]) => { clearTimeout(timeout); return { code, signal, stdout, stderr }; });
  return { child, closed, get stderr() { return stderr; } };
}
for (const args of [[], ['examples/http-policy.json', '0'], ['examples/http-policy.json', 'NaN'],
  ['examples/http-policy.json', '8080', 'extra'], ['examples/private-missing-policy.json', '8080']]) {
  const result = await executable(args).closed;
  assert.equal(result.code, 1); assert.equal(result.stdout, ''); assert(result.stderr.startsWith('Usage:'));
  assert(!result.stderr.includes('private-missing'));
}
for (const signal of ['SIGINT', 'SIGTERM']) {
  // Reserve an OS-assigned loopback port, then release it for the executable.
  const reservation = createServer(); reservation.listen(0, '127.0.0.1'); await once(reservation, 'listening');
  const port = reservation.address().port; await new Promise(resolve => reservation.close(resolve));
  const processCheck = executable(['examples/http-policy.json', String(port)]);
  try {
    // The ready message is emitted only after listen succeeds. The close event
    // also settles this wait if startup fails instead of leaving a live child.
    while (!processCheck.stderr.includes('listening on')) {
      const event = await Promise.race([once(processCheck.child.stderr, 'data').then(() => 'data'), processCheck.closed.then(() => 'closed')]);
      assert.equal(event, 'data', 'Executable must start listening.');
    }
    await fetchFacts(port);
    processCheck.child.kill(signal);
    const result = await processCheck.closed;
    assert.equal(result.code, 0); assert.equal(result.signal, null); assert.equal(result.stdout, '');
  } finally { if (processCheck.child.exitCode === null) processCheck.child.kill('SIGKILL'); }
}
const record = { schema: 'electional-m13-http-esm/v1', runtime: process.version, status: 'passed',
  checks: ['built import-safe factory with native worker', 'loopback executable native receipt transport',
    'strict startup inputs and bounded errors', 'SIGINT and SIGTERM shutdown', 'facts-only output',
    'consumer import graphs exclude internal-scoring'],
  reference: 'Synthetic all-ruler hours example: select every ruler, without astronomical golden positions',
  ruleDocument: 'examples/synthetic-hours.yaml', controls: 'examples/http-controls.json', policy: 'examples/http-policy.json',
  scope: 'Executable and HTTP transport behavior only; no astronomical accuracy or performance claim.' };
await writeFile(new URL('../generated/m13-http-esm.json', import.meta.url), JSON.stringify(record, null, 2) + '\n');
console.log('Built HTTP factory, native worker, loopback executable, facts-only receipts and signal shutdown passed.');
