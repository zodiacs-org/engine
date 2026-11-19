/*
 * Self-test of the comparison and the browser bundle, with Node alone (no
 * browser, Bun or Deno): node --test tools/runtime-conformance/selftest.mjs
 * after `npm run build` at the repository root.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { judge, readSuite, runAdapter, summarize } from '../../conformance/harness/lib.mjs';
import { bundlePage } from './bundle.mjs';
import { compareWithNode, dependsOnHostZoneData, fieldDifference } from './compare.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const vectors = readSuite().flatMap((level) => level.file.vectors);
const { adapter, responses } = await runAdapter(`${JSON.stringify(process.execPath)} conformance/adapters/zodiacs-engine.mjs`, vectors, { cwd: root });

/** A run as run-all.mjs reads it, from answers by id: the results document as run.mjs builds it, and the raw lines. */
function makeRun(answers, runtimeName) {
  const results = vectors.map((vector) => {
    const judged = judge(vector, answers.get(vector.id));
    return { id: vector.id, verdict: judged.verdict, ...(judged.detail ? { detail: judged.detail } : {}), residual: judged.residual };
  });
  return {
    results: { adapter: { ...adapter, runtime: { name: runtimeName, version: 'test' } }, vectors: {}, summary: summarize(vectors, results), results },
    raw: { header: null, answers, repeated: [] },
    receipts: [{ id: 'R1', text: 'same' }],
  };
}
const clone = (answers) => new Map([...answers].map(([id, answer]) => [id, structuredClone(answer)]));
const node = makeRun(responses, 'node');
const compare = (runtime, expected = 'webkit') => compareWithNode({ vectors, node, runtime, expected });

test('Node against itself: every verdict and value the same, gate passes', () => {
  const summary = compare(makeRun(clone(responses), 'webkit'));
  assert.equal(summary.gate.pass, true, summary.gate.problems.join('; '));
  assert.equal(summary.differsFromNode.length, 0);
  assert.equal(summary.outputsIdenticalToNode.identical, summary.outputsIdenticalToNode.compared);
  assert.equal(summary.requests.answered, vectors.length);
  assert.equal(summary.receipts.allSameAsNode, true);
});

test('one L1 longitude moved by 2 arcseconds fails the gate, naming the vector', () => {
  const answers = clone(responses);
  const target = vectors.find((vector) => vector.kind === 'position.apparent.ecliptic-true-of-date');
  answers.get(target.id).output.lon += 2 / 3600;
  const summary = compare(makeRun(answers, 'webkit'));
  assert.equal(summary.gate.pass, false);
  assert.deepEqual(summary.differsFromNode.map(({ id, class: why, node: theirs, runtime }) => [id, why, theirs, runtime]), [[target.id, 'engine', 'pass', 'fail']]);
  const lon = summary.largestDifferenceFromNode['position.apparent.ecliptic-true-of-date'].lon;
  assert.equal(lon.at, target.id);
  assert.ok(Math.abs(lon.maxAbsArcsec - 2) < 1e-6);
});

test('a zone vector from 1970 on that flips is host data and does not fail; one before 1970 does', () => {
  const late = vectors.find((vector) => vector.kind === 'time.zone-offset' && dependsOnHostZoneData(vector) && 'utc_offset_s' in vector.expected);
  const early = vectors.find((vector) => vector.id === 'L3-TZ-0001');
  assert.equal(dependsOnHostZoneData(early), false);
  assert.equal(dependsOnHostZoneData(vectors.find((vector) => vector.id === 'L3-TZ-0045')), true);
  for (const [vector, pass, why] of [[late, true, 'host data'], [early, false, 'engine']]) {
    const answers = clone(responses);
    answers.get(vector.id).output.utc_offset_s += 3600;
    const summary = compare(makeRun(answers, 'webkit'));
    assert.equal(summary.gate.pass, pass, vector.id);
    assert.equal(summary.differsFromNode[0].class, why);
    assert.equal(summary.differsFromNode[0].id, vector.id);
  }
});

test('a zone vector from 1970 on that turns into an error or unsupported fails the gate', () => {
  const late = vectors.find((vector) => vector.kind === 'time.zone-offset' && dependsOnHostZoneData(vector));
  for (const answer of [{ id: late.id, error: 'Could not read UTC offset for timezone' }, { id: late.id, unsupported: 'no longOffset' }]) {
    const answers = clone(responses);
    answers.set(late.id, answer);
    const summary = compare(makeRun(answers, 'webkit'));
    assert.equal(summary.gate.pass, false, JSON.stringify(answer));
    assert.equal(summary.differsFromNode[0].id, late.id);
    assert.equal(summary.differsFromNode[0].class, 'engine');
  }
});

test("a results file swapped with another runtime's is caught by its runtime name", () => {
  const summary = compare(makeRun(clone(responses), 'firefox'), 'webkit');
  assert.equal(summary.gate.pass, false);
  assert.match(summary.gate.problems[0], /names runtime firefox, not webkit/u);
});

