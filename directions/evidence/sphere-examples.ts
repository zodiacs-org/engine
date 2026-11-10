/*
 * Authored synthetic spherical examples. The arbiter is the hand derivation
 * in M3-derivations.md, not an engine or directions calculation.
 * No solver is imported, and no expected angle is calculated from a solver.
 */

/** Fixed before comparing any solver result with these examples. */
export const SPHERE_FIXTURE_TOLERANCES = Object.freeze({
  angleDegrees: 1e-10,
  fraction: 1e-12,
});

// This expression specifies the synthetic input. It is not an expected output.
// tan(delta) = 1/2, so at phi = 45 degrees the expected AD is exactly 30 degrees.
const HALF_TANGENT_DECLINATION_DEGREES = Math.atan(1 / 2) * 180 / Math.PI;

type Quadrant = 'above-east' | 'above-west' | 'below-west' | 'below-east';
type Boundary = 'upper-meridian' | 'setting' | 'lower-meridian' | 'rising';

export interface SphereExample {
  readonly id: string;
  readonly derivation: string;
  readonly input: {
    readonly ramcDegrees: number;
    readonly rightAscensionDegrees: number;
    readonly latitudeDegrees: number;
    readonly declinationDegrees: number;
  };
  readonly expected: {
    readonly hourAngleDegrees: number;
    readonly ascensionalDifferenceDegrees: number;
    readonly diurnalSemiArcDegrees: number;
    readonly nocturnalSemiArcDegrees: number;
    readonly kind: 'quadrant' | 'boundary';
    readonly quadrant: Quadrant | null;
    readonly boundary: Boundary | null;
    readonly meridianDistanceDegrees: number | null;
    readonly semiArcDegrees: number | null;
    readonly quadrantFraction: number | null;
    readonly semiArcPositionDegrees: number;
  };
}

// Each family is an exact symbolic result proved in the accompanying text.
const EQUATOR = {
  ascensionalDifferenceDegrees: 0,
  diurnalSemiArcDegrees: 90,
  nocturnalSemiArcDegrees: 90,
} as const;
const SAME_HEMISPHERE = {
  ascensionalDifferenceDegrees: 30,
  diurnalSemiArcDegrees: 120,
  nocturnalSemiArcDegrees: 60,
} as const;
const OPPOSITE_HEMISPHERE = {
  ascensionalDifferenceDegrees: -30,
  diurnalSemiArcDegrees: 60,
  nocturnalSemiArcDegrees: 120,
} as const;

