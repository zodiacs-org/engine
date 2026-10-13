import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calc } from '../../src/calc.js';
import { EngineAdapter, EngineRefused, EvaluationContext, EVENT_BODIES, COORDINATES } from '../src/index.js';
import type { Clock, EventBody } from '../src/index.js';
const atMs = Date.parse('2000-01-01T12:00:00Z');
const make = (clock: Clock = 'utc', maxEvaluations = 100) =>
  new EngineAdapter(new EvaluationContext({ startMs: atMs - 1000, endMs: atMs + 1000, clock }, { maxEvaluations }));

// Integration checks against the same source API are not independent accuracy evidence.
test('all supported bodies delegate with explicit coordinate conventions', () => {
  const adapter = make();
  for (const body of EVENT_BODIES) {
    const actual = adapter.sample(body, atMs, true);
    const expected = calc({ body, time: new Date(atMs), center: COORDINATES.center,
      frame: COORDINATES.frame, zodiac: COORDINATES.zodiac,
      flags: { correction: COORDINATES.correction, units: COORDINATES.units, speeds: true } });
    assert.equal(expected.status, 'ok');
    if (expected.status !== 'ok') return;
    assert.equal(actual.longitude, expected.lon);
    assert.equal(actual.speedDegreesPerDay, expected.speeds!.lon);
    assert.deepEqual(actual.instant, expected.receipt.instants[0]);
  }
  assert.equal(adapter.context.evaluations, EVENT_BODIES.length);
});
test('UTC, UT1 and TT labels reach the requested engine clock', () => {
  const values = [];
  for (const clock of ['utc', 'ut1', 'tt'] as const) {
    const adapter = make(clock);
    const sample = adapter.sample('Moon', atMs);
    assert.equal(sample.instant.timeScale.input, clock);
    assert.equal(sample.speedDegreesPerDay, null);
    values.push(sample.longitude);
  }
  assert.notEqual(values[0], values[2]);
  assert.notEqual(values[1], values[2]);
});
test('sample boundaries include scan start but ownership excludes it', () => {
  const adapter = make();
  adapter.sample('Sun', atMs - 1000);
  adapter.sample('Sun', atMs + 1000);
  for (const bad of [atMs - 1001, atMs + 1001, NaN, atMs + 0.5]) {
    assert.throws(() => adapter.sample('Sun', bad), RangeError);
  }
  assert.throws(() => adapter.sample('Earth' as EventBody, atMs), RangeError);
  assert.equal(adapter.context.evaluations, 2);
});
test('budget is shared across bodies and requests; no hidden cache', () => {
  const adapter = make('tt', 2);
  const result = adapter.context.search(() => [adapter.sample('Sun', atMs),
    adapter.sample('Sun', atMs), adapter.sample('Moon', atMs)]);
  assert.deepEqual(result, { status: 'refused', reason: 'evaluation-budget', events: [], evaluations: 2 });
});
test('engine range refusal stays a computation error, not an empty search', () => {
  const startMs = Date.parse('1700-01-01T00:00:00Z');
  const ctx = new EvaluationContext({ startMs, endMs: startMs + 1000, clock: 'tt' }, { maxEvaluations: 1 });
  const adapter = new EngineAdapter(ctx);
  assert.throws(() => ctx.search(() => [adapter.sample('Sun', startMs)]),
    error => error instanceof EngineRefused && error.refusal.reason === 'out-of-range');
  assert.equal(ctx.evaluations, 1);
});
