/*
 * The harness's own tests: tolerance comparison, verdicts, validation against
 * SPEC.md, and the adapter protocol. Run with `node --test conformance/harness/selftest.mjs`.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { KINDS, RELEASES, RELEASE_DIGESTS, SUITE_DIR, SUITE_VERSION, compareField, compareRelease, conventionIds, judge, readLevel, readSuite, runAdapter, summarize, validateLevel } from './lib.mjs';

const arcsec = { abs: 1, unit: 'arcsec', wrap: 360 };

test('longitudes compare on the circle, in the rule unit', () => {
  const across = compareField(arcsec, 359.9999, 0.0001);
  assert.equal(across.pass, true);
  assert.ok(Math.abs(across.residual - 0.72) < 1e-6);
  const far = compareField(arcsec, 10, 10.001);
  assert.equal(far.pass, false);
  assert.ok(Math.abs(far.residual - 3.6) < 1e-6);
  assert.equal(compareField({ abs: 1, unit: 'arcsec' }, 1, 1 - 0.999 / 3600).pass, true);
  assert.equal(compareField({ abs: 1, unit: 'arcsec' }, 1, 1 - 1.001 / 3600).pass, false);
  assert.equal(compareField({ abs: 0.1, unit: 's' }, 69.2, 69.35).pass, false);
});

test('arrays compare element by element and report the worst residual', () => {
  const rule = { each: arcsec };
  const result = compareField(rule, [10, 20, 30], [10, 20.0002, 29.9999]);
  assert.equal(result.pass, true);
  assert.ok(Math.abs(result.residual - 0.72) < 1e-6);
  assert.equal(compareField(rule, [10, 20], [10]).pass, false);
  assert.equal(compareField(rule, [10], ['10']).pass, false);
});

test('exact fields, missing fields and non-numbers fail', () => {
  assert.equal(compareField({ exact: true }, 'undefined', 'undefined').pass, true);
  assert.equal(compareField({ exact: true }, [3600, 0], [3600, 0]).pass, true);
  assert.equal(compareField({ exact: true }, 3600, 3600.5).pass, false);
  assert.equal(compareField(arcsec, 10, Number.NaN).pass, false);
  const vector = { expected: { status: 'ok', utc_offset_s: 3600 }, tolerance: { status: { exact: true }, utc_offset_s: { exact: true } } };
  assert.equal(judge(vector, { id: 'x', output: { status: 'ok' } }).verdict, 'fail');
  assert.equal(judge(vector, { id: 'x', output: { status: 'ok', utc_offset_s: 3600 } }).verdict, 'pass');
  assert.equal(judge(vector, { id: 'x', unsupported: 'no zones' }).verdict, 'unsupported');
  assert.equal(judge(vector, { id: 'x', error: 'boom' }).verdict, 'error');
  assert.equal(judge(vector, undefined).verdict, 'error');
});

function fixture(changes = {}) {
  return {
    level: 'L3',
    version: '0.1.0',
    file: {
      suite: 'zodiacs-conformance',
      suiteVersion: '0.1.0',
      level: 'L3',
      title: 'Test',
      arbiters: { jdn: { name: 'integer arithmetic', source: 'Richards', inputs: [], method: 'arithmetic', generator: 'harness/lib.mjs', uncertainty: 'exact' } },
      vectors: [{
        id: 'L3-JDN-0001', kind: 'calendar.to-jdn',
        input: { calendar: 'julian', year: -4712, month: 1, day: 1 },
        expected: { jdn: 0 }, tolerance: { jdn: { exact: true } }, arbiter: 'jdn',
      }],
      ...changes,
    },
  };
}

test('validation accepts a conforming file and names each problem in a bad one', () => {
  assert.deepEqual(validateLevel(fixture()), []);
  const swiss = fixture({ arbiters: { swe: { name: 'Swiss Ephemeris', source: 's', inputs: [], method: 'm', generator: 'harness/lib.mjs', uncertainty: 'u' } } });
  swiss.file.vectors[0].arbiter = 'swe';
  assert.ok(validateLevel(swiss).some((problem) => problem.includes('may not be an arbiter')));
  const untolerant = fixture();
  delete untolerant.file.vectors[0].tolerance;
  assert.ok(validateLevel(untolerant).some((problem) => problem.includes('tolerance is required')));
  const misplaced = fixture();
  misplaced.file.vectors[0].kind = 'angles.asc-mc';
  assert.ok(validateLevel(misplaced).some((problem) => problem.includes('belongs to L2')));
  const unnamed = fixture();
  unnamed.file.vectors[0].arbiter = 'nobody';
  assert.ok(validateLevel(unnamed).some((problem) => problem.includes('is not listed')));
  const digest = fixture({ arbiters: { jdn: { ...fixture().file.arbiters.jdn, inputs: [{ path: 'SPEC.md', sha256: '0'.repeat(64) }] } } });
  assert.ok(validateLevel(digest).some((problem) => problem.includes('does not match its sha256')));
});

/** The fixture as 0.2.0 releases it: each vector with its convention ids. */
function named() {
  const entry = fixture();
  entry.version = '0.2.0';
  entry.file.suiteVersion = '0.2.0';
  entry.file.vectors = entry.file.vectors.map((vector) => ({ ...vector, conventionIds: conventionIds(vector) }));
  return entry;
}