export const SPHERE_EXAMPLES = [
  {
    id: 'equator-above-west', derivation: 'M3-derivations.md#equatorial-family',
    input: { ramcDegrees: 45, rightAscensionDegrees: 0, latitudeDegrees: 0, declinationDegrees: 0 },
    expected: { ...EQUATOR, hourAngleDegrees: 45, kind: 'quadrant', quadrant: 'above-west', boundary: null,
      meridianDistanceDegrees: 45, semiArcDegrees: 90, quadrantFraction: 1 / 2, semiArcPositionDegrees: 45 },
  },
  {
    id: 'equator-below-west', derivation: 'M3-derivations.md#equatorial-family',
    input: { ramcDegrees: 135, rightAscensionDegrees: 0, latitudeDegrees: 0, declinationDegrees: 0 },
    expected: { ...EQUATOR, hourAngleDegrees: 135, kind: 'quadrant', quadrant: 'below-west', boundary: null,
      meridianDistanceDegrees: 45, semiArcDegrees: 90, quadrantFraction: 1 / 2, semiArcPositionDegrees: 135 },
  },
  {
    id: 'equator-below-east', derivation: 'M3-derivations.md#equatorial-family',
    input: { ramcDegrees: 225, rightAscensionDegrees: 0, latitudeDegrees: 0, declinationDegrees: 0 },
    expected: { ...EQUATOR, hourAngleDegrees: -135, kind: 'quadrant', quadrant: 'below-east', boundary: null,
      meridianDistanceDegrees: 45, semiArcDegrees: 90, quadrantFraction: 1 / 2, semiArcPositionDegrees: 225 },
  },
  {
    id: 'equator-above-east', derivation: 'M3-derivations.md#equatorial-family',
    input: { ramcDegrees: 315, rightAscensionDegrees: 0, latitudeDegrees: 0, declinationDegrees: 0 },
    expected: { ...EQUATOR, hourAngleDegrees: -45, kind: 'quadrant', quadrant: 'above-east', boundary: null,
      meridianDistanceDegrees: 45, semiArcDegrees: 90, quadrantFraction: 1 / 2, semiArcPositionDegrees: 315 },
  },
  {
    id: 'equator-upper-meridian', derivation: 'M3-derivations.md#equatorial-family',
    input: { ramcDegrees: 25, rightAscensionDegrees: 25, latitudeDegrees: 0, declinationDegrees: 0 },
    expected: { ...EQUATOR, hourAngleDegrees: 0, kind: 'boundary', quadrant: null, boundary: 'upper-meridian',
      meridianDistanceDegrees: null, semiArcDegrees: null, quadrantFraction: null, semiArcPositionDegrees: 0 },
  },
  {
    id: 'equator-setting', derivation: 'M3-derivations.md#equatorial-family',
    input: { ramcDegrees: 90, rightAscensionDegrees: 0, latitudeDegrees: 0, declinationDegrees: 0 },
    expected: { ...EQUATOR, hourAngleDegrees: 90, kind: 'boundary', quadrant: null, boundary: 'setting',
      meridianDistanceDegrees: null, semiArcDegrees: null, quadrantFraction: null, semiArcPositionDegrees: 90 },
  },
  {
    id: 'equator-lower-meridian', derivation: 'M3-derivations.md#equatorial-family',
    input: { ramcDegrees: 180, rightAscensionDegrees: 0, latitudeDegrees: 0, declinationDegrees: 0 },
    expected: { ...EQUATOR, hourAngleDegrees: -180, kind: 'boundary', quadrant: null, boundary: 'lower-meridian',
      meridianDistanceDegrees: null, semiArcDegrees: null, quadrantFraction: null, semiArcPositionDegrees: 180 },
  },
  {
    id: 'equator-rising', derivation: 'M3-derivations.md#equatorial-family',
    input: { ramcDegrees: 270, rightAscensionDegrees: 0, latitudeDegrees: 0, declinationDegrees: 0 },
    expected: { ...EQUATOR, hourAngleDegrees: -90, kind: 'boundary', quadrant: null, boundary: 'rising',
      meridianDistanceDegrees: null, semiArcDegrees: null, quadrantFraction: null, semiArcPositionDegrees: 270 },
  },
  {
    id: 'equator-ra-wrap-west', derivation: 'M3-derivations.md#hour-angle-wraparound',
    input: { ramcDegrees: 10, rightAscensionDegrees: 350, latitudeDegrees: 0, declinationDegrees: 0 },
    expected: { ...EQUATOR, hourAngleDegrees: 20, kind: 'quadrant', quadrant: 'above-west', boundary: null,
      meridianDistanceDegrees: 20, semiArcDegrees: 90, quadrantFraction: 2 / 9, semiArcPositionDegrees: 20 },
  },
  {
    id: 'equator-ra-wrap-east', derivation: 'M3-derivations.md#hour-angle-wraparound',
    input: { ramcDegrees: 350, rightAscensionDegrees: 10, latitudeDegrees: 0, declinationDegrees: 0 },
    expected: { ...EQUATOR, hourAngleDegrees: -20, kind: 'quadrant', quadrant: 'above-east', boundary: null,
      meridianDistanceDegrees: 20, semiArcDegrees: 90, quadrantFraction: 7 / 9, semiArcPositionDegrees: 340 },
  },
  {
    id: 'north-north-above-west', derivation: 'M3-derivations.md#same-hemisphere-oblique-family',
    input: { ramcDegrees: 60, rightAscensionDegrees: 0, latitudeDegrees: 45, declinationDegrees: HALF_TANGENT_DECLINATION_DEGREES },
    expected: { ...SAME_HEMISPHERE, hourAngleDegrees: 60, kind: 'quadrant', quadrant: 'above-west', boundary: null,
      meridianDistanceDegrees: 60, semiArcDegrees: 120, quadrantFraction: 1 / 2, semiArcPositionDegrees: 45 },
  },
  {
    id: 'north-north-below-west', derivation: 'M3-derivations.md#same-hemisphere-oblique-family',
    input: { ramcDegrees: 150, rightAscensionDegrees: 0, latitudeDegrees: 45, declinationDegrees: HALF_TANGENT_DECLINATION_DEGREES },
    expected: { ...SAME_HEMISPHERE, hourAngleDegrees: 150, kind: 'quadrant', quadrant: 'below-west', boundary: null,
      meridianDistanceDegrees: 30, semiArcDegrees: 60, quadrantFraction: 1 / 2, semiArcPositionDegrees: 135 },
  },
  {
    id: 'north-north-below-east', derivation: 'M3-derivations.md#same-hemisphere-oblique-family',
    input: { ramcDegrees: 210, rightAscensionDegrees: 0, latitudeDegrees: 45, declinationDegrees: HALF_TANGENT_DECLINATION_DEGREES },
    expected: { ...SAME_HEMISPHERE, hourAngleDegrees: -150, kind: 'quadrant', quadrant: 'below-east', boundary: null,
      meridianDistanceDegrees: 30, semiArcDegrees: 60, quadrantFraction: 1 / 2, semiArcPositionDegrees: 225 },
  },
  {
    id: 'north-north-above-east', derivation: 'M3-derivations.md#same-hemisphere-oblique-family',
    input: { ramcDegrees: 300, rightAscensionDegrees: 0, latitudeDegrees: 45, declinationDegrees: HALF_TANGENT_DECLINATION_DEGREES },
    expected: { ...SAME_HEMISPHERE, hourAngleDegrees: -60, kind: 'quadrant', quadrant: 'above-east', boundary: null,
      meridianDistanceDegrees: 60, semiArcDegrees: 120, quadrantFraction: 1 / 2, semiArcPositionDegrees: 315 },
  },
  {
    id: 'north-north-above-west-one-third', derivation: 'M3-derivations.md#same-hemisphere-oblique-family',
    input: { ramcDegrees: 40, rightAscensionDegrees: 0, latitudeDegrees: 45, declinationDegrees: HALF_TANGENT_DECLINATION_DEGREES },
    expected: { ...SAME_HEMISPHERE, hourAngleDegrees: 40, kind: 'quadrant', quadrant: 'above-west', boundary: null,
      meridianDistanceDegrees: 40, semiArcDegrees: 120, quadrantFraction: 1 / 3, semiArcPositionDegrees: 30 },
  },
  {
    id: 'north-north-below-west-one-third', derivation: 'M3-derivations.md#same-hemisphere-oblique-family',
    input: { ramcDegrees: 140, rightAscensionDegrees: 0, latitudeDegrees: 45, declinationDegrees: HALF_TANGENT_DECLINATION_DEGREES },
    expected: { ...SAME_HEMISPHERE, hourAngleDegrees: 140, kind: 'quadrant', quadrant: 'below-west', boundary: null,
      meridianDistanceDegrees: 40, semiArcDegrees: 60, quadrantFraction: 1 / 3, semiArcPositionDegrees: 120 },
  },
  {
    id: 'north-north-below-east-one-third', derivation: 'M3-derivations.md#same-hemisphere-oblique-family',
    input: { ramcDegrees: 200, rightAscensionDegrees: 0, latitudeDegrees: 45, declinationDegrees: HALF_TANGENT_DECLINATION_DEGREES },
    expected: { ...SAME_HEMISPHERE, hourAngleDegrees: -160, kind: 'quadrant', quadrant: 'below-east', boundary: null,
      meridianDistanceDegrees: 20, semiArcDegrees: 60, quadrantFraction: 1 / 3, semiArcPositionDegrees: 210 },
  },
  {
    id: 'north-north-above-east-one-third', derivation: 'M3-derivations.md#same-hemisphere-oblique-family',
    input: { ramcDegrees: 280, rightAscensionDegrees: 0, latitudeDegrees: 45, declinationDegrees: HALF_TANGENT_DECLINATION_DEGREES },
    expected: { ...SAME_HEMISPHERE, hourAngleDegrees: -80, kind: 'quadrant', quadrant: 'above-east', boundary: null,
      meridianDistanceDegrees: 80, semiArcDegrees: 120, quadrantFraction: 1 / 3, semiArcPositionDegrees: 300 },
  },
  {
    id: 'south-south-above-west', derivation: 'M3-derivations.md#same-hemisphere-oblique-family',
    input: { ramcDegrees: 60, rightAscensionDegrees: 0, latitudeDegrees: -45, declinationDegrees: -HALF_TANGENT_DECLINATION_DEGREES },
    expected: { ...SAME_HEMISPHERE, hourAngleDegrees: 60, kind: 'quadrant', quadrant: 'above-west', boundary: null,
      meridianDistanceDegrees: 60, semiArcDegrees: 120, quadrantFraction: 1 / 2, semiArcPositionDegrees: 45 },
  },
  {
    id: 'south-south-below-west', derivation: 'M3-derivations.md#same-hemisphere-oblique-family',
    input: { ramcDegrees: 150, rightAscensionDegrees: 0, latitudeDegrees: -45, declinationDegrees: -HALF_TANGENT_DECLINATION_DEGREES },
    expected: { ...SAME_HEMISPHERE, hourAngleDegrees: 150, kind: 'quadrant', quadrant: 'below-west', boundary: null,
      meridianDistanceDegrees: 30, semiArcDegrees: 60, quadrantFraction: 1 / 2, semiArcPositionDegrees: 135 },
  },
  {
    id: 'south-south-below-east', derivation: 'M3-derivations.md#same-hemisphere-oblique-family',
    input: { ramcDegrees: 210, rightAscensionDegrees: 0, latitudeDegrees: -45, declinationDegrees: -HALF_TANGENT_DECLINATION_DEGREES },
    expected: { ...SAME_HEMISPHERE, hourAngleDegrees: -150, kind: 'quadrant', quadrant: 'below-east', boundary: null,
      meridianDistanceDegrees: 30, semiArcDegrees: 60, quadrantFraction: 1 / 2, semiArcPositionDegrees: 225 },
  },
  {
    id: 'south-south-above-east', derivation: 'M3-derivations.md#same-hemisphere-oblique-family',
    input: { ramcDegrees: 300, rightAscensionDegrees: 0, latitudeDegrees: -45, declinationDegrees: -HALF_TANGENT_DECLINATION_DEGREES },
    expected: { ...SAME_HEMISPHERE, hourAngleDegrees: -60, kind: 'quadrant', quadrant: 'above-east', boundary: null,
      meridianDistanceDegrees: 60, semiArcDegrees: 120, quadrantFraction: 1 / 2, semiArcPositionDegrees: 315 },
  },
  {
    id: 'north-south-above-west', derivation: 'M3-derivations.md#opposite-hemisphere-oblique-family',
    input: { ramcDegrees: 30, rightAscensionDegrees: 0, latitudeDegrees: 45, declinationDegrees: -HALF_TANGENT_DECLINATION_DEGREES },
    expected: { ...OPPOSITE_HEMISPHERE, hourAngleDegrees: 30, kind: 'quadrant', quadrant: 'above-west', boundary: null,
      meridianDistanceDegrees: 30, semiArcDegrees: 60, quadrantFraction: 1 / 2, semiArcPositionDegrees: 45 },
  },
  {
    id: 'north-south-below-west', derivation: 'M3-derivations.md#opposite-hemisphere-oblique-family',
    input: { ramcDegrees: 120, rightAscensionDegrees: 0, latitudeDegrees: 45, declinationDegrees: -HALF_TANGENT_DECLINATION_DEGREES },
    expected: { ...OPPOSITE_HEMISPHERE, hourAngleDegrees: 120, kind: 'quadrant', quadrant: 'below-west', boundary: null,
      meridianDistanceDegrees: 60, semiArcDegrees: 120, quadrantFraction: 1 / 2, semiArcPositionDegrees: 135 },
  },
  {
    id: 'north-south-below-east', derivation: 'M3-derivations.md#opposite-hemisphere-oblique-family',
    input: { ramcDegrees: 240, rightAscensionDegrees: 0, latitudeDegrees: 45, declinationDegrees: -HALF_TANGENT_DECLINATION_DEGREES },
    expected: { ...OPPOSITE_HEMISPHERE, hourAngleDegrees: -120, kind: 'quadrant', quadrant: 'below-east', boundary: null,
      meridianDistanceDegrees: 60, semiArcDegrees: 120, quadrantFraction: 1 / 2, semiArcPositionDegrees: 225 },
  },
  {
    id: 'north-south-above-east', derivation: 'M3-derivations.md#opposite-hemisphere-oblique-family',
    input: { ramcDegrees: 330, rightAscensionDegrees: 0, latitudeDegrees: 45, declinationDegrees: -HALF_TANGENT_DECLINATION_DEGREES },
    expected: { ...OPPOSITE_HEMISPHERE, hourAngleDegrees: -30, kind: 'quadrant', quadrant: 'above-east', boundary: null,
      meridianDistanceDegrees: 30, semiArcDegrees: 60, quadrantFraction: 1 / 2, semiArcPositionDegrees: 315 },
  },
  {
    id: 'south-north-above-west', derivation: 'M3-derivations.md#opposite-hemisphere-oblique-family',
    input: { ramcDegrees: 30, rightAscensionDegrees: 0, latitudeDegrees: -45, declinationDegrees: HALF_TANGENT_DECLINATION_DEGREES },
    expected: { ...OPPOSITE_HEMISPHERE, hourAngleDegrees: 30, kind: 'quadrant', quadrant: 'above-west', boundary: null,
      meridianDistanceDegrees: 30, semiArcDegrees: 60, quadrantFraction: 1 / 2, semiArcPositionDegrees: 45 },
  },
  {
    id: 'south-north-below-west', derivation: 'M3-derivations.md#opposite-hemisphere-oblique-family',
    input: { ramcDegrees: 120, rightAscensionDegrees: 0, latitudeDegrees: -45, declinationDegrees: HALF_TANGENT_DECLINATION_DEGREES },
    expected: { ...OPPOSITE_HEMISPHERE, hourAngleDegrees: 120, kind: 'quadrant', quadrant: 'below-west', boundary: null,
      meridianDistanceDegrees: 60, semiArcDegrees: 120, quadrantFraction: 1 / 2, semiArcPositionDegrees: 135 },
  },
  {
    id: 'south-north-below-east', derivation: 'M3-derivations.md#opposite-hemisphere-oblique-family',
    input: { ramcDegrees: 240, rightAscensionDegrees: 0, latitudeDegrees: -45, declinationDegrees: HALF_TANGENT_DECLINATION_DEGREES },
    expected: { ...OPPOSITE_HEMISPHERE, hourAngleDegrees: -120, kind: 'quadrant', quadrant: 'below-east', boundary: null,
      meridianDistanceDegrees: 60, semiArcDegrees: 120, quadrantFraction: 1 / 2, semiArcPositionDegrees: 225 },
  },
  {
    id: 'south-north-above-east', derivation: 'M3-derivations.md#opposite-hemisphere-oblique-family',
    input: { ramcDegrees: 330, rightAscensionDegrees: 0, latitudeDegrees: -45, declinationDegrees: HALF_TANGENT_DECLINATION_DEGREES },
    expected: { ...OPPOSITE_HEMISPHERE, hourAngleDegrees: -30, kind: 'quadrant', quadrant: 'above-east', boundary: null,
      meridianDistanceDegrees: 30, semiArcDegrees: 60, quadrantFraction: 1 / 2, semiArcPositionDegrees: 315 },
  },
] as const satisfies readonly SphereExample[];

