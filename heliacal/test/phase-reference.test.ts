import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { phase } from "../src/index.js";
import type { Observer, VisibilityBody } from "../src/index.js";

type Origin = "geocentric" | "topocentric";
const fixture = JSON.parse(readFileSync(new URL("./fixtures/phase-reference.json", import.meta.url), "utf8")) as {
  at: string;
  observer: Observer;
  tolerance: {
    phaseAngleDeg: number;
    illuminatedFraction: number;
    apparentAngleArcsec: { Moon: number; planets: number };
  };
  cases: {
    body: VisibilityBody;
    center: Origin;
    expected: { illuminatedPercent: number; elongationDeg: number; phaseAngleDeg: number; longitudeDeg: number };
  }[];
};
const geometryFixture = JSON.parse(readFileSync(new URL("./fixtures/geometry-reference.json", import.meta.url), "utf8")) as {
  horizons: { at: string; observer: Observer; cases: { body: string; center: Origin; expected: { longitudeDegrees: number } }[] };
};

describe("independent Horizons phase examples", () => {
  it.each(fixture.cases)("compares $body $center at the recorded epoch", (row) => {
    const result = phase(row.body, fixture.at, fixture.observer);
    if (result.status !== "ok") throw new Error(result.detail);
    const actual = result[row.center];
    const { expected } = row;
    const { tolerance } = fixture;
    const angleGate = tolerance.apparentAngleArcsec[row.body === "Moon" ? "Moon" : "planets"];
    expect(Math.abs(actual.elongationDeg - expected.elongationDeg) * 3600, "apparent separation error, arcseconds")
      .toBeLessThanOrEqual(angleGate);
    expect(Math.abs(actual.illumination.phaseAngleDeg - expected.phaseAngleDeg), "geometric versus retarded phase error, degrees")
      .toBeLessThanOrEqual(tolerance.phaseAngleDeg);
    expect(Math.abs(actual.illumination.illuminatedFraction - expected.illuminatedPercent / 100), "fraction error")
      .toBeLessThanOrEqual(tolerance.illuminatedFraction);

    expect(geometryFixture.horizons.at).toBe(fixture.at);
    expect(geometryFixture.horizons.observer).toEqual(fixture.observer);
    const sun = geometryFixture.horizons.cases.find((value) => value.body === "Sun" && value.center === row.center);
    if (sun === undefined) throw new Error("Missing independent Sun longitude");
    // All these selected differences already lie in (-180, 180]. This derives
    // an expected signed angle from two independent Horizons coordinates.
    const difference = expected.longitudeDeg - sun.expected.longitudeDegrees;
    expect(difference).toBeGreaterThan(-180);
    expect(difference).toBeLessThan(180);
    expect(Math.abs(actual.signedSynodicAngleDeg - difference) * 3600, "signed longitude error, arcseconds")
      .toBeLessThanOrEqual(angleGate);
    expect(actual.classification).toBe(difference > 0 ? "evening-star" : "morning-star");
  });
});
