import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EvaluationContext, searchExactAspects } from '../src/index.js';
import type { EventBody, LongitudeProvider, ExactAspectPolicy, SearchResult } from '../src/index.js';
const wrap = (x: number) => ((x % 360) + 360) % 360;
const square = { aspects: [{ id: 'square', angleDegrees: 90 }] };
function setup(fn: (body: EventBody, t: number) => number, endMs = 360, budget = 10000, signal?: AbortSignal) {
  const context = new EvaluationContext({ startMs: 0, endMs, clock: 'tt' },
    { maxEvaluations: budget, ...(signal ? { signal } : {}) });
  const provider: LongitudeProvider = { context, sample: (body, t) =>
    context.evaluate(() => ({ longitude: fn(body, t) })) };
  return { context, provider };
}
function events<T>(result: SearchResult<T>) {
  assert.equal(result.status, 'complete');
  return result.events;
}
test('synthetic natal square retains both signed branches', () => {
  const { context, provider } = setup((_b, t) => wrap(350 + t));
  const found = events(searchExactAspects(context, 'Mars', { kind: 'fixed', longitude: 350 },
    square, { stepMs: 30 }, provider));
  assert.deepEqual(found.map(e => [e.atMs, e.relativeLongitude]), [[90, 90], [270, 270]]);
  assert.ok(found.every(e => e.clock === 'tt' && e.body === 'Mars' && e.aspect.id === 'square'));
});
test('moving pairs use relative motion even when both bodies move direct', () => {
  const { context, provider } = setup((b, t) => wrap(350 + (b === 'Mars' ? 1 : 2) * t));
  const found = events(searchExactAspects(context, 'Mars', { kind: 'moving', body: 'Sun' },
    square, { stepMs: 30 }, provider));
  assert.deepEqual(found.map(e => [e.atMs, e.relativeLongitude, e.direction]),
    [[90, 270, 'retrograde'], [270, 90, 'retrograde']]);
});
test('conjunction and opposition have one branch and shared endpoints have one owner', () => {
  const { context, provider } = setup((_b, t) => wrap(t));
  const policy = { aspects: [{ id: 'conjunction', angleDegrees: 0 }, { id: 'opposition', angleDegrees: 180 }] };
  assert.deepEqual(events(searchExactAspects(context, 'Moon', { kind: 'fixed', longitude: 0 },
    policy, { stepMs: 30 }, provider)).map(e => e.atMs), [180, 360]);
});
test('resolved retrograde loop retains every exact pass and filters relative direction', () => {
  for (const [direction, expected] of [['both', [20, 60, 100]], ['direct', [20, 100]], ['retrograde', [60]]] as const) {
    const { context, provider } = setup((_b, t) => 70 + (t <= 40 ? t : t <= 80 ? 80 - t : t - 80), 120);
    const found = events(searchExactAspects(context, 'Venus', { kind: 'fixed', longitude: 0 },
      square, { stepMs: 10, direction }, provider));
    assert.deepEqual(found.map(e => e.atMs), expected);
  }
});
test('custom angle, simultaneous policies, fractional roots and stationary touches', () => {
  const { context, provider } = setup((_b, t) => t / 3, 100);
  const policy = { aspects: [{ id: 'custom', angleDegrees: 20.1 }, { id: 'other', angleDegrees: 30 }] };
  const found = events(searchExactAspects(context, 'Mars', { kind: 'fixed', longitude: 0 }, policy, { stepMs: 10 }, provider));
  assert.equal(found.length, 2);
  assert.ok(found[0]!.bracket[0] <= 60.3 && found[0]!.bracket[1] >= 60.3);
  const tangent = setup((_b, t) => 90 - (t - 50) ** 2 / 100, 100);
  assert.deepEqual(events(searchExactAspects(tangent.context, 'Mars', { kind: 'fixed', longitude: 0 },
    square, { stepMs: 10 }, tangent.provider)), []);
});
test('budget refusal after an earlier branch discards all contacts', () => {
  const { context, provider } = setup((_b, t) => wrap(t), 360, 20);
  const result = searchExactAspects(context, 'Mars', { kind: 'fixed', longitude: 0 }, square, { stepMs: 30 }, provider);
  assert.deepEqual(result, { status: 'refused', reason: 'evaluation-budget', events: [], evaluations: 20 });
  const controller = new AbortController();
  const cancelled = setup((_b, t) => { if (t >= 100) controller.abort(); return wrap(t); }, 360, 10000, controller.signal);
  const aborted = searchExactAspects(cancelled.context, 'Mars', { kind: 'fixed', longitude: 0 }, square, { stepMs: 30 }, cancelled.provider);
  assert.equal(aborted.status, 'refused');
  assert.deepEqual(aborted.events, []);
});
test('invalid policy and target reject before sampling; invalid source values propagate', () => {
  const { context, provider } = setup((_b, t) => t);
  for (const policy of [{ aspects: [] }, { aspects: [{ id: 'x', angleDegrees: 181 }] },
    { aspects: [{ id: 'x', angleDegrees: 90 }, { id: 'y', angleDegrees: 90 }] },
    { aspects: [{ id: 'x', angleDegrees: 90 }, { id: 'x', angleDegrees: 60 }] }] satisfies ExactAspectPolicy[]) {
    assert.throws(() => searchExactAspects(context, 'Mars', { kind: 'fixed', longitude: 0 }, policy, { stepMs: 10 }, provider));
  }
  assert.throws(() => searchExactAspects(context, 'Mars', { kind: 'moving', body: 'Mars' }, square, { stepMs: 10 }, provider));
  assert.throws(() => searchExactAspects(context, 'Mars', { kind: 'fixed', longitude: 360 }, square, { stepMs: 10 }, provider));
  assert.equal(context.evaluations, 0);
  const invalid = setup(b => b === 'Sun' ? NaN : 0);
  assert.throws(() => searchExactAspects(invalid.context, 'Mars', { kind: 'moving', body: 'Sun' }, square, { stepMs: 10 }, invalid.provider));
});
// Delegation only, with no engine-derived expected event date.
test('default engine adapter supports moving pairs', () => {
  const context = new EvaluationContext({ startMs: Date.parse('2000-01-01T00:00:00Z'),
    endMs: Date.parse('2000-02-01T00:00:00Z'), clock: 'tt' }, { maxEvaluations: 10000 });
  const found = events(searchExactAspects(context, 'Moon', { kind: 'moving', body: 'Sun' }, square, { stepMs: 3_600_000 }));
  assert.ok(found.length > 0);
  assert.ok(found.every(e => context.owns(e.atMs)));
});
