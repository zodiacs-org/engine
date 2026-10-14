import { AdapterRefused, WorkContext, clockWindow, frozenCopy, instantMs, workOptions } from './adapter-contract.js';
import type { ClockWindow, EngineReceipt, Json } from './adapter-contract.js';
import { EngineAdapter } from './engine-adapter.js';
import type { EngineRuntime } from './engine-adapter.js';
import { EventsAdapter } from './events-adapter.js';
import type { EventOperation, EventRecord, EventSearchOptions, EventSearchResult, EventsCapability, Unresolved } from './events-adapter.js';
import { clipIntervals, intersectIntervals, normalizeIntervals, subtractIntervals } from './intervals.js';
import type { Interval } from './intervals.js';
import { PHASES, SIGNS } from './rule-schema.js';
import type { ElectionalRule } from './rule-types.js';
import { validateRuleSet } from './rules.js';

export type BasicRule = Extract<ElectionalRule, { kind: 'moon-sign' | 'moon-phase' | 'direct-motion' }>;
interface EvaluationBase<R extends ElectionalRule = BasicRule> {
  readonly rule: R;
  readonly window: ClockWindow;
  readonly evaluations: number;
  readonly receipts: readonly EngineReceipt[];
  readonly searches: readonly EventSearchResult[];
  readonly explanation: string;
  readonly completeness: 'source-scan-assumptions';
}
export type RuleWindowResult<R extends ElectionalRule = BasicRule> = EvaluationBase<R> & (
  | { readonly status: 'complete' | 'unresolved'; readonly satisfied: readonly Interval[];
      readonly failed: readonly Interval[]; readonly covered: readonly Interval[]; readonly unresolved: readonly Unresolved[] }
  | { readonly status: 'refused'; readonly reason: Extract<EventSearchResult, { status: 'refused' }>['reason'];
      readonly detail: Json; readonly satisfied: readonly []; readonly failed: readonly [];
      readonly covered: readonly []; readonly unresolved: readonly [] }
);

function snapshotRule(input: BasicRule): BasicRule {
  // Use the same bounded schema boundary as files, including mode and weight.
  const rule = validateRuleSet({ schemaVersion: 'electional/v1', activity: 'Rule evaluation',
    location: { latitude: 0, longitude: 0 }, houseSystem: 'whole',
    range: { start: '2000-01-01T00:00:00Z', end: '2000-01-02T00:00:00Z', clock: 'utc' },
    rules: [input] }).rules[0]!;
  if (!['moon-sign', 'moon-phase', 'direct-motion'].includes(rule.kind)) throw new RangeError('Unsupported basic rule.');
  return rule as BasicRule;
}
const wrap = (angle: number): number => ((angle % 360) + 360) % 360;
// Declarative sectors aligned with moonPhase's names, not a second event solver.
const phaseIndex = (angle: number): number => {
  const elongation = wrap(angle);
  // Compare thresholds directly, avoiding extra addition near a binary boundary.
  const index = [22.5, 67.5, 112.5, 157.5, 202.5, 247.5, 292.5, 337.5]
    .findIndex(bound => elongation < bound);
  return index === -1 ? 0 : index;
};

interface StateWindows { readonly satisfied: readonly Interval[]; readonly unresolved: readonly Unresolved[] }

/** Assemble constant states from source transitions; never scan or refine a root. */
function stateWindows(domain: ClockWindow, initial: number, search: EventSearchResult,
  accept: (state: number) => boolean, transition: (event: EventRecord) => { from: number; to: number }): StateWindows {
  if (search.status === 'refused') throw new TypeError('Refused search cannot establish states.');
  if (search.status === 'unresolved') {
    // An unobserved transition can affect all subsequent states. No reseeding claim.
    return { satisfied: [], unresolved: [{ startMs: domain.startMs, endMs: domain.endMs,
      reason: 'incomplete-state-transitions' }] };
  }
  const satisfied: Interval[] = [], unresolved: Unresolved[] = [];
  let cursor = domain.startMs, state = initial, previous: number | undefined;
  const events = [...search.events].sort((a, b) => (a.atMs as number) - (b.atMs as number));
  for (const event of events) {
    const atMs = event.atMs as number;
    instantMs(atMs);
    if (atMs < domain.startMs || atMs >= domain.endMs || previous === atMs) {
      throw new TypeError('Invalid or simultaneous state transition.');
    }
    const bracket = event.bracket;
    if (!Array.isArray(bracket) || bracket.length !== 2) throw new TypeError('A transition requires a root bracket.');
    const [lo, hi] = bracket as readonly number[];
    instantMs(lo!); instantMs(hi!);
    if (lo! > atMs || hi! < atMs || lo! < search.sourceWindow!.startMs || hi! > search.sourceWindow!.endMs) {
      throw new TypeError('Invalid transition bracket.');
    }
    if (accept(state) && cursor < atMs) satisfied.push({ startMs: cursor, endMs: atMs });
    const change = transition(event);
    if (atMs !== domain.startMs && change.from !== state) throw new TypeError('Discontinuous state transitions.');
    state = change.to;
    // Inclusive noncollapsed brackets contain an unresolved numerical boundary.
    // A collapsed bracket uses the source's post-transition ownership exactly.
    if (lo! < hi!) {
      const endMs = hi! === 8_640_000_000_000_000 ? hi! : hi! + 1;
      for (const span of clipIntervals([{ startMs: lo!, endMs }], domain)) {
        unresolved.push({ ...span, reason: 'numerical-root-bracket', body: event.body ?? null });
      }
    }
    cursor = atMs;
    previous = atMs;
  }
  if (accept(state) && cursor < domain.endMs) satisfied.push({ startMs: cursor, endMs: domain.endMs });
  return { satisfied: subtractIntervals(satisfied, unresolved), unresolved };
}

