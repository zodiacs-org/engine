import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { clipIntervals, subtractIntervals } from './intervals.js';
import type { Interval } from './intervals.js';
import { AdapterRefused, clockWindow, frozenCopy, instantMs, WorkContext, workOptions } from './adapter-contract.js';
import type { ClockWindow, EngineReceipt, Json, WorkOptions } from './adapter-contract.js';
import { EngineAdapter } from './engine-adapter.js';
import type { EngineRuntime, Position } from './engine-adapter.js';
import type { MajorAspect, Planet } from './rule-types.js';
import { PLANETS } from './rule-schema.js';

const ANGLES = Object.freeze({ conjunction: 0, sextile: 60, square: 90, trine: 120, opposition: 180 });
export type AspectTarget = { readonly kind: 'moving'; readonly body: Planet }
  | { readonly kind: 'fixed'; readonly longitude: number };
export type EventOperation =
  | { readonly kind: 'phase-boundary' }
  | { readonly kind: 'eclipse'; readonly eclipseKind: 'solar' | 'lunar'; readonly model: EclipseModel; readonly derivativeStepMs: number }
  | { readonly kind: 'ingress' | 'station' | 'retrograde'; readonly body: Planet }
  | { readonly kind: 'aspect'; readonly body: Planet; readonly target: AspectTarget; readonly aspects: readonly MajorAspect[] }
  | { readonly kind: 'void-of-course'; readonly bodies: readonly Exclude<Planet, 'Moon'>[]; readonly aspects: readonly MajorAspect[] };
export interface EventSearchOptions extends WorkOptions { readonly stepMs: number }
export interface EclipseModel {
  readonly sunRadiusAu: number;
  readonly moonRadiusAu: number;
  readonly earthRadiusAu: number;
}
export interface EclipseSearchSettings { readonly model: EclipseModel; readonly derivativeStepMs: number }
export function eclipseSettings(input: EclipseSearchSettings): EclipseSearchSettings {
  const value = frozenCopy(input);
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).some(k => !['model', 'derivativeStepMs'].includes(k))
    || !Number.isSafeInteger(value.derivativeStepMs) || value.derivativeStepMs < 1) {
    throw new RangeError('Expected explicit positive derivativeStepMs and spherical model.');
  }
  const model = value.model;
  if (!model || typeof model !== 'object' || Array.isArray(model)
    || Object.keys(model).some(k => !['sunRadiusAu', 'moonRadiusAu', 'earthRadiusAu'].includes(k))
    || ![model.sunRadiusAu, model.moonRadiusAu, model.earthRadiusAu].every(v => Number.isFinite(v) && v > 0)
    || model.sunRadiusAu <= Math.max(model.moonRadiusAu, model.earthRadiusAu)) {
    throw new RangeError('Expected positive spherical radii in au, with Sun largest.');
  }
  return value;
}
export interface EventRecord { readonly kind: string; readonly clock: ClockWindow['clock']; readonly [key: string]: Json }
export interface Unresolved extends Interval { readonly reason: string; readonly [key: string]: Json }

// Structural contracts for the optional sibling's public exports. No solver is copied here.
interface EventsContext {
  readonly evaluations: number;
  evaluate<T>(run: () => T): T;
  checkpoint(): void;
}
interface MotionProvider {
  readonly context: EventsContext;
  sample(body: Planet, atMs: number, withSpeed?: boolean): Position;
}
interface AspectPolicy { readonly aspects: readonly { id: string; angleDegrees: number }[] }
interface NativeSearch {
  readonly status: 'complete' | 'refused';
  readonly reason?: string;
  readonly evaluations: number;
  readonly events: readonly EventRecord[];
  readonly unresolved?: readonly Unresolved[];
}
export interface EventsRuntime {
  readonly EvaluationContext: new (window: ClockWindow, options: WorkOptions) => EventsContext;
  searchSignIngresses(context: EventsContext, body: Planet, options: { stepMs: number }, provider: MotionProvider): NativeSearch;
  searchStations(context: EventsContext, body: Planet, options: { stepMs: number }, provider: MotionProvider): NativeSearch;
  searchRetrogradeIntervals(context: EventsContext, body: Planet, options: { stepMs: number }, provider: MotionProvider): NativeSearch;
  searchExactAspects(context: EventsContext, body: Planet, target: AspectTarget,
    policy: AspectPolicy, options: { stepMs: number }, provider: MotionProvider): NativeSearch;
  searchVoidOfCourseMoon(context: EventsContext, policy: AspectPolicy & { bodies: readonly Planet[] },
    options: { stepMs: number }, provider: MotionProvider): NativeSearch;
  /** Optional on older builds; its absence is an explicit capability refusal. */
  searchEclipses?(context: EventsContext, kind: 'solar' | 'lunar', model: EclipseModel,
    options: { stepMs: number; derivativeStepMs: number }, provider: {
      sample(atMs: number): { sun: readonly [number, number, number]; moon: readonly [number, number, number] };
    }): NativeSearch;
}
export interface EventsSource { readonly moduleUrl: string; readonly sha256: string }
export type EventsCapability = { readonly status: 'available'; readonly runtime: EventsRuntime; readonly source: EventsSource }
  | { readonly status: 'missing' };

