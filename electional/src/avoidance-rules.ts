import { clockWindow, frozenCopy, instantMs, workOptions } from './adapter-contract.js';
import type { ClockWindow, EngineReceipt, Json } from './adapter-contract.js';
import type { RuleWindowResult } from './basic-rules.js';
import type { EngineRuntime } from './engine-adapter.js';
import { eclipseSettings, EventsAdapter } from './events-adapter.js';
import type { EclipseSearchSettings, EventRecord, EventSearchOptions, EventSearchResult, EventsCapability, Unresolved } from './events-adapter.js';
import { normalizeIntervals, subtractIntervals } from './intervals.js';
import type { Interval } from './intervals.js';
import type { ElectionalRule } from './rule-types.js';
import { validateRuleSet } from './rules.js';

export type AvoidanceRule = Extract<ElectionalRule, { kind: 'avoid-eclipses' | 'avoid-stations' }>;
export interface AvoidanceRuleOptions extends EventSearchOptions {
  /** Required for eclipse rules, absent for station rules. No hidden radius model. */
  readonly eclipse?: EclipseSearchSettings;
}
export interface AvoidanceConvention {
  readonly withinDays: number;
  readonly marginMs: number;
  readonly day: '86400000-milliseconds-on-declared-clock;no-calendar-or-DST-conversion';
  readonly ownership: 'closed-day-margin-on-integer-labels';
  readonly boundaryUncertainty: 'possible-minus-certain-exclusion-from-inclusive-source-bracket';
  readonly stepMs: number;
  readonly eclipse: EclipseSearchSettings | null;
}
export interface AvoidanceAudit {
  readonly searchIndex: number;
  readonly event: EventRecord;
  readonly possible: readonly Interval[];
  readonly certain: readonly Interval[];
}
export type AvoidanceRuleWindowResult = RuleWindowResult<AvoidanceRule> & {
  readonly convention: AvoidanceConvention;
  readonly avoidances: readonly AvoidanceAudit[];
};

