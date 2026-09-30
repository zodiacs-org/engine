/**
 * Traditional timing techniques: annual and monthly profections, firdaria,
 * zodiacal releasing and solar arc directions, and planetary returns. This is
 * the `@zodiacs/engine/timing` entry point, kept out of the root entry point
 * so that code which does not use it does not carry it.
 * See docs/timing-hellenistic.md, and docs/houses.md for planetary returns.
 *
 * @module
 */
export { CHALDEAN_ORDER, TRADITIONAL_RULERS } from "./timing/rulers.js";
export type { TraditionalPlanet } from "./timing/rulers.js";
export type { AngleName, ChartLongitudeName, TimingFlag, TimingOrigin } from "./timing/shared.js";

export {
  DEFAULT_PROFECTION_MONTHS,
  PROFECTION_MONTH_CONVENTIONS,
  annualProfection,
  profectionAt,
  profectionYear
} from "./timing/profections.js";
export type {
  AnnualProfection,
  ProfectionAt,
  ProfectionConventions,
  ProfectionMonth,
  ProfectionMonthConvention,
  ProfectionOptions,
  ProfectionOrigin,
  ProfectionSpan,
  ProfectionYear,
  ProfectionYearSpan
} from "./timing/profections.js";

export {
  DEFAULT_FIRDARIA_VARIANT,
  FIRDARIA_CYCLE_YEARS,
  FIRDARIA_VARIANTS,
  FIRDARIA_YEARS,
  firdaria,
  firdariaAt,
  firdariaPeriods,
  firdariaSequence
} from "./timing/firdaria.js";
export type {
  DatedFirdariaPeriod,
  DatedFirdariaSubPeriod,
  FirdariaAt,
  FirdariaConventions,
  FirdariaLord,
  FirdariaOptions,
  FirdariaPeriod,
  FirdariaSubPeriod,
  FirdariaTimeline,
  FirdariaTimelineOptions,
  FirdariaVariant
} from "./timing/firdaria.js";

export {
  DEFAULT_RELEASING_YEARS,
  RELEASING_CYCLE_UNITS,
  RELEASING_UNIT_DAYS,
  RELEASING_YEAR_CONVENTIONS,
  VALENS_MINOR_YEARS,
  releasingAt,
  releasingPeriods,
  zodiacalReleasing,
  zodiacalReleasingAt
} from "./timing/releasing.js";
export type {
  ReleasingAt,
  ReleasingAtOptions,
  ReleasingConventions,
  ReleasingLevel,
  ReleasingLot,
  ReleasingOptions,
  ReleasingOrigin,
  ReleasingPeriod,
  ReleasingTimeline,
  ReleasingYearConvention
} from "./timing/releasing.js";

export { directLongitudes, solarArc, solarArcDirections } from "./timing/solar-arc.js";
export type { DirectedLongitude, DirectedPosition, SolarArc, SolarArcDirections } from "./timing/solar-arc.js";

export { RETURN_BODIES, RETURN_STEP_DAYS, planetaryReturns } from "./timing/planetary-returns.js";
export type {
  PlanetaryReturn,
  PlanetaryReturnOptions,
  PlanetaryReturns,
  ReturnBody
} from "./timing/planetary-returns.js";
