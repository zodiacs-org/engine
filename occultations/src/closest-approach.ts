import { CALC_SPAN } from "../../src/calc.js";
import { searchLongitudeCrossingsWith } from "../../src/crossings.js";
import { timeBasis } from "../../src/time-scale.js";
import type { TimeBasis } from "../../src/time-scale.js";
import { ENGINE_VERSION, EPHEMERIS } from "../../src/types.js";
import { chordDifference, separationDegrees } from "./appulse-geometry.js";
import { starCatalogue } from "./catalogue.js";
import type { CatalogueReceipt, CatalogueStar } from "./catalogue.js";
import { positionAt } from "./engine.js";
import type { PositionReceipt } from "./engine.js";
import { fields, normalizeObserver, normalizeWindow } from "./input.js";
import type { NormalizedObserver, NormalizedWindow, Observer, TimeWindow } from "./input.js";
import { OCCULTATION_PLANETS } from "./occultation-radii.js";
import type { OccultationPlanet } from "./occultation-radii.js";
import type { OccultationTarget } from "./occultations.js";
import { starPositionAt } from "./star-position.js";
import type { StarPositionReceipt } from "./star-position.js";
import { timeSeamsIn } from "./time-seams.js";

export interface LocalClosestApproachRequest {
  readonly target: OccultationTarget;
  readonly observer: Observer;
  readonly window: TimeWindow;
  readonly stepDays?: number;
  /** Paired positions, including derivative, verification and output samples. */
  readonly maxSamples?: number;
}
export const LOCAL_CLOSEST_APPROACH_LIMITS = Object.freeze({
  defaultStepDays: 300_000 / 86_400_000, maximumStepDays: 300_000 / 86_400_000,
  defaultMaxSamples: 20_000, maximumMaxSamples: 100_000,
  derivativeHalfWidthMilliseconds: 60_000
});
type SampleReceipt = PositionReceipt | StarPositionReceipt;
export interface LocalClosestApproachSearchReceipt {
  readonly schema: "zodiacs.occultations.local-closest-approach-search-receipt.v1";
  readonly implementation: "local-closest-approaches/1";
  readonly request: { readonly target: OccultationTarget; readonly observer: NormalizedObserver;
    readonly window: NormalizedWindow; readonly stepDays: number; readonly maxSamples: number };
  readonly engine: PositionReceipt["engine"];
  readonly catalogue: CatalogueReceipt | null;
  readonly star: CatalogueStar | null;
  readonly frame: "equatorial-true-of-date";
  readonly boundaryTimeBasis: { readonly from: TimeBasis | null; readonly to: TimeBasis | null };
  readonly seams: ReturnType<typeof timeSeamsIn>;
  readonly search: {
    readonly solver: "@zodiacs/engine/crossings:searchLongitudeCrossingsWith";
    readonly windowOwnership: "(from,to]";
    readonly stepMilliseconds: number;
    readonly stencilHalfWidthMilliseconds: number;
    readonly evaluationWindow: NormalizedWindow | null;
    readonly rateUnit: "squared-unit-chord-per-day";
    readonly rateTransform: "atan(10000*rate)*90/pi";
    readonly samples: number;
    readonly sampleUnit: "paired-position-evaluation;includes-stencil-output-and-verification;no-cache";
    readonly maxSamples: number;
    readonly completeness: "sampled;not-proven";
  };
  readonly conventions: readonly string[];
  readonly limitations: readonly string[];
}
export interface LocalClosestApproach {
  readonly kind: "local-closest-approach";
  readonly target: OccultationTarget;
  /** Numerical centered-difference minimum on the engine UTC input clock. */
  readonly at: string;
  /** Numerical rate-zero enclosure, not an enclosure of the physical minimum. */
  readonly bracket: NormalizedWindow;
  readonly separationDegrees: number;
  readonly receipt: {
    readonly schema: "zodiacs.occultations.local-closest-approach-receipt.v1";
    readonly search: LocalClosestApproachSearchReceipt;
    readonly timeBasis: TimeBasis;
    readonly moon: PositionReceipt;
    readonly target: SampleReceipt;
    readonly validation: "finite-reference-gates;no-general-physical-timing-bound";
  };
}
export type LocalClosestApproachRefusalReason = "sample-budget" | "time-discontinuity" | "out-of-range" |
  "position-refused" | "invalid-direction" | "unresolved-minimum";
export type LocalClosestApproachResult = {
  readonly status: "complete";
  readonly events: readonly LocalClosestApproach[];
  readonly receipt: LocalClosestApproachSearchReceipt;
} | {
  readonly status: "refused";
  readonly reason: LocalClosestApproachRefusalReason;
  readonly events: readonly [];
  readonly receipt: LocalClosestApproachSearchReceipt;
  readonly failure: { readonly at: string | null; readonly position: SampleReceipt | null;
    readonly positionReason: string | null };
};

