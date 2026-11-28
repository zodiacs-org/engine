import { AdapterRefused, WorkContext, frozenCopy, instantMs } from './adapter-contract.js';
import type { EngineReceipt } from './adapter-contract.js';
import { EngineAdapter, loadEngineRuntime } from './engine-adapter.js';
import type { EngineRuntime } from './engine-adapter.js';
import { TRADITIONAL_PLANETS } from './rule-schema.js';
import type { Location } from './rule-types.js';

type Ruler = typeof TRADITIONAL_PLANETS[number];
export interface NativePlanetaryHour {
  readonly number: number;
  readonly period: 'day' | 'night';
  readonly ruler: Ruler;
  readonly start: Date;
  readonly end: Date;
}
export interface NativePlanetaryDay {
  readonly date: string;
  readonly utcOffsetMinutes: number;
  readonly weekday: number;
  readonly ruler: Ruler;
  readonly conventions: { readonly limb: 'upper'; readonly refraction: 'standard'; readonly refractionArcmin: 34 };
  readonly flags: readonly ('never-rises' | 'never-sets' | 'outside-reference-span')[];
  readonly samples: number;
  readonly status: 'complete' | 'no-sunrise' | 'no-sunset' | 'no-next-sunrise' | 'refused';
  readonly reason?: 'sample-budget';
  readonly sunrise: Date | null;
  readonly sunset: Date | null;
  readonly nextSunrise: Date | null;
  readonly hours: readonly NativePlanetaryHour[];
}
/** The UTC-only sky API is kept distinct from calc's explicitly scaled API. */
export interface SkyRuntime extends EngineRuntime {
  planetaryHours(observer: Location, date: string, options: {
    utcOffsetMinutes: number; limb: 'upper'; refraction: 'standard'; maxSamples: number;
  }): NativePlanetaryDay;
}
export async function loadSkyRuntime(): Promise<SkyRuntime> {
  const runtime = await loadEngineRuntime();
  if (typeof (runtime as SkyRuntime).planetaryHours !== 'function') throw new TypeError('Incompatible local sky bridge.');
  return runtime as SkyRuntime;
}
export interface PlanetaryDayAudit {
  readonly date: string;
  readonly utcOffsetMinutes: number;
  readonly weekday: number;
  readonly ruler: Ruler;
  readonly conventions: NativePlanetaryDay['conventions'];
  readonly flags: NativePlanetaryDay['flags'];
  readonly samples: number;
  readonly status: NativePlanetaryDay['status'];
  readonly reason?: 'sample-budget';
  readonly sunriseMs: number | null;
  readonly sunsetMs: number | null;
  readonly nextSunriseMs: number | null;
  readonly hours: readonly { readonly number: number; readonly period: 'day' | 'night';
    readonly ruler: Ruler; readonly startMs: number; readonly endMs: number }[];
  readonly clock: 'utc';
  readonly observer: Location;
  readonly sourceWindow: { readonly startMs: number; readonly endMs: number; readonly clock: 'utc' };
  readonly receiptScope: 'scan-endpoint-calc-provenance;sky-api-has-no-native-receipt';
  readonly receipts: readonly EngineReceipt[];
}

const DAY = 86_400_000, HOUR = 3_600_000;
export const SOLAR_DAY_LOOKBACK_DAYS = 2;

function time(date: Date | null): number | null {
  if (date === null) return null;
  if (!(date instanceof Date)) throw new TypeError('Expected native sky Date.');
  const ms = date.getTime(); instantMs(ms); return ms;
}

