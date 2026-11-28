import { sectOf } from "../../src/points.js";
import {
  CLASSICAL_PLANETS, dignityRulersAt, essentialDignities, hasClassicalDignities
} from "../../src/techniques/dignities.js";
import type { ClassicalPlanet, PlanetDignities } from "../../src/techniques/dignities.js";
import type { Angles, BodyName, Sect, ZodiacSign } from "../../src/types.js";
import type { AngleName } from "./angularity.js";

/** Supplied chart longitudes; castEventChart results satisfy this interface. */
export interface AngleRulerGeometry {
  readonly angles: Readonly<Angles>;
  readonly bodies: readonly { readonly body: BodyName; readonly lon: number }[];
}

export interface AngleRuler {
  readonly angle: AngleName;
  /** The angle's ecliptic longitude in degrees. */
  readonly longitude: number;
  readonly sign: ZodiacSign;
  readonly ruler: ClassicalPlanet;
  /** Essential dignities at the ruler's own position, not at the angle. */
  readonly condition: PlanetDignities;
}

export interface AngleRulerAnalysis {
  readonly label: "traditional conventions, not predictions";
  readonly sect: Sect;
  readonly convention: {
    readonly angleRuler: "traditional-domicile";
    readonly sectMethod: "engine-sectOf-on-ascendant-and-sun";
    readonly horizonBoundary: "sun-on-ascendant-night;sun-on-descendant-day";
    readonly triplicity: "dorothean-chart-sect-lord;participating-not-counted";
    readonly terms: "egyptian";
    readonly faces: "chaldean";
    readonly peregrine: "no-essential-dignity";
  };
  /** One row per angle in asc, mc, dsc, ic order, including repeated rulers. */
  readonly rulers: readonly AngleRuler[];
}

const ANGLES: readonly AngleName[] = Object.freeze(["asc", "mc", "dsc", "ic"]);
const CONVENTION: AngleRulerAnalysis["convention"] = Object.freeze({
  angleRuler: "traditional-domicile",
  sectMethod: "engine-sectOf-on-ascendant-and-sun",
  horizonBoundary: "sun-on-ascendant-night;sun-on-descendant-day",
  triplicity: "dorothean-chart-sect-lord;participating-not-counted",
  terms: "egyptian",
  faces: "chaldean",
  peregrine: "no-essential-dignity"
});

function record(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new RangeError(`${label} must be an object.`);
  }
}

function longitude(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value >= 360) {
    throw new RangeError("angle-ruler longitudes must be finite degrees in [0, 360).");
  }
  return value;
}

/**
 * Use the engine's sect rule, domicile table and essentialDignities on supplied
 * longitudes. No recasting, scoring or prediction. Validation establishes field
 * shapes only; it does not authenticate geometry or astronomical provenance.
 */
export function analyzeAngleRulers(chart: AngleRulerGeometry): AngleRulerAnalysis {
  record(chart, "angle-ruler geometry");
  record(chart.angles, "angles");
  const angles = ANGLES.map(angle => ({ angle, longitude: longitude(chart.angles[angle]) }));
  if (!Array.isArray(chart.bodies)) throw new RangeError("angle rulers require body rows.");
  const classical = new Map<ClassicalPlanet, number>();
  const seen = new Set<BodyName>();
  for (const row of chart.bodies) {
    record(row, "body row");
    const body = row.body as BodyName;
    // The engine validates body identifiers, including valid unselected bodies.
    const selected = hasClassicalDignities(body);
    const lon = longitude(row.lon);
    if (seen.has(body)) throw new RangeError("angle rulers require unique body rows.");
    seen.add(body);
    if (selected) classical.set(body as ClassicalPlanet, lon);
  }
  if (classical.size !== CLASSICAL_PLANETS.length) {
    throw new RangeError("angle rulers require every classical planet.");
  }
  const sect = sectOf(angles[0]!.longitude, classical.get("Sun")!);
  const rulers = angles.map(angle => {
    const { sign, domicile: ruler } = dignityRulersAt(angle.longitude);
    return Object.freeze({
      ...angle, sign, ruler,
      condition: essentialDignities(ruler, classical.get(ruler)!, sect)
    });
  });
  return Object.freeze({
    label: "traditional conventions, not predictions",
    sect, convention: CONVENTION, rulers: Object.freeze(rulers)
  });
}
