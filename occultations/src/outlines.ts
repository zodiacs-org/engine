import { Body } from "astronomy-engine";
import { CALC_SPAN } from "../../src/calc.js";
import { apply, frameMatrix } from "../../src/calc-frames.js";
import type { Vec3 } from "../../src/calc-frames.js";
import { geometricState } from "../../src/calc-reduce.js";
import { gastHours, onChartClock } from "../../src/ephemeris.js";
import { timeBasis } from "../../src/time-scale.js";
import type { TimeBasis } from "../../src/time-scale.js";
import { ENGINE_VERSION, EPHEMERIS } from "../../src/types.js";
import { separationDegrees } from "./appulse-geometry.js";
import { scale } from "./astrometry.js";
import { starCatalogue } from "./catalogue.js";
import type { CatalogueReceipt, CatalogueStar } from "./catalogue.js";
import { contactGeometry } from "./contact-geometry.js";
import { positionAt } from "./engine.js";
import type { PositionReceipt } from "./engine.js";
import { fields, normalizeWindow } from "./input.js";
import type { NormalizedWindow, TimeWindow } from "./input.js";
import { OCCULTATION_PLANETS, OCCULTATION_RADII } from "./occultation-radii.js";
import type { OccultationPlanet } from "./occultation-radii.js";
import type { OccultationTarget } from "./occultations.js";
import { makeShadow, meridianShadowIntervals, SHADOW_GEOMETRY_MODEL } from "./shadow-geometry.js";
import type { ShadowBoundary, ShadowGeometry } from "./shadow-geometry.js";
import { equatorialDirection, horizontalFacts } from "./sky-geometry.js";
import { starPositionAt } from "./star-position.js";
import type { StarPositionReceipt } from "./star-position.js";
import { timeSeamsIn } from "./time-seams.js";

