import { describe, expect, it } from 'vitest';
import fixture from './fixtures/void-windows.json';
import { AdapterRefused, containsInstant, evaluateVoidRule, loadEngineRuntime, normalizeIntervals } from '../src/index.js';
import type { ClockWindow, EngineReceipt, EngineRuntime, EventRecord, EventsCapability, EventsRuntime,
  Interval, Unresolved, VoidRule, WorkOptions } from '../src/index.js';

const window = fixture.window as ClockWindow;
const options = { stepMs: fixture.stepMs, lookaheadMs: fixture.lookaheadMs, maxEvaluations: 100 };
const rule: VoidRule = { id: 'moon', kind: 'moon-not-void', mode: 'require', options: { bodies: 'traditional' } };
const receipt: EngineReceipt = { schema: 'hand-derived-contract', request: {}, instants: [{}],
  conventions: ['synthetic-contract-only'], engine: { name: 'stub', version: '0.0.0',
    ephemeris: { name: 'stub', version: '0.0.0' } } };
const engine = (hook?: () => void): EngineRuntime => ({ calc() {
  hook?.(); return { status: 'ok', lon: 1, lat: 0, speeds: null, bounds: {}, receipt };
} });
class Context {
  evaluations = 0;
  constructor(readonly window: ClockWindow, readonly work: WorkOptions) {}
  checkpoint(): void { if (this.work.signal?.aborted) throw new AdapterRefused('cancelled'); }
  evaluate<T>(run: () => T): T {
    this.checkpoint();
    if (this.evaluations >= this.work.maxEvaluations) throw new AdapterRefused('evaluation-budget');
    this.evaluations++;
    const value = run(); this.checkpoint(); return value;
  }
}
function capability(voids: readonly EventRecord[], ingresses: readonly EventRecord[], unresolved: readonly Unresolved[] = [],
  inspect?: (policy: unknown, window: ClockWindow) => void, samples = 1, ingressUnknown = false): EventsCapability {
  const unused = (): never => { throw new Error('Unexpected scanner: do not reimplement void search.'); };
  return { status: 'available', source: { moduleUrl: 'hand-derived-contract', sha256: 'hand-derived-contract' }, runtime: {
    EvaluationContext: Context, searchStations: unused, searchRetrogradeIntervals: unused, searchExactAspects: unused,
    searchVoidOfCourseMoon(ctx, policy, _scan, provider) {
      const domain = (ctx as Context).window;
      inspect?.(policy, domain);
      for (let i = 0; i < samples; i++) provider.sample('Moon', domain.startMs);
      return { status: 'complete', events: voids, unresolved, evaluations: ctx.evaluations };
    },
    searchSignIngresses(ctx, body, _scan, provider) {
      expect(body).toBe('Moon');
      const domain = (ctx as Context).window;
      provider.sample('Moon', domain.startMs);
      return { status: 'complete', events: ingresses, evaluations: ctx.evaluations,
        ...(ingressUnknown ? { unresolved: [{ startMs: domain.startMs, endMs: domain.endMs, reason: 'missing-transition' }] } : {}) };
    },
  } };
}
const contact = (atMs: number, bracket: readonly number[] = [atMs, atMs]): EventRecord => ({
  kind: 'exact-aspect', body: 'Moon', target: { kind: 'moving', body: 'Sun' },
  aspect: { id: 'trine', angleDegrees: 120 }, relativeLongitude: 240,
  atMs, bracket, direction: 'direct', clock: 'tt',
});
const ingress = (atMs: number, fromSign = 'Aries', toSign = 'Taurus', bracket: readonly number[] = [atMs, atMs]): EventRecord => ({
  kind: 'sign-ingress', body: 'Moon', atMs, bracket, direction: 'direct', fromSign, toSign, clock: 'tt',
});
const voidEvent = (startMs: number, endMs: number, lastContact: EventRecord | null = contact(startMs), sign = 'Aries'): EventRecord => ({
  kind: 'void-of-course', startMs, endMs, sign, lastContact, clippedStart: startMs === -11, clock: 'tt',
});
const spans = (values: readonly (readonly number[])[]): Interval[] => values.map(([startMs, endMs]) => ({ startMs: startMs!, endMs: endMs! }));

