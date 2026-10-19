import { EvaluationContext } from './context.js';
import { EngineAdapter, EVENT_BODIES } from './engine.js';
import type { EventBody } from './engine.js';
import { refineRoot } from './root.js';
import type { Clock, SearchResult } from './types.js';

export type CrossingDirection = 'direct' | 'retrograde';
export interface LongitudeScanOptions {
  /** Sampling interval; completeness requires the documented cell assumptions. */
  readonly stepMs: number;
  readonly direction?: CrossingDirection | 'both';
  /** Opt in to speed-zero splitting, with at most one station per speed cell. */
  readonly stationStepMs?: number;
}
export interface LongitudeCrossing {
  readonly kind: 'longitude-crossing';
  readonly body: EventBody;
  readonly longitude: number;
  readonly atMs: number;
  readonly clock: Clock;
  readonly direction: CrossingDirection;
  readonly bracket: readonly [number, number];
  readonly residualDegrees: number;
}
export const SIGNS = Object.freeze([
  'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
  'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'
] as const);
export type Sign = typeof SIGNS[number];
export interface SignIngress extends Omit<LongitudeCrossing, 'kind'> {
  readonly kind: 'sign-ingress';
  readonly fromSign: Sign;
  readonly toSign: Sign;
}
/** Providers must charge each request to the same context. */
export interface LongitudeProvider {
  readonly context: EvaluationContext;
  sample(body: EventBody, atMs: number, withSpeed?: boolean): {
    readonly longitude: number; readonly speedDegreesPerDay?: number | null;
  };
}
const delta = (a: number, b: number): number => {
  const difference = b - a;
  return difference >= 180 ? difference - 360 : difference < -180 ? difference + 360 : difference;
};
function longitude(value: number): void {
  if (!Number.isFinite(value) || value < 0 || value >= 360) {
    throw new RangeError('Longitude must be finite degrees in [0, 360).');
  }
}
/** Validate and snapshot before any provider callbacks can change the options. */
export function snapshotLongitudeOptions(options: LongitudeScanOptions): LongitudeScanOptions {
  if (!options || Object.keys(options).some(key => !['stepMs', 'direction', 'stationStepMs'].includes(key)) ||
      !Number.isSafeInteger(options.stepMs) || options.stepMs < 1 ||
      !['both', 'direct', 'retrograde'].includes(options.direction ?? 'both') ||
      (options.stationStepMs !== undefined && (!Number.isSafeInteger(options.stationStepMs) ||
        options.stationStepMs < 1 || options.stationStepMs > options.stepMs))) {
    throw new RangeError('Positive integer steps, stationStepMs <= stepMs and valid direction are required.');
  }
  return Object.freeze({ stepMs: options.stepMs, direction: options.direction ?? 'both',
    ...(options.stationStepMs === undefined ? {} : { stationStepMs: options.stationStepMs }) });
}
function scan(context: EvaluationContext, body: EventBody, targets: readonly number[],
  options: LongitudeScanOptions, provider: LongitudeProvider): SearchResult<LongitudeCrossing> {
  if (!EVENT_BODIES.includes(body)) throw new RangeError('Unsupported event body.');
  const { stepMs: step, direction: filter, stationStepMs } = snapshotLongitudeOptions(options);
  if (provider.context !== context) throw new TypeError('Provider must share the search context.');
  const read = (atMs: number): number => {
    const value = provider.sample(body, atMs).longitude;
    longitude(value);
    return value;
  };
  return context.search(() => {
    const events: LongitudeCrossing[] = [];
    const cell = (leftMs: number, left: number, rightMs: number, right: number) => {
      const motion = delta(left, right);
      if (Math.abs(motion) === 180) throw new RangeError('Ambiguous half-turn scan cell; reduce stepMs.');
      const liftedRight = left + motion;
      const direction: CrossingDirection = motion > 0 ? 'direct' : 'retrograde';
      // Suppress a sampled boundary touch when the following cell reverses.
      // At the window end only the incoming direction is available.
      for (let i = events.length - 1; i >= 0 && events[i]!.atMs === leftMs; i--) {
        const event = events[i]!;
        if (event.bracket[0] === leftMs && (motion === 0 || event.direction !== direction)) {
          events.splice(i, 1);
        }
      }
      if (motion !== 0 && (filter === 'both' || filter === direction)) {
        for (const target of targets) {
          let lift = target + 360 * Math.ceil((Math.min(left, liftedRight) - target) / 360);
          if (motion > 0 && lift === left) lift += 360;
          const crossed = motion > 0 ? left < lift && lift <= liftedRight
            : liftedRight <= lift && lift < left;
          if (!crossed) continue;
          const root = refineRoot(atMs => left + delta(left, read(atMs)) - lift, leftMs, rightMs);
          if (root.status !== 'converged') throw new Error('Unexpected local root budget exhaustion.');
          // A submillisecond crossing belongs to the cell on its right.
          const atMs = root.atMs === leftMs && root.bracket[1] > leftMs ? root.bracket[1] : root.atMs;
          if (context.owns(atMs)) events.push({ kind: 'longitude-crossing', body, longitude: target,
            atMs, clock: context.window.clock, direction, bracket: root.bracket,
            residualDegrees: atMs === root.atMs ? root.value : left + delta(left, read(atMs)) - lift });
        }
      }
    };
    const readMotion = (atMs: number) => {
      const sample = provider.sample(body, atMs, true);
      longitude(sample.longitude);
      if (typeof sample.speedDegreesPerDay !== 'number' || !Number.isFinite(sample.speedDegreesPerDay)) {
        throw new RangeError('Station-aware scanning requires a finite provider speed.');
      }
      return { longitude: sample.longitude, speed: sample.speedDegreesPerDay };
    };
    let leftMs = context.window.startMs;
    let leftSample = stationStepMs === undefined ? { longitude: read(leftMs), speed: 0 } : readMotion(leftMs);
    while (leftMs < context.window.endMs) {
      context.checkpoint();
      const coarseEnd = leftMs + Math.min(step, context.window.endMs - leftMs);
      while (leftMs < coarseEnd) {
        context.checkpoint();
        const rightMs = leftMs + Math.min(stationStepMs ?? step, coarseEnd - leftMs);
        const rightSample = stationStepMs === undefined ? { longitude: read(rightMs), speed: 0 } : readMotion(rightMs);
        let segmentMs = leftMs;
        let segmentLongitude = leftSample.longitude;
        if (stationStepMs !== undefined && leftSample.speed !== 0 && rightSample.speed !== 0 &&
            Math.sign(leftSample.speed) !== Math.sign(rightSample.speed)) {
          const station = refineRoot(t => readMotion(t).speed, leftMs, rightMs);
          if (station.status !== 'converged') throw new Error('Unexpected local station budget exhaustion.');
          // Sample both sides of a fractional speed zero. A finite-difference
          // speed's zero need not coincide with the longitude's true extremum.
          for (const knot of station.bracket) {
            if (knot <= segmentMs || knot >= rightMs) continue;
            const knotLongitude = read(knot);
            cell(segmentMs, segmentLongitude, knot, knotLongitude);
            segmentMs = knot;
            segmentLongitude = knotLongitude;
          }
        }
        cell(segmentMs, segmentLongitude, rightMs, rightSample.longitude);
        leftMs = rightMs;
        leftSample = rightSample;
      }
    }
    return events.sort((a, b) => a.atMs - b.atMs || a.longitude - b.longitude);
  });
}
export function searchLongitudeCrossings(context: EvaluationContext, body: EventBody,
  targetDegrees: number, options: LongitudeScanOptions,
  provider: LongitudeProvider = new EngineAdapter(context)): SearchResult<LongitudeCrossing> {
  longitude(targetDegrees);
  return scan(context, body, [targetDegrees], options, provider);
}
export function searchSignIngresses(context: EvaluationContext, body: EventBody,
  options: LongitudeScanOptions,
  provider: LongitudeProvider = new EngineAdapter(context)): SearchResult<SignIngress> {
  const result = scan(context, body, SIGNS.map((_, i) => i * 30), options, provider);
  if (result.status === 'refused') return result;
  return { ...result, events: result.events.map(event => {
    const above = event.longitude / 30;
    const below = (above + SIGNS.length - 1) % SIGNS.length;
    return { ...event, kind: 'sign-ingress' as const,
      fromSign: SIGNS[event.direction === 'direct' ? below : above]!,
      toSign: SIGNS[event.direction === 'direct' ? above : below]! };
  }) };
}
