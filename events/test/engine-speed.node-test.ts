import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calc } from '../../src/calc.js';
import { deltaT } from '../../src/deltat.js';
import { onChartClock } from '../../src/ephemeris.js';
import { EvaluationContext } from '../src/context.js';
import { COORDINATES, EngineAdapter, EngineRefused, EVENT_BODIES } from '../src/engine.js';
import type { EventBody } from '../src/engine.js';
import type { Clock } from '../src/types.js';

const atMs = Date.parse('2000-01-01T12:00:00Z');
function make(at = atMs, clock: Clock = 'utc', maxEvaluations = 1000, signal?: AbortSignal) {
  return new EngineAdapter(new EvaluationContext({ startMs: at - 1000, endMs: at + 1000, clock },
    { maxEvaluations, ...(signal === undefined ? {} : { signal }) }));
}

// Same-parent integration comparisons establish exact delegation, not independent accuracy.
test('longitude-only speed samples exactly match parent outputs across bodies, clocks and time-basis seams', () => {
  const instants = [
    '1800-01-01T00:10:00Z', '1800-06-01T00:00:00Z', '1900-01-01T00:00:00Z',
    '1940-12-31T18:00:00Z', '1972-01-01T00:00:00Z', '2000-01-01T12:00:00Z',
    '2017-01-01T00:00:00Z', '2027-10-02T00:00:00Z', '2100-06-01T00:00:00Z',
    '2199-12-31T23:00:00Z'
  ].map(value => Date.parse(value));
  for (const clock of ['utc', 'ut1', 'tt'] as const) {
    for (const at of instants) {
      const adapter = make(at, clock);
      let calls = 0;
      for (const body of EVENT_BODIES) {
        for (const offset of [0, 1, -1]) {
          const time = at + offset;
          for (const withSpeed of [false, true, false]) {
            const expected = calc({ body,
              time: clock === 'utc' ? new Date(time) : { jd: time / 86_400_000 + 2_440_587.5, scale: clock },
              center: COORDINATES.center, frame: COORDINATES.frame, zodiac: COORDINATES.zodiac,
              flags: { correction: COORDINATES.correction, units: COORDINATES.units, speeds: withSpeed } });
            assert.equal(expected.status, 'ok', `${body} ${clock} ${time}`);
            if (expected.status !== 'ok') throw new Error('Parent rejected the integration sample.');
            assert.deepEqual(adapter.sample(body, time, withSpeed), { atMs: time, longitude: expected.lon,
              speedDegreesPerDay: expected.speeds?.lon ?? null, instant: expected.receipt.instants[0] },
            `${body} ${clock} ${time} speeds=${withSpeed}`);
            calls++;
          }
        }
      }
      assert.equal(adapter.context.evaluations, calls);
    }
  }
});

test('speed requests charge one shared evaluation and repeated requests remain charged', () => {
  const adapter = make(atMs, 'tt', 2);
  const first = adapter.sample('Mercury', atMs, true);
  assert.deepEqual(adapter.sample('Mercury', atMs, true), first);
  assert.equal(adapter.context.evaluations, 2);
  assert.deepEqual(adapter.context.search(() => [adapter.sample('Mercury', atMs, true)]),
    { status: 'refused', reason: 'evaluation-budget', events: [], evaluations: 2 });
});

test('cancellation before or during speed work discards output and preserves charges', () => {
  const before = new AbortController();
  before.abort();
  const cancelled = make(atMs, 'tt', 2, before.signal);
  assert.deepEqual(cancelled.context.search(() => [cancelled.sample('Moon', atMs, true)]),
    { status: 'refused', reason: 'cancelled', events: [], evaluations: 0 });

  const during = new AbortController();
  const adapter = make(atMs, 'utc', 2, during.signal);
  const OriginalDate = globalThis.Date;
  globalThis.Date = new Proxy(OriginalDate, { construct(target, args, newTarget) {
    during.abort();
    return Reflect.construct(target, args, newTarget);
  } });
  try {
    assert.deepEqual(adapter.context.search(() => [adapter.sample('Moon', atMs, true)]),
      { status: 'refused', reason: 'cancelled', events: [], evaluations: 1 });
  } finally { globalThis.Date = OriginalDate; }
});

test('fresh speed results do not retain mutations from a previous request', () => {
  const adapter = make();
  const first = adapter.sample('Moon', atMs, true);
  const expected = structuredClone(first);
  Object.assign(first, { longitude: -1, speedDegreesPerDay: -1 });
  first.instant.deltaT.seconds = -1;
  first.instant.timeScale.input = 'tt';
  assert.ok(first.instant.timeScale.ut1MinusUtc);
  assert.ok(first.instant.timeScale.leapSeconds);
  first.instant.timeScale.ut1MinusUtc.seconds = -1;
  first.instant.timeScale.leapSeconds.taiMinusUtc = -1;
  assert.deepEqual(adapter.sample('Moon', atMs, true), expected);
  assert.equal(adapter.sample('Moon', atMs, false).speedDegreesPerDay, null);
});

test('speed work restores the parent DeltaT model', () => {
  const adapter = make();
  onChartClock(atMs, 'utc', 12345, time => {
    assert.equal(time.AddDays(0).tt, time.ut + 12345 / 86400);
    adapter.sample('Sun', atMs, true);
    assert.equal(time.AddDays(0).tt, time.ut + deltaT(time.ut) / 86400);
  });
});

test('invalid inputs do not charge and parent coverage refusals remain charged computation errors', () => {
  const adapter = make();
  assert.throws(() => adapter.sample('Sun', atMs + 0.5, true), RangeError);
  assert.throws(() => adapter.sample('Earth' as EventBody, atMs, true), RangeError);
  assert.throws(() => adapter.sample('Sun', atMs, null as unknown as boolean), TypeError);
  assert.throws(() => adapter.sample('Sun', atMs + 1001, true), RangeError);
  assert.equal(adapter.context.evaluations, 0);
  for (const clock of ['utc', 'ut1', 'tt'] as const) {
    for (const at of [Date.parse('1700-01-01T00:00:00Z'), Date.parse('2200-01-01T01:00:00Z')]) {
      const rejected = make(at, clock, 3);
      for (let i = 0; i < 2; i++) {
        assert.throws(() => rejected.sample('Mercury', at, true),
          error => error instanceof EngineRefused && error.refusal.reason === 'out-of-range');
      }
      assert.equal(rejected.context.evaluations, 2);
    }
  }
});
