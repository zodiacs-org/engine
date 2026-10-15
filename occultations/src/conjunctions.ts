import { CALC_SPAN } from "../../src/calc.js";
import { fromSpherical } from "../../src/calc-frames.js";
import { searchLongitudeCrossingsWith } from "../../src/crossings.js";
import { timeBasis } from "../../src/time-scale.js";
import type { TimeBasis } from "../../src/time-scale.js";
import { ENGINE_VERSION, EPHEMERIS } from "../../src/types.js";
import { cross, dot } from "./astrometry.js";
import { starCatalogue } from "./catalogue.js";
import type { CatalogueReceipt, CatalogueStar } from "./catalogue.js";
import { positionAt, SOLAR_SYSTEM_BODIES } from "./engine.js";
import type { PositionFrame, PositionReceipt, SolarSystemBody } from "./engine.js";
import { fields, normalizeWindow } from "./input.js";
import type { NormalizedWindow, TimeWindow } from "./input.js";
import { starPositionAt } from "./star-position.js";
import type { StarPositionReceipt } from "./star-position.js";
import { timeSeamsIn } from "./time-seams.js";

export type ConjunctionCoordinate = "right-ascension" | "ecliptic-longitude";
export type ConjunctionTarget = SolarSystemBody | `sao:${number}`;

export interface ConjunctionRequest {
  readonly first: SolarSystemBody;
  readonly second: ConjunctionTarget;
  readonly coordinate: ConjunctionCoordinate;
  readonly window: TimeWindow;
  /** Coarse sampling interval, at most a quarter day; rounded down to whole milliseconds. */
  readonly stepDays?: number;
  /** Paired position evaluations, including refinement and event records. Finite and bounded. */
  readonly maxSamples?: number;
}

export const CONJUNCTION_LIMITS = Object.freeze({
  defaultStepDays: 0.25, maximumStepDays: 0.25, defaultMaxSamples: 10_000, maximumMaxSamples: 100_000
});

export interface ConjunctionSearchReceipt {
  readonly schema: "zodiacs.occultations.conjunction-search-receipt.v1";
  readonly implementation: "geocentric-conjunctions/1";
  readonly request: {
    readonly first: SolarSystemBody;
    readonly second: ConjunctionTarget;
    readonly coordinate: ConjunctionCoordinate;
    readonly window: NormalizedWindow;
    readonly stepDays: number;
    readonly maxSamples: number;
  };
  readonly engine: PositionReceipt["engine"];
  readonly frame: PositionFrame;
  readonly catalogue: CatalogueReceipt | null;
  readonly star: CatalogueStar | null;
  readonly boundaryTimeBasis: { readonly from: TimeBasis | null; readonly to: TimeBasis | null };
  readonly seams: ReturnType<typeof timeSeamsIn>;
  readonly search: {
    readonly solver: "@zodiacs/engine/crossings:searchLongitudeCrossingsWith";
    readonly windowOwnership: "(from,to]";
    readonly stepMilliseconds: number;
    readonly samples: number;
    readonly sampleUnit: "paired-position-evaluation;includes-output-and-millisecond-checks";
    readonly maxSamples: number;
    readonly completeness: "sampled;not-proven";
  };
  readonly conventions: readonly string[];
  readonly limitations: readonly string[];
}

export interface ConjunctionEvent {
  readonly kind: "right-ascension-conjunction" | "ecliptic-longitude-conjunction";
  /** Engine UTC-basis label: outside its IERS interval civil time is read as UT1. */
  readonly at: string;
  readonly first: SolarSystemBody;
  readonly second: ConjunctionTarget;
  /** Decreasing first minus second coordinate, not either body's absolute retrograde motion. */
  readonly relativeRetrograde: boolean;
  readonly coordinateDifferenceDegrees: number;
  /** First minus second declination, or ecliptic latitude. */
  readonly crossCoordinateDifferenceDegrees: number;
  readonly separationDegrees: number;
  readonly receipt: {
    readonly schema: "zodiacs.occultations.conjunction-event-receipt.v1";
    readonly search: ConjunctionSearchReceipt;
    readonly timeBasis: TimeBasis;
    readonly first: PositionReceipt;
    readonly second: PositionReceipt | StarPositionReceipt;
    readonly validation: "development-coordinate-references;no-general-timing-bound";
  };
}

export type ConjunctionRefusalReason = "sample-budget" | "time-discontinuity" | "out-of-range" |
  "position-refused" | "undefined-coordinate" | "unresolved-root";
export type ConjunctionResult = {
  readonly status: "complete";
  readonly events: readonly ConjunctionEvent[];
  readonly receipt: ConjunctionSearchReceipt;
} | {
  readonly status: "refused";
  readonly reason: ConjunctionRefusalReason;
  readonly events: readonly [];
  readonly receipt: ConjunctionSearchReceipt;
  readonly failure: {
    readonly at: string | null;
    readonly position: PositionReceipt | StarPositionReceipt | null;
    readonly positionReason: string | null;
  };
};

