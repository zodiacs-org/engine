import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { executeQuery, parseQuery } from '../src/index.js';
import type { EventBody, ExecuteOptions, QueryProviders, EventQuery } from '../src/index.js';
const wrap = (x: number) => ((x % 360) + 360) % 360;
const options: ExecuteOptions = { clock: 'tt', horizon: { startMs: 0, endMs: 360, clock: 'tt' }, stepMs: 10, maxEvaluations: 10000 };
const linear: QueryProviders = { motion: context => ({ context, sample: (_b, t) => context.evaluate(() =>
  ({ longitude: wrap(t), speedDegreesPerDay: 1 })) }) };
const first = (result: ReturnType<typeof executeQuery>) => {
  assert.equal(result.status, 'complete'); return result.events[0]!;
};
test('next uses a bounded explicit horizon and selects the earliest signed aspect pass', () => {
  const r = executeQuery('next Mars square natal Sun', { ...options, natalLongitudes: { Sun: 0 } }, linear);
  assert.equal(r.events.length, 1);
  assert.equal((first(r) as { atMs: number }).atMs, 90);
  assert.deepEqual(r.window, options.horizon);
  assert.ok(r.evaluations > 0);
  assert.deepEqual(executeQuery('next Mars ingresses into Cancer', options, linear).events.map(e => 'atMs' in e ? e.atMs : null), [90]);
});
test('programmatic AST and DSL execution agree on all events and entered-sign filters', () => {
  const text = 'all Mars ingresses into Aries from 2000-01-01 to 2000-01-02 clock tt';
  const opts = { stepMs: 3600000, maxEvaluations: 10000 };
  const provider: QueryProviders = { motion: context => ({ context, sample: (_b, t) => context.evaluate(() =>
    ({ longitude: wrap((t-context.window.startMs)/240000), speedDegreesPerDay: 360 })) }) };
  const a = executeQuery(text, opts, provider), b = executeQuery(parseQuery(text), opts, provider);
  assert.deepEqual(a, b);
  assert.equal(a.events.length, 1);
  assert.equal((first(a) as { atMs: number }).atMs, a.window.endMs);
});
test('moving targets and station direction are dispatched with shared providers', () => {
  const moving: QueryProviders = { motion: context => ({ context, sample: (b, t) => context.evaluate(() =>
    ({ longitude: wrap((b === 'Sun' ? 2 : 1)*t), speedDegreesPerDay: 1 })) }) };
  assert.equal((first(executeQuery('next Mars opposition Sun', options, moving)) as { atMs: number }).atMs, 180);
  const station: QueryProviders = { motion: context => ({ context, sample: (_b, t) => context.evaluate(() =>
    ({ longitude: 140-(t-100)**2/10000, speedDegreesPerDay: 100-t })) }) };
  const r = executeQuery('next Venus stations retrograde', options, station);
  assert.equal((first(r) as { atMs: number }).atMs, 100);
  assert.deepEqual(executeQuery('next Venus stations direct', options, station).events, []);
  const interval = first(executeQuery('next Venus retrogrades in Leo', options, station));
  assert.equal(interval.kind, 'retrograde');
  if (interval.kind === 'retrograde') {
    assert.equal(interval.startMs, 100); assert.equal(interval.clippedEnd, true);
  }
});
test('interval next includes ongoing clipped periods and retains unresolved Moon tails', () => {
  const p: QueryProviders = { motion: context => ({ context, sample: (b, t) => context.evaluate(() =>
    ({ longitude: b === 'Moon' ? t/10 : 0, speedDegreesPerDay: 1 })) }) };
  const r = executeQuery('next void-of-course Moon with Sun aspects opposition', options, p);
  const e = first(r);
  assert.equal(e.kind, 'void-of-course');
  if (e.kind === 'void-of-course') assert.deepEqual([e.startMs, e.endMs, e.clippedStart], [0, 300, true]);
  if (r.status === 'complete') assert.deepEqual(r.unresolved, [{ startMs: 300, endMs: 360, sign: 'Taurus', reason: 'next-ingress-outside-window' }]);
  const tail = executeQuery('next void-of-course Moon with Sun aspects opposition',
    { ...options, horizon: { startMs: 0, endMs: 200, clock: 'tt' } }, p);
  assert.deepEqual(tail.events, []);
  if (tail.status === 'complete') assert.equal(tail.unresolved.length, 1);
});
test('eclipse dispatch keeps the explicit spherical model and derivative definition', () => {
  const r = executeQuery('next lunar eclipses', { ...options, eclipse: {
    model: { sunRadiusAu: 2, moonRadiusAu: 0.2, earthRadiusAu: 1 }, derivativeStepMs: 1 } },
    { eclipse: context => ({ sample: t => context.evaluate(() => ({ sun: [100, 0, 0], moon: [-10, (t-180)/100, 0] })) }) });
  const e = first(r);
  assert.equal(e.kind, 'lunar');
  if (e.kind === 'lunar') { assert.equal(e.atMs, 180); assert.equal(e.classification, 'total'); }
});
test('budget and cancellation after an early event discard it even in next mode', () => {
  const r = executeQuery('next Mars ingresses', { ...options, maxEvaluations: 10 }, linear);
  assert.deepEqual(r, { status: 'refused', reason: 'evaluation-budget', events: [], evaluations: 10, window: options.horizon });
  const controller = new AbortController();
  const p: QueryProviders = { motion: context => ({ context, sample: (_b, t) => context.evaluate(() => {
    if (t > 200) controller.abort(); return { longitude: wrap(t), speedDegreesPerDay: 1 };
  }) }) };
  const cancelled = executeQuery('next Mars ingresses', { ...options, signal: controller.signal }, p);
  assert.equal(cancelled.status, 'refused'); assert.deepEqual(cancelled.events, []);
  controller.abort();
  const pre = executeQuery('next Mars ingresses', { ...options, signal: controller.signal }, linear);
  assert.equal(pre.evaluations, 0);
});
test('explicit clocks, horizons, natal values, model and typed AST validation fail before work', () => {
  const unused: QueryProviders = { motion: () => { throw new Error('must not sample'); } };
  assert.throws(() => executeQuery('next Mars ingresses', { stepMs: 10, maxEvaluations: 100 }, unused));
  assert.throws(() => executeQuery('next Mars ingresses clock tt', { stepMs: 10, maxEvaluations: 100 }, unused));
  assert.throws(() => executeQuery('next Mars ingresses clock utc', options, unused));
  assert.throws(() => executeQuery('next Mars ingresses', { ...options, horizon: { ...options.horizon!, clock: 'utc' } }, unused));
  assert.throws(() => executeQuery('all Mars ingresses 2000-2001', options, unused));
  for (const value of [undefined, NaN, -1, 360]) assert.throws(() => executeQuery('next Mars square natal Sun',
    { ...options, natalLongitudes: value === undefined ? {} : { Sun: value } }, unused));
  assert.throws(() => executeQuery('next solar eclipses', options, unused));
  const q = parseQuery('next Mars ingresses');
  for (const bad of [{ ...q, extra: true }, { ...q, event: { ...q.event, body: 'Mars ingresses' } },
    { ...q, mode: 'invalid' }, { ...q, event: { kind: 'aspect', body: 'Mars', aspect: 'square', target: { kind: 'invalid', body: 'Sun' } } }]) {
    assert.throws(() => executeQuery(bad as EventQuery, options, unused));
  }
});
test('engine coverage refusal is structured; unrelated provider errors propagate', () => {
  const r = executeQuery('all Sun ingresses from 1700-01-01 to 1700-01-02 clock tt', { stepMs: 3600000, maxEvaluations: 100 });
  assert.equal(r.status, 'refused');
  if (r.status === 'refused') assert.equal(r.reason, 'engine-refused');
  assert.deepEqual(r.events, []);
  const error = new Error('failure');
  assert.throws(() => executeQuery('next Mars ingresses', options, { motion: () => { throw error; } }), e => e === error);
});
// Independent date evidence is the existing hashed JPL fixture, not API output.
const fixture = JSON.parse(readFileSync(new URL('../../references/horizons.json', import.meta.url), 'utf8')) as {
  events: { case: { kind: string; body: EventBody; start: string; end: string; natalLongitude?: number; toleranceMs: number }; atMs: number }[];
};
for (const { case: c, atMs } of fixture.events.filter(x => x.case.kind === 'fixed-aspect')) {
  test('DSL synthetic natal square agrees with independently reduced Horizons date', () => {
    const r = executeQuery(`next ${c.body} square natal Sun from ${c.start} to ${c.end} clock tt`,
      { stepMs: 3600000, maxEvaluations: 10000, natalLongitudes: { Sun: c.natalLongitude! } });
    const e = first(r);
    assert.ok('atMs' in e && Math.abs(e.atMs-atMs) <= c.toleranceMs);
  });
}
