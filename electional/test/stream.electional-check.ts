import { beforeEach, describe, expect, it, vi } from 'vitest';
import composition from './fixtures/composition-windows.json';
import golden from './fixtures/stream-windows.json';
import { evaluateBasicRule } from '../src/basic-rules.js';
import { evaluateVoidRule } from '../src/void-rule.js';
import { evaluateHourRule } from '../src/hour-rule.js';
import { clipIntervals, normalizeIntervals, subtractIntervals } from '../src/intervals.js';
import { streamElectional } from '../src/stream.js';
import type { StreamChunk, StreamEnd, StreamFrame, StreamOptions } from '../src/stream.js';
import type { RuleEvaluation } from '../src/composition.js';
import type { ClockWindow, EngineReceipt } from '../src/adapter-contract.js';
import type { ElectionalRule, RuleSet } from '../src/rule-types.js';
import type { SearchDependencies } from '../src/search.js';
vi.mock('../src/basic-rules.js', () => ({ evaluateBasicRule: vi.fn() }));
vi.mock('../src/void-rule.js', () => ({ evaluateVoidRule: vi.fn() }));
vi.mock('../src/hour-rule.js', () => ({ evaluateHourRule: vi.fn() }));
const receipt: EngineReceipt = { schema: 'stream-hand-derived-contract', request: {}, instants: [{ clock: 'utc' }],
  conventions: ['integer-sets-only;no-astronomical-reference'], engine: { name: 'stub', version: '1.0.0', ephemeris: { name: 'none', version: '1.0.0' } } };
const dependencies = { engine: {}, sky: {}, events: { status: 'missing' } } as unknown as SearchDependencies;
const span = ([startMs, endMs]: number[]) => ({ startMs: startMs!, endMs: endMs! });
const options: StreamOptions = { chunkMs: 25, maxChunks: 1000, maxEvaluations: 10000, maxSkySamples: 10000,
  maxChunkEvaluations: 100, maxChunkSkySamples: 100, maxFrameBytes: 1000000, stepMs: 10, lookaheadMs: 20 };
