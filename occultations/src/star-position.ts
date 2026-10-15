import { Body } from "astronomy-engine";
import type { AstroTime } from "astronomy-engine";
import { apply, frameMatrix, toSpherical, transpose } from "../../src/calc-frames.js";
import type { Vec3 } from "../../src/calc-frames.js";
import { geometricState } from "../../src/calc-reduce.js";
import { onChartClock } from "../../src/ephemeris.js";
import { REFERENCE_SPAN } from "../../src/reference-span.js";
import { timeBasis } from "../../src/time-scale.js";
import type { TimeBasis } from "../../src/time-scale.js";
import { ENGINE_VERSION, EPHEMERIS } from "../../src/types.js";
import { aberrate, add, propagateAstrometry, scale, unit } from "./astrometry.js";
import type { Astrometry } from "./astrometry.js";
import { starCatalogue } from "./catalogue.js";
import type { CatalogueReceipt, CatalogueStar, StarCatalogue } from "./catalogue.js";
import type { PositionFrame } from "./engine.js";
import { fields, normalizeInstant, normalizeObserver } from "./input.js";
import type { Instant, NormalizedObserver, Observer } from "./input.js";

export interface StarPositionRequest {
  /** Exact catalogue id, for example sao:157923. Labels are not identifiers. */
  readonly star: string;
  readonly time: Instant;
  readonly observer?: Observer;
  readonly frame?: PositionFrame;
}

export interface StarPositionReceipt {
  readonly schema: "zodiacs.occultations.star-position-receipt.v1";
  readonly implementation: "sao-apparent-star/1";
  readonly request: {
    readonly star: string;
    readonly time: string;
    readonly observer: NormalizedObserver | null;
    readonly frame: PositionFrame;
  };
  readonly engine: { readonly name: "@zodiacs/engine"; readonly version: string; readonly ephemeris: typeof EPHEMERIS };
  readonly catalogue: CatalogueReceipt;
  readonly source: CatalogueStar;
  /** Engine basis; null for an out-of-range refusal. */
  readonly timeBasis: TimeBasis | null;
  readonly conventions: readonly string[];
  readonly limitations: readonly string[];
  readonly validation: "astrometric-reduction-tests;catalogue-and-contact-accuracy-unmeasured";
}

export type StarPositionResult = {
  readonly status: "ok";
  readonly star: string;
  readonly frame: PositionFrame;
  /** RA or ecliptic longitude, degrees in [0,360). */
  readonly lon: number;
  /** Declination or ecliptic latitude, degrees. */
  readonly lat: number;
  /** Unit direction, not an AU position. Unknown catalogue distance stays null. */
  readonly direction: Vec3;
  readonly distanceAu: null;
  readonly receipt: StarPositionReceipt;
} | {
  readonly status: "refused";
  readonly reason: "out-of-range" | "proper-motion-unavailable";
  readonly receipt: StarPositionReceipt;
};

let catalogue: StarCatalogue | undefined;
const DAY_MS = 86_400_000;
const J2000_MS = Date.UTC(2000, 0, 1, 12);
const LOWER_MS = Date.parse(REFERENCE_SPAN.from);
const UPPER_MS = Date.parse(REFERENCE_SPAN.to);
const LOWER_DAYS = (LOWER_MS - J2000_MS) / DAY_MS;
const UPPER_DAYS = (UPPER_MS - J2000_MS) / DAY_MS;

function freeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

/** Engine state and frame integration, also exercised with exact TT reference inputs. */
export function stellarDirectionAt(star: Astrometry, time: AstroTime,
  observer: NormalizedObserver | null, frame: PositionFrame): Vec3 {
  const earth = geometricState(Body.Earth, { kind: "barycentric" }, time)!;
  const site = observer === null ? null : geometricState(Body.Earth, { kind: "topocentric", site: {
    latitude: observer.latitude, longitude: observer.longitude, height: observer.elevationMeters
  } }, time)!;
  // Earth minus Earth minus site is the negative geocentric observer state.
  // Keep the existing engine observer implementation, including its UT1 clock.
  const r = site === null ? earth.r : add(earth.r, scale(site.r, -1));
  const v = site === null ? earth.v : add(earth.v, scale(site.v, -1));
  const toIcrs = frameMatrix("equatorial-icrs", time);
  const astrometric = propagateAstrometry(star, time.tt, apply(toIcrs, r));
  const apparent = aberrate(astrometric, apply(toIcrs, v));
  const eqj = apply(transpose(toIcrs), apparent);
  return unit(apply(frameMatrix(frame, time), eqj));
}

