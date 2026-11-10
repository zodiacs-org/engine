import { describe, expect, it } from "vitest";
import { ACCEPTANCE_POLICY, MINOR_BODIES, MINOR_BODY_NAMES, isMinorBody, minorBodyDefinition } from "../src/index.js";

describe("minor-body target selection", () => {
  it.each([
    ["Chiron", 2060], ["Ceres", 1], ["Pallas", 2], ["Juno", 3], ["Vesta", 4]
  ] as const)("selects numbered asteroid %s unambiguously", (name, number) => {
    expect(minorBodyDefinition(name)).toEqual({ name, number, command: `${number};` });
    expect(isMinorBody(name)).toBe(true);
  });

  it.each(["chiron", " Chiron", "Chiron ", "2060", "Pholus", "Eris", "Sun", "toString", "constructor", "__proto__", null, undefined, 2060, {}])(
    "rejects unsupported input %j", (input) => {
      expect(isMinorBody(input)).toBe(false);
      expect(() => minorBodyDefinition(input)).toThrow(RangeError);
    }
  );

  it("protects selectors from caller mutation", () => {
    expect(Object.isFrozen(MINOR_BODIES)).toBe(true);
    expect(Object.isFrozen(MINOR_BODY_NAMES)).toBe(true);
    for (const body of MINOR_BODY_NAMES) expect(Object.isFrozen(MINOR_BODIES[body])).toBe(true);
    expect(() => Object.assign(MINOR_BODIES.Chiron, { command: "1;" })).toThrow(TypeError);
  });
});

describe("acceptance policy, not accuracy evidence", () => {
  it("keeps target coverage and error limits explicit and immutable", () => {
    expect(ACCEPTANCE_POLICY.targetSpan).toEqual({
      start: "1800-01-01T00:00:00", endExclusive: "2201-01-01T00:00:00", scale: "tt"
    });
    expect(ACCEPTANCE_POLICY.limits).toEqual({
      fitDirectionArcsec: 0.05, longitudeArcsec: 1, latitudeArcsec: 1,
      distanceAu: 1e-7, longitudeSpeedArcsecPerDay: 0.1,
      latitudeSpeedArcsecPerDay: 0.1, distanceSpeedAuPerDay: 1e-8
    });
    expect(Object.isFrozen(ACCEPTANCE_POLICY)).toBe(true);
    expect(Object.isFrozen(ACCEPTANCE_POLICY.limits)).toBe(true);
    expect(Object.isFrozen(ACCEPTANCE_POLICY.targetSpan)).toBe(true);
  });
});
