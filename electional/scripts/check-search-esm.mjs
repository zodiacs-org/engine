import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { composeRuleWindows, loadSearchDependencies, searchElectional, subtractIntervals } from '../build/index.js';
import { scoreConditions } from '../build/internal-scoring.js';
const fixture = JSON.parse(await readFile(new URL('../test/fixtures/composition-windows.json', import.meta.url), 'utf8'));
const span = ([startMs, endMs]) => ({ startMs, endMs });
const rules = fixture.rules.map(r => ({ id: r.id, kind: 'moon-sign', mode: r.mode,
  ...(r.mode === 'prefer' ? { weight: r.weight } : {}), options: { signs: ['aries'] } }));
const ruleSet = { schemaVersion: 'electional/v1', activity: 'Hand-derived ESM composition', location: { latitude: 0, longitude: 0 }, houseSystem: 'whole',
  range: { start: new Date(0).toISOString(), end: new Date(100).toISOString(), clock: 'utc' }, rules };
const receipt = { schema: 'esm-hand-derived-contract', request: {}, instants: [{ clock: 'utc' }], conventions: ['integer-set-contract'],
  engine: { name: 'stub', version: '1.0.0', ephemeris: { name: 'stub', version: '1.0.0' } } };
const sources = fixture.rules.map((r, i) => {
  const satisfied = r.satisfied.map(span), unknown = r.unknown.map(span), covered = subtractIntervals([fixture.domain], unknown);
  return { rule: rules[i], window: fixture.domain, status: unknown.length ? 'unresolved' : 'complete', satisfied, failed: subtractIntervals(covered, satisfied),
    covered, unresolved: unknown.map(s => ({ ...s, reason: 'hand-derived-unknown' })), evaluations: 1, receipts: [receipt], searches: [],
    explanation: 'Hand-derived set.', completeness: 'source-scan-assumptions' };
});
const facts = composeRuleWindows(ruleSet, sources);
assert(facts.windows.every(w => !('score' in w) && !('rank' in w)));
const composed = scoreConditions(facts, { enabled: true });
assert.deepEqual(composed.windows.map(w => ({ span: [w.startMs, w.endMs], score: [w.score.lower, w.score.upper], states: w.explanations.map(e => e.state) })), fixture.windows);
assert(Object.isFrozen(composed.windows[0].receipts[0].engine));
assert(!Object.isFrozen(receipt));
const dependencies = await loadSearchDependencies();
const missing = searchElectional(ruleSet, { ...dependencies, events: { status: 'missing' } },
  { maxEvaluations: 10000, stepMs: 100, lookaheadMs: 0, maxSkySamples: 10000 });
assert.equal(missing.status, 'refused'); assert.equal(missing.evaluations, 0); assert.equal(missing.windows.length, 0);
assert(missing.ruleResults.every(r => r.status === 'refused' && r.reason === 'missing-capability'));
console.log('Built ESM composition golden, immutable provenance, native dependency loading and missing-events search passed.');
