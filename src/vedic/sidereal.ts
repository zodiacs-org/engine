/**
 * Sidereal longitudes as tagged values. Every Jyotish function here takes a
 * SiderealLongitude, never a bare number, so a tropical longitude cannot be
 * passed where a sidereal one is meant. Two constructors exist: from a
 * tropical longitude and an AyanamsaValue for the same instant, or from a
 * value the caller explicitly declares to be sidereal.
 */
import { ayanamsa, isAyanamsaValue, utcInstantOf } from "./ayanamsa.js";
import type { AyanamsaDefinition, AyanamsaName, AyanamsaValue } from "./ayanamsa.js";
import { SIGN_TICKS, ticksOf } from "./grid.js";
import { dateFrom } from "../date-input.js";
import type { BodyName, Chart, ChartFlag, DateInput, HouseSystem } from "../types.js";

/**
 * A sidereal longitude of date, frozen. Only siderealLongitude,
 * declareSiderealLongitude and siderealChart make one; copies are refused,
 * including one through JSON or structuredClone, although the type has no
 * brand to say so (docs/vedic.md, *Frames*).
 */
export interface SiderealLongitude {
  readonly frame: "sidereal";
  /** Sidereal longitude of date, degrees in [0, 360). */
  readonly lon: number;
  /** The ayanamsa's name, or the label a declared value was given. */
  readonly ayanamsa: string;
  /** The true ayanamsa subtracted, degrees; null for a declared value. */
  readonly trueAyanamsa: number | null;
  /** The tropical longitude of date it came from; null for a declared value. */
  readonly tropical: number | null;
  /**
   * The instant, ISO 8601 UTC; null for a declared value given none. For an
   * ayanamsa read on UT1 or TT (a chart given on either), the UTC instant of
   * its time basis, as the timing entry reads the chart.
   */
  readonly utc: string | null;
}

const SIDEREAL = new WeakSet<object>();

function make<T extends SiderealLongitude>(value: T): T {
  const frozen = Object.freeze(value);
  SIDEREAL.add(frozen);
  return frozen;
}

/** Internal: the argument, if this module made it; RangeError otherwise. */
export function requireSidereal(value: unknown): SiderealLongitude {
  if (typeof value !== "object" || value === null || !SIDEREAL.has(value)) {
    throw new RangeError("Expected a SiderealLongitude from siderealLongitude or declareSiderealLongitude.");
  }
  return value as SiderealLongitude;
}

/**
 * Internal: into [0, 360), leaving a value already there bit for bit
 * unchanged (the general normalizeLongitude adds 360 first, which can move it
 * by an ulp).
 */
export function wrap360(value: number): number {
  if (value >= 0 && value < 360) return value;
  let r = value % 360;
  if (r < 0) r += 360;
  return r === 360 || r === 0 ? 0 : r;
}

function finiteLongitude(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new RangeError(`${label} must be a finite number.`);
  return wrap360(value);
}

/**
 * tropical − true ayanamsa, in [0, 360). `tropicalLongitude` must be an
 * apparent longitude of date for the ayanamsa's own instant and clock; that
 * cannot be checked here.
 */
export function siderealLongitude(tropicalLongitude: number, ayanamsa: AyanamsaValue): SiderealLongitude {
  if (!isAyanamsaValue(ayanamsa)) throw new RangeError("ayanamsa must be a value returned by ayanamsa().");
  const tropical = finiteLongitude(tropicalLongitude, "tropicalLongitude");
  return make({
    frame: "sidereal",
    lon: wrap360(tropical - ayanamsa.true),
    ayanamsa: ayanamsa.ayanamsa,
    trueAyanamsa: ayanamsa.true,
    tropical,
    utc: utcInstantOf(ayanamsa)
  });
}

/** The label, and optionally the instant, of a declared sidereal value. */
export interface SiderealDeclaration {
  /** A label for the zodiac the value is in: nonempty, trimmed, at most 80 characters. */
  readonly ayanamsa: string;
  /** Its instant, needed only by the dasha functions. */
  readonly at?: DateInput | undefined;
}

