// Compile-only API contract: npm run typecheck includes this file without
// loading either implementation or requiring an initialized WASM instance.
import type * as Core from "../ts/index.js";
import type * as EngineTypes from "../../src/types.js";
import type * as EngineAspects from "../../src/aspects.js";
import type * as EngineConfigured from "../../src/configured-aspects.js";
import type * as EngineCalendar from "../../src/civil-calendar.js";
import type * as EngineDeltaT from "../../src/deltat.js";
import type * as EngineTime from "../../src/time-scale.js";
import type * as EngineNutation from "../../src/nutation.js";
import type * as EngineFrame from "../../src/frame.js";
import type * as EngineEquator from "../../src/equator.js";
import type * as EngineHouses from "../../src/houses.js";

// These are explicit contracts, not the intersection of the two modules' keys:
// removing a wrapper export must fail even if nothing imports it elsewhere.
// Entry modules have additional chart/technique APIs outside this port's scope.
type ExpectedFunctions =
  Pick<typeof import("../../src/api.js"), "positions"> &
  Pick<typeof import("../../src/ephemeris.js"),
    "computeBodies" | "bodyLongitude" | "longitudeSpeed" | "gastHours"> &
  Pick<typeof import("../../src/signs.js"),
    "normalizeLongitude" | "signIndexForLongitude" | "degreeInSign" | "signForLongitude"> &
  Pick<typeof import("../../src/window-ranges.js"), "wrap360" | "signedDelta" | "advance"> &
  Pick<typeof import("../../src/points.js"), "antiscion" | "contraAntiscion" | "midpoint"> &
  Pick<typeof import("../../src/date-input.js"), "dateFrom"> &
  Pick<typeof EngineCalendar,
    "parseCalendarDate" | "julianDayNumber" | "civilDateOf" | "format" |
    "julianToGregorian" | "gregorianToJulian"> &
  Pick<typeof EngineDeltaT, "deltaT" | "deltaTAt"> &
  Pick<typeof EngineTime, "taiMinusUtcAt" | "ut1MinusUtcAt" | "timeBasis" | "elapsedDays"> &
  Pick<typeof EngineNutation, "coefficients" | "nutation" | "tilt"> &
  Pick<typeof EngineFrame, "eclipticFrame" | "meanEcliptic" | "eclipticOfDate"> &
  Pick<typeof EngineEquator, "eclipticRows" | "equatorRows" | "turn"> &
  Pick<typeof EngineHouses,
    "isPolarUndefinedHouseSystem" | "meanObliquity" | "ramcOf" | "computeAngles" |
    "wholeSignCusps" | "equalCusps" | "equalMcCusps" | "vehlowCusps" |
    "porphyryCusps" | "meridianCusps" | "morinusCusps" | "placidusCusps" |
    "kochCusps" | "regiomontanusCusps" | "campanusCusps" | "topocentricCusps" |
    "alcabitiusCusps" | "computeHouses" | "houseOf"> &
  Pick<typeof EngineAspects, "aspectMotion" | "separation" | "matchAspect" | "findAspects"> &
  Pick<typeof EngineConfigured, "createAspectPolicy" | "findConfiguredAspects"> &
  Pick<typeof import("../../src/synastry.js"), "findInterAspects"> &
  Pick<typeof import("../../src/reference-span.js"), "outsideReferenceSpan">;

