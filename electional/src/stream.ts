import { setImmediate } from 'node:timers/promises';
import { clockWindow } from './adapter-contract.js';
import type { ClockWindow } from './adapter-contract.js';
import type { ElectionalResult, RuleExplanation, ScoredWindow } from './composition.js';
import { checkedSearchOptions, searchElectional } from './search.js';
import type { SearchDependencies, SearchOptions } from './search.js';
import { resolvedInstantMs, validateRuleSet } from './rules.js';

export interface StreamOptions extends SearchOptions {
  readonly chunkMs: number;
  readonly maxChunks: number;
  readonly maxChunkEvaluations: number;
  readonly maxChunkSkySamples: number;
  /** UTF-8 JSON bound on each chunk frame, including repeated receipts. */
  readonly maxFrameBytes: number;
  /** Internal workbench use only. Facts are emitted by default. */
  readonly internalScoring?: boolean;
}
export type StreamExplanation = Omit<RuleExplanation, 'contribution' | 'text'> & { readonly text: string };
export interface WindowFragment extends ClockWindow {
  readonly windowId: number;
  readonly continuedFromPrevious: boolean;
  readonly durationMs: number;
  readonly explanations: readonly StreamExplanation[];
  readonly unresolved: ScoredWindow['unresolved'];
  readonly receipts: ScoredWindow['receipts'];
  readonly completeness: ScoredWindow['completeness'];
  readonly receiptScope: ScoredWindow['receiptScope'];
  readonly internalScore?: ScoredWindow['score'];
  readonly chunkRank?: number;
}
export type StreamFacts = Omit<ElectionalResult, 'windows' | 'scoring' | 'ranking'>;
export interface StreamChunk {
  readonly type: 'chunk';
  readonly index: number;
  readonly facts: StreamFacts;
  /** Time order, never a global ranking. Adjacent equal states share a windowId. */
  readonly fragments: readonly WindowFragment[];
  readonly cumulative: { readonly evaluations: number; readonly skySamples: number };
}
export interface StreamEnd {
  readonly type: 'end';
  readonly window: ClockWindow;
  readonly status: ElectionalResult['status'];
  readonly reason: string | null;
  readonly chunks: number;
  readonly evaluations: number;
  readonly skySamples: number;
  /** Unemitted domain, including a chunk discarded for its output size. */
  readonly remaining: ClockWindow | null;
  readonly receiptScope: 'receipts-in-emitted-chunks;no-global-receipt-array';
}
export type StreamFrame = StreamChunk | StreamEnd;

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.keys(value).sort()
    .map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
function signature(window: ScoredWindow): string {
  return canonical(window.explanations.map(e => ({ rule: e.rule, state: e.state,
    // Coordinates change at each chunk. Preserve all diagnostic meaning.
    unknown: e.unresolved.map(({ startMs, endMs, ...diagnostic }) => diagnostic) })));
}
function chunksOptions(input: StreamOptions): { search: SearchOptions; stream: StreamOptions } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new RangeError('Expected stream controls.');
  const { chunkMs, maxChunks, maxChunkEvaluations, maxChunkSkySamples, maxFrameBytes, internalScoring, ...search } = input;
  for (const value of [chunkMs, maxChunks, maxChunkEvaluations, maxChunkSkySamples, maxFrameBytes]) {
    if (!Number.isSafeInteger(value) || value < 1) throw new RangeError('Explicit positive integer chunk and output limits are required.');
  }
  if (internalScoring !== undefined && typeof internalScoring !== 'boolean') throw new RangeError('Expected a boolean internalScoring.');
  return { search, stream: Object.freeze({ ...input }) };
}

/**
 * Pull-driven search. Only the current chunk and a scalar seam signature are
 * retained. Each delegate keeps its existing padding, lookahead and refusals.
 * A fragment is provisional until the consumer receives the terminal status.
 */
