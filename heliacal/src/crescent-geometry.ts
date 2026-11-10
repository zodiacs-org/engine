import { SKY_RADII_KM } from "../../src/sky/riseset.js";
import type { SunBodyGeometry } from "./geometry.js";
import type { OdehGeometry } from "./odeh.js";
import type { YallopGeometry } from "./yallop.js";

/** Constants shared with the engine's conventions; primary sources in SOURCES.md. */
export const CRESCENT_GEOMETRY_CONSTANTS = Object.freeze({
  earthEquatorialRadiusKm: 6_378.1366,
  moonMeanRadiusKm: SKY_RADII_KM.Moon,
  kilometresPerAu: 149_597_870.7
} as const);

export const CRESCENT_GEOMETRY_CONVENTIONS = Object.freeze({
  parallax: "equatorial-horizontal;asin-iers2003-equatorial-radius-over-geocentric-moon-range;arcminutes",
  yallop: "airless-geocentric-altitudes-and-elongation;Yallop-eq3.8-3.10-width-in-criterion",
  semidiameter: "asin-engine-mean-lunar-radius-over-topocentric-moon-range;arcminutes",
  odehWidth: "topocentric-semidiameter-times-one-minus-cos-topocentric-elongation;arcminutes",
  widthApproximation: "library-distant-sun-angular-width-approximation;not-finite-sun-phase-disk-fraction",
  positions: "supplied-engine-apparent-geometry;no-new-position-or-frame-calculation",
  receiptScope: "none;derived-from-caller-supplied-geometry;not-authenticated"
} as const);

export interface CrescentGeometry {
  readonly yallop: Readonly<YallopGeometry>;
  readonly odeh: Readonly<OdehGeometry>;
  readonly moonHorizontalParallaxArcmin: number;
  readonly moonTopocentricSemidiameterArcmin: number;
  readonly crescentWidthTopocentricArcmin: number;
  readonly conventions: typeof CRESCENT_GEOMETRY_CONVENTIONS;
  readonly constants: typeof CRESCENT_GEOMETRY_CONSTANTS;
}

function angle(value: unknown, low: number, high: number, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < low || value > high) {
    throw new RangeError(`${label} must be a finite number in [${low}, ${high}].`);
  }
  return value === 0 ? 0 : value;
}

function angularRadius(rangeAu: unknown, radiusKm: number, label: string): number {
  const radiusAu = radiusKm / CRESCENT_GEOMETRY_CONSTANTS.kilometresPerAu;
  if (typeof rangeAu !== "number" || !Number.isFinite(rangeAu) || rangeAu <= radiusAu) {
    throw new RangeError(`${label} must be a positive finite distance in au greater than the reference radius.`);
  }
  // Divide the radius first, so multiplying an extreme finite range by the
  // au conversion cannot overflow. The engine's lunar range is well within it.
  const radians = Math.asin(radiusAu / rangeAu);
  const arcminutes = radians * (180 / Math.PI) * 60;
  if (!(arcminutes > 0) || !Number.isFinite(arcminutes)) {
    throw new RangeError(`${label} does not give a positive finite angular radius.`);
  }
  return arcminutes;
}

/**
 * Prepare the distinct lunar geometries required by Yallop and Odeh.
 * Yallop retains geocentric separation and its own semidiameter correction.
 * Odeh receives topocentric airless altitudes and the explicit distant-Sun
 * angular-width approximation SD * (1-cos(elongation)). This adapter does not
 * claim that Odeh publishes that width algorithm, and does not substitute the
 * finite-Sun illumination fraction from phase(). See SOURCES.md.
 * The caller retains the original geometry and its engine position receipts.
 */
export function crescentGeometry(geometry: SunBodyGeometry): Readonly<CrescentGeometry> {
  if (geometry === null || typeof geometry !== "object" || geometry.status !== "ok" || geometry.body !== "Moon") {
    throw new RangeError("Crescent geometry requires successful Moon geometry.");
  }
  const geo = geometry.geocentric;
  const topo = geometry.topocentric;
  const moonHorizontalParallaxArcmin = angularRadius(
    geo?.target?.equatorial?.dist, CRESCENT_GEOMETRY_CONSTANTS.earthEquatorialRadiusKm,
    "Geocentric Moon range"
  );
  const moonTopocentricSemidiameterArcmin = angularRadius(
    topo?.target?.equatorial?.dist, CRESCENT_GEOMETRY_CONSTANTS.moonMeanRadiusKm,
    "Topocentric Moon range"
  );
  const elongationTopocentricDeg = angle(topo?.elongationDeg, 0, 180, "Topocentric elongation");
  const sineHalf = Math.sin(elongationTopocentricDeg * Math.PI / 360);
  const crescentWidthTopocentricArcmin = moonTopocentricSemidiameterArcmin * (2 * sineHalf * sineHalf);
  const yallop = Object.freeze({
    moonAltitudeGeocentricDeg: angle(geo?.target?.horizontal?.altitudeDeg, -90, 90, "Geocentric Moon altitude"),
    sunAltitudeGeocentricDeg: angle(geo?.sun?.horizontal?.altitudeDeg, -90, 90, "Geocentric Sun altitude"),
    elongationGeocentricDeg: angle(geo?.elongationDeg, 0, 180, "Geocentric elongation"),
    moonHorizontalParallaxArcmin
  });
  const odeh = Object.freeze({
    moonAltitudeTopocentricDeg: angle(topo?.target?.horizontal?.altitudeDeg, -90, 90, "Topocentric Moon altitude"),
    sunAltitudeTopocentricDeg: angle(topo?.sun?.horizontal?.altitudeDeg, -90, 90, "Topocentric Sun altitude"),
    crescentWidthTopocentricArcmin
  });
  return Object.freeze({
    yallop, odeh, moonHorizontalParallaxArcmin, moonTopocentricSemidiameterArcmin,
    crescentWidthTopocentricArcmin, conventions: CRESCENT_GEOMETRY_CONVENTIONS,
    constants: CRESCENT_GEOMETRY_CONSTANTS
  });
}
