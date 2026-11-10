import type { BirthInput } from "@zodiacs/engine";
import { parseNatalEnvelope, serializeNatalEnvelope } from "@zodiacs/engine/receipt";
import {
  gridCrossings, horizonLines, localSpaceLines, meridianLines, pathCrossings,
  planGrid, relocateChart, sampleAngles, sampleGrid
} from "../src/index.js";

// Invented instant and places. Engine comparisons are regression checks.
export const syntheticBirth = {
  utc: "2004-05-06T07:08:09.010Z", latitude: 12, longitude: 34,
  houseSystem: "placidus", deltaT: 65
} satisfies BirthInput;

/** Runnable tutorial: capture once, store/reload, then compute bounded geometry. */
export function runSyntheticWorkflow() {
  const chart = relocateChart(syntheticBirth, { latitude: 78, longitude: -180 });
  const stored = serializeNatalEnvelope(chart.relocated);
  const decoded = parseNatalEnvelope(stored);
  if (!decoded.ok) throw new Error(`Stored natal envelope rejected: ${decoded.code}`);
  const source = decoded.envelope;

  // Requested Placidus survives polar whole-sign fallback in the stored chart.
  const returned = relocateChart(source, { latitude: 12, longitude: 34 });
  const gridOptions = {
    bounds: { south: 75, north: 80, west: 175, east: -175 },
    latitudeStep: 5, longitudeStep: 10, maxSamples: 4
  };
  const gridPlan = planGrid(gridOptions); // No chart calculation in this planner.
  const grid = sampleGrid(source, gridOptions);
  const angles = sampleAngles(source, [
    { latitude: 78, longitude: -180 }, { latitude: 90, longitude: 0 }
  ], { bodies: ["Sun", "Moon"], maxEvaluations: 3 });

  const lineOptions = {
    bounds: { south: -90, north: 90, west: -180, east: 180 },
    latitudeStep: 40, bodies: ["Sun", "Moon"] as const, maxEvaluations: 64
  };
  const meridians = meridianLines(source, lineOptions);
  const horizons = horizonLines(source, lineOptions);
  const refinement = {
    bodies: ["Moon"] as const, lines: ["ASC"] as const, maxEvaluations: 128,
    maxRefinements: 32, coordinateTolerance: 0.01, residualTolerance: 0.01
  };
  const crossings = gridCrossings(source, {
    ...refinement, bounds: { south: -10, north: 10, west: 170, east: -165 },
    latitudeStep: 20, longitudeStep: 25
  });
  const path = pathCrossings(source, {
    ...refinement, from: { latitude: -10, longitude: 170 },
    to: { latitude: 10, longitude: -165 }, stepDegrees: 20
  });
  const localSpace = localSpaceLines(source, {
    origin: { latitude: 75, longitude: 175 }, lengthDegrees: 120,
    stepDegrees: 40, bodies: ["Sun", "Moon"], maxEvaluations: 64
  });
  // Keep full engine receipts and inspect status/unresolved metadata before use.
  return { chart, returned, gridPlan, grid, angles, meridians, horizons, crossings, path, localSpace };
}
