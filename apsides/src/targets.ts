/** Body names accepted by the distance sampler. Earth is included. */
export const PLANETARY_BODIES = Object.freeze([
  "Mercury", "Venus", "Earth", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"
] as const);

export type PlanetaryBody = (typeof PLANETARY_BODIES)[number];
export type ApsisBody = "Moon" | PlanetaryBody;
export type DistanceCenter = "geocentric" | "heliocentric";

/** The reference target convention used in the engine's Horizons comparisons. */
export interface DistanceTarget {
  readonly body: ApsisBody;
  readonly center: DistanceCenter;
  readonly referencePoint: "body-center" | "system-barycenter";
  readonly horizonsTarget: string;
  readonly horizonsCenter: "500@399" | "500@10";
}

const target = (
  body: ApsisBody,
  horizonsTarget: string,
  referencePoint: DistanceTarget["referencePoint"] = "body-center"
): DistanceTarget => Object.freeze({
  body,
  center: body === "Moon" ? "geocentric" : "heliocentric",
  referencePoint,
  horizonsTarget,
  horizonsCenter: body === "Moon" ? "500@399" : "500@10"
});

// See SOURCES.md and the engine calc-api preregistration. A system barycentre
// must not be silently presented as the physical planet's center.
export const DISTANCE_TARGETS: Readonly<Record<ApsisBody, DistanceTarget>> = Object.freeze({
  Moon: target("Moon", "301"),
  Mercury: target("Mercury", "199"),
  Venus: target("Venus", "299"),
  Earth: target("Earth", "399"),
  Mars: target("Mars", "4", "system-barycenter"),
  Jupiter: target("Jupiter", "5", "system-barycenter"),
  Saturn: target("Saturn", "6", "system-barycenter"),
  Uranus: target("Uranus", "7", "system-barycenter"),
  Neptune: target("Neptune", "8", "system-barycenter"),
  Pluto: target("Pluto", "9", "system-barycenter")
});

export function distanceTarget(body: ApsisBody): DistanceTarget {
  if (typeof body !== "string" || !Object.hasOwn(DISTANCE_TARGETS, body)) {
    throw new RangeError("Unsupported apsides body.");
  }
  return DISTANCE_TARGETS[body];
}
