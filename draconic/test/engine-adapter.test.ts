import { describe, expect, it } from "vitest";
import { chartPoints, natalChart } from "../../src/index.js";
import type { BirthInput, ChartFlag, TimeScaleName } from "../../src/index.js";
import { castNatal, rotateLongitude } from "../src/index.js";
import type { DraconicOptions } from "../src/index.js";

// Invented instant and coordinates. Engine comparisons below check adapter
// wiring and metadata preservation, not independent astronomical accuracy.
const syntheticBirth = {
  utc: "2000-04-05T06:07:08Z",
  latitude: 12.5,
  longitude: 45.25,
  houseSystem: "equal"
} satisfies BirthInput;

describe("castNatal engine integration", () => {
  it("defaults to the true north node in the unchanged engine natal chart", () => {
    const result = castNatal(syntheticBirth);
    const expected = natalChart(syntheticBirth);
    const trueNorth = expected.bodies.find((body) => body.body === "North Node")!;
    expect(result.natal).toEqual(expected);
    expect(result.node).toEqual({
      kind: "true", enginePoint: "North Node", longitude: trueNorth.lon
    });
    expect(castNatal(syntheticBirth, { node: "true" })).toEqual(result);
    expect(rotateLongitude(result.node.longitude, result.node.longitude)).toBe(0);
  });

  it("selects the mean north node explicitly without replacing the natal true-node rows", () => {
    const result = castNatal(syntheticBirth, { node: "mean" });
    const expected = natalChart(syntheticBirth);
    const meanNorth = chartPoints(expected).points.find((point) => point.point === "Mean Node")!;
    expect(result.natal).toEqual(expected);
    expect(result.node).toEqual({
      kind: "mean", enginePoint: "Mean Node", longitude: meanNorth.lon
    });
    expect(result.node.longitude).not.toBe(expected.bodies.find((body) => body.body === "North Node")!.lon);
    expect(rotateLongitude(result.node.longitude, result.node.longitude)).toBe(0);
  });

  it.each(["utc", "ut1", "tt"] as const)("preserves the %s clock and pinned deltaT for both node choices", (timeScale: TimeScaleName) => {
    const birth = { ...syntheticBirth, timeScale, deltaT: 120.5 };
    const expected = natalChart(birth);
    for (const node of ["true", "mean"] as const) {
      const result = castNatal(birth, { node });
      expect(result.natal).toEqual(expected);
      expect(result.natal.input.deltaT).toBe(birth.deltaT);
      expect(result.natal.timeScale.input).toBe(timeScale);
      expect(result.natal.deltaT.model).toBe("pinned");
      expect(result.node.longitude).toBe(node === "true"
        ? expected.bodies.find((body) => body.body === "North Node")!.lon
        : chartPoints(expected).points.find((point) => point.point === "Mean Node")!.lon);
    }
  });

  it("lets the engine canonicalize asserted and derived flags while keeping settings", () => {
    const birth: BirthInput = {
      ...syntheticBirth,
      timeKnown: false,
      flags: ["dst-fold", "lmt", "dst-fold", "no-time"]
    };
    const before = structuredClone(birth);
    const result = castNatal(birth, { node: "mean" });
    expect(result.natal).toEqual(natalChart(birth));
    expect(result.natal.input.houseSystem).toBe("equal");
    expect(result.natal.input.timeKnown).toBe(false);
    expect(result.natal.input.flags).toEqual(["dst-fold", "lmt"]);
    expect(result.natal.flags).toEqual(["dst-fold", "lmt", "no-time"]);
    expect(result.natal.angles).toBeNull();
    expect(result.natal.houses).toBeNull();
    expect(birth).toEqual(before);
  });

  it("does not share the caller's Date or flags array with the result", () => {
    const utc = new Date(syntheticBirth.utc);
    const flags: ChartFlag[] = ["lmt"];
    const birth = { ...syntheticBirth, utc, flags };
    const result = castNatal(birth);
    const before = structuredClone(result);
    utc.setUTCFullYear(2010);
    flags.push("dst-fold");
    expect(result).toEqual(before);
    result.natal.bodies[0]!.lon = 0;
    expect(castNatal(syntheticBirth).natal.bodies).toEqual(natalChart(syntheticBirth).bodies);
  });
});

describe("castNatal validation", () => {
  it.each([
    null, [], "mean", 1,
    { node: "south" }, { node: "True" }, { node: null },
    { node: false }, { node: {} }, { node: ["mean"] },
    { Node: "mean" }, { nodes: "mean" }, { node: "mean", extra: true }
  ])("rejects invalid node options %j", (options) => {
    expect(() => castNatal(syntheticBirth, options as DraconicOptions)).toThrow(RangeError);
  });

  it.each([
    { utc: "2000-02-30T00:00:00Z" },
    { utc: "2000-04-05T06:07:08" },
    { ...syntheticBirth, latitude: 91 },
    { utc: syntheticBirth.utc, longitude: 45 },
    { ...syntheticBirth, houseSystem: "invalid" },
    { ...syntheticBirth, timeScale: null },
    { ...syntheticBirth, deltaT: NaN },
    { ...syntheticBirth, flags: ["dst-fold", "dst-gap"] },
    { ...syntheticBirth, flags: ["no-time"] }
  ])("propagates engine rejection for invalid birth input %j", (birth) => {
    expect(() => castNatal(birth as BirthInput)).toThrow(RangeError);
  });
});
