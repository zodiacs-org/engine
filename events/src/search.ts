import { EvaluationContext, validateWindow } from './context.js';
import { EngineAdapter, EngineRefused } from './engine.js';
import type { EventBody } from './engine.js';
import { searchSignIngresses } from './longitude.js';
import type { SignIngress } from './longitude.js';
import { searchExactAspects } from './aspects.js';
import type { ExactAspect } from './aspects.js';
import { searchStations, searchRetrogradeIntervals } from './stations.js';
import type { MotionProvider, Station, RetrogradeInterval } from './stations.js';
import { searchEclipses, EclipseEngineAdapter } from './eclipses.js';
import type { EclipseEvent, EclipseModel, EclipseProvider } from './eclipses.js';
import { searchVoidOfCourseMoon } from './void.js';
import type { VoidOfCourseInterval, UnresolvedMoonSegment } from './void.js';
import { parseQuery, QUERY_ASPECTS } from './query.js';
import type { EventQuery } from './query.js';
import type { Clock, SearchOptions, SearchWindow, SearchResult } from './types.js';

export type QuerySearchEvent = SignIngress | ExactAspect | Station | RetrogradeInterval | EclipseEvent | VoidOfCourseInterval;
export interface ExecuteOptions extends SearchOptions {
  readonly stepMs: number;
  /** Required when the query omits a clock. Conflicting clocks are rejected. */
  readonly clock?: Clock;
  /** Required only for next queries without a range; no implicit current time. */
  readonly horizon?: SearchWindow;
  readonly natalLongitudes?: Readonly<Partial<Record<EventBody, number>>>;
  readonly eclipse?: { readonly model: EclipseModel; readonly derivativeStepMs: number };
}
/** Trusted test/custom providers must charge this context for each sample. */
export interface QueryProviders {
  readonly motion?: (context: EvaluationContext) => MotionProvider;
  readonly eclipse?: (context: EvaluationContext) => EclipseProvider;
}
export type QueryExecutionResult =
  | { readonly status: 'complete'; readonly events: readonly QuerySearchEvent[];
      readonly evaluations: number; readonly window: SearchWindow;
      readonly unresolved: readonly UnresolvedMoonSegment[] }
  | { readonly status: 'refused'; readonly reason: 'evaluation-budget' | 'cancelled' | 'engine-refused';
      readonly events: readonly []; readonly evaluations: number; readonly window: SearchWindow };

