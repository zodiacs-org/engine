import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { executeQuery } from '../src/index.js';
import type { RetrogradeInterval } from '../src/index.js';

const day = 86400000;
const budget = 1000000;
function intervals(query: string, stepMs: number): readonly RetrogradeInterval[] {
  const result = executeQuery(query, { stepMs, maxEvaluations: budget });
  assert.equal(result.status, 'complete');
  assert.ok(result.evaluations < budget);
  assert.ok(result.events.every(e => e.kind === 'retrograde'));
  return result.events as readonly RetrogradeInterval[];
}
function compare(a: readonly RetrogradeInterval[], b: readonly RetrogradeInterval[]) {
  assert.equal(a.length, b.length);
  for (const [i, x] of a.entries()) {
    const y = b[i]!;
    assert.deepEqual([x.body, x.clock, x.clippedStart, x.clippedEnd],
      [y.body, y.clock, y.clippedStart, y.clippedEnd]);
    // Consistency of integer root estimates, not physical accuracy evidence.
    assert.ok(Math.abs(x.startMs-y.startMs) <= 1);
    assert.ok(Math.abs(x.endMs-y.endMs) <= 1);
    assert.equal(x.signSpans.length, y.signSpans.length);
    for (const [j, span] of x.signSpans.entries()) {
      const other = y.signSpans[j]!;
      assert.equal(span.sign, other.sign);
      assert.ok(Math.abs(span.startMs-other.startMs) <= 1);
      assert.ok(Math.abs(span.endMs-other.endMs) <= 1);
    }
  }
}

test('Venus 1900-2100: full, Leo-filtered, finer and partitioned searches reconcile', () => {
  const all = intervals('all Venus retrogrades 1900-2100 clock tt', day);
  const leo = intervals('all Venus retrogrades in Leo 1900-2100 clock tt', day/2);
  assert.ok(leo.length > 0);
  compare(all.filter(x => x.signSpans.some(s => s.sign === 'Leo' && s.endMs > s.startMs)), leo);
  const startMs = Date.parse('1900-01-01T00:00:00Z');
  const endMs = Date.parse('2101-01-01T00:00:00Z');
  let previousEnd = startMs;
  for (const x of all) {
    assert.equal(x.body, 'Venus');
    assert.equal(x.clock, 'tt');
    assert.ok(x.startMs >= previousEnd && x.endMs > x.startMs && x.endMs <= endMs);
    assert.equal(x.signSpans[0]!.startMs, x.startMs);
    assert.equal(x.signSpans.at(-1)!.endMs, x.endMs);
    let cursor = x.startMs;
    for (const span of x.signSpans) {
      assert.equal(span.startMs, cursor);
      assert.ok(span.endMs > span.startMs);
      cursor = span.endMs;
    }
    previousEnd = x.endMs;
  }
  // Independently scanned partitions can split an interval at their shared edge.
  // Merge only those clipped fragments, preserving the chronological sign spans.
  const split = Date.parse('2023-08-01T00:00:00Z');
  const left = intervals('all Venus retrogrades from 1900-01-01 to 2023-08-01 clock tt', day);
  const right = intervals('all Venus retrogrades from 2023-08-01 to 2101-01-01 clock tt', day);
  assert.equal(left.at(-1)!.clippedEnd, true);
  assert.equal(right[0]!.clippedStart, true);
  const joined = [...left];
  for (const x of right) {
    const prior = joined.at(-1);
    if (prior?.clippedEnd && x.clippedStart && prior.endMs === split && x.startMs === split) {
      const spans = [...prior.signSpans];
      for (const span of x.signSpans) {
        const last = spans.at(-1);
        if (last?.sign === span.sign && last.endMs === span.startMs) {
          spans[spans.length-1] = { ...last, endMs: span.endMs };
        } else spans.push(span);
      }
      joined[joined.length-1] = { ...prior, endMs: x.endMs, clippedEnd: x.clippedEnd, signSpans: spans };
    } else joined.push(x);
  }
  compare(all, joined);

  // Only these existing independently reduced JPL dates establish date accuracy.
  // They are not used to locate a bracket for the multi-century search.
  const fixture = JSON.parse(readFileSync(new URL('../../references/horizons.json', import.meta.url), 'utf8')) as {
    events: { case: { id: string; kind: string; body: string; direction: string; toleranceMs: number }; atMs: number }[];
  };
  for (const { case: c, atMs } of fixture.events.filter(x => x.case.kind === 'station' && x.case.body === 'Venus')) {
    const matches = leo.filter(x => Math.abs((c.direction === 'retrograde' ? x.startMs : x.endMs)-atMs) <= c.toleranceMs);
    assert.equal(matches.length, 1, c.id);
  }
  const refused = executeQuery('all Venus retrogrades in Leo 1900-2100 clock tt',
    { stepMs: day, maxEvaluations: 100 });
  assert.equal(refused.status, 'refused');
  if (refused.status === 'refused') assert.equal(refused.reason, 'evaluation-budget');
  assert.deepEqual(refused.events, []);
});
