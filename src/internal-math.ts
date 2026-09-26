/**
 * Lightweight Zodiacs.org compatibility entry point.
 *
 * It deliberately excludes the ephemeris dependency so eager site modules can
 * share house and aspect math without pulling the dynamic chart chunk into the
 * application shell. This subpath is internal and may change without notice.
 *
 * @internal
 */
export {
  ASPECTS,
  ASPECT_BODIES,
  ASPECT_TYPES,
  STATIONARY_RELATIVE_SPEED,
  aspectMotion,
  findAspects,
  matchAspect,
  separation
} from "./aspects.js";
export type { AspectDefinition, AspectMotion } from "./aspects.js";

export {
  HOUSE_SYSTEMS,
  PLACIDUS_POLAR_FALLBACK,
  POLAR_FALLBACK,
  POLAR_UNDEFINED_HOUSE_SYSTEMS,
  alcabitiusCusps,
  campanusCusps,
  computeAngles,
  computeHouses,
  eastPointOf,
  equalCusps,
  equalMcCusps,
  houseOf,
  isPolarUndefinedHouseSystem,
  kochCusps,
  meanObliquity,
  meridianCusps,
  morinusCusps,
  placidusCusps,
  porphyryCusps,
  ramcOf,
  regiomontanusCusps,
  topocentricCusps,
  vehlowCusps,
  vertexOf,
  wholeSignCusps
} from "./houses.js";
export type { AngleInput } from "./houses.js";

export { normalizeLongitude } from "./signs.js";
export { ENGINE_VERSION } from "./types.js";
export type {
  Angles,
  Aspect,
  AspectType,
  BodyName,
  BodyPosition,
  Chart,
  ChartFlag,
  ChartInput,
  HouseNumber,
  Houses,
  HouseSystem
} from "./types.js";
