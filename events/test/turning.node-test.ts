import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EvaluationContext, searchLongitudeCrossings, searchSignIngresses, searchExactAspects } from '../src/index.js';
import type { EventBody, LongitudeProvider, LongitudeScanOptions, SearchResult } from '../src/index.js';

const DAY = 86_400_000;
const wrap = (x: number) => ((x % 360) + 360) % 360;
const loop = (t: number) => 30 + (t - 25) * (t - 75) / 1000;
const loopRate = (t: number) => (2 * t - 100) / 1000;
const aware = { stepMs: 100, stationStepMs: 100 };

function motion(position: (t: number, body: EventBody) => number = loop,
  rate: (t: number, body: EventBody) => number = loopRate,
  startMs = 0, endMs = 100, budget = 10000, signal?: AbortSignal) {
  const context = new EvaluationContext({ startMs, endMs, clock: 'tt' },
    { maxEvaluations: budget, ...(signal ? { signal } : {}) });
  const provider: LongitudeProvider = { context, sample: (body, t, withSpeed) => {
    assert.ok(t >= startMs && t <= endMs);
    return context.evaluate(() => {
      const value = position(t, body);
      return { longitude: value >= 0 && value < 360 ? value : wrap(value),
        speedDegreesPerDay: withSpeed ? rate(t, body) * DAY : null };
    });
  } };
  return { context, provider };
}
function events<T>(result: SearchResult<T>) {
  assert.equal(result.status, 'complete');
  return result.events;
}

test('speed splitting recovers a hidden ingress pair and its wrap with direction filters', () => {
  for (const target of [0, 30]) {
    for (const [direction, expected] of [['both', [25, 75]], ['direct', [75]], ['retrograde', [25]]] as const) {
      const { context, provider } = motion(t => loop(t) + target - 30);
      const found = events(searchSignIngresses(context, 'Venus', { ...aware, direction }, provider));
      assert.deepEqual(found.map(e => e.atMs), expected);
      assert.deepEqual(found.map(e => e.toSign), expected.map(t => target === 0
        ? (t === 25 ? 'Pisces' : 'Aries') : (t === 25 ? 'Aries' : 'Taurus')));
    }
  }
});

test('relative speed resolves turning points even when both individual bodies move direct', () => {
  for (const target of [{ kind: 'fixed', longitude: 0 }, { kind: 'moving', body: 'Sun' }] as const) {
    const { context, provider } = target.kind === 'fixed' ? motion() : motion(
      (t, b) => 100 + t + (b === 'Mars' ? loop(t) : 0),
      (t, b) => 1 + (b === 'Mars' ? loopRate(t) : 0));
    const found = events(searchExactAspects(context, 'Mars', target,
      { aspects: [{ id: 'custom', angleDegrees: 30 }] }, aware, provider));
    assert.deepEqual(found.map(e => [e.atMs, e.direction, e.relativeLongitude]),
      [[25, 'retrograde', 30], [75, 'direct', 30]]);
  }
});

test('a separate station grid resolves a loop with multiple turning points in one longitude step', () => {
  const position = (t: number) => 30 + (t - 20) * (t - 50) * (t - 80) / 10000;
  const rate = (t: number) => (3 * t * t - 300 * t + 6600) / 10000;
  const { context, provider } = motion(position, rate);
  const found = events(searchLongitudeCrossings(context, 'Mercury', 30,
    { stepMs: 100, stationStepMs: 25 }, provider));
  assert.deepEqual(found.map(e => e.atMs), [20, 50, 80]);
  assert.deepEqual(found.map(e => e.direction), ['direct', 'retrograde', 'direct']);
});

test('fractional stations retain both sides, and fractional crossing brackets enclose analytic roots', () => {
  const rootA = 25.2, rootB = 75.8;
  const { context, provider } = motion(t => 30 + (t - rootA) * (t - rootB) / 1000,
    t => (2 * t - rootA - rootB) / 1000);
  const found = events(searchLongitudeCrossings(context, 'Venus', 30, aware, provider));
  assert.equal(found.length, 2);
  for (const [i, root] of [rootA, rootB].entries()) {
    const event = found[i]!;
    assert.ok(event.bracket[0] <= root && event.bracket[1] >= root);
    assert.ok(event.bracket[1] - event.bracket[0] <= 1);
    assert.equal(event.residualDegrees, (event.atMs - rootA) * (event.atMs - rootB) / 1000 + 30 - 30);
  }
});

