import { EvaluationContext, SearchInterrupted } from './context.js';
import { EngineAdapter, EVENT_BODIES } from './engine.js';
import type { EventBody } from './engine.js';
import { searchLongitudeCrossings } from './longitude.js';
import type { LongitudeProvider, LongitudeScanOptions, LongitudeCrossing } from './longitude.js';
import type { SearchResult } from './types.js';

export interface ExactAspectRule {
  readonly id: string;
  /** Unsigned separation in degrees, from conjunction through opposition. */
  readonly angleDegrees: number;
}
export interface ExactAspectPolicy { readonly aspects: readonly ExactAspectRule[] }
export type AspectTarget =
  | { readonly kind: 'fixed'; readonly longitude: number }
  | { readonly kind: 'moving'; readonly body: EventBody };
export interface ExactAspect extends Omit<LongitudeCrossing, 'kind' | 'longitude'> {
  readonly kind: 'exact-aspect';
  readonly target: AspectTarget;
  readonly aspect: ExactAspectRule;
  /** Moving body's longitude minus target longitude, normalized to [0, 360). */
  readonly relativeLongitude: number;
}
const wrap = (x: number): number => ((x % 360) + 360) % 360;
function validLongitude(x: number): void {
  if (!Number.isFinite(x) || x < 0 || x >= 360) throw new RangeError('Invalid target or provider longitude.');
}

/** Shared validation and immutable snapshot for composite searches. */
export function snapshotAspectRules(policy: ExactAspectPolicy): readonly ExactAspectRule[] {
  if (!policy || Object.keys(policy).some(key => key !== 'aspects') ||
      !Array.isArray(policy.aspects) || policy.aspects.length === 0) {
    throw new TypeError('An explicit nonempty aspect policy is required.');
  }
  const ids = new Set<string>();
  const angles = new Set<number>();
  return policy.aspects.map(rule => {
    if (!rule || Object.keys(rule).some(key => !['id', 'angleDegrees'].includes(key)) ||
        typeof rule.id !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]{0,79}$/.test(rule.id) ||
        !Number.isFinite(rule.angleDegrees) || rule.angleDegrees < 0 || rule.angleDegrees > 180 ||
        ids.has(rule.id) || angles.has(rule.angleDegrees)) {
      throw new RangeError('Aspect rules require unique ids and unique finite angles in [0, 180].');
    }
    ids.add(rule.id); angles.add(rule.angleDegrees);
    return Object.freeze({ id: rule.id, angleDegrees: rule.angleDegrees });
  });
}

/** Exact contacts only: no orb, applying/separating allowance or closest-aspect selection. */
export function searchExactAspects(context: EvaluationContext, body: EventBody,
  target: AspectTarget, policy: ExactAspectPolicy, options: LongitudeScanOptions,
  provider: LongitudeProvider = new EngineAdapter(context)): SearchResult<ExactAspect> {
  if (!EVENT_BODIES.includes(body)) throw new RangeError('Unsupported moving body.');
  if (!target || (target.kind !== 'fixed' && target.kind !== 'moving') ||
      Object.keys(target).some(key => !['kind', target.kind === 'fixed' ? 'longitude' : 'body'].includes(key))) {
    throw new TypeError('Target must be a fixed longitude or moving body.');
  }
  let frozenTarget: AspectTarget;
  if (target.kind === 'fixed') {
    validLongitude(target.longitude);
    frozenTarget = Object.freeze({ kind: 'fixed', longitude: target.longitude });
  } else {
    if (!EVENT_BODIES.includes(target.body) || target.body === body) {
      throw new RangeError('Moving target must be a different supported body.');
    }
    frozenTarget = Object.freeze({ kind: 'moving', body: target.body });
  }
  const rules = snapshotAspectRules(policy);
  if (provider.context !== context) throw new TypeError('Provider must share the search context.');
  // Validate scan options even before a cancelled search, with no sampling.
  if (!options || Object.keys(options).some(key => !['stepMs', 'direction'].includes(key)) ||
      !Number.isSafeInteger(options.stepMs) || options.stepMs < 1 ||
      !['both', 'direct', 'retrograde'].includes(options.direction ?? 'both')) {
    throw new RangeError('Invalid aspect scan options.');
  }
  const relative: LongitudeProvider = { context, sample: (_body, atMs) => {
    const moving = provider.sample(body, atMs).longitude;
    validLongitude(moving);
    const reference = frozenTarget.kind === 'fixed' ? frozenTarget.longitude
      : provider.sample(frozenTarget.body, atMs).longitude;
    validLongitude(reference);
    return { longitude: wrap(moving - reference) };
  } };
  return context.search(() => {
    const found: ExactAspect[] = [];
    for (const rule of rules) {
      const branches = rule.angleDegrees === 0 || rule.angleDegrees === 180
        ? [rule.angleDegrees] : [rule.angleDegrees, 360 - rule.angleDegrees];
      for (const branch of branches) {
        const result = searchLongitudeCrossings(context, body, branch, options, relative);
        if (result.status === 'refused') {
          // Preserve the outer search's all-or-nothing behavior and cumulative budget.
          throw new SearchInterrupted(result.reason);
        }
        for (const { kind: _kind, longitude, ...crossing } of result.events) {
          found.push({ ...crossing, kind: 'exact-aspect', target: frozenTarget,
            aspect: rule, relativeLongitude: longitude });
        }
      }
    }
    return found.sort((a, b) => a.atMs - b.atMs || a.relativeLongitude - b.relativeLongitude ||
      a.aspect.id.localeCompare(b.aspect.id));
  });
}
