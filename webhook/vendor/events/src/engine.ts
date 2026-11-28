import { calc } from '../../../../src/calc.js';
import type { CalcInstant, CalcRefusal } from '../../../../src/calc.js';
import { EvaluationContext, validateInstant } from './context.js';

export const EVENT_BODIES = Object.freeze([
  'Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto'
] as const);
export type EventBody = typeof EVENT_BODIES[number];
export const COORDINATES = Object.freeze({
  center: 'geocentric', frame: 'ecliptic-true-of-date', zodiac: 'tropical',
  correction: 'apparent', units: 'degrees'
} as const);

export class EngineRefused extends Error {
  constructor(readonly refusal: CalcRefusal) {
    super(refusal.detail);
    this.name = 'EngineRefused';
  }
}

export interface LongitudeSample {
  readonly atMs: number;
  readonly longitude: number;
  readonly speedDegreesPerDay: number | null;
  readonly instant: CalcInstant;
}

/** Relative-source adapter. Each call charges one calc request, not its internal samples. */
export class EngineAdapter {
  constructor(readonly context: EvaluationContext) {}

  sample(body: EventBody, atMs: number, withSpeed = false): LongitudeSample {
    validateInstant(atMs);
    if (!EVENT_BODIES.includes(body)) throw new RangeError('Unsupported event body.');
    if (typeof withSpeed !== 'boolean') throw new TypeError('withSpeed must be boolean.');
    const { startMs, endMs, clock } = this.context.window;
    if (atMs < startMs || atMs > endMs) throw new RangeError('Sample is outside the search window.');
    return this.context.evaluate(() => {
      const position = calc({
        body,
        time: clock === 'utc' ? new Date(atMs) : { jd: atMs / 86_400_000 + 2_440_587.5, scale: clock },
        center: COORDINATES.center, frame: COORDINATES.frame, zodiac: COORDINATES.zodiac,
        flags: { correction: COORDINATES.correction, units: COORDINATES.units, speeds: withSpeed }
      });
      if (position.status === 'refused') throw new EngineRefused(position);
      const instant = position.receipt.instants[0];
      if (!instant || !Number.isFinite(position.lon) || position.lon < 0 || position.lon >= 360 ||
          (withSpeed && !Number.isFinite(position.speeds?.lon))) {
        throw new RangeError('Engine returned an invalid longitude sample.');
      }
      return { atMs, longitude: position.lon, speedDegreesPerDay: position.speeds?.lon ?? null, instant };
    });
  }
}
