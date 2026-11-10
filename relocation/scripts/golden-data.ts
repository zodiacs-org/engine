import type { BirthInput } from "@zodiacs/engine";
import { gridCrossings, horizonLines, localSpaceLines, meridianLines, pathCrossings } from "../src/index.js";
import type { GridCrossingOptions, HorizonLineOptions, LocalSpaceLineOptions,
  MeridianLineOptions, PathCrossingOptions, RelocationSource } from "../src/index.js";

// Invented instants and places. These outputs guard regressions only.
const source = { utc: "2004-05-06T07:08:09.010Z", latitude: 12, longitude: 34,
  houseSystem: "placidus", deltaT: 65 } as const;
const world = { south: -90, north: 90, west: -180, east: 180 };
const refinement = { bodies: ["Moon"], lines: ["ASC"], maxEvaluations: 128,
  maxRefinements: 32, coordinateTolerance: 0.01, residualTolerance: 0.01 } as const;

type CaseBase = { readonly id: string; readonly source: BirthInput };
export type GoldenCase = CaseBase & (
  | { readonly kind: "meridians"; readonly options: MeridianLineOptions }
  | { readonly kind: "horizons"; readonly options: HorizonLineOptions }
  | { readonly kind: "grid"; readonly options: GridCrossingOptions }
  | { readonly kind: "path"; readonly options: PathCrossingOptions }
  | { readonly kind: "local-space"; readonly options: LocalSpaceLineOptions }
);

export const goldenCases: readonly GoldenCase[] = [
  { id: "meridians-poles", kind: "meridians", source: { ...source, latitude: 80 },
    options: { bounds: world, latitudeStep: 30, bodies: ["Sun", "Moon"], maxEvaluations: 64 } },
  { id: "horizons-tangencies", kind: "horizons", source,
    options: { bounds: world, latitudeStep: 20, bodies: ["Sun", "Moon"], maxEvaluations: 64 } },
  { id: "horizons-wrapped-clipping", kind: "horizons", source,
    options: { bounds: { ...world, west: 170, east: -140 }, latitudeStep: 30,
      bodies: ["Sun", "Moon"], maxEvaluations: 64 } },
  { id: "grid-seam-crossings", kind: "grid", source,
    options: { ...refinement, bounds: { south: -10, north: 10, west: 170, east: -165 },
      latitudeStep: 20, longitudeStep: 25 } },
  { id: "grid-budget-stop", kind: "grid", source,
    options: { ...refinement, maxEvaluations: 5,
      bounds: { south: -10, north: 10, west: 170, east: -165 }, latitudeStep: 20, longitudeStep: 25 } },
  { id: "path-seam-crossing", kind: "path", source,
    options: { ...refinement, from: { latitude: -10, longitude: 170 },
      to: { latitude: 10, longitude: -165 }, stepDegrees: 20 } },
  { id: "path-polar-gap", kind: "path", source: { ...source, houseSystem: "koch" },
    options: { ...refinement, bodies: ["Sun"], lines: ["MC", "ASC"],
      from: { latitude: 80, longitude: 20 }, to: { latitude: 80, longitude: -160 }, stepDegrees: 15 } },
  { id: "local-space-seam-tt", kind: "local-space",
    source: { ...source, timeScale: "tt", deltaT: 72.25, houseSystem: "koch", latitude: -80 },
    options: { origin: { latitude: 75, longitude: 175 }, lengthDegrees: 120,
      stepDegrees: 40, bodies: ["Sun", "Moon"], maxEvaluations: 64 } }
];

/** Calls public pure library APIs, with no fixture values used as inputs. */
export function runGoldenCase(spec: GoldenCase, natal: RelocationSource = spec.source) {
  switch (spec.kind) {
    case "meridians": return meridianLines(natal, spec.options);
    case "horizons": return horizonLines(natal, spec.options);
    case "grid": return gridCrossings(natal, spec.options);
    case "path": return pathCrossings(natal, spec.options);
    case "local-space": return localSpaceLines(natal, spec.options);
  }
}
export type GoldenResult = ReturnType<typeof runGoldenCase>;

/** Compact regression output. Runtime results still retain every full receipt. */
export function projectGoldenResult(result: GoldenResult) {
  if (result.status !== "ok") throw new Error(`Golden case refused: ${result.reason}`);
  const { sampling, ...geometry } = result;
  return { ...geometry, sampling: {
    schema: sampling.schema,
    conventions: sampling.conventions,
    natalReceipt: sampling.natal.receipt,
    time: sampling.time,
    evaluations: sampling.evaluations,
    positions: sampling.positions,
    observers: sampling.samples.map((sample) => sample.status === "undefined"
      ? { index: sample.index, point: sample.point, status: sample.status, reason: sample.reason, engine: null }
      : { index: sample.index, point: sample.point, status: sample.status,
        engine: { armc: sample.engine.armc, requested: sample.engine.requested,
          system: sample.engine.system, flags: sample.engine.flags } })
  } };
}

/** Matching CLI requests let integration tests exercise the real launcher. */
export function goldenCliRequest(spec: GoldenCase) {
  const command = spec.kind === "grid" ? "grid" : "lines";
  const mode = spec.kind === "grid" ? "crossings"
    : spec.kind === "meridians" || spec.kind === "horizons" ? "angular" : spec.kind;
  const lines = spec.kind === "meridians" ? ["MC", "IC"] : ["ASC", "DSC"];
  const options = mode === "angular" ? { ...spec.options, lines } : spec.options;
  return { command, request: { source: spec.source, mode, options } } as const;
}
