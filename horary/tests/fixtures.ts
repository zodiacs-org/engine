import type { Chart } from "../../src/types.js";
import { normalizeHoraryInput } from "../src/index.js";
import type { HoraryCast, HoraryInput } from "../src/index.js";

// Invented instant and coordinate pair; not a person's birth information.
// See fixtures.md for the calendar arithmetic and the schematic chart.
export const questionInput = {
  instant: "2000-01-01T12:00:00Z",
  location: { latitude: 12, longitude: 34 },
  question: { id: "lost-object", quesitedHouse: 2 }
} as const satisfies HoraryInput;

/** Hand-written chart for adapter tests, not an ephemeris at questionInput. */
export function schematicChart(): Chart {
  return {
    input: {
      utc: new Date("2000-01-01T12:00:00Z"),
      latitude: 12,
      longitude: 34,
      houseSystem: "whole",
      timeKnown: true
    },
    angles: { asc: 15, dsc: 195, mc: 285, ic: 105 },
    houses: { system: "whole", cusps: [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330] },
    bodies: [
      { body: "Sun", lon: 10, lat: 0, speed: 1, retrograde: false, sign: "aries", degree: 10 },
      { body: "Moon", lon: 40, lat: 0, speed: 12, retrograde: false, sign: "taurus", degree: 10 },
      { body: "Mercury", lon: 70, lat: 0, speed: 2, retrograde: false, sign: "gemini", degree: 10 },
      { body: "Venus", lon: 100, lat: 0, speed: 1, retrograde: false, sign: "cancer", degree: 10 },
      { body: "Mars", lon: 130, lat: 0, speed: 0.5, retrograde: false, sign: "leo", degree: 10 },
      { body: "Jupiter", lon: 160, lat: 0, speed: -0.125, retrograde: true, sign: "virgo", degree: 10 },
      { body: "Saturn", lon: 190, lat: 0, speed: 0.0625, retrograde: false, sign: "libra", degree: 10 }
    ],
    aspects: [],
    flags: [],
    deltaT: { seconds: 0, sigma: null, model: "pinned", table: null, tableDigest: null, segment: "pinned" },
    timeScale: { input: "utc", basis: "pinned", ut1MinusUtc: null, leapSeconds: null },
    engineVersion: "synthetic-adapter-fixture"
  };
}

export function aspectFixture(a = 0, b = 6, aSpeed = 1, bSpeed = 0): HoraryCast {
  const chart = schematicChart(); // Aries first cusp => Mars; Taurus second => Venus; plus Moon.
  for (const row of chart.bodies) {
    if (row.body === "Mars") Object.assign(row, { lon: a, speed: aSpeed });
    if (row.body === "Venus") Object.assign(row, { lon: b, speed: bSpeed });
    if (row.body === "Moon") Object.assign(row, { lon: 180, speed: 0 });
  }
  return { schema: "horary.cast/v1", input: normalizeHoraryInput(questionInput),
    chart: { ...chart, angles: chart.angles!, houses: chart.houses! } };
}
