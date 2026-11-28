import { absolute, compareExact, exactSum, roundedValue } from "../../src/exact.js";
import { HOUSE_SYSTEMS, houseOf } from "../../src/houses.js";
import { CLASSICAL_PLANETS, hasClassicalDignities } from "../../src/techniques/dignities.js";
import type { ClassicalPlanet } from "../../src/techniques/dignities.js";
import type { Angles, BodyName, HouseNumber } from "../../src/types.js";
import type { EventChart } from "./chart.js";

export type AngleName = keyof Angles;

/** Minimal chart geometry, also accepted from castEventChart. */
export interface AngularityGeometry {
  readonly angles: Readonly<Angles>;
  readonly houses: EventChart["houses"];
  readonly bodies: readonly { readonly body: BodyName; readonly lon: number }[];
}

export interface AngularityOptions {
  /** Inclusive ecliptic longitude orb, degrees; a project choice, default 5. */
  readonly angleOrbDegrees?: number;
}

export interface NearAngle {
  readonly angle: AngleName;
  readonly longitude: number;
  /** Short circular distance in longitude, degrees, rounded once. */
  readonly separationDegrees: number;
}

export interface PlanetAngularity {
  readonly planet: ClassicalPlanet;
  readonly longitude: number;
  readonly house: HouseNumber;
  readonly angularHouse: boolean;
  readonly nearAngles: readonly NearAngle[];
  /** True if in an angular house or within the orb of any angle. */
  readonly angular: boolean;
}

export interface AngularityAnalysis {
  readonly label: "traditional conventions, not predictions";
  readonly convention: {
    readonly planets: readonly ClassicalPlanet[];
    readonly angularHouses: readonly HouseNumber[];
    readonly houseMethod: "engine-houseOf-on-actual-cusps;no-cusp-orb";
    readonly angleMethod: "short-ecliptic-longitude-distance;latitude-ignored";
    readonly angleOrbDegrees: number;
    readonly orbBoundary: "inclusive-exact-binary64;reported-distance-rounded";
    readonly combination: "angular-house-or-near-angle";
  };
  readonly houses: Pick<EventChart["houses"], "requested" | "actual">;
  /** All classical planets, in the engine dignity table's order. */
  readonly planets: readonly PlanetAngularity[];
  readonly angularPlanets: readonly ClassicalPlanet[];
}

const ANGLES: readonly AngleName[] = Object.freeze(["asc", "mc", "dsc", "ic"]);
const ANGULAR_HOUSES: readonly HouseNumber[] = Object.freeze([1, 4, 7, 10]);

function record(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new RangeError(`${label} must be an object.`);
  }
}

function longitude(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value >= 360) {
    throw new RangeError("angularity longitudes must be finite degrees in [0, 360).");
  }
  return value;
}

/**
 * Analyze supplied geometry without casting or changing the chart. House
 * membership is the engine's longitude-only houseOf, including its boundary
 * arithmetic. Angle-orb comparisons use the engine's exact binary64 sums.
 * This validates the fields used, not the physical authenticity of a chart.
 */
export function analyzeAngularity(
  chart: AngularityGeometry, options: AngularityOptions = {}
): AngularityAnalysis {
  record(options, "angularity options");
  if (Object.keys(options).some(key => key !== "angleOrbDegrees")) {
    throw new RangeError("angularity options accept only angleOrbDegrees.");
  }
  const suppliedOrb = options.angleOrbDegrees;
  const orb = suppliedOrb === undefined ? 5 : suppliedOrb;
  if (typeof orb !== "number" || !Number.isFinite(orb) || orb < 0 || orb > 180) {
    throw new RangeError("angleOrbDegrees must be finite degrees from 0 to 180.");
  }
  record(chart, "angularity geometry");
  record(chart.angles, "angles");
  record(chart.houses, "houses");
  const { requested, actual } = chart.houses;
  if (!HOUSE_SYSTEMS.includes(requested) || !HOUSE_SYSTEMS.includes(actual)) {
    throw new RangeError("angularity requires supported requested and actual house systems.");
  }
  const angles = ANGLES.map(angle => ({ angle, longitude: longitude(chart.angles[angle]) }));
  if (!Array.isArray(chart.houses.cusps) || chart.houses.cusps.length !== 12) {
    throw new RangeError("angularity requires the actual chart's house cusps.");
  }
  // Array.from visits sparse slots, so holes cannot evade longitude validation.
  const cusps = Array.from(chart.houses.cusps, longitude);
  if (!Array.isArray(chart.bodies)) throw new RangeError("angularity requires body rows.");
  const classical = new Map<ClassicalPlanet, number>();
  const seen = new Set<BodyName>();
  for (const row of chart.bodies) {
    record(row, "body row");
    // hasClassicalDignities validates runtime names before selection.
    const body = row.body as BodyName;
    const lon = row.lon;
    const selected = hasClassicalDignities(body);
    const where = longitude(lon);
    if (seen.has(body)) throw new RangeError("angularity requires unique body rows.");
    seen.add(body);
    if (selected) classical.set(body as ClassicalPlanet, where);
  }
  if (classical.size !== CLASSICAL_PLANETS.length) {
    throw new RangeError("angularity requires every classical planet.");
  }
  const planets = CLASSICAL_PLANETS.map(planet => {
    const lon = classical.get(planet)!;
    const house = houseOf(lon, cusps);
    const nearAngles: NearAngle[] = [];
    for (const angle of angles) {
      let distance = absolute(exactSum(lon, -angle.longitude));
      if (compareExact(distance, 180) > 0) distance = absolute(exactSum(distance, -360));
      if (compareExact(distance, orb) <= 0) {
        nearAngles.push(Object.freeze({
          ...angle, separationDegrees: roundedValue(distance)
        }));
      }
    }
    const angularHouse = ANGULAR_HOUSES.includes(house);
    return Object.freeze({
      planet, longitude: lon, house, angularHouse,
      nearAngles: Object.freeze(nearAngles), angular: angularHouse || nearAngles.length > 0
    });
  });
  return Object.freeze({
    label: "traditional conventions, not predictions",
    convention: Object.freeze({
      planets: CLASSICAL_PLANETS,
      angularHouses: ANGULAR_HOUSES,
      houseMethod: "engine-houseOf-on-actual-cusps;no-cusp-orb",
      angleMethod: "short-ecliptic-longitude-distance;latitude-ignored",
      angleOrbDegrees: orb,
      orbBoundary: "inclusive-exact-binary64;reported-distance-rounded",
      combination: "angular-house-or-near-angle"
    }),
    houses: Object.freeze({ requested, actual }),
    planets: Object.freeze(planets),
    angularPlanets: Object.freeze(planets.filter(row => row.angular).map(row => row.planet))
  });
}