function partition(result: ReturnType<typeof evaluateVoidRule>): void {
  expect(result.status).not.toBe('refused');
  for (let at = window.startMs; at < window.endMs; at++) {
    expect([result.satisfied, result.failed, result.unresolved].filter(set => containsInstant(set, at))).toHaveLength(1);
  }
}
describe('hand-derived void rule golden sets', () => {
  it.each(fixture.cases)('$id', test => {
    const voids = test.voids.map(([start, end, sign, last]) => voidEvent(start as number, end as number,
      last === null ? null : contact(last as number, test.contactBracket), sign as string));
    const ingresses = test.ingresses.map(([at, from, to]) => ingress(at as number, from as string, to as string, test.ingressBracket));
    const unknown = [{ startMs: test.tail[0]!, endMs: test.tail[1]!, reason: 'next-ingress-outside-window' }];
    const result = evaluateVoidRule(rule, window, engine(), capability(voids, ingresses, unknown), options);
    expect(result.status).toBe(test.unknown.length ? 'unresolved' : 'complete');
    expect(result.satisfied).toEqual(spans(test.satisfied));
    expect(result.failed).toEqual(spans(test.failed));
    expect(normalizeIntervals(result.unresolved)).toEqual(spans(test.unknown));
    expect(result.covered).toEqual(normalizeIntervals([...spans(test.satisfied), ...spans(test.failed)]));
    expect(result.evaluations).toBe(2);
    expect(result.receipts).toHaveLength(2);
    expect(result.searches).toHaveLength(2);
    expect(result.searches[0]?.sourceWindow).toEqual({ startMs: -11, endMs: 130, clock: 'tt' });
    expect(Object.isFrozen(result.convention.bodies)).toBe(true);
    expect(Object.isFrozen(result.rule.options)).toBe(true);
    expect(Object.isFrozen(rule)).toBe(false);
    partition(result);
  });
  it.each(['utc', 'ut1', 'tt'] as const)('retains %s clock throughout lookahead and clipping', clock => {
    const result = evaluateVoidRule(rule, { ...window, clock }, engine(), capability(
      [{ ...voidEvent(20, 50), clock, lastContact: { ...contact(20), clock } }], [{ ...ingress(50), clock }]), options);
    expect(result).toMatchObject({ status: 'complete', failed: [{ startMs: 20, endMs: 50 }], window: { clock } });
    expect(result.searches.every(s => s.window.clock === clock && s.sourceWindow?.clock === clock)).toBe(true);
  });
  it('keeps the original contact and duration when clipping inside an in-progress void', () => {
    const result = evaluateVoidRule(rule, window, engine(), capability([voidEvent(-5, 50)], [ingress(50)]), options);
    expect(result.failed).toEqual([{ startMs: 0, endMs: 50 }]);
    expect(result.searches[0]?.events[0]).toMatchObject({ sourceInterval: { startMs: -5, endMs: 50 }, lastContact: { atMs: -5 } });
  });
  it('documents and delegates both body selections and fixed major aspects', async () => {
    const native = await loadEngineRuntime() as EngineRuntime & { VOID_BODIES: Record<string, string[]>;
      VOID_OF_COURSE_CONVENTION: { name: string; aspects: string[] } };
    for (const bodies of ['traditional', 'modern'] as const) {
      let delegated: unknown;
      const result = evaluateVoidRule({ ...rule, options: { bodies } }, window, engine(),
        capability([], [], [], policy => { delegated = policy; }), options);
      expect(result.convention.bodies).toEqual(native.VOID_BODIES[bodies]);
      expect(result.convention.aspects).toEqual(native.VOID_OF_COURSE_CONVENTION.aspects);
      expect(result.convention.name).toBe(native.VOID_OF_COURSE_CONVENTION.name);
      expect(delegated).toEqual({ bodies: native.VOID_BODIES[bodies], aspects: [
        { id: 'conjunction', angleDegrees: 0 }, { id: 'sextile', angleDegrees: 60 }, { id: 'square', angleDegrees: 90 },
        { id: 'trine', angleDegrees: 120 }, { id: 'opposition', angleDegrees: 180 },
      ] });
    }
  });
  it('leaves unresolved tails unknown even with explicit zero extra lookahead', () => {
    const result = evaluateVoidRule(rule, window, engine(), capability([], [], [
      { startMs: -11, endMs: 110, reason: 'next-ingress-outside-window' },
    ]), { ...options, lookaheadMs: 0 });
    expect(result).toMatchObject({ status: 'unresolved', satisfied: [], failed: [], covered: [] });
    expect(result.searches[0]?.sourceWindow?.endMs).toBe(110);
  });
  it('includes uncertainty from an ingress just outside the requested endpoint', () => {
    const result = evaluateVoidRule(rule, window, engine(), capability([], [ingress(100, 'Aries', 'Taurus', [99, 101])]), options);
    expect(result.satisfied).toEqual([{ startMs: 0, endMs: 99 }]);
    expect(normalizeIntervals(result.unresolved)).toEqual([{ startMs: 99, endMs: 100 }]);
  });
  it('does not infer covered nonvoid states through incomplete ingress evidence', () => {
    expect(evaluateVoidRule(rule, window, engine(), capability([], [], [], undefined, 1, true), options))
      .toMatchObject({ status: 'unresolved', satisfied: [], failed: [], covered: [] });
  });
  it('excludes ambiguous last-contact/exit ordering over the preceding sign', () => {
    const result = evaluateVoidRule(rule, window, engine(), capability([voidEvent(49, 50, contact(49, [48, 50]))],
      [ingress(50, 'Aries', 'Taurus', [49, 51])]), options);
    expect(normalizeIntervals(result.unresolved)).toEqual([{ startMs: 0, endMs: 52 }]);
    expect(result.failed).toEqual([]);
    partition(result);
  });
  it('leaves a void duration unknown when the separate boundary audit disagrees', () => {
    const result = evaluateVoidRule(rule, window, engine(), capability([voidEvent(20, 50)], [ingress(51)]), options);
    expect(normalizeIntervals(result.unresolved)).toEqual([{ startMs: 0, endMs: 100 }]);
    expect(result.failed).toEqual([]);
    expect(result.satisfied).toEqual([]);
    partition(result);
  });
  it('checks independent Boolean membership for every subset of void and unknown blocks', () => {
    const signs = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo'];
    const boundaries = [15, 35, 55, 75].map((at, i) => ingress(at, signs[i], signs[i + 1]));
    for (let voidMask = 0; voidMask < 16; voidMask++) {
      const voids = [0, 1, 2, 3].filter(i => voidMask & (1 << i))
        .map(i => voidEvent(i * 20 + 5, i * 20 + 15, contact(i * 20 + 5), signs[i]));
      for (let unknownMask = 0; unknownMask < 16; unknownMask++) {
        const unknown = [0, 1, 2, 3].filter(i => unknownMask & (1 << i))
          .map(i => ({ startMs: i * 20, endMs: i * 20 + 20, reason: 'hand-derived-unknown-block' }));
        const result = evaluateVoidRule(rule, window, engine(), capability(voids, boundaries, unknown), options);
        for (let at = 0; at < 100; at++) {
          const block = Math.floor(at / 20);
          const isUnknown = Boolean(unknownMask & (1 << block));
          const isVoid = Boolean(voidMask & (1 << block)) && at % 20 >= 5 && at % 20 < 15;
          expect(containsInstant(result.satisfied, at)).toBe(!isUnknown && !isVoid);
          expect(containsInstant(result.failed, at)).toBe(!isUnknown && isVoid);
          expect(containsInstant(result.unresolved, at)).toBe(isUnknown);
        }
      }
    }
  });
});

