/**
 * Complete synthetic hit examples proved in M8-derivations.md.
 * No implementation import or computed package result supplies an expectation.
 * Coordinates are invented sphere inputs, not claims of engine natal output.
 */
export const HIT_FIXTURE_ARC_TOLERANCE_DEGREES = 1e-10;
export const HIT_FIXTURE_TIMING_RELATIVE_TOLERANCE = 1e-11;

interface Rational {
  readonly numerator: number;
  readonly denominator: number;
}
type Ecliptic = { readonly longitudeDegrees: number; readonly latitudeDegrees: number };
type Equatorial = { readonly rightAscensionDegrees: number; readonly declinationDegrees: number };
type Angle = { readonly angle: "mc" | "ic" | "asc" | "dsc" };
type Contact = { readonly kind: "conjunction" }
  | { readonly kind: "aspect"; readonly aspect: "opposition" }
  | { readonly kind: "aspect"; readonly aspect: "sextile" | "square" | "trine";
    readonly branch: "dexter" | "sinister" | "westward" | "eastward" };

export interface HitExample {
  readonly id: string;
  readonly derivation: string;
  readonly system: "placidus-semiarc";
  readonly mode: "zodiacal" | "mundane";
  readonly motion: "direct" | "converse";
  readonly converseConstruction?: "placidus-role-swap";
  readonly latitude: "zero-both" | "retain-both";
  readonly key: "ptolemy" | "naibod" | "solar-equatorial-birth-day";
  readonly yearUnit: "tropical-365.2422-days" | "julian-365.25-days";
  readonly geometry: {
    readonly ramcDegrees: number;
    readonly latitudeDegrees: number;
    readonly trueObliquityDegrees?: number;
  };
  readonly significator: Ecliptic | Equatorial | Angle;
  readonly promissor: Ecliptic | Equatorial;
  readonly contact: Contact;
  readonly solar?: {
    readonly timeScale: "tt";
    readonly frame: "true-equator-equinox-of-date";
    readonly center: "geocentric";
    readonly correction: "apparent";
    readonly start: { readonly jdTt: number; readonly rightAscensionDegrees: number };
    readonly end: { readonly jdTt: number; readonly rightAscensionDegrees: number };
  };
  readonly expected: {
    readonly kind: "conjunction-to-body" | "aspect-to-body" | "conjunction-to-angle";
    readonly arcDegrees: number;
    readonly targetHourAngleDegrees: number;
    readonly directedAgeYears: Rational;
    readonly rateDegreesPerYear: Rational;
  };
}

// Transcendental expressions define inputs only; the corresponding exact
// ascensional differences and semi-arcs are proved in the derivation.
const phi = Math.atan(Math.sqrt(3) / 2) * 180 / Math.PI;
const delta = Math.atan(1 / 2) * 180 / Math.PI;
const conjunction = { kind: "conjunction" } as const;
const halfDegreeSolar = {
  timeScale: "tt", frame: "true-equator-equinox-of-date", center: "geocentric", correction: "apparent",
  start: { jdTt: 2451545, rightAscensionDegrees: 359.75 },
  end: { jdTt: 2451546, rightAscensionDegrees: 0.25 }
} as const;
const fiveQuarterSolar = {
  ...halfDegreeSolar,
  start: { jdTt: 2451545, rightAscensionDegrees: 80 },
  end: { jdTt: 2451546, rightAscensionDegrees: 81.25 }
} as const;
const ptolemy = { numerator: 1, denominator: 1 } as const;
const naibod = { numerator: 354833, denominator: 360000 } as const;
const half = { numerator: 1, denominator: 2 } as const;
const fiveQuarters = { numerator: 5, denominator: 4 } as const;

