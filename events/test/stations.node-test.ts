import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EvaluationContext, searchStations, searchRetrogradeIntervals } from '../src/index.js';
import type { MotionProvider, SearchResult } from '../src/index.js';
function setup(speed: (t: number) => number, longitude = (_t: number) => 135,
  startMs = 0, endMs = 100, budget = 10000, signal?: AbortSignal) {
  const context = new EvaluationContext({ startMs, endMs, clock: 'tt' },
    { maxEvaluations: budget, ...(signal ? { signal } : {}) });
  const provider: MotionProvider = { context, sample: (_body, t) => context.evaluate(() => ({
    longitude: longitude(t), speedDegreesPerDay: speed(t)
  })) };
  return { context, provider };
}
function complete<T>(result: SearchResult<T>) {
  assert.equal(result.status, 'complete');
  return result.events;
}
test('analytic speed roots classify both stations and a bounded retrograde interval', () => {
  const s = setup(t => (t - 20) * (t - 80));
  const found = complete(searchStations(s.context, 'Venus', { stepMs: 10 }, s.provider));
  assert.deepEqual(found.map(e => [e.atMs, e.direction, e.bracket]),
    [[20, 'retrograde', [20, 20]], [80, 'direct', [80, 80]]]);
  const r = setup(t => (t - 20) * (t - 80));
  const intervals = complete(searchRetrogradeIntervals(r.context, 'Venus', { stepMs: 10, sign: 'Leo' }, r.provider));
  assert.deepEqual(intervals.map(e => [e.startMs, e.endMs, e.clippedStart, e.clippedEnd]), [[20, 80, false, false]]);
});
test('fractional roots retain a millisecond enclosure and residual', () => {
  const s = setup(t => 23.4 - t);
  const [event] = complete(searchStations(s.context, 'Mars', { stepMs: 10 }, s.provider));
  assert.ok(event!.bracket[0] <= 23.4 && event!.bracket[1] >= 23.4);
  assert.ok(event!.bracket[1] - event!.bracket[0] <= 1);
  assert.equal(event!.residualDegreesPerDay, 23.4 - event!.atMs);
});
test('touches do not change direction; unresolved plateaus reject', () => {
  const s = setup(t => (t - 50) ** 2);
  assert.deepEqual(complete(searchStations(s.context, 'Venus', { stepMs: 10 }, s.provider)), []);
  const p = setup(() => 0);
  assert.throws(() => searchStations(p.context, 'Venus', { stepMs: 10 }, p.provider), /plateau/);
});
test('window clipping, initial zeros and unconfirmed final zeros are explicit', () => {
  for (const [speed, expected] of [
    [(_t: number) => -1, [[0, 100, true, true]]],
    [(t: number) => t - 50, [[0, 50, true, false]]],
    [(t: number) => 50 - t, [[50, 100, false, true]]],
    [(t: number) => -t, [[0, 100, true, true]]],
    [(t: number) => t - 100, [[0, 100, true, true]]],
    [(_t: number) => 1, []]
  ] as const) {
    const s = setup(speed);
    assert.deepEqual(complete(searchRetrogradeIntervals(s.context, 'Venus', { stepMs: 10 }, s.provider))
      .map(e => [e.startMs, e.endMs, e.clippedStart, e.clippedEnd]), expected);
  }
  const s = setup(t => 100 - t);
  assert.deepEqual(complete(searchStations(s.context, 'Venus', { stepMs: 10 }, s.provider)), []);
});
test('sign filtering uses positive-duration overlap and preserves full intervals', () => {
  for (const [sign, count] of [['Leo', 1], ['Cancer', 1], ['Virgo', 0]] as const) {
    const s = setup(() => -1, t => 140 - t / 2);
    const found = complete(searchRetrogradeIntervals(s.context, 'Venus', { stepMs: 10, sign }, s.provider));
    assert.equal(found.length, count);
    if (count) assert.deepEqual(found[0]!.signSpans, [
      { sign: 'Leo', startMs: 0, endMs: 40 }, { sign: 'Cancer', startMs: 40, endMs: 100 }
    ]);
  }
  const boundary = setup(() => -1, t => 120 - t / 10);
  assert.equal(complete(searchRetrogradeIntervals(boundary.context, 'Venus',
    { stepMs: 10, sign: 'Leo' }, boundary.provider)).length, 0);
});
test('short-arc wrap correctly produces retrograde sign spans', () => {
  const s = setup(() => -1, t => ((10 - t / 5) + 360) % 360);
  const [found] = complete(searchRetrogradeIntervals(s.context, 'Mars', { stepMs: 10 }, s.provider));
  assert.deepEqual(found!.signSpans.map(e => e.sign), ['Aries', 'Pisces']);
});
test('hidden paired stations demonstrate conditional sampling completeness', () => {
  const coarse = setup(t => (t - 20) * (t - 80));
  assert.deepEqual(complete(searchStations(coarse.context, 'Venus', { stepMs: 100 }, coarse.provider)), []);
  const fine = setup(t => (t - 20) * (t - 80));
  assert.equal(complete(searchStations(fine.context, 'Venus', { stepMs: 10 }, fine.provider)).length, 2);
});
test('budget exhaustion during ingress search discards prior intervals; cancellation propagates', () => {
  const s = setup(t => (t - 20) * (t - 80), undefined, 0, 100, 18);
  const result = searchRetrogradeIntervals(s.context, 'Venus', { stepMs: 10 }, s.provider);
  assert.deepEqual(result, { status: 'refused', reason: 'evaluation-budget', events: [], evaluations: 18 });
  const controller = new AbortController();
  const c = setup(t => { if (t >= 50) controller.abort(); return 20 - t; }, undefined, 0, 100, 10000, controller.signal);
  const cancelled = searchStations(c.context, 'Venus', { stepMs: 10 }, c.provider);
  assert.equal(cancelled.status, 'refused');
  assert.deepEqual(cancelled.events, []);
});
test('validation precedes work and invalid provider samples propagate', () => {
  const s = setup(() => -1);
  assert.throws(() => searchStations(s.context, 'Venus', { stepMs: 0 }, s.provider));
  assert.throws(() => searchRetrogradeIntervals(s.context, 'Venus', { stepMs: 10, sign: 'bad' as never }, s.provider));
  const other = setup(() => -1);
  assert.throws(() => searchStations(s.context, 'Venus', { stepMs: 10 }, other.provider));
  assert.equal(s.context.evaluations, 0);
  const invalid = setup(() => NaN);
  assert.throws(() => searchStations(invalid.context, 'Venus', { stepMs: 10 }, invalid.provider));
});
// Integration only: no engine-derived station date is used as an expectation.
test('default adapter supplies speed for stations and intervals', () => {
  const context = new EvaluationContext({ startMs: Date.parse('2000-01-01T00:00:00Z'),
    endMs: Date.parse('2000-02-01T00:00:00Z'), clock: 'tt' }, { maxEvaluations: 10000 });
  assert.equal(searchStations(context, 'Venus', { stepMs: 86_400_000 }).status, 'complete');
  assert.equal(searchRetrogradeIntervals(context, 'Venus', { stepMs: 86_400_000 }).status, 'complete');
});
test('multiple retrograde intervals preserve order and clipping on negative epochs', () => {
  const s = setup(t => Math.cos(Math.PI * t / 40), undefined, -90, 90);
  const found = complete(searchRetrogradeIntervals(s.context, 'Venus', { stepMs: 10 }, s.provider));
  assert.equal(found.length, 2);
  assert.ok(found.every(e => e.startMs < e.endMs));
  assert.ok(found[0]!.endMs < found[1]!.startMs);
});
test('analytic longitude integral produces stations and sign overlap together', () => {
  const day = 86_400_000;
  const s = setup(t => (t / day - 2) * (t / day - 8),
    t => 130 + (t / day) ** 3 / 3 - 5 * (t / day) ** 2 + 16 * t / day,
    0, 10 * day);
  const [found] = complete(searchRetrogradeIntervals(s.context, 'Venus',
    { stepMs: day / 2, sign: 'Cancer' }, s.provider));
  assert.equal(found!.startMs, 2 * day);
  assert.equal(found!.endMs, 8 * day);
  assert.deepEqual(found!.signSpans.map(e => e.sign), ['Leo', 'Cancer']);
});
