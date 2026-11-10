import assert from 'node:assert/strict';
import { evaluateBasicRule, loadEngineRuntime, loadEventsCapability } from '../build/index.js';

const rule = { id: 'moon-sign', kind: 'moon-sign', mode: 'require', options: { signs: ['taurus', 'cancer'] } };
const window = { startMs: Date.parse('2000-01-01T00:00:00Z'), endMs: Date.parse('2000-01-02T00:00:00Z'), clock: 'utc' };
const options = { stepMs: 21600000, maxEvaluations: 2000 };
const engine = await loadEngineRuntime();
const missing = evaluateBasicRule(rule, window, engine, { status: 'missing' }, options);
assert.equal(missing.status, 'refused');
assert.equal(missing.reason, 'missing-capability');
assert.equal(missing.evaluations, 0);
assert.deepEqual(missing.receipts, []);
assert.deepEqual(missing.satisfied, []);
const capability = await loadEventsCapability();
const result = evaluateBasicRule(rule, window, engine, capability, options);
assert.equal(result.rule.id, rule.id);
assert(result.explanation.includes('taurus, cancer'));
if (capability.status === 'missing') assert.equal(result.status, 'refused');
else {
  assert(['complete', 'unresolved'].includes(result.status));
  assert(result.receipts.length > 0);
}
console.log('Compiled ESM rule API and explicit missing-capability behavior passed.');
