import { afterEach, describe, expect, it, vi } from "vitest";
import type { CalcRefusal, CalcTime } from "@zodiacs/engine/calc";
import * as engine from "@zodiacs/engine/calc";
import { searchApsidesWindow, searchLunarApsides, searchPlanetaryApsides } from "../src/index.js";
import type { ApsidesWindowOptions, LunarSearchOptions, PlanetarySearchOptions } from "../src/index.js";
import * as sampling from "../src/sample.js";
import * as syzygy from "../src/syzygy.js";
import type { SyzygyLongitudeSample } from "../src/syzygy.js";

// A mutable facade permits fault injection without changing native ESM exports.
vi.mock("@zodiacs/engine/calc", async (importOriginal) => ({
  ...await importOriginal<typeof import("@zodiacs/engine/calc")>()
}));

const tt = (jd: number): CalcTime => ({ jd, scale: "tt" });
const month = { from: tt(2_451_544.5), to: tt(2_451_575.5) };

// Synthetic directions and receipts exercise a published longitude definition,
// not astronomical accuracy. No expected values are taken from the ephemeris.
function longitude(body: "Moon" | "Sun", longitudeDegrees: number): SyzygyLongitudeSample {
  const instant: SyzygyLongitudeSample["instant"] = {
    utc: "2000-01-01T12:00:00.000Z", jdTt: 2_451_545, jdUt1: 2_451_545,
    deltaT: { seconds: 0, sigma: null, model: "pinned", table: null, tableDigest: null, segment: "pinned" },
    timeScale: { input: "tt", basis: "pinned", ut1MinusUtc: null, leapSeconds: null }
  };
  return {
    longitudeDegrees, instant,
    bounds: {
      position: { value: null, unit: "arcsec", label: "estimated", basis: "synthetic direction" },
      distance: null, speed: null
    },
    receipt: {
      schema: "zodiacs.calc-receipt.v1", request: { body, time: tt(instant.jdTt) },
      instants: [instant], conventions: ["synthetic-test-only"],
      engine: {
        name: "@zodiacs/engine", version: "0.0.0-synthetic",
        ephemeris: { name: "astronomy-engine", version: "0.0.0-synthetic" }
      }
    }
  };
}

function annotation(moon: number, sun: number, orb = 5, kind: "perigee" | "apogee" = "perigee") {
  return syzygy.describeLunarSyzygy(kind, orb, longitude("Moon", moon), longitude("Sun", sun));
}

afterEach(() => vi.restoreAllMocks());

