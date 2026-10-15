import { CALC_SPAN } from "../../src/calc.js";
import { timeBasis } from "../../src/time-scale.js";
import type { TimeBasis } from "../../src/time-scale.js";
import { ENGINE_VERSION, EPHEMERIS } from "../../src/types.js";
import { separationDegrees } from "./appulse-geometry.js";
import { starCatalogue } from "./catalogue.js";
import type { CatalogueReceipt, CatalogueStar } from "./catalogue.js";
import { clearanceIntervals } from "./clearance-intervals.js";
import { positionAt } from "./engine.js";
import type { PositionReceipt } from "./engine.js";
import { fields, normalizeWindow } from "./input.js";
import type { NormalizedWindow, TimeWindow } from "./input.js";
import { occultationGeometry } from "./occultation-geometry.js";
import { OCCULTATION_PLANETS, OCCULTATION_RADII } from "./occultation-radii.js";
import type { OccultationPlanet } from "./occultation-radii.js";
import { groupCandidatePassages } from "./occultation-series.js";
import { starPositionAt } from "./star-position.js";
import type { StarPositionReceipt } from "./star-position.js";
import { timeSeamsIn } from "./time-seams.js";

export type OccultationTarget = OccultationPlanet | `sao:${number}`;
export interface LunarOccultationRequest {
  readonly target: OccultationTarget;
  readonly window: TimeWindow;
  readonly stepDays?: number;
  /** Paired position evaluations, including both boundary searches and output. */
  readonly maxSamples?: number;
}
export const OCCULTATION_LIMITS = Object.freeze({
  defaultStepDays: 0.125, maximumStepDays: 0.125,
  defaultMaxSamples: 20_000, maximumMaxSamples: 100_000
});
type SampleReceipt = PositionReceipt | StarPositionReceipt;
export interface OccultationSearchReceipt {
  readonly schema: "zodiacs.occultations.lunar-search-receipt.v1";
  readonly implementation: "lunar-candidates/1";
  readonly request: { readonly target: OccultationTarget; readonly window: NormalizedWindow;
    readonly stepDays: number; readonly maxSamples: number };
  readonly engine: PositionReceipt["engine"];
  readonly catalogue: CatalogueReceipt | null;
  readonly star: CatalogueStar | null;
  readonly radii: typeof OCCULTATION_RADII;
  readonly boundaryTimeBasis: { readonly from: TimeBasis | null; readonly to: TimeBasis | null };
  readonly seams: ReturnType<typeof timeSeamsIn>;
  readonly search: {
    readonly solver: "@zodiacs/engine/crossings:searchLongitudeCrossingsWith";
    readonly windowOwnership: "interval-intersection;(from,to]";
    readonly stepMilliseconds: number;
    readonly samples: number;
    readonly maxSamples: number;
    readonly sampleUnit: "paired-position-evaluation;includes-all-refinement-and-output;no-cache";
    readonly completeness: "sampled;not-proven";
  };
  readonly conventions: readonly string[];
  readonly limitations: readonly string[];
}
export interface CandidateInterval {
  readonly from: string;
  readonly to: string;
  readonly start: "window" | "envelope-entry";
  readonly end: "window" | "envelope-exit";
}
export interface GeocentricOverlapInterval {
  readonly from: string;
  readonly to: string;
  readonly start: "window" | "disk-entry";
  readonly end: "window" | "disk-exit";
}
export interface LunarOccultationCandidate {
  readonly kind: "lunar-occultation-candidate";
  readonly target: OccultationTarget;
  readonly interval: CandidateInterval;
  /** Window-local lunar revolution index, not a global occultation series id. */
  readonly passageIndex: number;
  readonly seriesIndex: number;
  readonly geocentricOverlap: boolean;
  readonly geocentricOverlapIntervals: readonly GeocentricOverlapInterval[];
  /** Interval midpoint witness, not closest approach or a local contact. */
  readonly sample: ReturnType<typeof occultationGeometry> & { readonly at: string; readonly separationDegrees: number };
  readonly receipt: {
    readonly schema: "zodiacs.occultations.lunar-candidate-receipt.v1";
    readonly search: OccultationSearchReceipt;
    readonly timeBasis: TimeBasis;
    readonly moon: PositionReceipt;
    readonly target: SampleReceipt;
    readonly validation: "development-event-retention-only;contacts-and-global-completeness-unvalidated";
  };
}
export interface LunarOccultationSeries {
  readonly kind: "window-local-candidate-series";
  readonly target: OccultationTarget;
  readonly seriesIndex: number;
  readonly candidateIndices: readonly number[];
  readonly passageIndices: readonly number[];
  readonly receipt: {
    readonly search: OccultationSearchReceipt;
    readonly membership: "consecutive-sampled-relative-ra-revolutions;rejected-passage-breaks-series";
    readonly continuation: "outside-window-unknown";
  };
}
export type OccultationRefusalReason = "sample-budget" | "time-discontinuity" | "out-of-range" |
  "position-refused" | "invalid-geometry" | "unresolved-boundary" | "unresolved-passage";
