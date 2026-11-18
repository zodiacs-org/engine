import { moonPhase } from "../../src/api.js";
import { gastHours, onChartClock } from "../../src/ephemeris.js";
import { SKY_RADII_KM } from "../../src/sky.js";
import type { TimeBasis } from "../../src/time-scale.js";
import { AU_KM } from "./astrometry.js";
import type { PositionReceipt, PositionResult } from "./engine.js";
import type { NormalizedObserver } from "./input.js";
import type { StarPositionResult, StarPositionReceipt } from "./star-position.js";
import { CONTACT_SKY_MODEL, equatorialDirection, horizontalFacts, limbGeometry } from "./sky-geometry.js";
import type { HorizontalFacts, LimbGeometry } from "./sky-geometry.js";

type Position = Extract<PositionResult, { readonly status: "ok" }>;
type StarPosition = Extract<StarPositionResult, { readonly status: "ok" }>;

export interface ContactSkyFacts extends Omit<LimbGeometry, "contactDirection"> {
  readonly moon: HorizontalFacts;
  readonly sun: HorizontalFacts;
  /** Altitude of the target-facing lunar tangent, not either disk center. */
  readonly contactPoint: HorizontalFacts | null;
  readonly moonPhase: {
    readonly elongationDegrees: number;
    readonly approximateIlluminatedFraction: number;
    readonly name: ReturnType<typeof moonPhase>["name"];
    readonly waxing: boolean;
  };
  readonly receipt: {
    readonly schema: "zodiacs.occultations.contact-sky-receipt.v1";
    readonly implementation: "contact-sky/1";
    readonly request: { readonly at: string; readonly observer: NormalizedObserver };
    readonly engine: PositionReceipt["engine"];
    readonly timeBasis: TimeBasis;
    readonly moon: PositionReceipt;
    readonly target: PositionReceipt | StarPositionReceipt;
    readonly sun: PositionReceipt;
    readonly localApparentSiderealDegrees: number;
    readonly model: typeof CONTACT_SKY_MODEL;
    readonly conventions: readonly string[];
    readonly limitations: readonly string[];
  };
}

/** Internal assembly; the caller validates samples and charges the shared budget. */
export function contactSkyFacts(at: string, observer: NormalizedObserver, moon: Position,
  target: Position | StarPosition, sun: Position): ContactSkyFacts {
  if (moon.dist === null || sun.dist === null) throw new RangeError("Sky facts require Moon and Sun ranges.");
  const u = equatorialDirection(moon), v = equatorialDirection(target), s = equatorialDirection(sun);
  const moonDistance = moon.dist * AU_KM, sunDistance = sun.dist * AU_KM;
  const limb = limbGeometry(u, v, s, moonDistance, sunDistance);
  const phase = moonPhase(at);
  return onChartClock(Date.parse(at), "utc", undefined, (clock, basis) => {
    const theta = ((gastHours(clock) * 15 + observer.longitude) % 360 + 360) % 360;
    const horizontal = (direction: typeof u, radius: number) => horizontalFacts(direction, observer.latitude, theta, radius);
    const { contactDirection, ...illumination } = limb;
    return {
      ...illumination,
      moon: horizontal(u, Math.asin(SKY_RADII_KM.Moon / moonDistance) * 180 / Math.PI),
      sun: horizontal(s, Math.asin(SKY_RADII_KM.Sun / sunDistance) * 180 / Math.PI),
      contactPoint: contactDirection === null ? null : horizontal(contactDirection, 0),
      moonPhase: { elongationDegrees: phase.angle, approximateIlluminatedFraction: phase.illumination,
        name: phase.name, waxing: phase.waxing },
      receipt: {
        schema: "zodiacs.occultations.contact-sky-receipt.v1", implementation: "contact-sky/1",
        request: { at, observer }, engine: moon.receipt.engine, timeBasis: basis,
        moon: moon.receipt, target: target.receipt, sun: sun.receipt, localApparentSiderealDegrees: theta,
        model: CONTACT_SKY_MODEL,
        conventions: ["positions:parent-contact-adapters;sun:engine-apparent-topocentric",
          "axes:true-equator-and-equinox-of-date;sidereal:engine-gastHours-onChartClock",
          "position-angle:celestial-north-through-east-at-moon;undefined-at-pole-or-collinearity",
          "limb:target-facing-sphere-tangent;bright:solar-disk-fully-above-local-tangent-plane;dark:fully-below;terminator:straddling-or-touching",
          "horizon:local-ellipsoid-normal;calc-iers-2003-observer;no-dip;no-terrain",
          "altitude:geometric-unrefracted;azimuth:north-through-east;undefined-at-geographic-poles-or-zenith-nadir",
          "refracted-altitude:astronomy-engine-Refraction-normal;sea-level;nonnegative-lift;null-below-minus-one-degree",
          "standard-horizon:engine-sky-34-arcmin-plus-upper-limb;contact-point:zero-radius;strictly-positive-margin",
          "phase:engine-moonPhase;geocentric-ecliptic-elongation;fraction:(1-cos(elongation))/2",
          "contact-equation:vacuum;sky-facts-do-not-alter-times-or-filter-contacts"],
        limitations: ["no-general-physical-angle-altitude-phase-or-limb-error-bound",
          "illumination:simultaneous-apparent-sphere-vectors;no-separate-sun-to-moon-light-time",
          "no-earth-shadow-lunar-eclipse-solar-occultation-relief-or-photometric-model",
          "refraction:nominal-sea-level;no-weather-height-or-differential-refraction-model",
          "standard-horizon-test-is-not-the-altitude-dependent-refraction-formula",
          "phase-fraction-is-elongation-approximation-not-finite-distance-3d-illumination",
          "horizon-and-daylight-facts-do-not-establish-detectability"]
      }
    };
  });
}
