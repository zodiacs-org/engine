import { AdapterRefused, frozenCopy } from './adapter-contract.js';
import type { EngineReceipt, Json, WorkContext } from './adapter-contract.js';
import type { HouseSystem, Location, MajorAspect } from './rule-types.js';
import type { EngineRuntime } from './engine-adapter.js';

export interface NativeChart {
  readonly bodies: readonly { body: string; lon: number; speed: number }[];
  readonly angles: { asc: number; mc: number; dsc: number; ic: number } | null;
  readonly houses: { system: HouseSystem; cusps: readonly number[] } | null;
  readonly flags: readonly string[];
}
export interface NativeHousePartition {
  readonly schema: string;
  readonly start: Date;
  readonly end: Date;
  readonly houseSystem: HouseSystem;
  readonly engineVersion: string;
  readonly verification: string;
  readonly flags: readonly string[];
  readonly cells: readonly { start: Date; end: Date; features: {
    houseSystem: HouseSystem; houses: Readonly<Record<string, number | null>>;
  } }[];
  readonly unresolved: readonly { start: Date; end: Date }[];
}
export interface AspectAnalysis {
  readonly policy: unknown;
  readonly aspects: readonly { a: string; b: string; type: string; applying: boolean; motion: string; orb: number }[];
}
export interface ChartRuntime extends EngineRuntime {
  chart(request: { time: Date | { jd: number; scale: 'tt' | 'ut1' }; place: Location;
    houseSystem: HouseSystem; timeKnown: true; zodiac: 'tropical' }):
    { status: 'ok'; chart: NativeChart; receipt: EngineReceipt }
    | { status: 'refused'; readonly [key: string]: Json };
  birthWindow(request: { start: Date; end: Date; latitude: number; longitude: number; houseSystem: HouseSystem }): NativeHousePartition;
  separation(a: number, b: number): number;
  houseOf(longitude: number, cusps: readonly number[]): number;
  createAspectPolicy(request: { bodies: readonly string[]; stationaryRelativeSpeed: number;
    aspects: readonly { type: MajorAspect | 'conjunction'; orb: number }[] }): unknown;
  findConfiguredAspects(positions: readonly { body: string; lon: number; speed: number }[], policy: unknown): AspectAnalysis;
}
export async function loadChartRuntime(): Promise<ChartRuntime> {
  const runtime = await import(new URL('../generated/engine.mjs', import.meta.url).href) as ChartRuntime;
  for (const name of ['chart', 'birthWindow', 'houseOf', 'separation', 'createAspectPolicy', 'findConfiguredAspects'] as const) {
    if (typeof runtime[name] !== 'function') throw new TypeError('Incompatible chart bridge.');
  }
  return runtime;
}
const longitude = (x: number): boolean => Number.isFinite(x) && x >= 0 && x < 360;
export class ChartAdapter {
  constructor(readonly context: WorkContext, readonly runtime: ChartRuntime,
    readonly location: Location, readonly houseSystem: HouseSystem) {}
  sample(atMs: number): { readonly chart: NativeChart; readonly receipt: EngineReceipt } {
    return this.context.evaluate(atMs, () => {
      const clock = this.context.window.clock;
      const result = this.runtime.chart({ time: clock === 'utc' ? new Date(atMs)
        : { jd: atMs / 86_400_000 + 2_440_587.5, scale: clock }, place: this.location,
        houseSystem: this.houseSystem, timeKnown: true, zodiac: 'tropical' });
      if (result.status === 'refused') throw new AdapterRefused('engine-refused', frozenCopy(result));
      const { chart, receipt } = result;
      if (!chart || !chart.angles || !Object.values(chart.angles).every(longitude)
        || !chart.houses || chart.houses.cusps.length !== 12 || !Array.from(chart.houses.cusps).every(longitude)
        || !Array.isArray(chart.bodies) || !chart.bodies.every(b => longitude(b.lon) && Number.isFinite(b.speed))
        || !Array.isArray(chart.flags) || !receipt?.schema || !receipt.engine?.ephemeris || !receipt.instants?.[0]) {
        throw new TypeError('Invalid native chart or receipt.');
      }
      this.context.record(receipt);
      return frozenCopy({ chart, receipt });
    });
  }
}
