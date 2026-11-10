import { describe, expect, it } from 'vitest';
import fixture from './fixtures/composition-windows.json';
import { composeRuleWindows, subtractIntervals } from '../src/index.js';
import { scoreConditions } from '../src/internal-scoring.js';
import type { ElectionalRule, EngineReceipt, Interval, RuleEvaluation, RuleSet, RuleWindowResult } from '../src/index.js';

const span = (pair: readonly number[]): Interval => ({ startMs: pair[0]!, endMs: pair[1]! });
const domain = fixture.domain as { startMs: number; endMs: number; clock: 'utc' };
const receipt: EngineReceipt = { schema: 'hand-derived-contract', request: { source: 'integer-set fixture' },
  instants: [{ clock: 'utc', atMs: 0 }], conventions: ['hand-derived-test-provenance;not-astronomical-evidence'],
  engine: { name: 'contract-stub', version: '1.0.0', ephemeris: { name: 'no-ephemeris', version: '1.0.0' } } };
function rule(id: string, mode: 'require' | 'prefer', weight = 1): ElectionalRule {
  return { id, kind: 'moon-sign', options: { signs: ['aries'] }, ...(mode === 'require' ? { mode } : { mode, weight }) };
}
function configuration(rules: readonly ElectionalRule[], endMs = 100): RuleSet {
  return { schemaVersion: 'electional/v1', activity: 'Hand-derived composition', location: { latitude: 0, longitude: 0 },
    houseSystem: 'whole', range: { start: new Date(0).toISOString(), end: new Date(endMs).toISOString(), clock: 'utc' }, rules };
}
function evaluation(rule: ElectionalRule, satisfied: readonly Interval[], unknown: readonly Interval[] = [], endMs = 100): RuleWindowResult<ElectionalRule> {
  const window = { ...domain, endMs };
  const covered = subtractIntervals([window], unknown);
  return { rule, window, status: unknown.length ? 'unresolved' : 'complete', satisfied,
    failed: subtractIntervals(covered, satisfied), covered, unresolved: unknown.map(s => ({ ...s, reason: 'hand-derived-unknown' })),
    evaluations: 1, receipts: [receipt], searches: [], explanation: 'Selected hand-derived set.', completeness: 'source-scan-assumptions' };
}
function refusal(rule: ElectionalRule, reason: 'missing-capability' | 'evaluation-budget' | 'cancelled' = 'missing-capability'): RuleEvaluation {
  return { rule, window: domain, status: 'refused', reason, detail: { unavailable: 'test-source' }, satisfied: [], failed: [],
    covered: [], unresolved: [], evaluations: 0, receipts: [], searches: [], explanation: 'No test source.', completeness: 'source-scan-assumptions' };
}
const rules = fixture.rules.map(r => rule(r.id, r.mode as 'require' | 'prefer', 'weight' in r ? r.weight : 1));
const sources = fixture.rules.map((r, i) => evaluation(rules[i]!, r.satisfied.map(span), r.unknown.map(span)));
const has = (spans: readonly Interval[], at: number): boolean => spans.some(s => s.startMs <= at && at < s.endMs);

const composeScored = (input: unknown, results: readonly RuleEvaluation[]) => scoreConditions(composeRuleWindows(input, results), { enabled: true });

