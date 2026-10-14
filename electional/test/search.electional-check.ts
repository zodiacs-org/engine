import { beforeEach, describe, expect, it, vi } from 'vitest';
import { evaluateBasicRule } from '../src/basic-rules.js';
import { evaluateVoidRule } from '../src/void-rule.js';
import { evaluateHourRule } from '../src/hour-rule.js';
import { evaluateChartRule } from '../src/chart-rules.js';
import { evaluateAvoidanceRule } from '../src/avoidance-rules.js';
import { evaluateSynastryRule } from '../src/synastry-rule.js';
import { searchElectional } from '../src/search.js';
import type { RuleEvaluation } from '../src/composition.js';
import type { ClockWindow, EngineReceipt } from '../src/adapter-contract.js';
import type { ElectionalRule, RuleOptions, RuleSet } from '../src/rule-types.js';
import type { SearchDependencies, SearchOptions } from '../src/search.js';
vi.mock('../src/basic-rules.js', () => ({ evaluateBasicRule: vi.fn() }));
vi.mock('../src/void-rule.js', () => ({ evaluateVoidRule: vi.fn() }));
vi.mock('../src/hour-rule.js', () => ({ evaluateHourRule: vi.fn() }));
vi.mock('../src/chart-rules.js', () => ({ evaluateChartRule: vi.fn() }));
vi.mock('../src/avoidance-rules.js', () => ({ evaluateAvoidanceRule: vi.fn() }));
vi.mock('../src/synastry-rule.js', () => ({ evaluateSynastryRule: vi.fn() }));
const delegates = [evaluateBasicRule, evaluateVoidRule, evaluateHourRule, evaluateChartRule, evaluateAvoidanceRule, evaluateSynastryRule] as const;
const window: ClockWindow = { startMs: 0, endMs: 100, clock: 'utc' };
const options: SearchOptions = { maxEvaluations: 100, stepMs: 10, lookaheadMs: 20, maxSkySamples: 30,
  eclipse: { model: { sunRadiusAu: 10, moonRadiusAu: 1, earthRadiusAu: 2 }, derivativeStepMs: 1 } };
// Every expected span is a hand-derived declarative set. Delegates are stubs here;
// native astronomical/reference tests live in their existing separate files.
const receipt: EngineReceipt = { schema: 'composition-routing-contract', request: {}, instants: [{ clock: 'stub' }], conventions: ['control-flow-only'],
  engine: { name: 'stub', version: '1.0.0', ephemeris: { name: 'stub', version: '1.0.0' } } };
