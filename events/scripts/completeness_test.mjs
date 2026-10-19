import assert from 'node:assert/strict';
import { calendarWindow, compare, owns, summarize } from './completeness-match.mjs';

// Synthetic integer coordinates test matching arithmetic only.
let passed = 0;
function test(name, run) {
  try {
    run();
    passed += 1;
  } catch (error) {
    error.message = `${name}: ${error.message}`;
    throw error;
  }
}

function reference(id, atMs, options = {}) {
  return { id, key: 'station:Mercury:direct', atMs,
    startMs: atMs - 100, endMs: atMs + 100, toleranceMs: 10, ...options };
}

test('unique candidates match one to one regardless of result order', () => {
  const expected = [reference('a', 1000), reference('b', 2000)];
  const result = compare(expected, [
    { key: expected[1].key, atMs: 2010 },
    { key: expected[0].key, atMs: 995 }
  ], 'sparse');
  assert.equal(result.summary.referenceComparisons, 2);
  assert.equal(result.summary.assessedReferences, 2);
  assert.equal(result.summary.matchedReferences, 2);
  assert.equal(result.summary.missingReferences, 0);
  assert.equal(result.summary.ambiguousReferences, 0);
  assert.equal(result.summary.unmatchedResults, 0);
  assert.equal(result.summary.timingWithinThreshold, 2);
  assert.equal(result.summary.timingOutsideThreshold, 0);
  assert.deepEqual(result.errors, [-5, 10]);
});

test('missing references and extra sparse results remain distinct', () => {
  const expected = [reference('a', 1000), reference('b', 2000)];
  const result = compare(expected, [
    { key: expected[0].key, atMs: 1000 },
    { key: expected[0].key, atMs: 3000 }
  ], 'sparse');
  assert.equal(result.summary.matchedReferences, 1);
  assert.equal(result.summary.missingReferences, 1);
  assert.equal(result.summary.unmatchedResults, 1);
  assert.equal(result.summary.unreferencedResults, 1);
  assert.equal(result.summary.catalogUnmatchedResults, 0);
  assert.deepEqual(result.errors, [0]);
});

test('full catalog coverage reports unmatched results as catalog disagreements', () => {
  const result = compare([], [{ key: 'eclipse:solar', atMs: 1000 }], 'catalog-year');
  assert.equal(result.summary.unmatchedResults, 1);
  assert.equal(result.summary.unreferencedResults, 0);
  assert.equal(result.summary.catalogUnmatchedResults, 1);
});

test('direction and longitude are part of the encoded identity', () => {
  const expected = reference('a', 1000, { key: 'ingress:Mercury:30:direct' });
  for (const key of ['ingress:Mercury:30:retrograde', 'ingress:Mercury:60:direct']) {
    const result = compare([expected], [{ key, atMs: 1000 }], 'sparse');
    assert.equal(result.summary.matchedReferences, 0);
    assert.equal(result.summary.missingReferences, 1);
    assert.equal(result.summary.unmatchedResults, 1);
    assert.deepEqual(result.errors, []);
  }
});

test('multiple eligible results are ambiguous even if only one meets timing', () => {
  const expected = reference('a', 1000, { toleranceMs: 0 });
  const result = compare([expected], [
    { key: expected.key, atMs: 1000 }, { key: expected.key, atMs: 1001 }
  ], 'sparse');
  assert.equal(result.summary.matchedReferences, 0);
  assert.equal(result.summary.missingReferences, 0);
  assert.equal(result.summary.ambiguousReferences, 1);
  assert.equal(result.summary.unmatchedResults, 2);
  assert.equal(result.summary.timingWithinThreshold, 0);
  assert.deepEqual(result.errors, []);
});

test('one result eligible for two references cannot be reused', () => {
  const expected = [reference('a', 1000), reference('b', 1010)];
  const result = compare(expected, [{ key: expected[0].key, atMs: 1005 }], 'sparse');
  assert.equal(result.summary.matchedReferences, 0);
  assert.equal(result.summary.missingReferences, 0);
  assert.equal(result.summary.ambiguousReferences, 2);
  assert.equal(result.summary.unmatchedResults, 1);
  assert.deepEqual(result.errors, []);
});

test('a discovered event can fail timing without becoming missing', () => {
  const expected = reference('a', 1000, { toleranceMs: 1 });
  const result = compare([expected], [{ key: expected.key, atMs: 1002 }], 'sparse');
  assert.equal(result.summary.matchedReferences, 1);
  assert.equal(result.summary.missingReferences, 0);
  assert.equal(result.summary.unmatchedResults, 0);
  assert.equal(result.summary.timingWithinThreshold, 0);
  assert.equal(result.summary.timingOutsideThreshold, 1);
  assert.deepEqual(result.errors, [2]);
});

