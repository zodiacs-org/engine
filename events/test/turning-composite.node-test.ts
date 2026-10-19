import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  EvaluationContext, searchRetrogradeIntervals, searchStations, searchVoidOfCourseMoon
} from '../src/index.js';
import type {
  EventBody, LongitudeProvider, MotionProvider, SearchResult, Sign,
  StationOptions, VoidOfCourseOptions, VoidOfCoursePolicy
} from '../src/index.js';

const DAY = 86_400_000;
const wrap = (x: number) => ((x % 360) + 360) % 360;
const aware = { stepMs: 100, stationStepMs: 25 };
// This cubic crosses 30 degrees at 20, 50 and 80 ms. Its derivative has
// sign-changing zeros at 50 +/- 10*sqrt(3), independently of the scanner.
const cubic = (t: number) => 30 + (t - 20) * (t - 50) * (t - 80) / 10000;
const cubicRate = (t: number) => (3 * t * t - 300 * t + 6600) / 10000;
const stationA = 50 - 10 * Math.sqrt(3);
const stationB = 50 + 10 * Math.sqrt(3);
const conjunction: VoidOfCoursePolicy = {
  bodies: ['Sun'], aspects: [{ id: 'conjunction', angleDegrees: 0 }]
};

function motion(position: (t: number, body: EventBody) => number = cubic,
  rate: (t: number, body: EventBody) => number = cubicRate,
  startMs = 0, endMs = 100, maxEvaluations = 10000, signal?: AbortSignal,
  onSample?: (body: EventBody, t: number, withSpeed: boolean) => void) {
  const context = new EvaluationContext({ startMs, endMs, clock: 'tt' },
    { maxEvaluations, ...(signal ? { signal } : {}) });
  const provider: MotionProvider = { context, sample: (body, t, withSpeed = false) => {
    assert.ok(t >= startMs && t <= endMs);
    return context.evaluate(() => {
      onSample?.(body, t, withSpeed);
      const value = position(t, body);
      return { longitude: value >= 0 && value < 360 ? value : wrap(value),
        speedDegreesPerDay: withSpeed ? rate(t, body) * DAY : null };
    });
  } };
  return { context, provider };
}
function complete<T>(result: SearchResult<T>) {
  assert.equal(result.status, 'complete');
  return result.events;
}
// Both bodies remain direct on [0, 120]. Their relative longitude crosses
// conjunction at 25 and 75 ms and turns at 50 ms; Moon ingress is at 120 ms.
const moonPosition = (t: number, body: EventBody) => t / 4 -
  (body === 'Moon' ? 0 : (t - 25) * (t - 75) / 1000);
const moonRate = (t: number, body: EventBody) => 1 / 4 -
  (body === 'Moon' ? 0 : (2 * t - 100) / 1000);
const moonOptions = { stepMs: 120, stationStepMs: 120 };
function moon(maxEvaluations = 10000, signal?: AbortSignal,
  onSample?: (body: EventBody, t: number, withSpeed: boolean) => void) {
  return motion(moonPosition, moonRate, 0, 120, maxEvaluations, signal, onSample);
}

test('station steps recover a hidden station pair and the retrograde sign partition', () => {
  const original = motion();
  assert.deepEqual(complete(searchStations(original.context, 'Venus', { stepMs: 100 }, original.provider)), []);
  const stations = motion();
  const found = complete(searchStations(stations.context, 'Venus', aware, stations.provider));
  assert.equal(found.length, 2);
  for (const [i, root] of [stationA, stationB].entries()) {
    assert.ok(found[i]!.bracket[0] <= root && found[i]!.bracket[1] >= root);
    assert.ok(found[i]!.bracket[1] - found[i]!.bracket[0] <= 1);
  }
  assert.deepEqual(found.map(e => e.direction), ['retrograde', 'direct']);
  for (const [sign, count] of [['Aries', 1], ['Taurus', 1], ['Gemini', 0]] as const) {
    const s = motion();
    const intervals = complete(searchRetrogradeIntervals(s.context, 'Venus', { ...aware, sign }, s.provider));
    assert.equal(intervals.length, count);
    if (!count) continue;
    const interval = intervals[0]!;
    assert.ok(Math.abs(interval.startMs - stationA) <= 1);
    assert.ok(Math.abs(interval.endMs - stationB) <= 1);
    assert.equal(interval.clippedStart, false);
    assert.equal(interval.clippedEnd, false);
    assert.deepEqual(interval.signSpans, [
      { sign: 'Taurus', startMs: interval.startMs, endMs: 50 },
      { sign: 'Aries', startMs: 50, endMs: interval.endMs }
    ]);
  }
});

