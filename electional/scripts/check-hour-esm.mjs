import assert from 'node:assert/strict';
import { evaluateHourRule, loadSkyRuntime } from '../build/index.js';

const runtime = await loadSkyRuntime();
const rule = { id: 'hour', kind: 'planetary-hour', mode: 'require', options: { rulers: ['Venus'], utcOffsetMinutes: 0 } };
const window = { startMs: Date.parse('2000-09-22T06:00:00Z'), endMs: Date.parse('2000-09-22T14:00:00Z'), clock: 'utc' };
const options = { maxEvaluations: 20, maxSamples: 10000 };
const result = evaluateHourRule(rule, window, { latitude: 51.48, longitude: 0 }, runtime, options);
assert.equal(result.status, 'complete');
assert(result.satisfied.length > 0);
assert.equal(result.receipts.length, result.days.length * 2);
assert.equal(result.evaluations, result.days.length * 3);
assert(Object.isFrozen(result.days[0].hours));
assert(result.days.every(day => day.receiptScope === 'scan-endpoint-calc-provenance;sky-api-has-no-native-receipt'));
const scaled = evaluateHourRule(rule, { ...window, clock: 'tt' }, { latitude: 51.48, longitude: 0 }, runtime, options);
assert.equal(scaled.status, 'refused');
assert.equal(scaled.reason, 'unsupported-clock');
console.log('Built ESM hour evaluator, native sky delegation, receipt scope and explicit clock refusal passed.');
