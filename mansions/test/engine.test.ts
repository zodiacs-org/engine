import { describe, expect, it } from "vitest";

import { calc } from "../../src/calc.js";
import type { CalcPosition, CalcRefusal } from "../../src/calc.js";
import { positions } from "../../src/index.js";
import { ENGINE_VERSION, EPHEMERIS } from "../../src/types.js";
import { searchLongitudeCrossingsWith, tropicalMoon } from "../src/engine.js";

// Invented test instants, unrelated to any person's birth data.
const ISO = "2001-02-03T04:05:06.000Z";
const DAY_MS = 86_400_000;

function computed(result: CalcPosition | CalcRefusal): CalcPosition {
  if (result.status !== "ok") throw new Error(`Unexpected engine refusal: ${result.reason}`);
  return result;
}

describe("local engine integration (regression checks, not accuracy evidence)", () => {
  it("uses the engine's tropical geocentric Moon longitude", () => {
    const result = computed(tropicalMoon(ISO));
    const moon = positions(ISO).find((row) => row.body === "Moon");
    expect(moon).toBeDefined();
    expect(result.lon).toBe(moon!.lon);
    expect(result.lat).toBe(moon!.lat);
    expect(result.speeds).toBeNull();
  });

  it("retains a JSON-replayable engine receipt and its time basis", () => {
    const result = computed(tropicalMoon(ISO));
    expect(result.receipt.engine).toEqual({
      name: "@zodiacs/engine",
      version: ENGINE_VERSION,
      ephemeris: EPHEMERIS
    });
    expect(result.receipt.instants).toHaveLength(1);
    expect(result.receipt.instants[0]?.utc).toBe(ISO);
    expect(result.receipt.instants[0]?.timeScale.input).toBe("utc");
    expect(result.receipt.conventions).toContain("zodiac:tropical");
    expect(result.receipt.request.body).toBe("Moon");
    expect(calc(JSON.parse(JSON.stringify(result.receipt.request)))).toEqual(result);
  });

  it("does not mutate a supplied Date or depend on an intervening call", () => {
    const time = new Date(ISO);
    const before = time.getTime();
    const first = tropicalMoon(time);
    tropicalMoon("1901-06-07T08:09:10Z");
    expect(tropicalMoon(time)).toEqual(first);
    expect(time.getTime()).toBe(before);
  });

  it("preserves coverage refusals and engine date validation", () => {
    expect(tropicalMoon("1701-02-03T04:05:06Z")).toMatchObject({
      status: "refused",
      reason: "out-of-range"
    });
    for (const time of ["2001-02-30", "2001-02-03T04:05:06", new Date(NaN)]) {
      expect(() => tropicalMoon(time)).toThrow(RangeError);
    }
  });

  it("can feed Moon samples into the existing crossing solver", () => {
    const start = new Date(ISO);
    const end = new Date(start.getTime() + DAY_MS);
    const initial = computed(tropicalMoon(start)).lon;
    const target = (initial + 3) % 360;
    const result = searchLongitudeCrossingsWith(
      (_body: "Moon", time) => computed(tropicalMoon(time)).lon,
      "Moon", target, start, end, { stepDays: 0.25, maxSamples: 500 }
    );
    expect(result.status).toBe("complete");
    expect(result.crossings).toHaveLength(1);
    const crossing = result.crossings[0]!;
    expect(crossing.retrograde).toBe(false);
    expect(crossing.at.getTime()).toBeGreaterThan(start.getTime());
    expect(crossing.at.getTime()).toBeLessThan(end.getTime());
    const offset = (ms: number) => {
      const lon = computed(tropicalMoon(new Date(ms))).lon;
      return ((lon - target + 540) % 360) - 180;
    };
    expect(offset(crossing.at.getTime() - 1000)).toBeLessThan(0);
    expect(offset(crossing.at.getTime() + 1000)).toBeGreaterThan(0);
    expect(computed(tropicalMoon(crossing.at)).receipt.request.body).toBe("Moon");
  });
});

describe("shared solver with independently derived synthetic motion", () => {
  it("crosses zero after a quarter day when starting at 350 degrees at 40 degrees/day", () => {
    const start = new Date(ISO);
    const result = searchLongitudeCrossingsWith(
      (_body: "Moon", time) => (350 + 40 * (time.getTime() - start.getTime()) / DAY_MS) % 360,
      "Moon", 0, start, new Date(start.getTime() + DAY_MS),
      { stepDays: 0.25, maxSamples: 100 }
    );
    expect(result.status).toBe("complete");
    expect(result.crossings).toEqual([
      { at: new Date(start.getTime() + DAY_MS / 4), retrograde: false }
    ]);
  });

  it("retains the engine's (from, to] endpoint convention", () => {
    const start = new Date(ISO);
    const end = new Date(start.getTime() + DAY_MS / 4);
    const longitude = (_body: "Moon", time: Date) => 40 * (time.getTime() - start.getTime()) / DAY_MS;
    expect(searchLongitudeCrossingsWith(longitude, "Moon", 0, start, end).crossings).toEqual([]);
    expect(searchLongitudeCrossingsWith(longitude, "Moon", 10, start, end).crossings).toEqual([
      { at: end, retrograde: false }
    ]);
  });

  it("refuses a coarse scan over budget without returning partial roots", () => {
    let samples = 0;
    const result = searchLongitudeCrossingsWith(
      () => { samples += 1; return 0; },
      "Moon", 0, new Date(ISO), new Date(Date.parse(ISO) + DAY_MS),
      { stepDays: 0.25, maxSamples: 2 }
    );
    expect(result).toEqual({
      status: "refused", reason: "sample-budget", samples: 0, maxSamples: 2, crossings: []
    });
    expect(samples).toBe(0);
  });
});