describe('independent hand-derived composition golden', () => {
  it('partitions every condition state and annotates numeric bounds only after explicit opt-in', () => {
    const facts = composeRuleWindows(configuration(rules), sources);
    const result = scoreConditions(facts, { enabled: true });
    expect(facts.windows.every(w => !('score' in w) && !('rank' in w) && w.explanations.every(e => !('contribution' in e)))).toBe(true);
    expect(facts).not.toHaveProperty('scoring'); expect(facts).not.toHaveProperty('ranking');
    expect(result.status).toBe('unresolved');
    expect(result.eligible).toEqual(fixture.eligible.map(span)); expect(result.excluded).toEqual(fixture.excluded.map(span));
    expect(result.unresolvedRequired).toEqual(fixture.unresolvedRequired.map(span));
    expect(result.windows.map(w => ({ span: [w.startMs, w.endMs], score: [w.score.lower, w.score.upper], states: w.explanations.map(e => e.state) }))).toEqual(fixture.windows);
    expect(result.windows.every(w => !('rank' in w))).toBe(true);
    expect(result.windows.map(w => w.startMs)).toEqual([...result.windows.map(w => w.startMs)].sort((a, b) => a - b));
    expect(result.windows.every(w => w.score.maximum === 10 && w.clock === 'utc')).toBe(true);
    const bounded = result.windows.find(w => w.score.status === 'bounded')!;
    expect(bounded.unresolved).toEqual([{ startMs: 60, endMs: 70, reason: 'hand-derived-unknown', ruleId: 'preference-a', mode: 'prefer' }]);
    expect(bounded.explanations[2]?.text).toContain('Condition unresolved.');
    expect(bounded.explanations[2]?.contribution).toEqual({ lower: 0, upper: 7 });
    expect(result.windows[0]?.explanations[0]?.contribution).toEqual({ lower: 0, upper: 0 });
    expect(result.windows[0]?.receipts).toHaveLength(4); expect(result.evaluations).toBe(4);
    expect(result.ruleResults).toEqual(sources); expect(result.ruleResults).not.toBe(sources);
    for (const window of result.windows) {
      expect(window.receipts).toBe(result.receipts);
      expect(window.explanations.map(e => e.receipts)).toEqual(sources.map(s => s.receipts));
      expect(window.receiptScope).toBe('source-evaluation-provenance;not-every-instant-in-window');
    }
    expect(Object.isFrozen(result.windows[0]?.explanations[0]?.rule.options)).toBe(true);
    expect(Object.isFrozen(result.ruleResults[0]?.receipts[0]?.engine.ephemeris)).toBe(true);
    expect(Object.isFrozen(receipt)).toBe(false); expect(Object.isFrozen(sources[0])).toBe(false);
  });
  it('is invariant to input evaluation order and record-key order', () => {
    const shuffled = [...sources].reverse().map(r => {
      const { options, ...fields } = r.rule;
      return { ...r, rule: { options, ...fields } as ElectionalRule };
    });
    expect(composeRuleWindows(configuration(rules), shuffled)).toEqual(composeRuleWindows(configuration(rules), sources));
  });
  it('detaches all mutable metadata and does not change callers', () => {
    const mutable = structuredClone(sources), config = configuration(rules);
    const result = composeRuleWindows(config, mutable);
    (mutable[0]!.receipts[0]!.engine as { name: string }).name = 'later mutation';
    expect(result.receipts[0]?.engine.name).toBe('contract-stub'); expect(Object.isFrozen(config)).toBe(false);
    expect(JSON.parse(JSON.stringify(result)).windows[0]).not.toHaveProperty('score');
  });
});

