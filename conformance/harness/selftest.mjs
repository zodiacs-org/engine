/*
 * The harness's own tests: tolerance comparison, verdicts, validation against
 * SPEC.md, and the adapter protocol. Run with `node --test conformance/harness/selftest.mjs`.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compareField, judge, readSuite, runAdapter, summarize, validateLevel } from './lib.mjs';

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

test('the committed vector files conform to SPEC.md', () => {
  for (const level of readSuite()) assert.deepEqual(validateLevel(level), [], level.level);
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
