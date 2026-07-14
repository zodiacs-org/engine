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
  findAspects,
  matchAspect,
  separation
} from "./aspects.js";
export type { AspectDefinition } from "./aspects.js";

export {
  HOUSE_SYSTEMS,
  computeAngles,
  computeHouses,
  houseOf,
  meanObliquity,
  placidusCusps,
  ramcOf,
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
