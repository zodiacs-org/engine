import { hitFromNatal, scanFromNatal } from "../src/index.js";
import type { DirectionNatalInput, NatalHitSelection } from "../src/index.js";
import { prepareNatal } from "../src/natal.js";
import { prepareSolarEquatorialDay } from "../src/solar.js";

// Invented chart. The ISO label is on TT, not UTC, because timeScale is tt.
// The same instant expressed as a TT Julian date is the J2000 epoch 2451545.
export const syntheticBirth = {
  utc: "2000-01-01T12:00:00Z", timeScale: "tt", timeKnown: true,
  latitude: 35, longitude: 15, houseSystem: "placidus", deltaT: 64
} as const satisfies DirectionNatalInput;

/** Engine integration example, never an independent arc or ephemeris reference. */
export function runExample() {
  const natal = prepareNatal(syntheticBirth);
  const selection = {
    significator: { kind: "body", id: "Sun" },
    promissor: { kind: "body", id: "Mars" },
    contact: { kind: "conjunction" }
  } as const;
  const fixedHit = hitFromNatal(natal, {
    ...selection,
    convention: {
      system: "placidus-semiarc", mode: "mundane", latitude: "retain-both",
      motion: "direct", key: "naibod"
    },
    yearUnit: "julian-365.25-days"
  });
  if (fixedHit.status !== "ok") throw new Error(`${fixedHit.stage}: ${fixedHit.code}`);

  const contacts = scanFromNatal(natal, {
    convention: {
      system: "placidus-semiarc", mode: "mundane", latitude: "retain-both", key: "ptolemy"
    },
    selections: [selection],
    motions: [
      { motion: "direct" },
      { motion: "converse", converseConstruction: "placidus-role-swap" }
    ],
    yearUnit: "tropical-365.2422-days",
    ageRange: { fromYears: 0, toYears: 360, includeFrom: true, includeTo: false },
    maxEvaluations: 2
  });
  if (contacts.status !== "complete") throw new Error(`${contacts.stage}: ${contacts.code}`);

  // Explicit opt-in sampling. Keep the provenance beside the mathematical hit.
  const solar = prepareSolarEquatorialDay({
    time: { jd: 2451545, scale: syntheticBirth.timeScale, deltaT: syntheticBirth.deltaT },
    dayScale: "tt"
  });
  const solarSelection = {
    ...selection,
    convention: {
      system: "placidus-semiarc", mode: "mundane", latitude: "retain-both",
      motion: "direct", key: "solar-equatorial-birth-day"
    },
    yearUnit: "julian-365.25-days",
    solar: solar.samples
  } as const satisfies NatalHitSelection;
  const solarHit = hitFromNatal(natal, solarSelection);
  if (solarHit.status !== "ok") throw new Error(`${solarHit.stage}: ${solarHit.code}`);

  return {
    basis: "engine-integration-only", fixedHit, contacts, solarHit,
    solarProvenance: solar.provenance,
    solarRequest: { source: "natal", birth: syntheticBirth, request: solarSelection }
  };
}
