import { normalizeLongitude } from "../../src/signs.js";
import { harmonicChart } from "./harmonic-chart.js";
import type { LongitudePoint } from "./types.js";

export const DIAL_CIRCLES = Object.freeze([90, 45, 22.5] as const);
export type DialCircle = typeof DIAL_CIRCLES[number];

export interface DialOptions {
  /** Inclusive contact allowance in longitude degrees; defaults to 1. */
  readonly contactOrb?: number;
}

export interface DialPoint extends LongitudePoint {
  /** Full source zodiac longitude normalized onto [0, 360), in degrees. */
  readonly sourceLon: number;
  /** Zero-based source sector on the zodiac circle. */
  readonly sector: number;
}

/** Pairwise proximity on the dial, without an aspect type or motion claim. */
export interface DialContact {
  readonly a: string;
  readonly b: string;
  /** Shortest distance on the dial in longitude degrees. */
  readonly orb: number;
}

export interface DialProjection {
  readonly circle: DialCircle;
  readonly contactOrb: number;
  readonly arithmetic: "binary64;inclusive;no-epsilon";
  /** Input order retained; lon is in [0, circle). */
  readonly points: readonly DialPoint[];
  /** Canonical labels within each pair; sorted by orb, then labels. */
  readonly contacts: readonly DialContact[];
}

function validateCircle(circle: DialCircle): void {
  if (!DIAL_CIRCLES.includes(circle)) {
    throw new RangeError("Dial circle must be 90, 45 or 22.5 degrees.");
  }
}

function projectedDistance(a: number, b: number, circle: DialCircle): number {
  const gap = Math.abs(a - b);
  return Math.min(gap, circle - gap);
}

/** Shortest unsigned dial distance between supplied full longitudes, in degrees. */
export function dialDistance(a: number, b: number, circle: DialCircle = 90): number {
  validateCircle(circle);
  return projectedDistance(normalizeLongitude(a) % circle, normalizeLongitude(b) % circle, circle);
}

function lexical(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Fold supplied zodiac longitudes onto a dial without casting or using speeds.
 * Shared harmonic-chart validation retains unique names and normalized sources.
 * Distances use ordinary binary64 arithmetic, with no widened contact allowance.
 */
export function projectDial(
  points: readonly LongitudePoint[],
  circle: DialCircle = 90,
  options: DialOptions = {}
): DialProjection {
  validateCircle(circle);
  if (!options || typeof options !== "object" || Array.isArray(options) ||
    Reflect.ownKeys(options).some((key) => key !== "contactOrb")) {
    throw new RangeError("Dial options must contain supported fields only.");
  }
  const contactOrb = options.contactOrb === undefined ? 1 : options.contactOrb;
  if (typeof contactOrb !== "number" || !Number.isFinite(contactOrb) ||
    contactOrb < 0 || contactOrb > circle / 2) {
    throw new RangeError("contactOrb must be finite and between zero and half the dial circle.");
  }
  const projected = harmonicChart(points, 1).points.map(({ body, sourceLon }): DialPoint => Object.freeze({
    body, sourceLon, lon: sourceLon % circle, sector: Math.floor(sourceLon / circle)
  }));
  const canonical = [...projected].sort((a, b) => lexical(a.body, b.body));
  const contacts: DialContact[] = [];
  for (let i = 0; i < canonical.length; i += 1) {
    for (let j = i + 1; j < canonical.length; j += 1) {
      const a = canonical[i]!;
      const b = canonical[j]!;
      const orb = projectedDistance(a.lon, b.lon, circle);
      if (orb <= contactOrb) contacts.push(Object.freeze({ a: a.body, b: b.body, orb }));
    }
  }
  contacts.sort((a, b) => a.orb - b.orb || lexical(a.a, b.a) || lexical(a.b, b.b));
  return Object.freeze({
    circle, contactOrb: contactOrb === 0 ? 0 : contactOrb,
    arithmetic: "binary64;inclusive;no-epsilon",
    points: Object.freeze(projected), contacts: Object.freeze(contacts)
  });
}
