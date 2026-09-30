/**
 * src/equator.ts, the frames of date that calc and sky turn vectors into,
 * against ERFA at the 101 TT instants of src/fixtures/nutation-erfa.json
 * (docs/evidence/nutation-2026-09-29/tools/erfa_fixtures.py): the fixture's
 * true ecliptic of date is Rz(−Δψ) Rx(εA) P with bp06's precession, obl06
 * and nut00b, so the true equator of date is Rx(−(εA + Δε)) times it, the
 * mean ecliptic Rz(Δψ) times it, and the mean equator Rx(−εA) times that.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { eclipticRows, equatorRows, turn } from "./equator.js";
import type { Rows } from "./equator.js";
import { eclipticOfDate } from "./frame.js";

const ERFA = JSON.parse(readFileSync(new URL("./fixtures/nutation-erfa.json", import.meta.url), "utf8")) as {
  tolerance: { rotationArcsec: number };
  epochs: { tt: number; dpsi: number; deps: number; epsA: number; eclipticOfDate: number[] }[];
};
const ARCSEC = Math.PI / 648_000;

/** ERFA's rotations (eraRx, eraRz) applied to a matrix's rows. */
function rx(angle: number, m: readonly number[]): number[] {
  const [c, s] = [Math.cos(angle), Math.sin(angle)];
  return [m[0]!, m[1]!, m[2]!, c * m[3]! + s * m[6]!, c * m[4]! + s * m[7]!, c * m[5]! + s * m[8]!, -s * m[3]! + c * m[6]!, -s * m[4]! + c * m[7]!, -s * m[5]! + c * m[8]!];
}
function rz(angle: number, m: readonly number[]): number[] {
  const [c, s] = [Math.cos(angle), Math.sin(angle)];
  return [c * m[0]! + s * m[3]!, c * m[1]! + s * m[4]!, c * m[2]! + s * m[5]!, -s * m[0]! + c * m[3]!, -s * m[1]! + c * m[4]!, -s * m[2]! + c * m[5]!, m[6]!, m[7]!, m[8]!];
}

const DIRECTIONS = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
  [0.36, -0.48, 0.8],
  [-0.6, 0.64, -0.48]
] as const;

/** The largest angle, arcseconds, between two rotations' images of the directions. */
function apart(a: readonly number[], b: readonly number[]): number {
  let worst = 0;
  for (const [x, y, z] of DIRECTIONS) {
    const u = turn(a as Rows, x, y, z);
    const v = turn(b as Rows, x, y, z);
    const cross = Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]);
    worst = Math.max(worst, Math.atan2(cross, u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / ARCSEC);
  }
  return worst;
}

describe("the frames of date in src/equator.ts", () => {
  const { rotationArcsec } = ERFA.tolerance;

  it("match ERFA's true and mean ecliptic and equator of date within the fixture's rotation tolerance", () => {
    const worst = { eclipticTrue: 0, eclipticMean: 0, equatorTrue: 0, equatorMean: 0 };
    for (const epoch of ERFA.epochs) {
      const trueEcliptic = epoch.eclipticOfDate;
      const meanEcliptic = rz(epoch.dpsi * ARCSEC, trueEcliptic);
      worst.eclipticTrue = Math.max(worst.eclipticTrue, apart(eclipticRows(epoch.tt, "true"), trueEcliptic));
      worst.eclipticMean = Math.max(worst.eclipticMean, apart(eclipticRows(epoch.tt, "mean"), meanEcliptic));
      worst.equatorTrue = Math.max(worst.equatorTrue, apart(equatorRows(epoch.tt, "true"), rx(-(epoch.epsA + epoch.deps) * ARCSEC, trueEcliptic)));
      worst.equatorMean = Math.max(worst.equatorMean, apart(equatorRows(epoch.tt, "mean"), rx(-epoch.epsA * ARCSEC, meanEcliptic)));
    }
    for (const [frame, value] of Object.entries(worst)) expect(value, frame).toBeLessThanOrEqual(rotationArcsec);
  });

  it("are rotations, and put the true ecliptic's longitudes where src/frame.ts puts them", () => {
    for (const epoch of ERFA.epochs.filter((_, index) => index % 10 === 0)) {
      for (const kind of ["true", "mean"] as const) {
        for (const m of [eclipticRows(epoch.tt, kind), equatorRows(epoch.tt, kind)]) {
          for (let i = 0; i < 3; i += 1) {
            for (let j = 0; j < 3; j += 1) {
              const dot = m[3 * i]! * m[3 * j]! + m[3 * i + 1]! * m[3 * j + 1]! + m[3 * i + 2]! * m[3 * j + 2]!;
              expect(Math.abs(dot - (i === j ? 1 : 0))).toBeLessThan(1e-15);
            }
          }
        }
      }
      for (const [x, y, z] of DIRECTIONS) {
        const [ex, ey, ez] = turn(eclipticRows(epoch.tt, "true"), x, y, z);
        const { lon, lat } = eclipticOfDate(x, y, z, epoch.tt);
        const along = ((((Math.atan2(ey, ex) * 180) / Math.PI - lon) % 360) + 540) % 360 - 180;
        expect(Math.abs(along) * 3600).toBeLessThan(1e-9);
        expect(Math.abs((Math.asin(ez / Math.hypot(ex, ey, ez)) * 180) / Math.PI - lat) * 3600).toBeLessThan(1e-9);
      }
    }
  });
});
