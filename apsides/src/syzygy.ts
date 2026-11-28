import { calc } from "@zodiacs/engine/calc";
import type { CalcBounds, CalcInstant, CalcReceipt, CalcRefusal, CalcRequest } from "@zodiacs/engine/calc";

export interface SyzygyLongitudeSample {
  readonly longitudeDegrees: number;
  readonly instant: CalcInstant;
  /** Engine direction metadata, not an error bound on the phase classification. */
  readonly bounds: CalcBounds;
  readonly receipt: CalcReceipt<CalcRequest>;
}

export interface LunarSyzygyAnnotation {
  readonly convention: "geocentric-apparent-ecliptic-longitude-of-date";
  readonly orbDegrees: number;
  /** Directed Moon minus Sun longitude in [0,360), not spatial angular separation. */
  readonly elongationDegrees: number;
  /** Quadrature ties choose new-moon; they cannot match an allowed orb. */
  readonly nearestPhase: "new-moon" | "full-moon";
  /** Absolute shortest longitude offset from the nearest phase, in degrees. */
  readonly separationDegrees: number;
  readonly candidate: "supermoon-candidate" | "micromoon-candidate" | null;
  readonly moon: SyzygyLongitudeSample;
  readonly sun: SyzygyLongitudeSample;
}

/** Called only after the containing options object's data slots were validated. */
export function readSyzygyOrbDegrees(options: { readonly syzygyOrbDegrees?: number }): number | undefined {
  if (!Object.hasOwn(options, "syzygyOrbDegrees")) return undefined;
  const orb = options.syzygyOrbDegrees;
  if (typeof orb !== "number" || !Number.isFinite(orb) || orb < 0 || orb >= 90) {
    throw new RangeError("syzygyOrbDegrees must be a finite number from 0 inclusive to 90 exclusive.");
  }
  return orb === 0 ? 0 : orb;
}

/** One public engine call, with no alternate ephemeris or phase-time search. */
export function sampleSyzygyLongitude(
  body: "Moon" | "Sun", jdTt: number
): { readonly status: "ok"; readonly sample: SyzygyLongitudeSample } | CalcRefusal {
  const position = calc({
    body, time: { jd: jdTt, scale: "tt" }, center: "geocentric",
    frame: "ecliptic-true-of-date", zodiac: "tropical",
    flags: { correction: "apparent", speeds: false, cartesian: false, units: "degrees", deflection: false }
  });
  if (position.status === "refused") return position;
  const instant = position.receipt.instants[0];
  if (!Number.isFinite(position.lon) || position.lon < 0 || position.lon >= 360 ||
    instant === undefined || instant.jdTt !== jdTt) {
    throw new Error("Engine syzygy longitude sample is incomplete or has a different TT instant.");
  }
  return {
    status: "ok",
    sample: { longitudeDegrees: position.lon, instant, bounds: position.bounds, receipt: position.receipt }
  };
}

/** Ordinary binary64 longitude arithmetic, inclusive orb and no added epsilon. */
export function describeLunarSyzygy(
  kind: "perigee" | "apogee", orbDegrees: number,
  moon: SyzygyLongitudeSample, sun: SyzygyLongitudeSample
): LunarSyzygyAnnotation {
  const difference = moon.longitudeDegrees - sun.longitudeDegrees;
  const magnitude = Math.abs(difference);
  const newSeparation = Math.min(magnitude, 360 - magnitude);
  const fullSeparation = Math.abs(magnitude - 180);
  const nearestPhase = newSeparation <= fullSeparation ? "new-moon" : "full-moon";
  const separationDegrees = Math.min(newSeparation, fullSeparation);
  const wrapped = difference < 0 ? difference + 360 : difference;
  // A tiny negative difference can round to 360 when wrapped. Keep the output
  // in range, but classify using the unwrapped magnitude so it is not lost.
  const elongationDegrees = wrapped === 360 || wrapped === 0 ? 0 : wrapped;
  return {
    convention: "geocentric-apparent-ecliptic-longitude-of-date",
    orbDegrees, elongationDegrees, nearestPhase, separationDegrees,
    candidate: separationDegrees <= orbDegrees
      ? kind === "perigee" ? "supermoon-candidate" : "micromoon-candidate" : null,
    moon, sun
  };
}
