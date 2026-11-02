import { calc } from '../../src/calc.js';
import type { CalcInstant, CalcRefusal } from '../../src/calc.js';
import { onChartClock, SPEED_STEP_DAYS } from '../../src/ephemeris.js';
import { eclipticOfDate } from '../../src/frame.js';
import { elapsedDays } from '../../src/time-scale.js';
import { GeoMoon, GeoVector } from 'astronomy-engine';
import type { Body } from 'astronomy-engine';
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

const DAY_MS = 86_400_000;
const J2000_MS = 946_728_000_000;

/** The parent's apparent longitude difference, without unused derivative outputs. */
function longitudeSpeed(body: EventBody, atMs: number, clock: EvaluationContext['window']['clock']): number {
  // Preserve calc's Julian-date input conversion before shifting either sample.
  const ms = clock === 'utc' ? atMs
    : J2000_MS + ((atMs / DAY_MS + 2_440_587.5) - 2_451_545) * DAY_MS;
  const shifted = (days: number) => onChartClock(ms + days * DAY_MS, clock, undefined, (at, basis) => {
    const vector = body === 'Moon' ? GeoMoon(at) : GeoVector(body as Body, at, true);
    return { longitude: eclipticOfDate(vector.x, vector.y, vector.z, at.tt).lon, basis };
  });
  const before = shifted(-SPEED_STEP_DAYS);
  const after = shifted(SPEED_STEP_DAYS);
  let turn = after.longitude - before.longitude;
  if (turn > 180) turn -= 360;
  if (turn < -180) turn += 360;
  return turn / elapsedDays(before.basis, after.basis, 2 * SPEED_STEP_DAYS);
}

/** Relative-source adapter. Each call charges one calc request, not its internal samples. */
export class EngineAdapter {
  constructor(readonly context: EvaluationContext) {}

  sample(body: EventBody, atMs: number, withSpeed = false): LongitudeSample {
    validateInstant(atMs);
    const bodyIndex = EVENT_BODIES.indexOf(body);
    if (bodyIndex < 0) throw new RangeError('Unsupported event body.');
    if (typeof withSpeed !== 'boolean') throw new TypeError('withSpeed must be boolean.');
    const { startMs, endMs, clock } = this.context.window;
    if (atMs < startMs || atMs > endMs) throw new RangeError('Sample is outside the search window.');
    return this.context.evaluate(() => {
      const position = calc({
        body,
        time: clock === 'utc' ? new Date(atMs) : { jd: atMs / 86_400_000 + 2_440_587.5, scale: clock },
        center: COORDINATES.center, frame: COORDINATES.frame, zodiac: COORDINATES.zodiac,
        flags: { correction: COORDINATES.correction, units: COORDINATES.units, speeds: false }
      });
      if (position.status === 'refused') throw new EngineRefused(position);
      const instant = position.receipt.instants[0];
      const speedDegreesPerDay = withSpeed ? longitudeSpeed(body, atMs, clock) : null;
      if (!instant || !Number.isFinite(position.lon) || position.lon < 0 || position.lon >= 360 ||
          (withSpeed && !Number.isFinite(speedDegreesPerDay))) {
        throw new RangeError('Engine returned an invalid longitude sample.');
      }
      return { atMs, longitude: position.lon, speedDegreesPerDay, instant };
    });
  }
}
