import { describe, expect, it } from 'vitest';
import { composeRuleWindows } from '../src/composition.js';
import { scoreConditions } from '../src/internal-scoring.js';
import type { ScoringOptions } from '../src/internal-scoring.js';
import { subtractIntervals } from '../src/intervals.js';
import type { ElectionalRule, RuleSet } from '../src/rule-types.js';
import type { RuleEvaluation } from '../src/composition.js';
import fixture from './fixtures/composition-windows.json';

const span = ([startMs, endMs]: readonly number[]) => ({ startMs: startMs!, endMs: endMs! });
const ruleSet: RuleSet = { schemaVersion: 'electional/v1', activity: 'Synthetic internal arithmetic',
  location: { latitude: 0, longitude: 0 }, houseSystem: 'whole',
  range: { start: new Date(0).toISOString(), end: new Date(100).toISOString(), clock: 'utc' },
  rules: fixture.rules.map(r => ({ id: r.id, kind: 'moon-sign', mode: r.mode,
    ...(r.mode === 'prefer' ? { weight: r.weight } : {}), options: { signs: ['aries'] } })) as ElectionalRule[] };
const domain = { ...fixture.domain, clock: 'utc' as const };
const sources: RuleEvaluation[] = fixture.rules.map((r, i) => {
  const covered = subtractIntervals([domain], r.unknown.map(span));
  return { rule: ruleSet.rules[i]!, window: domain, status: r.unknown.length ? 'unresolved' : 'complete',
    satisfied: r.satisfied.map(span), failed: subtractIntervals(covered, r.satisfied.map(span)), covered,
    unresolved: r.unknown.map(pair => ({ ...span(pair), reason: 'hand-derived-unknown' })), evaluations: 1,
    receipts: [{ schema: 'integer-set-reference', request: {}, instants: [], conventions: ['hand-derived;no-ephemeris'],
      engine: { name: 'stub', version: '1.0.0', ephemeris: { name: 'none', version: '1.0.0' } } }],
    searches: [], explanation: 'Hand-derived condition set.', completeness: 'source-scan-assumptions' };
});
const facts = composeRuleWindows(ruleSet, sources);

describe('explicit internal numeric annotation', () => {
  it('requires opt-in and preserves every chronological fact, receipt and explanation', () => {
    const scored = scoreConditions(facts, { enabled: true });
    expect(scored.windows.map(w => ({ span: [w.startMs, w.endMs], score: [w.score.lower, w.score.upper],
      states: w.explanations.map(e => e.state) }))).toEqual(fixture.windows);
    expect(scored.windows.map(w => w.startMs)).toEqual(facts.windows.map(w => w.startMs));
    expect(scored.windows.every((w, i) => w.receipts === facts.windows[i]!.receipts && !('rank' in w)
      && w.explanations.every(e => e.text === facts.windows[i]!.explanations.find(f => f.rule.id === e.rule.id)!.text))).toBe(true);
    expect(facts).not.toHaveProperty('scoring'); expect(facts).not.toHaveProperty('ranking');
    expect(facts.windows.every(w => !('score' in w) && w.explanations.every(e => !('contribution' in e)))).toBe(true);
    expect(Object.isFrozen(scored.windows[0]!.explanations[0]!.contribution)).toBe(true);
  });
  it('uses explicit weight overrides without modifying declared policy or source facts', () => {
    const weights = { 'preference-a': 0.125, 'preference-b': 0.25 };
    const scored = scoreConditions(facts, { enabled: true, weights }); weights['preference-a'] = 100;
    expect(scored.windows.find(w => w.startMs === 20)!.score).toEqual({ lower: 0.375, upper: 0.375, maximum: 0.375, status: 'exact' });
    expect(scored.windows.find(w => w.startMs === 60)!.score).toEqual({ lower: 0.25, upper: 0.375, maximum: 0.375, status: 'bounded' });
    expect(scored.ruleSet).toBe(facts.ruleSet); expect(Object.isFrozen(weights)).toBe(false);
    expect(scored.windows[0]!.explanations.filter(e => e.rule.mode === 'require').every(e => e.weight === 0)).toBe(true);
  });
  it('retains unknown state with zero weight and does not equate numeric totals to rule success', () => {
    const scored = scoreConditions(facts, { enabled: true, weights: { 'preference-a': 0, 'preference-b': 0 } });
    expect(scored.windows.find(w => w.startMs === 60)!.score).toEqual({ lower: 0, upper: 0, maximum: 0, status: 'bounded' });
    expect(scored.windows[0]!.explanations[0]!.state).toBe('failed');
    expect(scored.windows[0]!.explanations[0]!.contribution).toEqual({ lower: 0, upper: 0 });
    expect(scored.eligible).toBe(facts.eligible); expect(scored.unresolvedRequired).toBe(facts.unresolvedRequired);
  });
  it.each([undefined, null, {}, { enabled: false }, { enabled: 'true' }, { enabled: true, rank: true },
    { enabled: true, weights: [] }, { enabled: true, weights: null }, { enabled: true, weights: { unknown: 1 } },
    { enabled: true, weights: { 'hard-a': 1 } }, { enabled: true, weights: { 'preference-a': -1 } },
    { enabled: true, weights: { 'preference-a': Infinity } }, { enabled: true, weights: { 'preference-a': NaN } },
    { enabled: true, weights: { 'preference-a': '1' } },
    { enabled: true, weights: { 'preference-a': Number.MAX_VALUE, 'preference-b': Number.MAX_VALUE } },
  ])('rejects unenabled or invalid annotations %#', options => {
    expect(() => scoreConditions(facts, options as ScoringOptions)).toThrow(RangeError);
  });
  it('rejects weight accessors and symbol keys without invoking executable weight values', () => {
    let called = false;
    const weights = Object.defineProperty({}, 'preference-a', { enumerable: true, get() { called = true; return 1; } });
    expect(() => scoreConditions(facts, { enabled: true, weights })).toThrow(RangeError); expect(called).toBe(false);
    expect(() => scoreConditions(facts, { enabled: true, weights: { [Symbol('private')]: 1 } })).toThrow(RangeError);
  });
});
