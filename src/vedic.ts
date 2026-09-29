/**
 * `@zodiacs/engine/vedic`: the sidereal zodiac and core Jyotish techniques.
 * docs/vedic.md is the guide.
 */
export { siderealChart } from "./vedic/chart.js";
export { AYANAMSAS, ayanamsa, userAyanamsa } from "./vedic/ayanamsa.js";
export type {
  AyanamsaDefinition,
  AyanamsaName,
  AyanamsaOptions,
  AyanamsaPrecessionModel,
  AyanamsaValue,
  CatalogueStar,
  EpochAyanamsa,
  LinearAyanamsa,
  StarAyanamsa,
  UserAyanamsaInput
} from "./vedic/ayanamsa.js";
export { declareSiderealLongitude, siderealLongitude } from "./vedic/sidereal.js";
export type { SiderealBody, SiderealChart, SiderealDeclaration, SiderealLongitude } from "./vedic/sidereal.js";
export { NAKSHATRAS, VIMSHOTTARI_LORDS, VIMSHOTTARI_YEARS, nakshatraOf } from "./vedic/nakshatra.js";
export type { NakshatraName, NakshatraPosition, VimshottariLord } from "./vedic/nakshatra.js";
export { VARGAS, vargaOf } from "./vedic/varga.js";
export type { VargaDefinition, VargaName, VargaPosition, VargaScheme } from "./vedic/varga.js";
export { KP_SUBS, SIGN_LORDS, kpLordsOf } from "./vedic/kp.js";
export type { KpLords, KpSub, SignLord } from "./vedic/kp.js";
export {
  ASHTOTTARI_YEARS,
  DASHA_LEVELS,
  DASHA_YEAR_DAYS,
  YOGINIS,
  ashtottariDasha,
  dashaSubperiods,
  vimshottariAt,
  vimshottariDasha,
  yoginiDasha
} from "./vedic/dasha.js";
export type {
  CycleOptions,
  DashaAtOptions,
  DashaLevelName,
  DashaOptions,
  DashaPeriod,
  DashaResult,
  DashaSystem,
  DashaYearLength
} from "./vedic/dasha.js";