export async function* streamElectional(input: unknown, dependencies: SearchDependencies,
  inputOptions: StreamOptions): AsyncGenerator<StreamFrame, void, void> {
  const rules = validateRuleSet(input);
  const window = clockWindow({ startMs: resolvedInstantMs(rules.range.start), endMs: resolvedInstantMs(rules.range.end), clock: 'utc' });
  const controls = chunksOptions(inputOptions), stream = controls.stream;
  const search = checkedSearchOptions(controls.search, rules.rules);
  // Chunk requests use normalized UTC strings accepted by the rule boundary.
  validateRuleSet({ ...rules, range: { start: new Date(window.startMs).toISOString(), end: new Date(window.endMs).toISOString(), clock: 'utc' } });
  let cursor = window.startMs, chunks = 0, evaluations = 0, skySamples = 0, nextId = 1;
  let status: ElectionalResult['status'] = 'complete', reason: string | null = null;
  let tail: { endMs: number; windowId: number; signature: string } | undefined;
  const usesSky = rules.rules.some(r => r.kind === 'planetary-hour');
  while (cursor < window.endMs) {
    // Allow timers, sockets and AbortController events to run even when a caller
    // drains the iterator immediately. No native call is interrupted mid-call.
    await setImmediate();
    reason = search.signal?.aborted ? 'cancelled'
      : chunks >= stream.maxChunks ? 'chunk-budget'
        : evaluations >= search.maxEvaluations ? 'evaluation-budget'
          : usesSky && skySamples >= search.maxSkySamples ? 'sky-sample-budget' : null;
    if (reason) { status = 'refused'; break; }
    const endMs = Number(BigInt(cursor) + BigInt(stream.chunkMs) < BigInt(window.endMs)
      ? BigInt(cursor) + BigInt(stream.chunkMs) : BigInt(window.endMs));
    const chunkRules = { ...rules, range: { start: new Date(cursor).toISOString(), end: new Date(endMs).toISOString(), clock: 'utc' as const } };
    const result = searchElectional(chunkRules, dependencies, { ...search,
      maxEvaluations: Math.min(stream.maxChunkEvaluations, search.maxEvaluations - evaluations),
      maxSkySamples: Math.min(stream.maxChunkSkySamples, search.maxSkySamples - skySamples || 1) });
    evaluations += result.evaluations;
    skySamples += result.ruleResults.reduce((sum, rule) => sum + ('samples' in rule ? rule.samples : 0), 0);
    if (!Number.isSafeInteger(evaluations) || !Number.isSafeInteger(skySamples)) throw new TypeError('Invalid cumulative work accounting.');
    const chronological = [...result.windows].sort((a, b) => a.startMs - b.startMs);
    const fragments: WindowFragment[] = [];
    let nextTail: typeof tail;
    for (const candidate of chronological) {
      const key = signature(candidate);
      const continuedFromPrevious = candidate.startMs === cursor && tail?.endMs === cursor && tail.signature === key;
      const windowId = continuedFromPrevious ? tail!.windowId : nextId++;
      fragments.push(Object.freeze({ startMs: candidate.startMs, endMs: candidate.endMs, clock: candidate.clock,
        windowId, continuedFromPrevious, durationMs: candidate.durationMs,
        explanations: Object.freeze(candidate.explanations.map((e, i) => {
          const { contribution, text, ...facts } = e;
          return Object.freeze({ ...facts, text: `${e.state}. ${result.ruleResults[i]!.explanation}` });
        })), unresolved: candidate.unresolved, receipts: candidate.receipts,
        completeness: candidate.completeness, receiptScope: candidate.receiptScope,
        ...(stream.internalScoring ? { internalScore: candidate.score, chunkRank: candidate.rank } : {}) }));
      if (candidate.endMs === endMs) nextTail = { endMs, windowId, signature: key };
    }
    const { windows, scoring, ranking, ...facts } = result;
    const frame: StreamChunk = Object.freeze({ type: 'chunk', index: chunks,
      facts: Object.freeze(facts), fragments: Object.freeze(fragments), cumulative: Object.freeze({ evaluations, skySamples }) });
    if (Buffer.byteLength(JSON.stringify(frame), 'utf8') > stream.maxFrameBytes) {
      status = 'refused'; reason = 'output-budget'; break;
    }
    if (result.status === 'refused') status = 'refused';
    else if (result.status === 'unresolved') status = 'unresolved';
    tail = nextTail;
    chunks++;
    cursor = endMs;
    yield frame;
    if (result.status === 'refused') { reason = 'chunk-refused'; break; }
  }
  // Completion is itself a pull. Cancellation after the final chunk still
  // prevents the stream from claiming a completed search.
  await setImmediate();
  if (search.signal?.aborted) { status = 'refused'; reason = 'cancelled'; }
  yield Object.freeze({ type: 'end', window, status, reason, chunks, evaluations, skySamples,
    remaining: cursor < window.endMs ? clockWindow({ startMs: cursor, endMs: window.endMs, clock: 'utc' }) : null,
    receiptScope: 'receipts-in-emitted-chunks;no-global-receipt-array' });
}
