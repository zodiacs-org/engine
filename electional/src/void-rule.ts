import { clockWindow, frozenCopy, instantMs, workOptions } from './adapter-contract.js';
import type { ClockWindow, EngineReceipt, Json } from './adapter-contract.js';
import type { RuleWindowResult } from './basic-rules.js';
import type { EngineRuntime } from './engine-adapter.js';
import { EventsAdapter } from './events-adapter.js';
import type { EventRecord, EventSearchOptions, EventSearchResult, EventsCapability, Unresolved } from './events-adapter.js';
import { clipIntervals, normalizeIntervals, subtractIntervals } from './intervals.js';
import { ASPECTS, PLANETS, SIGNS, TRADITIONAL_PLANETS } from './rule-schema.js';
import type { ElectionalRule, MajorAspect, Planet } from './rule-types.js';
import { validateRuleSet } from './rules.js';

export type VoidRule = Extract<ElectionalRule, { kind: 'moon-not-void' }>;
export interface VoidRuleOptions extends EventSearchOptions {
  /** Extra search after the requested end, beyond one scan step of padding. */
  readonly lookaheadMs: number;
}
export interface VoidRuleConvention {
  readonly name: 'last-exact-ptolemaic-aspect-to-sign-exit';
  readonly bodies: readonly Exclude<Planet, 'Moon'>[];
  readonly aspects: readonly MajorAspect[];
  readonly longitude: string;
  readonly ownership: string;
  readonly lookaheadMs: number;
  readonly stepMs: number;
}
export type VoidRuleWindowResult = RuleWindowResult<VoidRule> & { readonly convention: VoidRuleConvention };
const ANGLES = { conjunction: 0, sextile: 60, square: 90, trine: 120, opposition: 180 } as const;