/** Padded delegated discovery plus set dilation/subtraction, never an event solver. */
export function evaluateAvoidanceRule(input: AvoidanceRule, inputWindow: ClockWindow,
  engine: EngineRuntime, capability: EventsCapability, options: AvoidanceRuleOptions): AvoidanceRuleWindowResult {
  const rule = validateRuleSet({ schemaVersion: 'electional/v1', activity: 'Avoidance rule evaluation',
    location: { latitude: 0, longitude: 0 }, houseSystem: 'whole',
    range: { start: '2000-01-01T00:00:00Z', end: '2000-01-02T00:00:00Z', clock: 'utc' }, rules: [input] }).rules[0]!;
  if (rule.kind !== 'avoid-eclipses' && rule.kind !== 'avoid-stations') throw new RangeError('Expected an avoidance rule.');
  const window = clockWindow(inputWindow);
  if (!options || Object.keys(options).some(k => !['stepMs', 'maxEvaluations', 'signal', 'eclipse'].includes(k))
    || !Number.isSafeInteger(options.stepMs) || options.stepMs < 1) throw new RangeError('Expected explicit positive stepMs.');
  const work = workOptions({ maxEvaluations: options.maxEvaluations,
    ...(options.signal === undefined ? {} : { signal: options.signal }) });
  if (rule.kind === 'avoid-stations' && options.eclipse !== undefined) throw new RangeError('Eclipse settings do not apply to stations.');
  const eclipse = rule.kind === 'avoid-eclipses' ? eclipseSettings(options.eclipse!) : null;
  // Floor the binary64 day product once. Inclusive integer labels then express
  // exactly the chosen margin, including zero-day exclusion at the event itself.
  const marginMs = Math.floor(rule.options.withinDays * 86_400_000);
  const convention: AvoidanceConvention = { withinDays: rule.options.withinDays, marginMs,
    day: '86400000-milliseconds-on-declared-clock;no-calendar-or-DST-conversion',
    ownership: 'closed-day-margin-on-integer-labels',
    boundaryUncertainty: 'possible-minus-certain-exclusion-from-inclusive-source-bracket',
    stepMs: options.stepMs, eclipse };
  let evaluations = 0;
  const receipts: EngineReceipt[] = [], searches: EventSearchResult[] = [], avoidances: AvoidanceAudit[] = [];
  const selection = rule.kind === 'avoid-stations' ? rule.options.bodies.join(', ') : rule.options.kinds.join(', ');
  const base = () => ({ rule, window, convention, evaluations, receipts, searches, avoidances,
    explanation: `Outside the inclusive ${rule.options.withinDays}-day margin around selected ${rule.kind === 'avoid-stations' ? 'longitude stations' : 'global eclipse shadow-axis minima'}: ${selection}. Days are fixed elapsed labels on ${window.clock}. This is a traditional selection convention, not a prediction.`,
    completeness: 'source-scan-assumptions' as const });
  const refuse = (reason: Extract<EventSearchResult, { status: 'refused' }>['reason'], detail: Json = null): AvoidanceRuleWindowResult =>
    frozenCopy({ ...base(), status: 'refused', reason, detail, satisfied: [], failed: [], covered: [], unresolved: [] });
  if (work.signal?.aborted) return refuse('cancelled');
  if (capability.status === 'missing') return refuse('missing-capability');
  if (eclipse && typeof capability.runtime.searchEclipses !== 'function') return refuse('missing-capability', 'eclipse-search-export');

  // A full step establishes station outgoing signs; derivative padding keeps
  // eclipse minima away from the source's one-sided derivative edges. The extra
  // integer label also keeps every relevant root strictly inside these guards.
  const guard = BigInt(options.stepMs) + BigInt(eclipse?.derivativeStepMs ?? 0) + 1n;
  const start = BigInt(window.startMs) - BigInt(marginMs) - guard;
  const end = BigInt(window.endMs) + BigInt(marginMs) + guard;
  if (start <= -8_640_000_000_000_000n || end > 8_640_000_000_000_000n) return refuse('coverage', 'avoidance-padding-unrepresentable');
  const padded = clockWindow({ startMs: Number(start), endMs: Number(end), clock: window.clock });
  const adapter = new EventsAdapter(capability, engine);
  const possible: Interval[] = [], certain: Interval[] = [], unknown: Unresolved[] = [];
  // Clip while still in exact integer arithmetic. Guard events may dilate
  // beyond Date's range even though their source window is representable.
  function clipped(a: bigint, b: bigint): readonly Interval[] {
    const lo = a < BigInt(window.startMs) ? BigInt(window.startMs) : a;
    const hi = b > BigInt(window.endMs) ? BigInt(window.endMs) : b;
    return lo < hi ? [{ startMs: Number(lo), endMs: Number(hi) }] : [];
  }
  const m = BigInt(marginMs);
  const operations = rule.kind === 'avoid-stations'
    ? rule.options.bodies.map(body => ({ kind: 'station' as const, body }))
    : rule.options.kinds.map(eclipseKind => ({ kind: 'eclipse' as const, eclipseKind, ...eclipse! }));
  for (const operation of operations) {
    if (work.signal?.aborted) return refuse('cancelled');
    if (evaluations >= work.maxEvaluations) return refuse('evaluation-budget');
    const search = adapter.search(operation, padded, { ...work, stepMs: options.stepMs,
      maxEvaluations: work.maxEvaluations - evaluations });
    const searchIndex = searches.length;
    evaluations += search.evaluations; receipts.push(...search.receipts); searches.push(search);
    if (search.status === 'refused') return refuse(search.reason, search.detail);
    for (const gap of search.unresolved) {
      for (const span of clipped(BigInt(gap.startMs) - m, BigInt(gap.endMs) + m)) {
        unknown.push({ ...span, reason: 'incomplete-avoidance-search', searchIndex, sourceReason: gap.reason });
      }
    }
    const seen = new Set<number>();
    for (const event of search.events) {
      const atMs = event.atMs as number;
      instantMs(atMs);
      if (!Array.isArray(event.bracket) || event.bracket.length !== 2 || seen.has(atMs)) throw new TypeError('Invalid avoidance root bracket or duplicate event.');
      seen.add(atMs);
      const lo = event.bracket[0] as number, hi = event.bracket[1] as number;
      instantMs(lo); instantMs(hi);
      if (lo > atMs || hi < atMs || lo < search.sourceWindow!.startMs || hi > search.sourceWindow!.endMs) throw new TypeError('Invalid avoidance root bracket.');
      if (operation.kind === 'station') {
        if (event.body !== operation.body || !['direct', 'retrograde'].includes(event.direction as string)
          || typeof event.longitude !== 'number' || !Number.isFinite(event.longitude) || event.longitude < 0 || event.longitude >= 360
          || typeof event.residualDegreesPerDay !== 'number' || !Number.isFinite(event.residualDegreesPerDay)) throw new TypeError('Invalid avoidance station.');
      } else {
        const model = event.model as Record<string, Json> | null;
        if (event.definition !== 'minimum-shadow-axis-distance' || event.forward !== true
          || !(operation.eclipseKind === 'solar' ? ['central', 'partial'] : ['total', 'partial', 'penumbral']).includes(event.classification as string)
          || !['axisDistanceAu', 'penumbraRadiusAu', 'umbraRadiusAu', 'derivativeResidualAuSquaredPerMs']
            .every(key => typeof event[key] === 'number' && Number.isFinite(event[key]))
          || (event.axisDistanceAu as number) < 0 || !model || Array.isArray(model)
          || Object.keys(model).length !== 3
          || Object.entries(operation.model).some(([key, value]) => model[key] !== value)) throw new TypeError('Invalid avoidance eclipse.');
      }
      const p = clipped(BigInt(lo) - m, BigInt(hi) + m + 1n);
      const c = clipped(BigInt(hi) - m, BigInt(lo) + m + 1n);
      possible.push(...p); certain.push(...c);
      avoidances.push({ searchIndex, event, possible: p, certain: c });
    }
  }
  if (work.signal?.aborted) return refuse('cancelled');
  const failed = normalizeIntervals(certain);
  for (const span of subtractIntervals(possible, failed)) unknown.push({ ...span, reason: 'numerical-avoidance-margin' });
  // A known exclusion from any selected event establishes failure even when
  // another event's exclusion boundary or search is uncertain there.
  const unresolved = unknown.flatMap(item => subtractIntervals([item], failed).map(span => ({ ...item, ...span })));
  const covered = subtractIntervals([window], unresolved);
  return frozenCopy({ ...base(), status: unresolved.length ? 'unresolved' : 'complete', failed,
    satisfied: subtractIntervals(covered, failed), covered, unresolved });
}
