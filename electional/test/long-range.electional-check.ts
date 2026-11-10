import { beforeEach, describe, expect, it, vi } from 'vitest';
import fixture from './fixtures/long-range.json';
import { evaluateBasicRule } from '../src/basic-rules.js';
import type { BasicRule, RuleWindowResult } from '../src/basic-rules.js';
import { clipIntervals, subtractIntervals } from '../src/intervals.js';
import { streamElectional } from '../src/stream.js';
import type { StreamEnd, StreamOptions } from '../src/stream.js';
import type { ClockWindow, EngineReceipt } from '../src/adapter-contract.js';
import type { RuleSet } from '../src/rule-types.js';
import type { SearchDependencies } from '../src/search.js';

vi.mock('../src/basic-rules.js', () => ({ evaluateBasicRule: vi.fn() }));
const startMs = Date.parse(fixture.start), endMs = Date.parse(fixture.end), DAY = fixture.periodMs;
const receipt: EngineReceipt = { schema: 'long-range-hand-derived-contract', request: {}, instants: [{ clock: 'utc' }],
  conventions: ['recurring-integer-sets;not-astronomical-evidence'],
  engine: { name: 'hand-derived-contract', version: '1.0.0', ephemeris: { name: 'none', version: '1.0.0' } } };
const rules: RuleSet = { schemaVersion: 'electional/v1', activity: 'Synthetic year of condition sets',
  location: { latitude: 0, longitude: 0 }, houseSystem: 'whole',
  range: { start: fixture.start, end: fixture.end, clock: 'utc' }, rules: [
    { id: 'required', kind: 'moon-sign', mode: 'require', options: { signs: ['aries'] } },
    { id: 'preferred', kind: 'moon-sign', mode: 'prefer', weight: 999, options: { signs: ['aries'] } },
  ] };
const options: StreamOptions = { chunkMs: DAY, maxChunks: fixture.periods,
  maxEvaluations: fixture.periods * 2, maxSkySamples: 1, maxChunkEvaluations: 2,
  maxChunkSkySamples: 1, maxFrameBytes: 1000000, stepMs: 3600000, lookaheadMs: 0 };
const dependencies = { engine: {}, events: { status: 'missing' } } as unknown as SearchDependencies;
function recurring(pairs: number[][], window: ClockWindow) {
  const spans = [];
  for (let day = Math.floor((window.startMs - startMs) / DAY); startMs + day * DAY < window.endMs; day++) {
    for (const [from, to] of pairs) spans.push({ startMs: startMs + day * DAY + from!, endMs: startMs + day * DAY + to! });
  }
  return clipIntervals(spans, window);
}
function evaluate(rule: BasicRule, window: ClockWindow): RuleWindowResult {
  const satisfied = recurring(rule.id === 'required' ? fixture.requiredSatisfied : fixture.preferredSatisfied, window);
  const unknown = rule.id === 'required' ? [] : recurring(fixture.preferredUnknown, window);
  const covered = subtractIntervals([window], unknown);
  return { rule, window, status: unknown.length ? 'unresolved' : 'complete', satisfied, covered,
    failed: subtractIntervals(covered, satisfied), unresolved: unknown.map(span => ({ ...span, reason: 'hand-derived-unknown' })),
    evaluations: 1, receipts: [receipt], searches: [], explanation: 'Hand-derived recurring membership.', completeness: 'source-scan-assumptions' };
}
beforeEach(() => { vi.clearAllMocks(); vi.mocked(evaluateBasicRule).mockImplementation(evaluate); });

