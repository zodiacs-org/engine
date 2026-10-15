import { describe, expect, it } from "vitest";
import type { Vec3 } from "../../src/calc-frames.js";
import { apply, transpose } from "../../src/calc-frames.js";
import type { Mat3 } from "../../src/calc-frames.js";
import { aberrate, C_AU_PER_DAY, catalogueState, fk5ToIcrs, propagateAstrometry } from "../src/astrometry.js";
import published from "./fixtures/erfa-published.json" with { type: "json" };

const RAD = 180 / Math.PI;
const MAS = Math.PI / (180 * 3600 * 1000);
const asVec = (values: readonly number[]): Vec3 => values as Vec3;

function angularError(a: Vec3, b: Vec3): number {
  const x = a[1] * b[2] - a[2] * b[1];
  const y = a[2] * b[0] - a[0] * b[2];
  const z = a[0] * b[1] - a[1] * b[0];
  return Math.atan2(Math.hypot(x, y, z), a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) * RAD * 3600;
}

describe("published independent ERFA validation values", () => {
  it("matches the published FK5 orientation matrix and spin convention", () => {
    const reference = published.fk5hip;
    const axes: Vec3[] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    for (let column = 0; column < 3; column++) {
      const actual = fk5ToIcrs(axes[column]!);
      for (let row = 0; row < 3; row++) {
        expect(Math.abs(actual[row]! - reference.rotationRows[row]![column]!)).toBeLessThanOrEqual(reference.maximumRotationElementError);
      }
    }
    const back = transpose(reference.rotationRows.flat() as unknown as Mat3);
    // Recover the spin terms from the motion induced on independent equatorial axes.
    const motionX = apply(back, catalogueState({
      raDegrees: 0, decDegrees: 0, epochJulianYear: 2000, frame: "FK5-J2000",
      raCosDecMasPerYear: 0, decMasPerYear: 0, parallaxMas: null, radialVelocityKmPerSecond: null
    }).motionPerYear);
    const motionY = apply(back, catalogueState({
      raDegrees: 90, decDegrees: 0, epochJulianYear: 2000, frame: "FK5-J2000",
      raCosDecMasPerYear: 0, decMasPerYear: 0, parallaxMas: null, radialVelocityKmPerSecond: null
    }).motionPerYear);
    const spin = [-motionY[2], motionX[2], -motionX[1]];
    for (let i = 0; i < 3; i++) expect(Math.abs(spin[i]! - reference.spinRadiansPerYear[i]!))
      .toBeLessThanOrEqual(reference.maximumSpinComponentErrorRadiansPerYear);
  });

  it("matches published proper-motion, parallax and radial-motion reduction", () => {
    const reference = published.pmpx;
    const direction = propagateAstrometry({
      raDegrees: reference.raRadians * RAD, decDegrees: reference.decRadians * RAD,
      epochJulianYear: 2000, frame: "ICRS",
      raCosDecMasPerYear: reference.raRateRadiansPerYear * Math.cos(reference.decRadians) / MAS,
      decMasPerYear: reference.decRateRadiansPerYear / MAS,
      parallaxMas: reference.parallaxArcseconds * 1000, radialVelocityKmPerSecond: reference.radialVelocityKmPerSecond
    }, reference.elapsedJulianYears * 365.25, asVec(reference.observerBarycentricAu));
    expect(angularError(direction, asVec(reference.expectedDirection))).toBeLessThanOrEqual(reference.maximumAngularErrorArcseconds);
  });

  it("matches published aberration within the preregistered omitted-potential allowance", () => {
    const reference = published.ab;
    const direction = aberrate(asVec(reference.naturalDirection),
      asVec(reference.observerVelocityOverC.map((v) => v * C_AU_PER_DAY)));
    expect(angularError(direction, asVec(reference.expectedDirection))).toBeLessThanOrEqual(reference.maximumAngularErrorArcseconds);
  });
});
