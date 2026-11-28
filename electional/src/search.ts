import { clockWindow, workOptions, frozenCopy } from './adapter-contract.js';
import type { ClockWindow, WorkOptions } from './adapter-contract.js';
import { composeRuleWindows } from './composition.js';
import type { ElectionalResult, RuleEvaluation, UnattemptedRule } from './composition.js';
import { evaluateBasicRule } from './basic-rules.js';
import { evaluateVoidRule } from './void-rule.js';
import { evaluateHourRule } from './hour-rule.js';
import { evaluateChartRule } from './chart-rules.js';
import { evaluateAvoidanceRule } from './avoidance-rules.js';
import { evaluateSynastryRule } from './synastry-rule.js';
import type { EngineRuntime } from './engine-adapter.js';
import { loadEventsCapability, eclipseSettings } from './events-adapter.js';
import type { EventsCapability, EclipseSearchSettings } from './events-adapter.js';
import { loadChartRuntime } from './chart-adapter.js';
import type { ChartRuntime } from './chart-adapter.js';
import { loadSkyRuntime } from './sky-adapter.js';
import type { SkyRuntime } from './sky-adapter.js';
import { loadSynastryRuntime } from './synastry-adapter.js';
import type { SynastryRuntime } from './synastry-adapter.js';
import type { ElectionalRule } from './rule-types.js';
import { validateRuleSet, resolvedInstantMs } from './rules.js';

export interface SearchDependencies {
  readonly engine: EngineRuntime;
  readonly events: EventsCapability;
  readonly chart?: ChartRuntime;
  readonly sky?: SkyRuntime;
  readonly synastry?: SynastryRuntime;
}
export interface SearchOptions extends WorkOptions {
  readonly stepMs: number;
  readonly lookaheadMs: number;
  /** Shared native sky samples, separate from the native API request count. */
  readonly maxSkySamples: number;
  /** Explicitly required when an eclipse rule is present. */
  readonly eclipse?: EclipseSearchSettings;
}
/** Only loads existing local builds. Missing events remains an explicit capability. */
export async function loadSearchDependencies(): Promise<SearchDependencies> {
  const [chart, sky, synastry, events] = await Promise.all([
    loadChartRuntime(), loadSkyRuntime(), loadSynastryRuntime(), loadEventsCapability(),
  ]);
  return Object.freeze({ engine: chart, chart, sky, synastry, events });
}
function unattempted(rule: ElectionalRule, window: ClockWindow,
  reason: UnattemptedRule['reason'], detail: string): UnattemptedRule {
  return frozenCopy({ rule, window, status: 'refused', reason, detail, evaluations: 0, receipts: [], searches: [],
    explanation: `Rule ${rule.id} was not evaluated: ${detail}. No passing or failing condition is established.`,
    completeness: 'source-scan-assumptions', satisfied: [], failed: [], covered: [], unresolved: [] });
}

/** Shared strict control boundary for both bounded and streaming coordinators. */
export function checkedSearchOptions(options: SearchOptions, rules: readonly ElectionalRule[]): SearchOptions {
  if (!options || Object.keys(options).some(k => !['stepMs', 'lookaheadMs', 'maxSkySamples', 'eclipse', 'maxEvaluations', 'signal'].includes(k))
    || !Number.isSafeInteger(options.stepMs) || options.stepMs < 1
    || !Number.isSafeInteger(options.lookaheadMs) || options.lookaheadMs < 0
    || !Number.isSafeInteger(options.maxSkySamples) || options.maxSkySamples < 1) {
    throw new RangeError('Expected explicit stepMs, lookaheadMs and maxSkySamples.');
  }
  const work = workOptions({ maxEvaluations: options.maxEvaluations, ...(options.signal === undefined ? {} : { signal: options.signal }) });
  const eclipse = options.eclipse === undefined ? undefined : eclipseSettings(options.eclipse);
  if (rules.some(rule => rule.kind === 'avoid-eclipses') && !eclipse) throw new RangeError('Eclipse rules require an explicit model and derivative step.');
  return Object.freeze({ ...work, stepMs: options.stepMs, lookaheadMs: options.lookaheadMs, maxSkySamples: options.maxSkySamples,
    ...(eclipse === undefined ? {} : { eclipse }) });
}

