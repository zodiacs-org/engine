/**
 * Sect: whether a chart is of the day or of the night, read under a
 * convention the caller names, with the chart's sect light, the side of the
 * Sun Mercury is on, and the planets in and out of sect.
 *
 * `"altitude"` is the Zodiacs.org site's rule (src/lib/sect.ts), ported: day
 * when the Sun's altitude, which the caller computes, is 0 or more.
 * `"ecliptic"` is the root's `sectOf`, called, not rewritten: day when the
 * Sun is on the half of the ecliptic from the descendant through the
 * midheaven to the ascendant. The two differ where that half is below the
 * horizon, inside the polar circles (docs/timing-hellenistic.md, *Flags*).
 * Neither is a default: a reading names its convention.
 *
 * The diurnal planets (the Sun, Jupiter and Saturn), the nocturnal ones (the
 * Moon, Venus and Mars), the sect light, and Mercury's side taken from its
 * rising before or after the Sun are the site's convention, ported. No
 * primary text was read for this work. See docs/lite.md.
 */
import { sectOf } from "./points.js";
import { readOptions } from "./read-options.js";

/** The rule that decides day or night: the Sun's altitude, or its half of the ecliptic. */
export type SectConvention = "altitude" | "ecliptic";

/** The conventions `sectReading` takes. */
export const SECT_CONVENTIONS: readonly SectConvention[] = /*#__PURE__*/ Object.freeze(["altitude", "ecliptic"]);

/** Whether a body rises ahead of the Sun (oriental) or behind it (occidental). */
export type Orientality = "oriental" | "occidental";

/** The planets of the day, in the order the lists of a reading give them. */
export const DIURNAL_PLANETS: readonly ["Sun", "Jupiter", "Saturn"] = /*#__PURE__*/ Object.freeze(["Sun", "Jupiter", "Saturn"] as const);

/** The planets of the night, in the order the lists of a reading give them. */
export const NOCTURNAL_PLANETS: readonly ["Moon", "Venus", "Mars"] = /*#__PURE__*/ Object.freeze(["Moon", "Venus", "Mars"] as const);

type SectPlanet = "Sun" | "Moon" | "Mercury" | "Venus" | "Mars" | "Jupiter" | "Saturn";

/** A finite number of degrees, or a RangeError naming it. Number.isFinite is false for anything but a finite number. */
function degrees(value: unknown, name: string): number {
  if (!Number.isFinite(value)) throw new RangeError(`${name} must be a finite number of degrees.`);
  return value as number;
}

/**
 * Whether a body rises ahead of the Sun or behind it, from their ecliptic
 * longitudes in degrees, finite and of any size. The signed arc from the body
 * to the Sun, in (-180, 180], is above 0 for an oriental body: one earlier in
 * the order of the signs, which the ascendant reaches first. A body exactly
 * opposite the Sun is oriental, and one exactly on it occidental.
 */
export function orientality(bodyLon: number, sunLon: number): Orientality {
  const raw = (((degrees(sunLon, "sunLon") - degrees(bodyLon, "bodyLon")) % 360) + 360) % 360;
  return (raw > 180 ? raw - 360 : raw) > 0 ? "oriental" : "occidental";
}

/** A reading by the Sun's altitude, which the caller computes. */
export interface AltitudeSectInput {
  readonly convention: "altitude";
  /** Degrees of the Sun above the horizon, in [-90, 90]; negative below it. */
  readonly sunAltitude: number;
  /** The Sun's ecliptic longitude, degrees. */
  readonly sunLon: number;
  /** Mercury's ecliptic longitude, degrees; null or absent when it is not known. */
  readonly mercuryLon?: number | null | undefined;
}

/** A reading by the Sun's half of the ecliptic, as the root's `sectOf` takes it. */
export interface EclipticSectInput {
  readonly convention: "ecliptic";
  /** The ascendant's ecliptic longitude, degrees. */
  readonly ascendant: number;
  /** The Sun's ecliptic longitude, degrees. */
  readonly sunLon: number;
  /** Mercury's ecliptic longitude, degrees; null or absent when it is not known. */
  readonly mercuryLon?: number | null | undefined;
}

