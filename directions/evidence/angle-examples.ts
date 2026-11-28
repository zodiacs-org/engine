/*
 * Authored synthetic spherical examples. Their independent arbiter is
 * M4-derivations.md. No engine or directions implementation is imported.
 * Expected arcs were obtained from exact signed-angle arithmetic by hand.
 */

/** Fixed before comparing any directional-arc implementation with these rows. */
export const ANGLE_FIXTURE_TOLERANCES = Object.freeze({ angleDegrees: 1e-10 });

// An input definition only. tan(d) = 1/2 yields exact AD values of +/-30.
const HALF_TANGENT_DECLINATION_DEGREES = Math.atan(1 / 2) * 180 / Math.PI;

export interface AngleExample {
  readonly id: string;
  readonly derivation: string;
  readonly coordinates: {
    readonly ramcDegrees: number;
    readonly rightAscensionDegrees: number;
    readonly latitudeDegrees: number;
    readonly declinationDegrees: number;
  };
  readonly angle: 'mc' | 'ic' | 'asc' | 'dsc';
  readonly expected: {
    readonly initialHourAngleDegrees: number;
    readonly targetHourAngleDegrees: number;
    readonly arcDegrees: number;
    readonly diurnalSemiArcDegrees: number;
    readonly nocturnalSemiArcDegrees: number;
    readonly ascensionalDifferenceDegrees: number;
    readonly wholeTurnsAdded: 0 | 1;
  };
}

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

