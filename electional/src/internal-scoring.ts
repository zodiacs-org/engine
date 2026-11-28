import type { ConditionWindow, ElectionalResult, RuleExplanation } from './composition.js';

/** Internal/pro-only. Consumer transports never accept or call this module. */
export interface ScoringOptions {
  readonly enabled: true;
  /** Optional explicit preference-weight overrides keyed by declared rule id. */
  readonly weights?: Readonly<Record<string, number>>;
}
export interface NumericScore {
  readonly lower: number;
  readonly upper: number;
  readonly maximum: number;
  readonly status: 'exact' | 'bounded';
}
type Breakdown = RuleExplanation & {
  readonly weight: number;
  readonly contribution: { readonly lower: number; readonly upper: number };
};
export type ScoredConditions = Omit<ElectionalResult, 'windows'> & {
  readonly scoring: 'internal-pro-only;explicit-opt-in;numeric-sums';
  readonly windows: readonly (Omit<ConditionWindow, 'explanations'> & {
    readonly score: NumericScore;
    readonly explanations: readonly Breakdown[];
  })[];
};

/** Annotate facts with numeric sums, preserving chronological order and states. */
export function scoreConditions(result: ElectionalResult, options: ScoringOptions): ScoredConditions {
  if (!options || options.enabled !== true || Object.keys(options).some(k => !['enabled', 'weights'].includes(k))) {
    throw new RangeError('Internal scoring requires explicit enabled: true.');
  }
  const overrides = options.weights;
  const preferences = new Map(result.ruleSet.rules.filter(r => r.mode === 'prefer').map(r => [r.id, r.weight]));
  if (overrides !== undefined) {
    if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)
      || Reflect.ownKeys(overrides).some(k => typeof k !== 'string' || !preferences.has(k))) {
      throw new RangeError('Weights must identify declared preference rules.');
    }
    for (const id of Object.keys(overrides)) {
      const descriptor = Object.getOwnPropertyDescriptor(overrides, id)!;
      const weight: unknown = descriptor.value;
      if (!('value' in descriptor) || typeof weight !== 'number' || !Number.isFinite(weight) || weight < 0) {
        throw new RangeError('Expected finite nonnegative internal weights.');
      }
      preferences.set(id, weight);
    }
  }
  const maximum = [...preferences.values()].reduce((sum, weight) => sum + weight, 0);
  if (!Number.isFinite(maximum)) throw new RangeError('Internal weight sum must be finite.');
  const windows = result.windows.map(window => {
    let lower = 0, upper = 0, bounded = false;
    const explanations = window.explanations.map(explanation => {
      const weight = preferences.get(explanation.rule.id) ?? 0;
      const contribution = Object.freeze({ lower: explanation.state === 'satisfied' ? weight : 0,
        upper: explanation.state === 'failed' ? 0 : weight });
      lower += contribution.lower; upper += contribution.upper;
      bounded ||= explanation.rule.mode === 'prefer' && explanation.state === 'unresolved';
      return Object.freeze({ ...explanation, weight, contribution });
    });
    return Object.freeze({ ...window, explanations: Object.freeze(explanations),
      score: Object.freeze({ lower, upper, maximum, status: bounded ? 'bounded' as const : 'exact' as const }) });
  });
  return Object.freeze({ ...result, scoring: 'internal-pro-only;explicit-opt-in;numeric-sums', windows: Object.freeze(windows) });
}