test('from 0.2.0 each vector names its kind and arbiter as registry ids, and 0.1.0 is as released', () => {
  assert.deepEqual(conventionIds({ kind: 'calendar.to-jdn', arbiter: 'jdn' }), ['arbiter:jdn', 'kind:calendar.to-jdn']);
  assert.deepEqual(validateLevel(named()), []);
  const missing = named();
  delete missing.file.vectors[0].conventionIds;
  assert.ok(validateLevel(missing).some((problem) => problem.includes('conventionIds must be')));
  const reordered = named();
  reordered.file.vectors[0].conventionIds.reverse();
  assert.ok(validateLevel(reordered).some((problem) => problem.includes('conventionIds must be')));
  const other = named();
  other.file.vectors[0].conventionIds = ['arbiter:jdn', 'kind:calendar.from-jdn'];
  assert.ok(validateLevel(other).some((problem) => problem.includes('conventionIds must be')));
  const early = fixture();
  early.file.vectors[0].conventionIds = conventionIds(early.file.vectors[0]);
  assert.ok(validateLevel(early).some((problem) => problem.includes('unknown key conventionIds')));
  const unversioned = named();
  unversioned.file.suiteVersion = '0.1.0';
  assert.ok(validateLevel(unversioned).some((problem) => problem.includes('suiteVersion must be 0.2.0')));
});

test('a release holds the vectors released before it, and nothing else differs', () => {
  assert.deepEqual(compareRelease(named(), fixture()), []);
  const moved = named();
  moved.file.vectors[0].expected.jdn = 1;
  assert.ok(compareRelease(moved, fixture()).some((problem) => problem.includes('L3-JDN-0001 differs')));
  const retitled = named();
  retitled.file.title = 'Other';
  assert.ok(compareRelease(retitled, fixture()).some((problem) => problem.includes('differs beyond its suite version')));
  const grown = named();
  grown.file.vectors.push({ ...grown.file.vectors[0], id: 'L3-JDN-0002' });
  assert.ok(compareRelease(grown, fixture()).some((problem) => problem.includes('2 vectors where 1 were released')));
});

test('the committed vector files conform to SPEC.md, and this version holds each earlier release\'s vectors', () => {
  assert.equal(SUITE_VERSION, '0.3.0');
  const current = readSuite();
  assert.deepEqual(current.map((level) => level.level), ['L1', 'L2', 'L3', 'L4']);
  assert.deepEqual(Object.keys(RELEASES), ['0.1.0', '0.2.0', '0.3.0']);
  assert.deepEqual(Object.keys(RELEASE_DIGESTS), Object.keys(RELEASES));
  for (const version of ['0.1.0', '0.2.0']) {
    const released = readSuite(undefined, undefined, version);
    assert.equal(released.length, 3);
    for (const level of released) assert.deepEqual(validateLevel(level), [], `${version} ${level.level}`);
    released.forEach((level) => assert.deepEqual(compareRelease(current.find((entry) => entry.level === level.level), level), [], `${version} ${level.level}`));
  }
  for (const level of current) assert.deepEqual(validateLevel(level), [], `${level.version} ${level.level}`);
  for (const version of Object.keys(RELEASES)) {
    for (const level of readSuite(undefined, undefined, version)) assert.equal(level.digest, RELEASE_DIGESTS[version][level.level], `${version} ${level.level}`);
  }
});

