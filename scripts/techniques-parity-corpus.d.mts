/** Types for techniques-parity-corpus.mjs, which the unit suite imports. */
export declare const SEED_TEXT: string;
export declare const BODIES: readonly string[];
export declare const PATTERN_BODIES: readonly string[];
export declare const SIGNS: readonly string[];
export declare const ZONES: readonly string[];
export declare const MIDNIGHT_CHANGES: readonly (readonly [string, string])[];
export declare function fnv1a(text: string): number;
export declare function mulberry32(seed: number): () => number;

export type CastPlace = null | "natal" | { latitude: number; longitude: number };
export interface ReturnsCorpus {
  RSI: { birth: number; near: number }[];
  RSM: { birth: number; at: number }[];
  RSC: {
    birth: number;
    latitude: number;
    longitude: number;
    houseSystem: "whole" | "placidus";
    near: number;
    cast: CastPlace;
    selection: "nearest" | "most-recent";
  }[];
  RLI: { birth: number; after: number }[];
  RLC: {
    birth: number;
    latitude: number;
    longitude: number;
    houseSystem: "whole" | "placidus";
    after: number;
    cast: Exclude<CastPlace, null>;
  }[];
  RE: {
    fn: "solarReturnInstant" | "mostRecentSolarReturnInstant" | "lunarReturnInstant" | "lunarReturnChart";
    birth: number;
    date: number;
    latitude?: number;
    longitude?: number;
  }[];
}
export declare function returnsCorpus(): ReturnsCorpus;

export interface CorpusPoint {
  body: string;
  lon: number;
}
export declare function compositeCorpus(): { a: CorpusPoint[]; b: CorpusPoint[] }[];

export declare function voidCorpus(): {
  VW: { from: number; to: number; bodies: "modern" | "traditional" }[];
  VS: { at: number; bodies: "modern" | "traditional" }[];
};

export interface CorpusEdge {
  a: string;
  b: string;
  type: string;
  orb: number;
  sourceId?: string;
}
export declare function patternCorpus(
  matchAspect: (aBody: string, aLon: number, bBody: string, bLon: number) => { type: string; orb: number } | null
): { points: CorpusPoint[]; edges: CorpusEdge[] }[];

export interface ChartLike {
  input: { utc: Date; latitude?: number; longitude?: number; houseSystem: string; timeKnown: boolean };
  bodies: readonly { body: string; lon: number; lat: number; speed: number; retrograde: boolean }[];
  angles: { asc: number; mc: number; dsc: number; ic: number } | null;
  houses: { system: string; cusps: readonly number[] } | null;
  aspects: readonly { a: string; b: string; type: string; orb: number; applying: boolean }[];
  flags: readonly string[];
  deltaT?: { seconds: number };
}
export declare function chartProjection(chart: ChartLike): Record<string, unknown>;

export declare function dignityCorpus(): { planet: string; sign: string }[];

export declare function moonSignCorpus(): {
  MA: string[];
  MZ: { date: string; timeZone: string }[];
  MP: { date: string; timeZone: string }[];
};
