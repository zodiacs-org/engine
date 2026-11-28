import { describe, expect, it } from "vitest";
import { houseOf, natalChart } from "../../src/index.js";
import type { BirthInput } from "../../src/index.js";
import { castNatal, rotateLongitude, transformNatal } from "../src/index.js";
import type { NodeChoice } from "../src/index.js";

// Invented instant and coordinates, including invented polar sites. These
// comparisons check engine wiring and availability, not astronomical accuracy.
const utc = "2000-04-05T06:07:08Z";
const site = { latitude: 12.5, longitude: 45.25 };

function castAndTransform(birth: BirthInput, node: NodeChoice) {
  const source = castNatal(birth, { node });
  expect(source.natal).toEqual(natalChart(birth));
  const before = structuredClone(source);
  const result = transformNatal(source);
  expect(source).toEqual(before);
  expect(result.node).toEqual(source.node);
  expect(result.bodies.map((body) => body.body)).toEqual(source.natal.bodies.map((body) => body.body));
  expect(result.bodies.map((body) => body.lon)).toEqual(
    source.natal.bodies.map((body) => rotateLongitude(body.lon, source.node.longitude))
  );
  expect(result.bodies.map((body) => body.lat)).toEqual(source.natal.bodies.map((body) => body.lat));
  return { source, result };
}

describe.each(["true", "mean"] as const)("chart availability with the %s north node", (node) => {
  it.each([undefined, true, false])("keeps angles, cusps and body houses absent without coordinates (timeKnown: %s)", (timeKnown) => {
    const { source, result } = castAndTransform({
      utc, houseSystem: "placidus",
      ...(timeKnown === undefined ? {} : { timeKnown })
    }, node);
    expect(source.natal.input).toMatchObject({ houseSystem: "placidus", timeKnown: timeKnown ?? true });
    expect(source.natal.input).not.toHaveProperty("latitude");
    expect(source.natal.input).not.toHaveProperty("longitude");
    expect(source.natal.angles).toBeNull();
    expect(source.natal.houses).toBeNull();
    expect(source.natal.flags).toEqual(timeKnown === false ? ["no-time"] : []);
    expect(result.angles).toBeNull();
    expect(result.houses).toBeNull();
    expect(result.bodies.every((body) => body.house === null)).toBe(true);
  });

  it.each([
    { ...site, houseSystem: "equal" },
    { latitude: 78.5, longitude: 45.25, houseSystem: "placidus" },
    { latitude: -78.5, longitude: 45.25, houseSystem: "koch" }
  ] satisfies Array<Pick<BirthInput, "latitude" | "longitude" | "houseSystem">>)(
    "suppresses local geometry for unknown time at $latitude with $houseSystem houses",
    (settings) => {
      const birth: BirthInput = { utc, ...settings, timeKnown: false, flags: ["lmt", "no-time", "lmt"] };
      const { source, result } = castAndTransform(birth, node);
      expect(source.natal.input.utc.toISOString()).toBe(utc.replace("Z", ".000Z"));
      expect(source.natal.input).toMatchObject({ ...settings, timeKnown: false, flags: ["lmt"] });
      expect(source.natal.flags).toEqual(["lmt", "no-time"]);
      expect(source.natal.angles).toBeNull();
      expect(source.natal.houses).toBeNull();
      expect(result.angles).toBeNull();
      expect(result.houses).toBeNull();
      expect(result.bodies.every((body) => body.house === null)).toBe(true);
      // Unknown time changes availability, not the caller's reference instant.
      const timed = castNatal({ utc, ...settings }, { node });
      expect(source.natal.bodies).toEqual(timed.natal.bodies);
      expect(source.node).toEqual(timed.node);
    }
  );

  it.each(["whole", "equal", "placidus", "koch"] as const)(
    "keeps requested and computed %s houses distinct from the rotated coordinates",
    (houseSystem) => {
      const { source, result } = castAndTransform({ utc, ...site, houseSystem }, node);
      expect(source.natal.input.houseSystem).toBe(houseSystem);
      expect(source.natal.houses!.system).toBe(houseSystem);
      expect(source.natal.flags).toEqual([]);
      expect(result.houses!.system).toBe(houseSystem);
      expect(result.houses!.cusps).toEqual(
        source.natal.houses!.cusps.map((cusp) => rotateLongitude(cusp, source.node.longitude))
      );
      expect(result.angles).toEqual({
        asc: rotateLongitude(source.natal.angles!.asc, source.node.longitude),
        mc: rotateLongitude(source.natal.angles!.mc, source.node.longitude),
        dsc: rotateLongitude(source.natal.angles!.dsc, source.node.longitude),
        ic: rotateLongitude(source.natal.angles!.ic, source.node.longitude)
      });
      expect(result.bodies.map((body) => body.house)).toEqual(
        result.bodies.map((body) => houseOf(body.lon, result.houses!.cusps))
      );
    }
  );

  it.each([78.5, -78.5])("rotates the computed polar fallback at latitude %s and preserves the request", (latitude) => {
    for (const houseSystem of ["placidus", "koch"] as const) {
      const birth: BirthInput = { utc, latitude, longitude: 45.25, houseSystem };
      const { source, result } = castAndTransform(birth, node);
      const whole = castNatal({ ...birth, houseSystem: "whole" }, { node });
      expect(source.natal.input.houseSystem).toBe(houseSystem);
      expect(source.natal.input.timeKnown).toBe(true);
      expect(source.natal.flags).toEqual(["polar-fallback"]);
      expect(source.natal.houses).toEqual(whole.natal.houses);
      expect(source.natal.angles).toEqual(whole.natal.angles);
      expect(result.houses!.system).toBe("whole");
      expect(result.houses!.cusps).toEqual(
        whole.natal.houses!.cusps.map((cusp) => rotateLongitude(cusp, source.node.longitude))
      );
      expect(result).toEqual(transformNatal(whole));
      expect(whole.natal.input.houseSystem).toBe("whole");
      expect(whole.natal.flags).toEqual([]);
    }
  });

  it("treats zero coordinates as a supplied site and uses the default house system", () => {
    const { source, result } = castAndTransform({ utc, latitude: 0, longitude: 0 }, node);
    expect(source.natal.input).toMatchObject({ latitude: 0, longitude: 0, houseSystem: "whole", timeKnown: true });
    expect(source.natal.flags).toEqual([]);
    expect(result.angles).not.toBeNull();
    expect(result.houses!.system).toBe("whole");
    expect(result.bodies.every((body) => body.house !== null)).toBe(true);
  });
});