type Coverage = "overlap" | "full";
type SampleReceipt = PositionReceipt | StarPositionReceipt;
export const OUTLINE_LIMITS = Object.freeze({
  defaultStepSeconds: 60, maximumStepSeconds: 300,
  defaultLongitudeStepDegrees: 5, maximumLongitudes: 144,
  defaultMaxSamples: 30_000, maximumMaxSamples: 200_000,
  defaultMaxIntersections: 500_000, maximumMaxIntersections: 2_000_000,
  localLatitudeGuardDegrees: 0.1, localLatitudeBracketDegrees: 0.00001,
  extremumTimeBracketMilliseconds: 100
});
export interface LunarOutlineRequest {
  readonly target: OccultationTarget;
  readonly window: TimeWindow;
  /** Exact east-positive meridians, not locations to be interpolated. */
  readonly longitudes?: readonly number[];
  readonly stepSeconds?: number;
  readonly maxSamples?: number;
  readonly maxIntersections?: number;
}
export interface OutlineSearchReceipt {
  readonly schema: "zodiacs.occultations.outline-search-receipt.v1";
  readonly implementation: "fundamental-plane-outline/1";
  readonly request: { readonly target: OccultationTarget; readonly window: NormalizedWindow;
    readonly longitudes: readonly number[]; readonly stepSeconds: number;
    readonly maxSamples: number; readonly maxIntersections: number };
  readonly engine: PositionReceipt["engine"];
  readonly catalogue: CatalogueReceipt | null;
  readonly star: CatalogueStar | null;
  readonly radii: typeof OCCULTATION_RADII;
  readonly spatialSolver: typeof SHADOW_GEOMETRY_MODEL;
  readonly boundaryTimeBasis: { readonly from: TimeBasis | null; readonly to: TimeBasis | null };
  readonly seams: ReturnType<typeof timeSeamsIn>;
  readonly search: { readonly samples: number; readonly planeSamples: number; readonly localSamples: number;
    readonly intersections: number; readonly timeStepMilliseconds: number;
    readonly sampleUnit: "geocentric-position-pair-and-earth-axes-or-topocentric-position-pair";
    readonly completeness: "sampled-time-and-longitude;not-proven";
    readonly windowOwnership: "closed-footprint-intersection;window-edges-are-not-contacts" };
  readonly uncertainty: { readonly physicalLatitudeErrorDegrees: null; readonly betweenMeridians: "uncomputed";
    readonly betweenTimes: "extrema-refined;short-components-can-be-missed";
    readonly localLatitudeBracketDegrees: number; readonly extremumTimeBracketMilliseconds: number };
  readonly conventions: readonly string[];
  readonly limitations: readonly string[];
}
export interface OutlineLocalCheck {
  readonly at: string;
  readonly latitudeDegrees: number;
  readonly clearanceDegrees: number;
  readonly targetGeometricAltitudeDegrees: number;
  readonly timeBasis: TimeBasis;
  readonly moon: PositionReceipt;
  readonly target: SampleReceipt;
}
export interface OutlineBoundary {
  readonly latitudeDegrees: number;
  readonly cause: ShadowBoundary["cause"];
  readonly at: string;
  readonly atWindowBoundary: boolean;
  /** Local numerical latitude enclosure at the witness time, not a sky error. */
  readonly latitudeBracket: { readonly south: number; readonly north: number };
  readonly planeLatitudeDegrees: number;
  readonly local: OutlineLocalCheck;
}
export interface OutlineLatitudeInterval {
  readonly south: OutlineBoundary;
  readonly north: OutlineBoundary;
}
export interface OutlineMeridian {
  readonly longitudeDegrees: number;
  /** Circular Voronoi band, with endpoints normalized to [-180,180). */
  readonly band: { readonly west: number; readonly east: number; readonly widthDegrees: number; readonly crossesDateline: boolean;
    readonly evaluatedAt: "exact-meridian-only" };
  readonly status: "resolved" | "unresolved";
  readonly reason: "degenerate-intersection" | "local-check-failed" | "conflicting-boundaries" | null;
  readonly overlap: readonly OutlineLatitudeInterval[];
  readonly full: readonly OutlineLatitudeInterval[];
  readonly receipt: OutlineSearchReceipt;
}
export type OutlineRefusalReason = "sample-budget" | "intersection-budget" | "out-of-range" |
  "time-discontinuity" | "position-refused" | "invalid-geometry";
export type LunarOutlineResult = {
  readonly status: "complete";
  readonly meridians: readonly OutlineMeridian[];
  readonly receipt: OutlineSearchReceipt;
} | {
  readonly status: "refused";
  readonly reason: OutlineRefusalReason;
  readonly meridians: readonly [];
  readonly receipt: OutlineSearchReceipt;
  readonly failure: { readonly at: string | null; readonly position: SampleReceipt | null;
    readonly positionReason: string | null };
};

const DAY = 86_400_000, J2000 = Date.UTC(2000, 0, 1, 12);
const LOWER = Date.parse(CALC_SPAN.from), UPPER = Date.parse(CALC_SPAN.to);
const FRAME = "equatorial-true-of-date", RAD = Math.PI / 180;
const iso = (ms: number) => new Date(ms).toISOString();
const canonicalLongitude = (lon: number) => ((lon + 180) % 360 + 360) % 360 - 180;
function freeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
function basisInside(ms: number): TimeBasis | null {
  if (ms < LOWER - DAY || ms > UPPER + DAY) return null;
  const basis = timeBasis(ms);
  return [basis.ut1Days, basis.ttDays].every((d) =>
    d >= (LOWER - J2000) / DAY && d < (UPPER - J2000) / DAY) ? basis : null;
}
function budget(value: unknown, fallback: number, maximum: number, label: string): number {
  const result = value === undefined ? fallback : value;
  if (typeof result !== "number" || !Number.isSafeInteger(result) || result < 1 || result > maximum) {
    throw new RangeError(`${label} must be a positive integer within OUTLINE_LIMITS.`);
  }
  return result;
}
class Stopped {
  constructor(readonly reason: OutlineRefusalReason, readonly at: string | null = null,
    readonly position: SampleReceipt | null = null, readonly positionReason: string | null = null) {}
}
class Unresolved {
  constructor(readonly reason: NonNullable<OutlineMeridian["reason"]>) {}
}
interface Witness extends ShadowBoundary { readonly ms: number }
interface Slice { south: Witness; north: Witness }
interface PlaneSample { shadow: ShadowGeometry; equator: Vec3; pole: Vec3 }

