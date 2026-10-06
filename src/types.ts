/** Public, serializable vocabulary shared by the chart APIs. */

import type { DeltaT } from "./deltat.js";
import type { TimeScale, TimeScaleName } from "./time-scale.js";
export type { DeltaT, DeltaTSegment } from "./deltat.js";
export type { LeapSeconds, TimeScale, TimeScaleName, Ut1MinusUtc } from "./time-scale.js";

export type DateInput = Date | string | number;

export type ZodiacSign =
  | "aries"
  | "taurus"
  | "gemini"
  | "cancer"
  | "leo"
  | "virgo"
  | "libra"
  | "scorpio"
  | "sagittarius"
  | "capricorn"
  | "aquarius"
  | "pisces";

export type Element = "fire" | "earth" | "air" | "water";
export type Modality = "cardinal" | "fixed" | "mutable";
export type Polarity = "day" | "night";
export type HouseNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

export interface SignDefinition {
  readonly slug: ZodiacSign;
  readonly name: string;
  readonly element: Element;
  readonly modality: Modality;
  readonly polarity: Polarity;
  readonly naturalHouse: HouseNumber;
}

export type BodyName =
  | "Sun"
  | "Moon"
  | "Mercury"
  | "Venus"
  | "Mars"
  | "Jupiter"
  | "Saturn"
  | "Uranus"
  | "Neptune"
  | "Pluto"
  | "North Node"
  | "South Node";

export type HouseSystem =
  | "whole"
  | "placidus"
  | "porphyry"
  | "equal"
  | "equal-mc"
  | "vehlow"
  | "koch"
  | "regiomontanus"
  | "campanus"
  | "topocentric"
  | "alcabitius"
  | "morinus"
  | "meridian";
export type ChartFlag =
  | "dst-gap"
  | "dst-fold"
  | "lmt"
  | "no-time"
  | "polar-fallback"
  | "outside-reference-span";

/**
 * A resolved birth instant. Use `resolveBirth` from `@zodiacs/engine/geo`
 * when starting from a local wall time and IANA timezone.
 */
export interface BirthInput {
  /**
   * The instant, on the scale `timeScale` names: UTC by default, and UT1 or
   * TT when `timeScale` says so. The field keeps its name on every scale,
   * because receipts record it under that name (docs/time.md).
   */
  utc: DateInput;
  /** "utc" (default), "ut1" or "tt" (docs/time.md). */
  timeScale?: TimeScaleName;
  latitude?: number;
  longitude?: number;
  houseSystem?: HouseSystem;
  /** False means `utc` is a caller-supplied reference instant and suppresses angles/houses.
   * It does not establish a UTC-noon or local-noon convention by itself. */
  timeKnown?: boolean;
  /** Up to 64 known flags. Duplicate claims normalize to one value. Time flags
   * are caller assertions; no-time/polar-fallback echoes must match calculation.
   * natalChart returns canonical semantic flags, not the raw submitted array. */
  flags?: readonly ChartFlag[];
  /**
   * Fix ΔT (TT − UT1) at this many seconds instead of the engine's time
   * basis; UT1 still comes from the instant. The chart then reports
   * `deltaT.model` "pinned". Finite, at most 1e10 in size.
   */
  deltaT?: number;
}

export interface ChartInput {
  /** The instant as given, on the scale `timeScale` names (UTC when it is absent), as BirthInput.utc. */
  utc: Date;
  /** Present when the instant is not UTC. */
  timeScale?: Exclude<TimeScaleName, "utc">;
  /** A caller's fixed ΔT in seconds; the engine's model when absent. */
  deltaT?: number;
  latitude?: number;
  longitude?: number;
  houseSystem: HouseSystem;
  timeKnown: boolean;
  flags?: readonly ChartFlag[];
}

export interface BodyPosition {
  body: BodyName;
  /** Tropical ecliptic longitude of date, degrees in [0, 360). */
  lon: number;
  /** Ecliptic latitude, degrees (zero for the Moon nodes). */
  lat: number;
  /**
   * Longitude speed in degrees/day, the derivative of `lon` over plus/minus
   * 0.001 day (the nodes: plus/minus 0.25 day); negative means retrograde.
   */
  speed: number;
  retrograde: boolean;
  sign: ZodiacSign;
  /** Longitude inside `sign`, degrees in [0, 30). */
  degree: number;
}