describe('void rule validation, refusals and accounting', () => {
  it('retains preference weights for the later scoring layer', () => {
    expect(evaluateVoidRule({ ...rule, mode: 'prefer', weight: 7 }, window, engine(), capability([], []), options).rule)
      .toMatchObject({ mode: 'prefer', weight: 7 });
  });
  it('distinguishes missing capability, native refusal and completed empty coverage', () => {
    expect(evaluateVoidRule(rule, window, engine(), { status: 'missing' }, options))
      .toMatchObject({ status: 'refused', reason: 'missing-capability', satisfied: [], covered: [], receipts: [], evaluations: 0 });
    const refusal = { status: 'refused' as const, reason: 'coverage', detail: 'native refusal' };
    expect(evaluateVoidRule(rule, window, { calc: () => refusal }, capability([], []), options))
      .toMatchObject({ status: 'refused', reason: 'engine-refused', detail: refusal, evaluations: 1, receipts: [], covered: [] });
    expect(evaluateVoidRule(rule, window, engine(), capability([], []), options))
      .toMatchObject({ status: 'complete', satisfied: [{ startMs: 0, endMs: 100 }], failed: [] });
  });
  it('shares the budget across void discovery and the ingress audit without partial success', () => {
    for (const maxEvaluations of [1, 2, 3, 4]) {
      const result = evaluateVoidRule(rule, window, engine(), capability([], [], [], undefined, 3), { ...options, maxEvaluations });
      expect(result.evaluations).toBe(maxEvaluations);
      expect(result.receipts).toHaveLength(maxEvaluations);
      if (maxEvaluations < 4) expect(result).toMatchObject({ status: 'refused', reason: 'evaluation-budget', satisfied: [], covered: [] });
      else expect(result.status).toBe('complete');
    }
  });
  it('preserves audits and receipts for cancellation during either delegated scan', () => {
    for (const when of [0, 1, 2]) {
      const controller = new AbortController(); let calls = 0;
      if (!when) controller.abort();
      const result = evaluateVoidRule(rule, window, engine(() => { if (++calls === when) controller.abort(); }),
        capability([], []), { ...options, signal: controller.signal });
      expect(result).toMatchObject({ status: 'refused', reason: 'cancelled', evaluations: when, satisfied: [], covered: [] });
      expect(result.receipts).toHaveLength(when);
    }
  });
  it('validates rules, clocks, lookahead, steps and budgets before checking capability', () => {
    for (const bad of [{ ...rule, options: { bodies: 'outer' } }, { ...rule, weight: 1 },
      { ...rule, options: { bodies: 'traditional', aspects: ['trine'] } }, { ...rule, kind: 'moon-sign', options: { signs: ['taurus'] } }]) {
      expect(() => evaluateVoidRule(bad as VoidRule, window, engine(), { status: 'missing' }, options)).toThrow();
    }
    for (const bad of [{ ...options, lookaheadMs: -1 }, { ...options, lookaheadMs: 0.5 }, { ...options, lookaheadMs: undefined },
      { ...options, lookaheadMs: Infinity }, { ...options, stepMs: 0 }, { ...options, stepMs: 1.5 },
      { ...options, maxEvaluations: 0 }, { ...options, extra: true }, { ...options, signal: {} }]) {
      expect(() => evaluateVoidRule(rule, window, engine(), { status: 'missing' }, bad as typeof options)).toThrow();
    }
    expect(() => evaluateVoidRule(rule, { ...window, clock: 'tai' } as unknown as ClockWindow, engine(), capability([], []), options)).toThrow();
  });
  it.each([
    { startMs: -8_640_000_000_000_000, endMs: 0, clock: 'tt' },
    { startMs: 0, endMs: 8_640_000_000_000_000, clock: 'tt' },
  ] as const)('refuses unrepresentable padding before work: $startMs to $endMs', domain => {
    expect(evaluateVoidRule(rule, domain, engine(), capability([], []), options))
      .toMatchObject({ status: 'refused', reason: 'coverage', evaluations: 0, receipts: [] });
  });
  it('rejects incompatible contact policies, malformed brackets and overlapping intervals', () => {
    for (const last of [{ ...contact(20), target: { kind: 'moving', body: 'Pluto' } }, { ...contact(20), clock: 'utc' },
      { ...contact(20), aspect: { id: 'trine', angleDegrees: 119 } }, { ...contact(20), relativeLongitude: 130 },
      { ...contact(20), atMs: 19 }, { ...contact(20), bracket: [21, 22] }, { ...contact(20), bracket: null }]) {
      expect(() => evaluateVoidRule(rule, window, engine(), capability([voidEvent(20, 50, last as EventRecord)], [ingress(50)]), options)).toThrow();
    }
    for (const boundary of [{ ...ingress(50), direction: 'retrograde' }, { ...ingress(50), body: 'Venus' },
      { ...ingress(50), toSign: 'Gemini' }, { ...ingress(50), bracket: [51, 52] }]) {
      expect(() => evaluateVoidRule(rule, window, engine(), capability([voidEvent(20, 50)], [boundary]), options)).toThrow();
    }
    expect(() => evaluateVoidRule(rule, window, engine(), capability([voidEvent(20, 50), voidEvent(30, 50)], [ingress(50)]), options)).toThrow();
    expect(() => evaluateVoidRule(rule, window, engine(), capability([], [ingress(50), ingress(50)]), options)).toThrow();
  });
});
