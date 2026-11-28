import { catalog } from "./catalog.js";
import { findStarContacts, STAR_CONTACT_CONVENTIONS } from "./contacts.js";
import type { ContactOrbs, ContactTarget, StarContact } from "./contacts.js";
import { chartDeclinations, createNatalEnvelope, eclipticToEquatorial, natalChart } from "./engine.js";
import type { BirthInput, Chart, NatalEnvelope } from "./engine.js";
import { starPositions, STAR_POSITION_CONVENTIONS } from "./positions.js";
import type { StarPositions } from "./positions.js";
import type { CatalogStar } from "./types.js";

const ANGLES = [
  ["asc", "Ascendant"], ["mc", "Midheaven"],
  ["dsc", "Descendant"], ["ic", "Imum Coeli"]
] as const;

export const NATAL_STAR_CONVENTIONS = Object.freeze({
  stars: STAR_POSITION_CONVENTIONS,
  contacts: STAR_CONTACT_CONVENTIONS,
  alignment: "chart-input-clock;true-equator-and-equinox-of-date",
  bodies: "all-natal-body-rows;including-true-lunar-nodes;full-ecliptic-latitude",
  angles: "available-natal-angles;ecliptic-points-at-zero-latitude",
  unavailableAngles: "omitted;no-inferred-location-or-time",
  correctionScope: "stellar-directions-omit-corrections-listed-in-stars;body-corrections-in-natal-receipt",
  receiptScope: "native-natal-envelope-covers-chart-only;targets-stars-and-hits-not-included"
} as const);

export interface NatalStarHits {
  /** One native engine envelope for the natal chart underlying every hit. */
  readonly natal: NatalEnvelope;
  readonly stellar: StarPositions;
  readonly targets: readonly ContactTarget[];
  readonly hits: readonly StarContact[];
  readonly orbs: ContactOrbs;
  readonly conventions: typeof NATAL_STAR_CONVENTIONS;
}

/**
 * Derive matching rows from an existing chart without casting it again.
 * Supplied chart coordinates remain caller claims, under chartDeclinations'
 * validation and clock rules. This helper creates no receipt. Angle parallels
 * refer to ecliptic points, not the observer's zenith or celestial poles.
 */
export function chartContactTargets(chart: Chart): readonly ContactTarget[] {
  if (!chart || !Array.isArray(chart.bodies) || !Array.isArray(chart.aspects) ||
      !(chart.input?.utc instanceof Date)) {
    throw new RangeError("chartContactTargets requires an existing engine Chart.");
  }
  const equatorial = chartDeclinations(chart);
  const targets: ContactTarget[] = equatorial.rows.map((row) => ({
    targetId: row.body, targetKind: "body", lonDeg: row.lon, decDeg: row.dec
  }));
  if (chart.angles !== null) {
    for (const [key, targetId] of ANGLES) {
      const lonDeg = chart.angles[key];
      targets.push({
        targetId, targetKind: "angle", lonDeg,
        decDeg: eclipticToEquatorial(lonDeg, 0, equatorial.trueObliquity).dec
      });
    }
  }
  // Reuse the matcher's coordinate/id validation even when there are no stars.
  findStarContacts([], targets, { conjunctionDeg: null, parallelDeg: null });
  return Object.freeze(targets.map((target) => Object.freeze(target)));
}

/** Freeze only newly allocated result graphs, never the caller's input. */
function freezeResult<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeResult(child);
    Object.freeze(value);
  }
  return value;
}

/**
 * Cast one natal chart, place catalog directions on its captured clock, match
 * bodies and available angles, and retain the native chart envelope once.
 * No network, files, sky searches, or inferred birth-time conventions.
 */
export function natalStarHits(
  birth: BirthInput, orbs: ContactOrbs, stars: readonly CatalogStar[] = catalog
): NatalStarHits {
  // Validate and capture the orb policy before making any engine chart call.
  const policy = findStarContacts([], [], orbs).orbs;
  const chart = natalChart(birth);
  const natal = createNatalEnvelope(chart);
  const targets = chartContactTargets(chart);
  // Use the canonical chart input, not a second read of the caller's fields
  // and not a new pin made from the chart's evaluated Delta T.
  const stellar = starPositions(chart.input, stars);
  const contacts = findStarContacts(stellar.positions, targets, policy);
  return freezeResult({ natal, stellar, targets, hits: contacts.hits,
    orbs: contacts.orbs, conventions: NATAL_STAR_CONVENTIONS });
}