export const ANGLE_EXAMPLES = [
  {
    id: 'equator-east-to-mc', derivation: 'M4-derivations.md#equatorial-contacts',
    coordinates: { ramcDegrees: 315, rightAscensionDegrees: 0, latitudeDegrees: 0, declinationDegrees: 0 }, angle: 'mc',
    expected: { ...EQUATOR, initialHourAngleDegrees: -45, targetHourAngleDegrees: 0, arcDegrees: 45, wholeTurnsAdded: 0 },
  },
  {
    id: 'equator-east-to-ic', derivation: 'M4-derivations.md#equatorial-contacts',
    coordinates: { ramcDegrees: 315, rightAscensionDegrees: 0, latitudeDegrees: 0, declinationDegrees: 0 }, angle: 'ic',
    expected: { ...EQUATOR, initialHourAngleDegrees: -45, targetHourAngleDegrees: -180, arcDegrees: 225, wholeTurnsAdded: 1 },
  },
  {
    id: 'equator-east-to-asc', derivation: 'M4-derivations.md#equatorial-contacts',
    coordinates: { ramcDegrees: 315, rightAscensionDegrees: 0, latitudeDegrees: 0, declinationDegrees: 0 }, angle: 'asc',
    expected: { ...EQUATOR, initialHourAngleDegrees: -45, targetHourAngleDegrees: -90, arcDegrees: 315, wholeTurnsAdded: 1 },
  },
  {
    id: 'equator-east-to-dsc', derivation: 'M4-derivations.md#equatorial-contacts',
    coordinates: { ramcDegrees: 315, rightAscensionDegrees: 0, latitudeDegrees: 0, declinationDegrees: 0 }, angle: 'dsc',
    expected: { ...EQUATOR, initialHourAngleDegrees: -45, targetHourAngleDegrees: 90, arcDegrees: 135, wholeTurnsAdded: 0 },
  },
  {
    id: 'equator-coincident-mc', derivation: 'M4-derivations.md#equatorial-contacts',
    coordinates: { ramcDegrees: 25, rightAscensionDegrees: 25, latitudeDegrees: 0, declinationDegrees: 0 }, angle: 'mc',
    expected: { ...EQUATOR, initialHourAngleDegrees: 0, targetHourAngleDegrees: 0, arcDegrees: 0, wholeTurnsAdded: 0 },
  },
  {
    id: 'equator-coincident-ic', derivation: 'M4-derivations.md#equatorial-contacts',
    coordinates: { ramcDegrees: 180, rightAscensionDegrees: 0, latitudeDegrees: 0, declinationDegrees: 0 }, angle: 'ic',
    expected: { ...EQUATOR, initialHourAngleDegrees: -180, targetHourAngleDegrees: -180, arcDegrees: 0, wholeTurnsAdded: 0 },
  },
  {
    id: 'equator-coincident-asc', derivation: 'M4-derivations.md#equatorial-contacts',
    coordinates: { ramcDegrees: 270, rightAscensionDegrees: 0, latitudeDegrees: 0, declinationDegrees: 0 }, angle: 'asc',
    expected: { ...EQUATOR, initialHourAngleDegrees: -90, targetHourAngleDegrees: -90, arcDegrees: 0, wholeTurnsAdded: 0 },
  },
  {
    id: 'equator-coincident-dsc', derivation: 'M4-derivations.md#equatorial-contacts',
    coordinates: { ramcDegrees: 90, rightAscensionDegrees: 0, latitudeDegrees: 0, declinationDegrees: 0 }, angle: 'dsc',
    expected: { ...EQUATOR, initialHourAngleDegrees: 90, targetHourAngleDegrees: 90, arcDegrees: 0, wholeTurnsAdded: 0 },
  },
  {
    id: 'ra-wrap-west-to-mc', derivation: 'M4-derivations.md#right-ascension-wraparound',
    coordinates: { ramcDegrees: 10, rightAscensionDegrees: 350, latitudeDegrees: 0, declinationDegrees: 0 }, angle: 'mc',
    expected: { ...EQUATOR, initialHourAngleDegrees: 20, targetHourAngleDegrees: 0, arcDegrees: 340, wholeTurnsAdded: 1 },
  },
  {
    id: 'ra-wrap-east-to-mc', derivation: 'M4-derivations.md#right-ascension-wraparound',
    coordinates: { ramcDegrees: 350, rightAscensionDegrees: 10, latitudeDegrees: 0, declinationDegrees: 0 }, angle: 'mc',
    expected: { ...EQUATOR, initialHourAngleDegrees: -20, targetHourAngleDegrees: 0, arcDegrees: 20, wholeTurnsAdded: 0 },
  },
  {
    id: 'ra-wrap-west-to-asc', derivation: 'M4-derivations.md#right-ascension-wraparound',
    coordinates: { ramcDegrees: 10, rightAscensionDegrees: 350, latitudeDegrees: 0, declinationDegrees: 0 }, angle: 'asc',
    expected: { ...EQUATOR, initialHourAngleDegrees: 20, targetHourAngleDegrees: -90, arcDegrees: 250, wholeTurnsAdded: 1 },
  },
  {
    id: 'ra-wrap-east-to-dsc', derivation: 'M4-derivations.md#right-ascension-wraparound',
    coordinates: { ramcDegrees: 350, rightAscensionDegrees: 10, latitudeDegrees: 0, declinationDegrees: 0 }, angle: 'dsc',
    expected: { ...EQUATOR, initialHourAngleDegrees: -20, targetHourAngleDegrees: 90, arcDegrees: 110, wholeTurnsAdded: 0 },
  },
  {
    id: 'north-north-to-mc', derivation: 'M4-derivations.md#oblique-contacts',
    coordinates: { ramcDegrees: 300, rightAscensionDegrees: 0, latitudeDegrees: 45, declinationDegrees: HALF_TANGENT_DECLINATION_DEGREES }, angle: 'mc',
    expected: { ...SAME_HEMISPHERE, initialHourAngleDegrees: -60, targetHourAngleDegrees: 0, arcDegrees: 60, wholeTurnsAdded: 0 },
  },
  {
    id: 'north-north-to-ic', derivation: 'M4-derivations.md#oblique-contacts',
    coordinates: { ramcDegrees: 300, rightAscensionDegrees: 0, latitudeDegrees: 45, declinationDegrees: HALF_TANGENT_DECLINATION_DEGREES }, angle: 'ic',
    expected: { ...SAME_HEMISPHERE, initialHourAngleDegrees: -60, targetHourAngleDegrees: -180, arcDegrees: 240, wholeTurnsAdded: 1 },
  },
  {
    id: 'north-north-to-asc', derivation: 'M4-derivations.md#oblique-contacts',
    coordinates: { ramcDegrees: 300, rightAscensionDegrees: 0, latitudeDegrees: 45, declinationDegrees: HALF_TANGENT_DECLINATION_DEGREES }, angle: 'asc',
    expected: { ...SAME_HEMISPHERE, initialHourAngleDegrees: -60, targetHourAngleDegrees: -120, arcDegrees: 300, wholeTurnsAdded: 1 },
  },
  {
    id: 'north-north-to-dsc', derivation: 'M4-derivations.md#oblique-contacts',
    coordinates: { ramcDegrees: 300, rightAscensionDegrees: 0, latitudeDegrees: 45, declinationDegrees: HALF_TANGENT_DECLINATION_DEGREES }, angle: 'dsc',
    expected: { ...SAME_HEMISPHERE, initialHourAngleDegrees: -60, targetHourAngleDegrees: 120, arcDegrees: 180, wholeTurnsAdded: 0 },
  },
  {
    id: 'south-south-to-mc', derivation: 'M4-derivations.md#oblique-contacts',
    coordinates: { ramcDegrees: 150, rightAscensionDegrees: 0, latitudeDegrees: -45, declinationDegrees: -HALF_TANGENT_DECLINATION_DEGREES }, angle: 'mc',
    expected: { ...SAME_HEMISPHERE, initialHourAngleDegrees: 150, targetHourAngleDegrees: 0, arcDegrees: 210, wholeTurnsAdded: 1 },
  },
  {
    id: 'south-south-to-ic', derivation: 'M4-derivations.md#oblique-contacts',
    coordinates: { ramcDegrees: 150, rightAscensionDegrees: 0, latitudeDegrees: -45, declinationDegrees: -HALF_TANGENT_DECLINATION_DEGREES }, angle: 'ic',
    expected: { ...SAME_HEMISPHERE, initialHourAngleDegrees: 150, targetHourAngleDegrees: -180, arcDegrees: 30, wholeTurnsAdded: 1 },
  },
  {
    id: 'south-south-to-asc', derivation: 'M4-derivations.md#oblique-contacts',
    coordinates: { ramcDegrees: 150, rightAscensionDegrees: 0, latitudeDegrees: -45, declinationDegrees: -HALF_TANGENT_DECLINATION_DEGREES }, angle: 'asc',
    expected: { ...SAME_HEMISPHERE, initialHourAngleDegrees: 150, targetHourAngleDegrees: -120, arcDegrees: 90, wholeTurnsAdded: 1 },
  },
  {
    id: 'south-south-to-dsc', derivation: 'M4-derivations.md#oblique-contacts',
    coordinates: { ramcDegrees: 150, rightAscensionDegrees: 0, latitudeDegrees: -45, declinationDegrees: -HALF_TANGENT_DECLINATION_DEGREES }, angle: 'dsc',
    expected: { ...SAME_HEMISPHERE, initialHourAngleDegrees: 150, targetHourAngleDegrees: 120, arcDegrees: 330, wholeTurnsAdded: 1 },
  },
  {
    id: 'north-south-to-mc', derivation: 'M4-derivations.md#oblique-contacts',
    coordinates: { ramcDegrees: 330, rightAscensionDegrees: 0, latitudeDegrees: 45, declinationDegrees: -HALF_TANGENT_DECLINATION_DEGREES }, angle: 'mc',
    expected: { ...OPPOSITE_HEMISPHERE, initialHourAngleDegrees: -30, targetHourAngleDegrees: 0, arcDegrees: 30, wholeTurnsAdded: 0 },
  },
  {
    id: 'north-south-to-ic', derivation: 'M4-derivations.md#oblique-contacts',
    coordinates: { ramcDegrees: 330, rightAscensionDegrees: 0, latitudeDegrees: 45, declinationDegrees: -HALF_TANGENT_DECLINATION_DEGREES }, angle: 'ic',
    expected: { ...OPPOSITE_HEMISPHERE, initialHourAngleDegrees: -30, targetHourAngleDegrees: -180, arcDegrees: 210, wholeTurnsAdded: 1 },
  },
  {
    id: 'north-south-to-asc', derivation: 'M4-derivations.md#oblique-contacts',
    coordinates: { ramcDegrees: 330, rightAscensionDegrees: 0, latitudeDegrees: 45, declinationDegrees: -HALF_TANGENT_DECLINATION_DEGREES }, angle: 'asc',
    expected: { ...OPPOSITE_HEMISPHERE, initialHourAngleDegrees: -30, targetHourAngleDegrees: -60, arcDegrees: 330, wholeTurnsAdded: 1 },
  },
  {
    id: 'north-south-to-dsc', derivation: 'M4-derivations.md#oblique-contacts',
    coordinates: { ramcDegrees: 330, rightAscensionDegrees: 0, latitudeDegrees: 45, declinationDegrees: -HALF_TANGENT_DECLINATION_DEGREES }, angle: 'dsc',
    expected: { ...OPPOSITE_HEMISPHERE, initialHourAngleDegrees: -30, targetHourAngleDegrees: 60, arcDegrees: 90, wholeTurnsAdded: 0 },
  },
  {
    id: 'south-north-to-mc', derivation: 'M4-derivations.md#oblique-contacts',
    coordinates: { ramcDegrees: 120, rightAscensionDegrees: 0, latitudeDegrees: -45, declinationDegrees: HALF_TANGENT_DECLINATION_DEGREES }, angle: 'mc',
    expected: { ...OPPOSITE_HEMISPHERE, initialHourAngleDegrees: 120, targetHourAngleDegrees: 0, arcDegrees: 240, wholeTurnsAdded: 1 },
  },
  {
    id: 'south-north-to-ic', derivation: 'M4-derivations.md#oblique-contacts',
    coordinates: { ramcDegrees: 120, rightAscensionDegrees: 0, latitudeDegrees: -45, declinationDegrees: HALF_TANGENT_DECLINATION_DEGREES }, angle: 'ic',
    expected: { ...OPPOSITE_HEMISPHERE, initialHourAngleDegrees: 120, targetHourAngleDegrees: -180, arcDegrees: 60, wholeTurnsAdded: 1 },
  },
  {
    id: 'south-north-to-asc', derivation: 'M4-derivations.md#oblique-contacts',
    coordinates: { ramcDegrees: 120, rightAscensionDegrees: 0, latitudeDegrees: -45, declinationDegrees: HALF_TANGENT_DECLINATION_DEGREES }, angle: 'asc',
    expected: { ...OPPOSITE_HEMISPHERE, initialHourAngleDegrees: 120, targetHourAngleDegrees: -60, arcDegrees: 180, wholeTurnsAdded: 1 },
  },
  {
    id: 'south-north-to-dsc', derivation: 'M4-derivations.md#oblique-contacts',
    coordinates: { ramcDegrees: 120, rightAscensionDegrees: 0, latitudeDegrees: -45, declinationDegrees: HALF_TANGENT_DECLINATION_DEGREES }, angle: 'dsc',
    expected: { ...OPPOSITE_HEMISPHERE, initialHourAngleDegrees: 120, targetHourAngleDegrees: 60, arcDegrees: 300, wholeTurnsAdded: 1 },
  },
  {
    id: 'equator-before-mc', derivation: 'M4-derivations.md#boundary-neighbours',
    coordinates: { ramcDegrees: 0, rightAscensionDegrees: 1 / 1024, latitudeDegrees: 0, declinationDegrees: 0 }, angle: 'mc',
    expected: { ...EQUATOR, initialHourAngleDegrees: -1 / 1024, targetHourAngleDegrees: 0, arcDegrees: 1 / 1024, wholeTurnsAdded: 0 },
  },
  {
    id: 'equator-after-mc', derivation: 'M4-derivations.md#boundary-neighbours',
    coordinates: { ramcDegrees: 1 / 1024, rightAscensionDegrees: 0, latitudeDegrees: 0, declinationDegrees: 0 }, angle: 'mc',
    expected: { ...EQUATOR, initialHourAngleDegrees: 1 / 1024, targetHourAngleDegrees: 0, arcDegrees: 359.9990234375, wholeTurnsAdded: 1 },
  },
  {
    id: 'equator-before-ic', derivation: 'M4-derivations.md#boundary-neighbours',
    coordinates: { ramcDegrees: 179.9990234375, rightAscensionDegrees: 0, latitudeDegrees: 0, declinationDegrees: 0 }, angle: 'ic',
    expected: { ...EQUATOR, initialHourAngleDegrees: 179.9990234375, targetHourAngleDegrees: -180, arcDegrees: 1 / 1024, wholeTurnsAdded: 1 },
  },
  {
    id: 'equator-after-ic', derivation: 'M4-derivations.md#boundary-neighbours',
    coordinates: { ramcDegrees: 180.0009765625, rightAscensionDegrees: 0, latitudeDegrees: 0, declinationDegrees: 0 }, angle: 'ic',
    expected: { ...EQUATOR, initialHourAngleDegrees: -179.9990234375, targetHourAngleDegrees: -180, arcDegrees: 359.9990234375, wholeTurnsAdded: 1 },
  },
  {
    id: 'equator-before-asc', derivation: 'M4-derivations.md#boundary-neighbours',
    coordinates: { ramcDegrees: 269.9990234375, rightAscensionDegrees: 0, latitudeDegrees: 0, declinationDegrees: 0 }, angle: 'asc',
    expected: { ...EQUATOR, initialHourAngleDegrees: -90.0009765625, targetHourAngleDegrees: -90, arcDegrees: 1 / 1024, wholeTurnsAdded: 0 },
  },
  {
    id: 'equator-after-asc', derivation: 'M4-derivations.md#boundary-neighbours',
    coordinates: { ramcDegrees: 270.0009765625, rightAscensionDegrees: 0, latitudeDegrees: 0, declinationDegrees: 0 }, angle: 'asc',
    expected: { ...EQUATOR, initialHourAngleDegrees: -89.9990234375, targetHourAngleDegrees: -90, arcDegrees: 359.9990234375, wholeTurnsAdded: 1 },
  },
  {
    id: 'equator-before-dsc', derivation: 'M4-derivations.md#boundary-neighbours',
    coordinates: { ramcDegrees: 89.9990234375, rightAscensionDegrees: 0, latitudeDegrees: 0, declinationDegrees: 0 }, angle: 'dsc',
    expected: { ...EQUATOR, initialHourAngleDegrees: 89.9990234375, targetHourAngleDegrees: 90, arcDegrees: 1 / 1024, wholeTurnsAdded: 0 },
  },
  {
    id: 'equator-after-dsc', derivation: 'M4-derivations.md#boundary-neighbours',
    coordinates: { ramcDegrees: 90.0009765625, rightAscensionDegrees: 0, latitudeDegrees: 0, declinationDegrees: 0 }, angle: 'dsc',
    expected: { ...EQUATOR, initialHourAngleDegrees: 90.0009765625, targetHourAngleDegrees: 90, arcDegrees: 359.9990234375, wholeTurnsAdded: 1 },
  },
  {
    id: 'equator-before-ic-at-binary64-step', derivation: 'M4-derivations.md#boundary-neighbours',
    coordinates: { ramcDegrees: 179.99999999999997, rightAscensionDegrees: 0, latitudeDegrees: 0, declinationDegrees: 0 }, angle: 'ic',
    expected: { ...EQUATOR, initialHourAngleDegrees: 179.99999999999997, targetHourAngleDegrees: -180,
      arcDegrees: 1 / 35184372088832, wholeTurnsAdded: 1 },
  },
] as const satisfies readonly AngleExample[];
