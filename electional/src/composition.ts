import { clockWindow, frozenCopy } from './adapter-contract.js';
import type { ClockWindow, EngineReceipt, Json } from './adapter-contract.js';
import type { RuleWindowResult } from './basic-rules.js';
import type { VoidRuleWindowResult } from './void-rule.js';
import type { HourRuleWindowResult } from './hour-rule.js';
import type { ChartRuleWindowResult } from './chart-rules.js';
import type { AvoidanceRuleWindowResult } from './avoidance-rules.js';
import type { SynastryRuleWindowResult } from './synastry-rule.js';
import type { Unresolved } from './events-adapter.js';
import { intersectIntervals, normalizeIntervals, subtractIntervals } from './intervals.js';
import type { Interval } from './intervals.js';
import type { ElectionalRule, RuleSet } from './rule-types.js';
import { resolvedInstantMs, validateRuleSet } from './rules.js';

/** Retain each evaluator's full audit, including policies, searches and fallbacks. */
export type UnattemptedRule = Omit<Extract<RuleWindowResult<ElectionalRule>, { status: 'refused' }>, 'reason'> & {
  readonly reason: 'evaluation-budget' | 'cancelled' | 'missing-capability' | 'sky-sample-budget';
};
export type RuleEvaluation = UnattemptedRule | RuleWindowResult<ElectionalRule> | VoidRuleWindowResult | HourRuleWindowResult
  | ChartRuleWindowResult | AvoidanceRuleWindowResult | SynastryRuleWindowResult;
export interface RuleUnresolved extends Unresolved {
  readonly ruleId: string;
  readonly mode: 'require' | 'prefer';
}
export interface RuleExplanation {
  readonly rule: ElectionalRule;
  readonly state: 'satisfied' | 'failed' | 'unresolved';
  readonly sourceStatus: RuleEvaluation['status'];
  readonly contribution: { readonly lower: number; readonly upper: number };
  readonly text: string;
  readonly unresolved: readonly RuleUnresolved[];
  readonly receipts: readonly EngineReceipt[];
}
export interface ScoredWindow extends ClockWindow {
  readonly rank: number;
  readonly durationMs: number;
  readonly score: { readonly lower: number; readonly upper: number; readonly maximum: number; readonly status: 'exact' | 'bounded' };
  readonly explanations: readonly RuleExplanation[];
  readonly unresolved: readonly RuleUnresolved[];
  readonly receipts: readonly EngineReceipt[];
  readonly completeness: 'source-scan-assumptions';
  readonly receiptScope: 'source-evaluation-provenance;not-every-instant-in-window';
}
export interface ElectionalResult {
  readonly schema: 'electional-result/v1';
  readonly ruleSet: RuleSet;
  readonly window: ClockWindow;
  readonly status: 'complete' | 'unresolved' | 'refused';
  readonly windows: readonly ScoredWindow[];
  readonly eligible: readonly Interval[];
  readonly excluded: readonly Interval[];
  readonly unresolvedRequired: readonly Interval[];
  readonly unresolved: readonly RuleUnresolved[];
  readonly refusals: readonly { readonly ruleId: string; readonly mode: 'require' | 'prefer'; readonly reason: string; readonly detail: Json }[];
  readonly evaluations: number;
  readonly receipts: readonly EngineReceipt[];
  readonly ruleResults: readonly RuleEvaluation[];
  readonly scoring: 'sum-of-satisfied-preference-weights;unknown-weight-only-in-upper-bound';
  readonly ranking: 'lower-desc;uncertainty-width-asc;duration-desc;start-asc;end-asc';
  readonly completeness: 'source-scan-assumptions';
  readonly receiptScope: ScoredWindow['receiptScope'];
}
const same = (a: unknown, b: unknown): boolean => canonical(a) === canonical(b);
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.keys(value).sort()
    .map(k => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
function equalSets(a: readonly Interval[], b: readonly Interval[]): boolean {
  return same(normalizeIntervals(a), normalizeIntervals(b));
}
function checkPartition(result: RuleEvaluation, domain: ClockWindow): void {
  if (!['complete', 'unresolved', 'refused'].includes(result.status)
    || !Number.isSafeInteger(result.evaluations) || result.evaluations < 0
    || typeof result.explanation !== 'string' || !result.explanation
    || result.completeness !== 'source-scan-assumptions' || !Array.isArray(result.receipts)) {
    throw new TypeError('Invalid rule evaluation metadata.');
  }
  for (const receipt of result.receipts) {
    if (!receipt?.schema || !receipt.engine?.name || !receipt.engine.version
      || !receipt.engine.ephemeris?.name || !receipt.engine.ephemeris.version
      || !Array.isArray(receipt.instants) || !Array.isArray(receipt.conventions)) {
      throw new TypeError('Missing native receipt provenance.');
    }
  }
  const satisfied = normalizeIntervals(result.satisfied), failed = normalizeIntervals(result.failed);
  const covered = normalizeIntervals(result.covered), unknown = normalizeIntervals(result.unresolved);
  if (result.status === 'refused') {
    if (satisfied.length || failed.length || covered.length || unknown.length || !result.reason) {
      throw new TypeError('Refused rule cannot establish states.');
    }
    return;
  }
  if (!equalSets([...satisfied, ...failed], covered) || intersectIntervals(satisfied, failed).length
    || intersectIntervals(covered, unknown).length || !equalSets([...covered, ...unknown], [domain])
    || (result.status === 'complete') !== (unknown.length === 0)
    || result.unresolved.some(item => typeof item.reason !== 'string' || !item.reason)) {
    throw new TypeError('Rule states must partition the requested window.');
  }
  if (covered.length && result.receipts.length === 0) throw new TypeError('Covered rule states require native provenance.');
}
function member(spans: readonly Interval[], at: number): boolean {
  // Inputs are canonical. Avoid renormalizing every set in every score cell.
  let lo = 0, hi = spans.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2), span = spans[mid]!;
    if (at < span.startMs) hi = mid;
    else if (at >= span.endMs) lo = mid + 1;
    else return true;
  }
  return false;
}

