import { describe, expect, it } from "vitest";
import type { SkyEvent, SkyEventKind, SkyFlag } from "../../src/sky/riseset.js";
import { partitionWindows } from "../src/window-partition.js";

// Constructed timelines in integer milliseconds, not ephemeris fixtures.
// Expected intervals follow set intersection on the independently stated
// schedules. They test completeness of the partition, not sky accuracy.
function event(kind: SkyEventKind, at: number): SkyEvent {
  return { kind, at: new Date(at), altitude: 0, azimuth: 0 };
}
const transits = [event("upper-transit", 0), event("lower-transit", 50), event("upper-transit", 100)];
function timeline(events: readonly SkyEvent[], flags: SkyFlag[] = []) {
  return { events: [...events].sort((a, b) => a.at.getTime() - b.at.getTime()), flags };
}
const sun = timeline([...transits, event("set", 20), event("rise", 80)]);
const target = timeline([event("rise", 30), event("set", 70)]);
function intervals(result: ReturnType<typeof partitionWindows>) {
  if (result.status !== "complete") throw new Error(result.detail);
  return result.windows.map(({ from, to, period }) => [from, to, period]);
}

describe("constructed observing-window interval arithmetic", () => {
  it("intersects night, target above horizon and the solar meridian halves", () => {
    const result = partitionWindows(sun, target, 0, 100);
    expect(intervals(result)).toEqual([[30, 50, "evening"], [50, 70, "morning"]]);
    if (result.status !== "complete") throw new Error(result.detail);
    expect(result.windows[0]!.solarHalf).toEqual({ start: transits[0], end: transits[1] });
    expect(result.windows[1]!.solarHalf).toEqual({ start: transits[1], end: transits[2] });
  });

  it("clips both range edges and gives a transit to the following half", () => {
    expect(intervals(partitionWindows(sun, target, 40, 60))).toEqual([[40, 50, "evening"], [50, 60, "morning"]]);
    expect(intervals(partitionWindows(sun, target, 50, 51))).toEqual([[50, 51, "morning"]]);
    expect(intervals(partitionWindows(sun, target, 69, 70))).toEqual([[69, 70, "morning"]]);
    expect(intervals(partitionWindows(sun, target, 70, 71))).toEqual([]);
    expect(intervals(partitionWindows(sun, target, 0, 30))).toEqual([]);
    expect(intervals(partitionWindows(sun, target, 30, 31))).toEqual([[30, 31, "evening"]]);
  });

  it("retains one-sided horizon crossings without inventing the other event", () => {
    expect(intervals(partitionWindows(sun, timeline([event("rise", 30)]), 0, 100)))
      .toEqual([[30, 50, "evening"], [50, 80, "morning"]]);
    expect(intervals(partitionWindows(sun, timeline([event("set", 70)]), 0, 100)))
      .toEqual([[20, 50, "evening"], [50, 70, "morning"]]);
    expect(intervals(partitionWindows(timeline([...transits, event("set", 20)]), target, 0, 100)))
      .toEqual([[30, 50, "evening"], [50, 70, "morning"]]);
    expect(intervals(partitionWindows(timeline([...transits, event("rise", 80)]), target, 0, 100)))
      .toEqual([[30, 50, "evening"], [50, 70, "morning"]]);
  });

  it("uses scoped always-above/below flags when crossings are absent", () => {
    expect(intervals(partitionWindows(sun, timeline([], ["never-sets"]), 0, 100)))
      .toEqual([[20, 50, "evening"], [50, 80, "morning"]]);
    expect(intervals(partitionWindows(sun, timeline([], ["never-rises"]), 0, 100))).toEqual([]);
    expect(intervals(partitionWindows(timeline(transits, ["never-sets"]), target, 0, 100))).toEqual([]);
    expect(intervals(partitionWindows(timeline(transits, ["never-rises"]), timeline([], ["never-sets"]), 0, 100)))
      .toEqual([[0, 50, "evening"], [50, 100, "morning"]]);
  });

  it("omits zero-duration intersections at simultaneous Sun and target crossings", () => {
    expect(intervals(partitionWindows(sun, timeline([event("set", 20), event("rise", 80)]), 0, 100))).toEqual([]);
  });

  it.each([
    timeline([]), timeline([], ["never-rises", "never-sets"]),
    timeline([event("rise", 30)], ["never-sets"]),
    timeline([event("rise", 30), event("rise", 70)]),
    timeline([event("rise", 30), event("set", 30)])
  ])("does not resolve a missing or inconsistent target state", (badTarget) => {
    const result = partitionWindows(sun, badTarget, 0, 100);
    expect(result.status).toBe("unresolved");
    expect(result).not.toHaveProperty("windows");
  });

  it.each([
    [], [transits[1]!, transits[2]!], [transits[0]!, transits[1]!],
    [transits[0]!, event("upper-transit", 50), transits[2]!],
    [transits[0]!, event("lower-transit", 0), transits[2]!]
  ])("does not resolve missing or inconsistent solar half anchors", (...events) => {
    // Vitest spreads array table rows into positional arguments.
    const result = partitionWindows(timeline([...events, event("set", 20), event("rise", 80)]), target, 0, 100);
    expect(result.status).toBe("unresolved");
    expect(result).not.toHaveProperty("windows");
  });

  it("covers exactly the independently defined integer-time schedule across clipped ranges", () => {
    const sunSchedule = timeline([
      ...transits, event("lower-transit", 150), event("upper-transit", 200),
      event("set", 20), event("rise", 80), event("set", 120), event("rise", 180)
    ]);
    const targetSchedule = timeline([event("rise", 10), event("set", 40), event("rise", 95), event("set", 160)]);
    const cuts = [0, 10, 19, 20, 21, 39, 40, 49, 50, 51, 80, 95, 100, 120, 150, 160, 180, 200];
    for (const from of cuts) for (const to of cuts) {
      if (to <= from) continue;
      const result = partitionWindows(sunSchedule, targetSchedule, from, to);
      if (result.status !== "complete") throw new Error(result.detail);
      for (let t = from; t < to; t += 1) {
        const selected = result.windows.filter((window) => window.from <= t && t < window.to);
        const night = (20 <= t && t < 80) || (120 <= t && t < 180);
        const above = (10 <= t && t < 40) || (95 <= t && t < 160);
        expect(selected.length).toBe(night && above ? 1 : 0);
        if (selected.length) expect(selected[0]!.period).toBe(t % 100 < 50 ? "evening" : "morning");
      }
    }
  });
});
