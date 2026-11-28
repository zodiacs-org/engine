import { describe, expect, it } from "vitest";
import { calc } from "@zodiacs/engine/calc";
import type { CalcTime } from "@zodiacs/engine/calc";
import {
  AU_KM, DISTANCE_TARGETS, PLANETARY_BODIES, distanceTarget, sampleDistance
} from "../src/index.js";
import type { ApsisBody, DistanceSample } from "../src/index.js";

const time = { jd: 2_451_545, scale: "tt" } as const;
const bodies: readonly ApsisBody[] = ["Moon", ...PLANETARY_BODIES];

function sample(body: ApsisBody, at: CalcTime = time): DistanceSample {
  const result = sampleDistance(body, at);
  if (result.status !== "ok") throw new Error(`Unexpected engine refusal: ${result.reason}`);
  return result;
}

// Integration checks against the dependency, not independent accuracy evidence.
describe("geometric distance contract", () => {
  it.each(bodies)("samples %s with the explicit center and preserves a replayable receipt", (body) => {
    const result = sample(body);
    const replay = calc(result.receipt.request);
    expect(replay.status).toBe("ok");
    if (replay.status !== "ok") throw new Error("Replay refused");

    expect(result.target).toEqual(DISTANCE_TARGETS[body]);
    expect(result.receipt.request.center).toBe(body === "Moon" ? "geocentric" : "heliocentric");
    expect(result.receipt.request.frame).toBe("equatorial-j2000");
    expect(result.receipt.request.flags).toMatchObject({
      correction: "geometric", speeds: true, cartesian: true
    });
    expect(result.receipt.conventions).toContain("correction:geometric");
    expect(result.receipt.engine.name).toBe("@zodiacs/engine");
    expect(result.receipt.engine.ephemeris).toEqual({ name: "astronomy-engine", version: "2.1.19" });
    expect(result.instant.jdTt).toBe(time.jd);
    expect(result.instant.timeScale.input).toBe("tt");
    expect(result.instant).toEqual(result.receipt.instants[0]);
    expect(result.receipt).toEqual(replay.receipt);
    expect(result.bounds).toEqual(replay.bounds);
    expect(result.bounds.speed).toMatchObject(body === "Moon"
      ? { method: "central-difference", stepDays: 0.001 }
      : { method: "analytic", stepDays: null });
    expect(result.distanceAu).toBe(replay.dist);
    expect(result.distanceKm).toBe(replay.dist! * AU_KM);
    expect(result.radialSpeedKmPerSecond).toBe(replay.speeds!.dist! * AU_KM / 86_400);
    expect(result.orbitalSpeedKmPerSecond).toBe(
      Math.hypot(replay.cartesian!.vx!, replay.cartesian!.vy!, replay.cartesian!.vz!) * AU_KM / 86_400
    );
    expect(result.distanceKm).toBeGreaterThan(0);
    expect(result.orbitalSpeedKmPerSecond).toBeGreaterThan(0);
    expect(Math.abs(result.radialSpeedKmPerSecond)).toBeLessThanOrEqual(result.orbitalSpeedKmPerSecond);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it("uses the IAU exact AU definition in kilometres", () => {
    // Published constant, cited in SOURCES.md. No ephemeris output is involved.
    expect(AU_KM).toBe(149_597_870_700 / 1_000);
  });

  it("distinguishes physical centers from the engine's planetary system references", () => {
    expect(PLANETARY_BODIES).toContain("Earth");
    expect(distanceTarget("Moon")).toMatchObject({
      horizonsTarget: "301", horizonsCenter: "500@399", referencePoint: "body-center"
    });
    for (const body of ["Mercury", "Venus", "Earth"] as const) {
      expect(distanceTarget(body).referencePoint).toBe("body-center");
    }
    for (const body of ["Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"] as const) {
      expect(distanceTarget(body).referencePoint).toBe("system-barycenter");
      expect(distanceTarget(body).horizonsCenter).toBe("500@10");
    }
    expect(distanceTarget("Pluto").horizonsTarget).toBe("9");
    expect(Object.values(DISTANCE_TARGETS).map(({ horizonsTarget }) => horizonsTarget)).toEqual([
      "301", "199", "299", "399", "4", "5", "6", "7", "8", "9"
    ]);
    expect(Object.isFrozen(DISTANCE_TARGETS)).toBe(true);
    expect(Object.isFrozen(distanceTarget("Moon"))).toBe(true);
  });

  it("does not mutate Date input or retain its mutable identity", () => {
    const date = new Date("2000-01-01T12:00:00Z");
    const before = date.getTime();
    const result = sample("Moon", date);
    expect(date.getTime()).toBe(before);
    date.setUTCFullYear(2020);
    expect(result.instant.utc).toBe("2000-01-01T12:00:00.000Z");
    expect(result.receipt.request.time).toEqual({ iso: "2000-01-01T12:00:00.000Z" });
  });

  it("is reproducible across intervening calls on a different engine clock", () => {
    const before = sample("Moon");
    sample("Earth", { iso: "2001-01-01T12:00:00Z", deltaT: 100 });
    expect(sample("Moon")).toEqual(before);
  });
});

describe("input and coverage failures", () => {
  it.each(["Sun", "North Node", "Black Moon Lilith", "moon", "toString", "__proto__", "", null, 3])(
    "rejects unsupported body %s", (body) => {
      expect(() => sampleDistance(body as ApsisBody, time)).toThrow(RangeError);
    }
  );

  it.each([
    "2000-02-30T00:00:00Z", "2000-01-01T12:00:00", new Date(NaN),
    { jd: Infinity, scale: "tt" }, { jd: 2_451_545, scale: "tdb" }
  ])("rejects malformed time %s through the engine validator", (invalid) => {
    expect(() => sampleDistance("Moon", invalid as CalcTime)).toThrow(RangeError);
  });

  it.each(["1799-12-31T00:00:00Z", "2200-01-01T00:00:00Z"])(
    "preserves the engine's range refusal for %s", (at) => {
      const result = sampleDistance("Moon", at);
      expect(result).toMatchObject({ status: "refused", reason: "out-of-range" });
      expect(result).not.toHaveProperty("distanceKm");
    }
  );
});
