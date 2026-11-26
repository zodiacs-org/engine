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

/** A body whose apparent place a position source gives; the nodes come from its `trueNode`. */
export type SourceBody = Exclude<BodyName, "North Node" | "South Node">;

/**
 * Where the engine takes body positions from instead of astronomy-engine,
 * inside `withEphemeris`: for example the source `@zodiacs/engine/de440`
 * opens. `place` gives a body's apparent geocentric longitude in [0, 360)
 * and latitude, degrees, on the true ecliptic and equinox of date, at
 * `ttDays`, TT days past J2000.0; `trueNode` the longitude of the Moon's true
 * node there. `ephemeris` is what a receipt names. Either may throw for an
 * instant the source does not cover.
 */
export interface PositionSource {
  readonly ephemeris: { readonly name: string; readonly version: string };
  /**
   * `dist`, where a source gives it: the distance along the light path, au. The shipped DE440 pack's source gives it,
   * and from 1.1.0-rc.12 `behindDisc`: whether the body is behind the Sun's disc, where its reduction bends no light
   * and so its place steps at the limb. A source that gives `behindDisc` takes `behind`, when given, as that decision
   * instead of making it at `ttDays`; the engine passes a speed's middle instant's decision to its two samples.
   */
  place(body: SourceBody, ttDays: number, behind?: boolean): { lon: number; lat: number; dist?: number; behindDisc?: boolean };
  trueNode(ttDays: number): number;
  /**
   * Optional, from 3.0.0: the geometric geocentric Moon at `ttDays` (no light-time, aberration or deflection), its
   * `position` in km and `velocity` in km/s, in the ICRF, which the engine takes for astronomy-engine's EQJ. The
   * engine computes True Black Moon Lilith from it (`trueApogee`); a source without it gives no True Black Moon
   * Lilith. Every DE440 source gives it.
   */
  moonState?(ttDays: number): { position: [number, number, number]; velocity: [number, number, number] };
  /**
   * Optional: the instants in [fromTtDays, toTtDays], ascending, at which a
   * place or the node may step by more than rounding (a DE440 pack's record
   * boundaries). A source without it is taken to be smooth.
   */
  steps?(fromTtDays: number, toTtDays: number): number[];
}

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
/**
 * `"delta-t-extrapolated"`: a result that moves with a ΔT extrapolated past the IERS table (docs/time.md).
 * `"calendar-unknown"`: a local date resolved with no country the Gregorian adoption table dates that falls in
 * the days one of its changeovers skipped, where the zone does not rule that changeover out, so whether it was
 * in civil use where it was written is not known (docs/time.md).
 * `"host-zone-data-differs"`: a local time from 1970 on that the host's Intl read, near a span in which the time
 * zone database changed since tzdata 2021a, where the host gave another offset than the pinned tzdb release; the
 * instant is still the host's, and a device with other time zone data may give another one (docs/time.md).
 * `"polar-angles"`: the angles were computed inside the polar circle, |latitude| ≥ 90° − ε, where the ascendant
 * turns half a circle twice a sidereal day and is 0° or 180° at the poles (docs/houses.md).
 */
export type ChartFlag =
  | "dst-gap"
  | "dst-fold"
  | "lmt"
  | "calendar-unknown"
  | "host-zone-data-differs"
  | "no-time"
  | "polar-fallback"
  | "polar-angles"
  | "outside-reference-span"
  | "delta-t-extrapolated"
  | EphemerisFallback;

/**
 * Why a result that would have come from the shipped DE440 pack, the default
 * source after `useDe440()` (`@zodiacs/engine/de440/pack`) or
 * `setDefaultEphemeris("de440")`, came from astronomy-engine instead; the
 * result carries it as a flag and names astronomy-engine as its ephemeris, so
 * the fallback is never silent. `"de440-unavailable"`: the pack could not be
 * opened, because `useDe440()` has not loaded it, or its bytes are missing,
 * are not the sealed pack's (their SHA-256 differs) or cannot be decoded;
 * `defaultEphemeris().de440.error` says which.
 * `"outside-de440-span"`: an instant the result was computed at is outside
 * the pack's coverage less a day at each end (`defaultEphemeris()` gives the
 * ends; 1790-01-02 to 2209-12-31 at least). Neither is set on the default
 * astronomy-engine (the package's default from 3.0.0, or the caller's choice
 * through `setDefaultEphemeris("astronomy-engine")`), where the result still
 * names astronomy-engine, nor inside `withEphemeris`.
 */
export type EphemerisFallback = "de440-unavailable" | "outside-de440-span";

/**
 * A bare value (a Date, a longitude, a list of signs) with the label it
 * cannot carry itself: the ephemeris its positions came from and the flags
 * that say why that is astronomy-engine where the shipped DE440 pack was the
 * default. What each `…Detailed` function of the techniques and internal
 * entries returns, beside the plain function, which returns `value` alone
 * and is unchanged.
 */
export interface DetailedResult<T, F extends string = EphemerisFallback> {
  /** What the plain function returns, the same value. */
  readonly value: T;
  /** `{ name: "jpl-de440", version }` on the pack; astronomy-engine's name and version where any position was its. */
  readonly ephemeris: { readonly name: string; readonly version: string };
  /**
   * `"de440-unavailable"` or `"outside-de440-span"` on a fallback, none on the pack or after the caller chose
   * astronomy-engine; in the techniques entry also `"outside-reference-span"`, first, where a position was read
   * outside 1800 to 2200.
   */
  readonly flags: readonly F[];
}

/**
 * A resolved birth instant. Use `resolveBirth` from `@zodiacs/engine/geo`
 * when starting from a local wall time and IANA timezone.
 */