export type LunarOccultationResult = {
  readonly status: "complete";
  readonly candidates: readonly LunarOccultationCandidate[];
  readonly series: readonly LunarOccultationSeries[];
  readonly receipt: OccultationSearchReceipt;
} | {
  readonly status: "refused";
  readonly reason: OccultationRefusalReason;
  readonly candidates: readonly [];
  readonly series: readonly [];
  readonly receipt: OccultationSearchReceipt;
  readonly failure: { readonly at: string | null; readonly position: SampleReceipt | null;
    readonly positionReason: string | null };
};

const DAY = 86_400_000, J2000 = Date.UTC(2000, 0, 1, 12);
const LOWER = Date.parse(CALC_SPAN.from), UPPER = Date.parse(CALC_SPAN.to);
const FRAME = "equatorial-true-of-date";
const iso = (ms: number) => new Date(ms).toISOString();
const signed = (angle: number) => { const r = angle % 360; return r > 180 ? r - 360 : r <= -180 ? r + 360 : r; };
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
class Stopped {
  constructor(readonly reason: OccultationRefusalReason, readonly at: string | null = null,
    readonly position: SampleReceipt | null = null, readonly positionReason: string | null = null) {}
}

/** Necessary geometric screening for one target. No confirmed observing site or contact. */
export function searchLunarOccultations(request: LunarOccultationRequest): LunarOccultationResult {
  const input = fields(request, "lunar occultation request", ["target", "window", "stepDays", "maxSamples"]);
  const planet = (OCCULTATION_PLANETS as readonly unknown[]).includes(input.target);
  const catalogue = planet ? null : starCatalogue();
  const star = catalogue?.stars.find((row) => row.id === input.target) ?? null;
  if (!planet && !star) throw new RangeError("target must name an OCCULTATION_PLANETS entry or exact catalogue id.");
  const target = input.target as OccultationTarget;
  const window = normalizeWindow(input.window as TimeWindow);
  const stepDays = input.stepDays === undefined ? OCCULTATION_LIMITS.defaultStepDays : input.stepDays;
  if (typeof stepDays !== "number" || !Number.isFinite(stepDays) || stepDays * DAY < 1 ||
    stepDays > OCCULTATION_LIMITS.maximumStepDays) throw new RangeError("stepDays must span a millisecond to one eighth day.");
  const maxSamples = input.maxSamples === undefined ? OCCULTATION_LIMITS.defaultMaxSamples : input.maxSamples;
  if (typeof maxSamples !== "number" || !Number.isSafeInteger(maxSamples) || maxSamples < 1 ||
    maxSamples > OCCULTATION_LIMITS.maximumMaxSamples) throw new RangeError("maxSamples must be an integer from 1 to 100000.");
  const from = Date.parse(window.from), to = Date.parse(window.to), step = Math.floor(stepDays * DAY);
  const boundaryTimeBasis = { from: basisInside(from), to: basisInside(to) };
  const seams = boundaryTimeBasis.from && boundaryTimeBasis.to ? timeSeamsIn(from, to) : [];
  let samples = 0;
  const receipt = (): OccultationSearchReceipt => freeze({
    schema: "zodiacs.occultations.lunar-search-receipt.v1", implementation: "lunar-candidates/1",
    request: { target, window, stepDays, maxSamples },
    engine: { name: "@zodiacs/engine", version: ENGINE_VERSION, ephemeris: { ...EPHEMERIS } },
    catalogue: catalogue?.receipt ?? null, star, radii: OCCULTATION_RADII, boundaryTimeBasis, seams,
    search: { solver: "@zodiacs/engine/crossings:searchLongitudeCrossingsWith",
      windowOwnership: "interval-intersection;(from,to]", stepMilliseconds: step, samples, maxSamples,
      sampleUnit: "paired-position-evaluation;includes-all-refinement-and-output;no-cache", completeness: "sampled;not-proven" },
    conventions: ["center:geocentric", `frame:${FRAME}`, "time:engine-utc-basis", "angles:degrees;distances:km",
      "moon:sphere-from-engine-sky-radius", "planets:nominal-equatorial-radius-spheres;no-rings",
      "observer:enclosing-calc-ellipsoid-plus-maximum-supported-height",
      "envelope:sum-of-parallaxes-plus-closest-range-semidiameters",
      "boundaries:millisecond-enclosures;window-clipping-explicit",
      "series:window-local-relative-ra-winding;no-date-gap-heuristic",
      "corrections:existing-adapters;no-additional-light-time-or-aberration",
      ...(star ? ["star:infinite-distance-point-source-model;distance-unknown"] : [])],
    limitations: ["candidate-is-necessary-screening-only;observer-occurrence-not-established",
      "conservative-for-translated-spherical-vectors-only;correction-model-errors-unbounded",
      "geocentric-overlap-is-spherical-model-overlap;not-a-confirmed-local-occultation",
      "no-horizon-daylight-terrain-atmosphere-or-ring-model",
      "smooth-clearance-with-at-most-one-station-in-two-steps-assumed;sampling-not-completeness-proof",
      "subsecond-separated-roots-may-be-collapsed;detected-tangencies-and-ambiguity-refused",
      "series-identities-and-continuation-outside-window-unknown", "no-contact-timing-accuracy-claim",
      ...(star ? ["catalogue-distance-component-motion-and-completeness-unvalidated"] : [])]
  });
  const refused = (error: Stopped): LunarOccultationResult => freeze({ status: "refused", reason: error.reason,
    candidates: [] as const, series: [] as const, receipt: receipt(),
    failure: { at: error.at, position: error.position, positionReason: error.positionReason } });
  if (!boundaryTimeBasis.from || !boundaryTimeBasis.to) return refused(new Stopped("out-of-range"));
  if (seams.length) return refused(new Stopped("time-discontinuity", seams[0]!.at));
  if (3 * (Math.ceil((to - from) / step) + 1) > maxSamples) return refused(new Stopped("sample-budget"));
  const sample = (ms: number) => {
    const at = iso(ms);
    if (samples >= maxSamples) throw new Stopped("sample-budget", at);
    samples += 1;
    const moon = positionAt({ body: "Moon", time: at, frame: FRAME });
    if (moon.status !== "ok") throw new Stopped("position-refused", at, moon.receipt, moon.reason);
    const other = planet ? positionAt({ body: target as OccultationPlanet, time: at, frame: FRAME }) :
      starPositionAt({ star: target, time: at, frame: FRAME });
    if (other.status !== "ok") throw new Stopped("position-refused", at, other.receipt, other.reason);
    if (![moon.lon, moon.lat, other.lon, other.lat].every(Number.isFinite) ||
      Math.abs(moon.lat) >= 90 || Math.abs(other.lat) >= 90) throw new Stopped("invalid-geometry", at);
    if (moon.dist === null || ("dist" in other && other.dist === null)) throw new Stopped("invalid-geometry", at);
    const separation = separationDegrees({ a: moon, b: other });
    try {
      const geometry = occultationGeometry({ separationDegrees: separation,
        moonDistanceKm: moon.dist * OCCULTATION_RADII.auKm,
        targetDistanceKm: "dist" in other && other.dist !== null ? other.dist * OCCULTATION_RADII.auKm : null,
        targetRadiusKm: planet ? OCCULTATION_RADII.planetKm[target as OccultationPlanet] : 0,
        observerRadiusKm: OCCULTATION_RADII.observerEnvelopeKm });
      return { moon, other, geometry, separation, phase: signed(moon.lon - other.lon) };
    } catch (error) {
      if (error instanceof RangeError) throw new Stopped("invalid-geometry", at);
      throw error;
    }
  };
  try {
    // Unwrap every coarse relative-RA sample, so a rejected revolution breaks
    // series membership without an arbitrary threshold in elapsed days.
    const anchors: Array<{ ms: number; phase: number; unwrapped: number }> = [];
    for (let ms = from; ; ms = Math.min(to, ms + step)) {
      const value = sample(ms), previous = anchors.at(-1);
      const advance = previous ? signed(value.phase - previous.phase) : 0;
      if (advance < 0 || advance >= 90) throw new Stopped("unresolved-passage", iso(ms));
      anchors.push({ ms, phase: value.phase, unwrapped: previous ? previous.unwrapped + advance : value.phase });
      if (ms === to) break;
    }
    const passageAt = (ms: number, phase: number) => {
      const anchor = anchors[Math.min(anchors.length - 1, Math.floor((ms - from) / step))]!;
      const advance = signed(phase - anchor.phase);
      if (advance < 0 || advance >= 90) throw new Stopped("unresolved-passage", iso(ms));
      return Math.floor((anchor.unwrapped + advance + 180) / 360);
    };
    const scan = (kind: "envelopeClearanceDegrees" | "geocentricClearanceDegrees") => {
      const result = clearanceIntervals((ms) => sample(ms).geometry[kind], from, to, step, maxSamples);
      if (result.status !== "complete") throw new Stopped(result.reason);
      return result.intervals;
    };
    const envelopes = scan("envelopeClearanceDegrees"), disks = scan("geocentricClearanceDegrees");
    // Every geocentric disk interval must be inside an envelope interval.
    if (disks.some((disk) => !envelopes.some((envelope) => disk.from >= envelope.from && disk.to <= envelope.to))) {
      throw new Stopped("unresolved-boundary");
    }
    const records = envelopes.map((interval) => {
      const ms = Math.floor((interval.from + interval.to) / 2), value = sample(ms);
      if (value.geometry.envelopeClearanceDegrees > 0) throw new Stopped("unresolved-boundary", iso(ms));
      const passage = passageAt(ms, value.phase);
      for (const edge of [interval.from, interval.to]) {
        if (passageAt(edge, sample(edge).phase) !== passage) throw new Stopped("unresolved-passage", iso(edge));
      }
      return { interval, ms, value, passage,
        disks: disks.filter((disk) => disk.from >= interval.from && disk.to <= interval.to) };
    });
    const groups = groupCandidatePassages(records.map((record) => record.passage));
    const searchReceipt = receipt();
    const membership = new Map(groups.flatMap((group, index) => group.map((member) => [member, index] as const)));
    const candidates: LunarOccultationCandidate[] = records.map(({ interval, ms, value, passage, disks }, index) => ({
      kind: "lunar-occultation-candidate", target,
      interval: { from: iso(interval.from), to: iso(interval.to),
        start: interval.start === "window" ? "window" : "envelope-entry",
        end: interval.end === "window" ? "window" : "envelope-exit" },
      passageIndex: passage, seriesIndex: membership.get(index)!, geocentricOverlap: disks.length > 0,
      geocentricOverlapIntervals: disks.map((disk) => ({ from: iso(disk.from), to: iso(disk.to),
        start: disk.start === "window" ? "window" : "disk-entry", end: disk.end === "window" ? "window" : "disk-exit" })),
      sample: { at: iso(ms), separationDegrees: value.separation, ...value.geometry },
      receipt: { schema: "zodiacs.occultations.lunar-candidate-receipt.v1", search: searchReceipt,
        timeBasis: timeBasis(ms), moon: value.moon.receipt, target: value.other.receipt,
        validation: "development-event-retention-only;contacts-and-global-completeness-unvalidated" }
    }));
    const series: LunarOccultationSeries[] = groups.map((group, seriesIndex) => ({
      kind: "window-local-candidate-series", target, seriesIndex, candidateIndices: [...group],
      passageIndices: [...new Set(group.map((index) => records[index]!.passage))],
      receipt: { search: searchReceipt, membership: "consecutive-sampled-relative-ra-revolutions;rejected-passage-breaks-series",
        continuation: "outside-window-unknown" }
    }));
    return freeze({ status: "complete", candidates, series, receipt: searchReceipt });
  } catch (error) {
    if (error instanceof Stopped) return refused(error);
    throw error;
  }
}
