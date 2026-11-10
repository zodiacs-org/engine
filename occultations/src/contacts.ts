import { CALC_SPAN } from "../../src/calc.js";
import { timeBasis } from "../../src/time-scale.js";
import type { TimeBasis } from "../../src/time-scale.js";
import { ENGINE_VERSION, EPHEMERIS } from "../../src/types.js";
import { separationDegrees } from "./appulse-geometry.js";
import { starCatalogue } from "./catalogue.js";
import type { CatalogueReceipt, CatalogueStar } from "./catalogue.js";
import { contactGeometry } from "./contact-geometry.js";
import { contactIntervals } from "./contact-intervals.js";
import { contactSkyFacts } from "./contact-sky.js";
import type { ContactSkyFacts } from "./contact-sky.js";
import { positionAt } from "./engine.js";
import type { PositionReceipt } from "./engine.js";
import { fields, normalizeObserver, normalizeWindow } from "./input.js";
import type { NormalizedObserver, NormalizedWindow, Observer, TimeWindow } from "./input.js";
import { OCCULTATION_PLANETS, OCCULTATION_RADII } from "./occultation-radii.js";
import type { OccultationPlanet } from "./occultation-radii.js";
import type { OccultationTarget } from "./occultations.js";
import { starPositionAt } from "./star-position.js";
import type { StarPositionReceipt } from "./star-position.js";
import { timeSeamsIn } from "./time-seams.js";

export interface LunarContactRequest {
  readonly target: OccultationTarget;
  readonly observer: Observer;
  readonly window: TimeWindow;
  readonly stepDays?: number;
  /** Position-pair and composite sky evaluations across scans and output. */
  readonly maxSamples?: number;
}
export const CONTACT_LIMITS = Object.freeze({
  defaultStepDays: 300_000 / 86_400_000, maximumStepDays: 300_000 / 86_400_000,
  defaultMaxSamples: 20_000, maximumMaxSamples: 100_000,
  boundaryHaloMilliseconds: 1
});
type SampleReceipt = PositionReceipt | StarPositionReceipt;
export type LunarContactKind = "disappearance" | "reappearance" |
  "partial-disappearance-start" | "full-disappearance" |
  "full-reappearance-start" | "partial-reappearance-end";
export interface ContactSearchReceipt {
  readonly schema: "zodiacs.occultations.contact-search-receipt.v2";
  readonly implementation: "spherical-contacts/2";
  readonly request: { readonly target: OccultationTarget; readonly observer: NormalizedObserver;
    readonly window: NormalizedWindow; readonly stepDays: number; readonly maxSamples: number };
  readonly engine: PositionReceipt["engine"];
  readonly catalogue: CatalogueReceipt | null;
  readonly star: CatalogueStar | null;
  readonly radii: typeof OCCULTATION_RADII;
  readonly boundaryTimeBasis: { readonly from: TimeBasis | null; readonly to: TimeBasis | null };
  readonly seams: ReturnType<typeof timeSeamsIn>;
  readonly search: {
    readonly solver: "@zodiacs/engine/crossings:searchLongitudeCrossingsWith";
    readonly windowOwnership: "contacts:(from,to];intervals:clipped-intersection";
    readonly evaluationWindow: NormalizedWindow | null;
    readonly stepMilliseconds: number;
    readonly samples: number;
    readonly skyEvaluations: number;
    readonly maxSamples: number;
    readonly sampleUnit: "position-pair-or-composite-sky-evaluation;includes-all-refinement-and-output;no-cache";
    readonly skyEvaluationUnit: "one-sun-adapter-plus-engine-moonPhase-and-horizontal-geometry";
    readonly completeness: "sampled;not-proven";
  };
  readonly conventions: readonly string[];
  readonly limitations: readonly string[];
}
export interface LunarContact {
  readonly kind: LunarContactKind;
  readonly target: OccultationTarget;
  readonly at: string;
  readonly boundary: "point-source" | "external" | "internal";
  readonly direction: "disappearing" | "reappearing";
  /** Numerical enclosure only, not a physical timing-error bound. */
  readonly bracket: NormalizedWindow;
  readonly separationDegrees: number;
  readonly moonSemidiameterDegrees: number;
  readonly targetSemidiameterDegrees: number;
  readonly clearanceDegrees: number;
  readonly sky: ContactSkyFacts;
  readonly receipt: {
    readonly schema: "zodiacs.occultations.contact-receipt.v2";
    readonly search: ContactSearchReceipt;
    readonly timeBasis: TimeBasis;
    readonly moon: PositionReceipt;
    readonly target: SampleReceipt;
    readonly validation: "finite-published-reference-gates;no-general-physical-timing-bound";
  };
}
export interface LocalOccultationInterval {
  readonly from: string;
  readonly to: string;
  readonly start: "window" | "contact";
  readonly end: "window" | "contact";
  readonly coverage: "overlap" | "full";
  readonly receipt: { readonly search: ContactSearchReceipt;
    readonly semantics: "quantized-negative-clearance-interval;clipping-does-not-imply-contact" };
}
export type ContactRefusalReason = "sample-budget" | "time-discontinuity" | "out-of-range" |
  "position-refused" | "invalid-geometry" | "unresolved-contact";
