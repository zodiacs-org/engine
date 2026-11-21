import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EvaluationContext, validateWindow } from '../src/index.js';
import type { SearchWindow } from '../src/index.js';

const window: SearchWindow = { startMs: 0, endMs: 100, clock: 'tt' };
test('strict windows and immutable snapshots', () => {
  for (const invalid of [null, {}, { ...window, extra: 1 }, { ...window, clock: 'tai' },
    { ...window, startMs: 100 }, { ...window, startMs: 101 },
    ...[NaN, Infinity, 0.5, 8.64e15 + 1].map(endMs => ({ ...window, endMs }))]) {
    assert.throws(() => validateWindow(invalid as SearchWindow));
  }
  const input = { ...window };
  const ctx = new EvaluationContext(input, { maxEvaluations: 2 });
  input.endMs = 500;
  assert.equal(ctx.window.endMs, 100);
  assert.ok(Object.isFrozen(ctx.window));
  assert.equal(ctx.owns(0), false);
  assert.equal(ctx.owns(1), true);
  assert.equal(ctx.owns(100), true);
  assert.equal(ctx.owns(101), false);
});
test('shared budget refuses before an extra callback and discards partial events', () => {
  const ctx = new EvaluationContext(window, { maxEvaluations: 2 });
  let calls = 0;
  const result = ctx.search(() => {
    const events = [ctx.evaluate(() => ++calls), ctx.evaluate(() => ++calls)];
    events.push(ctx.evaluate(() => ++calls));
    return events;
  });
  assert.deepEqual(result, { status: 'refused', reason: 'evaluation-budget', events: [], evaluations: 2 });
  assert.equal(calls, 2);
  assert.deepEqual(new EvaluationContext(window, { maxEvaluations: 1 }).search(() => []),
    { status: 'complete', events: [], evaluations: 0 });
});
test('cancellation before, during, and after work is explicit', () => {
  for (const stage of ['before', 'during', 'after']) {
    const controller = new AbortController();
    const ctx = new EvaluationContext(window, { maxEvaluations: 2, signal: controller.signal });
    if (stage === 'before') controller.abort();
    const result = ctx.search(() => {
      ctx.evaluate(() => { if (stage === 'during') controller.abort(); });
      if (stage === 'after') controller.abort();
      return [1];
    });
    assert.deepEqual(result, { status: 'refused', reason: 'cancelled', events: [], evaluations: stage === 'before' ? 0 : 1 });
  }
});
test('invalid budgets reject, callback failures propagate and count', () => {
  for (const maxEvaluations of [0, -1, 0.5, Infinity, NaN]) {
    assert.throws(() => new EvaluationContext(window, { maxEvaluations }), RangeError);
  }
  const ctx = new EvaluationContext(window, { maxEvaluations: 1 });
  const failure = new Error('computation');
  assert.throws(() => ctx.search(() => [ctx.evaluate(() => { throw failure; })]), error => error === failure);
  assert.equal(ctx.evaluations, 1);
});