test('station-aware retrograde filters preserve clipping and positive-duration overlap', () => {
  for (const sign of ['Aries', 'Taurus'] as const) {
    const s = motion(cubic, cubicRate, 40, 60);
    const [interval] = complete(searchRetrogradeIntervals(s.context, 'Venus', { ...aware, sign }, s.provider));
    assert.deepEqual(interval && [interval.startMs, interval.endMs, interval.clippedStart, interval.clippedEnd],
      [40, 60, true, true]);
    assert.deepEqual(interval!.signSpans, [
      { sign: 'Taurus', startMs: 40, endMs: 50 }, { sign: 'Aries', startMs: 50, endMs: 60 }
    ]);
  }
  const boundary = motion(cubic, cubicRate, 50, 60);
  assert.deepEqual(complete(searchRetrogradeIntervals(boundary.context, 'Venus',
    { ...aware, sign: 'Taurus' }, boundary.provider)), []);
});

test('void-of-course uses relative stations even though Moon and target remain direct', () => {
  for (const t of [0, 50, 120]) {
    assert.ok(moonRate(t, 'Moon') > 0);
    assert.ok(moonRate(t, 'Sun') > 0);
  }
  const original = moon();
  const coarse = searchVoidOfCourseMoon(original.context, conjunction, { stepMs: 120 }, original.provider);
  assert.equal(coarse.status, 'complete');
  assert.deepEqual(coarse.events.map(e => [e.startMs, e.endMs, e.clippedStart, e.lastContact]),
    [[0, 120, true, null]]);
  const s = moon();
  const result = searchVoidOfCourseMoon(s.context, conjunction, moonOptions, s.provider);
  assert.equal(result.status, 'complete');
  assert.deepEqual(result.events.map(e => [e.startMs, e.endMs, e.sign, e.clippedStart]),
    [[75, 120, 'Aries', false]]);
  assert.equal(result.events[0]!.lastContact!.atMs, 75);
  assert.equal(result.events[0]!.lastContact!.direction, 'direct');
  if (result.status === 'complete') assert.deepEqual(result.unresolved, []);
});

test('void-of-course forwards the station grid to Moon ingresses and rejects observed reversal', () => {
  const original = motion((t, body) => body === 'Moon' ? cubic(t) : 200,
    (t, body) => body === 'Moon' ? cubicRate(t) : 0);
  assert.equal(searchVoidOfCourseMoon(original.context, conjunction, { stepMs: 100 }, original.provider).status, 'complete');
  const awareMotion = motion((t, body) => body === 'Moon' ? cubic(t) : 200,
    (t, body) => body === 'Moon' ? cubicRate(t) : 0);
  assert.throws(() => searchVoidOfCourseMoon(awareMotion.context, conjunction, aware, awareMotion.provider), /direct Moon/);
});

test('composite options and contact policies are snapshotted before provider callbacks', () => {
  const options = { ...aware, sign: 'Aries' as Sign };
  const s = motion(cubic, cubicRate, 0, 100, 10000, undefined, () => {
    options.stepMs = 0;
    options.stationStepMs = 0;
    options.sign = 'Gemini';
  });
  assert.equal(complete(searchRetrogradeIntervals(s.context, 'Venus', options, s.provider)).length, 1);
  const stationOptions = { ...aware };
  const stations = motion(cubic, cubicRate, 0, 100, 10000, undefined, () => {
    stationOptions.stepMs = 0;
    stationOptions.stationStepMs = 0;
  });
  assert.equal(complete(searchStations(stations.context, 'Venus', stationOptions, stations.provider)).length, 2);
  const contactOptions = { ...moonOptions };
  const policy = { bodies: ['Sun'] as EventBody[], aspects: [{ id: 'conjunction', angleDegrees: 0 }] };
  const v = moon(10000, undefined, () => {
    contactOptions.stepMs = 0;
    contactOptions.stationStepMs = 0;
    policy.bodies.length = 0;
    policy.aspects[0]!.angleDegrees = 180;
  });
  const result = searchVoidOfCourseMoon(v.context, policy, contactOptions, v.provider);
  assert.equal(result.status, 'complete');
  assert.equal(result.events[0]!.startMs, 75);
  assert.equal(result.events[0]!.lastContact!.aspect.angleDegrees, 0);
});

