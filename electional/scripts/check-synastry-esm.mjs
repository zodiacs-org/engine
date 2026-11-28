import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { evaluateSynastryRule, loadSynastryRuntime } from '../build/index.js';

const runtime = await loadSynastryRuntime();
const natal = { synthetic: true, instant: '2000-09-22T06:00:00Z', clock: 'utc', location: { latitude: 78, longitude: 15 }, houseSystem: 'placidus' };
const startMs = Date.parse('2000-09-22T06:00:00Z');
const window = { startMs, endMs: startMs + 60000, clock: 'utc' };
const rule = { id: 'synthetic-contact', kind: 'synastry-aspect', mode: 'require', options: {
  movingBodies: ['Moon'], natalBodies: ['Moon'], aspects: ['conjunction'], maxOrbDegrees: 2, match: 'all',
} };
const options = { stepMs: 60000, maxEvaluations: 200 };
const missing = evaluateSynastryRule(rule, window, natal, runtime, { status: 'missing' }, options);
assert.equal(missing.status, 'refused'); assert.equal(missing.reason, 'missing-capability'); assert.equal(missing.evaluations, 0);
const eventsUrl = new URL('../../../wt-events/events/build/src/index.js', import.meta.url);
try { await access(eventsUrl); }
catch (error) { if (error.code === 'ENOENT') { console.log('ESM missing-capability path passed; native comparison unavailable.'); process.exit(0); } throw error; }
const capability = { status: 'available', runtime: await import(eventsUrl.href),
  source: { moduleUrl: eventsUrl.href, sha256: createHash('sha256').update(await readFile(eventsUrl)).digest('hex') } };
const result = evaluateSynastryRule(rule, window, natal, runtime, capability, options);
assert.equal(result.status, 'complete'); assert.deepEqual(result.satisfied, [{ startMs, endMs: window.endMs }]);
assert.equal(result.natal.actualHouseSystem, 'whole'); assert(result.natal.flags.includes('polar-fallback'));
assert.equal(result.receipts.length, result.evaluations); assert.equal(result.policy.api, 'findInterAspects');
assert(Object.isFrozen(result.natal.receipt)); assert(Object.isFrozen(result.policy.pairs));
const budget = evaluateSynastryRule(rule, window, natal, runtime, capability, { ...options, maxEvaluations: 1 });
assert.equal(budget.status, 'refused'); assert.equal(budget.reason, 'evaluation-budget'); assert.equal(budget.receipts.length, 1);
const scaled = evaluateSynastryRule(rule, { ...window, clock: 'tt' }, natal, runtime, capability, options);
assert.equal(scaled.natal.clock, 'utc'); assert.equal(scaled.window.clock, 'tt');
console.log('Built ESM synastry, native fallback audit, receipt/policy scope, distinct clocks and all-or-nothing budget passed.');
