import { hit, parseHit } from "../src/index.js";
import type {
  HitInput, HitResult, DirectionHit, HitRefusal, SolarEquatorialDay,
  AngleDirectionErrorCode, TimingErrorCode, SphereGeometryErrorCode
} from "../src/index.js";

const zodiacal = {
  convention: {
    system: "placidus-semiarc", mode: "zodiacal", motion: "direct",
    latitude: "zero-both", key: "ptolemy"
  },
  geometry: { ramcDegrees: 0, latitudeDegrees: 0, trueObliquityDegrees: 0 },
  significator: { kind: "body", id: "S", coordinates: { longitudeDegrees: 350, latitudeDegrees: 4 } },
  promissor: { kind: "body", id: "P", coordinates: { longitudeDegrees: 10, latitudeDegrees: -7 } },
  contact: { kind: "conjunction" }, yearUnit: "tropical-365.2422-days"
} as const satisfies HitInput;
const mundane = {
  convention: {
    system: "placidus-semiarc", mode: "mundane", motion: "converse",
    converseConstruction: "placidus-role-swap", latitude: "retain-both", key: "naibod"
  },
  geometry: { ramcDegrees: 0, latitudeDegrees: 45 },
  significator: { kind: "body", id: "S", coordinates: { rightAscensionDegrees: 320, declinationDegrees: 20 } },
  promissor: { kind: "body", id: "P", coordinates: { rightAscensionDegrees: 30, declinationDegrees: -20 } },
  contact: { kind: "aspect", aspect: "square", branch: "eastward" }, yearUnit: "julian-365.25-days"
} as const satisfies HitInput;
const samples = {
  timeScale: "tt", frame: "true-equator-equinox-of-date", center: "geocentric", correction: "apparent",
  start: { jdTt: 2451545, rightAscensionDegrees: 359.75 },
  end: { jdTt: 2451546, rightAscensionDegrees: 0.25 }
} as const satisfies SolarEquatorialDay;
const solar = {
  ...zodiacal, convention: { ...zodiacal.convention, key: "solar-equatorial-birth-day" }, solar: samples
} as const satisfies HitInput;
const angle = { ...zodiacal, significator: { kind: "angle", angle: "mc" } } as const satisfies HitInput;
const { convention: _convention, ...noConvention } = zodiacal;
const { geometry: _geometry, ...noGeometry } = zodiacal;
const { significator: _significator, ...noSignificator } = zodiacal;
const { promissor: _promissor, ...noPromissor } = zodiacal;
const { contact: _contact, ...noContact } = zodiacal;
const { yearUnit: _yearUnit, ...noYearUnit } = zodiacal;
const { system: _system, ...noSystem } = zodiacal.convention;
const { mode: _mode, ...noMode } = zodiacal.convention;
const { motion: _motion, ...noMotion } = zodiacal.convention;
const { latitude: _latitude, ...noLatitude } = zodiacal.convention;
const { key: _key, ...noKey } = zodiacal.convention;

// @ts-expect-error The full convention cannot be inferred.
const missingConvention: HitInput = noConvention;
// @ts-expect-error Geometry is explicit.
const missingGeometry: HitInput = noGeometry;
// @ts-expect-error No significator is selected implicitly.
const missingSignificator: HitInput = noSignificator;
// @ts-expect-error No promissor is selected implicitly.
const missingPromissor: HitInput = noPromissor;
// @ts-expect-error A conjunction is not an implicit default.
const missingContact: HitInput = noContact;
// @ts-expect-error Elapsed years have an explicit numerical unit.
const missingYearUnit: HitInput = noYearUnit;
// @ts-expect-error The direction system is explicit within the convention.
const missingSystem: HitInput = { ...zodiacal, convention: noSystem };
// @ts-expect-error The mode is explicit within the convention.
const missingMode: HitInput = { ...zodiacal, convention: noMode };
// @ts-expect-error Motion is explicit within the convention.
const missingMotion: HitInput = { ...zodiacal, convention: noMotion };
// @ts-expect-error Latitude policy is explicit within the convention.
const missingLatitude: HitInput = { ...zodiacal, convention: noLatitude };
// @ts-expect-error A key is explicit within the convention.
const missingKey: HitInput = { ...zodiacal, convention: noKey };
// @ts-expect-error The direction system remains explicitly named.
const unsupportedSystem: HitInput = { ...zodiacal, convention: { ...zodiacal.convention, system: "regiomontanus" } };
// @ts-expect-error Zodiacal mode cannot retain both latitudes in this subset.
const mixedLatitude: HitInput = { ...zodiacal, convention: { ...zodiacal.convention, latitude: "retain-both" } };
// @ts-expect-error Converse requires its named construction.
const unnamedConverse: HitInput = { ...zodiacal, convention: { ...zodiacal.convention, motion: "converse" } };
// @ts-expect-error Direct motion forbids a converse construction.
const irrelevantConverse: HitInput = { ...zodiacal, convention: { ...zodiacal.convention, converseConstruction: "placidus-role-swap" } };
// @ts-expect-error Zodiacal coordinates cannot be supplied to a mundane convention.
const mixedMode: HitInput = { ...zodiacal, convention: { ...mundane.convention } };
// @ts-expect-error A zodiacal promissor requires ecliptic coordinates.
const mixedPromissor: HitInput = { ...zodiacal, promissor: mundane.promissor };
// @ts-expect-error A mundane significator requires equatorial coordinates.
const mixedSignificator: HitInput = { ...mundane, significator: zodiacal.significator };
// @ts-expect-error Mundane branch labels cannot select a zodiacal ray.
const mixedZodiacalBranch: HitInput = { ...zodiacal, contact: mundane.contact };
// @ts-expect-error Dexter is not a mundane proportional-position branch.
const mixedMundaneBranch: HitInput = { ...mundane, contact: { kind: "aspect", aspect: "square", branch: "dexter" } };
// @ts-expect-error A non-opposition aspect requires an explicit branch.
const missingBranch: HitInput = { ...zodiacal, contact: { kind: "aspect", aspect: "square" } };
// @ts-expect-error Promissors are bodies; an angle must be a significator.
const anglePromissor: HitInput = { ...zodiacal, promissor: { kind: "angle", angle: "asc" } };
// @ts-expect-error A body label is necessary to preserve its role in the result.
const missingBodyLabel: HitInput = { ...zodiacal, promissor: { kind: "body", coordinates: zodiacal.promissor.coordinates } };
// @ts-expect-error Zodiacal geometry must include obliquity.
const missingObliquity: HitInput = { ...zodiacal, geometry: mundane.geometry };
// @ts-expect-error The solar key requires explicit solar samples.
const missingSolar: HitInput = { ...zodiacal, convention: { ...zodiacal.convention, key: "solar-equatorial-birth-day" } };
// @ts-expect-error Fixed keys cannot silently ignore supplied solar samples.
const irrelevantSolar: HitInput = { ...zodiacal, solar: samples };
// @ts-expect-error An absent sample property is different from an explicit undefined.
const undefinedSolar: HitInput = { ...zodiacal, solar: undefined };
// @ts-expect-error The elapsed-year unit is a named supported choice.
const calendarYear: HitInput = { ...zodiacal, yearUnit: "calendar-year" };