export const SEMI_ARC_REFUSAL_EXAMPLES = [
  { id: 'north-geographic-pole', input: { latitudeDegrees: 90, declinationDegrees: 0 }, expectedReason: 'geographic-pole' },
  { id: 'south-geographic-pole', input: { latitudeDegrees: -90, declinationDegrees: 0 }, expectedReason: 'geographic-pole' },
  { id: 'north-celestial-pole', input: { latitudeDegrees: 0, declinationDegrees: 90 }, expectedReason: 'celestial-pole' },
  { id: 'south-celestial-pole', input: { latitudeDegrees: 0, declinationDegrees: -90 }, expectedReason: 'celestial-pole' },
  { id: 'north-lower-tangency-equal-angles', input: { latitudeDegrees: 45, declinationDegrees: 45 }, expectedReason: 'horizon-tangency' },
  { id: 'north-upper-tangency-equal-angles', input: { latitudeDegrees: 45, declinationDegrees: -45 }, expectedReason: 'horizon-tangency' },
  { id: 'north-lower-tangency-complements', input: { latitudeDegrees: 60, declinationDegrees: 30 }, expectedReason: 'horizon-tangency' },
  { id: 'north-upper-tangency-complements', input: { latitudeDegrees: 60, declinationDegrees: -30 }, expectedReason: 'horizon-tangency' },
  { id: 'south-upper-tangency-complements', input: { latitudeDegrees: -60, declinationDegrees: 30 }, expectedReason: 'horizon-tangency' },
  { id: 'south-lower-tangency-complements', input: { latitudeDegrees: -60, declinationDegrees: -30 }, expectedReason: 'horizon-tangency' },
  { id: 'north-circumpolar-above', input: { latitudeDegrees: 60, declinationDegrees: 45 }, expectedReason: 'circumpolar-above' },
  { id: 'north-circumpolar-below', input: { latitudeDegrees: 60, declinationDegrees: -45 }, expectedReason: 'circumpolar-below' },
  { id: 'south-circumpolar-below', input: { latitudeDegrees: -60, declinationDegrees: 45 }, expectedReason: 'circumpolar-below' },
  { id: 'south-circumpolar-above', input: { latitudeDegrees: -60, declinationDegrees: -45 }, expectedReason: 'circumpolar-above' },
] as const;