function config(rules?: readonly ElectionalRule[]): RuleSet {
  return { schemaVersion: 'electional/v1', activity: 'Synthetic stream', location: { latitude: 0, longitude: 0 }, houseSystem: 'whole',
    range: { start: new Date(0).toISOString(), end: new Date(100).toISOString(), clock: 'utc' },
    rules: rules ?? composition.rules.map(r => ({ id: r.id, kind: 'moon-sign', mode: r.mode,
      ...(r.mode === 'prefer' ? { weight: 'weight' in r ? r.weight : 0 } : {}), options: { signs: ['aries'] } })) as ElectionalRule[] };
}
function full(rule: ElectionalRule, window: ClockWindow): RuleEvaluation {
  return { rule, window, status: 'complete', satisfied: [window], failed: [], covered: [window], unresolved: [],
    evaluations: 1, receipts: [receipt], searches: [], explanation: 'Hand-derived full set.', completeness: 'source-scan-assumptions' };
}
function refusal(rule: ElectionalRule, window: ClockWindow, reason = 'coverage'): RuleEvaluation {
  return { ...full(rule, window), status: 'refused', reason, detail: null,
    satisfied: [], failed: [], covered: [], unresolved: [] } as RuleEvaluation;
}
async function collect(configuration = config(), settings = options): Promise<{ frames: StreamFrame[]; chunks: StreamChunk[]; end: StreamEnd }> {
  const frames = [];
  for await (const frame of streamElectional(configuration, dependencies, settings)) frames.push(frame);
  const end = frames.at(-1)!;
  if (end.type !== 'end') throw new Error('Expected terminal summary.');
  return { frames, chunks: frames.filter((f): f is StreamChunk => f.type === 'chunk'), end };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(evaluateBasicRule).mockImplementation((rule, window) => {
    const fixture = composition.rules.find(r => r.id === rule.id);
    if (!fixture) return full(rule, window) as never;
    const satisfied = clipIntervals(fixture.satisfied.map(span), window), unknown = clipIntervals(fixture.unknown.map(span), window);
    const covered = subtractIntervals([window], unknown);
    return { ...full(rule, window), status: unknown.length ? 'unresolved' : 'complete', satisfied, failed: subtractIntervals(covered, satisfied),
      covered, unresolved: unknown.map(s => ({ ...s, reason: 'hand-derived-unknown' })) } as never;
  });
  vi.mocked(evaluateVoidRule).mockImplementation(full as never);
  vi.mocked(evaluateHourRule).mockImplementation((r, w) => ({ ...full(r, w), samples: 3 }) as never);
});
describe('independent hand-derived streaming golden', () => {
  it('owns chunk edges once and connects only touching equal states', async () => {
    const { chunks, end } = await collect();
    expect(chunks.flatMap(c => c.fragments.map(f => ({ chunk: c.index, span: [f.startMs, f.endMs], id: f.windowId, continued: f.continuedFromPrevious })))).toEqual(golden.fragments);
    expect(end).toMatchObject({ status: 'unresolved', reason: null, chunks: 4, evaluations: 16, skySamples: 0, remaining: null });
    expect(chunks.map(c => c.facts.window)).toEqual([0, 25, 50, 75].map(startMs => ({ startMs, endMs: startMs + 25, clock: 'utc' })));
    expect(chunks[2]?.fragments[0]?.windowId).not.toBe(chunks[1]?.fragments.at(-1)?.windowId);
  });
  it('emits facts by default and optional scores with explicitly local ranks', async () => {
    const facts = await collect();
    for (const chunk of facts.chunks) {
      expect(chunk.facts).not.toHaveProperty('windows'); expect(chunk.facts).not.toHaveProperty('scoring'); expect(chunk.facts).not.toHaveProperty('ranking');
      for (const f of chunk.fragments) {
        expect(f).not.toHaveProperty('rank'); expect(f).not.toHaveProperty('internalScore'); expect(f).not.toHaveProperty('chunkRank');
        expect(f.explanations.every(e => !('contribution' in e) && !e.text.includes('weight'))).toBe(true);
      }
    }
    const scored = await collect(config(), { ...options, internalScoring: true });
    const first = scored.chunks[0]!.fragments;
    expect(first.map(f => [f.internalScore?.lower, f.chunkRank])).toEqual([[3, 2], [10, 1]]);
    expect(first.map(f => f.windowId)).toEqual(facts.chunks[0]!.fragments.map(f => f.windowId));
  });
  it('matches the unpartitioned hand-derived sets and cells for every chunk width on the domain', async () => {
    for (let chunkMs = 1; chunkMs <= 101; chunkMs++) {
      const { chunks, end } = await collect(config(), { ...options, chunkMs });
      expect(end.status).toBe('unresolved');
      for (const key of ['eligible', 'excluded', 'unresolvedRequired'] as const) {
        expect(normalizeIntervals(chunks.flatMap(c => c.facts[key]))).toEqual(composition[key].map(span));
      }
      const groups = new Map<number, { startMs: number; endMs: number; states: string[] }>();
      for (const f of chunks.flatMap(c => c.fragments)) {
        const prior = groups.get(f.windowId), states = f.explanations.map(e => e.state);
        if (prior) { expect(f.continuedFromPrevious).toBe(true); expect(prior.endMs).toBe(f.startMs); expect(prior.states).toEqual(states); prior.endMs = f.endMs; }
        else { expect(f.continuedFromPrevious).toBe(false); groups.set(f.windowId, { startMs: f.startMs, endMs: f.endMs, states }); }
      }
      expect([...groups.values()]).toEqual([...composition.ranked].sort((a, b) => a.span[0]! - b.span[0]!)
        .map(c => ({ ...span(c.span), states: c.states })));
    }
  }, 30000);
});
describe('stream seams, backpressure and native provenance transport', () => {
  it('keeps a continuous long window in fragments with one identity and no growing audit', async () => {
    const one = config([{ id: 'full', kind: 'moon-sign', mode: 'require', options: { signs: ['aries'] } }]);
    const { chunks, end } = await collect(one, { ...options, chunkMs: 1 });
    expect(chunks).toHaveLength(100); expect(end.status).toBe('complete');
    expect(chunks.every(c => c.fragments.length === 1 && c.fragments[0]?.windowId === 1 && c.facts.receipts.length === 1)).toBe(true);
    expect(chunks.slice(1).every(c => c.fragments[0]?.continuedFromPrevious)).toBe(true);
    expect(end).not.toHaveProperty('receipts');
  });
  it('does no work before a pull and no further work after iterator return', async () => {
    const iterator = streamElectional(config(), dependencies, options);
    expect(evaluateBasicRule).not.toHaveBeenCalled();
    expect((await iterator.next()).value?.type).toBe('chunk'); expect(evaluateBasicRule).toHaveBeenCalledTimes(4);
    await new Promise(resolve => setImmediate(resolve)); expect(evaluateBasicRule).toHaveBeenCalledTimes(4);
    await iterator.return(); expect((await iterator.next()).done).toBe(true); expect(evaluateBasicRule).toHaveBeenCalledTimes(4);
  });
  it('does not join bounded preference fragments whose diagnostic meaning changes', async () => {
    vi.mocked(evaluateBasicRule).mockImplementation((r, w) => ({ ...full(r, w), status: 'unresolved', satisfied: [], failed: [], covered: [],
      unresolved: [{ ...w, reason: 'unknown', sourceReason: w.startMs === 0 ? 'a' : 'b' }] }) as never);
    const { chunks } = await collect(config([{ id: 'unknown', kind: 'moon-sign', mode: 'prefer', weight: 5, options: { signs: ['aries'] } }]), { ...options, chunkMs: 50 });
    expect(chunks.map(c => c.fragments[0]?.windowId)).toEqual([1, 2]);
    expect(chunks[1]?.fragments[0]?.continuedFromPrevious).toBe(false);
  });
  it('never promotes a source unknown tail to passing hard coverage', async () => {
    vi.mocked(evaluateVoidRule).mockImplementation((r, w) => ({ ...full(r, w), status: 'unresolved', satisfied: [], failed: [], covered: [],
      unresolved: [{ ...w, reason: 'no-next-ingress' }] }) as never);
    const { chunks, end } = await collect(config([{ id: 'void', kind: 'moon-not-void', mode: 'require', options: { bodies: 'traditional' } }]));
    expect(end.status).toBe('unresolved'); expect(chunks.every(c => c.fragments.length === 0 && c.facts.unresolvedRequired.length === 1)).toBe(true);
    expect(vi.mocked(evaluateVoidRule).mock.calls.every(c => c[4].lookaheadMs === 20 && c[4].stepMs === 10)).toBe(true);
  });
  it('preserves native receipts and chunk-local explanations without freezing source objects', async () => {
    const { chunks } = await collect();
    const c = chunks[0]!, f = c.fragments[0]!;
    expect(c.facts.receipts).toHaveLength(4); expect(f.receipts).toBe(c.facts.receipts);
    expect(f.explanations[0]?.receipts[0]).toEqual(receipt);
    expect(Object.isFrozen(f.explanations[0]?.receipts[0]?.engine)).toBe(true);
    expect(Object.isFrozen(c)).toBe(true); expect(Object.isFrozen(f.explanations)).toBe(true); expect(Object.isFrozen(receipt)).toBe(false);
  });
  it('snapshots the rule set and options before yielding and normalizes offset inputs', async () => {
    const mutable = { ...structuredClone(config()), range: { ...config().range } }, controls = { ...options };
    mutable.range = { start: '1970-01-01T01:00:00+01:00', end: '1970-01-01T01:00:00.100+01:00', clock: 'utc' };
    const iterator = streamElectional(mutable, dependencies, controls);
    const first = await iterator.next();
    mutable.range = { ...mutable.range, end: '1970-01-02T00:00:00Z' }; controls.chunkMs = 1;
    expect(first.value?.type).toBe('chunk');
    const next = await iterator.next();
    expect(next.value?.type === 'chunk' && next.value.facts.window).toEqual({ startMs: 25, endMs: 50, clock: 'utc' });
    await iterator.return(); expect(Object.isFrozen(mutable)).toBe(false);
  });
});
describe('stream cumulative and per-chunk budgets', () => {
  it('shares native requests across chunks and completes at exact final exhaustion', async () => {
    const { chunks, end } = await collect(config(), { ...options, maxEvaluations: 16 });
    expect(end).toMatchObject({ status: 'unresolved', evaluations: 16, remaining: null, reason: null });
    expect(chunks.map(c => c.cumulative.evaluations)).toEqual([4, 8, 12, 16]);
    expect(vi.mocked(evaluateBasicRule).mock.calls.map(c => c[4].maxEvaluations)).toEqual(Array.from({ length: 16 }, (_, i) => 16 - i));
  });
  it('refuses an unattempted suffix when shared requests are exhausted between chunks', async () => {
    const { chunks, end } = await collect(config(), { ...options, maxEvaluations: 4 });
    expect(chunks).toHaveLength(1); expect(end).toMatchObject({ status: 'refused', reason: 'evaluation-budget', evaluations: 4,
      remaining: { startMs: 25, endMs: 100, clock: 'utc' } }); expect(evaluateBasicRule).toHaveBeenCalledTimes(4);
  });
  it('stops inside a chunk without restarting work when its request cap is too small', async () => {
    const { chunks, end } = await collect(config(), { ...options, maxChunkEvaluations: 3 });
    expect(end).toMatchObject({ status: 'refused', reason: 'chunk-refused', evaluations: 3, chunks: 1 });
    expect(chunks[0]?.fragments).toEqual([]); expect(chunks[0]?.facts.refusals[0]?.reason).toBe('evaluation-budget');
  });
  it('shares sky samples across chunks and honors the separate chunk sample cap', async () => {
    const hours = config([{ id: 'hours', kind: 'planetary-hour', mode: 'require', options: { rulers: ['Venus'], utcOffsetMinutes: 0 } }]);
    const { end } = await collect(hours, { ...options, maxSkySamples: 6 });
    expect(end).toMatchObject({ status: 'refused', reason: 'sky-sample-budget', chunks: 2, skySamples: 6 });
    expect(vi.mocked(evaluateHourRule).mock.calls.map(c => c[4].maxSamples)).toEqual([6, 3]);
    vi.mocked(evaluateHourRule).mockClear();
    await collect(hours, { ...options, maxChunkSkySamples: 3 });
    expect(vi.mocked(evaluateHourRule).mock.calls.every(c => c[4].maxSamples === 3)).toBe(true);
  });
  it('permits exact final sky budget exhaustion and a complete empty candidate set', async () => {
    const hours = config([{ id: 'hours', kind: 'planetary-hour', mode: 'require', options: { rulers: ['Venus'], utcOffsetMinutes: 0 } }]);
    vi.mocked(evaluateHourRule).mockImplementation((r, w) => ({ ...full(r, w), satisfied: [], failed: [w], samples: 3 }) as never);
    const { chunks, end } = await collect(hours, { ...options, maxSkySamples: 12 });
    expect(end).toMatchObject({ status: 'complete', reason: null, chunks: 4, skySamples: 12, remaining: null });
    expect(chunks.every(c => c.fragments.length === 0 && c.facts.status === 'complete')).toBe(true);
  });
  it('refuses the remaining domain when the chunk count is exhausted', async () => {
    const { end } = await collect(config(), { ...options, maxChunks: 2 });
    expect(end).toMatchObject({ status: 'refused', reason: 'chunk-budget', chunks: 2, evaluations: 8, remaining: { startMs: 50, endMs: 100 } });
  });
  it('bounds UTF-8 chunk output including duplicated provenance, with inclusive byte ownership', async () => {
    const { chunks } = await collect(config(), { ...options, maxChunks: 1 });
    const bytes = Buffer.byteLength(JSON.stringify(chunks[0]), 'utf8');
    const exact = await collect(config(), { ...options, maxChunks: 1, maxFrameBytes: bytes });
    expect(exact.chunks).toHaveLength(1);
    const short = await collect(config(), { ...options, maxFrameBytes: bytes - 1 });
    expect(short.chunks).toHaveLength(0); expect(short.end).toMatchObject({ status: 'refused', reason: 'output-budget', chunks: 0,
      evaluations: 4, remaining: { startMs: 0, endMs: 100 } });
  });
  it('stops at required source refusal and preserves the source audit in the emitted chunk', async () => {
    vi.mocked(evaluateBasicRule).mockImplementation((r, w) => refusal(r, w) as never);
    const { chunks, end } = await collect();
    expect(chunks).toHaveLength(1); expect(end).toMatchObject({ status: 'refused', reason: 'chunk-refused', evaluations: 4 });
    expect(chunks[0]?.facts.refusals.every(r => r.reason === 'coverage')).toBe(true);
    expect(chunks[0]?.facts.receipts).toHaveLength(4);
  });
  it('keeps optional source refusals bounded and unknown rather than stopping as complete', async () => {
    vi.mocked(evaluateBasicRule).mockImplementation((r, w) => refusal(r, w) as never);
    const { chunks, end } = await collect(config([{ id: 'optional', kind: 'moon-sign', mode: 'prefer', weight: 1, options: { signs: ['aries'] } }]));
    expect(end.status).toBe('unresolved'); expect(chunks).toHaveLength(4);
    expect(chunks.every(c => c.fragments[0]?.explanations[0]?.state === 'unresolved')).toBe(true);
  });
});
describe('stream cancellation and validation', () => {
  it('cancels before the first delegate and emits only a refused terminal summary', async () => {
    const controller = new AbortController(); controller.abort();
    const { chunks, end } = await collect(config(), { ...options, signal: controller.signal });
    expect(chunks).toEqual([]); expect(end).toMatchObject({ status: 'refused', reason: 'cancelled', evaluations: 0, remaining: { startMs: 0, endMs: 100 } });
    expect(evaluateBasicRule).not.toHaveBeenCalled();
  });
  it('lets scheduled cancellation run when the consumer drains the iterator immediately', async () => {
    const controller = new AbortController();
    setImmediate(() => controller.abort());
    const { end } = await collect(config(), { ...options, signal: controller.signal });
    expect(end).toMatchObject({ status: 'refused', reason: 'cancelled', evaluations: 0 });
  });
  it('cancels between chunks and treats earlier fragments as a partial prefix', async () => {
    const controller = new AbortController(); const iterator = streamElectional(config(), dependencies, { ...options, signal: controller.signal });
    expect((await iterator.next()).value?.type).toBe('chunk'); controller.abort();
    const end = (await iterator.next()).value;
    expect(end).toMatchObject({ type: 'end', status: 'refused', reason: 'cancelled', chunks: 1, evaluations: 4, remaining: { startMs: 25, endMs: 100 } });
    expect(evaluateBasicRule).toHaveBeenCalledTimes(4);
  });
  it('checks cancellation after the final chunk before declaring completion', async () => {
    const controller = new AbortController(); const iterator = streamElectional(config(), dependencies, { ...options, chunkMs: 100, signal: controller.signal });
    await iterator.next(); controller.abort();
    expect((await iterator.next()).value).toMatchObject({ type: 'end', status: 'refused', reason: 'cancelled', remaining: null });
  });
  it('cancels during the last synchronous rule and retains its refusal receipts', async () => {
    const controller = new AbortController();
    vi.mocked(evaluateBasicRule).mockImplementation((r, w) => { controller.abort(); return full(r, w) as never; });
    const { chunks, end } = await collect(config(), { ...options, signal: controller.signal });
    expect(end).toMatchObject({ status: 'refused', reason: 'cancelled', evaluations: 1 });
    expect(chunks[0]?.facts.receipts).toHaveLength(1); expect(chunks[0]?.fragments).toEqual([]);
  });
  it.each([
    { chunkMs: 0 }, { chunkMs: 0.5 }, { maxChunks: Infinity }, { maxChunks: -1 }, { maxChunkEvaluations: 0 },
    { maxChunkSkySamples: 0.5 }, { maxFrameBytes: 0 }, { maxFrameBytes: NaN }, { internalScoring: 'yes' },
    { stepMs: 0 }, { lookaheadMs: -1 }, { maxEvaluations: 0 }, { maxSkySamples: 0 }, { signal: {} }, { extra: 1 },
  ])('rejects invalid stream controls %j before native work', async changes => {
    await expect(collect(config(), { ...options, ...changes } as StreamOptions)).rejects.toThrow(); expect(evaluateBasicRule).not.toHaveBeenCalled();
  });
  it('requires the eclipse model before even the first otherwise valid rule', async () => {
    await expect(collect(config([{ id: 'eclipse', kind: 'avoid-eclipses', mode: 'require', options: { kinds: ['solar'], withinDays: 1 } }]))).rejects.toThrow('explicit model');
    expect(evaluateBasicRule).not.toHaveBeenCalled();
  });
  it('rejects invalid rule sets and unexpected delegate errors rather than inventing completion', async () => {
    await expect(collect({ ...config(), location: {} } as RuleSet)).rejects.toThrow();
    expect(evaluateBasicRule).not.toHaveBeenCalled();
    vi.mocked(evaluateBasicRule).mockImplementation(() => { throw new TypeError('source failure'); });
    await expect(collect()).rejects.toThrow('source failure');
  });
  it('caps arithmetic before adding an unusually large valid chunk width', async () => {
    const { chunks, end } = await collect(config(), { ...options, chunkMs: Number.MAX_SAFE_INTEGER });
    expect(chunks).toHaveLength(1); expect(end.remaining).toBe(null); expect(chunks[0]?.facts.window.endMs).toBe(100);
  });
});