const DAY = 86_400_000, J2000 = Date.UTC(2000, 0, 1, 12);
const LOWER = Date.parse(CALC_SPAN.from), UPPER = Date.parse(CALC_SPAN.to);
const H = LOCAL_CLOSEST_APPROACH_LIMITS.derivativeHalfWidthMilliseconds;
const FRAME = "equatorial-true-of-date";
const iso = (ms: number) => new Date(ms).toISOString();
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
  return [basis.ut1Days, basis.ttDays].every((days) =>
    days >= (LOWER - J2000) / DAY && days < (UPPER - J2000) / DAY) ? basis : null;
}
class Stopped {
  constructor(readonly reason: LocalClosestApproachRefusalReason, readonly at: string | null = null,
    readonly position: SampleReceipt | null = null, readonly positionReason: string | null = null) {}
}

/** Sampled local Moon/target angular minima, independent of disk contacts. */
export function searchLocalClosestApproaches(request: LocalClosestApproachRequest): LocalClosestApproachResult {
  const input = fields(request, "local closest approach request", ["target", "observer", "window", "stepDays", "maxSamples"]);
  const planet = (OCCULTATION_PLANETS as readonly unknown[]).includes(input.target);
  const catalogue = planet ? null : starCatalogue();
  const star = catalogue?.stars.find((row) => row.id === input.target) ?? null;
  if (!planet && !star) throw new RangeError("target must name an OCCULTATION_PLANETS entry or exact catalogue id.");
  const target = input.target as OccultationTarget;
  const observer = normalizeObserver(input.observer as Observer);
  const window = normalizeWindow(input.window as TimeWindow);
  const stepDays = input.stepDays === undefined ? LOCAL_CLOSEST_APPROACH_LIMITS.defaultStepDays : input.stepDays;
  if (typeof stepDays !== "number" || !Number.isFinite(stepDays) || stepDays * DAY < 1 ||
    stepDays > LOCAL_CLOSEST_APPROACH_LIMITS.maximumStepDays) throw new RangeError("stepDays must span a millisecond to five minutes.");
  const maxSamples = input.maxSamples === undefined ? LOCAL_CLOSEST_APPROACH_LIMITS.defaultMaxSamples : input.maxSamples;
  if (typeof maxSamples !== "number" || !Number.isSafeInteger(maxSamples) || maxSamples < 1 ||
    maxSamples > LOCAL_CLOSEST_APPROACH_LIMITS.maximumMaxSamples) throw new RangeError("maxSamples must be an integer from 1 to 100000.");
  const from = Date.parse(window.from), to = Date.parse(window.to), step = Math.floor(stepDays * DAY);
  const low = from - H - 1, high = to + H + 1;
  const evaluationWindow = Number.isFinite(new Date(low).getTime()) && Number.isFinite(new Date(high).getTime())
    ? { from: iso(low), to: iso(high) } : null;
  const boundaryTimeBasis = { from: basisInside(low), to: basisInside(high) };
  const seams = boundaryTimeBasis.from && boundaryTimeBasis.to ? timeSeamsIn(low, high) : [];
  let samples = 0;
  const receipt = (): LocalClosestApproachSearchReceipt => freeze({
    schema: "zodiacs.occultations.local-closest-approach-search-receipt.v1", implementation: "local-closest-approaches/1",
    request: { target, observer, window, stepDays, maxSamples },
    engine: { name: "@zodiacs/engine", version: ENGINE_VERSION, ephemeris: { ...EPHEMERIS } },
    catalogue: catalogue?.receipt ?? null, star, frame: FRAME, boundaryTimeBasis, seams,
    search: { solver: "@zodiacs/engine/crossings:searchLongitudeCrossingsWith", windowOwnership: "(from,to]",
      stepMilliseconds: step, stencilHalfWidthMilliseconds: H, evaluationWindow,
      rateUnit: "squared-unit-chord-per-day", rateTransform: "atan(10000*rate)*90/pi",
      samples, sampleUnit: "paired-position-evaluation;includes-stencil-output-and-verification;no-cache",
      maxSamples, completeness: "sampled;not-proven" },
    conventions: ["center:topocentric;observer:calc-iers-2003-ellipsoid", `frame:${FRAME}`,
      "time:engine-utc-basis", "angles:degrees", "separation:atan2-unit-cross-dot",
      "stationarity:centered-factored-haversine-chord-difference",
      "minimum:raw-rate-negative-to-positive;isolated-exact-zero-allowed",
      "at:first-integer-millisecond-on-or-beyond-numerical-rate-zero",
      "seams:refuse-expanded-evaluation-window",
      "corrections:existing-topocentric-adapters;no-additional-light-time-or-aberration",
      ...(star ? ["star:infinite-distance-point-source-model;distance-unknown"] : [])],
    limitations: ["local-minimum-is-not-contact-or-average-of-contact-times;no-visibility-filter",
      "finite-difference-stationary-time-is-an-approximation;stencil-bias-unbounded",
      "smooth-motion-and-at-most-one-rate-station-in-two-steps-assumed;sampling-not-completeness-proof",
      "subsecond-separated-roots-may-be-collapsed;detected-zero-plateaus-refused",
      "constant-separation-has-no-isolated-event",
      "shallow-minimum-and-floating-point-timing-error-unbounded;no-general-physical-timing-bound",
      ...(star ? ["catalogue-distance-component-motion-and-completeness-unvalidated"] : [])]
  });
  const refused = (error: Stopped): LocalClosestApproachResult => freeze({ status: "refused", reason: error.reason,
    events: [] as const, receipt: receipt(),
    failure: { at: error.at, position: error.position, positionReason: error.positionReason } });
  if (!evaluationWindow || !boundaryTimeBasis.from || !boundaryTimeBasis.to) return refused(new Stopped("out-of-range"));
  if (seams.length) return refused(new Stopped("time-discontinuity", seams[0]!.at));
  if (2 * (Math.ceil((to - from) / step) + 1) > maxSamples) return refused(new Stopped("sample-budget"));
  const sample = (ms: number) => {
    const at = iso(ms);
    if (ms < low || ms > high || !Number.isInteger(ms)) throw new Error("Local minimum sample escaped evaluation window.");
    if (samples >= maxSamples) throw new Stopped("sample-budget", at);
    samples += 1;
    const a = positionAt({ body: "Moon", time: at, observer, frame: FRAME });
    if (a.status !== "ok") throw new Stopped("position-refused", at, a.receipt, a.reason);
    const b = planet ? positionAt({ body: target as OccultationPlanet, time: at, observer, frame: FRAME }) :
      starPositionAt({ star: target, time: at, observer, frame: FRAME });
    if (b.status !== "ok") throw new Stopped("position-refused", at, b.receipt, b.reason);
    if (![a.lon, a.lat, b.lon, b.lat].every(Number.isFinite) || Math.abs(a.lat) > 90 || Math.abs(b.lat) > 90) {
      throw new Stopped("invalid-direction", at);
    }
    return { a, b };
  };
  const rateAt = (ms: number) => chordDifference(sample(ms - H), sample(ms + H)) * DAY / (2 * H);
  try {
    const found = searchLongitudeCrossingsWith((_pair, at) => Math.atan(10_000 * rateAt(at.getTime())) * 90 / Math.PI,
      "pair", 0, new Date(from), new Date(to), { stepDays: step / DAY, maxSamples });
    if (found.status === "refused") return refused(new Stopped("sample-budget"));
    const records: Array<{ ms: number; bracket: NormalizedWindow; position: ReturnType<typeof sample> }> = [];
    for (const crossing of found.crossings) {
      // Circular normalization can round a tiny transformed rate to zero.
      // Confirm the raw rate and direction before publishing any minimum.
      const raw = crossing.at.getTime(), radius = Math.ceil(step / 2 ** 24) + 2;
      let previous: number | undefined;
      let resolved = false;
      let minimum: number | null = null, exact = false;
      for (let ms = Math.max(from - 1, raw - radius); ms <= Math.min(to, raw + radius); ms += 1) {
        const current = rateAt(ms);
        if (previous !== undefined && previous !== 0 && (current === 0 || Math.sign(current) !== Math.sign(previous))) {
          if (current === 0) {
            const after = rateAt(ms + 1);
            if (after === 0) throw new Stopped("unresolved-minimum", iso(ms));
            if (previous < 0 && after > 0) { minimum = ms; exact = true; }
          } else if (previous < 0 && current > 0) minimum = ms;
          resolved = true;
          break;
        }
        previous = current;
      }
      if (!resolved) throw new Stopped("unresolved-minimum", iso(raw));
      if (minimum === null || minimum <= from || minimum > to || records.some((record) => record.ms === minimum)) continue;
      records.push({ ms: minimum, bracket: { from: iso(exact ? minimum : minimum - 1), to: iso(minimum) },
        position: sample(minimum) });
    }
    const searchReceipt = receipt();
    const events: LocalClosestApproach[] = records.sort((a, b) => a.ms - b.ms).map(({ ms, bracket, position }) => ({
      kind: "local-closest-approach", target, at: iso(ms), bracket, separationDegrees: separationDegrees(position),
      receipt: { schema: "zodiacs.occultations.local-closest-approach-receipt.v1", search: searchReceipt,
        timeBasis: timeBasis(ms), moon: position.a.receipt, target: position.b.receipt,
        validation: "finite-reference-gates;no-general-physical-timing-bound" }
    }));
    return freeze({ status: "complete", events, receipt: searchReceipt });
  } catch (error) {
    if (error instanceof Stopped) return refused(error);
    throw error;
  }
}