const native = { calc: vi.fn(() => { throw new Error('Coordinator must use evaluators.'); }) };
const dependencies = { engine: native, chart: { ...native }, sky: { ...native }, synastry: { ...native }, events: { status: 'missing' } } as unknown as SearchDependencies;
const ruleOptions: RuleOptions = {
  'moon-sign': { signs: ['taurus'] }, 'moon-phase': { phases: ['New Moon'] }, 'direct-motion': { bodies: ['Mercury'] },
  'moon-not-void': { bodies: 'traditional' }, 'planetary-hour': { rulers: ['Venus'], utcOffsetMinutes: 0 },
  'benefic-house': { bodies: ['Venus'], houses: [1], match: 'any', polarFallback: 'allow' },
  'benefic-angular': { bodies: ['Jupiter'], angles: ['midheaven'], maxOrbDegrees: 2, match: 'any' },
  'applying-aspect': { body: 'Moon', targets: ['Venus'], aspects: ['trine'], maxOrbDegrees: 2, match: 'all' },
  'avoid-eclipses': { kinds: ['solar'], withinDays: 1 }, 'avoid-stations': { bodies: ['Mercury'], withinDays: 2 },
  'synastry-aspect': { movingBodies: ['Moon'], natalBodies: ['Sun'], aspects: ['sextile'], maxOrbDegrees: 3, match: 'any' },
};
function rule(kind: keyof RuleOptions, id: string = kind, prefer = false): ElectionalRule {
  return { id, kind, options: ruleOptions[kind], ...(prefer ? { mode: 'prefer', weight: 5 } : { mode: 'require' }) } as ElectionalRule;
}
function config(rules: readonly ElectionalRule[]): RuleSet {
  return { schemaVersion: 'electional/v1', activity: 'Synthetic routing', location: { latitude: 12, longitude: 34 }, houseSystem: 'placidus',
    range: { start: '1970-01-01T00:00:00Z', end: '1970-01-01T00:00:00.100Z', clock: 'utc' }, rules,
    ...(rules.some(r => r.kind === 'synastry-aspect') ? { natal: { synthetic: true, instant: '2000-01-01T12:00:00Z', clock: 'utc',
      location: { latitude: 0, longitude: 0 }, houseSystem: 'whole' } } : {}) };
}
function result(rule: ElectionalRule, domain: ClockWindow): RuleEvaluation {
  return { rule, window: domain, status: 'complete', satisfied: [{ startMs: domain.startMs, endMs: domain.endMs }], failed: [],
    covered: [{ startMs: domain.startMs, endMs: domain.endMs }], unresolved: [], evaluations: 1, receipts: [receipt], searches: [],
    explanation: 'Hand-derived full set.', completeness: 'source-scan-assumptions' };
}
function setMock(fn: typeof delegates[number], implementation: (rule: ElectionalRule, window: ClockWindow, ...rest: unknown[]) => RuleEvaluation): void {
  vi.mocked(fn).mockImplementation(implementation as never);
}
beforeEach(() => {
  vi.clearAllMocks();
  for (const fn of delegates) setMock(fn, result);
  setMock(evaluateHourRule, (r, w) => ({ ...result(r, w), samples: 3 }) as RuleEvaluation);
});
describe('coordinator delegation and shared accounting', () => {
  it.each(Object.keys(ruleOptions) as (keyof RuleOptions)[])('delegates %s with the declared UTC clock and context', kind => {
    const configuration = config([rule(kind)]);
    const found = searchElectional(configuration, dependencies, options);
    expect(found).toMatchObject({ status: 'complete', evaluations: 1, windows: [{ startMs: 0, endMs: 100, score: { lower: 0, upper: 0 } }] });
    expect(delegates.reduce((sum, fn) => sum + vi.mocked(fn).mock.calls.length, 0)).toBe(1);
    const call = delegates.flatMap(fn => vi.mocked(fn).mock.calls as unknown[][])[0]!;
    expect(call[0]).toEqual(configuration.rules[0]); expect(call[1]).toEqual(window);
    const settings = call.at(-1) as Record<string, unknown>;
    expect(settings.maxEvaluations).toBe(100);
    if (kind === 'planetary-hour') {
      expect(call[2]).toEqual(configuration.location); expect(call[3]).toBe(dependencies.sky); expect(settings.maxSamples).toBe(30);
      expect(settings).not.toHaveProperty('stepMs');
    } else {
      expect(settings.stepMs).toBe(10);
      if (kind === 'moon-not-void') expect(settings.lookaheadMs).toBe(20);
      if (kind.startsWith('benefic-') || kind === 'applying-aspect') {
        expect(call.slice(2, 6)).toEqual([configuration.location, configuration.houseSystem, dependencies.chart, dependencies.events]);
      } else if (kind === 'synastry-aspect') expect(call.slice(2, 5)).toEqual([configuration.natal, dependencies.synastry, dependencies.events]);
      else expect(call.slice(2, 4)).toEqual([dependencies.engine, dependencies.events]);
      if (kind === 'avoid-eclipses') expect(settings.eclipse).toEqual(options.eclipse);
      else expect(settings).not.toHaveProperty('eclipse');
    }
    expect(found.ruleResults[0]?.receipts).toEqual([receipt]); expect(native.calc).not.toHaveBeenCalled();
  });
  it('evaluates in declaration order with remaining budget and scores the final full set', () => {
    const configuration = config([rule('moon-phase'), rule('moon-sign', 'preference', true), rule('avoid-stations')]);
    const found = searchElectional(configuration, dependencies, { ...options, maxEvaluations: 3 });
    expect(vi.mocked(evaluateBasicRule).mock.calls.map(c => c[4].maxEvaluations)).toEqual([3, 2]);
    expect(vi.mocked(evaluateAvoidanceRule).mock.calls[0]?.[4].maxEvaluations).toBe(1);
    expect(found.status).toBe('complete'); expect(found.evaluations).toBe(3); expect(found.receipts).toHaveLength(3);
    expect(found.windows[0]?.score).toMatchObject({ lower: 5, upper: 5, maximum: 5 });
    expect(found.ruleResults.map(r => r.rule.id)).toEqual(configuration.rules.map(r => r.id));
  });
  it('does not call a later delegate after exact shared budget exhaustion', () => {
    const configuration = config([rule('moon-sign'), rule('moon-phase', 'preference', true), rule('avoid-stations')]);
    const found = searchElectional(configuration, dependencies, { ...options, maxEvaluations: 1 });
    expect(found.status).toBe('refused'); expect(found.windows).toEqual([]); expect(found.evaluations).toBe(1); expect(found.receipts).toHaveLength(1);
    expect(vi.mocked(evaluateBasicRule)).toHaveBeenCalledTimes(1); expect(evaluateAvoidanceRule).not.toHaveBeenCalled();
    expect(found.ruleResults.slice(1).every(r => r.status === 'refused' && r.reason === 'evaluation-budget' && r.evaluations === 0)).toBe(true);
  });
  it('preserves receipts from a refused scan and stops subsequent rules', () => {
    setMock(evaluateBasicRule, (r, w) => ({ ...result(r, w), status: 'refused', reason: 'evaluation-budget', detail: null,
      evaluations: 2, satisfied: [], failed: [], covered: [], unresolved: [] }));
    const found = searchElectional(config([rule('moon-sign'), rule('avoid-stations')]), dependencies, { ...options, maxEvaluations: 3 });
    expect(found.status).toBe('refused'); expect(found.evaluations).toBe(2); expect(found.receipts).toHaveLength(1); expect(evaluateAvoidanceRule).not.toHaveBeenCalled();
  });
  it('shares sky samples between hour rules and stops when they are exhausted', () => {
    const configuration = config([rule('planetary-hour', 'first'), rule('planetary-hour', 'second'), rule('moon-sign')]);
    const found = searchElectional(configuration, dependencies, { ...options, maxSkySamples: 3 });
    expect(evaluateHourRule).toHaveBeenCalledTimes(1); expect(evaluateBasicRule).not.toHaveBeenCalled();
    expect(found.status).toBe('refused'); expect(found.refusals.map(r => r.reason)).toEqual(['sky-sample-budget', 'sky-sample-budget']);
  });
  it('passes remaining sky samples rather than a fresh budget to each hour rule', () => {
    searchElectional(config([rule('planetary-hour', 'first'), rule('planetary-hour', 'second')]), dependencies, options);
    expect(vi.mocked(evaluateHourRule).mock.calls.map(c => c[4].maxSamples)).toEqual([30, 27]);
    expect(vi.mocked(evaluateHourRule).mock.calls.map(c => c[4].maxEvaluations)).toEqual([100, 99]);
  });
  it('cancels before all work and retains a diagnostic for every rule', () => {
    const controller = new AbortController(); controller.abort();
    const found = searchElectional(config([rule('moon-sign'), rule('planetary-hour')]), dependencies, { ...options, signal: controller.signal });
    expect(found).toMatchObject({ status: 'refused', evaluations: 0, windows: [], receipts: [] });
    expect(found.ruleResults.every(r => r.status === 'refused' && r.reason === 'cancelled')).toBe(true);
    expect(delegates.every(fn => vi.mocked(fn).mock.calls.length === 0)).toBe(true);
  });
  it('cancels between rules without ranking the completed prefix', () => {
    const controller = new AbortController();
    setMock(evaluateBasicRule, (r, w) => { controller.abort(); return result(r, w); });
    const found = searchElectional(config([rule('moon-sign'), rule('avoid-stations')]), dependencies, { ...options, signal: controller.signal });
    expect(found.status).toBe('refused'); expect(found.evaluations).toBe(1); expect(found.receipts).toHaveLength(1);
    expect(evaluateAvoidanceRule).not.toHaveBeenCalled();
  });
  it('checks cancellation after the final delegate and keeps its receipt', () => {
    const controller = new AbortController();
    setMock(evaluateBasicRule, (r, w) => { controller.abort(); return result(r, w); });
    const found = searchElectional(config([rule('moon-sign')]), dependencies, { ...options, signal: controller.signal });
    expect(found.status).toBe('refused'); expect(found.windows).toEqual([]); expect(found.receipts).toHaveLength(1);
    expect(found.refusals[0]?.reason).toBe('cancelled');
  });
  it.each(['sky', 'chart', 'synastry'] as const)('reports absent %s capability without inventing a source receipt', missing => {
    const kind = missing === 'sky' ? 'planetary-hour' : missing === 'chart' ? 'benefic-house' : 'synastry-aspect';
    const { [missing]: ignored, ...available } = dependencies;
    const found = searchElectional(config([rule(kind, kind, true)]), available, options);
    expect(found.status).toBe('unresolved'); expect(found.evaluations).toBe(0); expect(found.receipts).toEqual([]);
    expect(found.windows[0]?.score).toMatchObject({ lower: 0, upper: 5, status: 'bounded' });
    expect(found.refusals[0]?.reason).toBe('missing-capability');
  });
  it('detects a delegate that exceeds the request budget', () => {
    setMock(evaluateBasicRule, (r, w) => ({ ...result(r, w), evaluations: 101 }));
    expect(() => searchElectional(config([rule('moon-sign')]), dependencies, options)).toThrow('shared request budget');
  });
  it.each([-1, 0.5, NaN])('rejects a misreported request count %s before later work', count => {
    setMock(evaluateBasicRule, (r, w) => ({ ...result(r, w), evaluations: count }));
    expect(() => searchElectional(config([rule('moon-sign'), rule('avoid-stations')]), dependencies, options)).toThrow('shared request budget');
    expect(evaluateAvoidanceRule).not.toHaveBeenCalled();
  });
  it('detects a delegate that exceeds the sky budget', () => {
    setMock(evaluateHourRule, (r, w) => ({ ...result(r, w), samples: 31 }) as RuleEvaluation);
    expect(() => searchElectional(config([rule('planetary-hour')]), dependencies, options)).toThrow('shared sky budget');
  });
  it('propagates unexpected delegate errors as errors, never complete empty windows', () => {
    setMock(evaluateBasicRule, () => { throw new TypeError('incompatible source'); });
    expect(() => searchElectional(config([rule('moon-sign')]), dependencies, options)).toThrow('incompatible source');
  });
});