test('invalid station steps reject before sampling for each composite entry point', () => {
  const s = motion();
  for (const stationStepMs of [0, -1, 0.5, NaN, Infinity, 101, null]) {
    const options = { stepMs: 100, stationStepMs } as StationOptions;
    assert.throws(() => searchStations(s.context, 'Venus', options, s.provider), RangeError);
    assert.throws(() => searchRetrogradeIntervals(s.context, 'Venus', options, s.provider), RangeError);
    assert.throws(() => searchVoidOfCourseMoon(s.context, conjunction, options as VoidOfCourseOptions, s.provider), RangeError);
  }
  assert.equal(s.context.evaluations, 0);
});

test('station-aware composite searches require finite speeds without silently falling back', () => {
  for (const speedDegreesPerDay of [undefined, null, NaN, Infinity]) {
    const s = moon();
    const provider: LongitudeProvider = { context: s.context, sample: (body, t) => s.context.evaluate(() => ({
      longitude: wrap(moonPosition(t, body)),
      ...(speedDegreesPerDay === undefined ? {} : { speedDegreesPerDay })
    })) };
    assert.throws(() => searchVoidOfCourseMoon(s.context, conjunction, moonOptions, provider), RangeError);
    assert.throws(() => searchRetrogradeIntervals(s.context, 'Venus', aware, provider as MotionProvider), RangeError);
  }
  // A longitude-only provider still supports the original void-of-course scan.
  const s = moon();
  const provider: LongitudeProvider = { context: s.context, sample: (body, t, withSpeed = false) => {
    assert.equal(withSpeed, false);
    return s.context.evaluate(() => ({ longitude: wrap(moonPosition(t, body)) }));
  } };
  assert.equal(searchVoidOfCourseMoon(s.context, conjunction, { stepMs: 120 }, provider).status, 'complete');
});

test('station discovery and sign partitioning share refusal and cancellation', () => {
  const baseline = motion();
  assert.equal(complete(searchStations(baseline.context, 'Venus', aware, baseline.provider)).length, 2);
  const budget = baseline.context.evaluations + 1;
  const limited = motion(cubic, cubicRate, 0, 100, budget);
  assert.deepEqual(searchRetrogradeIntervals(limited.context, 'Venus', aware, limited.provider),
    { status: 'refused', reason: 'evaluation-budget', events: [], evaluations: budget });
  const controller = new AbortController();
  let calls = 0;
  const cancelled = motion(cubic, cubicRate, 0, 100, 10000, controller.signal, () => {
    if (++calls > baseline.context.evaluations) controller.abort();
  });
  const result = searchRetrogradeIntervals(cancelled.context, 'Venus', aware, cancelled.provider);
  assert.equal(result.status, 'refused');
  assert.deepEqual(result.events, []);
  if (result.status === 'refused') assert.equal(result.reason, 'cancelled');
});

test('later void-of-course body failures discard earlier contacts and unresolved output', () => {
  const baseline = moon();
  assert.equal(searchVoidOfCourseMoon(baseline.context, conjunction, moonOptions, baseline.provider).status, 'complete');
  const policy: VoidOfCoursePolicy = { bodies: ['Sun', 'Mars'], aspects: conjunction.aspects };
  const budget = baseline.context.evaluations + 1;
  let reachedSecondBody = false;
  const limited = moon(budget, undefined, body => { if (body === 'Mars') reachedSecondBody = true; });
  const refused = searchVoidOfCourseMoon(limited.context, policy, moonOptions, limited.provider);
  assert.ok(reachedSecondBody);
  assert.deepEqual(refused,
    { status: 'refused', reason: 'evaluation-budget', events: [], evaluations: budget });
  assert.ok(!('unresolved' in refused));
  const controller = new AbortController();
  const cancelled = moon(10000, controller.signal, body => { if (body === 'Mars') controller.abort(); });
  const result = searchVoidOfCourseMoon(cancelled.context, policy, moonOptions, cancelled.provider);
  assert.equal(result.status, 'refused');
  assert.deepEqual(result.events, []);
  assert.ok(!('unresolved' in result));
  if (result.status === 'refused') assert.equal(result.reason, 'cancelled');
});
