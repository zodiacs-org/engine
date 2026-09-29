/**
 * Chart techniques moved from Zodiacs.org into the package: solar and lunar
 * returns, composite and Davison charts, the void-of-course Moon, aspect
 * patterns, essential dignities and mutual reception, and the Moon signs
 * possible over a date with an unknown birth time. This is the
 * `@zodiacs/engine/techniques` entry point; the root entry point does not
 * import it. See docs/techniques.md.
 *
 * @module
 */
export type { GeoPlace, TechniqueFlag } from "./techniques/shared.js";

export {
  LUNAR_RETURN_HORIZON_DAYS,
  LUNAR_RETURN_STEP_DAYS,
  SOLAR_RETURN_LOOKBACK_DAYS,
  SOLAR_RETURN_STEP_DAYS,
  SOLAR_RETURN_WINDOW_DAYS,
  lunarReturn,
  lunarReturnInstant,
  mostRecentSolarReturnInstant,
  solarReturn,
  solarReturnInstant
} from "./techniques/returns.js";
export type {
  LunarReturn,
  PlanetaryReturn,
  ReturnOptions,
  SolarReturn,
  SolarReturnOptions,
  SolarReturnSelection
} from "./techniques/returns.js";

export { compositeAspects, compositeChart, compositeMidpoints, davisonChart, davisonPlace } from "./techniques/relationship.js";
export type {
  CompositeAspect,
  CompositeChart,
  CompositePosition,
  DavisonChart,
  DavisonOptions,
  DavisonPlaceConvention
} from "./techniques/relationship.js";

export {
  VOID_BODIES,
  VOID_OF_COURSE_CONVENTION,
  VOID_OF_COURSE_MAX_DAYS,
  moonAspects,
  moonIngresses,
  voidOfCourseAt,
  voidOfCourseWindows
} from "./techniques/void-of-course.js";
export type {
  MoonAspect,
  MoonIngress,
  VoidBodies,
  VoidBody,
  VoidOfCourseOptions,
  VoidOfCourseStatus,
  VoidOfCourseWindow
} from "./techniques/void-of-course.js";

export { PATTERN_BODIES, aspectPatterns, chartAspectPatterns, patternContainment } from "./techniques/aspect-patterns.js";
export type {
  AspectPattern,
  AspectPatterns,
  PatternBody,
  PatternContainment,
  PatternEdge,
  PatternEdgeInput,
  PatternKind,
  PatternPoint
} from "./techniques/aspect-patterns.js";

export {
  CHALDEAN_FACES,
  CLASSICAL_PLANETS,
  DOMICILE_RULERS,
  EGYPTIAN_TERMS,
  EXALTATIONS,
  TRIPLICITY_LORDS,
  dignitiesFor,
  dignityFor,
  dignityRulersAt,
  essentialDignities,
  hasClassicalDignities,
  mutualReceptions
} from "./techniques/dignities.js";
export type {
  ClassicalPlanet,
  Debility,
  DignityRulers,
  DignitySpan,
  EssentialDignity,
  MutualReception,
  PlanetDignities,
  ReceptionOptions,
  SignDignity
} from "./techniques/dignities.js";

export { EVERY_ZONE_OFFSETS, MOON_SIGN_MAX_SPAN_DAYS, moonSignCandidates, moonSignsBetween } from "./techniques/moon-sign.js";
export type { MoonSignCandidates, MoonSignOptions } from "./techniques/moon-sign.js";
