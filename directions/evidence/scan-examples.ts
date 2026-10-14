/**
 * Authored synthetic enumeration proved in M9-derivations.md.
 * No implementation import or package result supplies an expectation.
 */
export const SCAN_FIXTURE_ARC_TOLERANCE_DEGREES = 1e-10;
export const SCAN_FIXTURE_TIMING_RELATIVE_TOLERANCE = 1e-11;

export const SCAN_GEOMETRY = { ramcDegrees: 0, latitudeDegrees: 0 } as const;
export const SCAN_SIGNIFICATOR = {
  kind: "body", id: "S",
  coordinates: { rightAscensionDegrees: 330, declinationDegrees: 0 }
} as const;
export const SCAN_PROMISSOR = {
  kind: "body", id: "P",
  coordinates: { rightAscensionDegrees: 60, declinationDegrees: 0 }
} as const;

export const SCAN_SOLAR_SAMPLES = {
  timeScale: "tt", frame: "true-equator-equinox-of-date", center: "geocentric", correction: "apparent",
  start: { jdTt: 2451545, rightAscensionDegrees: 359.75 },
  end: { jdTt: 2451546, rightAscensionDegrees: 0.25 }
} as const;

/** Multiply an independently authored arc by this rational to obtain age. */
export const SCAN_AGE_MULTIPLIERS = {
  ptolemy: { numerator: 1, denominator: 1 },
  naibod: { numerator: 360000, denominator: 354833 },
  "solar-equatorial-birth-day": { numerator: 2, denominator: 1 }
} as const;

type ScanFixtureContact = { readonly kind: "conjunction" }
  | { readonly kind: "aspect"; readonly aspect: "opposition" }
  | { readonly kind: "aspect"; readonly aspect: "sextile" | "square" | "trine";
    readonly branch: "westward" | "eastward" };

interface ScanFixtureExpected {
  readonly targetProportionalPositionDegrees: number;
  readonly targetHourAngleDegrees: number;
  readonly arcDegrees: number;
}

export interface ScanContactExample {
  readonly id: string;
  readonly derivation: string;
  readonly contact: ScanFixtureContact;
  readonly signedOffsetDegrees: number;
  readonly expected: {
    readonly direct: ScanFixtureExpected;
    readonly converse: ScanFixtureExpected;
  };
}

export const SCAN_CONTACT_EXAMPLES = [
  {
    id: "conjunction", derivation: "M9-derivations.md#enumerated-contacts",
    contact: { kind: "conjunction" }, signedOffsetDegrees: 0,
    expected: {
      direct: { targetProportionalPositionDegrees: 30, targetHourAngleDegrees: 30, arcDegrees: 90 },
      converse: { targetProportionalPositionDegrees: 300, targetHourAngleDegrees: -60, arcDegrees: 270 }
    }
  },
  {
    id: "sextile-westward", derivation: "M9-derivations.md#enumerated-contacts",
    contact: { kind: "aspect", aspect: "sextile", branch: "westward" }, signedOffsetDegrees: 60,
    expected: {
      direct: { targetProportionalPositionDegrees: 330, targetHourAngleDegrees: -30, arcDegrees: 30 },
      converse: { targetProportionalPositionDegrees: 0, targetHourAngleDegrees: 0, arcDegrees: 330 }
    }
  },
  {
    id: "sextile-eastward", derivation: "M9-derivations.md#enumerated-contacts",
    contact: { kind: "aspect", aspect: "sextile", branch: "eastward" }, signedOffsetDegrees: -60,
    expected: {
      direct: { targetProportionalPositionDegrees: 90, targetHourAngleDegrees: 90, arcDegrees: 150 },
      converse: { targetProportionalPositionDegrees: 240, targetHourAngleDegrees: -120, arcDegrees: 210 }
    }
  },
  {
    id: "square-westward", derivation: "M9-derivations.md#enumerated-contacts",
    contact: { kind: "aspect", aspect: "square", branch: "westward" }, signedOffsetDegrees: 90,
    expected: {
      direct: { targetProportionalPositionDegrees: 300, targetHourAngleDegrees: -60, arcDegrees: 0 },
      converse: { targetProportionalPositionDegrees: 30, targetHourAngleDegrees: 30, arcDegrees: 0 }
    }
  },
  {
    id: "square-eastward", derivation: "M9-derivations.md#enumerated-contacts",
    contact: { kind: "aspect", aspect: "square", branch: "eastward" }, signedOffsetDegrees: -90,
    expected: {
      direct: { targetProportionalPositionDegrees: 120, targetHourAngleDegrees: 120, arcDegrees: 180 },
      converse: { targetProportionalPositionDegrees: 210, targetHourAngleDegrees: -150, arcDegrees: 180 }
    }
  },
  {
    id: "trine-westward", derivation: "M9-derivations.md#enumerated-contacts",
    contact: { kind: "aspect", aspect: "trine", branch: "westward" }, signedOffsetDegrees: 120,
    expected: {
      direct: { targetProportionalPositionDegrees: 270, targetHourAngleDegrees: -90, arcDegrees: 330 },
      converse: { targetProportionalPositionDegrees: 60, targetHourAngleDegrees: 60, arcDegrees: 30 }
    }
  },
  {
    id: "trine-eastward", derivation: "M9-derivations.md#enumerated-contacts",
    contact: { kind: "aspect", aspect: "trine", branch: "eastward" }, signedOffsetDegrees: -120,
    expected: {
      direct: { targetProportionalPositionDegrees: 150, targetHourAngleDegrees: 150, arcDegrees: 210 },
      converse: { targetProportionalPositionDegrees: 180, targetHourAngleDegrees: -180, arcDegrees: 150 }
    }
  },
  {
    id: "opposition", derivation: "M9-derivations.md#enumerated-contacts",
    contact: { kind: "aspect", aspect: "opposition" }, signedOffsetDegrees: 180,
    expected: {
      direct: { targetProportionalPositionDegrees: 210, targetHourAngleDegrees: -150, arcDegrees: 270 },
      converse: { targetProportionalPositionDegrees: 120, targetHourAngleDegrees: 120, arcDegrees: 90 }
    }
  }
] as const satisfies readonly ScanContactExample[];

/**
 * Full age-ascending order, retaining input order for equal ages.
 * Original row index = contactIndex * 2 + motionIndex, direct before converse.
 * Literal expectations, not a sort of a library's output.
 */
export const SCAN_SORTED_ROW_INDICES = [6, 7, 2, 11, 0, 15, 4, 13, 8, 9, 5, 12, 1, 14, 3, 10] as const;
