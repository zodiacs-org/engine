import { compareExact, exactSum } from "../../src/exact.js";
import type { ExactSum } from "../../src/exact.js";
import { declareSiderealLongitude, requireSidereal } from "../../src/vedic/sidereal.js";
import type { SiderealLongitude } from "../../src/vedic/sidereal.js";
import { luminarySnapshot } from "./engine.js";
import type {
  LuminarySnapshot, PanchangInstant, SnapshotOptions, SnapshotRefusal
} from "./engine.js";

export const TITHI_NAMES = Object.freeze([
  "Pratipada", "Dvitiya", "Tritiya", "Chaturthi", "Panchami", "Shashthi",
  "Saptami", "Ashtami", "Navami", "Dashami", "Ekadashi", "Dvadashi",
  "Trayodashi", "Chaturdashi", "Purnima", "Amavasya"
] as const);
export const YOGA_NAMES = Object.freeze([
  "Vishkambha", "Priti", "Ayushman", "Saubhagya", "Shobhana", "Atiganda",
  "Sukarma", "Dhriti", "Shula", "Ganda", "Vriddhi", "Dhruva", "Vyaghata",
  "Harshana", "Vajra", "Siddhi", "Vyatipata", "Variyan", "Parigha", "Shiva",
  "Siddha", "Sadhya", "Shubha", "Shukla", "Brahma", "Indra", "Vaidhriti"
] as const);
export const MOVING_KARANAS = Object.freeze([
  "Bava", "Balava", "Kaulava", "Taitila", "Gara", "Vanija", "Vishti"
] as const);
export const FIXED_KARANAS = Object.freeze([
  "Shakuni", "Chatushpada", "Naga", "Kimstughna"
] as const);

export type Paksha = "shukla" | "krishna";
export interface TithiPosition {
  /** Zero-based index in the full elongation cycle. */
  readonly index: number;
  readonly name: (typeof TITHI_NAMES)[number];
  readonly paksha: Paksha;
  /** One-based ordinal within the paksha, including Amavasya as 15. */
  readonly pakshaNumber: number;
}
export interface YogaPosition {
  readonly index: number;
  readonly name: (typeof YOGA_NAMES)[number];
}
export interface KaranaPosition {
  /** Zero-based half-tithi index in the full elongation cycle. */
  readonly index: number;
  readonly name: (typeof MOVING_KARANAS)[number] | (typeof FIXED_KARANAS)[number];
  readonly kind: "moving" | "fixed";
  readonly half: 1 | 2;
}
export interface InstantaneousPanchang extends LuminarySnapshot {
  readonly tithi: TithiPosition;
  readonly yoga: YogaPosition;
  readonly karana: KaranaPosition;
}
export type InstantaneousResult = InstantaneousPanchang | SnapshotRefusal;

function canonicalLongitude(value: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value >= 360) {
    throw new RangeError("Longitude must be a finite number in [0, 360) degrees.");
  }
  return value;
}

// Inputs here are two canonical longitudes, so at most one turn is removed.
// Compare exact expansions, never a rounded 40/3 threshold or rounded arc.
function sectorOf(arc: ExactSum, numerator: number, denominator: 1 | 3, count: number): number {
  if (compareExact(arc, 0) < 0) arc = exactSum(arc, 360);
  if (compareExact(arc, 360) >= 0) arc = exactSum(arc, -360);
  const scaled = denominator === 3 ? exactSum(arc, arc, arc) : arc;
  let low = 0;
  let high = count;
  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2);
    if (compareExact(scaled, middle * numerator) < 0) high = middle;
    else low = middle;
  }
  return low;
}

function elongation(sunTropical: number, moonTropical: number): ExactSum {
  return exactSum(canonicalLongitude(moonTropical), -canonicalLongitude(sunTropical));
}

/** Geocentric tropical longitudes at the same instant, degrees. See SOURCES.md. */
export function tithiOf(sunTropical: number, moonTropical: number): TithiPosition {
  const index = sectorOf(elongation(sunTropical, moonTropical), 12, 1, 30);
  const within = index % 15;
  return Object.freeze({
    index,
    name: TITHI_NAMES[index === 29 ? 15 : within]!,
    paksha: index < 15 ? "shukla" : "krishna",
    pakshaNumber: within + 1
  });
}

/** Same-instant sidereal longitudes made by the engine, in the same ayanamsa. */
export function yogaOf(sun: SiderealLongitude, moon: SiderealLongitude): YogaPosition {
  const a = requireSidereal(sun);
  const b = requireSidereal(moon);
  if (a.ayanamsa !== b.ayanamsa || a.utc !== b.utc) {
    throw new RangeError("Yoga requires the same ayanamsa and instant for both longitudes.");
  }
  const index = sectorOf(exactSum(a.lon, b.lon), 40, 3, 27);
  return Object.freeze({ index, name: YOGA_NAMES[index]! });
}

/** Later fixed-karana order: Shakuni, Chatushpada, Naga, Kimstughna. */
export function karanaOf(sunTropical: number, moonTropical: number): KaranaPosition {
  const index = sectorOf(elongation(sunTropical, moonTropical), 6, 1, 60);
  const fixed = index === 0 || index >= 57;
  const name = fixed ? FIXED_KARANAS[index === 0 ? 3 : index - 57]! : MOVING_KARANAS[(index - 1) % 7]!;
  return Object.freeze({ index, name, kind: fixed ? "fixed" : "moving", half: index % 2 === 0 ? 1 : 2 });
}

/** Instantaneous limbs, without a sunrise-day assignment or transition search. */
export function instantaneousPanchang(at: PanchangInstant, options: SnapshotOptions = {}): InstantaneousResult {
  const snapshot = luminarySnapshot(at, options);
  if (snapshot.status === "refused") return snapshot;
  const declaration = { ayanamsa: snapshot.ayanamsa.name, at: snapshot.utc };
  return Object.freeze({
    ...snapshot,
    tithi: tithiOf(snapshot.sun.tropical.lon, snapshot.moon.tropical.lon),
    yoga: yogaOf(declareSiderealLongitude(snapshot.sun.sidereal.lon, declaration),
      declareSiderealLongitude(snapshot.moon.sidereal.lon, declaration)),
    karana: karanaOf(snapshot.sun.tropical.lon, snapshot.moon.tropical.lon)
  });
}
