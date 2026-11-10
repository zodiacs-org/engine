import assert from 'node:assert/strict';
import { evaluateVoidRule, loadEngineRuntime, loadEventsCapability } from '../build/index.js';

const engine = await loadEngineRuntime();
const rule = { id: 'moon-not-void', kind: 'moon-not-void', mode: 'require', options: { bodies: 'traditional' } };
const window = { startMs: Date.parse('2000-01-01T00:00:00Z'), endMs: Date.parse('2000-01-02T00:00:00Z'), clock: 'utc' };
const options = { stepMs: 21600000, lookaheadMs: 259200000, maxEvaluations: 10000 };
const missing = evaluateVoidRule(rule, window, engine, { status: 'missing' }, options);
assert.equal(missing.status, 'refused');
assert.equal(missing.reason, 'missing-capability');
assert.equal(missing.receipts.length, 0);
assert.deepEqual(missing.satisfied, []);
assert(Object.isFrozen(missing.convention.bodies));
const capability = await loadEventsCapability();
const result = evaluateVoidRule(rule, window, engine, capability, options);
if (capability.status === 'missing') assert.equal(result.status, 'refused');
else {
  assert.notEqual(result.status, 'refused');
  assert.equal(result.receipts.length, result.evaluations);
  assert.equal(result.window.clock, 'utc');
}
console.log('Built ESM void evaluator, policy metadata and missing-capability behavior passed.');
console.log(`Default sibling events capability: ${capability.status}.`);
