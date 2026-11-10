import { absolute, checkedBodyLabel, compareExact, exactSum, roundedValue } from "./engine.js";
import type { ExactSum } from "./engine.js";
import type { StarPosition } from "./positions.js";

/** Only matching coordinates are consumed; full StarPosition rows also fit. */
export type ContactStarPosition = Pick<StarPosition, "starId" | "lonDeg" | "decDeg">;

export interface ContactTarget {
  readonly targetId: string;
  readonly targetKind: "body" | "angle";
  /** True-equinox ecliptic longitude in degrees [0,360), null if unavailable. */
  readonly lonDeg: number | null;
  /** True-equator declination in degrees [-90,90], null if unavailable. */
  readonly decDeg: number | null;
}

export interface ContactOrbs {
  /** Inclusive degrees in [0,180]; null disables conjunction matching. */
  readonly conjunctionDeg: number | null;
  /** Inclusive degrees in [0,180]; null disables parallel matching. */
  readonly parallelDeg: number | null;
}

export type StarContactKind = "conjunction" | "parallel";

export interface StarContact {
  readonly starId: string;
  readonly targetId: string;
  readonly targetKind: ContactTarget["targetKind"];
  readonly kind: StarContactKind;
  /** Coordinate difference in degrees, rounded once after exact decisions. */
  readonly orbDeg: number;
  readonly maximumOrbDeg: number;
}

export const STAR_CONTACT_CONVENTIONS = Object.freeze({
  conjunction: "shortest-ecliptic-longitude-arc;latitude-not-used",
  parallel: "absolute-difference-of-signed-declinations;no-contraparallels",
  frames: "caller-supplied;same-instant;true-equator-and-equinox-of-date",
  units: "degrees",
  boundary: "inclusive;no-epsilon",
  arithmetic: "engine-exact-binary64;reported-orb-rounded-half-even",
  unavailable: "null-coordinate-skips-only-its-contact-kind",
  ordering: "exact-orb;starId;targetKind;targetId;kind;strings-by-utf16",
  receiptScope: "pure-coordinate-matching;no-chart-or-sky-call"
} as const);

export interface StarContacts {
  readonly hits: readonly StarContact[];
  readonly orbs: ContactOrbs;
  readonly conventions: typeof STAR_CONTACT_CONVENTIONS;
}

function rowObject(value: unknown): void {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RangeError("Contact positions must be coordinate records.");
  }
}

function coordinate(value: number | null, longitude: boolean): number | null {
  if (value === null) return null;
  if (!Number.isFinite(value) || (longitude ? value < 0 || value >= 360 : Math.abs(value) > 90)) {
    throw new RangeError("Contact coordinates require longitude in [0,360) and declination in [-90,90] degrees, or null.");
  }
  return value === 0 ? 0 : value;
}

function checkedOrbs(orbs: ContactOrbs): ContactOrbs {
  if (!orbs || typeof orbs !== "object" || Array.isArray(orbs)) {
    throw new RangeError("Contact orbs require conjunctionDeg and parallelDeg.");
  }
  const fields = Object.getOwnPropertyDescriptors(orbs);
  if (Reflect.ownKeys(orbs).length !== 2 ||
      !Object.hasOwn(fields, "conjunctionDeg") || !Object.hasOwn(fields, "parallelDeg")) {
    throw new RangeError("Contact orbs require only conjunctionDeg and parallelDeg.");
  }
  for (const key of ["conjunctionDeg", "parallelDeg"] as const) {
    const field = fields[key]!;
    if (!Object.hasOwn(field, "value") || !field.enumerable ||
        (field.value !== null && (typeof field.value !== "number" || !Number.isFinite(field.value) || field.value < 0 || field.value > 180))) {
      throw new RangeError("Contact orbs must be data fields in [0,180] degrees, or null to disable.");
    }
  }
  const conjunctionDeg = fields.conjunctionDeg!.value as number | null;
  const parallelDeg = fields.parallelDeg!.value as number | null;
  return Object.freeze({ conjunctionDeg: conjunctionDeg === 0 ? 0 : conjunctionDeg,
    parallelDeg: parallelDeg === 0 ? 0 : parallelDeg });
}

