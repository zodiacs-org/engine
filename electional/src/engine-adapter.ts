import { PLANETS } from './rule-schema.js';
import type { Planet } from './rule-types.js';
import { AdapterRefused, frozenCopy } from './adapter-contract.js';
import type { EngineReceipt, Json, WorkContext } from './adapter-contract.js';

export interface Position {
  readonly atMs: number;
  readonly clock: WorkContext['window']['clock'];
  readonly longitude: number;
  readonly latitude: number;
  readonly speedDegreesPerDay: number | null;
  readonly instant: Json;
  readonly bounds: Json;
  readonly receipt: EngineReceipt;
}
/** A narrow structural boundary; the native receipt and refusal are retained whole. */
export interface EngineRuntime {
  calc(request: {
    body: Planet;
    time: Date | { jd: number; scale: 'tt' | 'ut1' };
    center: 'geocentric'; frame: 'ecliptic-true-of-date'; zodiac: 'tropical';
    flags: { correction: 'apparent'; units: 'degrees'; speeds: boolean; cartesian?: true };
  }): { status: 'ok'; lon: number; lat: number; speeds: { lon: number } | null;
        cartesian?: { readonly x: number; readonly y: number; readonly z: number } | null;
        bounds: Json; receipt: EngineReceipt }
    | { status: 'refused'; reason: string; detail: string; readonly [key: string]: Json };
}

/** Build the local bridge first. This import never reads dist/ or installs dependencies. */
export async function loadEngineRuntime(): Promise<EngineRuntime> {
  const runtime: unknown = await import(new URL('../generated/engine.mjs', import.meta.url).href);
  if (!runtime || typeof (runtime as EngineRuntime).calc !== 'function') {
    throw new TypeError('Incompatible local engine bridge.');
  }
  return runtime as EngineRuntime;
}

export class EngineAdapter {
  constructor(readonly context: WorkContext, readonly runtime: EngineRuntime) {}
  /** Native Cartesian au, on the same geocentric true-of-date frame as positions. */
  vector(body: 'Sun' | 'Moon', atMs: number): readonly [number, number, number] {
    if (body !== 'Sun' && body !== 'Moon') throw new RangeError('Expected Sun or Moon vector.');
    return this.context.evaluate(atMs, () => {
      const clock = this.context.window.clock;
      const native = this.runtime.calc({ body,
        time: clock === 'utc' ? new Date(atMs) : { jd: atMs / 86_400_000 + 2_440_587.5, scale: clock },
        center: 'geocentric', frame: 'ecliptic-true-of-date', zodiac: 'tropical',
        flags: { correction: 'apparent', units: 'degrees', speeds: false, cartesian: true } });
      if (native.status === 'refused') throw new AdapterRefused('engine-refused', frozenCopy(native));
      const receipt = native.receipt, v = native.cartesian;
      if (!receipt?.schema || !receipt.engine?.ephemeris || !receipt.instants?.[0]
        || !v || ![v.x, v.y, v.z].every(Number.isFinite)
        || !Number.isFinite(Math.hypot(v.x, v.y, v.z)) || Math.hypot(v.x, v.y, v.z) === 0) {
        throw new TypeError('Invalid native engine vector.');
      }
      this.context.record(receipt);
      return Object.freeze([v.x, v.y, v.z]);
    });
  }
  position(body: Planet, atMs: number, withSpeed = false): Position {
    if (!PLANETS.includes(body) || typeof withSpeed !== 'boolean') {
      throw new RangeError('Unsupported position request.');
    }
    return this.context.evaluate(atMs, () => {
      const clock = this.context.window.clock;
      const native = this.runtime.calc({ body,
        time: clock === 'utc' ? new Date(atMs) : { jd: atMs / 86_400_000 + 2_440_587.5, scale: clock },
        center: 'geocentric', frame: 'ecliptic-true-of-date', zodiac: 'tropical',
        flags: { correction: 'apparent', units: 'degrees', speeds: withSpeed } });
      if (native.status === 'refused') throw new AdapterRefused('engine-refused', frozenCopy(native));
      const receipt = native.receipt;
      if (!receipt?.schema || !receipt.engine?.ephemeris || !receipt.instants?.[0]
        || !Number.isFinite(native.lon) || native.lon < 0 || native.lon >= 360
        || !Number.isFinite(native.lat) || (withSpeed && !Number.isFinite(native.speeds?.lon))) {
        throw new TypeError('Invalid native engine position.');
      }
      this.context.record(receipt);
      return frozenCopy({ atMs, clock, longitude: native.lon, latitude: native.lat,
        speedDegreesPerDay: native.speeds?.lon ?? null, instant: receipt.instants[0],
        bounds: native.bounds, receipt });
    });
  }
}
