/**
 * Authored analytic inputs and expectations, with no implementation imports.
 * Every angle is in degrees; M5-derivations.md proves the expected values.
 * The promissor RA/declination below belong to the projected contact ray.
 */
export const ZODIACAL_FIXTURE_TOLERANCE_DEGREES = 1e-10;

export interface ZodiacalExample {
  readonly id: string;
  readonly geometry: {
    readonly ramcDegrees: number;
    readonly latitudeDegrees: number;
    readonly trueObliquityDegrees: number;
  };
  readonly significator: { readonly longitudeDegrees: number; readonly latitudeDegrees: number };
  readonly promissor: { readonly longitudeDegrees: number; readonly latitudeDegrees: number };
  readonly contact: { readonly kind: "conjunction" }
    | { readonly kind: "aspect"; readonly aspect: "sextile" | "square" | "trine"; readonly branch: "dexter" | "sinister" }
    | { readonly kind: "aspect"; readonly aspect: "opposition" };
  readonly expected: {
    readonly arcDegrees: number;
    readonly significatorRaDegrees: number;
    readonly significatorDeclinationDegrees: number;
    readonly promissorRaDegrees: number;
    readonly promissorDeclinationDegrees: number;
    readonly significatorHourAngleDegrees: number;
    readonly promissorHourAngleDegrees: number;
    readonly targetHourAngleDegrees: number;
    readonly significatorDiurnalDegrees: number;
    readonly promissorDiurnalDegrees: number;
    readonly rayLongitudeDegrees: number;
  };
}

// This transcendental expression defines an input, never a solver expectation.
const phi = Math.atan(Math.sqrt(3) / 2) * 180 / Math.PI;

// S is at the northern solstice, P at the autumnal equinox. The rows fix
// signed hour angles, target hour angles and arcs by elementary arithmetic.
const northernRows = [
  { id: "north-above-west", ramc: 150, hs: 60, hp: -30, target: 45, arc: 75 },
  { id: "north-below-west", ramc: 240, hs: 150, hp: 60, target: 135, arc: 75 },
  { id: "north-below-east", ramc: 300, hs: -150, hp: 120, target: -135, arc: 105 },
  { id: "north-above-east", ramc: 30, hs: -60, hp: -150, target: -45, arc: 105 },
] as const;

const northExamples: ZodiacalExample[] = northernRows.map(row => ({
  id: row.id,
  geometry: { ramcDegrees: row.ramc, latitudeDegrees: phi, trueObliquityDegrees: 30 },
  significator: { longitudeDegrees: 90, latitudeDegrees: 0 },
  promissor: { longitudeDegrees: 180, latitudeDegrees: 0 },
  contact: { kind: "conjunction" },
  expected: {
    arcDegrees: row.arc, significatorRaDegrees: 90, significatorDeclinationDegrees: 30,
    promissorRaDegrees: 180, promissorDeclinationDegrees: 0,
    significatorHourAngleDegrees: row.hs, promissorHourAngleDegrees: row.hp,
    targetHourAngleDegrees: row.target, significatorDiurnalDegrees: 120,
    promissorDiurnalDegrees: 90, rayLongitudeDegrees: 180,
  },
}));

// Simultaneously reverse geographic latitude and solstitial declination;
// add half a turn to every longitude and RAMC. Hour-angle arithmetic stays.
const southExamples: ZodiacalExample[] = northernRows.map(row => ({
  id: row.id.replace("north", "south"),
  geometry: { ramcDegrees: (row.ramc + 180) % 360, latitudeDegrees: -phi, trueObliquityDegrees: 30 },
  significator: { longitudeDegrees: 270, latitudeDegrees: 0 },
  promissor: { longitudeDegrees: 0, latitudeDegrees: 0 },
  contact: { kind: "conjunction" },
  expected: {
    arcDegrees: row.arc, significatorRaDegrees: 270, significatorDeclinationDegrees: -30,
    promissorRaDegrees: 0, promissorDeclinationDegrees: 0,
    significatorHourAngleDegrees: row.hs, promissorHourAngleDegrees: row.hp,
    targetHourAngleDegrees: row.target, significatorDiurnalDegrees: 120,
    promissorDiurnalDegrees: 90, rayLongitudeDegrees: 0,
  },
}));

const oppositeLatitudeExamples: ZodiacalExample[] = [
  { id: "opposite-above-west", ramc: 120, hs: 30, hp: -60, target: 45, arc: 105 },
  { id: "opposite-below-west", ramc: 210, hs: 120, hp: 30, target: 135, arc: 105 },
  { id: "opposite-below-east", ramc: 330, hs: -120, hp: 150, target: -135, arc: 75 },
  { id: "opposite-above-east", ramc: 60, hs: -30, hp: -120, target: -45, arc: 75 },
].map(row => ({
  id: row.id,
  geometry: { ramcDegrees: row.ramc, latitudeDegrees: -phi, trueObliquityDegrees: 30 },
  significator: { longitudeDegrees: 90, latitudeDegrees: 0 },
  promissor: { longitudeDegrees: 180, latitudeDegrees: 0 },
  contact: { kind: "conjunction" },
  expected: {
    arcDegrees: row.arc, significatorRaDegrees: 90, significatorDeclinationDegrees: 30,
    promissorRaDegrees: 180, promissorDeclinationDegrees: 0,
    significatorHourAngleDegrees: row.hs, promissorHourAngleDegrees: row.hp,
    targetHourAngleDegrees: row.target, significatorDiurnalDegrees: 60,
    promissorDiurnalDegrees: 90, rayLongitudeDegrees: 180,
  },
}));