export type SectInput = AltitudeSectInput | EclipticSectInput;

/** A chart's sect under the convention named, frozen with its lists. */
export interface SectReading {
  readonly convention: SectConvention;
  readonly sect: "day" | "night";
  /** The altitude given, unchanged; null under the ecliptic convention. */
  readonly sunAltitude: number | null;
  /** The luminary of the chart's own half: the Sun by day, the Moon by night. */
  readonly light: "Sun" | "Moon";
  /** Mercury's side of the Sun; null when no Mercury longitude was given. */
  readonly mercury: Orientality | null;
  /**
   * The planets of the chart's own half, in the order of `DIURNAL_PLANETS` or
   * `NOCTURNAL_PLANETS`, then Mercury when its side matches the chart's:
   * oriental by day, occidental by night.
   */
  readonly inSect: readonly ("Sun" | "Moon" | "Mercury" | "Venus" | "Mars" | "Jupiter" | "Saturn")[];
  /** The planets of the other half, in their order, then Mercury when its side does not match. */
  readonly outOfSect: readonly ("Sun" | "Moon" | "Mercury" | "Venus" | "Mars" | "Jupiter" | "Saturn")[];
}

/**
 * A chart's sect under the convention the input names, which it must name:
 *
 * - `"altitude"`: day when `sunAltitude` is 0 or more, so a Sun exactly on
 *   the horizon, and an altitude of -0, count to the day;
 * - `"ecliptic"`: the root's `sectOf(ascendant, sunLon)`, so a Sun exactly on
 *   the ascendant counts to the night and one exactly on the descendant to
 *   the day.
 *
 * The sect light is the Sun by day and the Moon by night; Mercury's side is
 * `orientality(mercuryLon, sunLon)`. Throws RangeError for an input that is
 * not a plain object of its convention's own keys, a convention other than
 * the two, an altitude that is not a finite number from -90 to 90, and a
 * longitude that is not finite; `mercuryLon` null or absent gives a reading
 * whose `mercury` is null.
 */
export function sectReading(input: SectInput): SectReading {
  const { convention } = readOptions(input, ["convention", "sunAltitude", "ascendant", "sunLon", "mercuryLon"], "sectReading's input");
  if (convention !== "altitude" && convention !== "ecliptic") throw new RangeError('convention must be "altitude" or "ecliptic".');
  const read = readOptions(input, ["convention", convention === "altitude" ? "sunAltitude" : "ascendant", "sunLon", "mercuryLon"], `sectReading's ${convention} input`);
  const sunLon = degrees(read.sunLon, "sunLon");
  const sunAltitude = convention === "altitude" ? degrees(read.sunAltitude, "sunAltitude") : null;
  if (Math.abs(sunAltitude ?? 0) > 90) throw new RangeError("sunAltitude must be from -90 to 90 degrees.");
  const day = sunAltitude === null ? sectOf(degrees(read.ascendant, "ascendant"), sunLon) === "day" : sunAltitude >= 0;
  const mercury = read.mercuryLon == null ? null : orientality(degrees(read.mercuryLon, "mercuryLon"), sunLon);
  const inSect: SectPlanet[] = [...(day ? DIURNAL_PLANETS : NOCTURNAL_PLANETS)];
  const outOfSect: SectPlanet[] = [...(day ? NOCTURNAL_PLANETS : DIURNAL_PLANETS)];
  if (mercury) ((mercury === "oriental") === day ? inSect : outOfSect).push("Mercury");
  const light = day ? "Sun" : "Moon";
  return Object.freeze({ convention, sect: day ? "day" : "night", sunAltitude, light, mercury, inSect: Object.freeze(inSect), outOfSect: Object.freeze(outOfSect) });
}