test('0.3.0 changes no released vector: its L1 to L3 files are 0.2.0\'s but for the suite version', () => {
  for (const level of ['L1', 'L2', 'L3']) {
    const then = readFileSync(resolve(SUITE_DIR, RELEASES['0.2.0'][level]), 'utf8');
    const now = readFileSync(resolve(SUITE_DIR, RELEASES['0.3.0'][level]), 'utf8');
    assert.equal(now, then.replace('"suiteVersion": "0.2.0"', '"suiteVersion": "0.3.0"'), level);
  }
});

// Read when a test runs, so that a harness without L4 fails those tests and still runs the others.
let level4;
const l4 = () => (level4 ??= readLevel('L4'));
const event = (kind) => l4().file.vectors.find((vector) => vector.kind === kind);

test('L4\'s event kinds: each shape, window, tolerance and direction is checked', () => {
  for (const kind of ['event.ingress', 'event.station', 'event.lunation']) assert.equal(KINDS[kind].level, 'L4');
  const ingress = event('event.ingress');
  const broken = (change, base = ingress) => validateLevel({ ...l4(), file: { ...l4().file, dropped: [], vectors: [change(structuredClone(base))] } });
  assert.deepEqual(broken((v) => v), []);
  assert.ok(broken((v) => { v.input.after_tt_s = v.expected.tt_s; return v; }).some((p) => p.includes('window')));
  assert.ok(broken((v) => { v.input.before_tt_s = v.expected.tt_s - 1; return v; }).some((p) => p.includes('window')));
  assert.ok(broken((v) => { v.tolerance.tt_s = { abs: 0.5, unit: 's' }; return v; }).some((p) => p.includes('whole seconds')));
  assert.ok(broken((v) => { v.tolerance.tt_s = { abs: 2, unit: 'arcsec' }; return v; }).some((p) => p.includes('whole seconds')));
  assert.ok(broken((v) => { v.input.longitude_deg = 45; return v; }).some((p) => p.includes('multiple of 30')));
  assert.ok(broken((v) => { v.input.body = 'Ceres'; return v; }).some((p) => p.includes('unknown body')));
  assert.ok(broken((v) => { delete v.input.body; return v; }).some((p) => p.includes('not a shape')));
  assert.ok(broken((v) => { v.expected = { utc_s: v.expected.tt_s }; v.tolerance = { utc_s: v.tolerance.tt_s }; return v; }).some((p) => p.includes('not a shape')));
  assert.ok(broken((v) => { v.tags = ['utc-input']; return v; }).some((p) => p.includes('utc-input')));
  assert.ok(broken((v) => { v.input.phase_deg = 90; return v; }, event('event.lunation')).some((p) => p.includes('phase_deg')));
  assert.ok(broken((v) => { v.expected.direction = 'stationary'; return v; }, event('event.station')).some((p) => p.includes('direction')));
  assert.ok(broken((v) => { v.tolerance.direction = { abs: 1, unit: 's' }; return v; }, event('event.station')).some((p) => p.includes('exactly')));
  const listed = (dropped) => validateLevel({ ...l4(), file: { ...l4().file, dropped } });
  assert.ok(listed([{ id: ingress.id, what: 'x', reason: 'y' }]).some((p) => p.includes('both a vector and dropped')));
  assert.ok(listed([{ id: 'L4-ING-9999', what: 'x' }]).some((p) => p.includes('{ id, what, reason }')));
  assert.ok(validateLevel({ ...l4(), file: { ...l4().file, draft: 'x' } }).some((p) => p.includes('unknown key draft')));
});