export interface BirthInput {
  /**
   * The instant, on the scale `timeScale` names: UTC by default, and UT1 or
   * TT when `timeScale` says so. The field keeps its name on every scale,
   * because receipts record it under that name (docs/time.md). A calendar
   * date string with no time, such as "1990-05-03", reads as 00:00 UTC and
   * is refused with a RangeError unless `timeKnown` is false.
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
  /** A caller's fixed ΔT (TT − UT1) in seconds, as BirthInput.deltaT; the engine's time basis when absent. */
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
  /**
   * The ephemeris this position came from, on every position the engine
   * computes from 1.1.0-rc.10: `"jpl-de440"`, `"astronomy-engine"`, or the
   * name of the source `withEphemeris` ran the call with.
   */
  ephemeris?: string;
  /** Present when `ephemeris` is astronomy-engine as a fallback from the shipped DE440 pack, and says why. */
  fallback?: EphemerisFallback;
  /**
   * On the rows of `positions()`, `transits()`' `positions` and `progressedBodies()`, from
   * 2.0.0: the flags a chart at the same instant carries, where there are any (a chart's own bodies leave them to
   * the chart's `flags`): `"outside-reference-span"`, `"delta-t-extrapolated"`, then the fallback, as `fallback`.
   */
  flags?: InstantFlag[];
}

/** The flags an instant itself gives a result, whatever the place and birth settings; see `BodyPosition.flags`. */
export type InstantFlag = "outside-reference-span" | "delta-t-extrapolated" | EphemerisFallback;

/** A chart point that is not a body; see `chartPoints`. */
export type PointName =
  | "Mean Node"
  | "Mean South Node"
  | "Black Moon Lilith"
  | "True Black Moon Lilith"
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
  /** Ecliptic latitude, degrees; zero except for Black Moon Lilith and True Black Moon Lilith. */
  lat: number;
  /**
   * Longitude speed in degrees/day, the derivative of `lon` over plus/minus
   * 0.001 day, for the mean node and Black Moon Lilith, and over plus/minus
   * 0.25 day for True Black Moon Lilith (as for the true node); null for the
   * points the chart's angles fix.
   */
  speed: number | null;
  sign: ZodiacSign;
  /** Longitude inside `sign`, degrees in [0, 30). */
  degree: number;
  /**
   * On True Black Moon Lilith, the one point computed from an ephemeris (from 3.0.0): the ephemeris its Moon state
   * came from, as a BodyPosition names it, `"jpl-de440"`, `"astronomy-engine"` or the name of the source
   * `withEphemeris` ran the call with.
   */
  ephemeris?: string;
  /** On True Black Moon Lilith, present when `ephemeris` is astronomy-engine as a fallback from the shipped DE440 pack, and says why. */
  fallback?: EphemerisFallback;
}

export interface ChartPoints {
  /** The chart's sect; null when it has no angles. */
  sect: Sect | null;
  /**
   * The mean node and its opposite point and Black Moon Lilith always; the
   * Vertex, the East Point and the seven lots only when the chart has angles;
   * and last, from 3.0.0, True Black Moon Lilith, computed at the call on the
   * source a position at the chart's instant would come from, wherever that
   * source gives the Moon's state (astronomy-engine and every DE440 source
   * do; a caller's source without `moonState` gives none).
   */
  points: PointPosition[];
  /**
   * From 1.1.0-rc.12: the ephemeris of the chart the points were derived
   * from, its own `ephemeris` (`"jpl-de440"` on the shipped pack,
   * astronomy-engine's name and version where the chart was computed on
   * it); null for a supplied chart that names none (one from 1.1.0-rc.9 or
   * earlier).
   */
  ephemeris: { readonly name: string; readonly version: string } | null;
  /**
   * From 1.1.0-rc.12: the chart's fallback flags (`EphemerisFallback`),
   * `"de440-unavailable"` or `"outside-de440-span"` where its bodies are
   * astronomy-engine's as a fallback from the shipped pack; none on the pack,
   * after the caller chose astronomy-engine, or inside `withEphemeris`.
   */
  flags: EphemerisFallback[];
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
  /**
   * The ephemeris the bodies came from, on every chart from 1.1.0-rc.10:
   * `"jpl-de440"` with the pack's SHA-256 for the shipped DE440 pack, the
   * default source inside its years after `useDe440()` (`defaultEphemeris`);
   * `"astronomy-engine"` with its version where the chart was computed on it,
   * whether as the default (the package's from 3.0.0, or the caller's choice
   * through `setDefaultEphemeris`) or as a fallback, which `flags`
   * then says (`"de440-unavailable"`, `"outside-de440-span"`); or the name
   * of the source `withEphemeris` ran the chart with. Optional in the type
   * because a chart from 1.1.0-rc.9 or earlier lacks it on astronomy-engine.
   */
  ephemeris?: { readonly name: string; readonly version: string };
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
  /** The ephemeris the Sun and the Moon came from, as a BodyPosition names it; set by the engine from 1.1.0-rc.10. */
  ephemeris?: string;
  /** Present when `ephemeris` is astronomy-engine as a fallback from the shipped DE440 pack, and says why. */
  fallback?: EphemerisFallback;
}

/** This package's version, as package.json names it. A string: it changes with every release. */
export const ENGINE_VERSION: string = "2.1.0";

/**
 * astronomy-engine, the ephemeris the engine computes on where the shipped
 * DE440 pack is not the source: outside the pack's years, after
 * `setDefaultEphemeris("astronomy-engine")`, and in the entries that compute
 * on it themselves (calc, window, the sky entry's rising and setting). The
 * dependency is pinned to this exact version, so receipts can name it
 * without asking the caller. Until 1.1.0-rc.7 it was underneath every
 * position.
 */
export const EPHEMERIS = /*#__PURE__*/ Object.freeze({ name: "astronomy-engine" as const, version: "2.1.19" as string });
