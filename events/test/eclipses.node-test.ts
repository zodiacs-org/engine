import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calc } from '../../src/calc.js';
import { EvaluationContext, EclipseEngineAdapter, eclipseGeometry, searchEclipses, EngineRefused } from '../src/index.js';
import type { Clock, EclipseKind, EclipseProvider, EclipseVectors } from '../src/index.js';

const model = { sunRadiusAu: 2, moonRadiusAu: 0.2, earthRadiusAu: 1 };
const context = (budget = 10000, clock: Clock = 'tt', signal?: AbortSignal) =>
  new EvaluationContext({ startMs: 0, endMs: 1000, clock }, { maxEvaluations: budget, ...(signal ? { signal } : {}) });
const options = { stepMs: 100, derivativeStepMs: 1 };
function analytic(ctx: EvaluationContext, kind: EclipseKind, offset = 0, root = 500): EclipseProvider {
  return { sample: t => ctx.evaluate(() => ({ sun: [100, 0, 0],
    moon: [kind === 'solar' ? 10 : -10, (t-root)/100, offset] })) };
}

test('similar-triangle lunar cones and transverse distance follow exact arithmetic', () => {
  const g = eclipseGeometry('lunar', { sun: [100, 0, 0], moon: [-10, 0.5, 0] }, model);
  assert.equal(g.axisDistanceAu, 0.5);
  assert.equal(g.umbraRadiusAu, 0.9);
  assert.equal(g.penumbraRadiusAu, 1.3);
  assert.equal(g.forward, true);
  assert.equal(eclipseGeometry('lunar', { sun: [100, 0, 0], moon: [10, 0, 0] }, model).forward, false);
});
test('solar axis distance uses the Sun-Moon line rather than geocentric elongation', () => {
  const g = eclipseGeometry('solar', { sun: [100, 0, 0], moon: [10, 1, 0] }, model);
  assert.ok(Math.abs(g.axisDistanceAu - 100/Math.sqrt(8101)) < 1e-14);
  assert.equal(g.forward, true);
});
test('analytic closest approaches find solar central and lunar total events on each clock', () => {
  for (const kind of ['solar', 'lunar'] as const) for (const clock of ['utc', 'ut1', 'tt'] as const) {
    const ctx = context(10000, clock);
    const result = searchEclipses(ctx, kind, model, options, analytic(ctx, kind));
    assert.equal(result.status, 'complete');
    assert.equal(result.events.length, 1);
    const e = result.events[0]!;
    assert.equal(e.atMs, 500);
    assert.equal(e.clock, clock);
    assert.equal(e.classification, kind === 'solar' ? 'central' : 'total');
    assert.deepEqual(e.bracket, [500, 500]);
    assert.equal(e.derivativeResidualAuSquaredPerMs, 0);
    assert.equal(e.axisDistanceAu, 0);
    assert.ok(Object.isFrozen(e.model));
  }
});
test('lunar partial, penumbral and no-overlap cases use strict disk overlap', () => {
  for (const [offset, expected] of [[1, 'partial'], [1.2, 'penumbral'], [1.5, undefined]] as const) {
    const ctx = context();
    const result = searchEclipses(ctx, 'lunar', model, options, analytic(ctx, 'lunar', offset));
    assert.equal(result.events[0]?.classification, expected);
    assert.equal(result.events.length, expected ? 1 : 0);
  }
});
test('solar off-axis overlap is partial; opposite-phase minima are rejected', () => {
  const ctx = context();
  const result = searchEclipses(ctx, 'solar', model, options, analytic(ctx, 'solar', 1));
  assert.equal(result.events[0]?.classification, 'partial');
  const other = context();
  assert.deepEqual(searchEclipses(other, 'lunar', model, options, analytic(other, 'solar')).events, []);
});
test('fractional minimum is enclosed by a millisecond bracket and residual belongs to estimate', () => {
  const ctx = context();
  const r = searchEclipses(ctx, 'lunar', model, options, analytic(ctx, 'lunar', 0, 501.25));
  const e = r.events[0]!;
  assert.ok(e.bracket[0] <= 501.25 && e.bracket[1] >= 501.25);
  assert.ok(e.bracket[1]-e.bracket[0] <= 1);
  assert.ok(Math.abs(e.derivativeResidualAuSquaredPerMs - 2*(e.atMs-501.25)/10000) < 1e-15);
});
test('minima in boundary guards are unconfirmed and exact shared scan roots occur once', () => {
  for (const at of [0, 1, 1000]) {
    const ctx = context();
    assert.equal(searchEclipses(ctx, 'lunar', model, options, analytic(ctx, 'lunar', 0, at)).events.length, 0);
  }
  const ctx = context();
  assert.equal(searchEclipses(ctx, 'lunar', model, options, analytic(ctx, 'lunar')).events.length, 1);
});
test('all work shares budget and cancellation discards prior events', () => {
  const ctx = context(20);
  assert.deepEqual(searchEclipses(ctx, 'lunar', model, options, analytic(ctx, 'lunar')),
    { status: 'refused', reason: 'evaluation-budget', events: [], evaluations: 20 });
  const controller = new AbortController();
  const cancelled = context(10000, 'tt', controller.signal);
  const p = analytic(cancelled, 'lunar');
  const provider = { sample(t: number) { const v = p.sample(t); if (t > 800) controller.abort(); return v; } };
  assert.equal(searchEclipses(cancelled, 'lunar', model, options, provider).status, 'refused');
});
test('invalid model, steps, vectors and provider errors propagate before reporting completion', () => {
  const ctx = context();
  for (const value of [0, NaN, Infinity, -1]) {
    assert.throws(() => searchEclipses(ctx, 'solar', { ...model, earthRadiusAu: value }, options), RangeError);
    assert.throws(() => searchEclipses(ctx, 'solar', model, { ...options, stepMs: value }), RangeError);
  }
  assert.throws(() => searchEclipses(ctx, 'solar', model, { ...options, derivativeStepMs: 501 }), RangeError);
  for (const sun of [[0, 0, 0], [NaN, 0, 0], [1, 2]]) {
    assert.throws(() => eclipseGeometry('solar', { sun, moon: [1, 0, 0] } as unknown as EclipseVectors, model), RangeError);
  }
  assert.equal(ctx.evaluations, 0);
  const error = new Error('provider failure');
  assert.throws(() => searchEclipses(ctx, 'solar', model, options, { sample() { throw error; } }), e => e === error);
});
// Same-parent comparisons establish adapter delegation only, not date accuracy.
test('default eclipse vectors delegate parent apparent positions and declared clocks', () => {
  const at = Date.parse('2000-01-01T12:00:00Z');
  for (const clock of ['utc', 'tt', 'ut1'] as const) {
    const ctx = new EvaluationContext({ startMs: at-1000, endMs: at+1000, clock }, { maxEvaluations: 2 });
    const v = new EclipseEngineAdapter(ctx).sample(at);
    for (const body of ['Sun', 'Moon'] as const) {
      const p = calc({ body, time: clock === 'utc' ? new Date(at) : { jd: at/86400000+2440587.5, scale: clock },
        center: 'geocentric', frame: 'ecliptic-true-of-date', zodiac: 'tropical',
        flags: { correction: 'apparent', cartesian: true, speeds: false, units: 'degrees' } });
      assert.equal(p.status, 'ok');
      if (p.status === 'ok') assert.deepEqual(v[body === 'Sun' ? 'sun' : 'moon'], [p.cartesian!.x, p.cartesian!.y, p.cartesian!.z]);
    }
    assert.equal(ctx.evaluations, 2);
    assert.throws(() => new EclipseEngineAdapter(ctx).sample(at+1001), RangeError);
  }
});
test('default adapter refuses outside parent reference coverage', () => {
  const ctx = new EvaluationContext({ startMs: Date.parse('1700-01-01'), endMs: Date.parse('1700-01-02'), clock: 'tt' }, { maxEvaluations: 10 });
  assert.throws(() => searchEclipses(ctx, 'solar', model, options), EngineRefused);
});
test('coarse scans can hide multiple minima; finer cells resolve them', () => {
  const run = (stepMs: number) => {
    const ctx = context();
    const p: EclipseProvider = { sample: t => ctx.evaluate(() => ({ sun: [100, 0, 0],
      moon: [-10, Math.cos(2*Math.PI*(t-250)/500)/10, 0] })) };
    return searchEclipses(ctx, 'lunar', model, { stepMs, derivativeStepMs: 1 }, p);
  };
  assert.ok(run(1000).events.length < 4);
  assert.equal(run(50).events.length, 4);
});
test('flat axis distance emits no continuum of maxima', () => {
  const ctx = context();
  const p: EclipseProvider = { sample: () => ctx.evaluate(() => ({ sun: [100, 0, 0], moon: [-10, 0, 0] })) };
  assert.deepEqual(searchEclipses(ctx, 'lunar', model, options, p).events, []);
});
