export { moonPhase, natalChart, positions, saturnReturn, synastry, transits } from "./api.js";
export type { NatalSource, SaturnReturnSource } from "./api.js";

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

export { findLongitudeCrossings, groupIntoSeasons } from "./returns.js";
export type { LongitudeCrossing, ReturnSeason, SaturnReturnResult } from "./returns.js";

export {
  ELEMENTS,
  MODALITIES,
  SIGNS,
  SIGN_NAMES,
  degreeInSign,
  normalizeLongitude,
  signForLongitude,
  signIndexForLongitude
} from "./signs.js";

export { elementBalance, findInterAspects, modalityBalance, summarizePair } from "./synastry.js";

export { ENGINE_VERSION } from "./types.js";
export type {
  Angles,
  Aspect,
  AspectType,
  BirthInput,
  BodyName,
  BodyPosition,
  Chart,
  ChartFlag,
  ChartInput,
  DateInput,
  Element,
  HouseNumber,
  Houses,
  HouseSystem,
  InterAspect,
  MinimalBody,
  Modality,
  MoonPhase,
  MoonPhaseName,
  PairSummary,
  Polarity,
  SignDefinition,
  SynastryResult,
  TransitResult,
  ZodiacSign
} from "./types.js";