test('classification failure does not change discovery or timing', () => {
  const expected = reference('a', 1000, { key: 'eclipse:solar', classification: 'partial' });
  const result = compare([expected], [
    { key: expected.key, atMs: 1000, classification: 'central' }
  ], 'catalog-year');
  assert.equal(result.summary.matchedReferences, 1);
  assert.equal(result.summary.missingReferences, 0);
  assert.equal(result.summary.timingWithinThreshold, 1);
  assert.equal(result.summary.classificationMatches, 0);
  assert.equal(result.summary.classificationMismatches, 1);
});

test('open starts and closed ends assign shared boundaries once', () => {
  assert.equal(owns({ startMs: 0, endMs: 1000 }, 0), false);
  assert.equal(owns({ startMs: 0, endMs: 1000 }, 1000), true);
  const expected = [
    reference('a', 1000, { startMs: 0, endMs: 1000 }),
    reference('b', 2000, { startMs: 1000, endMs: 2000 })
  ];
  const result = compare(expected, [
    { key: expected[0].key, atMs: 0 },
    { key: expected[0].key, atMs: 1000 },
    { key: expected[0].key, atMs: 2000 }
  ], 'sparse');
  assert.equal(result.summary.matchedReferences, 2);
  assert.equal(result.summary.ambiguousReferences, 0);
  assert.equal(result.summary.unmatchedResults, 1);
  assert.deepEqual(result.errors, [0, 0]);
});

test('calendar dates and years include their midnight and exclude the next midnight', () => {
  const window = calendarWindow(-1000, 1000);
  assert.deepEqual(window, { startMs: -1001, endMs: 999 });
  assert.equal(owns(window, -1001), false);
  assert.equal(owns(window, -1000), true);
  assert.equal(owns(window, 999), true);
  assert.equal(owns(window, 1000), false);
  const expected = reference('midnight', -1000, window);
  const result = compare([expected], [{ key: expected.key, atMs: -1000 },
    { key: expected.key, atMs: 1000 }], 'catalog-year');
  assert.equal(result.summary.matchedReferences, 1);
  assert.equal(result.summary.catalogUnmatchedResults, 1);
  assert.throws(() => calendarWindow(0, 0), assert.AssertionError);
});

test('refused comparisons leave references unassessed rather than missing', () => {
  const expected = [reference('a', 1000), reference('b', 2000)];
  const result = compare(expected, [], 'sparse', 'refused');
  assert.equal(result.summary.referenceComparisons, 2);
  assert.equal(result.summary.assessedReferences, 0);
  assert.equal(result.summary.unassessedReferences, 2);
  assert.equal(result.summary.matchedReferences, 0);
  assert.equal(result.summary.missingReferences, 0);
  assert.equal(result.summary.ambiguousReferences, 0);
  assert.deepEqual(result.errors, []);
  assert.throws(() => compare(expected, [{ key: expected[0].key, atMs: 1000 }],
    'sparse', 'refused'), assert.AssertionError);
});

test('empty aggregate timing statistics are null', () => {
  for (const input of [[], [compare([], [], 'sparse')]]) {
    const result = summarize(input);
    for (const [key, value] of Object.entries(result)) {
      assert.equal(value, key.includes('TimingError') ? null : 0, key);
    }
  }
});

test('aggregate mean uses raw absolute errors and rounds once', () => {
  const first = reference('a', 10000, { startMs: 9000, endMs: 12000, toleranceMs: 2000 });
  const second = [reference('b', 20000), reference('c', 30000)];
  const groups = [
    compare([first], [{ key: first.key, atMs: 11001 }], 'sparse'),
    compare(second, [{ key: second[0].key, atMs: 20001 },
      { key: second[1].key, atMs: 29999 }], 'sparse')
  ];
  assert.equal(summarize([groups[0]]).meanAbsoluteTimingErrorSecondsRoundedUp, 2);
  assert.equal(summarize([groups[1]]).meanAbsoluteTimingErrorSecondsRoundedUp, 1);
  const result = summarize(groups);
  assert.equal(result.matchedReferences, 3);
  assert.equal(result.meanAbsoluteTimingErrorSecondsRoundedUp, 1);
  assert.equal(result.maxAbsoluteTimingErrorSecondsRoundedUp, 2);
  assert.equal(result.minimumSignedTimingErrorSecondsRoundedDown, -1);
  assert.equal(result.maximumSignedTimingErrorSecondsRoundedUp, 2);
});

test('rounded signed zeros survive JSON serialization without changing evidence', () => {
  const expected = reference('a', 1000);
  const result = summarize([compare([expected], [{ key: expected.key, atMs: 999 }], 'sparse')]);
  assert.equal(result.maximumSignedTimingErrorSecondsRoundedUp, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
});

console.log(`Completeness matcher: ${passed} analytic checks passed`);
