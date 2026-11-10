import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { AstroTime } from "astronomy-engine";
import { describe, expect, it } from "vitest";
import type { Vec3 } from "../../src/calc-frames.js";
import { aberrate, C_AU_PER_DAY, propagateAstrometry } from "../src/astrometry.js";
import { starCatalogue } from "../src/catalogue.js";
import { stellarDirectionAt } from "../src/star-position.js";
import cases from "./fixtures/astrometry-cases.json" with { type: "json" };

// Missing generated references are a failure. Run via npm run test:astrometry.
const generated = JSON.parse(readFileSync(new URL("../.generated/astrometry-erfa.json", import.meta.url), "utf8")) as {
  receipt: { casesSha256: string; saoSourceSha256: string; generatorSha256: string; pyerfa: string; numpy: string };
  maximumErrorArcseconds: typeof cases.maximumErrorArcseconds;
  epochs: { label: string; ttDaysFromJ2000: number; referenceEphemerisWarnings: string[] }[];
  propagation: { id: string; expectedDirection: Vec3 }[];
  fk5Spin: { id: string; expectedDirection: Vec3 }[];
  aberration: { id: string; expectedDirection: Vec3 }[];
  apparent: { epoch: string; sao: number; expectedDirection: Vec3 }[];
};
const vec = (value: readonly number[]): Vec3 => value as Vec3;
const sha256 = (relative: string): string => createHash("sha256")
  .update(readFileSync(new URL(relative, import.meta.url))).digest("hex");

function errorArcseconds(a: Vec3, b: Vec3): number {
  const cross = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  return Math.atan2(Math.hypot(...cross), a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) * 180 * 3600 / Math.PI;
}

describe("preregistered independent ERFA reductions", () => {
  it("requires fresh generated references and every preregistered case", () => {
    expect(generated.receipt.casesSha256).toBe(sha256("./fixtures/astrometry-cases.json"));
    expect(generated.receipt.saoSourceSha256).toBe(sha256("../data/sao-source.json"));
    expect(generated.receipt.generatorSha256).toBe(sha256("../scripts/astrometry-reference.py"));
    expect(generated.receipt.pyerfa).toBe(cases.versions.pyerfa);
    expect(generated.receipt.numpy).toBe(cases.versions.numpy);
    expect(generated.maximumErrorArcseconds).toEqual(cases.maximumErrorArcseconds);
    expect(generated.epochs.map((e) => e.label)).toEqual(cases.epochs.map((e) => e.label));
    expect(generated.epochs.map((e) => e.referenceEphemerisWarnings.length > 0)).toEqual(cases.epochs.map((e) => e.referenceEphemerisWarning));
    expect(generated.propagation.map((r) => r.id)).toEqual(cases.propagation.map((r) => r.id));
    expect(generated.fk5Spin.map((r) => r.id)).toEqual(cases.propagation.map((r) => r.id));
    expect(generated.aberration.map((r) => r.id)).toEqual(cases.aberration.map((r) => r.id));
    expect(generated.apparent.map((r) => [r.epoch, r.sao])).toEqual(
      cases.epochs.flatMap((e) => cases.saoIdentifiers.map((sao) => [e.label, sao])));
  });

  it.each(cases.propagation)("checks ICRS propagation: $id", (row) => {
    const expected = generated.propagation.find((r) => r.id === row.id)!.expectedDirection;
    const actual = propagateAstrometry({ ...row, epochJulianYear: 2000, frame: "ICRS" },
      row.elapsedJulianYears * 365.25, vec(row.observerBarycentricAu));
    expect(errorArcseconds(actual, expected)).toBeLessThanOrEqual(cases.maximumErrorArcseconds.propagation);
  });

  it.each(cases.propagation)("checks FK5 spin on a propagated direction: $id", (row) => {
    const expected = generated.fk5Spin.find((r) => r.id === row.id)!.expectedDirection;
    const actual = propagateAstrometry({ ...row, epochJulianYear: 2000, frame: "FK5-J2000",
      parallaxMas: null, radialVelocityKmPerSecond: null }, row.elapsedJulianYears * 365.25, [0, 0, 0]);
    expect(errorArcseconds(actual, expected)).toBeLessThanOrEqual(cases.maximumErrorArcseconds.fk5Spin);
  });

  it.each(cases.aberration)("checks relativistic aberration: $id", (row) => {
    const expected = generated.aberration.find((r) => r.id === row.id)!.expectedDirection;
    const actual = aberrate(vec(row.direction), vec(row.observerVelocityOverC.map((v) => v * C_AU_PER_DAY)));
    expect(errorArcseconds(actual, expected)).toBeLessThanOrEqual(cases.maximumErrorArcseconds.aberration);
  });

  it("checks all selected SAO directions at all fixed epochs against independent Earth and frame models", () => {
    const catalogue = starCatalogue();
    for (const row of generated.apparent) {
      const source = catalogue.stars.find((s) => s.sao === row.sao)!;
      const epoch = generated.epochs.find((e) => e.label === row.epoch)!;
      const actual = stellarDirectionAt({ ...source,
        raCosDecMasPerYear: source.properMotion.raCosDecMasPerYear!,
        decMasPerYear: source.properMotion.decMasPerYear!
      }, AstroTime.FromTerrestrialTime(epoch.ttDaysFromJ2000), null, "equatorial-true-of-date");
      expect(errorArcseconds(actual, row.expectedDirection), `${row.epoch} ${source.id}`)
        .toBeLessThanOrEqual(cases.maximumErrorArcseconds.apparent);
    }
  });
});