describe('scoring and coverage edge cases', () => {
  it('retains a complete failed window when the required intersection is empty', () => {
    const r = rule('hard', 'require');
    expect(composeRuleWindows(configuration([r]), [evaluation(r, [])])).toMatchObject({ status: 'complete', windows: [{ startMs: 0, endMs: 100, explanations: [{ state: 'failed' }] }], eligible: [],
      excluded: [span([0, 100])], unresolvedRequired: [], unresolved: [] });
  });
  it('cannot promote unresolved hard coverage even at arbitrarily high preference weight', () => {
    const hard = rule('hard', 'require'), prefer = rule('high', 'prefer', 1000000);
    const result = composeRuleWindows(configuration([hard, prefer]), [evaluation(hard, [], [domain]), evaluation(prefer, [domain])]);
    expect(result).toMatchObject({ status: 'unresolved', windows: [{ explanations: [{ state: 'unresolved' }, { state: 'satisfied' }] }], excluded: [], unresolvedRequired: [span([0, 100])] });
  });
  it('annotates an all-preference search with bounded unknown scores without reordering', () => {
    const r = rule('optional', 'prefer', 5);
    expect(composeScored(configuration([r]), [refusal(r)])).toMatchObject({ status: 'unresolved', eligible: [span([0, 100])],
      unresolvedRequired: [], windows: [{ score: { lower: 0, upper: 5, maximum: 5, status: 'bounded' }, receipts: [] }],
      refusals: [{ ruleId: 'optional', mode: 'prefer', reason: 'missing-capability', detail: { unavailable: 'test-source' } }] });
  });
  it('retains required refusal and successful preference receipts without ranked windows', () => {
    const hard = rule('hard', 'require'), pref = rule('pref', 'prefer');
    const result = composeRuleWindows(configuration([hard, pref]), [refusal(hard), evaluation(pref, [domain])]);
    expect(result.status).toBe('refused'); expect(result.windows).toEqual([]); expect(result.receipts).toEqual([receipt]);
    expect(result.unresolvedRequired).toEqual([span([0, 100])]);
  });
  it.each(['evaluation-budget', 'cancelled'] as const)('suppresses partial ranking on shared %s, including a preference', reason => {
    const hard = rule('hard', 'require'), pref = rule('pref', 'prefer');
    const result = composeRuleWindows(configuration([hard, pref]), [evaluation(hard, [domain]), refusal(pref, reason)]);
    expect(result.status).toBe('refused'); expect(result.windows).toEqual([]); expect(result.evaluations).toBe(1);
  });
  it('keeps source unknown diagnostics even where another hard rule excludes them', () => {
    const a = rule('a', 'require'), b = rule('b', 'require');
    const result = composeRuleWindows(configuration([a, b]), [evaluation(a, []), evaluation(b, [], [domain])]);
    expect(result.status).toBe('unresolved'); expect(result.excluded).toEqual([span([0, 100])]);
    expect(result.unresolvedRequired).toEqual([]); expect(result.unresolved).toHaveLength(1);
  });
  it('retains passing and failed hard-only intervals chronologically without scores', () => {
    const r = rule('hard', 'require');
    const result = composeRuleWindows(configuration([r]), [evaluation(r, [[0, 10], [20, 40], [50, 70]].map(span))]);
    expect(result.windows.map(w => [w.startMs, w.endMs])).toEqual([[0, 10], [10, 20], [20, 40], [40, 50], [50, 70], [70, 100]]);
    expect(result.windows.every(w => !('score' in w))).toBe(true);
  });
  it('merges adjacent equivalent states but retains distinct equal-score explanations', () => {
    const a = rule('a', 'prefer'), b = rule('b', 'prefer');
    const result = composeRuleWindows(configuration([a, b]), [evaluation(a, [[0, 30], [30, 50]].map(span)), evaluation(b, [span([50, 100])])]);
    expect(result.windows.map(w => [w.startMs, w.endMs])).toEqual([[0, 50], [50, 100]]);
    expect(result.windows.map(w => w.explanations.map(e => e.state))).toEqual([['satisfied', 'failed'], ['failed', 'satisfied']]);
  });
  it('splits unknown reasons and clips per-window diagnostics', () => {
    const r = rule('preference', 'prefer'), hard = rule('hard', 'require');
    const source: RuleEvaluation = { ...evaluation(r, [], [domain]), status: 'unresolved',
      unresolved: [{ ...span([0, 50]), reason: 'first' }, { ...span([50, 100]), reason: 'second' }] };
    const result = composeRuleWindows(configuration([hard, r]), [evaluation(hard, [span([25, 75])]), source]);
    expect(result.windows.map(w => [w.startMs, w.endMs])).toEqual([[0, 25], [25, 50], [50, 75], [75, 100]]);
    expect(result.windows.slice(1, 3).map(w => w.unresolved)).toEqual([
      [{ ...span([25, 50]), reason: 'first', ruleId: r.id, mode: 'prefer' }],
      [{ ...span([50, 75]), reason: 'second', ruleId: r.id, mode: 'prefer' }],
    ]);
  });
  it('preserves declared fractional weights without rounding reported scores', () => {
    const a = rule('a', 'prefer', 0.125), b = rule('b', 'prefer', 0.25);
    const result = composeScored(configuration([a, b]), [evaluation(a, [domain]), evaluation(b, [domain])]);
    expect(result.windows[0]?.score).toEqual({ lower: 0.375, upper: 0.375, maximum: 0.375, status: 'exact' });
  });
});

