import type { GeographicPoint } from "./chart.js";

export const MAX_POLYLINE_POINTS = 16_384;

/** Inclusive degrees. West to east follows the eastward arc across the seam. */
export interface GeographicBounds {
  readonly south: number;
  readonly north: number;
  readonly west: number;
  readonly east: number;
}

export interface CheckedBounds extends GeographicBounds {
  readonly longitudeSpan: number;
  readonly eastUnwrapped: number;
}

export interface PolylineVertex {
  readonly point: GeographicPoint;
  readonly source:
    | { readonly kind: "sample"; readonly index: number }
    | { readonly kind: "seam"; readonly fromIndex: number; readonly toIndex: number; readonly fraction: number };
}

/** Wrap finite geographic degrees to [-180, 180), retaining in-range precision. */
export function wrapLongitude(longitude: number): number {
  if (typeof longitude !== "number" || !Number.isFinite(longitude)) {
    throw new RangeError("Longitude must be a finite number of degrees.");
  }
  if (longitude >= -180 && longitude < 180) return longitude === 0 ? 0 : longitude;
  let wrapped = longitude % 360;
  if (wrapped >= 180) wrapped -= 360;
  if (wrapped < -180) wrapped += 360;
  return wrapped === 0 ? 0 : wrapped;
}

function degree(value: number, limit: number, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > limit) {
    throw new RangeError(`${name} must be finite and between ${-limit} and ${limit} degrees.`);
  }
  return value === 0 ? 0 : value;
}

/** Validate without silently wrapping a typo in a geographic bound. */
export function geographicBounds(bounds: GeographicBounds): CheckedBounds {
  if (bounds === null || typeof bounds !== "object" || Array.isArray(bounds)) {
    throw new RangeError("Geographic bounds require south, north, west and east.");
  }
  const south = degree(bounds.south, 90, "South latitude");
  const north = degree(bounds.north, 90, "North latitude");
  const west = degree(bounds.west, 180, "West longitude");
  const east = degree(bounds.east, 180, "East longitude");
  if (south > north) throw new RangeError("South latitude must not exceed north latitude.");
  const longitudeSpan = east >= west ? east - west : (180 - west) + (east + 180);
  return { south, north, west, east, longitudeSpan, eastUnwrapped: west + longitudeSpan };
}

/** Both seam spellings denote the same point, including in degenerate bounds. */
export function containsPoint(bounds: GeographicBounds, point: GeographicPoint): boolean {
  const checked = geographicBounds(bounds);
  const sample = geographicPoint(point);
  let offset = sample.longitude >= checked.west ? sample.longitude - checked.west
    : (180 - checked.west) + (sample.longitude + 180);
  if (offset === 360) offset = 0;
  return sample.latitude >= checked.south && sample.latitude <= checked.north
    && offset <= checked.longitudeSpan;
}

function geographicPoint(point: GeographicPoint): GeographicPoint {
  if (point === null || typeof point !== "object" || Array.isArray(point)) {
    throw new RangeError("A geographic point requires latitude and longitude.");
  }
  return {
    latitude: degree(point.latitude, 90, "Latitude"),
    longitude: degree(point.longitude, 180, "Longitude")
  };
}

/**
 * Split a sampled polyline along shortest longitude links. An exactly half-world
 * link follows its submitted sign unless halfTurnDirection selects its arc.
 * Seam latitudes interpolate in lat/lon space,
 * not on a great circle, and have no engine receipt. Sample indices retain the
 * association with caller metadata. Exact seam samples may change seam spelling.
 */
export function splitAntimeridian(points: readonly GeographicPoint[], halfTurnDirection?: "east" | "west"): PolylineVertex[][] {
  if (halfTurnDirection !== undefined && halfTurnDirection !== "east" && halfTurnDirection !== "west") {
    throw new RangeError("Half-turn direction must be east or west.");
  }
  if (!Array.isArray(points) || points.length > MAX_POLYLINE_POINTS) {
    throw new RangeError(`A polyline requires an array of at most ${MAX_POLYLINE_POINTS} points.`);
  }
  // Validate the whole input before constructing partial geometry. Indexed
  // iteration also rejects sparse array entries rather than skipping them.
  const samples: GeographicPoint[] = [];
  for (let index = 0; index < points.length; index++) samples.push(geographicPoint(points[index]!));
  if (samples.length === 0) return [];
  let segment: PolylineVertex[] = [{ point: samples[0]!, source: { kind: "sample", index: 0 } }];
  const segments: PolylineVertex[][] = [];
  for (let index = 1; index < samples.length; index++) {
    const previous = samples[index - 1]!;
    const next = samples[index]!;
    const last = segment[segment.length - 1]!;
    let delta = next.longitude - previous.longitude;
    // Sum distances to the seam instead of subtracting a full turn from a
    // nearly full-turn difference; the latter loses tiny seam distances.
    if (delta > 180) delta = -((previous.longitude + 180) + (180 - next.longitude));
    if (delta < -180) delta = (180 - previous.longitude) + (next.longitude + 180);
    if (Math.abs(delta) === 180 && halfTurnDirection !== undefined) {
      delta = halfTurnDirection === "east" ? 180 : -180;
    }
    const longitude = Math.abs(next.longitude) === 180
      ? (delta > 0 ? 180 : delta < 0 ? -180 : last.point.longitude)
      : next.longitude;
    // Compare the displayed endpoints rather than a rounded unwrapped sum.
    // That sum can round to the seam when the next sample lies just past it.
    if ((delta > 0 && longitude < last.point.longitude) || (delta < 0 && longitude > last.point.longitude)) {
      const seam = delta > 0 ? 180 : -180;
      const fraction = (seam - last.point.longitude) / delta;
      const latitude = previous.latitude + fraction * (next.latitude - previous.latitude);
      const source: PolylineVertex["source"] = fraction === 0 ? last.source : {
        kind: "seam", fromIndex: index - 1, toIndex: index, fraction
      };
      if (fraction !== 0) segment.push({ point: { latitude, longitude: seam }, source });
      // A line departing from the seam must not create an isolated seam stub.
      if (segment.length > 1) segments.push(segment);
      segment = [{ point: { latitude, longitude: -seam }, source }];
      segment.push({ point: { ...next }, source: { kind: "sample", index } });
    } else {
      // Keep submitted samples' precision except where an equivalent seam
      // spelling is needed to keep the current segment continuous.
      segment.push({ point: { latitude: next.latitude, longitude }, source: { kind: "sample", index } });
    }
  }
  segments.push(segment);
  return segments;
}
