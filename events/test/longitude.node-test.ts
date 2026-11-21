import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EvaluationContext, searchLongitudeCrossings, searchSignIngresses } from '../src/index.js';
import type { LongitudeProvider, SearchResult } from '../src/index.js';
const wrap = (x: number) => ((x % 360) + 360) % 360;
function analytic(fn: (t: number) => number, startMs = 0, endMs = 100, budget = 1000, signal?: AbortSignal) {
  const context = new EvaluationContext({ startMs, endMs, clock: 'tt' },
    { maxEvaluations: budget, ...(signal ? { signal } : {}) });
  const provider: LongitudeProvider = { context,
    sample: (_body, t) => context.evaluate(() => ({ longitude: fn(t) })) };
  return { context, provider };
}
function events<T>(result: SearchResult<T>): readonly T[] {
  assert.equal(result.status, 'complete');
  if (result.status !== 'complete') throw new Error('refused');
  return result.events;
}
test('wrap crossings use the near side, in either direction', () => {
  for (const slope of [1, -1]) {
    const { context, provider } = analytic(t => wrap(slope * (t - 50)));
    const found = events(searchLongitudeCrossings(context, 'Mars', 0, { stepMs: 20 }, provider));
    assert.equal(found.length, 1);
    assert.equal(found[0]!.atMs, 50);
    assert.equal(found[0]!.direction, slope > 0 ? 'direct' : 'retrograde');
    assert.deepEqual(found[0]!.bracket, [50, 50]);
    assert.equal(found[0]!.clock, 'tt');
    const other = analytic(t => wrap(180 + slope * (t - 50)));
    assert.deepEqual(events(searchLongitudeCrossings(other.context, 'Mars', 0,
      { stepMs: 20 }, other.provider)), []);
  }
});
test('scan and window boundaries are owned once, including negative epochs', () => {
  for (const slope of [1, -1]) {
    const { context, provider } = analytic(t => wrap(slope * t), -360, 360);
    const found = events(searchLongitudeCrossings(context, 'Moon', 0, { stepMs: 30 }, provider));
    assert.deepEqual(found.map(e => e.atMs), [0, 360]);
    const next = analytic(t => wrap(slope * t), 360, 720);
    assert.deepEqual(events(searchLongitudeCrossings(next.context, 'Moon', 0,
      { stepMs: 30 }, next.provider)).map(e => e.atMs), [720]);
  }
});
test('all passes and direction filters on a resolved reversal', () => {
  const fn = (t: number) => wrap(t <= 40 ? 10 + t : 90 - t);
  for (const [direction, expected] of [['both', [20, 60]], ['direct', [20]], ['retrograde', [60]]] as const) {
    const { context, provider } = analytic(fn);
    const found = events(searchLongitudeCrossings(context, 'Venus', 30, { stepMs: 10, direction }, provider));
    assert.deepEqual(found.map(e => e.atMs), expected);
  }
});
test('ingresses sort multiple boundaries per cell and reverse sign ownership', () => {
  for (const slope of [1, -1]) {
    const { context, provider } = analytic(t => wrap(slope * t), 0, 100);
    const found = events(searchSignIngresses(context, 'Moon', { stepMs: 100 }, provider));
    assert.deepEqual(found.map(e => e.atMs), [30, 60, 90]);
    assert.deepEqual(found.map(e => [e.fromSign, e.toSign]), slope > 0
      ? [['Aries', 'Taurus'], ['Taurus', 'Gemini'], ['Gemini', 'Cancer']]
      : [['Pisces', 'Aquarius'], ['Aquarius', 'Capricorn'], ['Capricorn', 'Sagittarius']]);
  }
  const zero = analytic(t => wrap(t - 50));
  assert.ok(events(searchSignIngresses(zero.context, 'Sun', { stepMs: 10 }, zero.provider))
    .some(e => e.atMs === 50 && e.fromSign === 'Pisces' && e.toSign === 'Aries'));
});
test('integer refinement encloses a fractional root and charges all requests', () => {
  const { context, provider } = analytic(t => 10 + t / 3);
  const found = events(searchLongitudeCrossings(context, 'Sun', 20.1, { stepMs: 100 }, provider));
  assert.equal(found.length, 1);
  assert.ok(found[0]!.bracket[0] <= 30.3 && found[0]!.bracket[1] >= 30.3);
  assert.ok(found[0]!.bracket[1] - found[0]!.bracket[0] <= 1);
  assert.equal(found[0]!.residualDegrees, 10 + found[0]!.atMs / 3 - 20.1);
  assert.ok(context.evaluations > 2);
  const edge = analytic(t => t + 0.9, 0, 2);
  assert.equal(events(searchLongitudeCrossings(edge.context, 'Sun', 1, { stepMs: 2 }, edge.provider))[0]!.atMs, 1);
});
test('shared budget refusal discards already found roots, cancellation does likewise', () => {
  const small = analytic(t => t, 0, 100, 5);
  const result = searchSignIngresses(small.context, 'Moon', { stepMs: 10 }, small.provider);
  assert.deepEqual(result, { status: 'refused', reason: 'evaluation-budget', events: [], evaluations: 5 });
  const controller = new AbortController();
  const cancelled = analytic(t => { if (t >= 40) controller.abort(); return t; }, 0, 100, 1000, controller.signal);
  const aborted = searchSignIngresses(cancelled.context, 'Moon', { stepMs: 10 }, cancelled.provider);
  assert.equal(aborted.status, 'refused');
  assert.deepEqual(aborted.events, []);
  if (aborted.status === 'refused') assert.equal(aborted.reason, 'cancelled');
});
test('validation precedes sampling and invalid provider data propagates', () => {
  const { context, provider } = analytic(t => t);
  for (const value of [-1, 360, NaN, Infinity]) {
    assert.throws(() => searchLongitudeCrossings(context, 'Sun', value, { stepMs: 1 }, provider), RangeError);
  }
  for (const stepMs of [0, -1, 0.5, NaN, Infinity]) {
    assert.throws(() => searchSignIngresses(context, 'Sun', { stepMs }, provider), RangeError);
  }
  const other = analytic(t => t);
  assert.throws(() => searchSignIngresses(context, 'Sun', { stepMs: 1 }, other.provider), TypeError);
  assert.equal(context.evaluations, 0);
  const invalid = analytic(() => NaN);
  assert.throws(() => searchSignIngresses(invalid.context, 'Sun', { stepMs: 10 }, invalid.provider), RangeError);
  const ambiguous = analytic(t => t * 1.8);
  assert.throws(() => searchSignIngresses(ambiguous.context, 'Sun', { stepMs: 100 }, ambiguous.provider), RangeError);
});
test('constant longitude does not emit repeated contacts', () => {
  const { context, provider } = analytic(() => 30);
  assert.deepEqual(events(searchSignIngresses(context, 'Sun', { stepMs: 10 }, provider)), []);
});
// Integration behavior only. No expected event date is inferred from this engine.
test('default engine provider searches on the declared clock', () => {
  const context = new EvaluationContext({ startMs: Date.parse('2000-01-01T00:00:00Z'),
    endMs: Date.parse('2000-01-10T00:00:00Z'), clock: 'tt' }, { maxEvaluations: 1000 });
  const found = events(searchSignIngresses(context, 'Moon', { stepMs: 3_600_000 }));
  assert.ok(found.length > 0);
  assert.ok(found.every(e => context.owns(e.atMs) && e.clock === 'tt' && e.direction === 'direct'));
});
test('sampled tangent is suppressed and hidden paired roots are not certified', () => {
  const tangent = analytic(t => 30 - (t - 50) ** 2 / 100);
  assert.deepEqual(events(searchSignIngresses(tangent.context, 'Venus', { stepMs: 10 }, tangent.provider)), []);
  // Analytic crossings at 25 and 75 are both hidden in a single scan cell.
  const hidden = analytic(t => 30 + (t - 25) * (t - 75) / 1000);
  assert.deepEqual(events(searchLongitudeCrossings(hidden.context, 'Venus', 30,
    { stepMs: 100 }, hidden.provider)), []);
  const resolved = analytic(t => 30 + (t - 25) * (t - 75) / 1000);
  assert.deepEqual(events(searchLongitudeCrossings(resolved.context, 'Venus', 30,
    { stepMs: 5 }, resolved.provider)).map(e => e.atMs), [25, 75]);
});
