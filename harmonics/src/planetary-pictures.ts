import { normalizeLongitude } from "../../src/signs.js";
import { dialDistance, projectDial } from "./dial.js";
import type { DialCircle, DialOptions, DialPoint, DialProjection } from "./dial.js";
import type { LongitudePoint } from "./types.js";

/** Distinct labels by default; doubled permits A+A and C+C within a pair. */
export type PictureRepeatedMembers = "distinct" | "doubled";

export interface PlanetaryPictureOptions extends DialOptions {
  readonly repeatedMembers?: PictureRepeatedMembers;
}

/** Labels are structured fields, never a delimiter-joined expression id. */
export interface SensitivePoint {
  readonly a: string;
  readonly b: string;
  readonly c: string;
  /** normalizeLongitude((sourceA + sourceB) - sourceC), in zodiac degrees. */
  readonly sourceLon: number;
  /** Sensitive point folded onto [0, circle), in longitude degrees. */
  readonly lon: number;
  readonly sector: number;
}

export interface PlanetaryPicture {
  /** A+B = C+D on the dial; labels within and between pairs are canonical. */
  readonly left: readonly [string, string];
  readonly right: readonly [string, string];
  /** Canonical left[0]+left[1]-right[0] sensitive point. */
  readonly sensitivePoint: SensitivePoint;
  /** The original projected row named by right[1]. */
  readonly target: DialPoint;
  readonly orb: number;
}

export interface PlanetaryPictureResult {
  readonly dial: DialProjection;
  readonly repeatedMembers: PictureRepeatedMembers;
  readonly arithmetic: "binary64;inclusive;no-epsilon";
  /** All admissible A+B-C formulas, even when no target is in contact. */
  readonly sensitivePoints: readonly SensitivePoint[];
  /** One match per canonical pair-sum relation, sorted by orb then labels. */
  readonly pictures: readonly PlanetaryPicture[];
}

type Pair = readonly [DialPoint, DialPoint];

function lexical(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function comparePair(a: readonly [string, string], b: readonly [string, string]): number {
  return lexical(a[0], b[0]) || lexical(a[1], b[1]);
}

function key(a: string, b: string, c: string): string {
  return JSON.stringify([a, b, c]);
}

/**
 * Enumerate longitude sensitive points and canonical pair-sum dial pictures.
 * The two sides share no labels: cancellations are ordinary pair contacts.
 * Each picture is evaluated once in its canonical A+B-C-to-D orientation.
 * No midpoint, ephemeris, aspect type or motion classification is calculated.
 */
export function findPlanetaryPictures(
  points: readonly LongitudePoint[],
  circle: DialCircle = 90,
  options: PlanetaryPictureOptions = {}
): PlanetaryPictureResult {
  if (!options || typeof options !== "object" || Array.isArray(options) ||
    Reflect.ownKeys(options).some((field) => field !== "contactOrb" && field !== "repeatedMembers")) {
    throw new RangeError("Planetary picture options must contain supported fields only.");
  }
  const repeatedMembers = options.repeatedMembers === undefined ? "distinct" : options.repeatedMembers;
  if (repeatedMembers !== "distinct" && repeatedMembers !== "doubled") {
    throw new RangeError("repeatedMembers must be distinct or doubled.");
  }
  // Reuse dial validation and normalization, including its inclusive orb range.
  const dial = projectDial(points, circle,
    options.contactOrb === undefined ? {} : { contactOrb: options.contactOrb });
  const canonical = [...dial.points].sort((a, b) => lexical(a.body, b.body));
  const pairs: Pair[] = [];
  for (let i = 0; i < canonical.length; i += 1) {
    for (let j = repeatedMembers === "doubled" ? i : i + 1; j < canonical.length; j += 1) {
      pairs.push([canonical[i]!, canonical[j]!]);
    }
  }

  const sensitivePoints: SensitivePoint[] = [];
  const byFormula = new Map<string, SensitivePoint>();
  for (const [a, b] of pairs) {
    for (const c of canonical) {
      if (c.body === a.body || c.body === b.body) continue;
      // Work from normalized full sources, not from projected dial coordinates.
      // Fixed canonical addition order makes roundoff permutation-independent.
      const sourceLon = normalizeLongitude((a.sourceLon + b.sourceLon) - c.sourceLon);
      const point: SensitivePoint = Object.freeze({
        a: a.body, b: b.body, c: c.body, sourceLon,
        lon: sourceLon % circle, sector: Math.floor(sourceLon / circle)
      });
      sensitivePoints.push(point);
      byFormula.set(key(a.body, b.body, c.body), point);
    }
  }

  const pictures: PlanetaryPicture[] = [];
  // pairs are already sorted by their two labels; i<j canonicalizes the sides.
  for (let i = 0; i < pairs.length; i += 1) {
    const [a, b] = pairs[i]!;
    for (let j = i + 1; j < pairs.length; j += 1) {
      const [c, d] = pairs[j]!;
      if (c.body === a.body || c.body === b.body || d.body === a.body || d.body === b.body) continue;
      const sensitivePoint = byFormula.get(key(a.body, b.body, c.body))!;
      const orb = dialDistance(sensitivePoint.sourceLon, d.sourceLon, circle);
      if (orb <= dial.contactOrb) {
        pictures.push(Object.freeze({
          left: Object.freeze([a.body, b.body] as const),
          right: Object.freeze([c.body, d.body] as const),
          sensitivePoint, target: d, orb
        }));
      }
    }
  }
  pictures.sort((a, b) => a.orb - b.orb || comparePair(a.left, b.left) || comparePair(a.right, b.right));
  return Object.freeze({
    dial, repeatedMembers, arithmetic: "binary64;inclusive;no-epsilon",
    sensitivePoints: Object.freeze(sensitivePoints), pictures: Object.freeze(pictures)
  });
}
