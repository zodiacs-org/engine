import { describe, expect, it } from "vitest";
import type { SkyEvent, SkyEventKind } from "../../src/sky/riseset.js";
import { partitionCrescentOpportunities } from "../src/crescent-opportunities.js";

// Independently constructed integer schedules check interval arithmetic, not
// astronomical accuracy. Expected timings use elementary rational arithmetic.
function event(kind: SkyEventKind, at: number): SkyEvent {
  return { kind, at: new Date(at), altitude: 0, azimuth: 0 };
}
const transits = [event("lower-transit", 0), event("upper-transit", 100), event("lower-transit", 200)];
const sunrise = event("rise", 70);
const sunset = event("set", 130);
const sun = [transits[0]!, sunrise, transits[1]!, sunset, transits[2]!];

function opportunities(sunEvents: readonly SkyEvent[], moonEvents: readonly SkyEvent[], from = 0, to = 200) {
  const result = partitionCrescentOpportunities(sunEvents, moonEvents, from, to);
  if (result.status !== "complete") throw new Error(result.detail);
  return result.opportunities;
}

describe("crescent horizon pairing and timing", () => {
  it("uses rises in the morning and sets in the evening, keeping event identity", () => {
    const moonrise = event("rise", 25);
    const moonset = event("set", 175);
    const result = opportunities(sun, [moonrise, event("set", 50), event("rise", 150), moonset]);
    expect(result.map(({ period, from, to, reason, lagMilliseconds, bestTime }) =>
      ({ period, from, to, reason, lagMilliseconds, bestTime }))).toEqual([
      { period: "morning", from: 0, to: 100, reason: null, lagMilliseconds: 45,
        bestTime: { at: new Date(50).toISOString(), lagMilliseconds: 45, offsetMilliseconds: 20,
          rule: "morning-mirrored-four-ninths-extension" } },
      { period: "evening", from: 100, to: 200, reason: null, lagMilliseconds: 45,
        bestTime: { at: new Date(150).toISOString(), lagMilliseconds: 45, offsetMilliseconds: 20,
          rule: "evening-four-ninths" } }
    ]);
    expect(result[0]!.sunCrossing).toBe(sunrise);
    expect(result[0]!.moonCrossing).toBe(moonrise);
    expect(result[1]!.sunCrossing).toBe(sunset);
    expect(result[1]!.moonCrossing).toBe(moonset);
    for (const [index, row] of result.entries()) {
      expect(row.solarHalf.start).toBe(transits[index]);
      expect(row.solarHalf.end).toBe(transits[index + 1]);
      expect(Object.isFrozen(row.bestTime)).toBe(true);
    }
  });

  it.each([-10, 0, 10])("retains signed lag %i without wrapping a nonpositive pair", (lag) => {
    const result = opportunities(sun, [event("rise", 70 - lag), event("set", 130 + lag)]);
    expect(result.every((row) => row.reason === null && row.lagMilliseconds === lag)).toBe(true);
    expect(result.every((row) => (row.bestTime === null) === (lag <= 0))).toBe(true);
  });

  it("rounds the offset before adding or subtracting it from the solar instant", () => {
    const expectedOffsets = [0, 1, 1, 2, 2, 3, 3, 4, 4];
    for (const [index, offset] of expectedOffsets.entries()) {
      const lag = index + 1;
      const result = opportunities(sun, [event("rise", 70 - lag), event("set", 130 + lag)]);
      expect(result[0]!.bestTime!.at).toBe(new Date(70 - offset).toISOString());
      expect(result[1]!.bestTime!.at).toBe(new Date(130 + offset).toISOString());
      expect(result.map((row) => row.bestTime!.offsetMilliseconds)).toEqual([offset, offset]);
    }
  });

  it("keeps complete overlapping solar halves at request edges", () => {
    expect(opportunities(sun, [], 99, 101).map(({ period, from, to }) => [period, from, to]))
      .toEqual([["morning", 0, 100], ["evening", 100, 200]]);
    expect(opportunities(sun, [], 0, 100).map((row) => row.period)).toEqual(["morning"]);
    expect(opportunities(sun, [], 100, 200).map((row) => row.period)).toEqual(["evening"]);
  });

  it("requires both crossings in the half-open requested range", () => {
    const moon = [event("rise", 25), event("set", 175)];
    expect(opportunities(sun, moon, 25, 176).map((row) => row.reason)).toEqual([null, null]);
    expect(opportunities(sun, moon, 26, 176).map((row) => row.reason)).toEqual(["moon-crossing-outside-range", null]);
    expect(opportunities(sun, moon, 25, 175).map((row) => row.reason)).toEqual([null, "moon-crossing-outside-range"]);
    expect(opportunities(sun, moon, 71, 176).map((row) => row.reason)).toEqual(["sun-crossing-outside-range", null]);
    expect(opportunities(sun, moon, 25, 130).map((row) => row.reason)).toEqual([null, "sun-crossing-outside-range"]);
    const row = opportunities(sun, moon, 71, 176)[0]!;
    expect(row.sunCrossing).toBe(sunrise);
    expect(row.moonCrossing).toBe(moon[0]);
    expect(row.lagMilliseconds).toBeNull();
    expect(row.bestTime).toBeNull();
  });

  it("assigns a transit-time crossing to the following half only", () => {
    const result = opportunities([...transits, event("rise", 0), event("set", 100)],
      [event("rise", 0), event("set", 100), event("set", 200)]);
    expect(result.map(({ reason, lagMilliseconds, bestTime }) => [reason, lagMilliseconds, bestTime]))
      .toEqual([[null, 0, null], [null, 0, null]]);
  });

  it("retains missing solar and lunar crossings without borrowing from other halves or directions", () => {
    expect(opportunities(transits, []).map((row) => row.reason)).toEqual(["missing-sun-crossing", "missing-sun-crossing"]);
    const missingMoon = opportunities(sun, [event("set", 99), event("rise", 101)]);
    expect(missingMoon.map((row) => row.reason)).toEqual(["missing-moon-crossing", "missing-moon-crossing"]);
    expect(missingMoon.every((row) => row.moonCrossing === null && row.lagMilliseconds === null && row.bestTime === null)).toBe(true);
    const moon = event("rise", 25);
    expect(opportunities(transits, [moon])[0]).toMatchObject({
      reason: "missing-sun-crossing", sunCrossing: null, moonCrossing: moon, bestTime: null
    });
  });

  it("counts multiplicity across the full half before clipping and gives solar gaps priority", () => {
    const moon = [event("rise", 25), event("rise", 60), event("set", 175)];
    const repeatedMoon = opportunities(sun, moon, 50, 176)[0]!;
    expect(repeatedMoon).toMatchObject({ reason: "multiple-moon-crossings", moonCrossing: null, bestTime: null });
    const repeatedSun = opportunities([...sun, event("rise", 25)], moon, 50, 176)[0]!;
    expect(repeatedSun).toMatchObject({ reason: "multiple-sun-crossings", sunCrossing: null, moonCrossing: null, bestTime: null });
    expect(opportunities(sun, [moon[0]!, moon[0]!])[0]!.reason).toBe("multiple-moon-crossings");
    expect(opportunities([...sun, sunrise], [moon[0]!])[0]!.reason).toBe("multiple-sun-crossings");
  });

  it.each([
    [], [transits[0]!], [transits[1]!, transits[2]!], [transits[0]!, transits[1]!],
    [transits[0]!, event("lower-transit", 100), transits[2]!],
    [transits[0]!, event("upper-transit", 0), transits[2]!], [...transits].reverse(),
    [event("lower-transit", NaN), transits[1]!, transits[2]!],
    [transits[0]!, event("upper-transit", NaN), transits[2]!],
    [transits[0]!, transits[1]!, event("lower-transit", NaN)]
  ])("refuses missing or malformed transit anchors without partial rows (%j)", (...anchors) => {
    const result = partitionCrescentOpportunities(anchors, [], 0, 200);
    expect(result.status).toBe("unresolved");
    expect(result).not.toHaveProperty("opportunities");
  });

  it.each(["rise", "set"] as const)("refuses nonfinite %s crossings for either body", (kind) => {
    expect(partitionCrescentOpportunities([...sun, event(kind, NaN)], [], 0, 100).status).toBe("unresolved");
    expect(partitionCrescentOpportunities(sun, [event(kind, NaN)], 0, 100).status).toBe("unresolved");
  });

  it.each([[NaN, 200], [0, Infinity], [-Infinity, 200], [0, 0], [200, 0]])(
    "refuses an invalid request range (%s, %s)", (from, to) => {
      expect(partitionCrescentOpportunities(sun, [], from, to).status).toBe("unresolved");
    }
  );

  it("refuses unsafe elapsed lags without returning partial rows or throwing", () => {
    const extremeSun = [event("lower-transit", -8640000000000000), event("rise", 8640000000000000 - 1),
      event("upper-transit", 8640000000000000)];
    const result = partitionCrescentOpportunities(extremeSun, [event("rise", -8640000000000000)],
      -8640000000000000, 8640000000000000);
    expect(result.status).toBe("unresolved");
    expect(result).not.toHaveProperty("opportunities");
  });

  it("preserves extended event identity without modifying frozen inputs", () => {
    const extendedSun = Object.freeze(sun.map((entry) => Object.freeze({ ...entry, source: "sun" })));
    const extendedMoon = Object.freeze([Object.freeze({ ...event("rise", 25), source: "moon" })]);
    const result = partitionCrescentOpportunities<SkyEvent & { readonly source: string }>(extendedSun, extendedMoon, 0, 200);
    if (result.status !== "complete") throw new Error(result.detail);
    expect(result.opportunities[0]!.sunCrossing!.source).toBe("sun");
    expect(result.opportunities[0]!.moonCrossing).toBe(extendedMoon[0]);
  });
});