export const HIT_EXAMPLES = [
  {
    id: "zodiacal-wrap-ptolemy", derivation: "M8-derivations.md#zodiacal-body-contacts",
    system: "placidus-semiarc", mode: "zodiacal", motion: "direct", latitude: "zero-both",
    key: "ptolemy", yearUnit: "tropical-365.2422-days",
    geometry: { ramcDegrees: 0, latitudeDegrees: 0, trueObliquityDegrees: 0 },
    significator: { longitudeDegrees: 350, latitudeDegrees: 4 },
    promissor: { longitudeDegrees: 10, latitudeDegrees: -7 }, contact: conjunction,
    expected: { kind: "conjunction-to-body", arcDegrees: 20, targetHourAngleDegrees: 10,
      directedAgeYears: { numerator: 20, denominator: 1 }, rateDegreesPerYear: ptolemy }
  },
  {
    id: "zodiacal-oblique-naibod", derivation: "M8-derivations.md#zodiacal-body-contacts",
    system: "placidus-semiarc", mode: "zodiacal", motion: "direct", latitude: "zero-both",
    key: "naibod", yearUnit: "tropical-365.2422-days",
    geometry: { ramcDegrees: 150, latitudeDegrees: phi, trueObliquityDegrees: 30 },
    significator: { longitudeDegrees: 90, latitudeDegrees: 0 },
    promissor: { longitudeDegrees: 180, latitudeDegrees: 0 }, contact: conjunction,
    expected: { kind: "conjunction-to-body", arcDegrees: 75, targetHourAngleDegrees: 45,
      directedAgeYears: { numerator: 27000000, denominator: 354833 }, rateDegreesPerYear: naibod }
  },
  {
    id: "zodiacal-square-solar", derivation: "M8-derivations.md#zodiacal-body-contacts",
    system: "placidus-semiarc", mode: "zodiacal", motion: "direct", latitude: "zero-both",
    key: "solar-equatorial-birth-day", yearUnit: "julian-365.25-days", solar: halfDegreeSolar,
    geometry: { ramcDegrees: 45, latitudeDegrees: phi, trueObliquityDegrees: 30 },
    significator: { longitudeDegrees: 0, latitudeDegrees: 4 },
    promissor: { longitudeDegrees: 180, latitudeDegrees: -7 },
    contact: { kind: "aspect", aspect: "square", branch: "dexter" },
    expected: { kind: "aspect-to-body", arcDegrees: 105, targetHourAngleDegrees: 60,
      directedAgeYears: { numerator: 210, denominator: 1 }, rateDegreesPerYear: half }
  },
  {
    id: "mundane-direct-ptolemy", derivation: "M8-derivations.md#mundane-body-contacts",
    system: "placidus-semiarc", mode: "mundane", motion: "direct", latitude: "retain-both",
    key: "ptolemy", yearUnit: "tropical-365.2422-days",
    geometry: { ramcDegrees: 0, latitudeDegrees: 45 },
    significator: { rightAscensionDegrees: 320, declinationDegrees: delta },
    promissor: { rightAscensionDegrees: 30, declinationDegrees: -delta }, contact: conjunction,
    expected: { kind: "conjunction-to-body", arcDegrees: 50, targetHourAngleDegrees: 20,
      directedAgeYears: { numerator: 50, denominator: 1 }, rateDegreesPerYear: ptolemy }
  },
  {
    id: "mundane-converse-naibod", derivation: "M8-derivations.md#mundane-body-contacts",
    system: "placidus-semiarc", mode: "mundane", motion: "converse",
    converseConstruction: "placidus-role-swap", latitude: "retain-both",
    key: "naibod", yearUnit: "julian-365.25-days",
    geometry: { ramcDegrees: 0, latitudeDegrees: 45 },
    significator: { rightAscensionDegrees: 320, declinationDegrees: delta },
    promissor: { rightAscensionDegrees: 30, declinationDegrees: -delta }, contact: conjunction,
    expected: { kind: "conjunction-to-body", arcDegrees: 260, targetHourAngleDegrees: -60,
      directedAgeYears: { numerator: 93600000, denominator: 354833 }, rateDegreesPerYear: naibod }
  },
  {
    id: "mundane-converse-square-solar", derivation: "M8-derivations.md#mundane-body-contacts",
    system: "placidus-semiarc", mode: "mundane", motion: "converse",
    converseConstruction: "placidus-role-swap", latitude: "retain-both",
    key: "solar-equatorial-birth-day", yearUnit: "tropical-365.2422-days", solar: fiveQuarterSolar,
    geometry: { ramcDegrees: 0, latitudeDegrees: 45 },
    significator: { rightAscensionDegrees: 320, declinationDegrees: delta },
    promissor: { rightAscensionDegrees: 30, declinationDegrees: -delta },
    contact: { kind: "aspect", aspect: "square", branch: "eastward" },
    expected: { kind: "aspect-to-body", arcDegrees: 170, targetHourAngleDegrees: -150,
      directedAgeYears: { numerator: 136, denominator: 1 }, rateDegreesPerYear: fiveQuarters }
  },
  {
    id: "mundane-initial-square-solar", derivation: "M8-derivations.md#mundane-body-contacts",
    system: "placidus-semiarc", mode: "mundane", motion: "direct", latitude: "retain-both",
    key: "solar-equatorial-birth-day", yearUnit: "julian-365.25-days", solar: halfDegreeSolar,
    geometry: { ramcDegrees: 0, latitudeDegrees: 0 },
    significator: { rightAscensionDegrees: 330, declinationDegrees: 0 },
    promissor: { rightAscensionDegrees: 60, declinationDegrees: 0 },
    contact: { kind: "aspect", aspect: "square", branch: "westward" },
    expected: { kind: "aspect-to-body", arcDegrees: 0, targetHourAngleDegrees: -60,
      directedAgeYears: { numerator: 0, denominator: 1 }, rateDegreesPerYear: half }
  },
  {
    id: "mundane-rising-naibod", derivation: "M8-derivations.md#angle-contacts",
    system: "placidus-semiarc", mode: "mundane", motion: "direct", latitude: "retain-both",
    key: "naibod", yearUnit: "julian-365.25-days",
    geometry: { ramcDegrees: 180, latitudeDegrees: 45 }, significator: { angle: "asc" },
    promissor: { rightAscensionDegrees: 0, declinationDegrees: delta }, contact: conjunction,
    expected: { kind: "conjunction-to-angle", arcDegrees: 60, targetHourAngleDegrees: -120,
      directedAgeYears: { numerator: 21600000, denominator: 354833 }, rateDegreesPerYear: naibod }
  },
  {
    id: "zodiacal-meridian-solar", derivation: "M8-derivations.md#angle-contacts",
    system: "placidus-semiarc", mode: "zodiacal", motion: "direct", latitude: "zero-both",
    key: "solar-equatorial-birth-day", yearUnit: "tropical-365.2422-days", solar: fiveQuarterSolar,
    geometry: { ramcDegrees: 45, latitudeDegrees: phi, trueObliquityDegrees: 30 },
    significator: { angle: "mc" }, promissor: { longitudeDegrees: 90, latitudeDegrees: -7 }, contact: conjunction,
    expected: { kind: "conjunction-to-angle", arcDegrees: 45, targetHourAngleDegrees: 0,
      directedAgeYears: { numerator: 36, denominator: 1 }, rateDegreesPerYear: fiveQuarters }
  },
  {
    id: "mundane-southern-setting-ptolemy", derivation: "M8-derivations.md#angle-contacts",
    system: "placidus-semiarc", mode: "mundane", motion: "direct", latitude: "retain-both",
    key: "ptolemy", yearUnit: "tropical-365.2422-days",
    geometry: { ramcDegrees: 60, latitudeDegrees: -45 }, significator: { angle: "dsc" },
    promissor: { rightAscensionDegrees: 0, declinationDegrees: -delta }, contact: conjunction,
    expected: { kind: "conjunction-to-angle", arcDegrees: 60, targetHourAngleDegrees: 120,
      directedAgeYears: { numerator: 60, denominator: 1 }, rateDegreesPerYear: ptolemy }
  }
] as const satisfies readonly HitExample[];
