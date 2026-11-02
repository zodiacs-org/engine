import { EvaluationContext, SearchInterrupted } from './context.js';
import { EngineAdapter, EVENT_BODIES } from './engine.js';
import type { EventBody } from './engine.js';
import { searchExactAspects, snapshotAspectRules } from './aspects.js';
import type { ExactAspect, ExactAspectPolicy } from './aspects.js';
import { searchSignIngresses, snapshotLongitudeOptions, SIGNS } from './longitude.js';
import type { LongitudeProvider, LongitudeScanOptions, Sign } from './longitude.js';
import type { Clock, SearchResult } from './types.js';

export interface VoidOfCoursePolicy extends ExactAspectPolicy {
  readonly bodies: readonly EventBody[];
}
export interface VoidOfCourseOptions extends Pick<LongitudeScanOptions, 'stepMs' | 'stationStepMs'> {}
export interface VoidOfCourseInterval {
  readonly kind: 'void-of-course';
  readonly startMs: number;
  readonly endMs: number;
  readonly clock: Clock;
  readonly sign: Sign;
  readonly clippedStart: boolean;
  /** Null when the last contact precedes the search window or sign entry. */
  readonly lastContact: ExactAspect | null;
}
export interface UnresolvedMoonSegment {
  readonly startMs: number;
  readonly endMs: number;
  readonly sign: Sign;
  readonly reason: 'next-ingress-outside-window';
}
export type VoidOfCourseResult =
  | Extract<SearchResult<VoidOfCourseInterval>, { status: 'refused' }>
  | (Extract<SearchResult<VoidOfCourseInterval>, { status: 'complete' }> & {
      readonly unresolved: readonly UnresolvedMoonSegment[];
    });

/** Sign-based exact-contact convention; no implicit bodies, aspects or orbs. */
export function searchVoidOfCourseMoon(context: EvaluationContext, policy: VoidOfCoursePolicy,
  options: VoidOfCourseOptions, provider: LongitudeProvider = new EngineAdapter(context)): VoidOfCourseResult {
  if (!policy || Object.keys(policy).some(k => !['bodies', 'aspects'].includes(k)) ||
      !Array.isArray(policy.bodies) || policy.bodies.length === 0 ||
      policy.bodies.some(b => b === 'Moon' || !EVENT_BODIES.includes(b)) ||
      new Set(policy.bodies).size !== policy.bodies.length) {
    throw new RangeError('An explicit nonempty unique policy of non-Moon bodies is required.');
  }
  if (!options || Object.keys(options).some(k => !['stepMs', 'stationStepMs'].includes(k))) {
    throw new RangeError('Invalid void-of-course scan options.');
  }
  const scanOptions = snapshotLongitudeOptions(options);
  if (provider.context !== context) throw new TypeError('Provider must share the search context.');
  const bodies = [...policy.bodies];
  const aspects = snapshotAspectRules({ aspects: policy.aspects });
  const unresolved: UnresolvedMoonSegment[] = [];
  const result = context.search(() => {
    const ingresses = searchSignIngresses(context, 'Moon', scanOptions, provider);
    if (ingresses.status === 'refused') throw new SearchInterrupted(ingresses.reason);
    if (ingresses.events.some(e => e.direction !== 'direct')) {
      throw new RangeError('Void-of-course policy requires direct Moon sign motion.');
    }
    const contacts: ExactAspect[] = [];
    for (const body of bodies) {
      const found = searchExactAspects(context, 'Moon', { kind: 'moving', body },
        { aspects }, scanOptions, provider);
      if (found.status === 'refused') throw new SearchInterrupted(found.reason);
      contacts.push(...found.events);
    }
    contacts.sort((a, b) => a.atMs - b.atMs ||
      (a.target.kind === 'moving' ? a.target.body : '').localeCompare(
        b.target.kind === 'moving' ? b.target.body : '') ||
      a.aspect.id.localeCompare(b.aspect.id) || a.relativeLongitude - b.relativeLongitude);
    const initial = provider.sample('Moon', context.window.startMs).longitude;
    if (!Number.isFinite(initial) || initial < 0 || initial >= 360) {
      throw new RangeError('Invalid Moon longitude.');
    }
    let sign = SIGNS[Math.floor(initial / 30)]!;
    let entry = context.window.startMs;
    const intervals: VoidOfCourseInterval[] = [];
    let contactIndex = 0;
    for (const ingress of ingresses.events) {
      let lastContact: ExactAspect | null = null;
      while (contactIndex < contacts.length && contacts[contactIndex]!.atMs < ingress.atMs) {
        const contact = contacts[contactIndex++]!;
        if (contact.atMs > entry) lastContact = contact;
      }
      const startMs = lastContact?.atMs ?? entry;
      if (startMs < ingress.atMs) intervals.push({ kind: 'void-of-course', startMs,
        endMs: ingress.atMs, clock: context.window.clock, sign,
        clippedStart: lastContact === null && entry === context.window.startMs,
        lastContact });
      entry = ingress.atMs;
      sign = ingress.toSign;
    }
    if (entry < context.window.endMs) unresolved.push({ startMs: entry,
      endMs: context.window.endMs, sign, reason: 'next-ingress-outside-window' });
    return intervals;
  });
  return result.status === 'refused' ? result : { ...result, unresolved };
}