describe('composition rejects incompatible or incomplete source claims', () => {
  const r = rule('one', 'require'), good = evaluation(r, [domain]);
  const altered = (changes: Record<string, unknown>): RuleEvaluation => ({ ...good, ...changes }) as RuleEvaluation;
  it.each([
    ['wrong clock', { window: { ...domain, clock: 'tt' } }],
    ['wrong range', { window: { ...domain, endMs: 99 } }],
    ['wrong rule', { rule: rule('one', 'prefer') }],
    ['outside states', { satisfied: [span([-1, 100])], covered: [span([-1, 100])] }],
    ['missing failure', { satisfied: [span([10, 100])], failed: [] }],
    ['overlap states', { failed: [span([0, 10])] }],
    ['unknown overlap', { status: 'unresolved', unresolved: [{ ...span([0, 10]), reason: 'x' }] }],
    ['unknown gap', { satisfied: [span([0, 10])], covered: [span([0, 10])] }],
    ['false unresolved', { status: 'unresolved' }],
    ['unknown reason', { status: 'unresolved', satisfied: [], covered: [], unresolved: [domain] }],
    ['missing provenance', { receipts: [] }],
    ['malformed receipt', { receipts: [{}] }],
    ['bad accounting', { evaluations: -1 }],
    ['bad completeness', { completeness: 'proven' }],
    ['bad explanation', { explanation: '' }],
    ['wrong location', { location: { latitude: 1, longitude: 0 } }],
    ['wrong house system', { houseSystem: 'koch' }],
    ['refused known state', { status: 'refused', reason: 'missing-capability', detail: null }],
  ])('rejects %s', (_, changes) => {
    expect(() => composeRuleWindows(configuration([r]), [altered(changes as Record<string, unknown>)])).toThrow();
  });
  it('rejects missing, duplicate, additional and sparse evaluation arrays', () => {
    const config = configuration([r]);
    for (const inputs of [[], [good, good], Array(1), [{ ...good, rule: rule('other', 'require') }]]) {
      expect(() => composeRuleWindows(config, inputs)).toThrow();
    }
    expect(() => composeRuleWindows(configuration([r, rule('two', 'require')]), [good, good])).toThrow();
  });
});

describe('independent exhaustive finite-state composition', () => {
  it.each([['require', 'require'], ['require', 'prefer'], ['prefer', 'prefer']] as const)('%s and %s over every three-label state table', (modeA, modeB) => {
    // Each base-three digit independently means failed, satisfied or unknown.
    const a = rule('a', modeA, 2), b = rule('b', modeB, 5), config = configuration([a, b], 3);
    const digits = (n: number) => [n % 3, Math.floor(n / 3) % 3, Math.floor(n / 9) % 3];
    const source = (r: ElectionalRule, states: readonly number[]) => evaluation(r,
      states.flatMap((s, i) => s === 1 ? [span([i, i + 1])] : []),
      states.flatMap((s, i) => s === 2 ? [span([i, i + 1])] : []), 3);
    for (let x = 0; x < 27; x++) for (let y = 0; y < 27; y++) {
      const stateA = digits(x), stateB = digits(y), result = composeScored(config, [source(a, stateA), source(b, stateB)]);
      for (let t = 0; t < 3; t++) {
        const pairs = [[a, stateA[t]!], [b, stateB[t]!]] as const;
        const excluded = pairs.some(([r, s]) => r.mode === 'require' && s === 0);
        const eligible = pairs.every(([r, s]) => r.mode === 'prefer' || s === 1);
        expect(has(result.excluded, t)).toBe(excluded); expect(has(result.eligible, t)).toBe(eligible);
        expect(has(result.unresolvedRequired, t)).toBe(!excluded && !eligible);
        const windows = result.windows.filter(w => w.startMs <= t && t < w.endMs);
        expect(windows).toHaveLength(1);
        {
          const lower = pairs.reduce((sum, [r, s]) => sum + (r.mode === 'prefer' && s === 1 ? r.weight : 0), 0);
          const upper = pairs.reduce((sum, [r, s]) => sum + (r.mode === 'prefer' && s !== 0 ? r.weight : 0), 0);
          expect(windows[0]?.score.lower).toBe(lower); expect(windows[0]?.score.upper).toBe(upper);
          expect(windows[0]?.explanations.map(e => e.state)).toEqual(pairs.map(([, s]) => ['failed', 'satisfied', 'unresolved'][s]));
        }
      }
    }
  }, 30000);
});