/** Evaluate every declared rule in declaration order with shared request/sample budgets. */
export function searchElectional(input: unknown, dependencies: SearchDependencies, options: SearchOptions): ElectionalResult {
  const rules = validateRuleSet(input);
  const window = clockWindow({ startMs: resolvedInstantMs(rules.range.start), endMs: resolvedInstantMs(rules.range.end), clock: 'utc' });
  const checked = checkedSearchOptions(options, rules.rules);
  const work = workOptions({ maxEvaluations: checked.maxEvaluations, ...(checked.signal === undefined ? {} : { signal: checked.signal }) });
  const { stepMs, lookaheadMs, maxSkySamples, eclipse } = checked;
  let evaluations = 0, skySamples = 0;
  let stopped: 'evaluation-budget' | 'cancelled' | 'sky-sample-budget' | undefined;
  const results: RuleEvaluation[] = [];
  for (const rule of rules.rules) {
    if (work.signal?.aborted) stopped = 'cancelled';
    if (evaluations >= work.maxEvaluations) stopped ??= 'evaluation-budget';
    if (stopped) {
      results.push(unattempted(rule, window, stopped, 'shared-search-stopped-before-rule'));
      continue;
    }
    const base = { ...work, maxEvaluations: work.maxEvaluations - evaluations };
    const scan = { ...base, stepMs };
    let result: RuleEvaluation;
    switch (rule.kind) {
      case 'moon-sign': case 'moon-phase': case 'direct-motion':
        result = evaluateBasicRule(rule, window, dependencies.engine, dependencies.events, scan); break;
      case 'moon-not-void':
        result = evaluateVoidRule(rule, window, dependencies.engine, dependencies.events, { ...scan, lookaheadMs }); break;
      case 'planetary-hour':
        if (!dependencies.sky) result = unattempted(rule, window, 'missing-capability', 'sky-runtime-unavailable');
        else if (skySamples >= maxSkySamples) result = unattempted(rule, window, 'sky-sample-budget', 'shared-sky-samples-exhausted');
        else result = evaluateHourRule(rule, window, rules.location, dependencies.sky, { ...base, maxSamples: maxSkySamples - skySamples });
        break;
      case 'benefic-house': case 'benefic-angular': case 'applying-aspect':
        result = dependencies.chart
          ? evaluateChartRule(rule, window, rules.location, rules.houseSystem, dependencies.chart, dependencies.events, scan)
          : unattempted(rule, window, 'missing-capability', 'chart-runtime-unavailable');
        break;
      case 'avoid-eclipses': case 'avoid-stations':
        result = evaluateAvoidanceRule(rule, window, dependencies.engine, dependencies.events,
          { ...scan, ...(rule.kind === 'avoid-eclipses' ? { eclipse: eclipse! } : {}) }); break;
      case 'synastry-aspect':
        result = dependencies.synastry
          ? evaluateSynastryRule(rule, window, rules.natal!, dependencies.synastry, dependencies.events, scan)
          : unattempted(rule, window, 'missing-capability', 'synastry-runtime-unavailable');
        break;
    }
    if (!Number.isSafeInteger(result.evaluations) || result.evaluations < 0 || result.evaluations > base.maxEvaluations) {
      throw new TypeError('Evaluator exceeded or misreported the shared request budget.');
    }
    if (work.signal?.aborted && !(result.status === 'refused' && result.reason === 'cancelled')) {
      result = { ...result, status: 'refused', reason: 'cancelled', detail: 'shared-search-cancelled-after-rule',
        satisfied: [], failed: [], covered: [], unresolved: [] } as RuleEvaluation;
    }
    evaluations += result.evaluations;
    if ('samples' in result) {
      if (!Number.isSafeInteger(result.samples) || result.samples < 0) throw new TypeError('Invalid evaluator sky sample count.');
      skySamples += result.samples;
    }
    if (skySamples > maxSkySamples) throw new TypeError('Evaluator exceeded the shared sky budget.');
    results.push(result);
    if (result.status === 'refused' && (result.reason === 'cancelled' || result.reason === 'evaluation-budget' || result.reason === 'sky-sample-budget')) stopped = result.reason;
  }
  return composeRuleWindows(rules, results);
}