/** A chart point that is not a body; see `chartPoints`. */
export type PointName =
  | "Mean Node"
  | "Mean South Node"
  | "Black Moon Lilith"
  | "Vertex"
  | "East Point"
  | "Lot of Fortune"
  | "Lot of Spirit"
  | "Lot of Eros"
  | "Lot of Necessity"
  | "Lot of Courage"
  | "Lot of Victory"
  | "Lot of Nemesis";

/** Day when the Sun is above the horizon, night when it is below. */
export type Sect = "day" | "night";

export interface PointPosition {
  point: PointName;
  /** Tropical longitude of date, degrees in [0, 360). */
  lon: number;
  /** Ecliptic latitude, degrees; zero except for Black Moon Lilith. */
  lat: number;
  /**
   * Longitude speed in degrees/day, the derivative of `lon` over plus/minus
   * 0.001 day, for the mean node and Black Moon Lilith; null for the points the
   * chart's angles fix.
   */
  speed: number | null;
  sign: ZodiacSign;
  /** Longitude inside `sign`, degrees in [0, 30). */
  degree: number;
}

export interface ChartPoints {
  /** The chart's sect; null when it has no angles. */
  sect: Sect | null;
  /**
   * The mean node and its opposite point and Black Moon Lilith always; the
   * Vertex, the East Point and the seven lots only when the chart has angles.
   */
  points: PointPosition[];
}

export interface Angles {
  asc: number;
  mc: number;
  dsc: number;
  ic: number;
}

export interface Houses {
  system: HouseSystem;
  /** Cusp longitudes; array index zero is the first house. */
  cusps: number[];
}

export type AspectType = "conjunction" | "sextile" | "square" | "trine" | "opposition";

export interface Aspect {
  a: BodyName;
  b: BodyName;
  type: AspectType;
  /** Deviation from exact, in degrees. */
  orb: number;
  /**
   * True only when the orb is strictly decreasing at the chart instant, judged
   * from the two longitude speeds. False when separating, when exact, and when
   * the relative speed is below STATIONARY_RELATIVE_SPEED; aspectMotion tells
   * the last case apart.
   */
  applying: boolean;
}

export interface Chart {
  input: ChartInput;
  bodies: BodyPosition[];
  /** Present only when a time and coordinates are available. */
  angles: Angles | null;
  houses: Houses | null;
  aspects: Aspect[];
  flags: ChartFlag[];
  /** The ΔT (TT − UT1) the chart was computed with, its band and its source. */
  deltaT: DeltaT;
  /** How the instant became UT1 (for the angles) and TT (for the positions). */
  timeScale: TimeScale;
  engineVersion: string;
}

export interface MinimalBody {
  body: string;
  lon: number;
}

export interface InterAspect {
  /** Body in the first chart (or the moving body for `transits`). */
  a: string;
  aLon: number;
  /** Body in the second chart (or the natal body for `transits`). */
  b: string;
  bLon: number;
  type: AspectType;
  orb: number;
}

export interface PairSummary {
  aspects: InterAspect[];
  top: InterAspect[];
  counts: Record<AspectType, number>;
  easeful: number;
  charged: number;
  elements: {
    a: Record<Element, number>;
    b: Record<Element, number>;
  };
  modalities: {
    a: Record<Modality, number>;
    b: Record<Modality, number>;
  };
}

export interface SynastryResult extends PairSummary {
  a: Chart;
  b: Chart;
}

export interface TransitResult {
  natal: Chart;
  at: Date;
  positions: BodyPosition[];
  /** Moving-body-to-natal-body aspects, sorted by orb. */
  aspects: InterAspect[];
}

export type MoonPhaseName =
  | "New Moon"
  | "Waxing Crescent"
  | "First Quarter"
  | "Waxing Gibbous"
  | "Full Moon"
  | "Waning Gibbous"
  | "Last Quarter"
  | "Waning Crescent";

export interface MoonPhase {
  at: Date;
  /** Elongation Moon minus Sun: 0 = new, 180 = full. */
  angle: number;
  /** Illuminated fraction in [0, 1]. */
  illumination: number;
  name: MoonPhaseName;
  waxing: boolean;
}

/** This package's version, as package.json names it. A string: it changes with every release. */
export const ENGINE_VERSION: string = "1.0.0-rc.1";

/**
 * The ephemeris underneath every position. The dependency is pinned to this
 * exact version, so receipts can name it without asking the caller.
 */
export const EPHEMERIS = Object.freeze({ name: "astronomy-engine" as const, version: "2.1.19" as string });