describe("explicit lunar phase convention and inclusive orb", () => {
  it.each([
    [0, 0, 0, "new-moon", 0],
    [180, 0, 0, "full-moon", 0],
    [0, 180, 0, "full-moon", 0],
    [5, 0, 5, "new-moon", 5],
    [0, 5, 5, "new-moon", 5],
    [355, 0, 5, "new-moon", 5],
    [0, 355, 5, "new-moon", 5],
    [175, 0, 5, "full-moon", 5],
    [185, 0, 5, "full-moon", 5],
    [0, 175, 5, "full-moon", 5],
    [0, 185, 5, "full-moon", 5],
    [359, 1, 2, "new-moon", 2],
    [1, 359, 2, "new-moon", 2]
  ])("includes exact and boundary matches: Moon=%s Sun=%s orb=%s", (moon, sun, orb, phase, separation) => {
    for (const kind of ["perigee", "apogee"] as const) {
      const result = annotation(moon as number, sun as number, orb as number, kind);
      expect(result).toMatchObject({
        convention: "geocentric-apparent-ecliptic-longitude-of-date",
        orbDegrees: orb, nearestPhase: phase, separationDegrees: separation,
        candidate: kind === "perigee" ? "supermoon-candidate" : "micromoon-candidate"
      });
      expect(result.elongationDegrees).toBeGreaterThanOrEqual(0);
      expect(result.elongationDegrees).toBeLessThan(360);
    }
  });

  it.each([
    [5 + 2 ** -50, 0], [0, 5 + 2 ** -50],
    [355 - 2 ** -44, 0], [0, 355 - 2 ** -44],
    [175 - 2 ** -45, 0], [0, 175 - 2 ** -45],
    [185 + 2 ** -45, 0], [0, 185 + 2 ** -45]
  ])("excludes the next represented longitude beyond an orb edge: %s %s", (moon, sun) => {
    expect(annotation(moon, sun).candidate).toBeNull();
    expect(annotation(moon, sun).separationDegrees).toBeGreaterThan(5);
  });

  it.each([[90, 0], [270, 0], [0, 90], [0, 270]])(
    "chooses new-moon for quadrature ties without a candidate: %s %s", (moon, sun) => {
      expect(annotation(moon, sun, 90 - 2 ** -46)).toMatchObject({
        nearestPhase: "new-moon", separationDegrees: 90, candidate: null
      });
    }
  );

  it("preserves tiny offsets when checking a zero orb even if directed wrapping rounds", () => {
    expect(annotation(1e-20, 0, 0)).toMatchObject({
      elongationDegrees: 1e-20, separationDegrees: 1e-20, candidate: null
    });
    expect(annotation(0, 1e-20, 0)).toMatchObject({
      elongationDegrees: 0, separationDegrees: 1e-20, candidate: null
    });
    expect(annotation(0, 1e-20, 1e-20).candidate).toBe("supermoon-candidate");
  });

  it("measures directed longitude difference with no distance ranking or phase time", () => {
    const waxing = annotation(15, 10);
    const waning = annotation(10, 15);
    expect(waxing.elongationDegrees).toBe(5);
    expect(waning.elongationDegrees).toBe(355);
    expect(waxing.moon.longitudeDegrees).toBe(15);
    expect(waxing.sun.longitudeDegrees).toBe(10);
    expect(Object.keys(waxing).sort()).toEqual([
      "candidate", "convention", "elongationDegrees", "moon", "nearestPhase",
      "orbDegrees", "separationDegrees", "sun"
    ]);
  });
});

describe("syzygy input validation precedes all engine work", () => {
  it.each([undefined, null, "5", false, NaN, Infinity, -Infinity, -1, 90, 180, {}])(
    "rejects an explicit invalid orb %s", (syzygyOrbDegrees) => {
      const distance = vi.spyOn(sampling, "sampleDistance");
      const angles = vi.spyOn(syzygy, "sampleSyzygyLongitude");
      const options = { ...month, syzygyOrbDegrees };
      expect(() => searchLunarApsides(options as LunarSearchOptions)).toThrow(RangeError);
      expect(() => searchApsidesWindow(options as ApsidesWindowOptions)).toThrow(RangeError);
      expect(distance).not.toHaveBeenCalled();
      expect(angles).not.toHaveBeenCalled();
    }
  );

  it("rejects hidden and accessor orb properties without executing them", () => {
    const getter = vi.fn(() => 5);
    const accessor = Object.defineProperty({ ...month }, "syzygyOrbDegrees", { get: getter, enumerable: true });
    const hidden = Object.defineProperty({ ...month }, "syzygyOrbDegrees", { value: 5 });
    const calls = vi.spyOn(sampling, "sampleDistance");
    for (const options of [accessor, hidden]) {
      expect(() => searchLunarApsides(options)).toThrow(RangeError);
      expect(() => searchApsidesWindow(options)).toThrow(RangeError);
    }
    expect(getter).not.toHaveBeenCalled();
    expect(calls).not.toHaveBeenCalled();
  });

  it("rejects annotations for planetary-only requests", () => {
    const calls = vi.spyOn(sampling, "sampleDistance");
    expect(() => searchApsidesWindow({ ...month, bodies: ["Earth"], syzygyOrbDegrees: 5 })).toThrow(RangeError);
    expect(() => searchPlanetaryApsides("Earth", {
      ...month, syzygyOrbDegrees: 5
    } as PlanetarySearchOptions)).toThrow(RangeError);
    expect(calls).not.toHaveBeenCalled();
  });

  it("accepts zero and the last representable orb below quadrature", () => {
    for (const syzygyOrbDegrees of [0, -0, 90 - 2 ** -46]) {
      expect(searchLunarApsides({ from: month.from, to: month.from, syzygyOrbDegrees }).status).toBe("complete");
    }
  });
});

