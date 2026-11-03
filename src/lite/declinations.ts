/**
 * The declination part of `@zodiacs/engine/lite`: the root's declination
 * parallels and contraparallels, out-of-bounds flags and equatorial
 * coordinates (src/declination.ts), built into dist/lite-declinations.js.
 */
export {
  DEFAULT_DECLINATION_ORB_POLICY,
  RA_POLE_TOLERANCE,
  SUN_BOUND_LATITUDE,
  declinationOf,
  declinationOrb,
  declinationsForBodies,
  eclipticToEquatorial,
  findDeclinationAspects
} from "../declination.js";
export type {
  DeclinationAspect,
  DeclinationAspectType,
  DeclinationBody,
  DeclinationOrbPolicy,
  DeclinationRow,
  Declinations,
  EquatorialCoordinates
} from "../declination.js";