test('station and window knots preserve open-start ownership and suppress interior touches', () => {
  for (const direction of ['both', 'direct', 'retrograde'] as const) {
    const tangent = motion(t => 30 - (t - 50) ** 2 / 1000, t => -(t - 50) / 500);
    assert.deepEqual(events(searchLongitudeCrossings(tangent.context, 'Venus', 30,
      { ...aware, direction }, tangent.provider)), []);
  }
  for (const [start, end, expected] of [[0, 25, [25]], [25, 75, [75]], [75, 100, []]] as const) {
    const { context, provider } = motion(loop, loopRate, start, end);
    assert.deepEqual(events(searchLongitudeCrossings(context, 'Venus', 30, aware, provider))
      .map(e => e.atMs), expected);
  }
  const endpoint = motion(t => 30 - (t - 100) ** 2 / 1000, t => -(t - 100) / 500);
  assert.deepEqual(events(searchLongitudeCrossings(endpoint.context, 'Venus', 30, aware, endpoint.provider))
    .map(e => [e.atMs, e.direction]), [[100, 'direct']]);
  const constant = motion(() => 30, () => 0);
  assert.deepEqual(events(searchSignIngresses(constant.context, 'Venus', aware, constant.provider)), []);
});

test('speed refinement and later discoveries share the all-or-nothing budget and cancellation', () => {
  const refused = motion(loop, loopRate, 0, 100, 3);
  assert.deepEqual(searchSignIngresses(refused.context, 'Venus', aware, refused.provider),
    { status: 'refused', reason: 'evaluation-budget', events: [], evaluations: 3 });
  const controller = new AbortController();
  const cancelled = motion(t => { if (t === 50) controller.abort(); return loop(t); }, loopRate,
    0, 100, 1000, controller.signal);
  const result = searchSignIngresses(cancelled.context, 'Venus', aware, cancelled.provider);
  assert.equal(result.status, 'refused');
  assert.deepEqual(result.events, []);
  if (result.status === 'refused') assert.equal(result.reason, 'cancelled');
  // An earlier crossing is discarded when the subsequent cell exhausts work.
  const exhausted = motion(loop, loopRate, 0, 100, 8);
  assert.deepEqual(searchSignIngresses(exhausted.context, 'Venus',
    { stepMs: 25, stationStepMs: 25 }, exhausted.provider),
    { status: 'refused', reason: 'evaluation-budget', events: [], evaluations: 8 });
  const first = motion();
  const conjunction = { id: 'conjunction', angleDegrees: 0 };
  assert.equal(events(searchExactAspects(first.context, 'Venus', { kind: 'fixed', longitude: 30 },
    { aspects: [conjunction] }, aware, first.provider)).length, 2);
  const later = motion(loop, loopRate, 0, 100, first.context.evaluations + 1);
  assert.deepEqual(searchExactAspects(later.context, 'Venus', { kind: 'fixed', longitude: 30 },
    { aspects: [conjunction, { id: 'square', angleDegrees: 90 }] }, aware, later.provider),
    { status: 'refused', reason: 'evaluation-budget', events: [], evaluations: first.context.evaluations + 1 });
});

test('station grid zeros, start-window stations and very small speed signs preserve crossings', () => {
  const grid = motion();
  assert.deepEqual(events(searchLongitudeCrossings(grid.context, 'Venus', 30,
    { ...aware, stationStepMs: 50 }, grid.provider)).map(e => e.atMs), [25, 75]);
  const start = motion(t => t*t/100, t => t/50);
  assert.deepEqual(events(searchLongitudeCrossings(start.context, 'Venus', 25,
    aware, start.provider)).map(e => e.atMs), [50]);
  // Continuous, mutually consistent motion with small finite speed values.
  // Multiplying the endpoint speeds underflows, but their signs still differ.
  const tiny = motion(t => 1e-200 * ((t - 50)**2 - 625) + 1e-196,
    t => 2e-200 * (t - 50));
  const found = events(searchLongitudeCrossings(tiny.context, 'Venus', 1e-196, aware, tiny.provider));
  assert.deepEqual(found.map(e => e.atMs), [25, 75]);
});

test('station options validate before sampling and unavailable speeds refuse the policy explicitly', () => {
  const { context, provider } = motion();
  for (const stationStepMs of [0, -1, 0.5, NaN, Infinity, 101, null]) {
    assert.throws(() => searchSignIngresses(context, 'Venus',
      { stepMs: 100, stationStepMs } as LongitudeScanOptions, provider), RangeError);
  }
  assert.equal(context.evaluations, 0);
  for (const speedDegreesPerDay of [undefined, null, NaN, Infinity]) {
    const source: LongitudeProvider = { context, sample: (_b, t) => context.evaluate(() =>
      ({ longitude: loop(t), ...(speedDegreesPerDay === undefined ? {} : { speedDegreesPerDay }) })) };
    assert.throws(() => searchSignIngresses(context, 'Venus', aware, source), RangeError);
    assert.throws(() => searchExactAspects(context, 'Venus', { kind: 'fixed', longitude: 0 },
      { aspects: [{ id: 'custom', angleDegrees: 30 }] }, aware, source), RangeError);
  }
});

test('longitude-only providers retain the original scan when stationStepMs is omitted', () => {
  const { context } = motion();
  const provider: LongitudeProvider = { context, sample: (_b, t, withSpeed) => {
    assert.equal(!!withSpeed, false);
    return context.evaluate(() => ({ longitude: loop(t) }));
  } };
  assert.deepEqual(events(searchSignIngresses(context, 'Venus', { stepMs: 100 }, provider)), []);
});
