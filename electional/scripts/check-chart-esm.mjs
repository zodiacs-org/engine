import assert from 'node:assert/strict';
import { evaluateChartRule, loadChartRuntime, loadEventsCapability } from '../build/index.js';

const runtime = await loadChartRuntime();
const location = { latitude: 78, longitude: 15 };
const startMs = Date.parse('2000-09-22T06:00:00Z');
const window = { startMs, endMs: startMs + 60000, clock: 'utc' };
const options = { maxEvaluations: 20, stepMs: 60000 };
const house = { id: 'house', kind: 'benefic-house', mode: 'require', options: {
  bodies: ['Venus', 'Jupiter'], houses: [1, 4, 7, 10], match: 'any', polarFallback: 'reject',
} };
const result = evaluateChartRule(house, window, location, 'placidus', runtime, { status: 'missing' }, options);
assert.equal(result.status, 'unresolved');
assert.equal(result.partitions[0].requestedSystem, 'placidus');
assert.deepEqual(result.partitions[0].actualSystems, ['whole']);
assert.equal(result.receipts.length, 2);
assert(Object.isFrozen(result.partitions[0].actualSystems));
const scaled = evaluateChartRule(house, { ...window, clock: 'tt' }, location, 'placidus', runtime, { status: 'missing' }, options);
assert.equal(scaled.status, 'refused'); assert.equal(scaled.reason, 'unsupported-clock');
const applying = { id: 'aspect', kind: 'applying-aspect', mode: 'require', options: {
  body: 'Moon', targets: ['Jupiter'], aspects: ['trine'], maxOrbDegrees: 5, match: 'any',
} };
const missing = evaluateChartRule(applying, window, location, 'whole', runtime, { status: 'missing' }, options);
assert.equal(missing.status, 'refused'); assert.equal(missing.reason, 'missing-capability');
assert.equal(missing.evaluations, 0);
const capability = await loadEventsCapability();
assert(['available', 'missing'].includes(capability.status));
console.log('Built ESM chart evaluator, fallback audits, native receipt scope and capability/clock refusals passed.');
