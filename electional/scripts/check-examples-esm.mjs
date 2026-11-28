import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { loadEventsCapability, parseRuleSet } from '../build/index.js';

assert(process.version.startsWith('v22.'), 'Run example evidence on Node 22.');
const project = fileURLToPath(new URL('../', import.meta.url));
const read = file => readFile(new URL(`../${file}`, import.meta.url), 'utf8');
const events = await loadEventsCapability();
const forbidden = /"(?:score|rank|ranking|scoring|contribution|internalScore|chunkRank)"\s*:/u;
const graphEntries = ['src/index.ts', 'src/cli-main.ts', 'src/http.ts', 'src/http-worker.ts',
  'examples/library.mjs', 'examples/http.mjs'];
for (const entry of graphEntries) {
  const result = await build({ entryPoints: [fileURLToPath(new URL(`../${entry}`, import.meta.url))],
    bundle: true, write: false, metafile: true, packages: 'external', platform: 'node', format: 'esm', target: 'node22' });
  assert(!Object.keys(result.metafile.inputs).some(path => /internal-scoring\.(?:ts|js)$/u.test(path)),
    'Consumer and example imports must exclude internal scoring.');
}

// Consume one line at a time, without collecting a month of receipt payloads
// in memory or writing raw sky results to committed files.
async function execute(args, config, controls) {
  const from = Date.parse(config.range.start), to = Date.parse(config.range.end);
  let cursor = from, fragmentCount = 0, chunks = 0, evaluations = 0, samples = 0, terminal;
  let tail, lastId = 0, pending = '', stderr = '', maxLineBytes = 0;
  const child = spawn(process.execPath, args, { cwd: project, stdio: ['ignore', 'pipe', 'pipe'] });
  let stoppedForDeadline = false;
  const timeout = setTimeout(() => { stoppedForDeadline = true; child.kill('SIGKILL'); }, 60000);
  child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
  const closed = new Promise((resolve, reject) => { child.once('error', reject); child.once('close', (code, signal) => resolve({ code, signal })); });
  child.stderr.on('data', text => { stderr += text; if (stderr.length > 8192) child.kill('SIGKILL'); });
  function checkLine(line) {
    assert(line.length > 0); assert(!terminal, 'No frames may follow the terminal frame.');
    assert(!forbidden.test(line), 'Default output must have no scoring or ranking fields.');
    const frame = JSON.parse(line);
    if (frame.type === 'end') { terminal = frame; return; }
    assert.equal(frame.type, 'chunk'); assert.equal(frame.index, chunks++);
    assert.equal(frame.facts.window.clock, 'utc'); assert.equal(frame.facts.window.startMs, cursor);
    assert.equal(frame.facts.window.endMs, Math.min(cursor + controls.chunkMs, to));
    assert(['complete', 'unresolved'].includes(frame.facts.status), 'Example work allowance must be sufficient.');
    // Every possible ruler is selected by the required rule at this nonpolar
    // synthetic place. Full resolved coverage follows by set membership;
    // no astronomical boundary is pinned as an expected value.
    assert.deepEqual(frame.facts.eligible, [{ startMs: cursor, endMs: frame.facts.window.endMs }]);
    assert.deepEqual(frame.facts.excluded, []); assert.deepEqual(frame.facts.unresolvedRequired, []);
    assert(frame.facts.receipts.length > 0);
    const actualUnknown = frame.facts.ruleResults.some(rule => rule.status !== 'complete');
    assert.equal(frame.facts.status, actualUnknown ? 'unresolved' : 'complete');
    const bytes = Buffer.byteLength(line, 'utf8'); maxLineBytes = Math.max(maxLineBytes, bytes);
    assert(bytes <= controls.maxFrameBytes);
    evaluations += frame.facts.evaluations;
    samples += frame.facts.ruleResults.reduce((sum, rule) => sum + (rule.samples ?? 0), 0);
    assert.equal(frame.cumulative.evaluations, evaluations); assert.equal(frame.cumulative.skySamples, samples);
    for (const fragment of frame.fragments) {
      assert.equal(fragment.startMs, cursor); assert(fragment.endMs > cursor);
      assert.equal(fragment.explanations.length, config.rules.length);
      assert(fragment.receipts.length > 0);
      assert(fragment.receipts.every(receipt => receipt.engine.ephemeris.version === '2.1.19'));
      assert(fragment.explanations.every(e => ['satisfied', 'failed', 'unresolved'].includes(e.state)
        && !/\b(?:best|good|favourable|favorable|recommended)\b/iu.test(e.text)));
      assert.equal(fragment.explanations.find(e => e.rule.id === 'known-hour').state, 'satisfied');
      if (fragment.continuedFromPrevious) {
        assert(tail); assert.equal(fragment.windowId, tail.id);
        assert.deepEqual(fragment.explanations.map(e => e.state), tail.states);
      } else { assert.equal(fragment.windowId, lastId + 1); lastId++; }
      tail = { id: fragment.windowId, states: fragment.explanations.map(e => e.state) };
      cursor = fragment.endMs; fragmentCount++;
    }
    assert.equal(cursor, frame.facts.window.endMs);
  }
  try {
    for await (const text of child.stdout) {
      pending += text;
      let newline;
      while ((newline = pending.indexOf('\n')) >= 0) {
        checkLine(pending.slice(0, newline)); pending = pending.slice(newline + 1);
      }
      assert(Buffer.byteLength(pending, 'utf8') <= controls.maxFrameBytes);
    }
    const ended = await closed;
    assert(!stoppedForDeadline, 'Example process deadline exceeded.');
    assert.equal(ended.signal, null); assert.equal(stderr, ''); assert.equal(pending, ''); assert(terminal);
    assert(['complete', 'unresolved'].includes(terminal.status));
    assert.equal(ended.code, terminal.status === 'complete' ? 0 : 2);
    assert.equal(cursor, to); assert.equal(terminal.remaining, null); assert.equal(terminal.reason, null);
    assert.equal(terminal.chunks, Math.ceil((to - from) / controls.chunkMs));
    assert.equal(terminal.evaluations, evaluations); assert.equal(terminal.skySamples, samples);
    assert(chunks > 0 && fragmentCount >= chunks);
    return { command: `node ${args.join(' ')}`, status: 'passed', terminalStatus: terminal.status,
      range: config.range, chunks, fragmentCount, evaluations, skySamples: samples, maxChunkBytes: maxLineBytes,
      reference: 'All-ruler required-set membership, chronology, native receipt transport and inherited source assumptions; no pinned ephemeris boundaries.' };
  } finally {
    clearTimeout(timeout);
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    await closed;
  }
}
const runs = [];
for (const [name, file, format, controlFile] of [
  ['hours', 'synthetic-hours.yaml', 'yaml', 'controls.json'],
  ['conditions', 'synthetic-conditions.json', 'json', 'conditions-controls.json'],
  ['long-range', 'synthetic-long-range.yaml', 'yaml', 'controls.json'],
]) {
  const rules = parseRuleSet(await read(`examples/${file}`), format);
  const controls = JSON.parse(await read(`examples/${controlFile}`));
  runs.push(await execute(['examples/library.mjs', name], rules, controls));
  runs.push(await execute(['bin/electional.mjs', 'search', '--rules', `examples/${file}`, '--controls', `examples/${controlFile}`], rules, controls));
}
runs.push(await execute(['examples/http.mjs'], parseRuleSet(await read('examples/synthetic-hours.yaml'), 'yaml'),
  JSON.parse(await read('examples/http-controls.json'))));
const record = { schema: 'electional-m14-examples/v1', runtime: process.version, status: 'passed',
  command: 'node scripts/check-examples-esm.mjs', consumerGraphs: graphEntries,
  events: events.status === 'missing' ? { status: 'missing' } : { status: 'available', source: events.source },
  runs, scope: 'Built executable examples and a native all-ruler month, not astronomical accuracy, exhaustive event completeness, heap or throughput measurements. Raw results are consumed and discarded; only check summaries are recorded.' };
await writeFile(new URL('../generated/m14-examples.json', import.meta.url), JSON.stringify(record, null, 2) + '\n');
console.log('Built library, CLI and loopback HTTP examples passed, including chronological native monthly hours and isolated consumer graphs.');