/** Offline apparent direction for a frozen SAO target, with no invented distance. */
export function starPositionAt(request: StarPositionRequest): StarPositionResult {
  const input = fields(request, "star position request", ["star", "time", "observer", "frame"]);
  catalogue ??= starCatalogue();
  const source = catalogue.stars.find((entry) => entry.id === input.star);
  if (source === undefined) throw new RangeError("star must be an exact id in starCatalogue().");
  const time = normalizeInstant(input.time as Instant);
  const observer = input.observer === undefined ? null : normalizeObserver(input.observer as Observer);
  const frame = input.frame === undefined ? "equatorial-true-of-date" : input.frame;
  if (frame !== "equatorial-true-of-date" && frame !== "ecliptic-true-of-date") {
    throw new RangeError("frame must be equatorial-true-of-date or ecliptic-true-of-date.");
  }
  const ms = Date.parse(time);
  const basis = ms < LOWER_MS - DAY_MS || ms > UPPER_MS + DAY_MS ? null : timeBasis(ms);
  const inside = basis !== null && [basis.ut1Days, basis.ttDays].every((d) => d >= LOWER_DAYS && d < UPPER_DAYS);
  const receipt: StarPositionReceipt = {
    schema: "zodiacs.occultations.star-position-receipt.v1", implementation: "sao-apparent-star/1",
    request: { star: source.id, time, observer, frame },
    engine: { name: "@zodiacs/engine", version: ENGINE_VERSION, ephemeris: { ...EPHEMERIS } },
    catalogue: catalogue.receipt, source, timeBasis: inside ? basis : null,
    conventions: [
      "time:engine-utc-basis", "propagation:TT-approximates-TDB;Julian-years",
      "catalogue:FK5-J2000;orientation-and-spin:Mignard-Froeschle-2000",
      "frame-bias:engine-ICRS-to-EQJ", "motion:rectilinear-tangent;observer-Roemer",
      "precession:engine-IAU2006", "nutation:engine-IAU2000B", "Earth-state:engine-barycentric",
      "parallax:omitted-unavailable;distance:null", "radial-velocity:omitted-unavailable",
      "aberration:relativistic-observer-velocity;no-solar-potential",
      "deflection:none", "refraction:none", "angles:degrees", "direction:unit-vector", `frame:${frame}`,
      observer === null ? "center:geocentric" : "observer:iers-2003-ellipsoid;elevation-metres;no-polar-motion"
    ],
    limitations: [...source.limitations, "FK5-zonal-errors-unmodelled", "TT-used-for-TDB",
      "solar-deflection-and-potential-omitted", "no-catalogue-accuracy-bound", "no-contact-time-accuracy-bound"],
    validation: "astrometric-reduction-tests;catalogue-and-contact-accuracy-unmeasured"
  };
  const done = (result: StarPositionResult): StarPositionResult => freeze(structuredClone(result));
  if (!inside) return done({ status: "refused", reason: "out-of-range", receipt });
  const pm = source.properMotion;
  if (pm.raCosDecMasPerYear === null || pm.decMasPerYear === null) {
    return done({ status: "refused", reason: "proper-motion-unavailable", receipt });
  }
  const star: Astrometry = {
    raDegrees: source.raDegrees, decDegrees: source.decDegrees, epochJulianYear: source.epochJulianYear,
    frame: source.frame, raCosDecMasPerYear: pm.raCosDecMasPerYear, decMasPerYear: pm.decMasPerYear,
    parallaxMas: source.parallaxMas, radialVelocityKmPerSecond: source.radialVelocityKmPerSecond
  };
  return onChartClock(ms, "utc", undefined, (at) => {
    const direction = stellarDirectionAt(star, at, observer, frame);
    return done({ status: "ok", star: source.id, frame, ...toSpherical(direction), direction, distanceAu: null, receipt });
  });
}