function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(k => Object.hasOwn(b, k) &&
    same((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}
/** Reuse parser validation for programmatic ASTs, rejecting extras and injection. */
function snapshot(query: EventQuery): EventQuery {
  if (!query || !query.event) throw new TypeError('An EventQuery is required.');
  const e = query.event;
  let event: string;
  switch (e.kind) {
    case 'aspect': event = `${e.body} ${e.aspect} ${e.target?.kind === 'natal' ? 'natal ' : ''}${e.target?.body}`; break;
    case 'ingress': event = `${e.body} ingresses${e.sign === null ? '' : ` into ${e.sign}`}`; break;
    case 'station': event = `${e.body} stations${e.direction === null ? '' : ` ${e.direction}`}`; break;
    case 'retrograde': event = `${e.body} retrogrades${e.sign === null ? '' : ` in ${e.sign}`}`; break;
    case 'eclipse': event = `${e.eclipse} eclipses`; break;
    case 'void-of-course': event = `void-of-course Moon with ${e.bodies?.join(' , ')} aspects ${e.aspects?.join(' , ')}`; break;
    default: throw new TypeError('Unknown event kind.');
  }
  const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const range = query.range === null ? '' : ` from ${day(query.range.startMs)} to ${day(query.range.endMs)}`;
  const parsed = parseQuery(`${query.mode} ${event}${range}${query.clock === null ? '' : ` clock ${query.clock}`}`);
  if (!same(query, parsed)) throw new TypeError('Invalid EventQuery shape or values.');
  return parsed;
}

/** Execute all supported event kinds on one explicit finite window and budget. */
export function executeQuery(input: string | EventQuery, options: ExecuteOptions,
  providers: QueryProviders = {}): QueryExecutionResult {
  const query = typeof input === 'string' ? parseQuery(input) : snapshot(input);
  if (!options || Object.keys(options).some(k => !['maxEvaluations', 'signal', 'stepMs', 'clock', 'horizon', 'natalLongitudes', 'eclipse'].includes(k)) ||
      !Number.isSafeInteger(options.stepMs) || options.stepMs < 1) throw new RangeError('Explicit positive integer stepMs is required.');
  if (options.clock !== undefined && !['utc', 'ut1', 'tt'].includes(options.clock)) throw new RangeError('Unknown execution clock.');
  if (query.clock !== null && options.clock !== undefined && query.clock !== options.clock) throw new RangeError('Conflicting clocks.');
  const clock = query.clock ?? options.clock;
  if (clock === undefined) throw new RangeError('An explicit query or execution clock is required.');
  if (query.range !== null && options.horizon !== undefined) throw new RangeError('A query range cannot be overridden by a horizon.');
  const window = validateWindow(query.range !== null ? { ...query.range, clock } : options.horizon!);
  if (window.clock !== clock) throw new RangeError('Horizon clock differs from query clock.');
  const context = new EvaluationContext(window, { maxEvaluations: options.maxEvaluations,
    ...(options.signal === undefined ? {} : { signal: options.signal }) });
  const scan = { stepMs: options.stepMs };
  const e = query.event;
  let unresolved: readonly UnresolvedMoonSegment[] = [];
  let result: SearchResult<QuerySearchEvent>;
  // Validate symbolic natal inputs before cancellation or any engine evaluation.
  let natal: number | undefined;
  if (e.kind === 'aspect' && e.target.kind === 'natal') {
    natal = options.natalLongitudes?.[e.target.body];
    if (natal === undefined || !Number.isFinite(natal) || natal < 0 || natal >= 360) throw new RangeError('A finite synthetic natal longitude in [0, 360) is required.');
  }
  if (e.kind === 'eclipse' && (!options.eclipse || Object.keys(options.eclipse).some(k => !['model', 'derivativeStepMs'].includes(k)))) {
    throw new TypeError('An explicit eclipse model and derivative step are required.');
  }
  const motion = () => providers.motion?.(context) ?? new EngineAdapter(context);
  try {
    switch (e.kind) {
      case 'ingress': {
        const found = searchSignIngresses(context, e.body, scan, motion());
        result = found.status === 'refused' ? found : { ...found, events: found.events.filter(x => e.sign === null || x.toSign === e.sign) }; break;
      }
      case 'station': {
        const found = searchStations(context, e.body, scan, motion());
        result = found.status === 'refused' ? found : { ...found, events: found.events.filter(x => e.direction === null || x.direction === e.direction) }; break;
      }
      case 'retrograde': result = searchRetrogradeIntervals(context, e.body,
        { ...scan, ...(e.sign === null ? {} : { sign: e.sign }) }, motion()); break;
      case 'aspect': result = searchExactAspects(context, e.body,
        e.target.kind === 'natal' ? { kind: 'fixed', longitude: natal! } : { kind: 'moving', body: e.target.body },
        { aspects: [{ id: e.aspect, angleDegrees: QUERY_ASPECTS[e.aspect] }] }, scan, motion()); break;
      case 'eclipse': result = searchEclipses(context, e.eclipse, options.eclipse!.model,
        { ...scan, derivativeStepMs: options.eclipse!.derivativeStepMs },
        providers.eclipse?.(context) ?? new EclipseEngineAdapter(context)); break;
      case 'void-of-course': {
        const found = searchVoidOfCourseMoon(context, { bodies: e.bodies,
          aspects: e.aspects.map(id => ({ id, angleDegrees: QUERY_ASPECTS[id] })) }, scan, motion());
        if (found.status === 'complete') unresolved = found.unresolved;
        result = found; break;
      }
    }
  } catch (error) {
    if (!(error instanceof EngineRefused)) throw error;
    return { status: 'refused', reason: 'engine-refused', events: [], evaluations: context.evaluations, window };
  }
  if (result.status === 'refused') return { ...result, window };
  return { ...result, events: query.mode === 'next' ? result.events.slice(0, 1) : result.events, window, unresolved };
}
