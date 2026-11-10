import { describe, expect, it } from "vitest";
import type { SkyEvent, SkyEventKind } from "../../src/sky/riseset.js";
import { partitionHorizonOpportunities } from "../src/appearance-sequence.js";

// Invented integer-millisecond schedules check ownership and adjacency only.
// They are independently specified interval examples, not ephemeris fixtures.
function event(kind: SkyEventKind, at: number): SkyEvent {
  return { kind, at: new Date(at), altitude: 0, azimuth: 0 };
}
const transits = [
  event("upper-transit", 0), event("lower-transit", 50), event("upper-transit", 100),
  event("lower-transit", 150), event("upper-transit", 200), event("lower-transit", 250)
];

function opportunities(sun: readonly SkyEvent[], target: readonly SkyEvent[], from = 0, to = 250) {
  const result = partitionHorizonOpportunities(sun, target, from, to);
  if (result.status !== "complete") throw new Error(result.detail);
  return result.opportunities;
}

describe("constructed horizon appearance opportunities", () => {
  it("retains every solar half, including missing morning and evening crossings", () => {
    const target = [event("set", 30), event("rise", 80), event("set", 230)];
    const result = opportunities(transits, target);
    expect(result.map(({ period, from, to, crossing, reason }) => [period, from, to, crossing?.at.getTime() ?? null, reason]))
      .toEqual([
        ["evening", 0, 50, 30, null], ["morning", 50, 100, 80, null],
        ["evening", 100, 150, null, "missing-crossing"], ["morning", 150, 200, null, "missing-crossing"],
        ["evening", 200, 250, 230, null]
      ]);
    for (let i = 0; i < result.length; i += 1) {
      expect(result[i]!.solarHalf.start).toBe(transits[i]);
      expect(result[i]!.solarHalf.end).toBe(transits[i + 1]);
    }
    expect(result[0]!.crossing).toBe(target[0]);
  });

  it("retains daylight opportunities without consulting solar rise or set", () => {
    const sun = [transits[0]!, event("set", 40), transits[1]!, event("rise", 60), transits[2]!];
    const target = [event("set", 20), event("rise", 80)];
    expect(opportunities(sun, target, 0, 100).map(({ crossing, reason }) => [crossing?.at.getTime(), reason]))
      .toEqual([[20, null], [80, null]]);
  });

  it("ignores the wrong crossing kind and target transits within a half", () => {
    const target = [event("rise", 20), event("upper-transit", 30), event("set", 80), event("lower-transit", 90)];
    expect(opportunities(transits, target, 0, 100).map(({ crossing, reason }) => [crossing, reason]))
      .toEqual([[null, "missing-crossing"], [null, "missing-crossing"]]);
  });

  it("marks multiple eligible crossings in a full half without choosing either one", () => {
    const target = [event("set", 20), event("set", 30), event("rise", 70), event("rise", 80)];
    expect(opportunities(transits, target, 25, 75).map(({ from, to, crossing, reason }) => [from, to, crossing, reason]))
      .toEqual([[0, 50, null, "multiple-crossings"], [50, 100, null, "multiple-crossings"]]);
  });

  it("gives a crossing at a solar transit only to the following half", () => {
    const target = [event("set", 0), event("set", 50), event("rise", 50), event("rise", 100), event("set", 100)];
    expect(opportunities(transits, target, 0, 150).map(({ period, crossing, reason }) => [period, crossing?.at.getTime(), reason]))
      .toEqual([["evening", 0, null], ["morning", 50, null], ["evening", 100, null]]);
    expect(opportunities(transits, target, 50, 100)).toHaveLength(1);
    expect(opportunities(transits, target, 50, 100)[0]!.period).toBe("morning");
  });

  it("keeps full anchors and outside-range crossings when the request clips a half", () => {
    const set = event("set", 20);
    const rise = event("rise", 80);
    const result = opportunities(transits, [set, rise], 30, 70);
    expect(result).toEqual([
      { period: "evening", from: 0, to: 50, solarHalf: { start: transits[0], end: transits[1] }, crossing: set, reason: "crossing-outside-range" },
      { period: "morning", from: 50, to: 100, solarHalf: { start: transits[1], end: transits[2] }, crossing: rise, reason: "crossing-outside-range" }
    ]);
  });

  it("includes a crossing at from and excludes a crossing at to", () => {
    const target = [event("set", 20), event("rise", 80)];
    expect(opportunities(transits, target, 20, 80).map(({ crossing, reason }) => [crossing?.at.getTime(), reason]))
      .toEqual([[20, null], [80, "crossing-outside-range"]]);
    expect(opportunities(transits, target, 20, 21).map(({ crossing, reason }) => [crossing?.at.getTime(), reason]))
      .toEqual([[20, null]]);
  });

  it("does not include halves merely touching either requested edge", () => {
    const result = opportunities(transits, [], 50, 200);
    expect(result.map(({ from, to }) => [from, to])).toEqual([[50, 100], [100, 150], [150, 200]]);
  });

  it.each([
    { name: "no transits", sun: [] },
    { name: "only one transit", sun: [transits[0]!] },
    { name: "no preceding anchor", sun: transits.slice(1) },
    { name: "no following anchor", sun: transits.slice(0, -1) },
    { name: "repeated transit kind", sun: [transits[0]!, event("upper-transit", 50), ...transits.slice(2)] },
    { name: "simultaneous transits", sun: [transits[0]!, event("lower-transit", 0), ...transits.slice(2)] },
    { name: "reversed transits", sun: [transits[0]!, transits[3]!, transits[2]!, transits[5]!] },
    { name: "invalid transit instant", sun: [transits[0]!, event("lower-transit", NaN), ...transits.slice(2)] }
  ])("refuses $name without extrapolating or sorting the source", ({ sun }) => {
    const result = partitionHorizonOpportunities(sun, [], 0, 250);
    expect(result.status).toBe("unresolved");
    expect(result).not.toHaveProperty("opportunities");
  });

  it("does not interpret an invalid target horizon instant as an absent crossing", () => {
    expect(partitionHorizonOpportunities(transits, [event("rise", NaN)], 0, 250).status).toBe("unresolved");
  });

  it.each([[0, 0], [100, 0], [NaN, 100], [0, Infinity]])("refuses invalid range [%s, %s)", (from, to) => {
    expect(partitionHorizonOpportunities(transits, [], from, to).status).toBe("unresolved");
  });
});
