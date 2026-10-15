import assert from 'node:assert/strict';
import { evaluateAvoidanceRule, loadEngineRuntime, loadEventsCapability } from '../build/index.js';

const engine = await loadEngineRuntime();
const rule = { id: 'mercury-stations', kind: 'avoid-stations', mode: 'require', options: { bodies: ['Mercury'], withinDays: 1 } };
const window = { startMs: Date.parse('2023-04-20T00:00:00Z'), endMs: Date.parse('2023-04-23T00:00:00Z'), clock: 'tt' };
const options = { stepMs: 3600000, maxEvaluations: 3000 };
const missing = evaluateAvoidanceRule(rule, window, engine, { status: 'missing' }, options);
assert.equal(missing.status, 'refused'); assert.equal(missing.reason, 'missing-capability');
assert.equal(missing.evaluations, 0); assert.deepEqual(missing.satisfied, []);
assert.equal(missing.convention.marginMs, 86400000); assert.equal(missing.window.clock, 'tt');
const capability = await loadEventsCapability();
const result = evaluateAvoidanceRule(rule, window, engine, capability, options);
if (capability.status === 'missing') assert.equal(result.status, 'refused');
else { assert(['complete', 'unresolved'].includes(result.status)); assert(result.receipts.length > 0); }
console.log('Compiled ESM avoidance API, explicit TT convention and missing capability passed.');