/** Only the fixed, read-only sibling build is loaded. A broken present build throws. */
export async function loadEventsCapability(): Promise<EventsCapability> {
  const url = new URL('../../events/build/src/index.js', import.meta.url);
  let bytes: Buffer;
  try { bytes = await readFile(url); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return Object.freeze({ status: 'missing' });
    throw error;
  }
  const runtime = await import(url.href) as EventsRuntime;
  for (const name of ['EvaluationContext', 'searchSignIngresses', 'searchStations', 'searchRetrogradeIntervals',
    'searchExactAspects', 'searchVoidOfCourseMoon'] as const) {
    if (typeof runtime[name] !== 'function') throw new TypeError('Incompatible sibling events build.');
  }
  return Object.freeze({ status: 'available', runtime, source: Object.freeze({
    moduleUrl: url.href, sha256: createHash('sha256').update(bytes).digest('hex'),
  }) });
}

interface SearchBase {
  readonly window: ClockWindow;
  readonly sourceWindow: ClockWindow | null;
  readonly source: EventsSource | null;
  readonly evaluations: number;
  readonly receipts: readonly EngineReceipt[];
  readonly completeness: 'source-scan-assumptions';
}
export type EventSearchResult = SearchBase & (
  | { readonly status: 'complete' | 'unresolved'; readonly events: readonly EventRecord[];
      readonly covered: readonly Interval[]; readonly unresolved: readonly Unresolved[] }
  | { readonly status: 'refused'; readonly reason: 'missing-capability' | 'coverage' | 'cancelled' | 'evaluation-budget' | 'engine-refused';
      readonly detail: Json; readonly events: readonly []; readonly covered: readonly []; readonly unresolved: readonly [] }
);

function snapshotOperation(input: EventOperation): EventOperation {
  if (!input || typeof input !== 'object') throw new RangeError('Expected an event operation.');
  const operation = frozenCopy(input);
  const extras = (value: object, keys: readonly string[]) => Object.keys(value).some(k => !keys.includes(k));
  if (!['ingress', 'station', 'retrograde', 'aspect', 'void-of-course', 'phase-boundary', 'eclipse'].includes(operation.kind)) {
    throw new RangeError('Unsupported event operation.');
  }
  if (operation.kind === 'phase-boundary') {
    if (extras(operation, ['kind'])) throw new RangeError('Invalid phase operation fields.');
  } else if (operation.kind === 'eclipse') {
    if (extras(operation, ['kind', 'eclipseKind', 'model', 'derivativeStepMs'])
      || !['solar', 'lunar'].includes(operation.eclipseKind)) throw new RangeError('Invalid eclipse operation.');
    eclipseSettings({ model: operation.model, derivativeStepMs: operation.derivativeStepMs });
  } else if (operation.kind === 'void-of-course') {
    if (extras(operation, ['kind', 'bodies', 'aspects']) || !Array.isArray(operation.bodies)
      || operation.bodies.length === 0 || new Set(operation.bodies).size !== operation.bodies.length
      || Array.from(operation.bodies).some(b => b === ('Moon' as Planet) || !PLANETS.includes(b))) {
      throw new RangeError('Expected distinct non-Moon bodies.');
    }
  } else {
    if (!PLANETS.includes(operation.body) || extras(operation,
      operation.kind === 'aspect' ? ['kind', 'body', 'target', 'aspects'] : ['kind', 'body'])) {
      throw new RangeError('Invalid event operation fields or body.');
    }
  }
  if (operation.kind === 'aspect' || operation.kind === 'void-of-course') {
    if (!Array.isArray(operation.aspects) || operation.aspects.length === 0
      || new Set(operation.aspects).size !== operation.aspects.length
      || Array.from(operation.aspects).some(a => !Object.hasOwn(ANGLES, a))) throw new RangeError('Expected distinct major aspects.');
  }
  if (operation.kind === 'aspect') {
    const t = operation.target;
    if (!t || (t.kind !== 'moving' && t.kind !== 'fixed')
      || extras(t, ['kind', t.kind === 'moving' ? 'body' : 'longitude'])
      || (t.kind === 'moving' ? !PLANETS.includes(t.body) || t.body === operation.body
        : !Number.isFinite(t.longitude) || t.longitude < 0 || t.longitude >= 360)) {
      throw new RangeError('Invalid aspect target.');
    }
  }
  return operation;
}