/** Compose source void durations; no contact discovery or root refinement here. */
export function evaluateVoidRule(input: VoidRule, inputWindow: ClockWindow,
  engine: EngineRuntime, capability: EventsCapability, options: VoidRuleOptions): VoidRuleWindowResult {
  const rule = validateRuleSet({ schemaVersion: 'electional/v1', activity: 'Void rule evaluation',
    location: { latitude: 0, longitude: 0 }, houseSystem: 'whole',
    range: { start: '2000-01-01T00:00:00Z', end: '2000-01-02T00:00:00Z', clock: 'utc' }, rules: [input] }).rules[0]!;
  if (rule.kind !== 'moon-not-void') throw new RangeError('Expected a Moon-not-void rule.');
  const window = clockWindow(inputWindow);
  if (!options || Object.keys(options).some(k => !['stepMs', 'lookaheadMs', 'maxEvaluations', 'signal'].includes(k))
    || !Number.isSafeInteger(options.stepMs) || options.stepMs < 1
    || !Number.isSafeInteger(options.lookaheadMs) || options.lookaheadMs < 0) {
    throw new RangeError('Expected explicit positive stepMs and nonnegative lookaheadMs.');
  }
  const work = workOptions({ maxEvaluations: options.maxEvaluations,
    ...(options.signal === undefined ? {} : { signal: options.signal }) });
  const selected: readonly Planet[] = rule.options.bodies === 'traditional' ? TRADITIONAL_PLANETS : PLANETS;
  const bodies = selected.filter((body): body is Exclude<Planet, 'Moon'> => body !== 'Moon');
  const convention: VoidRuleConvention = { name: 'last-exact-ptolemaic-aspect-to-sign-exit', bodies, aspects: ASPECTS,
    longitude: 'tropical-geocentric-apparent-ecliptic-true-of-date',
    ownership: 'void-from-last-contact-inclusive-to-ingress-exclusive',
    lookaheadMs: options.lookaheadMs, stepMs: options.stepMs };
  let evaluations = 0;
  const receipts: EngineReceipt[] = [], searches: EventSearchResult[] = [];
  const base = () => ({ rule, window, evaluations, receipts, searches, convention,
    explanation: `Moon outside void periods under ${rule.options.bodies} bodies (${bodies.join(', ')}) and exact ${ASPECTS.join(', ')} contacts before sign exit. No orbs, latitude, nodes or next-sign contacts. This is a traditional selection convention.`,
    completeness: 'source-scan-assumptions' as const });
  const refuse = (reason: Extract<EventSearchResult, { status: 'refused' }>['reason'], detail: Json = null): VoidRuleWindowResult =>
    frozenCopy({ ...base(), status: 'refused', reason, detail, satisfied: [], failed: [], covered: [], unresolved: [] });
  if (work.signal?.aborted) return refuse('cancelled');
  if (capability.status === 'missing') return refuse('missing-capability');
  const startMs = window.startMs - options.stepMs;
  const endMs = window.endMs + options.lookaheadMs + options.stepMs;
  if (!Number.isSafeInteger(startMs) || !Number.isSafeInteger(endMs)
    || startMs <= -8_640_000_000_000_000 || endMs > 8_640_000_000_000_000) {
    return refuse('coverage', 'void-padding-unrepresentable');
  }
  const padded = clockWindow({ startMs, endMs, clock: window.clock });
  const adapter = new EventsAdapter(capability, engine);
  function search(operation: Parameters<EventsAdapter['search']>[0]): EventSearchResult {
    const result = adapter.search(operation, padded, { ...work,
      stepMs: options.stepMs, maxEvaluations: work.maxEvaluations - evaluations });
    evaluations += result.evaluations;
    receipts.push(...result.receipts); searches.push(result);
    return result;
  }
  const voids = search({ kind: 'void-of-course', bodies, aspects: ASPECTS });
  if (voids.status === 'refused') return refuse(voids.reason, voids.detail);
  // Native void durations omit their ending ingress brackets. Reuse ingress
  // discovery to retain numerical boundary uncertainty on either side of a void.
  if (evaluations >= work.maxEvaluations) return refuse('evaluation-budget');
  const ingresses = search({ kind: 'ingress', body: 'Moon' });
  if (ingresses.status === 'refused') return refuse(ingresses.reason, ingresses.detail);
  const unknown: Unresolved[] = [];
  function addUnknown(item: Unresolved): void {
    for (const span of clipIntervals([item], window)) unknown.push({ ...item, ...span });
  }
  for (const item of voids.unresolved) addUnknown(item);
  if (ingresses.status === 'unresolved') addUnknown({ ...window, reason: 'incomplete-ingress-boundaries' });
  const ingressByTime = new Map<number, EventRecord>();
  const orderedIngresses = [...ingresses.events].sort((a, b) => (a.atMs as number) - (b.atMs as number));
  let previousSign: number | undefined;
  for (const event of orderedIngresses) {
    const atMs = event.atMs as number;
    const from = SIGNS.indexOf(String(event.fromSign).toLowerCase() as typeof SIGNS[number]);
    const to = SIGNS.indexOf(String(event.toSign).toLowerCase() as typeof SIGNS[number]);
    if (event.body !== 'Moon' || event.direction !== 'direct'
      || from < 0 || to !== (from + 1) % 12
      || (previousSign !== undefined && from !== previousSign)
      || ingressByTime.has(atMs)) throw new TypeError('Invalid Moon ingress boundary.');
    ingressByTime.set(atMs, event);
    previousSign = to;
    bracket(event, ingresses, 'numerical-ingress-bracket');
  }
  function bracket(event: EventRecord, search: EventSearchResult, reason: string): readonly [number, number] {
    const atMs = event.atMs as number;
    instantMs(atMs);
    if (!Array.isArray(event.bracket) || event.bracket.length !== 2) throw new TypeError('Expected root bracket.');
    const lo = event.bracket[0] as number, hi = event.bracket[1] as number;
    instantMs(lo); instantMs(hi);
    if (lo > atMs || hi < atMs || lo < search.sourceWindow!.startMs || hi > search.sourceWindow!.endMs) {
      throw new TypeError('Invalid root bracket.');
    }
    if (lo < hi) addUnknown({ startMs: lo, endMs: Math.min(hi + 1, 8_640_000_000_000_000), reason });
    return [lo, hi];
  }
  let previousEnd = -Infinity;
  for (const event of [...voids.events].sort((a, b) => (a.startMs as number) - (b.startMs as number))) {
    if (!SIGNS.includes(String(event.sign).toLowerCase() as typeof SIGNS[number])
      || typeof event.clippedStart !== 'boolean' || (event.startMs as number) < previousEnd) {
      throw new TypeError('Invalid or overlapping void metadata.');
    }
    previousEnd = event.endMs as number;
    const ingress = ingressByTime.get(event.endMs as number);
    // A separate scan can choose a neighboring integer label for the same
    // root. Do not guess the association or accept stale void durations.
    if (!ingress || String(ingress.fromSign).toLowerCase() !== String(event.sign).toLowerCase()) {
      if (clipIntervals([{ startMs: event.startMs as number, endMs: event.endMs as number }], window).length) {
        // Without a consistent exit we cannot establish either side of the void.
        addUnknown({ ...window, reason: 'unmatched-void-ingress' });
      }
    }
    if (event.lastContact === null) continue;
    const contact = event.lastContact as EventRecord;
    const target = contact?.target as { readonly [key: string]: Json } | null;
    const aspect = contact?.aspect as { readonly [key: string]: Json } | null;
    const angle = ANGLES[aspect?.id as MajorAspect];
    if (!contact || contact.kind !== 'exact-aspect' || contact.clock !== window.clock || contact.body !== 'Moon'
      || !contact.target || typeof contact.target !== 'object' || Array.isArray(contact.target)
      || target?.kind !== 'moving' || !bodies.includes(target.body as typeof bodies[number])
      || !contact.aspect || typeof contact.aspect !== 'object' || Array.isArray(contact.aspect)
      || !ASPECTS.includes(aspect?.id as typeof ASPECTS[number])
      || aspect?.angleDegrees !== angle
      || (contact.relativeLongitude !== angle && contact.relativeLongitude !== (360 - angle) % 360)
      || contact.atMs !== (event.sourceInterval as { startMs: Json }).startMs
      || (contact.atMs as number) >= (event.endMs as number)) throw new TypeError('Invalid last exact contact.');
    const [lo, hi] = bracket(contact, voids, 'numerical-contact-bracket');
    if (ingress && hi >= (ingress.bracket as readonly number[])[0]!) {
      // A last-contact/exit ordering cannot be established from intersecting brackets.
      const preceding = orderedIngresses[orderedIngresses.indexOf(ingress) - 1];
      const entry = preceding ? (preceding.bracket as readonly number[])[0]! : padded.startMs;
      addUnknown({ startMs: Math.min(lo, entry), endMs: event.endMs as number,
        reason: 'contact-ingress-order-uncertain' });
    }
  }
  if (work.signal?.aborted) return refuse('cancelled');
  const covered = subtractIntervals([window], unknown);
  const failed = clipIntervals(normalizeIntervals(voids.events.map(event => ({
    startMs: event.startMs as number, endMs: event.endMs as number,
  }))), window);
  return frozenCopy({ ...base(), status: unknown.length ? 'unresolved' : 'complete',
    satisfied: subtractIntervals(covered, failed), failed: subtractIntervals(failed, unknown), covered,
    unresolved: unknown });
}
