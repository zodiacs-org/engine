import { EvaluationContext, SearchInterrupted } from './context.js';
import { EngineAdapter, EVENT_BODIES } from './engine.js';
import type { EventBody } from './engine.js';
import { searchSignIngresses, snapshotLongitudeOptions, SIGNS } from './longitude.js';
import type { LongitudeProvider, LongitudeScanOptions, Sign } from './longitude.js';
import { refineRoot } from './root.js';
import type { Clock, SearchResult } from './types.js';

export interface MotionProvider extends LongitudeProvider {
  sample(body: EventBody, atMs: number, withSpeed?: boolean): {
    readonly longitude: number; readonly speedDegreesPerDay: number | null;
  };
}
export interface StationOptions extends Pick<LongitudeScanOptions, 'stepMs' | 'stationStepMs'> {}
export interface RetrogradeOptions extends StationOptions { readonly sign?: Sign }
export interface Station {
  readonly kind: 'station'; readonly body: EventBody; readonly atMs: number;
  readonly clock: Clock; readonly direction: 'direct' | 'retrograde';
  readonly longitude: number; readonly bracket: readonly [number, number];
  readonly residualDegreesPerDay: number;
}
export interface RetrogradeInterval {
  readonly kind: 'retrograde'; readonly body: EventBody; readonly clock: Clock;
  readonly startMs: number; readonly endMs: number;
  readonly clippedStart: boolean; readonly clippedEnd: boolean;
  readonly signSpans: readonly { readonly sign: Sign; readonly startMs: number; readonly endMs: number }[];
}
function validate(context: EvaluationContext, body: EventBody, options: RetrogradeOptions,
  provider: MotionProvider, allowSign: boolean): RetrogradeOptions {
  if (!EVENT_BODIES.includes(body) || !options ||
      Object.keys(options).some(k => !['stepMs', 'stationStepMs', ...(allowSign ? ['sign'] : [])].includes(k)) ||
      (options.sign !== undefined && !SIGNS.includes(options.sign))) {
    throw new RangeError('Invalid body, sampling step or sign.');
  }
  const { stepMs, stationStepMs } = snapshotLongitudeOptions({ stepMs: options.stepMs,
    ...(options.stationStepMs === undefined ? {} : { stationStepMs: options.stationStepMs }) });
  if (provider.context !== context) throw new TypeError('Provider must share the search context.');
  return Object.freeze({ stepMs, ...(stationStepMs === undefined ? {} : { stationStepMs }),
    ...(options.sign === undefined ? {} : { sign: options.sign }) });
}
function read(provider: MotionProvider, body: EventBody, t: number) {
  const sample = provider.sample(body, t, true);
  if (!Number.isFinite(sample.longitude) || sample.longitude < 0 || sample.longitude >= 360 ||
      sample.speedDegreesPerDay === null || !Number.isFinite(sample.speedDegreesPerDay)) {
    throw new RangeError('A finite longitude and speed are required.');
  }
  return { longitude: sample.longitude, speed: sample.speedDegreesPerDay };
}
function scan(context: EvaluationContext, body: EventBody, step: number, provider: MotionProvider): Station[] {
  const stations: Station[] = [];
  let t = context.window.startMs;
  let left = read(provider, body, t).speed;
  let priorSign = Math.sign(left);
  let zeroMs: number | undefined = left === 0 ? t : undefined;
  while (t < context.window.endMs) {
    context.checkpoint();
    const next = t + Math.min(step, context.window.endMs - t);
    const right = read(provider, body, next).speed;
    if (left === 0 && right === 0) throw new RangeError('Unresolved zero-speed plateau; reduce stepMs or change window.');
    let bracket: readonly [number, number] | undefined;
    if (right === 0) zeroMs = next;
    else if (left === 0) {
      if (priorSign !== 0 && priorSign !== Math.sign(right)) bracket = [zeroMs!, zeroMs!];
      zeroMs = undefined;
    } else if (Math.sign(left) !== Math.sign(right)) bracket = [t, next];
    if (bracket) {
      const root = refineRoot(x => read(provider, body, x).speed, bracket[0], bracket[1]);
      if (root.status !== 'converged') throw new Error('Unexpected root budget exhaustion.');
      const atMs = root.atMs === t && root.bracket[1] > t ? root.bracket[1] : root.atMs;
      const sample = read(provider, body, atMs);
      if (context.owns(atMs)) stations.push({ kind: 'station', body, atMs, clock: context.window.clock,
        direction: right < 0 ? 'retrograde' : 'direct', longitude: sample.longitude,
        bracket: root.bracket, residualDegreesPerDay: sample.speed });
    }
    if (right !== 0) priorSign = Math.sign(right);
    t = next;
    left = right;
  }
  // An end-window zero lacks an outgoing sign, so cannot establish a station.
  return stations;
}
export function searchStations(context: EvaluationContext, body: EventBody, options: StationOptions,
  provider: MotionProvider = new EngineAdapter(context)): SearchResult<Station> {
  const { stepMs, stationStepMs } = validate(context, body, options, provider, false);
  const step = stationStepMs ?? stepMs;
  return context.search(() => scan(context, body, step, provider));
}
export function searchRetrogradeIntervals(context: EvaluationContext, body: EventBody, options: RetrogradeOptions,
  provider: MotionProvider = new EngineAdapter(context)): SearchResult<RetrogradeInterval> {
  const { stepMs, stationStepMs, sign } = validate(context, body, options, provider, true);
  const stationStep = stationStepMs ?? stepMs;
  const ingressOptions = { stepMs, ...(stationStepMs === undefined ? {} : { stationStepMs }) };
  return context.search(() => {
    const stations = scan(context, body, stationStep, provider);
    const ingressResult = searchSignIngresses(context, body, ingressOptions, provider);
    if (ingressResult.status === 'refused') throw new SearchInterrupted(ingressResult.reason);
    const { startMs, endMs, clock } = context.window;
    const initial = read(provider, body, startMs);
    const initialSpeed = initial.speed === 0
      ? read(provider, body, startMs + Math.min(stationStep, endMs - startMs)).speed : initial.speed;
    let start: number | undefined = initialSpeed < 0 ? startMs : undefined;
    let clippedStart = start !== undefined;
    const intervals: RetrogradeInterval[] = [];
    const emit = (end: number, clippedEnd: boolean) => {
      if (start === undefined || end <= start) return;
      const signSpans: { sign: Sign; startMs: number; endMs: number }[] = [];
      let spanStart = start;
      const startingLongitude = read(provider, body, start).longitude;
      let current = SIGNS[Math.floor(startingLongitude / 30)]!;
      // At an exact ingress the subsequent retrograde segment owns the lower sign.
      if (startingLongitude % 30 === 0) current = SIGNS[(Math.floor(startingLongitude / 30) + 11) % 12]!;
      for (const ingress of ingressResult.events) {
        if (ingress.atMs <= start || ingress.atMs >= end) continue;
        signSpans.push({ sign: current, startMs: spanStart, endMs: ingress.atMs });
        spanStart = ingress.atMs;
        current = ingress.toSign;
      }
      signSpans.push({ sign: current, startMs: spanStart, endMs: end });
      if (sign === undefined || signSpans.some(span => span.sign === sign)) intervals.push({
        kind: 'retrograde', body, clock, startMs: start, endMs: end, clippedStart, clippedEnd, signSpans });
    };
    for (const station of stations) {
      if (station.direction === 'retrograde') { start = station.atMs; clippedStart = false; }
      else { emit(station.atMs, false); start = undefined; }
    }
    emit(endMs, true);
    return intervals;
  });
}