type ExpectedConstants =
  Pick<typeof import("../../src/signs.js"),
    "ELEMENTS" | "MODALITIES" | "SIGNS" | "SIGN_SLUGS" | "SIGN_NAMES"> &
  Pick<typeof EngineHouses,
    "HOUSE_SYSTEMS" | "POLAR_UNDEFINED_HOUSE_SYSTEMS" | "POLAR_FALLBACK" | "PLACIDUS_POLAR_FALLBACK"> &
  Pick<typeof EngineNutation, "ARGUMENTS" | "MULTIPLIERS" | "OFFSETS" | "NUTATION_TERMS"> &
  Pick<typeof EngineDeltaT, "DELTA_T_MODEL" | "DELTA_T_TABLE"> &
  Pick<typeof EngineTime,
    "DELTA_T_IERS_MODEL" | "TIME_SCALE_NAMES" | "LEAP_SECOND_LIST" | "UT1_DATA" |
    "LEAP_SECONDS_FROM" | "UT1_FALLBACK_BAND"> &
  Pick<typeof import("../../src/reference-span.js"), "REFERENCE_SPAN" | "EPHEMERIS_SPAN"> &
  Pick<typeof import("../../src/ephemeris.js"), "SPEED_STEP_DAYS" | "NODE_SPEED_STEP_DAYS"> &
  Pick<typeof EngineAspects, "ASPECT_TYPES" | "ASPECTS" | "ASPECT_BODIES" | "STATIONARY_RELATIVE_SPEED"> &
  Pick<typeof EngineConfigured,
    "ASPECT_POLICY_SCHEMA" | "CONFIGURED_ASPECTS_SCHEMA" | "CONFIGURED_ASPECT_ANGLES" | "DEFAULT_ASPECT_POLICY">;

// These diagnostic kernels deliberately expose clocks/vectors without the
// astronomy-engine classes. They do not claim the upstream helper signatures.
// Initialization and positionsOn are additional rustcore APIs.
type RustCoreOnlyExports =
  "initRustCore" | "positionsOn" | "helioVector" | "helioState" |
  "backdatePosition" | "geoVector" | "geoMoon" | "geoMoonState" |
  "moonOfDate" | "trueNodeLongitude" | "lunarLongitude" | "lunarLongitudeSpeed";

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2)
    ? (<T>() => T extends B ? 1 : 2) extends (<T>() => T extends A ? 1 : 2) ? true : false
    : false;
type Assert<T extends true> = T;
type AssertAll<T extends Record<keyof T, true>> = T;
type Signature<T> = T extends (...args: infer P) => infer R ? [P, R] : never;
type FunctionChecks<Actual, Expected> = {
  [K in keyof Expected]: K extends keyof Actual
    ? Equal<Actual[K], Expected[K]> extends true
      ? Equal<Signature<Actual[K]>, Signature<Expected[K]>> : false : false
};

// Comparing parameter tuples as well as return types detects omitted/extra
// optional parameters, widened inputs and async replacements that ordinary
// one-way function assignment can accept. No `any` or result casts hide drift.
export type FunctionSignatures = AssertAll<FunctionChecks<typeof Core, ExpectedFunctions>>;
export type ClassifiedExports = Assert<Equal<keyof typeof Core,
  keyof ExpectedFunctions | keyof ExpectedConstants | RustCoreOnlyExports>>;

// Immutable metadata can be narrower than its source declaration (for example
// a tuple instead of an array, or readonly arrays instead of mutable tables).
// Preserve the source's readable shape without demanding source mutability.
// Object keys and nested element/property types still have to be present.
type DeepReadonly<T> = T extends ReadonlySet<infer E> ? ReadonlySet<DeepReadonly<E>>
  : T extends object ? { readonly [K in keyof T]: DeepReadonly<T[K]> } : T;
type ConstantChecks<Actual, Expected> = {
  [K in keyof Expected]: K extends keyof Actual
    ? DeepReadonly<Actual[K]> extends DeepReadonly<Expected[K]> ? true : false : false
};
export type ConstantShapes = AssertAll<ConstantChecks<typeof Core, ExpectedConstants>>;

