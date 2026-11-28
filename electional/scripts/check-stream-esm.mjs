import assert from 'node:assert/strict';
import { loadSearchDependencies, streamElectional } from '../build/index.js';
const rules = { schemaVersion: 'electional/v1', activity: 'Synthetic stream ESM smoke', location: { latitude: 0, longitude: 0 }, houseSystem: 'whole',
  range: { start: '2000-09-22T12:00:00Z', end: '2000-09-22T12:01:00Z', clock: 'utc' }, rules: [
    { id: 'sign', kind: 'moon-sign', mode: 'require', options: { signs: ['taurus'] } },
  ] };
const controls = { chunkMs: 30000, maxChunks: 2, maxEvaluations: 1000, maxSkySamples: 1000,
  maxChunkEvaluations: 1000, maxChunkSkySamples: 1000, maxFrameBytes: 100000, stepMs: 1000, lookaheadMs: 0 };
const dependencies = await loadSearchDependencies();
const frames = [];
for await (const frame of streamElectional(rules, { ...dependencies, events: { status: 'missing' } }, controls)) frames.push(frame);
assert.equal(frames.length, 2);
assert.equal(frames[0].type, 'chunk'); assert.equal(frames[0].facts.status, 'refused'); assert.equal(frames[0].fragments.length, 0);
assert.equal(frames[0].facts.evaluations, 0); assert.equal(frames[0].facts.receipts.length, 0);
assert(!('scoring' in frames[0].facts)); assert(!('ranking' in frames[0].facts));
assert(frames[0].facts.ruleResults.every(r => r.status === 'refused' && r.reason === 'missing-capability'));
assert.equal(frames[1].type, 'end'); assert.equal(frames[1].status, 'refused'); assert.equal(frames[1].reason, 'chunk-refused');
assert.equal(frames[1].remaining.startMs, Date.parse(rules.range.start) + controls.chunkMs);
assert(Object.isFrozen(frames[0].facts.ruleResults));
const controller = new AbortController(); controller.abort();
const cancelled = [];
for await (const frame of streamElectional(rules, dependencies, { ...controls, signal: controller.signal })) cancelled.push(frame);
assert.equal(cancelled.length, 1); assert.equal(cancelled[0].reason, 'cancelled'); assert.equal(cancelled[0].evaluations, 0);
console.log('Built ESM facts-only iterator, missing-events refusal, immutable audit and cancellation passed.');