describe("lunar annotation failures discard all events and count failed calls", () => {
  const refusal: CalcRefusal = {
    status: "refused", reason: "sample-budget", detail: "Synthetic angular dependency refusal",
    samples: 1, maxSamples: 1
  };

  it.each([1, 2, 4])("preserves an engine refusal at annotation call %s", (failedCall) => {
    const base = searchLunarApsides(month);
    expect(base.status).toBe("complete");
    const original = syzygy.sampleSyzygyLongitude;
    let calls = 0;
    vi.spyOn(syzygy, "sampleSyzygyLongitude").mockImplementation((body, jd) => {
      calls += 1;
      return calls === failedCall ? refusal : original(body, jd);
    });
    const result = searchLunarApsides({ ...month, syzygyOrbDegrees: 5 });
    expect(result).toMatchObject({ status: "refused", reason: "engine-refusal", events: [] });
    if (result.status !== "refused") throw new Error("Expected angular refusal");
    expect(result.engineRefusal).toBe(refusal);
    expect(result.window).toEqual(base.window);
    expect(calls).toBe(failedCall);
    expect(result.diagnostics.evaluations).toBe(base.diagnostics.evaluations + failedCall);
  });

  it("preserves a lunar angular refusal through a combined search", () => {
    const calls = vi.spyOn(syzygy, "sampleSyzygyLongitude").mockReturnValue(refusal);
    const result = searchApsidesWindow({ ...month, bodies: ["Mercury", "Moon"], syzygyOrbDegrees: 5 });
    expect(result).toMatchObject({ status: "refused", failedBody: "Moon", reason: "engine-refusal", events: [] });
    expect(result.diagnostics.bodies.map(({ status }) => status)).toEqual(["refused", "not-started"]);
    expect(calls).toHaveBeenCalledTimes(1);
    if (result.status !== "refused") throw new Error("Expected combined refusal");
    expect(result.engineRefusal).toBe(refusal);
  });

  it("does no angular work when the distance search already refused", () => {
    const calls = vi.spyOn(syzygy, "sampleSyzygyLongitude");
    expect(searchLunarApsides({ ...month, syzygyOrbDegrees: 5, maxEvaluations: 1 })).toMatchObject({
      status: "refused", reason: "evaluation-budget", events: []
    });
    expect(calls).not.toHaveBeenCalled();
  });

  it("propagates unexpected dependency exceptions unchanged", () => {
    const error = new Error("Synthetic unexpected angular failure");
    vi.spyOn(syzygy, "sampleSyzygyLongitude").mockImplementation(() => { throw error; });
    expect(() => searchLunarApsides({ ...month, syzygyOrbDegrees: 5 })).toThrow(error);
  });
});

describe("angular sampler preserves engine contracts", () => {
  it("returns the original dependency refusal", () => {
    const refusal: CalcRefusal = { status: "refused", reason: "unsupported-combination", detail: "Synthetic refusal" };
    vi.spyOn(engine, "calc").mockReturnValue(refusal);
    expect(syzygy.sampleSyzygyLongitude("Moon", 2_451_545)).toBe(refusal);
  });

  it("rejects incomplete or inconsistent engine output", () => {
    const position = engine.calc({ body: "Moon", time: tt(2_451_545) });
    if (position.status !== "ok") throw new Error("Expected a local development sample");
    const calls = vi.spyOn(engine, "calc");
    for (const lon of [NaN, Infinity, -1, 360]) {
      calls.mockReturnValue({ ...position, lon });
      expect(() => syzygy.sampleSyzygyLongitude("Moon", 2_451_545)).toThrow(Error);
    }
    calls.mockReturnValue({ ...position, receipt: { ...position.receipt, instants: [] } });
    expect(() => syzygy.sampleSyzygyLongitude("Moon", 2_451_545)).toThrow(Error);
    calls.mockReturnValue(position);
    expect(() => syzygy.sampleSyzygyLongitude("Moon", 2_451_546)).toThrow(Error);
  });
});