// Types have no runtime module keys. Check each mirrored public type by name,
// including the locally declared configured-aspect interfaces and deprecated
// aliases, which must remain exactly equal to the engine's declarations.
export type PublicTypes = AssertAll<{
  BodyName: Equal<Core.BodyName, EngineTypes.BodyName>;
  BodyPosition: Equal<Core.BodyPosition, EngineTypes.BodyPosition>;
  DateInput: Equal<Core.DateInput, EngineTypes.DateInput>;
  SignDefinition: Equal<Core.SignDefinition, EngineTypes.SignDefinition>;
  CalendarName: Equal<Core.CalendarName, EngineCalendar.CalendarName>;
  CivilDate: Equal<Core.CivilDate, EngineCalendar.CivilDate>;
  DeltaT: Equal<Core.DeltaT, EngineDeltaT.DeltaT>;
  DeltaTTable: Equal<Core.DeltaTTable, EngineDeltaT.DeltaTTable>;
  DeltaTSegment: Equal<Core.DeltaTSegment, EngineDeltaT.DeltaTSegment>;
  TimeBasis: Equal<Core.TimeBasis, EngineTime.TimeBasis>;
  TimeScale: Equal<Core.TimeScale, EngineTime.TimeScale>;
  TimeScaleName: Equal<Core.TimeScaleName, EngineTime.TimeScaleName>;
  Ut1MinusUtc: Equal<Core.Ut1MinusUtc, EngineTime.Ut1MinusUtc>;
  LeapSeconds: Equal<Core.LeapSeconds, EngineTime.LeapSeconds>;
  Tilt: Equal<Core.Tilt, EngineNutation.Tilt>;
  EclipticFrame: Equal<Core.EclipticFrame, EngineFrame.EclipticFrame>;
  Rows: Equal<Core.Rows, EngineEquator.Rows>;
  AngleInput: Equal<Core.AngleInput, EngineHouses.AngleInput>;
  Angles: Equal<Core.Angles, EngineTypes.Angles>;
  HouseNumber: Equal<Core.HouseNumber, EngineTypes.HouseNumber>;
  Houses: Equal<Core.Houses, EngineTypes.Houses>;
  HouseSystem: Equal<Core.HouseSystem, EngineTypes.HouseSystem>;
  AspectDefinition: Equal<Core.AspectDefinition, EngineAspects.AspectDefinition>;
  AspectMotion: Equal<Core.AspectMotion, EngineAspects.AspectMotion>;
  Aspect: Equal<Core.Aspect, EngineTypes.Aspect>;
  AspectType: Equal<Core.AspectType, EngineTypes.AspectType>;
  InterAspect: Equal<Core.InterAspect, EngineTypes.InterAspect>;
  MinimalBody: Equal<Core.MinimalBody, EngineTypes.MinimalBody>;
  AspectOrbLimits: Equal<Core.AspectOrbLimits, EngineConfigured.AspectOrbLimits>;
  AspectOrbInput: Equal<Core.AspectOrbInput, EngineConfigured.AspectOrbInput>;
  AspectRuleInput: Equal<Core.AspectRuleInput, EngineConfigured.AspectRuleInput>;
  ResolvedAspectRule: Equal<Core.ResolvedAspectRule, EngineConfigured.ResolvedAspectRule>;
  AspectPolicyInput: Equal<Core.AspectPolicyInput, EngineConfigured.AspectPolicyInput>;
  AspectPolicy: Equal<Core.AspectPolicy, EngineConfigured.AspectPolicy>;
  AspectPosition: Equal<Core.AspectPosition, EngineConfigured.AspectPosition>;
  ConfiguredAspect: Equal<Core.ConfiguredAspect, EngineConfigured.ConfiguredAspect>;
  ConfiguredAspectResult: Equal<Core.ConfiguredAspectResult, EngineConfigured.ConfiguredAspectResult>;
  ConfiguredAspectMotion: Equal<Core.ConfiguredAspectMotion, EngineConfigured.ConfiguredAspectMotion>;
}>;

// Negative controls ensure the contract machinery itself rejects changes.
// @ts-expect-error A missing export is not silently excluded from the check.
type MissingFunction = AssertAll<FunctionChecks<{}, { f: (x: number) => number }>>;
// @ts-expect-error Bidirectional parameter matching rejects wider inputs.
type WiderInput = AssertAll<FunctionChecks<{ f: (x: unknown) => number }, { f: (x: number) => number }>>;
// @ts-expect-error Optional arguments remain part of the engine signature.
type MissingOptional = AssertAll<FunctionChecks<{ f: (x: number) => number }, { f: (x: number, y?: number) => number }>>;
// @ts-expect-error Results must remain synchronous after initialization.
type AsyncResult = AssertAll<FunctionChecks<{ f: (x: number) => Promise<number> }, { f: (x: number) => number }>>;
// @ts-expect-error The source's mutable array result cannot become readonly.
type ReadonlyResult = AssertAll<FunctionChecks<{ f: () => readonly number[] }, { f: () => number[] }>>;