/** Set composition only. No chart sampling, root discovery or clock conversion. */
export function composeRuleWindows(input: unknown, inputResults: readonly RuleEvaluation[]): ElectionalResult {
  const ruleSet = validateRuleSet(input);
  const window = clockWindow({ startMs: resolvedInstantMs(ruleSet.range.start), endMs: resolvedInstantMs(ruleSet.range.end), clock: 'utc' });
  if (!Array.isArray(inputResults) || inputResults.length !== ruleSet.rules.length) {
    throw new TypeError('Exactly one evaluation for every declared rule is required.');
  }
  const byId = new Map<string, RuleEvaluation>();
  for (const result of inputResults) {
    if (!result || !result.rule || byId.has(result.rule.id)) throw new TypeError('Duplicate or invalid rule evaluation.');
    byId.set(result.rule.id, result);
  }
  const ordered = ruleSet.rules.map(rule => {
    const result = byId.get(rule.id);
    if (!result || !same(result.rule, rule) || !same(clockWindow(result.window), window)) {
      throw new TypeError('Rule evaluation must match the declared rule and UTC domain.');
    }
    if ('location' in result && !same(result.location, ruleSet.location)
      || 'houseSystem' in result && result.houseSystem !== ruleSet.houseSystem
      || rule.kind === 'synastry-aspect' && 'natal' in result && result.natal && !same(result.natal.input, ruleSet.natal)) {
      throw new TypeError('Rule evaluation context differs from the declared context.');
    }
    checkPartition(result, window);
    return result;
  });
  // One detached snapshot retains shared native audit structures and never freezes callers.
  const ruleResults = frozenCopy(ordered);
  const receipts = Object.freeze(ruleResults.flatMap(r => r.receipts));
  const evaluations = ruleResults.reduce((sum, r) => sum + r.evaluations, 0);
  if (!Number.isSafeInteger(evaluations)) throw new RangeError('Total request count is not a safe integer.');
  const unresolved: RuleUnresolved[] = [], refusals: ElectionalResult['refusals'][number][] = [];
  const sets = ruleResults.map(result => {
    const { rule } = result;
    if (result.status === 'refused') {
      refusals.push(Object.freeze({ ruleId: rule.id, mode: rule.mode, reason: result.reason, detail: result.detail }));
      unresolved.push(Object.freeze({ startMs: window.startMs, endMs: window.endMs,
        reason: 'rule-refused', ruleId: rule.id, mode: rule.mode, sourceReason: result.reason }));
    } else {
      for (const item of result.unresolved) unresolved.push(Object.freeze({ ...item, ruleId: rule.id, mode: rule.mode }));
    }
    return { result, satisfied: normalizeIntervals(result.satisfied), failed: normalizeIntervals(result.failed) };
  });
  Object.freeze(unresolved);
  const excluded = normalizeIntervals(sets.filter(s => s.result.rule.mode === 'require').flatMap(s => s.failed));
  let eligible: readonly Interval[] = normalizeIntervals([window]);
  for (const set of sets) if (set.result.rule.mode === 'require') eligible = intersectIntervals(eligible, set.satisfied);
  const unresolvedRequired = subtractIntervals([window], [...eligible, ...excluded]);
  // Resource refusals invalidate an unfinished search, including a failed preference scan.
  const resourceRefused = refusals.some(r => ['cancelled', 'evaluation-budget', 'sky-sample-budget'].includes(r.reason));
  const status = resourceRefused || refusals.some(r => r.mode === 'require') ? 'refused'
    : unresolved.length ? 'unresolved' : 'complete';
  const maximum = ruleSet.rules.reduce((sum, rule) => sum + (rule.mode === 'prefer' ? rule.weight : 0), 0);
  const cuts = new Set<number>();
  for (const span of eligible) { cuts.add(span.startMs); cuts.add(span.endMs); }
  for (const set of sets) if (set.result.rule.mode === 'prefer') {
    for (const span of [...set.satisfied, ...set.failed]) { cuts.add(span.startMs); cuts.add(span.endMs); }
  }
  for (const item of unresolved) if (item.mode === 'prefer') { cuts.add(item.startMs); cuts.add(item.endMs); }
  const edges = [...cuts].sort((a, b) => a - b);
  type Cell = Omit<ScoredWindow, 'rank'>;
  const cells: Cell[] = [];
  if (!resourceRefused) for (let i = 0; i + 1 < edges.length; i++) {
    const startMs = edges[i]!, endMs = edges[i + 1]!;
    if (!member(eligible, startMs)) continue;
    const localUnknown = Object.freeze(unresolved.filter(u => u.startMs < endMs && startMs < u.endMs)
      .map(u => Object.freeze({ ...u, startMs: Math.max(startMs, u.startMs), endMs: Math.min(endMs, u.endMs) })));
    let lower = 0, upper = 0, bounded = false;
    const explanations = Object.freeze(sets.map(({ result, satisfied, failed }): RuleExplanation => {
      const { rule } = result;
      const state = member(satisfied, startMs) ? 'satisfied' : member(failed, startMs) ? 'failed' : 'unresolved';
      const weight = rule.mode === 'prefer' ? rule.weight : 0;
      const contribution = Object.freeze({ lower: state === 'satisfied' ? weight : 0, upper: state === 'failed' ? 0 : weight });
      lower += contribution.lower; upper += contribution.upper;
      bounded ||= rule.mode === 'prefer' && state === 'unresolved';
      const outcome = rule.mode === 'require' ? 'Required condition satisfied.'
        : state === 'satisfied' ? `Preference satisfied; adds ${weight} weight.`
          : state === 'failed' ? 'Preference failed; adds no weight.'
            : `Preference unresolved; adds no guaranteed weight and up to ${weight} possible weight.`;
      return Object.freeze({ rule, state, sourceStatus: result.status, contribution,
        text: `${outcome} ${result.explanation}`, unresolved: Object.freeze(localUnknown.filter(u => u.ruleId === rule.id)), receipts: result.receipts });
    }));
    const score = Object.freeze({ lower, upper, maximum, status: bounded ? 'bounded' as const : 'exact' as const });
    const previous = cells[cells.length - 1];
    // Adjacent equal states merge, unless diagnostic reasons change at the seam.
    const signature = (cell: Cell): string => canonical(cell.explanations.map(e => ({ state: e.state,
      reasons: e.unresolved.map(u => ({ reason: u.reason, sourceReason: u.sourceReason ?? null })) })));
    const cell: Cell = { startMs, endMs, clock: 'utc', durationMs: endMs - startMs, score, explanations,
      unresolved: localUnknown, receipts, completeness: 'source-scan-assumptions', receiptScope: 'source-evaluation-provenance;not-every-instant-in-window' };
    if (previous && previous.endMs === startMs && signature(previous) === signature(cell)) {
      // Recreate merged explanations to carry the full clipped diagnostic spans.
      const joinedUnknown = Object.freeze(unresolved.filter(u => u.startMs < endMs && previous.startMs < u.endMs)
        .map(u => Object.freeze({ ...u, startMs: Math.max(previous.startMs, u.startMs), endMs: Math.min(endMs, u.endMs) })));
      cells[cells.length - 1] = { ...previous, endMs, durationMs: endMs - previous.startMs, unresolved: joinedUnknown,
        explanations: Object.freeze(previous.explanations.map(e => Object.freeze({ ...e, unresolved: Object.freeze(joinedUnknown.filter(u => u.ruleId === e.rule.id)) }))) };
    } else cells.push(cell);
  }
  cells.sort((a, b) => b.score.lower - a.score.lower
    || (a.score.upper - a.score.lower) - (b.score.upper - b.score.lower)
    || b.durationMs - a.durationMs || a.startMs - b.startMs || a.endMs - b.endMs);
  const windows = Object.freeze(cells.map((cell, i) => Object.freeze({ ...cell, rank: i + 1 })));
  return Object.freeze({ schema: 'electional-result/v1', ruleSet, window, status, windows, eligible, excluded, unresolvedRequired,
    unresolved, refusals: Object.freeze(refusals), evaluations, receipts, ruleResults,
    scoring: 'sum-of-satisfied-preference-weights;unknown-weight-only-in-upper-bound',
    ranking: 'lower-desc;uncertainty-width-asc;duration-desc;start-asc;end-asc', completeness: 'source-scan-assumptions',
    receiptScope: 'source-evaluation-provenance;not-every-instant-in-window' });
}