// Never called. Verify public discriminants and nested immutability at compile time.
function contracts(input: HitInput, result: HitResult): void {
  const computed: HitResult = hit(input);
  const parsed: HitResult = parseHit({ arbitrary: "unknown data" });
  // @ts-expect-error A hit request cannot be omitted.
  hit();
  // @ts-expect-error Choices in a typed hit input are readonly.
  input.yearUnit = "julian-365.25-days";
  // @ts-expect-error Conventions are deeply readonly.
  input.convention.key = "naibod";
  if (result.status === "ok") {
    const success: DirectionHit = result;
    // @ts-expect-error A success has no failure code.
    result.code;
    // @ts-expect-error The returned arc is readonly.
    result.arcDegrees = 0;
    // @ts-expect-error The returned age is readonly.
    result.directedAgeYears = 0;
    // @ts-expect-error Output convention data are readonly.
    result.convention.mode = "mundane";
    // @ts-expect-error Original role labels are readonly.
    result.promissor.id = "changed";
    // @ts-expect-error Timing audit data are readonly.
    result.timing.rateDegreesPerYear = 0;
    if (result.geometry.solver === "zodiacal-body") {
      const mode: "zodiacal" = result.geometry.calculation.mode;
      // @ts-expect-error Primitive geometry is deeply readonly.
      result.geometry.calculation.geometry.promissor.position.hourAngleDegrees = 0;
      void mode;
    } else if (result.geometry.solver === "mundane-body") {
      const mode: "mundane" = result.geometry.calculation.mode;
      // @ts-expect-error The role audit cannot be modified.
      result.geometry.calculation.geometry.movingRole = "promissor";
      void mode;
    } else {
      const kind: "conjunction-to-angle" = result.geometry.calculation.kind;
      // @ts-expect-error Prepared promissor coordinates are deeply readonly.
      result.geometry.preparedPromissor.rightAscensionDegrees = 0;
      void kind;
    }
    if (result.timing.audit.kind === "solar-birth-day") {
      // @ts-expect-error Solar samples inside the result are deeply readonly.
      result.timing.audit.samples.start.jdTt = 0;
    }
    void success;
  } else {
    const refused: HitRefusal = result;
    // @ts-expect-error Refusals do not manufacture an arc.
    result.arcDegrees;
    // @ts-expect-error Failure data are readonly.
    result.message = "changed";
    if (result.stage === "angle") {
      const code: AngleDirectionErrorCode | "unsupported-angle-aspect" = result.code;
      void code;
    } else if (result.stage === "sphere") {
      const code: SphereGeometryErrorCode = result.code;
      void code;
    } else if (result.stage === "timing") {
      const code: TimingErrorCode = result.code;
      void code;
    } else if (result.stage === "input") {
      const code: "invalid-input" | "inconsistent-body" = result.code;
      void code;
    }
    void refused;
  }
  void [computed, parsed];
}
void [zodiacal, mundane, solar, angle, missingConvention, missingGeometry,
  missingSignificator, missingPromissor, missingContact, missingYearUnit, missingSystem, missingMode, missingMotion,
  missingLatitude, missingKey, unsupportedSystem, mixedLatitude, unnamedConverse,
  irrelevantConverse, mixedMode, mixedPromissor, mixedSignificator, mixedZodiacalBranch,
  mixedMundaneBranch, missingBranch, anglePromissor, missingBodyLabel, missingObliquity,
  missingSolar, irrelevantSolar, undefinedSolar, calendarYear, contracts];
