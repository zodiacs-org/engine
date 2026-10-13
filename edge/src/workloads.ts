import {
  ENGINE_VERSION,
  EPHEMERIS,
  HOUSE_SYSTEMS,
  computeAngles,
  computeHouses,
  natalChart,
  searchLongitudeCrossings
} from "../../src/index.js";
import type { AngleInput, BirthInput } from "../../src/index.js";

export { HOUSE_SYSTEMS };

// Invented inputs for compatibility and performance checks, not personal data
// or independent astronomical reference values. No clock or random input.
export const CHART_CASES = Object.freeze(([
  { id: "whole-utc", input: { utc: "2000-03-20T12:34:56Z", latitude: 35.25, longitude: -110.75, houseSystem: "whole" } },
  { id: "southern-placidus", input: { utc: "1987-08-14T03:21:00Z", latitude: -33.5, longitude: 151.25, houseSystem: "placidus" } },
  { id: "polar-koch", input: { utc: "2024-12-03T07:08:09Z", latitude: 78, longitude: 16, houseSystem: "koch" } },
  { id: "untimed", input: { utc: "2001-02-03T08:30:00Z", timeKnown: false } }
] satisfies ReadonlyArray<{ id: string; input: BirthInput }>).map(
  ({ id, input }) => Object.freeze({ id, input: Object.freeze(input) })
));

export const HOUSE_CASES = Object.freeze([
  { id: "north", input: { gastHours: 8.25, latitude: 35.25, longitude: -110.75, obliquity: 23.44 } },
  { id: "south", input: { gastHours: 19.5, latitude: -33.5, longitude: 151.25, obliquity: 23.44 } },
  { id: "polar", input: { gastHours: 2.5, latitude: 78, longitude: 16, obliquity: 23.44 } }
].map(({ id, input }) => Object.freeze({ id, input: Object.freeze(input satisfies AngleInput) })));

export const TRANSIT_CASE = Object.freeze({
  body: "Sun" as const,
  longitude: 0,
  from: "2000-03-01T00:00:00Z",
  to: "2000-04-01T00:00:00Z",
  options: Object.freeze({ stepDays: 1, maxSamples: 1024 })
});

export function chartWorkload() {
  return CHART_CASES.map(({ id, input }) => ({ id, result: natalChart(input) }));
}

export function housesWorkload() {
  return HOUSE_CASES.flatMap(({ id, input }) => {
    const angles = computeAngles(input);
    return HOUSE_SYSTEMS.map((system) => ({
      id,
      system,
      angles,
      result: computeHouses(system, input, angles)
    }));
  });
}

export function transitScanWorkload() {
  const { body, longitude, from, to, options } = TRANSIT_CASE;
  return searchLongitudeCrossings(body, longitude, from, to, options);
}

export function runSmokeCases() {
  return {
    schema: "edge-smoke/1" as const,
    engineVersion: ENGINE_VERSION,
    ephemeris: EPHEMERIS,
    charts: chartWorkload(),
    houses: housesWorkload(),
    transitScan: transitScanWorkload()
  };
}
