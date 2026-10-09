export interface SolarTermDefinition {
 readonly longitude: number;
 readonly pinyin: string;
 readonly name: string;
 readonly kind: 'jie' | 'zhongqi';
}
export interface LongitudeEngine {
 readonly ENGINE_VERSION: string;
 readonly EPHEMERIS: string;
 searchLongitudeCrossings(body: 'Sun', longitude: number, from: Date, to: Date,
  options: {stepDays: number; maxSamples: number}):
  | {status: 'complete'; samples: number; crossings: {at: Date; retrograde: boolean}[]}
  | {status: 'refused'; reason: 'sample-budget'; samples: number; crossings: []};
}
interface SolarTermResultBase {
 schema: 'zodiacs.solar-terms.alpha.v1';
 year: number;
 window: {from: string; to: string; interval: '(from,to]'; clock: string};
 source: {engine: string; ephemeris: string};
 accuracy: {status: 'unvalidated'; independentEventSeconds: null};
 completeness: {status: 'unproven'; method: string};
 samples: number;
 maxSamples: number;
}
export type SolarTermResult =
 | (SolarTermResultBase & {status: 'computed'; terms: (SolarTermDefinition & {at: string})[]})
 | (SolarTermResultBase & {status: 'refused'; reason: 'sample-budget' | 'unexpected-solar-crossing-count' | 'non-distinct-solar-crossings'; longitude?: number; terms: []});
export const SOLAR_TERMS: readonly SolarTermDefinition[];
export function createSolarTermScanner(engine: LongitudeEngine):
 (year: number, options?: {maxSamples?: number}) => SolarTermResult;
