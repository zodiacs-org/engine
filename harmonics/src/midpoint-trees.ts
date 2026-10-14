import { midpoint } from "../../src/points.js";
import { normalizeLongitude } from "../../src/signs.js";
import { dialDistance, projectDial } from "./dial.js";
import type { DialCircle, DialOptions, DialPoint, DialProjection } from "./dial.js";
import type { LongitudePoint } from "./types.js";

export interface MidpointAxis {
  /** At an antipodal tie, near is the engine's point 90 degrees past members[0]. */
  readonly kind: "near" | "opposite";
  readonly sourceLon: number;
  readonly lon: number;
  readonly sector: number;
}

export interface MidpointPair {
  /** Distinct labels in UTF-16 lexical order; never a joined expression id. */
  readonly members: readonly [string, string];
  readonly antipodal: boolean;
  /** Both zodiac endpoints, retained even when their dial coordinates coincide. */
  readonly axes: readonly [MidpointAxis, MidpointAxis];
}

export interface MidpointAxisContact {
  readonly axis: MidpointAxis;
  readonly orb: number;
}

export interface MidpointContact {
  readonly midpoint: MidpointPair;
  /** Each eligible endpoint once, near before opposite; orbs can differ by rounding. */
  readonly axes: readonly MidpointAxisContact[];
  /** Smallest matched endpoint distance in dial longitude degrees. */
  readonly orb: number;
}

export interface MidpointTree {
  readonly center: DialPoint;
  /** One row per contacting pair, excluding pairs containing the center label. */
  readonly contacts: readonly MidpointContact[];
}

export interface MidpointTreeResult {
  readonly dial: DialProjection;
  readonly arithmetic: "binary64;inclusive;no-epsilon";
  /** All unordered distinct-label pairs, sorted by member tuple. */
  readonly midpoints: readonly MidpointPair[];
  /** Every supplied center, including empty trees, sorted by label. */
  readonly trees: readonly MidpointTree[];
}

function lexical(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function projectAxis(kind: MidpointAxis["kind"], sourceLon: number, circle: DialCircle): MidpointAxis {
  return Object.freeze({ kind, sourceLon, lon: sourceLon % circle, sector: Math.floor(sourceLon / circle) });
}

/**
 * List planet-centered midpoint contacts using the engine's shorter-arc helper
 * on full zodiac sources. Reversing pairs and folding endpoints never adds
 * duplicate tree rows. Distinct formulas at coincident coordinates remain.
 */
export function midpointTrees(
  points: readonly LongitudePoint[],
  circle: DialCircle = 90,
  options: DialOptions = {}
): MidpointTreeResult {
  // Reuse the dial's full input validation, source snapshots and orb convention.
  const dial = projectDial(points, circle, options);
  const canonical = [...dial.points].sort((a, b) => lexical(a.body, b.body));
  const midpoints: MidpointPair[] = [];
  for (let i = 0; i < canonical.length; i += 1) {
    for (let j = i + 1; j < canonical.length; j += 1) {
      const a = canonical[i]!;
      const b = canonical[j]!;
      // Canonical argument order also fixes the engine's exact-antipode tie.
      const near = midpoint(a.sourceLon, b.sourceLon);
      midpoints.push(Object.freeze({
        members: Object.freeze([a.body, b.body] as const),
        antipodal: normalizeLongitude(b.sourceLon - a.sourceLon) === 180,
        axes: Object.freeze([
          projectAxis("near", near, circle),
          projectAxis("opposite", normalizeLongitude(near + 180), circle)
        ] as const)
      }));
    }
  }

  const trees = canonical.map((center): MidpointTree => {
    const contacts: MidpointContact[] = [];
    for (const pair of midpoints) {
      if (pair.members.includes(center.body)) continue;
      const axes: MidpointAxisContact[] = [];
      for (const axis of pair.axes) {
        const orb = dialDistance(axis.sourceLon, center.sourceLon, circle);
        if (orb <= dial.contactOrb) axes.push(Object.freeze({ axis, orb }));
      }
      if (axes.length) {
        contacts.push(Object.freeze({
          midpoint: pair, axes: Object.freeze(axes), orb: Math.min(...axes.map(({ orb }) => orb))
        }));
      }
    }
    contacts.sort((a, b) => a.orb - b.orb ||
      lexical(a.midpoint.members[0], b.midpoint.members[0]) ||
      lexical(a.midpoint.members[1], b.midpoint.members[1]));
    return Object.freeze({ center, contacts: Object.freeze(contacts) });
  });
  return Object.freeze({
    dial, arithmetic: "binary64;inclusive;no-epsilon",
    midpoints: Object.freeze(midpoints), trees: Object.freeze(trees)
  });
}