test('an L4 instant moved by twice its tolerance fails against the engine\'s committed answer', () => {
  const results = JSON.parse(readFileSync(resolve(SUITE_DIR, 'results/zodiacs-engine.json'), 'utf8')).results;
  const byId = new Map(l4().file.vectors.map((vector) => [vector.id, vector]));
  const passing = results.filter((result) => byId.has(result.id) && result.verdict === 'pass');
  assert.ok(passing.length > 0);
  for (const result of passing) {
    const vector = byId.get(result.id);
    const [field] = Object.keys(result.residual);
    const answer = vector.expected[field] + result.residual[field];
    // A passing result matched every exact field, including the station's direction.
    const output = { ...vector.expected, [field]: answer };
    assert.equal(judge(vector, { output }).verdict, 'pass', vector.id);
    if (vector.kind === 'event.station') {
      const opposite = output.direction === 'direct' ? 'retrograde' : 'direct';
      assert.equal(judge(vector, { output: { ...output, direction: opposite } }).verdict, 'fail', vector.id);
    }
    for (const sign of [1, -1]) {
      const moved = { ...vector, expected: { ...vector.expected, [field]: vector.expected[field] + sign * 2 * vector.tolerance[field].abs } };
      assert.equal(judge(moved, { output }).verdict, 'fail', `${vector.id} moved by ${sign * 2} tolerances`);
    }
  }
});

// Runs the engine's adapter, so it needs `npm run build` first, as the conformance workflow does.
test('the engine\'s adapter: ingresses, stations and lunations within tolerance, and no answer for an empty window', async () => {
  const byId = new Map(l4().file.vectors.map((vector) => [vector.id, vector]));
  const tt = byId.get('L4-ING-0061');
  const utc = byId.get('L4-UTC-0001');
  const empty = { ...structuredClone(tt), id: 'L4-ING-EMPTY' };
  empty.input.before_tt_s = tt.expected.tt_s - 2 * tt.tolerance.tt_s.abs;
  const measured = [tt, utc, event('event.station'), event('event.lunation'), byId.get('L4-UTC-0003')];
  const asked = [...measured, empty];
  const { responses } = await runAdapter('node conformance/adapters/zodiacs-engine.mjs', asked, { cwd: resolve(SUITE_DIR, '..') });
  for (const vector of measured) assert.equal(judge(vector, responses.get(vector.id)).verdict, 'pass', vector.id);
  const none = judge(empty, responses.get(empty.id));
  assert.equal(none.verdict, 'error');
  assert.match(none.detail, /found 0 crossings/u);
});

const vectors = [
  { id: 'L3-JDN-0001', kind: 'calendar.to-jdn', input: { calendar: 'julian', year: -4712, month: 1, day: 1 }, expected: { jdn: 0 }, tolerance: { jdn: { exact: true } } },
  { id: 'L3-JDN-0002', kind: 'calendar.to-jdn', input: { calendar: 'gregorian', year: 2000, month: 1, day: 1 }, expected: { jdn: 2451545 }, tolerance: { jdn: { exact: true } } },
];
const node = JSON.stringify(process.execPath);

test('the protocol: a handshake, then one response per request, in order', async () => {
  const script = "const r=require('readline').createInterface({input:process.stdin});console.log(JSON.stringify({adapter:{name:'t'}}));const ans={'-4712':0,'2000':2451545};r.on('line',l=>{const q=JSON.parse(l);console.log(JSON.stringify({id:q.id,output:{jdn:ans[q.input.year]}}))})";
  const { adapter, responses } = await runAdapter(`${node} -e ${JSON.stringify(script)}`, vectors);
  assert.equal(adapter.name, 't');
  const results = vectors.map((vector) => ({ id: vector.id, ...judge(vector, responses.get(vector.id)) }));
  assert.deepEqual(results.map((result) => result.verdict), ['pass', 'pass']);
  assert.equal(summarize(vectors, results).total.pass, 2);
});

test('the protocol: a missing handshake or an answer out of order is refused', async () => {
  const headless = "console.log(JSON.stringify({id:'L3-JDN-0001',output:{jdn:0}}))";
  await assert.rejects(runAdapter(`${node} -e ${JSON.stringify(headless)}`, vectors), /first write/u);
  await assert.rejects(runAdapter(`${node} -e ""`, vectors), /first write/u);
  const backwards = "console.log(JSON.stringify({adapter:{name:'t'}}));console.log(JSON.stringify({id:'L3-JDN-0002',output:{}}))";
  await assert.rejects(runAdapter(`${node} -e ${JSON.stringify(backwards)}`, vectors), /was due/u);
});
