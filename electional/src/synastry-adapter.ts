import type { ChartRuntime } from './chart-adapter.js';
import type { MajorAspect, Planet } from './rule-types.js';

export interface InterAspectDefinition {
  readonly type: MajorAspect;
  readonly angle: number;
  readonly orb: number;
  readonly luminaryOrb: number;
}
export interface InterAspect {
  readonly a: string;
  readonly aLon: number;
  readonly b: string;
  readonly bLon: number;
  readonly type: MajorAspect;
  readonly orb: number;
}
/** The same helper used by native synastry and transits, without recasting charts. */
export interface SynastryRuntime extends ChartRuntime {
  readonly INTER_ASPECT_DEFINITIONS: readonly InterAspectDefinition[];
  findInterAspects(first: readonly { body: Planet; lon: number }[],
    second: readonly { body: Planet; lon: number }[]): readonly InterAspect[];
}
export async function loadSynastryRuntime(): Promise<SynastryRuntime> {
  const runtime = await import(new URL('../generated/engine.mjs', import.meta.url).href) as SynastryRuntime;
  if (typeof runtime.calc !== 'function' || typeof runtime.chart !== 'function'
    || typeof runtime.findInterAspects !== 'function' || !Array.isArray(runtime.INTER_ASPECT_DEFINITIONS)) {
    throw new TypeError('Incompatible synastry bridge.');
  }
  return runtime;
}
