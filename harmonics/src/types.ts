/** A supplied longitude in degrees. Names are exact, case-sensitive identifiers. */
export interface LongitudePoint {
  readonly body: string;
  readonly lon: number;
}

export interface HarmonicOptions {
  /** Positive safe integer ceiling for this call; defaults to 180. */
  readonly maxHarmonic?: number;
}

export interface HarmonicPoint extends LongitudePoint {
  /** Supplied longitude normalized onto the original circle, in degrees. */
  readonly sourceLon: number;
}

/** A longitude transform of supplied data, with no ephemeris or engine receipt. */
export interface HarmonicChart {
  readonly harmonic: number;
  readonly maxHarmonic: number;
  readonly points: readonly HarmonicPoint[];
}
