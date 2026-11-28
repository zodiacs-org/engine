import type { ASPECTS, HOUSE_SYSTEMS, PHASES, PLANETS, SIGNS, STATION_BODIES, TRADITIONAL_PLANETS } from './rule-schema.js';

export type Planet = typeof PLANETS[number];
export type HouseSystem = typeof HOUSE_SYSTEMS[number];
export type MajorAspect = typeof ASPECTS[number];
type Match = 'any' | 'all';
type Benefic = 'Venus' | 'Jupiter';

export interface Location {
  readonly latitude: number;
  readonly longitude: number;
}

export interface SyntheticNatal {
  readonly synthetic: true;
  readonly instant: string;
  readonly clock: 'utc';
  readonly location: Location;
  readonly houseSystem: HouseSystem;
}

export interface RuleOptions {
  'moon-not-void': { readonly bodies: 'traditional' | 'modern' };
  'direct-motion': { readonly bodies: readonly ('Mercury' | 'Venus')[] };
  'moon-sign': { readonly signs: readonly typeof SIGNS[number][] };
  'moon-phase': { readonly phases: readonly typeof PHASES[number][] };
  'planetary-hour': { readonly rulers: readonly typeof TRADITIONAL_PLANETS[number][]; readonly utcOffsetMinutes: number };
  'benefic-house': { readonly bodies: readonly Benefic[]; readonly houses: readonly number[]; readonly match: Match; readonly polarFallback: 'reject' | 'allow' };
  'benefic-angular': { readonly bodies: readonly Benefic[]; readonly angles: readonly ('ascendant' | 'midheaven' | 'descendant' | 'imum-coeli')[]; readonly maxOrbDegrees: number; readonly match: Match };
  'applying-aspect': { readonly body: Planet; readonly targets: readonly Planet[]; readonly aspects: readonly MajorAspect[]; readonly maxOrbDegrees: number; readonly match: Match };
  'avoid-eclipses': { readonly kinds: readonly ('solar' | 'lunar')[]; readonly withinDays: number };
  'avoid-stations': { readonly bodies: readonly typeof STATION_BODIES[number][]; readonly withinDays: number };
  'synastry-aspect': { readonly movingBodies: readonly Planet[]; readonly natalBodies: readonly Planet[]; readonly aspects: readonly MajorAspect[]; readonly maxOrbDegrees: number; readonly match: Match };
}

type RuleMode = { readonly mode: 'require'; readonly weight?: never }
  | { readonly mode: 'prefer'; readonly weight: number };
export type ElectionalRule = {
  [K in keyof RuleOptions]: { readonly id: string; readonly kind: K; readonly options: RuleOptions[K] } & RuleMode
}[keyof RuleOptions];

export interface RuleSet {
  readonly schemaVersion: 'electional/v1';
  readonly activity: string;
  readonly location: Location;
  readonly range: { readonly start: string; readonly end: string; readonly clock: 'utc' };
  readonly houseSystem: HouseSystem;
  readonly natal?: SyntheticNatal;
  readonly rules: readonly ElectionalRule[];
}
