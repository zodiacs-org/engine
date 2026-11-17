/*
 * Self-test of the draft level L4: node --test conformance/drafts/0.3.0/selftest-draft.mjs
 *
 * The vector file conforms to DESIGN.md's shapes; the committed results were
 * written for it and their verdicts follow from their residuals; an expected
 * instant moved by twice its tolerance fails against the engine's committed
 * answer (the mutation check of DESIGN.md); the adapter's handlers for the
 * three event kinds answer as the results say (run live, so it needs
 * `npm run build` first, as the conformance workflow does); and the released
 * harness does not see the draft at all.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { KINDS, LEVEL_FILES, RELEASES, judge, readSuite, runAdapter } from '../../harness/lib.mjs';
import { RUNS, render } from './report-draft.mjs';
import { DRAFT_DIR, readDraft, validateDraft } from './run-draft.mjs';

const draft = readDraft();
const runs = RUNS.map((run) => ({ ...run, doc: JSON.parse(readFileSync(resolve(DRAFT_DIR, run.file), 'utf8')) }));

test('the draft vector file conforms to DESIGN.md', () => {
  assert.deepEqual(validateDraft(draft.file), []);
  assert.equal(draft.file.vectors.length + draft.file.dropped.length, 141);
});

test('a vector with a wrong shape, an empty window or a loose tolerance is refused', () => {
  const vector = draft.file.vectors.find((candidate) => candidate.kind === 'event.ingress');
  const broken = (change) => validateDraft({ ...draft.file, dropped: [], vectors: [change(structuredClone(vector))] });
  assert.ok(broken((v) => { v.input.after_tt_s = v.expected.tt_s; return v; }).some((p) => p.includes('window')));
  assert.ok(broken((v) => { v.tolerance.tt_s = { abs: 0.5, unit: 's' }; return v; }).some((p) => p.includes('tolerance')));
  assert.ok(broken((v) => { v.input.longitude_deg = 45; return v; }).some((p) => p.includes('multiple of 30')));
  assert.ok(broken((v) => { delete v.input.body; return v; }).some((p) => p.includes('not a shape')));
});

for (const run of runs) {
  test(`${run.file} was written for this vector file, and each verdict follows from its residual`, () => {
    assert.equal(run.doc.vectors['drafts/0.3.0/L4-events.json'], draft.digest);
    const byId = new Map(run.doc.results.map((result) => [result.id, result]));
    for (const vector of draft.file.vectors) {
      const result = byId.get(vector.id);
      assert.ok(result, `${vector.id} has a result`);
      if (result.verdict !== 'pass' && result.verdict !== 'fail') continue;
      for (const [field, residual] of Object.entries(result.residual)) {
        assert.equal(Math.abs(residual) <= vector.tolerance[field].abs, result.verdict === 'pass', `${vector.id} ${field}`);
      }
    }
  });
}

test('an expected instant moved by twice its tolerance fails against the engine\'s committed answer', () => {
  const [run] = runs;
  const byId = new Map(draft.file.vectors.map((vector) => [vector.id, vector]));
  const passing = run.doc.results.filter((result) => result.verdict === 'pass');
  assert.ok(passing.length > 0);
  for (const result of passing) {
    const vector = byId.get(result.id);
    const [field] = Object.keys(result.residual);
    const answer = vector.expected[field] + result.residual[field];
    assert.equal(judge(vector, { output: { [field]: answer } }).verdict, 'pass', vector.id);
    for (const sign of [1, -1]) {
      const moved = { ...vector, expected: { ...vector.expected, [field]: vector.expected[field] + sign * 2 * vector.tolerance[field].abs } };
      assert.equal(judge(moved, { output: { [field]: answer } }).verdict, 'fail', `${vector.id} moved by ${sign * 2} tolerances`);
    }
  }
});

test('the adapter answers each event kind: an ingress on TT and on UTC within tolerance, one event per window, stations and lunations unsupported', async () => {
  const byId = new Map(draft.file.vectors.map((vector) => [vector.id, vector]));
  const tt = byId.get('L4-ING-0061');
  const utc = byId.get('L4-UTC-0001');
  const station = draft.file.vectors.find((vector) => vector.kind === 'event.station');
  const lunation = draft.file.vectors.find((vector) => vector.kind === 'event.lunation');
  // The same ingress with its window cut to end before the crossing: no event, so no answer.
  const empty = { ...structuredClone(tt), id: 'L4-ING-EMPTY' };
  empty.input.before_tt_s = tt.expected.tt_s - 2 * tt.tolerance.tt_s.abs;
  const { responses } = await runAdapter('node conformance/adapters/zodiacs-engine.mjs', [tt, utc, station, lunation, empty], { cwd: resolve(DRAFT_DIR, '../../..') });
  assert.equal(judge(tt, responses.get(tt.id)).verdict, 'pass', 'TT ingress');
  assert.equal(judge(utc, responses.get(utc.id)).verdict, 'pass', 'UTC ingress');
  assert.equal(judge(station, responses.get(station.id)).verdict, 'unsupported', 'station');
  assert.equal(judge(lunation, responses.get(lunation.id)).verdict, 'unsupported', 'lunation');
  const none = judge(empty, responses.get(empty.id));
  assert.equal(none.verdict, 'error');
  assert.match(none.detail, /found 0 crossings/);
});

test('the released harness does not see the draft', () => {
  for (const kind of ['event.ingress', 'event.station', 'event.lunation']) assert.equal(KINDS[kind], undefined);
  for (const files of Object.values(RELEASES)) assert.ok(!Object.keys(files).includes('L4'));
  assert.deepEqual(readSuite().map((level) => level.level), Object.keys(LEVEL_FILES));
});

test('RESULTS-DRAFT.md is current', () => {
  assert.equal(readFileSync(resolve(DRAFT_DIR, 'RESULTS-DRAFT.md'), 'utf8'), render());
});
