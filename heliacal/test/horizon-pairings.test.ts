import { describe, expect, it } from "vitest";
import type { SkyEvent, SkyEventKind } from "../../src/sky/riseset.js";
import { partitionHorizonPairs } from "../src/horizon-pairings.js";

// Independently constructed integer-millisecond schedules test pairing and
// interval ownership. They make no claim about astronomical accuracy.
function event(kind: SkyEventKind, at: number): SkyEvent {
  return { kind, at: new Date(at), altitude: 0, azimuth: 0 };
}
const transits = [event("lower-transit", 0), event("upper-transit", 50), event("lower-transit", 100)];
const sunrise = event("rise", 20);
const sunset = event("set", 80);
const sun = [transits[0]!, sunrise, transits[1]!, sunset, transits[2]!];

function pairs(
  sunEvents: readonly SkyEvent[], targetEvents: readonly SkyEvent[], from = 0, to = 100
) {
  const result = partitionHorizonPairs(sunEvents, targetEvents, from, to);
  if (result.status !== "complete") throw new Error(result.detail);
  return result.opportunities;
}

describe("constructed horizon-pair interval arithmetic", () => {
  it("orders halves chronologically and target rises before sets, preserving engine event identity", () => {
    const riseMorning = event("rise", 10);
    const setMorning = event("set", 30);
    const riseEvening = event("rise", 90);
    const setEvening = event("set", 70);
    const result = pairs(sun, [riseMorning, setMorning, setEvening, riseEvening]);
    expect(result.map(({ period, from, to, sunKind, targetKind, lagMilliseconds, reason }) =>
      [period, from, to, sunKind, targetKind, lagMilliseconds, reason])).toEqual([
      ["morning", 0, 50, "rise", "rise", -10, null],
      ["morning", 0, 50, "rise", "set", 10, null],
      ["evening", 50, 100, "set", "rise", 10, null],
      ["evening", 50, 100, "set", "set", -10, null]
    ]);
    for (const [index, crossing] of [riseMorning, setMorning, riseEvening, setEvening].entries()) {
      expect(result[index]!.targetCrossing).toBe(crossing);
      expect(result[index]!.sunCrossing).toBe(index < 2 ? sunrise : sunset);
      expect(result[index]!.solarHalf.start).toBe(transits[index < 2 ? 0 : 1]);
      expect(result[index]!.solarHalf.end).toBe(transits[index < 2 ? 1 : 2]);
    }
  });

  for (const period of ["morning", "evening"] as const) {
    for (const targetKind of ["rise", "set"] as const) {
      it.each([-1, 0, 1])(`keeps signed and simultaneous ${period} Sun/${targetKind} lags (%i)`, (lag) => {
        const sunAt = period === "morning" ? 20 : 80;
        const result = pairs(sun, [event(targetKind, sunAt + lag)])
          .find((pair) => pair.period === period && pair.targetKind === targetKind)!;
        expect(result.reason).toBeNull();
        expect(result.lagMilliseconds).toBe(lag);
      });
    }
  }

  it("requires both crossings inside the half-open requested range", () => {
    const target = [event("rise", 10), event("set", 30)];
    expect(pairs(sun, target, 10, 31).map((pair) => pair.reason)).toEqual([null, null]);
    expect(pairs(sun, target, 11, 31).map((pair) => pair.reason)).toEqual(["target-crossing-outside-range", null]);
    expect(pairs(sun, target, 10, 30).map((pair) => pair.reason)).toEqual([null, "target-crossing-outside-range"]);
    for (const range of [[21, 31], [10, 20]] as const) {
      const result = pairs(sun, target, ...range);
      expect(result.map((pair) => pair.reason)).toEqual(["sun-crossing-outside-range", "sun-crossing-outside-range"]);
      expect(result.every((pair) => pair.lagMilliseconds === null)).toBe(true);
      expect(result.every((pair) => pair.sunCrossing === sunrise)).toBe(true);
    }
    const simultaneous = pairs(sun, [event("rise", 20)], 20, 21)[0]!;
    expect(simultaneous.reason).toBeNull();
    expect(simultaneous.lagMilliseconds).toBe(0);
  });

  it("retains complete half boundaries when the request clips either end", () => {
    expect(pairs(sun, [], 49, 51).map(({ from, to, period }) => [from, to, period]))
      .toEqual([[0, 50, "morning"], [0, 50, "morning"], [50, 100, "evening"], [50, 100, "evening"]]);
    expect(pairs(sun, [], 0, 50).map((pair) => pair.period)).toEqual(["morning", "morning"]);
    expect(pairs(sun, [], 50, 100).map((pair) => pair.period)).toEqual(["evening", "evening"]);
  });

  it("assigns crossings on a transit to the following half and excludes its end", () => {
    const boundarySun = [...transits, event("rise", 0), event("set", 50)];
    const result = pairs(boundarySun, [event("rise", 0), event("set", 50), event("rise", 100)]);
    expect(result.map(({ reason, lagMilliseconds }) => [reason, lagMilliseconds])).toEqual([
      [null, 0], ["missing-target-crossing", null], ["missing-target-crossing", null], [null, 0]
    ]);
  });

  it("keeps all polar gaps without manufacturing a Sun or target crossing", () => {
    const absent = pairs(transits, []);
    expect(absent).toHaveLength(4);
    expect(absent.every((pair) => pair.reason === "missing-sun-crossing"
      && pair.sunCrossing === null && pair.targetCrossing === null && pair.lagMilliseconds === null)).toBe(true);
    const missingTarget = pairs(sun, []);
    expect(missingTarget.every((pair) => pair.reason === "missing-target-crossing"
      && pair.sunCrossing !== null && pair.targetCrossing === null && pair.lagMilliseconds === null)).toBe(true);
    const target = event("rise", 20);
    expect(pairs(transits, [target])[0]).toMatchObject({
      reason: "missing-sun-crossing", sunCrossing: null, targetCrossing: target, lagMilliseconds: null
    });
  });

  it("does not borrow nearby events across halves or replace a missing direction", () => {
    const result = pairs([transits[0]!, event("set", 49), transits[1]!, event("rise", 51), transits[2]!],
      [event("rise", 49), event("set", 51)]);
    expect(result.every((pair) => pair.reason === "missing-sun-crossing")).toBe(true);
    expect(pairs(sun, [event("rise", 49), event("set", 51)]).map((pair) => pair.reason))
      .toEqual([null, "missing-target-crossing", "missing-target-crossing", null]);
  });

  it("counts repeated target directions throughout the complete half before clipping", () => {
    const first = event("rise", 10);
    const second = event("rise", 25);
    const target = [second, event("set", 30), first];
    for (const range of [[0, 100], [20, 31]] as const) {
      expect(pairs(sun, target, ...range)[0]).toMatchObject({
        reason: "multiple-target-crossings", targetCrossing: null, sunCrossing: sunrise, lagMilliseconds: null
      });
      expect(pairs(sun, target, ...range)[1]!.reason).toBeNull();
    }
    expect(pairs(sun, [first, first])[0]!.reason).toBe("multiple-target-crossings");
    expect(target).toEqual([second, event("set", 30), first]);
  });

  it("counts repeated solar directions outside the clipped request and leaves both pairs as gaps", () => {
    const ambiguousSun = [...sun, event("rise", 10)];
    const result = pairs(ambiguousSun, [event("rise", 25), event("set", 30)], 20, 31);
    expect(result.every((pair) => pair.reason === "multiple-sun-crossings"
      && pair.sunCrossing === null && pair.targetCrossing !== null && pair.lagMilliseconds === null)).toBe(true);
    expect(pairs([...sun, sunrise], [event("rise", 25)])[0]!.reason).toBe("multiple-sun-crossings");
  });

  it("gives a solar failure precedence while retaining a unique target crossing", () => {
    const target = event("rise", 10);
    const result = pairs(sun, [target], 21, 31)[0]!;
    expect(result.reason).toBe("sun-crossing-outside-range");
    expect(result.sunCrossing).toBe(sunrise);
    expect(result.targetCrossing).toBe(target);
    expect(result.lagMilliseconds).toBeNull();
  });

  it.each([
    { name: "absent anchors", anchors: [] },
    { name: "one anchor", anchors: [transits[0]!] },
    { name: "missing first bracket", anchors: [transits[1]!, transits[2]!] },
    { name: "missing last bracket", anchors: [transits[0]!, transits[1]!] },
    { name: "nonalternating anchors", anchors: [transits[0]!, event("lower-transit", 50), transits[2]!] },
    { name: "equal anchor times", anchors: [transits[0]!, event("upper-transit", 0), transits[2]!] },
    { name: "reversed anchors", anchors: [...transits].reverse() },
    { name: "invalid first anchor", anchors: [event("lower-transit", NaN), transits[1]!, transits[2]!] },
    { name: "invalid middle anchor", anchors: [transits[0]!, event("upper-transit", NaN), transits[2]!] },
    { name: "invalid last anchor", anchors: [transits[0]!, transits[1]!, event("lower-transit", NaN)] }
  ])("refuses $name without partial opportunities", ({ anchors }) => {
    const result = partitionHorizonPairs(anchors, [], 0, 100);
    expect(result.status).toBe("unresolved");
    expect(result).not.toHaveProperty("opportunities");
  });

  it.each(["rise", "set"] as const)("refuses invalid %s instants even outside the eligible direction", (kind) => {
    const bad = event(kind, NaN);
    expect(partitionHorizonPairs([...sun, bad], [], 0, 50).status).toBe("unresolved");
    expect(partitionHorizonPairs(sun, [bad], 0, 50).status).toBe("unresolved");
  });

  it.each([[NaN, 100], [0, Infinity], [-Infinity, 100], [0, 0], [100, 0]])(
    "refuses an invalid requested range (%s, %s)", (from, to) => {
      expect(partitionHorizonPairs(sun, [], from, to).status).toBe("unresolved");
    }
  );

  it("preserves event extensions and leaves frozen inputs unchanged", () => {
    const extendedSun = sun.map((entry) => Object.freeze({ ...entry, source: "sun" }));
    const extendedTarget = Object.freeze([{ ...event("rise", 10), source: "target" }]);
    const result = partitionHorizonPairs(Object.freeze(extendedSun), extendedTarget, 0, 100);
    if (result.status !== "complete") throw new Error(result.detail);
    expect(result.opportunities[0]!.sunCrossing!.source).toBe("sun");
    expect(result.opportunities[0]!.targetCrossing).toBe(extendedTarget[0]);
  });
});