/** Union of sampled latitude sets, preserving genuine gaps instead of a hull. */
function mergeSlices(values: readonly Slice[]): Slice[] {
  const sorted = [...values].sort((a, b) => a.south.latitudeDegrees - b.south.latitudeDegrees);
  const merged: Slice[] = [];
  for (const value of sorted) {
    const last = merged.at(-1);
    if (!last || value.south.latitudeDegrees > last.north.latitudeDegrees) merged.push({ ...value });
    else if (value.north.latitudeDegrees > last.north.latitudeDegrees) last.north = value.north;
  }
  return merged;
}

/** Coarse sea-level, vacuum, target-center-above-horizon footprint. No darkness filter. */
export function lunarVisibilityOutline(request: LunarOutlineRequest): LunarOutlineResult {
  const input = fields(request, "lunar outline request",
    ["target", "window", "longitudes", "stepSeconds", "maxSamples", "maxIntersections"]);
  const planet = (OCCULTATION_PLANETS as readonly unknown[]).includes(input.target);
  const catalogue = planet ? null : starCatalogue();
  const star = catalogue?.stars.find((row) => row.id === input.target) ?? null;
  if (!planet && !star) throw new RangeError("target must name an OCCULTATION_PLANETS entry or exact catalogue id.");
  const target = input.target as OccultationTarget;
  const window = normalizeWindow(input.window as TimeWindow);
  const rawLongitudes = input.longitudes === undefined
    ? Array.from({ length: 360 / OUTLINE_LIMITS.defaultLongitudeStepDegrees }, (_, i) => -180 + i * OUTLINE_LIMITS.defaultLongitudeStepDegrees)
    : input.longitudes;
  if (!Array.isArray(rawLongitudes) || rawLongitudes.length < 1 || rawLongitudes.length > OUTLINE_LIMITS.maximumLongitudes) {
    throw new RangeError("longitudes must be a nonempty bounded array.");
  }
  const longitudes = Array.from(rawLongitudes, (lon: unknown) => {
    if (typeof lon !== "number" || !Number.isFinite(lon) || lon < -180 || lon > 180) {
      throw new RangeError("longitudes must contain finite east longitudes in [-180,180].");
    }
    // Preserve exact requested longitudes except the duplicate dateline spelling.
    return lon === 180 ? -180 : Object.is(lon, -0) ? 0 : lon;
  }).sort((a, b) => a - b);
  if (new Set(longitudes).size !== longitudes.length) throw new RangeError("longitudes must name distinct meridians.");
  const stepSeconds = input.stepSeconds === undefined ? OUTLINE_LIMITS.defaultStepSeconds : input.stepSeconds;
  if (typeof stepSeconds !== "number" || !Number.isFinite(stepSeconds) || stepSeconds < 0.001 ||
    stepSeconds > OUTLINE_LIMITS.maximumStepSeconds) throw new RangeError("stepSeconds must span a millisecond to five minutes.");
  const maxSamples = budget(input.maxSamples, OUTLINE_LIMITS.defaultMaxSamples, OUTLINE_LIMITS.maximumMaxSamples, "maxSamples");
  const maxIntersections = budget(input.maxIntersections, OUTLINE_LIMITS.defaultMaxIntersections,
    OUTLINE_LIMITS.maximumMaxIntersections, "maxIntersections");
  const from = Date.parse(window.from), to = Date.parse(window.to), step = Math.floor(stepSeconds * 1000);
  const boundaryTimeBasis = { from: basisInside(from), to: basisInside(to) };
  const seams = boundaryTimeBasis.from && boundaryTimeBasis.to ? timeSeamsIn(from, to) : [];
  let planeSamples = 0, localSamples = 0, intersections = 0;
  const receipt = (): OutlineSearchReceipt => freeze({
    schema: "zodiacs.occultations.outline-search-receipt.v1", implementation: "fundamental-plane-outline/1",
    request: { target, window, longitudes, stepSeconds, maxSamples, maxIntersections },
    engine: { name: "@zodiacs/engine", version: ENGINE_VERSION, ephemeris: { ...EPHEMERIS } },
    catalogue: catalogue?.receipt ?? null, star, radii: OCCULTATION_RADII,
    spatialSolver: SHADOW_GEOMETRY_MODEL, boundaryTimeBasis, seams,
    search: { samples: planeSamples + localSamples, planeSamples, localSamples, intersections,
      timeStepMilliseconds: step, sampleUnit: "geocentric-position-pair-and-earth-axes-or-topocentric-position-pair",
      completeness: "sampled-time-and-longitude;not-proven", windowOwnership: "closed-footprint-intersection;window-edges-are-not-contacts" },
    uncertainty: { physicalLatitudeErrorDegrees: null, betweenMeridians: "uncomputed",
      betweenTimes: "extrema-refined;short-components-can-be-missed",
      localLatitudeBracketDegrees: OUTLINE_LIMITS.localLatitudeBracketDegrees,
      extremumTimeBracketMilliseconds: OUTLINE_LIMITS.extremumTimeBracketMilliseconds },
    conventions: ["frame:equatorial-true-of-date;clock:engine-utc-basis",
      "plane:perpendicular-to-moon-target-axis;east-and-north-transverse-axes",
      "shadow:star-cylinder;planet-external-and-internal-common-tangent-cones",
      "observer:engine-calc-iers-2003-ellipsoid;zero-ellipsoidal-height;no-polar-motion",
      "horizon:target-center-strictly-above-geometric-ellipsoid-normal-plane",
      "limb:spherical;planets:equatorial-radius-spheres;no-rings",
      "plane:geocentric-apparent-directions-and-light-path-ranges;no-extra-corrections",
      "reported-boundaries:locally-refined-with-existing-topocentric-apparent-adapters",
      "bands:exact-meridians;no-longitude-interpolation;disconnected-latitude-intervals-retained",
      "daylight:no-filter;refraction:none;terrain:none"],
    limitations: ["sampled-footprint-not-complete;short-time-components-and-between-meridian-topology-unresolved",
      "numerical-brackets-not-physical-error-bounds;no-general-latitude-or-graze-accuracy",
      "geocentric-shadow-and-topocentric-apparent-models-differ;guarded-local-boundary-checks-required",
      "time-extrema-assume-smooth-single-branch-motion-in-neighboring-grid-cells",
      "zero-height-spherical-limb-no-relief-atmosphere-oblateness-or-rings",
      ...(star ? ["catalogue-distance-and-component-motion-uncertainties-unbounded"] : [])]
  });
  const refused = (error: Stopped): LunarOutlineResult => freeze({ status: "refused", reason: error.reason,
    meridians: [] as const, receipt: receipt(),
    failure: { at: error.at, position: error.position, positionReason: error.positionReason } });
  if (!boundaryTimeBasis.from || !boundaryTimeBasis.to) return refused(new Stopped("out-of-range"));
  if (seams.length) return refused(new Stopped("time-discontinuity", seams[0]!.at));
  const count = Math.ceil((to - from) / step) + 1;
  if (count > maxSamples) return refused(new Stopped("sample-budget"));
  if (count * longitudes.length * (planet ? 2 : 1) > maxIntersections) return refused(new Stopped("intersection-budget"));
  const takeSample = (ms: number, local: boolean) => {
    if (!Number.isInteger(ms) || ms < from || ms > to) throw new Error("Outline sample escaped its window.");
    if (planeSamples + localSamples >= maxSamples) throw new Stopped("sample-budget", iso(ms));
    if (local) localSamples += 1; else planeSamples += 1;
  };
  const pair = (ms: number, observer?: { latitude: number; longitude: number; elevationMeters: number }) => {
    const at = iso(ms);
    const moon = positionAt({ body: "Moon", time: at, ...(observer ? { observer } : {}), frame: FRAME });
    if (moon.status !== "ok") throw new Stopped("position-refused", at, moon.receipt, moon.reason);
    const other = planet ? positionAt({ body: target as OccultationPlanet, time: at, ...(observer ? { observer } : {}), frame: FRAME })
      : starPositionAt({ star: target, time: at, ...(observer ? { observer } : {}), frame: FRAME });
    if (other.status !== "ok") throw new Stopped("position-refused", at, other.receipt, other.reason);
    if (moon.dist === null || !(moon.dist > 0) || ("dist" in other && (other.dist === null || !(other.dist > 0)))) {
      throw new Stopped("invalid-geometry", at);
    }
    return { moon, other, moonKm: moon.dist * OCCULTATION_RADII.auKm,
      targetKm: "dist" in other && other.dist !== null ? other.dist * OCCULTATION_RADII.auKm : null };
  };
  const targetRadius = planet ? OCCULTATION_RADII.planetKm[target as OccultationPlanet] : 0;
  const planes = new Map<number, PlaneSample>();
  const planeAt = (ms: number): PlaneSample => {
    const cached = planes.get(ms);
    if (cached) return cached;
    takeSample(ms, false);
    const p = pair(ms);
    // Strong ordering prevents swapping the occulting and background spheres.
    if (p.targetKm !== null && p.targetKm - targetRadius - OCCULTATION_RADII.earthEquatorialKm <=
      p.moonKm + OCCULTATION_RADII.moonKm + OCCULTATION_RADII.earthEquatorialKm) throw new Stopped("invalid-geometry", iso(ms));
    try {
      const shadow = makeShadow(scale(equatorialDirection(p.moon), p.moonKm),
        { direction: equatorialDirection(p.other), distanceKm: p.targetKm, radiusKm: targetRadius }, OCCULTATION_RADII.moonKm);
      const axes = onChartClock(ms, "utc", undefined, (at) => {
        const matrix = frameMatrix(FRAME, at);
        const site = (latitude: number) => scale(apply(matrix, geometricState(Body.Earth,
          { kind: "topocentric", site: { latitude, longitude: 0, height: 0 } }, at)!.r), -OCCULTATION_RADII.auKm);
        return { equator: site(0), pole: site(90) };
      });
      const result = { shadow, ...axes };
      planes.set(ms, result);
      return result;
    } catch (error) {
      if (error instanceof RangeError) throw new Stopped("invalid-geometry", iso(ms));
      throw error;
    }
  };
  const atMeridian = (ms: number, longitude: number, coverage: Coverage): Slice[] => {
    if (intersections >= maxIntersections) throw new Stopped("intersection-budget", iso(ms));
    intersections += 1;
    const sample = planeAt(ms), c = Math.cos(longitude * RAD), s = Math.sin(longitude * RAD);
    const [x, y, z] = sample.equator;
    let result: ReturnType<typeof meridianShadowIntervals>;
    try {
      result = meridianShadowIntervals(sample.shadow, [c * x - s * y, s * x + c * y, z], sample.pole, coverage);
    } catch (error) {
      if (error instanceof RangeError) throw new Stopped("invalid-geometry", iso(ms));
      throw error;
    }
    if (result.unresolved) throw new Unresolved("degenerate-intersection");
    return result.intervals.map((row) => ({ south: { ...row.south, ms }, north: { ...row.north, ms } }));
  };
  const localAt = (ms: number, latitude: number, longitude: number, coverage: Coverage): OutlineLocalCheck => {
    takeSample(ms, true);
    const p = pair(ms, { latitude, longitude, elevationMeters: 0 });
    try {
      const geometry = contactGeometry({ separationDegrees: separationDegrees({ a: p.moon, b: p.other }),
        moonDistanceKm: p.moonKm, targetDistanceKm: p.targetKm, targetRadiusKm: targetRadius });
      const sidereal = onChartClock(ms, "utc", undefined, (at) => gastHours(at) * 15 + longitude);
      return { at: iso(ms), latitudeDegrees: latitude,
        clearanceDegrees: coverage === "overlap" ? geometry.externalClearanceDegrees : geometry.internalClearanceDegrees,
        targetGeometricAltitudeDegrees: horizontalFacts(equatorialDirection(p.other), latitude, sidereal, geometry.targetSemidiameterDegrees).geometricAltitudeDegrees,
        timeBasis: timeBasis(ms), moon: p.moon.receipt, target: p.other.receipt };
    } catch (error) {
      if (error instanceof RangeError) throw new Stopped("invalid-geometry", iso(ms));
      throw error;
    }
  };
  // Refine a sampled latitude extremum within neighboring time cells. Each
  // candidate is an exact engine sample. No polynomial ephemeris is fitted.
  const refineTime = (seed: Witness, component: Slice, longitude: number, coverage: Coverage, side: "south" | "north"): Witness => {
    if (seed.cause === "pole") return seed;
    let best = seed;
    const score = (w: Witness) => (side === "south" ? -1 : 1) * w.latitudeDegrees;
    const evaluate = (ms: number): number => {
      // Only extend through a whole slice intersecting this sampled component.
      // A nearby-in-time but disconnected latitude strip must not become the
      // opposite edge of this component, inventing coverage across the gap.
      const boundaries = atMeridian(ms, longitude, coverage)
        .filter((i) => i.south.latitudeDegrees <= component.north.latitudeDegrees &&
          i.north.latitudeDegrees >= component.south.latitudeDegrees)
        .map((i) => i[side]).filter((boundary) => boundary.cause === seed.cause);
      boundaries.sort((a, b) => score(b) - score(a));
      const found = boundaries[0];
      if (!found || found.cause !== seed.cause) return -Infinity;
      if (score(found) > score(best)) best = found;
      return score(found);
    };
    let lo = Math.max(from, seed.ms - step), hi = Math.min(to, seed.ms + step);
    evaluate(lo); evaluate(hi);
    const fraction = (Math.sqrt(5) - 1) / 2;
    let left = Math.round(hi - fraction * (hi - lo)), right = Math.round(lo + fraction * (hi - lo));
    let fl = evaluate(left), fr = evaluate(right);
    while (hi - lo > OUTLINE_LIMITS.extremumTimeBracketMilliseconds) {
      if (fl > fr) { hi = right; right = left; fr = fl; left = Math.round(hi - fraction * (hi - lo)); fl = evaluate(left); }
      else { lo = left; left = right; fl = fr; right = Math.round(lo + fraction * (hi - lo)); fr = evaluate(right); }
    }
    return best;
  };
  const checkBoundary = (seed: Witness, component: Slice, longitude: number, coverage: Coverage, side: "south" | "north"): OutlineBoundary => {
    const witness = refineTime(seed, component, longitude, coverage, side), latitude = witness.latitudeDegrees;
    let lo = Math.max(-90, latitude - OUTLINE_LIMITS.localLatitudeGuardDegrees);
    let hi = Math.min(90, latitude + OUTLINE_LIMITS.localLatitudeGuardDegrees);
    let local: OutlineLocalCheck;
    if (witness.cause === "pole") {
      local = localAt(witness.ms, latitude, longitude, coverage);
      if (local.clearanceDegrees > 0 || local.targetGeometricAltitudeDegrees < 0) throw new Unresolved("local-check-failed");
      lo = hi = latitude;
    } else {
      const clearance = (v: OutlineLocalCheck) => witness.cause === "horizon" ? -v.targetGeometricAltitudeDegrees : v.clearanceDegrees;
      let low = localAt(witness.ms, lo, longitude, coverage), high = localAt(witness.ms, hi, longitude, coverage);
      const validSides = () => side === "south" ? clearance(low) > 0 && clearance(high) < 0 : clearance(low) < 0 && clearance(high) > 0;
      if (!validSides()) throw new Unresolved("local-check-failed");
      while (hi - lo > OUTLINE_LIMITS.localLatitudeBracketDegrees) {
        const mid = (lo + hi) / 2, value = localAt(witness.ms, mid, longitude, coverage);
        if ((clearance(value) > 0) === (clearance(low) > 0)) { lo = mid; low = value; }
        else { hi = mid; high = value; }
      }
      local = localAt(witness.ms, (lo + hi) / 2, longitude, coverage);
      // The other constraint must hold at the same actual topocentric sample.
      if (witness.cause === "horizon" ? local.clearanceDegrees > 0 : local.targetGeometricAltitudeDegrees < 0) {
        throw new Unresolved("local-check-failed");
      }
    }
    return { latitudeDegrees: local.latitudeDegrees, cause: witness.cause, at: iso(witness.ms),
      atWindowBoundary: witness.ms === from || witness.ms === to, latitudeBracket: { south: lo, north: hi },
      planeLatitudeDegrees: latitude, local };
  };
  try {
    const working = longitudes.map((longitude) => ({ longitude, overlap: [] as Slice[], full: [] as Slice[],
      reason: null as OutlineMeridian["reason"] }));
    for (let i = 0; i < count; i += 1) {
      const ms = Math.min(to, from + i * step);
      planeAt(ms); // Refusals cannot disappear when every meridian is unresolved.
      for (const band of working) {
        if (band.reason) continue;
        try {
          band.overlap = mergeSlices([...band.overlap, ...atMeridian(ms, band.longitude, "overlap")]);
          if (planet) band.full = mergeSlices([...band.full, ...atMeridian(ms, band.longitude, "full")]);
        } catch (error) {
          if (!(error instanceof Unresolved)) throw error;
          band.reason = error.reason;
          band.overlap = []; band.full = [];
        }
      }
    }
    const results = working.map((work, index) => {
      let overlap: OutlineLatitudeInterval[] = [], full: OutlineLatitudeInterval[] = [], reason = work.reason;
      try {
        if (!reason) {
          const check = (slices: readonly Slice[], coverage: Coverage) => slices.map((slice) => ({
            south: checkBoundary(slice.south, slice, work.longitude, coverage, "south"),
            north: checkBoundary(slice.north, slice, work.longitude, coverage, "north") }));
          overlap = check(work.overlap, "overlap"); full = planet ? check(work.full, "full") : overlap;
          if ([overlap, full].some((rows) => rows.some((row, i) => row.south.latitudeDegrees >= row.north.latitudeDegrees ||
            (i > 0 && row.south.latitudeDegrees <= rows[i - 1]!.north.latitudeDegrees))) ||
            full.some((inside) => !overlap.some((outside) => inside.south.latitudeDegrees >= outside.south.latitudeDegrees &&
              inside.north.latitudeDegrees <= outside.north.latitudeDegrees))) throw new Unresolved("conflicting-boundaries");
        }
      } catch (error) {
        if (!(error instanceof Unresolved)) throw error;
        reason = error.reason; overlap = []; full = [];
      }
      const previous = index === 0 ? longitudes.at(-1)! - 360 : longitudes[index - 1]!;
      const next = index === longitudes.length - 1 ? longitudes[0]! + 360 : longitudes[index + 1]!;
      const west = canonicalLongitude((previous + work.longitude) / 2), east = canonicalLongitude((next + work.longitude) / 2);
      return { longitudeDegrees: work.longitude, band: { west, east, widthDegrees: (next - previous) / 2,
        crossesDateline: west >= east, evaluatedAt: "exact-meridian-only" as const },
        status: reason ? "unresolved" as const : "resolved" as const, reason, overlap, full };
    });
    const searchReceipt = receipt();
    return freeze({ status: "complete", meridians: results.map((band) => ({ ...band, receipt: searchReceipt })), receipt: searchReceipt });
  } catch (error) {
    if (error instanceof Stopped) return refused(error);
    throw error;
  }
}
