export { moonPhase, natalChart, positions, saturnReturn, synastry, transits } from "./api.js";
export type { NatalSource, SaturnReturnSource } from "./api.js";

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
  equalCusps,
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
  wholeSignCusps
} from "./houses.js";
export type { AngleInput } from "./houses.js";

export { DELTA_T_MODEL, DELTA_T_TABLE, deltaT, deltaTAt } from "./deltat.js";
export type { DeltaT, DeltaTSegment, DeltaTTable } from "./deltat.js";

export { REFERENCE_SPAN, outsideReferenceSpan } from "./reference-span.js";

export { findLongitudeCrossingsWith, searchLongitudeCrossingsWith } from "./crossings.js";
export type {
  BodyLongitudeAt,
  CrossingSearchOptions,
  CrossingSearchResult,
  LongitudeCrossing
} from "./crossings.js";

export {
  findLongitudeCrossings,
  groupIntoSeasons,
  searchLongitudeCrossings
} from "./returns.js";
export type { ReturnSeason, SaturnReturnResult } from "./returns.js";

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

export { ENGINE_VERSION, EPHEMERIS } from "./types.js";
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
