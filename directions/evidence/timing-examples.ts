/*
 * Authored rational timing examples, derived in M7-derivations.md.
 * No engine or directions implementation supplies an expected value.
 * These arcs and solar coordinates are synthetic arithmetic inputs.
 */

/** Fixed before running the implementation on this finite fixture set. */
export const TIMING_FIXTURE_RELATIVE_TOLERANCE = 16 * Number.EPSILON;

export interface Rational {
  readonly numerator: number;
  readonly denominator: number;
}

export const YEAR_EXAMPLES = [
  { yearUnit: "tropical-365.2422-days", daysPerYear: { numerator: 1826211, denominator: 5000 } },
  { yearUnit: "julian-365.25-days", daysPerYear: { numerator: 1461, denominator: 4 } }
] as const;

export const FIXED_TIMING_EXAMPLES = [
  {
    id: "ptolemy-zero", key: "ptolemy", arc: { numerator: 0, denominator: 1 },
    rate: { numerator: 1, denominator: 1 }, age: { numerator: 0, denominator: 1 }
  },
  {
    id: "ptolemy-eighth", key: "ptolemy", arc: { numerator: 1, denominator: 8 },
    rate: { numerator: 1, denominator: 1 }, age: { numerator: 1, denominator: 8 }
  },
  {
    id: "ptolemy-twelve-and-half", key: "ptolemy", arc: { numerator: 25, denominator: 2 },
    rate: { numerator: 1, denominator: 1 }, age: { numerator: 25, denominator: 2 }
  },
  {
    id: "ptolemy-near-turn", key: "ptolemy", arc: { numerator: 719, denominator: 2 },
    rate: { numerator: 1, denominator: 1 }, age: { numerator: 719, denominator: 2 }
  },
  {
    id: "naibod-zero", key: "naibod", arc: { numerator: 0, denominator: 1 },
    rate: { numerator: 354833, denominator: 360000 }, age: { numerator: 0, denominator: 1 }
  },
  {
    id: "naibod-one-degree", key: "naibod", arc: { numerator: 1, denominator: 1 },
    rate: { numerator: 354833, denominator: 360000 }, age: { numerator: 360000, denominator: 354833 }
  },
  {
    id: "naibod-thirty-six-years", key: "naibod", arc: { numerator: 354833, denominator: 10000 },
    rate: { numerator: 354833, denominator: 360000 }, age: { numerator: 36, denominator: 1 }
  },
  {
    id: "naibod-near-turn", key: "naibod", arc: { numerator: 719, denominator: 2 },
    rate: { numerator: 354833, denominator: 360000 }, age: { numerator: 129420000, denominator: 354833 }
  }
] as const;

export const SOLAR_TIMING_EXAMPLES = [
  {
    id: "solar-half-degree", startRa: 100, endRa: 100.5, wholeTurnsAdded: 0,
    arc: { numerator: 25, denominator: 2 }, rate: { numerator: 1, denominator: 2 },
    age: { numerator: 25, denominator: 1 }
  },
  {
    id: "solar-zero-crossing", startRa: 359.75, endRa: 0.25, wholeTurnsAdded: 1,
    arc: { numerator: 25, denominator: 2 }, rate: { numerator: 1, denominator: 2 },
    age: { numerator: 25, denominator: 1 }
  },
  {
    id: "solar-five-quarters", startRa: 80, endRa: 81.25, wholeTurnsAdded: 0,
    arc: { numerator: 25, denominator: 2 }, rate: { numerator: 5, denominator: 4 },
    age: { numerator: 10, denominator: 1 }
  },
  {
    id: "solar-sixteenth", startRa: 0, endRa: 0.0625, wholeTurnsAdded: 0,
    arc: { numerator: 1, denominator: 8 }, rate: { numerator: 1, denominator: 16 },
    age: { numerator: 2, denominator: 1 }
  },
  {
    id: "solar-zero-arc", startRa: 150, endRa: 151, wholeTurnsAdded: 0,
    arc: { numerator: 0, denominator: 1 }, rate: { numerator: 1, denominator: 1 },
    age: { numerator: 0, denominator: 1 }
  }
] as const;
