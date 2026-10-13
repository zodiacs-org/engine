import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EvaluationContext, searchVoidOfCourseMoon } from '../src/index.js';
import type { EventBody, LongitudeProvider, VoidOfCoursePolicy } from '../src/index.js';
const policy: VoidOfCoursePolicy = { bodies: ['Sun'], aspects: [{ id: 'conjunction', angleDegrees: 0 }] };
const wrap = (x: number) => ((x % 360) + 360) % 360;
function setup(fn: (b: EventBody, t: number) => number, startMs = 0, endMs = 75,
  maxEvaluations = 10000, signal?: AbortSignal) {
  const context = new EvaluationContext({ startMs, endMs, clock: 'tt' },
    { maxEvaluations, ...(signal ? { signal } : {}) });
  const provider: LongitudeProvider = { context, sample: (b, t) =>
    context.evaluate(() => ({ longitude: wrap(fn(b, t)) })) };
  return { context, provider };
}
function run(s: ReturnType<typeof setup>, p = policy) {
  return searchVoidOfCourseMoon(s.context, p, { stepMs: 5 }, s.provider);
}
test('last exact contact ends at ingress; final sign is unresolved', () => {
  const s = setup((b, t) => b === 'Moon' ? t : 20);
  const r = run(s);
  assert.equal(r.status, 'complete');
  if (r.status !== 'complete') return;
  assert.deepEqual(r.events.map(e => [e.startMs, e.endMs, e.sign, e.clippedStart]),
    [[20, 30, 'Aries', false], [30, 60, 'Taurus', false]]);
  assert.equal(r.events[0]!.lastContact!.atMs, 20);
  assert.equal(r.events[1]!.lastContact, null);
  assert.deepEqual(r.unresolved, [{ startMs: 60, endMs: 75, sign: 'Gemini', reason: 'next-ingress-outside-window' }]);
});
test('leading contact-free segment is clipped; exit contact belongs to neither old sign tail nor new sign interior', () => {
  const s = setup((b, t) => b === 'Moon' ? t : 30, 10, 60);
  const r = run(s);
  assert.equal(r.status, 'complete');
  if (r.status !== 'complete') return;
  assert.deepEqual(r.events.map(e => [e.startMs, e.endMs, e.clippedStart, e.lastContact]),
    [[10, 30, true, null], [30, 60, false, null]]);
  assert.deepEqual(r.unresolved, []);
});
test('latest contact across multiple bodies and both square branches sets the start', () => {
  const s = setup((b, t) => b === 'Moon' ? t : b === 'Sun' ? 110 : 295, 0, 30);
  const r = run(s, { bodies: ['Sun', 'Mars'], aspects: [{ id: 'square', angleDegrees: 90 }] });
  assert.equal(r.status, 'complete');
  assert.equal(r.events[0]!.startMs, 25);
  assert.equal(r.events[0]!.lastContact!.relativeLongitude, 90);
});
test('wrap, exact window-start contact, no exit and fractional contact enclosures', () => {
  const wrapCase = setup((b, t) => b === 'Moon' ? 350 + t : 355, 0, 10);
  assert.equal(run(wrapCase).events[0]!.sign, 'Pisces');
  const start = setup((b, t) => b === 'Moon' ? t : 10, 10, 30);
  assert.equal(run(start).events[0]!.clippedStart, true);
  const noExit = run(setup((b, t) => b === 'Moon' ? t : 10, 0, 20));
  assert.equal(noExit.status, 'complete');
  assert.deepEqual(noExit.events, []);
  if (noExit.status === 'complete') assert.equal(noExit.unresolved.length, 1);
  const fractional = run(setup((b, t) => b === 'Moon' ? t : 20.3, 0, 30));
  const bracket = fractional.events[0]!.lastContact!.bracket;
  assert.ok(bracket[0] <= 20.3 && bracket[1] >= 20.3);
});
test('all-or-nothing budget and cancellation refusals', () => {
  const limited = run(setup((b, t) => b === 'Moon' ? t : 20, 0, 75, 30));
  assert.equal(limited.status, 'refused');
  assert.deepEqual(limited.events, []);
  assert.ok(!('unresolved' in limited));
  const controller = new AbortController();
  const s = setup((b, t) => { if (b === 'Sun') controller.abort(); return b === 'Moon' ? t : 20; },
    0, 75, 10000, controller.signal);
  assert.equal(run(s).status, 'refused');
});
test('invalid policies/options reject before sampling and reverse Moon motion rejects', () => {
  const s = setup(() => 0);
  for (const p of [{ ...policy, bodies: [] }, { ...policy, bodies: ['Moon'] },
    { ...policy, bodies: ['Sun', 'Sun'] }, { ...policy, aspects: [] }] as VoidOfCoursePolicy[]) {
    assert.throws(() => run(s, p));
  }
  assert.throws(() => searchVoidOfCourseMoon(s.context, policy, { stepMs: 0 }, s.provider));
  assert.equal(s.context.evaluations, 0);
  assert.throws(() => run(setup((b, t) => b === 'Moon' ? 40 - t : 0, 0, 20)), /direct Moon/);
  assert.throws(() => run(setup(() => NaN)), /Longitude/);
});
// Integration only: no engine-derived expected dates.
test('default adapter supplies bounded Moon intervals', () => {
  const context = new EvaluationContext({ startMs: Date.parse('2000-01-01T00:00:00Z'),
    endMs: Date.parse('2000-01-08T00:00:00Z'), clock: 'tt' }, { maxEvaluations: 10000 });
  const r = searchVoidOfCourseMoon(context, policy, { stepMs: 3_600_000 });
  assert.equal(r.status, 'complete');
  assert.ok(r.events.length > 0);
  assert.ok(r.events.every(e => e.startMs < e.endMs && e.endMs <= context.window.endMs));
});
test('policy snapshots survive provider mutation and simultaneous contacts select a stable representative', () => {
  const mutable = { bodies: ['Sun', 'Mars'] as EventBody[],
    aspects: [{ id: 'conjunction', angleDegrees: 0 }] };
  const s = setup((b, t) => {
    mutable.bodies.length = 0;
    mutable.aspects[0]!.angleDegrees = 180;
    return b === 'Moon' ? t : 20;
  }, 0, 30);
  const r = run(s, mutable);
  assert.equal(r.status, 'complete');
  assert.equal(r.events[0]!.startMs, 20);
  assert.deepEqual(r.events[0]!.lastContact!.target, { kind: 'moving', body: 'Sun' });
  assert.equal(r.events[0]!.lastContact!.aspect.angleDegrees, 0);
});