describe('coordinator validates options before any work', () => {
  it.each([
    { stepMs: 0 }, { stepMs: NaN }, { stepMs: 0.5 }, { lookaheadMs: -1 }, { lookaheadMs: 0.5 },
    { maxSkySamples: 0 }, { maxSkySamples: Infinity }, { maxEvaluations: 0 }, { extra: true },
    { signal: {} }, { eclipse: {} },
  ])('rejects malformed controls %j', changes => {
    expect(() => searchElectional(config([rule('moon-sign')]), dependencies, { ...options, ...changes } as SearchOptions)).toThrow();
    expect(delegates.every(fn => vi.mocked(fn).mock.calls.length === 0)).toBe(true);
  });
  it('requires an explicit eclipse model before evaluating any rules', () => {
    const { eclipse, ...withoutModel } = options;
    expect(() => searchElectional(config([rule('moon-sign'), rule('avoid-eclipses')]), dependencies, withoutModel)).toThrow('explicit model');
    expect(evaluateBasicRule).not.toHaveBeenCalled();
  });
  it('rejects invalid rule sets before any native work', () => {
    expect(() => searchElectional({ ...config([rule('moon-sign')]), natal: {} }, dependencies, options)).toThrow();
    expect(delegates.every(fn => vi.mocked(fn).mock.calls.length === 0)).toBe(true);
  });
});
