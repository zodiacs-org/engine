import { KM_PER_AU } from "astronomy-engine";
import { SKY_RADII_KM } from "../../src/sky.js";
import source from "../data/radii-source.json" with { type: "json" };

export const OCCULTATION_PLANETS = Object.freeze([
  "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"
] as const);
export type OccultationPlanet = (typeof OCCULTATION_PLANETS)[number];

export const OCCULTATION_RADII = Object.freeze({
  moonKm: SKY_RADII_KM.Moon,
  planetKm: Object.freeze(Object.fromEntries(OCCULTATION_PLANETS.map((body) =>
    [body, source.equatorialRadiusKm[body]])) as Record<OccultationPlanet, number>),
  earthEquatorialKm: source.equatorialRadiusKm.Earth,
  // Covers every height accepted by input.ts on the calc observer ellipsoid.
  maximumObserverElevationMeters: 100_000,
  observerEnvelopeKm: source.equatorialRadiusKm.Earth + 100,
  auKm: KM_PER_AU,
  source: Object.freeze({ ...source.source }),
  convention: source.convention
});
