/** Public, serializable vocabulary shared by the chart APIs. */

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
  slug: ZodiacSign;
  name: string;
  element: Element;
  modality: Modality;
  polarity: Polarity;
  naturalHouse: HouseNumber;
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

export type HouseSystem = "whole" | "placidus";
export type ChartFlag = "dst-gap" | "dst-fold" | "lmt" | "no-time" | "polar-fallback";

/**
 * A resolved birth instant. Use `resolveBirth` from `@zodiacs/engine/geo`
 * when starting from a local wall time and IANA timezone.
 */
export interface BirthInput {
  utc: DateInput;
  latitude?: number;
  longitude?: number;
  houseSystem?: HouseSystem;
  /** Set false when `utc` is a conventional noon placeholder. */
  timeKnown?: boolean;
  flags?: readonly ChartFlag[];
}

export interface ChartInput {
  utc: Date;
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
  /** Longitude speed in degrees/day; negative means retrograde. */
  speed: number;
  retrograde: boolean;
  sign: ZodiacSign;
  /** Longitude inside `sign`, degrees in [0, 30). */
  degree: number;
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
  /** True when the aspect is still tightening at the chart instant. */
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

export const ENGINE_VERSION = "0.1.1-rc.1";