/** No locale dependency or input-order tie breaker. */
function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Pure pair matching. Coordinates must already share an instant and the true
 * chart frames; this function does not cast, rotate or authenticate them.
 * Null longitude (including an ecliptic pole) never acquires an assumed zero.
 * Parallels use signed declinations, independent of longitude and RA.
 */
export function findStarContacts(
  stars: readonly ContactStarPosition[], targets: readonly ContactTarget[], orbs: ContactOrbs
): StarContacts {
  const policy = checkedOrbs(orbs);
  if (!Array.isArray(stars) || !Array.isArray(targets)) throw new RangeError("Stars and targets must be arrays.");
  const starRows: ContactStarPosition[] = [];
  const targetRows: ContactTarget[] = [];
  const starIds = new Set<string>();
  const targetIds = { body: new Set<string>(), angle: new Set<string>() };
  // Validate and snapshot every row, even when no comparison will be made.
  for (const star of stars) {
    rowObject(star);
    const starId = checkedBodyLabel(star.starId);
    if (starIds.has(starId)) throw new RangeError("Contact star ids must be unique.");
    starIds.add(starId);
    const lonDeg = coordinate(star.lonDeg, true);
    const decDeg = coordinate(star.decDeg, false);
    if (decDeg === null) throw new RangeError("Contact stars require an available declination.");
    starRows.push({ starId, lonDeg, decDeg });
  }
  for (const target of targets) {
    rowObject(target);
    const targetId = checkedBodyLabel(target.targetId);
    const targetKind: ContactTarget["targetKind"] = target.targetKind;
    if (targetKind !== "body" && targetKind !== "angle") throw new RangeError("Contact target kind must be body or angle.");
    if (targetIds[targetKind].has(targetId)) throw new RangeError("Contact target ids must be unique within their kind.");
    targetIds[targetKind].add(targetId);
    targetRows.push({ targetId, targetKind, lonDeg: coordinate(target.lonDeg, true), decDeg: coordinate(target.decDeg, false) });
  }

  const matched: { hit: StarContact; exactOrb: ExactSum }[] = [];
  function include(star: ContactStarPosition, target: ContactTarget, kind: StarContactKind, exactOrb: ExactSum, maximum: number): void {
    if (compareExact(exactOrb, maximum) <= 0) {
      matched.push({ exactOrb, hit: Object.freeze({
        starId: star.starId, targetId: target.targetId, targetKind: target.targetKind,
        kind, orbDeg: roundedValue(exactOrb), maximumOrbDeg: maximum
      }) });
    }
  }
  for (const star of starRows) for (const target of targetRows) {
    if (policy.conjunctionDeg !== null && star.lonDeg !== null && target.lonDeg !== null) {
      // Inputs are normalized, so at most one turn is needed. Form the
      // complement before rounding; 360 - a rounded difference loses bits.
      const arc = absolute(exactSum(star.lonDeg, -target.lonDeg));
      const shortest = compareExact(arc, 180) <= 0 ? arc : absolute(exactSum(star.lonDeg, -target.lonDeg,
        star.lonDeg > target.lonDeg ? -360 : 360));
      include(star, target, "conjunction", shortest, policy.conjunctionDeg);
    }
    if (policy.parallelDeg !== null && target.decDeg !== null) {
      include(star, target, "parallel", absolute(exactSum(star.decDeg, -target.decDeg)), policy.parallelDeg);
    }
  }
  matched.sort((a, b) => compareExact(a.exactOrb, b.exactOrb) ||
    compareText(a.hit.starId, b.hit.starId) || compareText(a.hit.targetKind, b.hit.targetKind) ||
    compareText(a.hit.targetId, b.hit.targetId) || compareText(a.hit.kind, b.hit.kind));
  return Object.freeze({
    hits: Object.freeze(matched.map(({ hit }) => hit)), orbs: policy, conventions: STAR_CONTACT_CONVENTIONS
  });
}