describe('independent hand-derived long-range condition sets', () => {
  it.each([DAY, 7 * DAY, 31 * DAY, 29 * 3600000])('preserves every daily condition across the leap year with chunk width %s', async chunkMs => {
    expect(endMs - startMs).toBe(fixture.periods * DAY);
    let cursor = startMs, terminal: StreamEnd | undefined, previousId = 0, previousStates = '', cells = 0;
    for await (const frame of streamElectional(rules, dependencies, { ...options, chunkMs })) {
      if (frame.type === 'end') { terminal = frame; continue; }
      expect(frame.facts.window.startMs).toBe(cursor);
      expect(frame.facts.receipts).toHaveLength(2);
      expect(frame.facts.unresolvedRequired).toEqual([]);
      expect(frame.facts.eligible).toEqual(recurring(fixture.requiredSatisfied, frame.facts.window));
      expect(frame.facts.excluded).toEqual(subtractIntervals([frame.facts.window], frame.facts.eligible));
      const serialized = JSON.stringify(frame);
      expect(serialized).not.toMatch(/"(?:score|rank|ranking|scoring|contribution|internalScore|chunkRank)"\s*:/u);
      for (const fragment of frame.fragments) {
        expect(fragment.startMs).toBe(cursor);
        const phase = (cursor - startMs) % DAY;
        // The expected cell comes directly from the hand partition, independent
        // of the test delegate's interval clipping and the production composer.
        const cell = fixture.cells.find(cell => cell.span[0]! <= phase && phase < cell.span[1]!)!;
        expect(fragment.explanations.map(e => e.state)).toEqual(cell.states);
        expect(fragment.endMs).toBe(Math.min(startMs + Math.floor((cursor - startMs) / DAY) * DAY + cell.span[1]!, frame.facts.window.endMs));
        const states = cell.states.join(',');
        const continued = previousStates === states && fragment.startMs === frame.facts.window.startMs && previousId > 0;
        expect(fragment.continuedFromPrevious).toBe(continued);
        expect(fragment.windowId).toBe(continued ? previousId : previousId + 1);
        if (!continued) cells++;
        expect(fragment.receipts).toHaveLength(2);
        expect(fragment.explanations.every(e => !/\b(?:best|good|favourable|favorable|recommended)\b/iu.test(e.text))).toBe(true);
        previousId = fragment.windowId; previousStates = states; cursor = fragment.endMs;
      }
      expect(cursor).toBe(frame.facts.window.endMs);
    }
    const chunks = Math.ceil((endMs - startMs) / chunkMs);
    expect(terminal).toMatchObject({ status: 'unresolved', reason: null, chunks, evaluations: chunks * 2, remaining: null });
    expect(cursor).toBe(endMs); expect(cells).toBe(fixture.periods * fixture.cells.length);
  });
  it('keeps one continuous year in independent fragments without accumulating old receipts', async () => {
    vi.mocked(evaluateBasicRule).mockImplementation((rule, window) => ({ ...evaluate(rule, window),
      status: 'complete', satisfied: [window], covered: [window], failed: [], unresolved: [] }));
    let chunks = 0;
    for await (const frame of streamElectional(rules, dependencies, options)) {
      if (frame.type === 'end') {
        expect(frame).toMatchObject({ status: 'complete', evaluations: fixture.periods * 2, remaining: null });
        expect(frame).not.toHaveProperty('receipts'); continue;
      }
      expect(frame.facts.receipts).toHaveLength(2); expect(frame.facts.ruleResults).toHaveLength(2);
      expect(frame.fragments).toHaveLength(1);
      expect(frame.fragments[0]).toMatchObject({ windowId: 1, continuedFromPrevious: chunks > 0 });
      chunks++;
    }
    expect(chunks).toBe(fixture.periods);
  });
  it.each(['chunk', 'evaluation', 'cancel'] as const)('preserves the exact unemitted year suffix on %s stop', async stop => {
    const controller = new AbortController();
    let chunks = 0, terminal: StreamEnd | undefined;
    const cap = 5;
    const controls = { ...options, signal: controller.signal,
      maxChunks: stop === 'chunk' ? cap : options.maxChunks,
      maxEvaluations: stop === 'evaluation' ? cap * 2 : options.maxEvaluations };
    for await (const frame of streamElectional(rules, dependencies, controls)) {
      if (frame.type === 'end') terminal = frame;
      else if (++chunks === cap && stop === 'cancel') controller.abort();
    }
    expect(chunks).toBe(cap);
    expect(terminal).toMatchObject({ status: 'refused', reason: { chunk: 'chunk-budget', evaluation: 'evaluation-budget', cancel: 'cancelled' }[stop],
      evaluations: cap * 2, remaining: { startMs: startMs + cap * DAY, endMs, clock: 'utc' } });
    expect(evaluateBasicRule).toHaveBeenCalledTimes(cap * 2);
  });
});
