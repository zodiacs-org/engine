import { calc } from "@zodiacs/engine/calc";
import type {
  CalcBounds, CalcInstant, CalcReceipt, CalcRefusal, CalcRequest, CalcTime
} from "@zodiacs/engine/calc";
import { distanceTarget } from "./targets.js";
import type { ApsisBody, DistanceTarget } from "./targets.js";

/** Exact IAU 2012 Resolution B2 astronomical unit, converted to kilometres. */
export const AU_KM = 149_597_870.7;
const SECONDS_PER_DAY = 86_400;

export interface DistanceSample {
  readonly status: "ok";
  readonly target: DistanceTarget;
  /** Includes TT and UT1, plus the engine's qualified civil-time rendering. */
  readonly instant: CalcInstant;
  readonly distanceAu: number;
  readonly distanceKm: number;
  /** Signed range rate. Negative means approaching the specified center. */
  readonly radialSpeedKmPerSecond: number;
  /** Magnitude of Cartesian velocity relative to the specified center. */
  readonly orbitalSpeedKmPerSecond: number;
  /** Engine position bounds; these do not establish apsis timing accuracy. */
  readonly bounds: CalcBounds;
  /** The original engine receipt, with its canonical replay request. */
  readonly receipt: CalcReceipt<CalcRequest>;
}

/**
 * Sample simultaneous geometric distance and velocity using the engine.
 * No search or I/O. Malformed inputs throw; engine refusals are preserved.
 * The engine installs its time model internally on each calculation.
 */
export function sampleDistance(body: ApsisBody, time: CalcTime): DistanceSample | CalcRefusal {
  const target = distanceTarget(body);
  const position = calc({
    body,
    time,
    center: target.center,
    frame: "equatorial-j2000",
    flags: { correction: "geometric", speeds: true, cartesian: true }
  });
  if (position.status === "refused") return position;

  const { dist, speeds, cartesian, receipt } = position;
  const instant = receipt.instants[0];
  if (
    dist === null || !Number.isFinite(dist) || dist <= 0 ||
    speeds === null || speeds.dist === null || !Number.isFinite(speeds.dist) ||
    cartesian === null ||
    cartesian.vx === null || cartesian.vy === null || cartesian.vz === null ||
    !Number.isFinite(cartesian.vx) || !Number.isFinite(cartesian.vy) || !Number.isFinite(cartesian.vz) ||
    instant === undefined
  ) {
    throw new Error("Engine geometric distance sample is incomplete or non-finite.");
  }

  return {
    status: "ok",
    target,
    instant,
    distanceAu: dist,
    distanceKm: dist * AU_KM,
    radialSpeedKmPerSecond: speeds.dist * AU_KM / SECONDS_PER_DAY,
    orbitalSpeedKmPerSecond: Math.hypot(cartesian.vx, cartesian.vy, cartesian.vz) * AU_KM / SECONDS_PER_DAY,
    bounds: position.bounds,
    receipt
  };
}