test('every request answered exactly once: a missing answer fails', () => {
  const answers = clone(responses);
  answers.delete(vectors[7].id);
  const run = makeRun(answers, 'webkit');
  const summary = compare(run);
  assert.equal(summary.gate.pass, false);
  assert.ok(summary.gate.problems.some((problem) => problem.includes(`answered ${vectors.length - 1} distinct ids`)));
});

test('differences wrap at 360 degrees and take the largest cusp', () => {
  const rule = { abs: 1, unit: 'arcsec', wrap: 360 };
  assert.ok(Math.abs(fieldDifference(rule, 359.9999, 0.0001).abs - 0.0002) < 1e-12);
  assert.deepEqual(fieldDifference({ exact: true }, 'ok', 'ok'), { identical: true, abs: null });
  assert.equal(fieldDifference({ each: rule }, [1, 2, 3], [1, 2.5, 3]).abs, 0.5);
});

test('the browser bundle answers every request as the Node adapter does, tzdb shards included', async () => {
  const warnings = [];
  const assets = await bundlePage({ warnings });
  assert.ok([...assets.keys()].filter((path) => path.endsWith('.js')).length > 2, 'the tzdb shards stay separate chunks');
  const dir = mkdtempSync(join(tmpdir(), 'runtime-conformance-bundle-'));
  try {
    for (const [path, asset] of assets) if (path !== '/') writeFileSync(join(dir, path.slice(1)), asset.body);
    await import(pathToFileURL(join(dir, 'page-entry.js')).href);
    const page = globalThis.runtimeConformance;
    assert.equal(page.header().engineVersion, adapter.engineVersion);
    for (const vector of vectors) {
      const answer = await page.answer({ id: vector.id, kind: vector.kind, input: vector.input });
      assert.deepEqual(answer, responses.get(vector.id), vector.id);
    }
    assert.equal(page.receipts().length, 5);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the core browser bundle uses the same entry and handlers as the native core adapter', async () => {
  const { adapter: coreAdapter, responses: coreResponses } = await runAdapter(
    `${JSON.stringify(process.execPath)} conformance/adapters/zodiacs-engine.mjs --entry core`, vectors, { cwd: root },
  );
  const assets = await bundlePage({ entry: 'core' });
  const dir = mkdtempSync(join(tmpdir(), 'runtime-conformance-core-bundle-'));
  try {
    for (const [path, asset] of assets) if (path !== '/') writeFileSync(join(dir, path.slice(1)), asset.body);
    await import(pathToFileURL(join(dir, 'page-entry.js')).href);
    const page = globalThis.runtimeConformance;
    const header = page.header();
    for (const field of ['name', 'version', 'engine', 'engineVersion']) assert.equal(header[field], coreAdapter[field], field);
    assert.equal(header.configuration.ephemeris, coreAdapter.configuration.ephemeris);
    for (const vector of vectors) {
      const answer = await page.answer({ id: vector.id, kind: vector.kind, input: vector.input });
      assert.deepEqual(answer, coreResponses.get(vector.id), vector.id);
    }
    assert.equal(page.receipts().length, 5);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the runner writes root and core separately and accepts matching core verdicts', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'runtime-conformance-entries-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const run = spawnSync(process.execPath, [resolve(here, 'run-all.mjs'), '--out', dir, '--runtimes', 'node'], { cwd: root, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  for (const [entry, path] of [['root', dir], ['core', join(dir, 'core')]]) {
    assert.ok(existsSync(join(path, 'node', 'responses.jsonl')), `${entry} responses`);
    const results = JSON.parse(readFileSync(join(path, 'node', 'results.json'), 'utf8'));
    const matrix = JSON.parse(readFileSync(join(path, 'matrix.json'), 'utf8'));
    const summary = JSON.parse(readFileSync(join(path, 'node', 'summary.json'), 'utf8'));
    assert.equal(matrix.entry, entry);
    assert.equal(results.adapter.name, entry === 'core' ? 'zodiacs-engine-core' : 'zodiacs-engine');
    assert.equal(matrix.gate.pass, true);
    if (entry === 'core') {
      const baselinePath = resolve(root, 'docs/evidence/runtime-conformance-20261119/core/node/results.json');
      const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
      const minimum = baseline.summary.byLevel.L1.pass;
      const passes = results.summary.byLevel.L1.pass;
      assert.ok(passes >= minimum, `core L1 arbiter passes fell from ${minimum} to ${passes}`);
    }
    const agreement = { run: vectors.length, agreeing: vectors.length - results.summary.total.unsupported, disagreeing: 0, unsupported: results.summary.total.unsupported };
    assert.deepEqual(summary.agreement, agreement);
    assert.deepEqual(matrix.runtimes.node.agreement, agreement);
    assert.deepEqual(summary.differsFromNode, []);
  }
});