/**
 * Delegate event discovery. Source points own (start, end]; electional points own
 * [start, end). A one-label left guard includes start without moving any event.
 * Interval durations are clipped geometrically, never shifted by a millisecond.
 */
export class EventsAdapter {
  constructor(readonly capability: EventsCapability, readonly engine: EngineRuntime) {}
  search(input: EventOperation, inputWindow: ClockWindow, options: EventSearchOptions): EventSearchResult {
    const operation = snapshotOperation(input);
    const window = clockWindow(inputWindow);
    if (!options || Object.keys(options).some(k => !['stepMs', 'maxEvaluations', 'signal'].includes(k))
      || !Number.isSafeInteger(options.stepMs) || options.stepMs < 1) throw new RangeError('Expected explicit positive stepMs.');
    const work = workOptions({ maxEvaluations: options.maxEvaluations,
      ...(options.signal === undefined ? {} : { signal: options.signal }) });
    const stepMs = options.stepMs;
    if (operation.kind === 'eclipse' && operation.derivativeStepMs > (window.endMs - window.startMs) / 2) {
      throw new RangeError('Derivative step exceeds eclipse window.');
    }
    let sourceWindow: ClockWindow | null = null;
    let context: WorkContext | undefined;
    const source = this.capability.status === 'available' ? this.capability.source : null;
    const base = (): SearchBase => ({ window, sourceWindow, source, evaluations: context?.evaluations ?? 0,
      receipts: context?.receipts ?? [], completeness: 'source-scan-assumptions' });
    const refuse = (reason: Extract<EventSearchResult, { status: 'refused' }>['reason'], detail: Json = null): EventSearchResult =>
      frozenCopy({ ...base(), status: 'refused', reason, detail, events: [], covered: [], unresolved: [] });
    if (work.signal?.aborted) return refuse('cancelled');
    if (this.capability.status === 'missing') return refuse('missing-capability');
    if (operation.kind === 'eclipse' && typeof this.capability.runtime.searchEclipses !== 'function') {
      return refuse('missing-capability', 'eclipse-search-export');
    }
    if (window.startMs === -8_640_000_000_000_000) return refuse('coverage', 'left-ownership-guard-unrepresentable');
    sourceWindow = clockWindow({ ...window, startMs: window.startMs - 1 });
    context = new WorkContext(sourceWindow, work);
    const engine = new EngineAdapter(context, this.engine);
    const runtime = this.capability.runtime;
    const nativeContext = new runtime.EvaluationContext(sourceWindow, work);
    const provider: MotionProvider = { context: nativeContext,
      sample: (body, atMs, speed = false) => nativeContext.evaluate(() => engine.position(body, atMs, speed)) };
    const scan = { stepMs };
    let result: NativeSearch;
    try {
      context.checkpoint();
      switch (operation.kind) {
        case 'eclipse': result = runtime.searchEclipses!(nativeContext, operation.eclipseKind, operation.model,
          { stepMs, derivativeStepMs: operation.derivativeStepMs }, {
            sample: atMs => ({ sun: nativeContext.evaluate(() => engine.vector('Sun', atMs)),
              moon: nativeContext.evaluate(() => engine.vector('Moon', atMs)) }),
          }); break;
        case 'phase-boundary': result = runtime.searchExactAspects(nativeContext, 'Moon',
          { kind: 'moving', body: 'Sun' }, { aspects: [22.5, 67.5, 112.5, 157.5]
            .map(angleDegrees => ({ id: `phase_${angleDegrees * 2}`, angleDegrees })) }, scan, provider); break;
        case 'ingress': result = runtime.searchSignIngresses(nativeContext, operation.body, scan, provider); break;
        case 'station': result = runtime.searchStations(nativeContext, operation.body, scan, provider); break;
        case 'retrograde': result = runtime.searchRetrogradeIntervals(nativeContext, operation.body, scan, provider); break;
        case 'aspect': result = runtime.searchExactAspects(nativeContext, operation.body, operation.target,
          { aspects: operation.aspects.map(id => ({ id, angleDegrees: ANGLES[id] })) }, scan, provider); break;
        case 'void-of-course': result = runtime.searchVoidOfCourseMoon(nativeContext,
          { bodies: operation.bodies, aspects: operation.aspects.map(id => ({ id, angleDegrees: ANGLES[id] })) }, scan, provider); break;
      }
      context.checkpoint();
    } catch (error) {
      if (error instanceof AdapterRefused) return refuse(error.reason, error.detail);
      throw error;
    }
    if (!result || !['complete', 'refused'].includes(result.status)
      || result.evaluations !== context.evaluations || nativeContext.evaluations !== context.evaluations
      || !Array.isArray(result.events)) throw new TypeError('Incompatible events result or request accounting.');
    if (result.status === 'refused') {
      if (result.events.length || !['evaluation-budget', 'cancelled'].includes(result.reason ?? '')) {
        throw new TypeError('Incompatible events refusal.');
      }
      return refuse(result.reason as 'evaluation-budget' | 'cancelled');
    }
    const expectedKind = { ingress: 'sign-ingress', station: 'station', retrograde: 'retrograde',
      aspect: 'exact-aspect', 'phase-boundary': 'exact-aspect', 'void-of-course': 'void-of-course',
      eclipse: operation.kind === 'eclipse' ? operation.eclipseKind : '' }[operation.kind];
    const events: EventRecord[] = [];
    for (const event of result.events) {
      if (!event || event.clock !== window.clock || event.kind !== expectedKind) throw new TypeError('Incompatible event kind or clock.');
      if (operation.kind === 'retrograde' || operation.kind === 'void-of-course') {
        const startMs = event.startMs as number, endMs = event.endMs as number;
        clockWindow({ startMs, endMs, clock: window.clock });
        if (startMs < sourceWindow.startMs || endMs > sourceWindow.endMs) throw new TypeError('Interval outside source coverage.');
        for (const span of clipIntervals([{ startMs, endMs }], window)) {
          events.push({ ...event, ...span, sourceInterval: { startMs, endMs },
            clippedStart: event.clippedStart === true || span.startMs > startMs,
            ...(operation.kind === 'retrograde'
              ? { clippedEnd: event.clippedEnd === true || span.endMs < endMs } : {}) });
        }
      } else {
        const atMs = event.atMs as number;
        instantMs(atMs);
        if (atMs <= sourceWindow.startMs || atMs > sourceWindow.endMs) throw new TypeError('Event outside source ownership.');
        if (atMs >= window.startMs && atMs < window.endMs) events.push(event);
      }
    }
    if (operation.kind === 'void-of-course' && !Array.isArray(result.unresolved)) {
      throw new TypeError('Void result must declare unresolved coverage.');
    }
    const unresolved: Unresolved[] = [];
    for (const item of result.unresolved ?? []) {
      if (!item || typeof item.reason !== 'string' || !item.reason) throw new TypeError('Invalid unresolved coverage.');
      clockWindow({ startMs: item.startMs, endMs: item.endMs, clock: window.clock });
      if (item.startMs < sourceWindow.startMs || item.endMs > sourceWindow.endMs) throw new TypeError('Unresolved span outside source coverage.');
      for (const span of clipIntervals([item], window)) unresolved.push({ ...item, ...span });
    }
    return frozenCopy({ ...base(), status: unresolved.length ? 'unresolved' : 'complete', events, unresolved,
      covered: subtractIntervals([window], unresolved) });
  }
}
