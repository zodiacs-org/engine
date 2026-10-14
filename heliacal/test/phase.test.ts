import { describe, expect, it } from "vitest";

import { calc } from "../../src/calc.js";
import {
  VISIBILITY_BODIES, enginePosition, illuminationGeometry, phase, synodicPhase
} from "../src/index.js";

const AT = "2001-02-03T04:05:06.007Z";
const SITE = { latitude: 13, longitude: -42, height: 120 };
const RAD = Math.PI / 180;

describe("longitude synodic phase", () => {
  // USNO, Phases of the Moon: apparent ecliptic longitude differences of
  // 0, 90, 180 and 270 degrees define new, first quarter, full and last quarter.
  // https://aa.usno.navy.mil/faq/moon_phases
  // These are definition checks, not dates or independent ephemeris evidence.
  it.each([
    [0, "conjunction", 0],
    [90, "evening-star", 90],
    [180, "opposition", 180],
    [270, "morning-star", -90]
  ] as const)("uses the USNO longitude definition at %s degrees", (target, classification, signed) => {
    expect(synodicPhase(target, 0)).toEqual({ signedSynodicAngleDeg: signed, classification });
  });

  it.each([
    [0, 0, 0, "conjunction"], [42, 42, 0, "conjunction"],
    [-0, 0, 0, "conjunction"], [0, -0, 0, "conjunction"],
    [180, 0, 180, "opposition"], [0, 180, 180, "opposition"],
    [359, 179, 180, "opposition"], [179, 359, 180, "opposition"],
    [1, 359, 2, "evening-star"], [359, 1, -2, "morning-star"]
  ] as const)("handles exact boundaries and wrapping for %s minus %s", (target, sun, angle, classification) => {
    const result = synodicPhase(target, sun);
    expect(result).toEqual({ signedSynodicAngleDeg: angle, classification });
    expect(Object.is(result.signedSynodicAngleDeg, -0)).toBe(false);
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("does not collapse nearby longitudes into an equality boundary", () => {
    const epsilon = 1e-12;
    expect(synodicPhase(epsilon, 0)).toEqual({ signedSynodicAngleDeg: epsilon, classification: "evening-star" });
    expect(synodicPhase(0, epsilon)).toEqual({ signedSynodicAngleDeg: -epsilon, classification: "morning-star" });
    expect(synodicPhase(180 - epsilon, 0).classification).toBe("evening-star");
    expect(synodicPhase(180 + epsilon, 0).classification).toBe("morning-star");
    expect(synodicPhase(0, 180 - epsilon).classification).toBe("morning-star");
    expect(synodicPhase(0, 180 + epsilon).classification).toBe("evening-star");
    expect(synodicPhase(360 - epsilon, 0).classification).toBe("morning-star");
    expect(synodicPhase(0, 360 - epsilon).classification).toBe("evening-star");
  });

  it.each([-1, -Number.MIN_VALUE, 360, 720, NaN, Infinity, -Infinity, "0", null, undefined, {}, 0n])(
    "rejects an invalid longitude %s in either argument", (value) => {
      expect(() => synodicPhase(value as number, 0)).toThrow(RangeError);
      expect(() => synodicPhase(0, value as number)).toThrow(RangeError);
    }
  );
});

// Independently known Euclidean identities test this helper. They are not
// observational accuracy claims about the engine or a visibility model.
describe("simultaneous triangle illumination", () => {
  it.each([
    [0, 1, 0.5, 180, 0, 0.5], // Target between observer and Sun.
    [0, 1, 2, 0, 1, 1], // Sun between observer and target.
    [180, 1, 2, 0, 1, 3], // Observer between Sun and target.
    [60, 1, 1, 60, 0.75, 1], // Equilateral triangle.
    [60, 1, 0.5, 90, 0.5, Math.sqrt(3) / 2] // Right angle at target.
  ])("satisfies the exact identity at elongation %s and distances %s, %s", (elongation, sun, target, angle, fraction, distance) => {
    const result = illuminationGeometry(elongation!, sun!, target!);
    expect(result.geometricElongationDeg).toBe(elongation);
    expect(result.phaseAngleDeg).toBeCloseTo(angle!, 12);
    expect(result.illuminatedFraction).toBeCloseTo(fraction!, 14);
    expect(result.sunTargetDistanceAu).toBeCloseTo(distance!, 14);
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("satisfies the 3-4-5 right triangle with a right angle at the observer", () => {
    const result = illuminationGeometry(90, 3, 4);
    expect(result.sunTargetDistanceAu).toBeCloseTo(5, 14);
    expect(result.phaseAngleDeg).toBeCloseTo(Math.acos(4 / 5) / RAD, 12);
    expect(result.illuminatedFraction).toBeCloseTo(0.9, 14);
  });

  it.each([[37, 1.1, 0.6], [121, 0.8, 3.7], [168, 1.7, 0.3], [75, 1, 1]])(
    "matches independently evaluated cosine laws for %s degrees and distances %s, %s", (elongation, sun, target) => {
      const distanceSquared = sun! ** 2 + target! ** 2 - 2 * sun! * target! * Math.cos(elongation! * RAD);
      const distance = Math.sqrt(distanceSquared);
      const cosine = (target! ** 2 + distanceSquared - sun! ** 2) / (2 * target! * distance);
      const result = illuminationGeometry(elongation!, sun!, target!);
      expect(result.sunTargetDistanceAu).toBeCloseTo(distance, 13);
      expect(result.phaseAngleDeg).toBeCloseTo(Math.acos(cosine) / RAD, 12);
      expect(result.illuminatedFraction).toBeCloseTo((1 + cosine) / 2, 14);
    }
  );

  it("retains the isosceles small-angle chord and a nonzero thin crescent", () => {
    const elongation = 1e-10;
    const equalRanges = illuminationGeometry(elongation, 1, 1);
    const exactChord = 2 * Math.sin(elongation * RAD / 2);
    expect(equalRanges.sunTargetDistanceAu / exactChord).toBeCloseTo(1, 14);
    expect(equalRanges.phaseAngleDeg).toBeCloseTo(90 - elongation / 2, 12);
    expect(equalRanges.illuminatedFraction).toBeCloseTo((1 + Math.sin(elongation * RAD / 2)) / 2, 14);

    const small = 1e-7;
    const crescent = illuminationGeometry(small, 1, 0.5);
    // With distances 1 and 1/2, the leading term of the lit fraction at
    // conjunction is elongation squared in radians. Terms beyond it are O(e^4).
    expect(crescent.illuminatedFraction).toBeGreaterThan(0);
    expect(crescent.illuminatedFraction / (small * RAD) ** 2).toBeCloseTo(1, 12);
    expect(crescent.phaseAngleDeg).toBeLessThan(180);
  });

  it("retains the original range difference in a nearly coincident triangle", () => {
    const sun = 3;
    const target = 3.0000000000000004;
    const gap = target - sun;
    // The transverse displacement is gap to floating-point precision.
    // Along and transverse sides are equal, giving a 45-degree phase angle.
    const elongation = (gap / sun) / RAD;
    const result = illuminationGeometry(elongation, sun, target);
    expect(result.phaseAngleDeg).toBeCloseTo(45, 12);
    expect(result.illuminatedFraction).toBeCloseTo((1 + Math.SQRT1_2) / 2, 14);
    expect(result.sunTargetDistanceAu / (Math.SQRT2 * gap)).toBeCloseTo(1, 14);
  });

  it("keeps a representable isosceles chord when conversion to radians would underflow", () => {
    const elongation = Number.MIN_VALUE;
    const range = 1e308;
    // Here 2 R sin(e/2) = R e to floating-point precision. Multiplication by
    // the range first retains the chord even though e * RAD rounds to zero.
    const chord = (elongation * range) * RAD;
    const result = illuminationGeometry(elongation, range, range);
    expect(chord).toBeGreaterThan(0);
    expect(result.sunTargetDistanceAu / chord).toBeCloseTo(1, 14);
    expect(result.phaseAngleDeg).toBe(90);
    expect(result.illuminatedFraction).toBe(0.5);
  });

  it.each([1e-200, 1e-12, 1, 1e12, 1e200])("is invariant under distance scaling by %s", (scale) => {
    const result = illuminationGeometry(90, 3 * scale, 4 * scale);
    expect(result.sunTargetDistanceAu / scale).toBeCloseTo(5, 13);
    expect(result.phaseAngleDeg).toBeCloseTo(Math.acos(4 / 5) / RAD, 12);
    expect(result.illuminatedFraction).toBeCloseTo(0.9, 14);
  });

  it("canonicalizes negative zero elongation", () => {
    expect(Object.is(illuminationGeometry(-0, 1, 2).geometricElongationDeg, 0)).toBe(true);
  });

  it.each([NaN, Infinity, -Infinity, "1", null, undefined, {}, 1n])("rejects nonfinite or nonnumeric input %s", (value) => {
    expect(() => illuminationGeometry(value as number, 1, 2)).toThrow(RangeError);
    expect(() => illuminationGeometry(60, value as number, 2)).toThrow(RangeError);
    expect(() => illuminationGeometry(60, 1, value as number)).toThrow(RangeError);
  });

  it.each([
    [-1, 1, 2], [181, 1, 2], [60, 0, 2], [60, 1, 0], [60, -1, 2], [60, 1, -2],
    [0, 1, 1], [180, Number.MAX_VALUE, Number.MAX_VALUE],
    [1e-10, Number.MIN_VALUE, Number.MIN_VALUE]
  ])("rejects invalid or unrepresentable triangle (%s, %s, %s)", (elongation, sun, target) => {
    expect(() => illuminationGeometry(elongation!, sun!, target!)).toThrow(RangeError);
  });
});

// Integration checks below establish wiring and receipt preservation. They do
// not treat this package's own positions as independent accuracy evidence.
describe("phase from engine positions", () => {
  it.each(VISIBILITY_BODIES)("preserves apparent and geometric position receipts for %s", (body) => {
    const result = phase(body, AT, SITE);
    if (result.status !== "ok") throw new Error(result.detail);
    expect(result.body).toBe(body);
    expect(result.at).toBe(AT);
    expect(result.observer).toEqual(SITE);
    expect(result.receiptScope).toBe("positions");
    expect(result.units).toEqual({ angles: "degrees", distances: "au", observerHeight: "metres", illuminatedFraction: "fraction" });
    expect(result.conventions.classification).toBe("longitude-only;east-evening;west-morning;not-visibility");
    expect(Object.isFrozen(result)).toBe(true);
    for (const center of ["geocentric", "topocentric"] as const) {
      const current = result[center];
      const pair = result.geometry[center];
      expect(current.elongationDeg).toBe(pair.elongationDeg);
      expect(current.signedSynodicAngleDeg).toBe(synodicPhase(pair.target.ecliptic.lon, pair.sun.ecliptic.lon).signedSynodicAngleDeg);
      expect(current.classification).toBe(synodicPhase(pair.target.ecliptic.lon, pair.sun.ecliptic.lon).classification);
      expect(current.illumination.phaseAngleDeg).toBeGreaterThanOrEqual(0);
      expect(current.illumination.phaseAngleDeg).toBeLessThanOrEqual(180);
      expect(current.illumination.illuminatedFraction).toBeGreaterThanOrEqual(0);
      expect(current.illumination.illuminatedFraction).toBeLessThanOrEqual(1);
      for (const [key, name] of [["sun", "Sun"], ["target", body]] as const) {
        const position = current.illumination.positions[key];
        const expected = calc({
          body: name, time: AT, frame: "ecliptic-true-of-date",
          center: center === "geocentric" ? "geocentric" : { topocentric: SITE }, zodiac: "tropical",
          flags: { correction: "geometric", speeds: false, cartesian: true, units: "degrees", deflection: false }
        });
        expect(position).toEqual(expected);
        expect(position.receipt.request.flags?.correction).toBe("geometric");
        expect(position.receipt.instants[0]?.utc).toBe(AT);
        expect(pair[key].ecliptic).toEqual(enginePosition(name, AT, {
          frame: "ecliptic-true-of-date", ...(center === "topocentric" ? { observer: SITE } : {})
        }));
        expect(pair[key].ecliptic.receipt.request.flags?.correction).toBe("apparent");
      }
      expect(Object.isFrozen(current)).toBe(true);
      expect(Object.isFrozen(current.illumination)).toBe(true);
      expect(Object.isFrozen(current.illumination.positions)).toBe(true);
    }
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it("keeps geocentric phase site independent and topocentric lunar phase site dependent", () => {
    const a = phase("Moon", AT, SITE);
    const b = phase("Moon", AT, { latitude: -13, longitude: 138, height: 3000 });
    if (a.status !== "ok" || b.status !== "ok") throw new Error("Unexpected refusal");
    expect(a.geocentric).toEqual(b.geocentric);
    expect(a.topocentric.signedSynodicAngleDeg).not.toBe(b.topocentric.signedSynodicAngleDeg);
    expect(a.topocentric.elongationDeg).not.toBe(b.topocentric.elongationDeg);
    expect(a.topocentric.illumination.phaseAngleDeg).not.toBe(b.topocentric.illumination.phaseAngleDeg);
  });

  it("normalizes equivalent UTC instants and copies the observing inputs", () => {
    const at = new Date(AT);
    const site = { latitude: SITE.latitude, longitude: SITE.longitude };
    const result = phase("Moon", at, site);
    const normalized = phase("Moon", "2001-02-03T11:05:06.007+07:00", site);
    expect(result).toEqual(normalized);
    expect(result).toEqual(phase("Moon", at.getTime(), site));
    expect(site).toEqual({ latitude: SITE.latitude, longitude: SITE.longitude });
    expect(at.toISOString()).toBe(AT);
    if (result.status !== "ok") throw new Error(result.detail);
    expect(result.observer.height).toBe(0);
    at.setTime(0);
    site.latitude = 0;
    expect(result.at).toBe(AT);
    expect(result.observer.latitude).toBe(SITE.latitude);
    expect(Object.isFrozen(result.observer)).toBe(true);
  });

  it.each(["1750-02-03", "2200-01-01", "+030000-01-01"])("preserves the engine refusal at %s", (at) => {
    const expected = enginePosition("Sun", at, { frame: "equatorial-true-of-date" });
    expect(expected.status).toBe("refused");
    expect(phase("Moon", at, SITE)).toEqual(expected);
  });

  it.each(["Sun", "Uranus", "moon", null, undefined, {}])("rejects invalid body %s", (body) => {
    expect(() => phase(body as never, AT, SITE)).toThrow(RangeError);
  });

  it.each([
    null, {}, { latitude: 91, longitude: 0 }, { latitude: 0, longitude: 181 },
    { latitude: NaN, longitude: 0 }, { ...SITE, height: Infinity }, { ...SITE, pressure: 1000 }
  ])("rejects invalid observer %j", (site) => {
    expect(() => phase("Moon", AT, site as never)).toThrow(RangeError);
  });

  it.each(["2001-02-03T04:05:06", "2001-02-30", "not a date", NaN, Infinity, new Date(NaN), null])(
    "rejects invalid or unresolved date %s", (at) => {
      expect(() => phase("Moon", at as never, SITE)).toThrow(RangeError);
    }
  );
});