export type LunarContactResult = {
  readonly status: "complete";
  readonly contacts: readonly LunarContact[];
  readonly overlapIntervals: readonly LocalOccultationInterval[];
  readonly fullCoverageIntervals: readonly LocalOccultationInterval[];
  readonly receipt: ContactSearchReceipt;
} | {
  readonly status: "refused";
  readonly reason: ContactRefusalReason;
  readonly contacts: readonly [];
  readonly overlapIntervals: readonly [];
  readonly fullCoverageIntervals: readonly [];
  readonly receipt: ContactSearchReceipt;
  readonly failure: { readonly at: string | null; readonly position: SampleReceipt | null;
    readonly positionReason: string | null };
};

const DAY = 86_400_000, J2000 = Date.UTC(2000, 0, 1, 12);
const LOWER = Date.parse(CALC_SPAN.from), UPPER = Date.parse(CALC_SPAN.to);
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
  return [basis.ut1Days, basis.ttDays].every((d) =>
    d >= (LOWER - J2000) / DAY && d < (UPPER - J2000) / DAY) ? basis : null;
}
class Stopped {
  constructor(readonly reason: ContactRefusalReason, readonly at: string | null = null,
    readonly position: SampleReceipt | null = null, readonly positionReason: string | null = null) {}
}

/** Vacuum spherical-limb contacts at a site, including below the horizon. */
export function searchLunarContacts(request: LunarContactRequest): LunarContactResult {
  const input = fields(request, "lunar contact request", ["target", "observer", "window", "stepDays", "maxSamples"]);
  const planet = (OCCULTATION_PLANETS as readonly unknown[]).includes(input.target);
  const catalogue = planet ? null : starCatalogue();
  const star = catalogue?.stars.find((row) => row.id === input.target) ?? null;
  if (!planet && !star) throw new RangeError("target must name an OCCULTATION_PLANETS entry or exact catalogue id.");
  const target = input.target as OccultationTarget;
  const observer = normalizeObserver(input.observer as Observer);
  const window = normalizeWindow(input.window as TimeWindow);
  const stepDays = input.stepDays === undefined ? CONTACT_LIMITS.defaultStepDays : input.stepDays;
  if (typeof stepDays !== "number" || !Number.isFinite(stepDays) || stepDays * DAY < 1 ||
    stepDays > CONTACT_LIMITS.maximumStepDays) throw new RangeError("stepDays must span a millisecond to five minutes.");
  const maxSamples = input.maxSamples === undefined ? CONTACT_LIMITS.defaultMaxSamples : input.maxSamples;
  if (typeof maxSamples !== "number" || !Number.isSafeInteger(maxSamples) || maxSamples < 1 ||
    maxSamples > CONTACT_LIMITS.maximumMaxSamples) throw new RangeError("maxSamples must be an integer from 1 to 100000.");
  const from = Date.parse(window.from), to = Date.parse(window.to), step = Math.floor(stepDays * DAY);
  const low = from - CONTACT_LIMITS.boundaryHaloMilliseconds;
  const high = to + CONTACT_LIMITS.boundaryHaloMilliseconds;
  const evaluationWindow = Number.isFinite(new Date(low).getTime()) && Number.isFinite(new Date(high).getTime())
    ? { from: iso(low), to: iso(high) } : null;
  const boundaryTimeBasis = { from: basisInside(low), to: basisInside(high) };
  const seams = boundaryTimeBasis.from && boundaryTimeBasis.to ? timeSeamsIn(low, high) : [];
  let samples = 0, skyEvaluations = 0;
  const receipt = (): ContactSearchReceipt => freeze({
    schema: "zodiacs.occultations.contact-search-receipt.v2", implementation: "spherical-contacts/2",
    request: { target, observer, window, stepDays, maxSamples },
    engine: { name: "@zodiacs/engine", version: ENGINE_VERSION, ephemeris: { ...EPHEMERIS } },
    catalogue: catalogue?.receipt ?? null, star, radii: OCCULTATION_RADII, boundaryTimeBasis, seams,
    search: { solver: "@zodiacs/engine/crossings:searchLongitudeCrossingsWith",
      windowOwnership: "contacts:(from,to];intervals:clipped-intersection", evaluationWindow,
      stepMilliseconds: step, samples, skyEvaluations, maxSamples,
      sampleUnit: "position-pair-or-composite-sky-evaluation;includes-all-refinement-and-output;no-cache",
      skyEvaluationUnit: "one-sun-adapter-plus-engine-moonPhase-and-horizontal-geometry", completeness: "sampled;not-proven" },
    conventions: ["center:topocentric;observer:calc-iers-2003-ellipsoid", `frame:${FRAME}`,
      "time:engine-utc-basis", "angles:degrees;distances:km", "contact:vacuum-spherical-limbs",
      "moon:sphere-from-engine-sky-radius", "planets:nominal-equatorial-radius-spheres;no-rings",
      "semidiameters:asin(radius/adapter-dist);dist-is-engine-astrometric-light-path",
      "external:separation-(moon-radius+target-radius);internal:separation-(moon-radius-target-radius)",
      "corrections:existing-topocentric-adapters;no-additional-light-time-or-aberration",
      "contacts:first-integer-millisecond-on-or-after-root;raw-sign-enclosures",
      "sky:contact-sky/1;separate-vacuum-and-refracted-horizon-facts;no-visibility-filter",
      ...(star ? ["star:infinite-distance-point-source-model;distance-unknown"] : [])],
    limitations: ["spherical-contact-does-not-establish-visibility;horizon-not-filtered",
      "contact-equation:no-lunar-relief-planet-oblateness-rings-atmosphere-or-refraction",
      "engine-apparent-direction-and-light-path-range-are-approximate;no-extra-correction",
      "smooth-clearance-with-at-most-one-station-in-two-steps-assumed;sampling-not-completeness-proof",
      "subsecond-separated-roots-may-be-collapsed;detected-grazes-plateaus-and-ambiguity-refused",
      "no-general-physical-timing-bound;grazing-sensitivity-and-missing-uncertainties-unbounded",
      ...(star ? ["catalogue-distance-component-motion-and-completeness-unvalidated"] : [])]
  });
  const refused = (error: Stopped): LunarContactResult => freeze({ status: "refused", reason: error.reason,
    contacts: [] as const, overlapIntervals: [] as const, fullCoverageIntervals: [] as const, receipt: receipt(),
    failure: { at: error.at, position: error.position, positionReason: error.positionReason } });
  if (!evaluationWindow || !boundaryTimeBasis.from || !boundaryTimeBasis.to) return refused(new Stopped("out-of-range"));
  if (seams.length) return refused(new Stopped("time-discontinuity", seams[0]!.at));
  if ((planet ? 2 : 1) * (Math.ceil((to - from) / step) + 1) > maxSamples) return refused(new Stopped("sample-budget"));
  const sample = (ms: number) => {
    const at = iso(ms);
    if (ms < low || ms > high || !Number.isInteger(ms)) throw new Error("Contact sample escaped evaluation window.");
    if (samples >= maxSamples) throw new Stopped("sample-budget", at);
    samples += 1;
    const moon = positionAt({ body: "Moon", time: at, observer, frame: FRAME });
    if (moon.status !== "ok") throw new Stopped("position-refused", at, moon.receipt, moon.reason);
    const other = planet ? positionAt({ body: target as OccultationPlanet, time: at, observer, frame: FRAME }) :
      starPositionAt({ star: target, time: at, observer, frame: FRAME });
    if (other.status !== "ok") throw new Stopped("position-refused", at, other.receipt, other.reason);
    if (![moon.lon, moon.lat, other.lon, other.lat].every(Number.isFinite) ||
      Math.abs(moon.lat) > 90 || Math.abs(other.lat) > 90 || moon.dist === null ||
      ("dist" in other && other.dist === null)) throw new Stopped("invalid-geometry", at);
    const separation = separationDegrees({ a: moon, b: other });
    try {
      const geometry = contactGeometry({ separationDegrees: separation,
        moonDistanceKm: moon.dist * OCCULTATION_RADII.auKm,
        targetDistanceKm: "dist" in other && other.dist !== null ? other.dist * OCCULTATION_RADII.auKm : null,
        targetRadiusKm: planet ? OCCULTATION_RADII.planetKm[target as OccultationPlanet] : 0 });
      return { moon, other, geometry, separation };
    } catch (error) {
      if (error instanceof RangeError) throw new Stopped("invalid-geometry", at);
      throw error;
    }
  };
  try {
    const scan = (key: "externalClearanceDegrees" | "internalClearanceDegrees") => {
      const result = contactIntervals((ms) => sample(ms).geometry[key], from, to, step, maxSamples);
      if (result.status !== "complete") throw new Stopped(result.reason);
      return result;
    };
    const overlap = scan("externalClearanceDegrees");
    const full = planet ? scan("internalClearanceDegrees") : overlap;
    if (full.intervals.some((inside) => !overlap.intervals.some((outside) =>
      inside.from >= outside.from && inside.to <= outside.to))) throw new Stopped("unresolved-contact");
    const roots = [
      ...overlap.contacts.map((contact) => ({ ...contact, boundary: planet ? "external" as const : "point-source" as const })),
      ...(planet ? full.contacts.map((contact) => ({ ...contact, boundary: "internal" as const })) : [])
    ].sort((a, b) => a.at - b.at);
    if (roots.some((root, index) => index > 0 && root.at === roots[index - 1]!.at)) {
      throw new Stopped("unresolved-contact");
    }
    // Gather all output samples before fixing the shared consumed-work receipt.
    const records = roots.map((root) => {
      const value = sample(root.at), at = iso(root.at);
      if (samples >= maxSamples) throw new Stopped("sample-budget", at);
      samples += 1;
      skyEvaluations += 1;
      const sun = positionAt({ body: "Sun", time: at, observer, frame: FRAME });
      if (sun.status !== "ok") throw new Stopped("position-refused", at, sun.receipt, sun.reason);
      try {
        return { root, value, sky: contactSkyFacts(at, observer, value.moon, value.other, sun) };
      } catch (error) {
        if (error instanceof RangeError) throw new Stopped("invalid-geometry", at);
        throw error;
      }
    });
    const searchReceipt = receipt();
    const contacts: LunarContact[] = records.map(({ root, value, sky }) => {
      const disappearing = root.after < 0;
      const kind: LunarContactKind = root.boundary === "point-source"
        ? disappearing ? "disappearance" : "reappearance"
        : root.boundary === "external"
          ? disappearing ? "partial-disappearance-start" : "partial-reappearance-end"
          : disappearing ? "full-disappearance" : "full-reappearance-start";
      return { kind, target, at: iso(root.at), boundary: root.boundary,
        direction: disappearing ? "disappearing" : "reappearing",
        bracket: { from: iso(root.bracket.from), to: iso(root.bracket.to) },
        separationDegrees: value.separation, moonSemidiameterDegrees: value.geometry.moonSemidiameterDegrees,
        targetSemidiameterDegrees: value.geometry.targetSemidiameterDegrees,
        clearanceDegrees: root.boundary === "internal" ? value.geometry.internalClearanceDegrees : value.geometry.externalClearanceDegrees,
        sky,
        receipt: { schema: "zodiacs.occultations.contact-receipt.v2", search: searchReceipt,
          timeBasis: timeBasis(root.at), moon: value.moon.receipt, target: value.other.receipt,
          validation: "finite-published-reference-gates;no-general-physical-timing-bound" } };
    });
    const intervals = (values: typeof overlap.intervals, coverage: "overlap" | "full"): LocalOccultationInterval[] =>
      values.map((interval) => ({ from: iso(interval.from), to: iso(interval.to), coverage,
        start: interval.start === "window" ? "window" : "contact",
        end: interval.end === "window" ? "window" : "contact",
        receipt: { search: searchReceipt, semantics: "quantized-negative-clearance-interval;clipping-does-not-imply-contact" } }));
    return freeze({ status: "complete", contacts, overlapIntervals: intervals(overlap.intervals, "overlap"),
      fullCoverageIntervals: intervals(full.intervals, "full"), receipt: searchReceipt });
  } catch (error) {
    if (error instanceof Stopped) return refused(error);
    throw error;
  }
}