function direction(event: EventRecord): 'direct' | 'retrograde' {
  if (event.direction !== 'direct' && event.direction !== 'retrograde') throw new TypeError('Invalid transition direction.');
  return event.direction;
}

/** Evaluate one validated convention. All seeds and delegated scans share one budget. */
export function evaluateBasicRule(input: BasicRule, inputWindow: ClockWindow,
  engine: EngineRuntime, capability: EventsCapability, options: EventSearchOptions): RuleWindowResult {
  const rule = snapshotRule(input), window = clockWindow(inputWindow);
  if (!options || Object.keys(options).some(k => !['stepMs', 'maxEvaluations', 'signal'].includes(k))
    || !Number.isSafeInteger(options.stepMs) || options.stepMs < 1) throw new RangeError('Expected explicit positive stepMs.');
  const work = workOptions({ maxEvaluations: options.maxEvaluations,
    ...(options.signal === undefined ? {} : { signal: options.signal }) });
  const stepMs = options.stepMs;
  let evaluations = 0;
  const receipts: EngineReceipt[] = [], searches: EventSearchResult[] = [];
  const explanation = rule.kind === 'moon-sign'
    ? `Moon in any selected tropical sign: ${rule.options.signs.join(', ')}.`
    : rule.kind === 'moon-phase'
      ? `Moon in any selected elongation sector: ${rule.options.phases.join(', ')}. Phase names follow the engine's sector convention.`
      : `All selected bodies outside retrograde motion: ${rule.options.bodies.join(', ')}. Station boundaries use the outgoing motion; station avoidance is a separate rule.`;
  const base = (): EvaluationBase => ({ rule, window, evaluations, receipts, searches, explanation,
    completeness: 'source-scan-assumptions' });
  const refuse = (reason: Extract<RuleWindowResult, { status: 'refused' }>['reason'], detail: Json = null): RuleWindowResult =>
    frozenCopy({ ...base(), status: 'refused', reason, detail, satisfied: [], failed: [], covered: [], unresolved: [] });
  if (work.signal?.aborted) return refuse('cancelled');
  if (capability.status === 'missing') return refuse('missing-capability');
  // Padding keeps transitions and brackets near either requested edge available.
  // Stations also require incoming and outgoing motion evidence.
  const startMs = window.startMs - stepMs, endMs = window.endMs + stepMs;
  if (!Number.isSafeInteger(startMs) || !Number.isSafeInteger(endMs)
    || startMs <= -8_640_000_000_000_000 || endMs > 8_640_000_000_000_000) return refuse('coverage', 'state-padding-unrepresentable');
  const padded = clockWindow({ startMs, endMs, clock: window.clock });
  function remaining(): number {
    if (evaluations >= work.maxEvaluations) throw new AdapterRefused('evaluation-budget');
    if (work.signal?.aborted) throw new AdapterRefused('cancelled');
    return work.maxEvaluations - evaluations;
  }
  function seed(domain: ClockWindow, run: (adapter: EngineAdapter) => number): number {
    const context = new WorkContext(domain, { ...work, maxEvaluations: remaining() });
    try { return run(new EngineAdapter(context, engine)); }
    finally { evaluations += context.evaluations; receipts.push(...context.receipts); }
  }
  function search(operation: EventOperation, domain: ClockWindow): EventSearchResult {
    const result = new EventsAdapter(capability, engine).search(operation, domain,
      { ...work, maxEvaluations: remaining(), stepMs });
    evaluations += result.evaluations;
    receipts.push(...result.receipts);
    searches.push(result);
    if (result.status === 'refused') {
      // Keep missing-capability and coverage reasons as well as calculation refusals.
      throw new SearchRefused(result);
    }
    return result;
  }
  try {
    let satisfied: readonly Interval[] = [window];
    const unresolved: Unresolved[] = [];
    if (rule.kind === 'moon-sign') {
      const initial = seed(padded, adapter => Math.floor(adapter.position('Moon', startMs).longitude / 30));
      const result = stateWindows(padded, initial, search({ kind: 'ingress', body: 'Moon' }, padded),
        state => rule.options.signs.includes(SIGNS[state]!), event => {
          if (event.body !== 'Moon') throw new TypeError('Unexpected ingress body.');
          const next = SIGNS.indexOf(String(event.toSign).toLowerCase() as typeof SIGNS[number]);
          const prior = SIGNS.indexOf(String(event.fromSign).toLowerCase() as typeof SIGNS[number]);
          if (next < 0 || prior < 0 || (prior + (direction(event) === 'direct' ? 1 : 11)) % 12 !== next) {
            throw new TypeError('Invalid sign transition.');
          }
          return { from: prior, to: next };
        });
      satisfied = clipIntervals(result.satisfied, window);
      for (const item of result.unresolved) for (const span of clipIntervals([item], window)) unresolved.push({ ...item, ...span });
    } else if (rule.kind === 'moon-phase') {
      const initial = seed(padded, adapter => phaseIndex(adapter.position('Moon', startMs).longitude
        - adapter.position('Sun', startMs).longitude));
      const result = stateWindows(padded, initial, search({ kind: 'phase-boundary' }, padded),
        state => rule.options.phases.includes(PHASES[state]!), event => {
          const angle = event.relativeLongitude;
          const target = event.target as { readonly [key: string]: Json } | null;
          if (event.body !== 'Moon' || !event.target || typeof event.target !== 'object'
            || Array.isArray(event.target) || target?.kind !== 'moving' || target.body !== 'Sun'
            || typeof angle !== 'number' || angle < 22.5 || angle > 337.5 || (angle - 22.5) % 45 !== 0) {
            throw new TypeError('Invalid phase transition.');
          }
          const above = ((angle - 22.5) / 45 + 1) % 8;
          const below = (above + 7) % 8;
          return direction(event) === 'direct' ? { from: below, to: above } : { from: above, to: below };
        });
      satisfied = clipIntervals(result.satisfied, window);
      for (const item of result.unresolved) for (const span of clipIntervals([item], window)) unresolved.push({ ...item, ...span });
    } else {
      for (const body of rule.options.bodies) {
        const initial = seed(padded, adapter => Math.sign(adapter.position(body, startMs, true).speedDegreesPerDay!));
        const events = search({ kind: 'station', body }, padded);
        if (initial === 0) {
          // No direction is established at the padded seed, even with an empty scan.
          satisfied = []; unresolved.push({ startMs: window.startMs, endMs: window.endMs,
            reason: 'zero-speed-seed', body }); continue;
        }
        const result = stateWindows(padded, initial, events, state => state > 0, event => {
          if (event.body !== body) throw new TypeError('Unexpected station body.');
          const next = direction(event) === 'direct' ? 1 : -1;
          return { from: -next, to: next };
        });
        satisfied = intersectIntervals(satisfied, clipIntervals(result.satisfied, window));
        for (const item of result.unresolved) for (const span of clipIntervals([item], window)) unresolved.push({ ...item, ...span });
      }
    }
    remainingCheckpoint(work.signal);
    const covered = subtractIntervals([window], unresolved);
    satisfied = intersectIntervals(satisfied, covered);
    return frozenCopy({ ...base(), status: unresolved.length ? 'unresolved' : 'complete',
      satisfied: normalizeIntervals(satisfied), failed: subtractIntervals(covered, satisfied), covered, unresolved });
  } catch (error) {
    if (error instanceof SearchRefused) return refuse(error.result.reason, error.result.detail);
    if (error instanceof AdapterRefused) return refuse(error.reason, error.detail);
    throw error;
  }
}
function remainingCheckpoint(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new AdapterRefused('cancelled');
}
class SearchRefused extends Error {
  constructor(readonly result: Extract<EventSearchResult, { status: 'refused' }>) { super('Event search refused.'); }
}
