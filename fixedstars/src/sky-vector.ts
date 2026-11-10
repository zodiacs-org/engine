/** Internal bundle dependency adapter. Never installed on astronomy-engine. */
import { Body, GeoVector as nativeGeoVector, MakeTime, Vector } from "astronomy-engine";
import type { FlexibleDateTime } from "astronomy-engine";

import { propagateStarDirection } from "./positions.js";
import type { CatalogStar } from "./types.js";

export { Body } from "astronomy-engine";

/** A numerical ray scale, not a stellar distance or a catalog measurement. */
export const STAR_RAY_SCALE_AU = 2 ** 500;
export const STAR_BODY_SLOT = Body.Pluto;

let activeStar: CatalogStar | undefined;

/**
 * A synchronous scope inside this isolated bundle. Reentry is refused rather
 * than letting a nested search replace the current direction. All exit paths
 * clear the binding, including validation and solver errors.
 */
export function withStarVector<T>(star: CatalogStar, run: () => T): T {
  if (activeStar !== undefined) throw new RangeError("A star-vector scope cannot be reentered.");
  // Validate before binding, and snapshot the scalar astrometry used at every
  // TT sample. Do not freeze or otherwise modify a caller's star record.
  propagateStarDirection(star, 0);
  const snapshot = Object.freeze({
    ...star,
    properMotion: star.properMotion === null ? null : Object.freeze({ ...star.properMotion })
  });
  activeStar = snapshot;
  try {
    const result = run();
    if (result !== null && (typeof result === "object" || typeof result === "function") &&
        typeof (result as { then?: unknown }).then === "function") {
      throw new TypeError("A star-vector scope must finish synchronously.");
    }
    return result;
  } finally {
    activeStar = undefined;
  }
}

/** Only riseset.ts resolves this function in place of its native import. */
export function GeoVector(body: Body, date: FlexibleDateTime, aberration: boolean): Vector {
  if (activeStar === undefined || body !== STAR_BODY_SLOT) {
    return nativeGeoVector(body, date, aberration);
  }
  if (aberration !== true) throw new RangeError("The star adapter requires the verified sky vector call shape.");
  const time = MakeTime(date);
  const direction = propagateStarDirection(activeStar, time.tt);
  // The original solver subtracts its WGS84 observer in au. A large finite
  // ray makes that displacement negligible without supplying a fictitious
  // measured distance. Math.hypot and every solver coordinate remain finite.
  return new Vector(
    direction[0] * STAR_RAY_SCALE_AU,
    direction[1] * STAR_RAY_SCALE_AU,
    direction[2] * STAR_RAY_SCALE_AU,
    time
  );
}