/**
 * A longitude the caller asserts is already sidereal (from another program,
 * a table, a test). The engine cannot check the claim; it records the label.
 */
export function declareSiderealLongitude(longitude: number, declaration: SiderealDeclaration): SiderealLongitude {
  const label = declaration?.ayanamsa;
  if (typeof label !== "string" || !label || label.length > 80 || label.trim() !== label || /[\u0000-\u001f\u007f]/.test(label)) {
    throw new RangeError("declaration.ayanamsa must be a nonempty trimmed label of at most 80 characters.");
  }
  const at = declaration.at;
  return make({
    frame: "sidereal",
    lon: finiteLongitude(longitude, "longitude"),
    ayanamsa: label,
    trueAyanamsa: null,
    tropical: null,
    utc: at === undefined ? null : dateFrom(at, "declaration.at").toISOString()
  });
}

/** A chart body's sidereal longitude. */
export interface SiderealBody extends SiderealLongitude {
  readonly body: BodyName;
}

/** siderealChart's result, frozen. */
export interface SiderealChart {
  /** The ayanamsa's name. */
  readonly ayanamsa: string;
  /** The ayanamsa at the chart's instant and on its clock. */
  readonly ayanamsaValue: AyanamsaValue;
  /** The chart's twelve bodies, in its order. */
  readonly bodies: readonly SiderealBody[];
  /** Null when the chart has no angles. */
  readonly ascendant: SiderealLongitude | null;
  readonly midheaven: SiderealLongitude | null;
  /** The chart's house system as computed, after any polar fallback; null without houses. */
  readonly houseSystem: HouseSystem | null;
  /** House cusps, first house first; null without houses. Whole-sign cusps start at the sidereal ascendant's sign. */
  readonly cusps: readonly SiderealLongitude[] | null;
  /** The chart's flags, and the ayanamsa's. */
  readonly flags: readonly ChartFlag[];
}

/**
 * Internal: whole-sign cusps from a sidereal ascendant, first house first: the
 * sidereal signs from the ascendant's, each cusp exactly on a sign's start.
 */
export function wholeSignCusps(ascendant: number): number[] {
  const first = Math.floor(ticksOf(ascendant) / SIGN_TICKS);
  return Array.from({ length: 12 }, (_, k) => ((first + k) % 12) * 30);
}

/** Internal: the sidereal form of an already validated chart. */
export function siderealChartOf(chart: Chart, definition: AyanamsaName | AyanamsaDefinition): SiderealChart {
  const input = chart.input;
  const value = ayanamsa(definition, input.utc, {
    ...(input.deltaT === undefined ? {} : { deltaT: input.deltaT }),
    ...(input.timeScale === undefined ? {} : { timeScale: input.timeScale })
  });
  const of = (lon: number) => siderealLongitude(lon, value);
  const bodies = chart.bodies.map((row) => {
    const sidereal = of(row.lon);
    SIDEREAL.delete(sidereal);
    return make({ ...sidereal, body: row.body });
  });
  const ascendant = chart.angles ? of(chart.angles.asc) : null;
  const houseSystem = chart.houses ? chart.houses.system : null;
  let cusps: SiderealLongitude[] | null = null;
  if (chart.houses && houseSystem === "whole" && ascendant) {
    cusps = wholeSignCusps(ascendant.lon).map((lon) =>
      make({
        frame: "sidereal", lon, ayanamsa: value.ayanamsa, trueAyanamsa: value.true,
        tropical: wrap360(lon + value.true), utc: utcInstantOf(value)
      })
    );
  } else if (chart.houses) {
    cusps = chart.houses.cusps.map(of);
  }
  const flags = [...chart.flags];
  for (const flag of value.flags) if (!flags.includes(flag)) flags.push(flag);
  return Object.freeze({
    ayanamsa: value.ayanamsa,
    ayanamsaValue: value,
    bodies: Object.freeze(bodies),
    ascendant,
    midheaven: chart.angles ? of(chart.angles.mc) : null,
    houseSystem,
    cusps: cusps && Object.freeze(cusps),
    flags: Object.freeze(flags)
  });
}