const DAY = 86_400_000;
const J2000 = Date.UTC(2000, 0, 1, 12);
const LOWER = Date.parse(CALC_SPAN.from);
const UPPER = Date.parse(CALC_SPAN.to);
const signed = (angle: number): number => {
  const reduced = angle % 360;
  return reduced > 180 ? reduced - 360 : reduced <= -180 ? reduced + 360 : reduced;
};
const isBody = (value: unknown): value is SolarSystemBody =>
  typeof value === "string" && (SOLAR_SYSTEM_BODIES as readonly string[]).includes(value);

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

class SearchStopped {
  constructor(readonly reason: ConjunctionRefusalReason, readonly at: string | null = null,
    readonly position: PositionReceipt | StarPositionReceipt | null = null,
    readonly positionReason: string | null = null) {}
}

/** Offline coordinate conjunctions. These are neither appulses nor occultation contacts. */
export function searchConjunctions(request: ConjunctionRequest): ConjunctionResult {
  const input = fields(request, "conjunction request", ["first", "second", "coordinate", "window", "stepDays", "maxSamples"]);
  if (!isBody(input.first)) throw new RangeError("first must name a supported physical solar-system body.");
  const first = input.first;
  const stellar = !isBody(input.second);
  const catalogue = stellar ? starCatalogue() : null;
  const star = catalogue?.stars.find((entry) => entry.id === input.second) ?? null;
  if (stellar && star === null) {
    throw new RangeError("second must name a supported body or exact starCatalogue id.");
  }
  const second = input.second as ConjunctionTarget;
  if (first === second) throw new RangeError("A conjunction requires distinct targets.");
  const coordinate = input.coordinate;
  if (coordinate !== "right-ascension" && coordinate !== "ecliptic-longitude") {
    throw new RangeError("coordinate must be right-ascension or ecliptic-longitude.");
  }
  const window = normalizeWindow(input.window as TimeWindow);
  const stepDays = input.stepDays === undefined ? CONJUNCTION_LIMITS.defaultStepDays : input.stepDays;
  if (typeof stepDays !== "number" || !Number.isFinite(stepDays) || stepDays * DAY < 1 ||
    stepDays > CONJUNCTION_LIMITS.maximumStepDays) {
    throw new RangeError("stepDays must represent at least a millisecond and at most a quarter day.");
  }
  const maxSamples = input.maxSamples === undefined ? CONJUNCTION_LIMITS.defaultMaxSamples : input.maxSamples;
  if (typeof maxSamples !== "number" || !Number.isSafeInteger(maxSamples) || maxSamples < 1 ||
    maxSamples > CONJUNCTION_LIMITS.maximumMaxSamples) {
    throw new RangeError("maxSamples must be a positive integer at most 100000.");
  }
  const from = Date.parse(window.from), to = Date.parse(window.to);
  const step = Math.floor(stepDays * DAY);
  const frame: PositionFrame = coordinate === "right-ascension" ? "equatorial-true-of-date" : "ecliptic-true-of-date";
  const boundaryTimeBasis = { from: basisInside(from), to: basisInside(to) };
  const seams = boundaryTimeBasis.from && boundaryTimeBasis.to ? timeSeamsIn(from, to) : [];
  let samples = 0;
  const receipt = (): ConjunctionSearchReceipt => freeze({
    schema: "zodiacs.occultations.conjunction-search-receipt.v1", implementation: "geocentric-conjunctions/1",
    request: { first, second, coordinate, window, stepDays, maxSamples },
    engine: { name: "@zodiacs/engine", version: ENGINE_VERSION, ephemeris: { ...EPHEMERIS } },
    frame, catalogue: catalogue?.receipt ?? null, star, boundaryTimeBasis, seams,
    search: { solver: "@zodiacs/engine/crossings:searchLongitudeCrossingsWith", windowOwnership: "(from,to]",
      stepMilliseconds: step, samples, sampleUnit: "paired-position-evaluation;includes-output-and-millisecond-checks",
      maxSamples, completeness: "sampled;not-proven" },
    conventions: ["center:geocentric", `frame:${frame}`, "coordinate:first-minus-second;wrap:shortest-arc",
      "time:engine-utc-basis", "seams:refuse-whole-window", "root:first-integer-millisecond-on-or-beyond-crossing",
      "solver:24-bisections;station-probes;duplicates-within-one-second-collapsed",
      "relative-retrograde:decreasing-first-minus-second;exact-sample-uses-preceding-side;extremum-touch-direct",
      "corrections:position-adapter-and-star-adapter;no-additional-corrections", "angles:degrees"],
    limitations: ["coordinate-conjunction-is-not-minimum-separation-or-occultation",
      "smooth-motion-and-at-most-one-relative-station-in-two-steps-assumed",
      "sampling-is-not-a-completeness-proof", "subsecond-separated-roots-may-be-collapsed",
      "no-physical-timing-bound", ...(stellar ? ["catalogue-and-contact-accuracy-unmeasured"] : [])]
  });
  const refused = (error: SearchStopped): ConjunctionResult => freeze({
    status: "refused", reason: error.reason, events: [] as const, receipt: receipt(),
    failure: { at: error.at, position: error.position, positionReason: error.positionReason }
  });
  // No position is evaluated on any preflight refusal, and no partial list escapes.
  if (!boundaryTimeBasis.from || !boundaryTimeBasis.to) return refused(new SearchStopped("out-of-range"));
  if (seams.length) return refused(new SearchStopped("time-discontinuity", seams[0]!.at));
  if (Math.ceil((to - from) / step) + 1 > maxSamples) return refused(new SearchStopped("sample-budget"));

  const sample = (ms: number) => {
    const at = new Date(ms).toISOString();
    if (samples >= maxSamples) throw new SearchStopped("sample-budget", at);
    samples += 1;
    const a = positionAt({ body: first, time: at, frame });
    if (a.status !== "ok") throw new SearchStopped("position-refused", at, a.receipt, a.reason);
    const b = stellar ? starPositionAt({ star: second, time: at, frame }) :
      positionAt({ body: second as SolarSystemBody, time: at, frame });
    if (b.status !== "ok") throw new SearchStopped("position-refused", at, b.receipt, b.reason);
    if (![a.lon, a.lat, b.lon, b.lat].every(Number.isFinite) ||
      Math.abs(a.lat) >= 90 || Math.abs(b.lat) >= 90) throw new SearchStopped("undefined-coordinate", at);
    return { a, b, difference: signed(a.lon - b.lon) };
  };
  try {
    const found = searchLongitudeCrossingsWith((_pair, at) => sample(at.getTime()).difference,
      "pair", 0, new Date(from), new Date(to), { stepDays: step / DAY, maxSamples });
    if (found.status === "refused") return refused(new SearchStopped("sample-budget"));
    const records: Array<{ ms: number; retrograde: boolean; position: ReturnType<typeof sample> }> = [];
    for (const crossing of found.crossings) {
      // The engine bisects floating timestamps but calls the ephemeris at Date's
      // integer milliseconds. Resolve the last few milliseconds on that lattice,
      // including pre-1970 Date truncation, so a returned time can partition a window.
      const raw = crossing.at.getTime();
      const radius = Math.ceil(step / 2 ** 24) + 2;
      let previous: ReturnType<typeof sample> | undefined;
      let chosen: { ms: number; position: ReturnType<typeof sample> } | undefined;
      for (let ms = Math.max(from, raw - radius); ms <= Math.min(to, raw + radius); ms += 1) {
        const current = sample(ms);
        if (previous && ms > from && Math.abs(previous.difference) < 90 && Math.abs(current.difference) < 90 &&
          previous.difference !== 0 && (current.difference === 0 ||
            Math.sign(previous.difference) !== Math.sign(current.difference))) {
          chosen = { ms, position: current };
          break;
        }
        previous = current;
      }
      if (!chosen) {
        // An exact sampled touch can have no sign change; the loop accepts its
        // first exact millisecond. An unconfirmed candidate is never an event.
        if (raw <= from || raw > to) continue;
        throw new SearchStopped("unresolved-root", new Date(raw).toISOString());
      }
      if (records.some((record) => record.ms === chosen.ms)) continue;
      records.push({ ...chosen, retrograde: crossing.retrograde });
    }
    const searchReceipt = receipt();
    const events: ConjunctionEvent[] = records.sort((a, b) => a.ms - b.ms).map(({ ms, retrograde, position }) => {
      const { a, b, difference } = position;
      const av = fromSpherical(a.lon, a.lat, 1), bv = fromSpherical(b.lon, b.lat, 1);
      return {
        kind: coordinate === "right-ascension" ? "right-ascension-conjunction" : "ecliptic-longitude-conjunction",
        at: new Date(ms).toISOString(), first, second, relativeRetrograde: retrograde,
        coordinateDifferenceDegrees: difference, crossCoordinateDifferenceDegrees: a.lat - b.lat,
        separationDegrees: Math.atan2(Math.hypot(...cross(av, bv)), dot(av, bv)) * 180 / Math.PI,
        receipt: { schema: "zodiacs.occultations.conjunction-event-receipt.v1", search: searchReceipt,
          timeBasis: timeBasis(ms), first: a.receipt, second: b.receipt,
          validation: "development-coordinate-references;no-general-timing-bound" }
      };
    });
    return freeze({ status: "complete", events, receipt: searchReceipt });
  } catch (error) {
    if (error instanceof SearchStopped) return refused(error);
    throw error;
  }
}