/** Validate source durations, then detach Dates into integer UTC labels. */
function auditDay(native: NativePlanetaryDay, date: string, offset: number,
  startMs: number, observer: Location, receipts: readonly EngineReceipt[], allowance: number): PlanetaryDayAudit {
  if (!native || native.date !== date || native.utcOffsetMinutes !== offset
    || native.weekday !== new Date(`${date}T00:00:00Z`).getUTCDay()
    || !TRADITIONAL_PLANETS.includes(native.ruler)
    || native.conventions?.limb !== 'upper' || native.conventions.refraction !== 'standard'
    || native.conventions.refractionArcmin !== 34
    || !Array.isArray(native.flags) || native.flags.some(flag => !['never-rises', 'never-sets', 'outside-reference-span'].includes(flag))
    || !Number.isSafeInteger(native.samples) || native.samples < 0 || native.samples > allowance
    || (native.samples === 0 && native.status !== 'refused')
    || !['complete', 'no-sunrise', 'no-sunset', 'no-next-sunrise', 'refused'].includes(native.status)
    || !Array.isArray(native.hours)) throw new TypeError('Invalid native planetary day.');
  const sunriseMs = time(native.sunrise), sunsetMs = time(native.sunset), nextSunriseMs = time(native.nextSunrise);
  const hours = native.hours.map(hour => ({ number: hour.number, period: hour.period,
    ruler: hour.ruler, startMs: time(hour.start)!, endMs: time(hour.end)! }));
  if (native.status === 'complete') {
    if (native.reason !== undefined || sunriseMs === null || sunsetMs === null || nextSunriseMs === null
      || sunriseMs < startMs || sunriseMs >= startMs + DAY || sunsetMs <= sunriseMs
      || nextSunriseMs <= sunsetMs || nextSunriseMs >= startMs + 3 * DAY || hours.length !== 24
      || native.flags.includes('never-rises') || native.flags.includes('never-sets')) {
      throw new TypeError('Invalid complete planetary day.');
    }
    for (let i = 0; i < hours.length; i++) {
      const hour = hours[i]!;
      if (hour.number !== i + 1 || hour.period !== (i < 12 ? 'day' : 'night')
        || !TRADITIONAL_PLANETS.includes(hour.ruler) || hour.startMs === null || hour.endMs === null
        || hour.startMs >= hour.endMs || (i > 0 && hour.startMs !== hours[i - 1]!.endMs)) {
        throw new TypeError('Invalid planetary-hour partition.');
      }
    }
    if (hours[0]!.startMs !== sunriseMs || hours[0]!.ruler !== native.ruler
      || hours[11]!.endMs !== sunsetMs || hours[23]!.endMs !== nextSunriseMs) {
      throw new TypeError('Inconsistent planetary-hour marks.');
    }
  } else if (sunriseMs !== null || sunsetMs !== null || nextSunriseMs !== null || hours.length
    || (native.status === 'refused' ? native.reason !== 'sample-budget' : native.reason !== undefined)) {
    throw new TypeError('Invalid empty planetary day.');
  }
  return frozenCopy({ date, utcOffsetMinutes: offset, weekday: native.weekday, ruler: native.ruler,
    conventions: native.conventions, flags: native.flags, samples: native.samples, status: native.status,
    ...(native.reason === undefined ? {} : { reason: native.reason }), sunriseMs, sunsetMs, nextSunriseMs, hours,
    clock: 'utc', observer, sourceWindow: { startMs, endMs: startMs + 3 * DAY, clock: 'utc' },
    receiptScope: 'scan-endpoint-calc-provenance;sky-api-has-no-native-receipt', receipts });
}

/** Native sky sample allowances are shared across days, separately from request accounting. */
export class SkyAdapter {
  #samples = 0;
  #days: PlanetaryDayAudit[] = [];
  constructor(readonly context: WorkContext, readonly runtime: SkyRuntime, readonly maxSamples: number) {
    if (context.window.clock !== 'utc') throw new RangeError('The sky API requires UTC input.');
    if (!Number.isSafeInteger(maxSamples) || maxSamples < 1) throw new RangeError('Expected a positive sky sample budget.');
  }
  get samples(): number { return this.#samples; }
  get days(): readonly PlanetaryDayAudit[] { return Object.freeze([...this.#days]); }
  day(observer: Location, date: string, utcOffsetMinutes: number, startMs: number): PlanetaryDayAudit | null {
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(date) || !Number.isFinite(utcOffsetMinutes)
      || Math.abs(utcOffsetMinutes) > 1080 || !Number.isSafeInteger(utcOffsetMinutes * 60_000)
      || Date.parse(`${date}T00:00:00Z`) - utcOffsetMinutes * 60_000 !== startMs
      || !observer || Object.keys(observer).some(key => !['latitude', 'longitude'].includes(key))
      || !Number.isFinite(observer.latitude) || Math.abs(observer.latitude) > 90
      || !Number.isFinite(observer.longitude) || Math.abs(observer.longitude) > 180) {
      throw new RangeError('Expected a resolved calendar day, fixed offset and location.');
    }
    this.context.checkpoint();
    if (this.#samples >= this.maxSamples) return null;
    const engine = new EngineAdapter(this.context, this.runtime);
    // Native sky searches include an hour on either side of the three-day scan.
    // calc refuses unsupported coverage and provides native provenance for those
    // endpoints. These are not receipts of the intervening sky samples.
    const receipts = [engine.position('Sun', startMs - HOUR).receipt,
      engine.position('Sun', startMs + 3 * DAY + HOUR).receipt];
    const allowance = this.maxSamples - this.#samples;
    return this.context.evaluate(startMs, () => {
      const native = this.runtime.planetaryHours(observer, date, {
        utcOffsetMinutes, limb: 'upper', refraction: 'standard', maxSamples: allowance });
      const day = auditDay(native, date, utcOffsetMinutes, startMs, observer, receipts, allowance);
      this.#samples += day.samples;
      this.#days.push(day);
      if (day.flags.includes('outside-reference-span')) throw new AdapterRefused('engine-refused', 'sky-outside-reference-span');
      return day;
    });
  }
}