// S is equatorial, so its axes are exactly representable. The moving ray is
// oblique. No test needs to classify a rounded oblique S horizon as exact.
const boundaryExamples: ZodiacalExample[] = [
  { id: "body-on-upper-meridian", ramc: 0, hs: 0, hp: -90, target: 0, arc: 90 },
  { id: "body-on-lower-meridian", ramc: 180, hs: -180, hp: 90, target: -180, arc: 90 },
  { id: "body-on-rising-horizon", ramc: 270, hs: -90, hp: -180, target: -120, arc: 60 },
  { id: "body-on-setting-horizon", ramc: 90, hs: 90, hp: 0, target: 120, arc: 120 },
].map(row => ({
  id: row.id,
  geometry: { ramcDegrees: row.ramc, latitudeDegrees: phi, trueObliquityDegrees: 30 },
  significator: { longitudeDegrees: 0, latitudeDegrees: 0 },
  promissor: { longitudeDegrees: 90, latitudeDegrees: 0 },
  contact: { kind: "conjunction" },
  expected: {
    arcDegrees: row.arc, significatorRaDegrees: 0, significatorDeclinationDegrees: 0,
    promissorRaDegrees: 90, promissorDeclinationDegrees: 30,
    significatorHourAngleDegrees: row.hs, promissorHourAngleDegrees: row.hp,
    targetHourAngleDegrees: row.target, significatorDiurnalDegrees: 90,
    promissorDiurnalDegrees: 120, rayLongitudeDegrees: 90,
  },
}));

const aspectRows = [
  { id: "dexter-sextile", longitude: 150, contact: { kind: "aspect", aspect: "sextile", branch: "dexter" } },
  { id: "sinister-sextile", longitude: 30, contact: { kind: "aspect", aspect: "sextile", branch: "sinister" } },
  { id: "dexter-square", longitude: 180, contact: { kind: "aspect", aspect: "square", branch: "dexter" } },
  { id: "sinister-square", longitude: 0, contact: { kind: "aspect", aspect: "square", branch: "sinister" } },
  { id: "dexter-trine", longitude: 210, contact: { kind: "aspect", aspect: "trine", branch: "dexter" } },
  { id: "sinister-trine-wrap", longitude: 330, contact: { kind: "aspect", aspect: "trine", branch: "sinister" } },
  { id: "opposition", longitude: 270, contact: { kind: "aspect", aspect: "opposition" } },
] as const;

const aspectExamples: ZodiacalExample[] = aspectRows.map(row => ({
  id: row.id,
  geometry: { ramcDegrees: 45, latitudeDegrees: phi, trueObliquityDegrees: 30 },
  // Input latitudes are deliberately nonzero; zero-both projects them away.
  significator: { longitudeDegrees: 0, latitudeDegrees: 4 },
  promissor: { longitudeDegrees: row.longitude, latitudeDegrees: -7 },
  contact: row.contact,
  expected: {
    arcDegrees: 105, significatorRaDegrees: 0, significatorDeclinationDegrees: 0,
    promissorRaDegrees: 90, promissorDeclinationDegrees: 30,
    significatorHourAngleDegrees: 45, promissorHourAngleDegrees: -45,
    targetHourAngleDegrees: 60, significatorDiurnalDegrees: 90,
    promissorDiurnalDegrees: 120, rayLongitudeDegrees: 90,
  },
}));

const equatorialExamples: ZodiacalExample[] = [
  { id: "longitude-wrap-short", s: 350, p: 10, hs: 10, hp: -10, arc: 20 },
  { id: "longitude-wrap-long", s: 10, p: 350, hs: -10, hp: 10, arc: 340 },
  { id: "initial-conjunction", s: 10, p: 10, hs: -10, hp: -10, arc: 0 },
].map(row => ({
  id: row.id,
  geometry: { ramcDegrees: 0, latitudeDegrees: 0, trueObliquityDegrees: 0 },
  significator: { longitudeDegrees: row.s, latitudeDegrees: 0 },
  promissor: { longitudeDegrees: row.p, latitudeDegrees: 0 },
  contact: { kind: "conjunction" },
  expected: {
    arcDegrees: row.arc, significatorRaDegrees: row.s, significatorDeclinationDegrees: 0,
    promissorRaDegrees: row.p, promissorDeclinationDegrees: 0,
    significatorHourAngleDegrees: row.hs, promissorHourAngleDegrees: row.hp,
    targetHourAngleDegrees: row.hs, significatorDiurnalDegrees: 90,
    promissorDiurnalDegrees: 90, rayLongitudeDegrees: row.p,
  },
}));

export const ZODIACAL_EXAMPLES: readonly ZodiacalExample[] = [
  ...northExamples, ...southExamples, ...oppositeLatitudeExamples,
  ...boundaryExamples, ...aspectExamples, ...equatorialExamples,
];
