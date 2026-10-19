// Reporting only: no ephemeris calls and no astronomical expectations.
import assert from 'node:assert/strict';

export function owns(window, atMs) {
  return atMs > window.startMs && atMs <= window.endMs;
}

// Express [calendar start, next calendar start) with the searcher's integer
// open-start, closed-end ownership. Midnight belongs to its calendar date.
export function calendarWindow(startMs, endMs) {
  assert.ok(Number.isSafeInteger(startMs - 1) && Number.isSafeInteger(endMs) && endMs > startMs);
  return { startMs: startMs - 1, endMs: endMs - 1 };
}

// Identity and independently declared windows establish candidates. Neither
// timing acceptance nor classification participates in discovery matching.
export function compare(expected, actual, coverage, status = 'complete') {
  assert.ok(['sparse', 'catalog-year'].includes(coverage));
  assert.ok(['complete', 'refused'].includes(status));
  assert.equal(new Set(expected.map(e => e.id)).size, expected.length);
  for (const e of expected) {
    assert.ok(typeof e.key === 'string' && e.key.length > 0);
    assert.ok(Number.isSafeInteger(e.atMs) && owns(e, e.atMs));
    assert.ok(Number.isSafeInteger(e.toleranceMs) && e.toleranceMs >= 0);
  }
  for (const e of actual) {
    assert.ok(Number.isSafeInteger(e.atMs));
    assert.ok(typeof e.key === 'string' && e.key.length > 0);
  }
  if (status === 'refused') assert.equal(actual.length, 0);
  const candidates = expected.map(e => status === 'refused' ? [] : actual.flatMap((a, i) =>
    a.key === e.key && owns(e, a.atMs) ? [i] : []));
  const uses = actual.map((_, i) => candidates.filter(indices => indices.includes(i)).length);
  const pairs = candidates.flatMap((indices, i) => indices.length === 1 && uses[indices[0]] === 1
    ? [{ expected: expected[i], actual: actual[indices[0]] }] : []);
  const errors = pairs.map(p => p.actual.atMs - p.expected.atMs);
  const timingWithinThreshold = pairs.filter(p =>
    Math.abs(p.actual.atMs - p.expected.atMs) <= p.expected.toleranceMs).length;
  const classified = pairs.filter(p => p.expected.classification !== undefined);
  const classificationMatches = classified.filter(p =>
    p.actual.classification === p.expected.classification).length;
  const summary = {
    referenceComparisons: expected.length,
    assessedReferences: status === 'complete' ? expected.length : 0,
    unassessedReferences: status === 'refused' ? expected.length : 0,
    foundResults: actual.length,
    matchedReferences: pairs.length,
    missingReferences: status === 'complete' ? candidates.filter(c => c.length === 0).length : 0,
    ambiguousReferences: status === 'complete' ? candidates.filter(c => c.length > 1 ||
      (c.length === 1 && uses[c[0]] > 1)).length : 0,
    unmatchedResults: actual.length - pairs.length,
    unreferencedResults: coverage === 'sparse' ? actual.length - pairs.length : 0,
    catalogUnmatchedResults: coverage === 'catalog-year' ? actual.length - pairs.length : 0,
    timingWithinThreshold,
    timingOutsideThreshold: pairs.length - timingWithinThreshold,
    classificationMatches,
    classificationMismatches: classified.length - classificationMatches
  };
  return { summary, errors };
}

// Aggregate raw errors before rounding, never rounded subgroup statistics.
export function summarize(comparisons) {
  const keys = Object.keys(compare([], [], 'sparse').summary);
  const errors = comparisons.flatMap(c => c.errors);
  return { ...Object.fromEntries(keys.map(key => [key,
    comparisons.reduce((sum, c) => sum + c.summary[key], 0)])),
  maxAbsoluteTimingErrorSecondsRoundedUp: errors.length
    ? Math.ceil(Math.max(...errors.map(Math.abs)) / 1000) : null,
  meanAbsoluteTimingErrorSecondsRoundedUp: errors.length
    ? Math.ceil(errors.reduce((sum, e) => sum + Math.abs(e), 0) / errors.length / 1000) : null,
  minimumSignedTimingErrorSecondsRoundedDown: errors.length ? Math.floor(Math.min(...errors) / 1000) + 0 : null,
  maximumSignedTimingErrorSecondsRoundedUp: errors.length ? Math.ceil(Math.max(...errors) / 1000) + 0 : null };
}
