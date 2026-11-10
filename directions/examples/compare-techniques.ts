import {
  PROGRESSION_DAYS_PER_YEAR, progressedBodies, progressedInstant
} from "../../src/index.js";
import { directLongitudes, solarArc } from "../../src/timing.js";
import { hitFromNatal } from "../src/index.js";
import { prepareNatal } from "../src/natal.js";

/** Runnable integration example, not independent arc or ephemeris evidence. */
export function runExample() {
  // Invented instant and coordinates; no person's birth record is used.
  // UTC without a deltaT pin keeps the comparison APIs on their own engine clock.
  const birth = {
    utc: "2000-01-01T12:00:00Z",
    timeScale: "utc",
    timeKnown: true,
    latitude: 35,
    longitude: 15,
    houseSystem: "placidus"
  } as const;
  const targetUtc = "2020-01-01T12:00:00Z";
  const natal = prepareNatal(birth);
  const primaryDirection = hitFromNatal(natal, {
    convention: {
      system: "placidus-semiarc", mode: "mundane", latitude: "retain-both",
      motion: "direct", key: "ptolemy"
    },
    significator: { kind: "angle", angle: "mc" },
    promissor: { kind: "body", id: "Mars" },
    contact: { kind: "conjunction" },
    yearUnit: "tropical-365.2422-days"
  });
  if (primaryDirection.status !== "ok") {
    throw new Error(`Synthetic primary direction refused: ${primaryDirection.code}`);
  }

  // Reuse the public engine helpers. These calls do not feed the primary solver.
  const progressed = progressedInstant(birth.utc, targetUtc);
  const secondaryBodies = progressedBodies(birth.utc, targetUtc);
  const longitudeArc = solarArc(birth.utc, targetUtc);
  const directed = directLongitudes(
    natal.chart.bodies.map(row => ({ name: row.body, lon: row.lon })),
    longitudeArc.arc
  );

  return {
    synthetic: true,
    scope: "Engine integration comparison; no primary-direction accuracy claim",
    birth,
    primaryDirection,
    comparisons: {
      targetUtc,
      targetRelation: "Independent comparison target; not the primary hit's age or date",
      secondaryProgression: {
        helpers: "@zodiacs/engine:progressedInstant+progressedBodies",
        clock: "UTC Date milliseconds with no leap seconds; engine time basis for positions",
        elapsedYearDays: PROGRESSION_DAYS_PER_YEAR,
        elapsedDayMilliseconds: 86_400_000,
        progressedUtc: progressed.toISOString(),
        speedUnits: "degrees per ephemeris day at the progressed instant",
        bodies: secondaryBodies
      },
      longitudeSolarArc: {
        helpers: "@zodiacs/engine/timing:solarArc+directLongitudes",
        clock: "UTC inputs on the engine time basis; no chart deltaT pin",
        birthUtc: longitudeArc.birth.toISOString(),
        targetUtc: longitudeArc.target.toISOString(),
        progressedUtc: longitudeArc.progressed.toISOString(),
        natalSunLongitudeDegrees: longitudeArc.natalSun,
        progressedSunLongitudeDegrees: longitudeArc.progressedSun,
        arcLongitudeDegrees: longitudeArc.arc,
        directedLongitudes: directed,
        flags: longitudeArc.flags
      }
    }
  };
}
