/*
 * The end of the IERS table as a seam of the birth-window search
 * (src/window.ts, onePiece and seamsIn).
 *
 * On UTC input TT − UTC is 69.184 s on both sides of 2027-10-02T00:00Z (the
 * continuous-UTC rule, docs/time.md), so elapsedDays finds no step there; but
 * UT1 − UTC moves from the table's last value to the ΔT model's (by 2 ms), and
 * the angles with it. The window keeps the change of basis as a seam, and so
 * evaluates the millisecond either side of it, as at every other step of the
 * time basis. Removing the basis comparison from onePiece fails this file.
 * Synthetic place only.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => new Set<number>());
vi.mock("./time-scale.js", async (original) => {
  const actual = await original<typeof import("./time-scale.js")>();
  return {
    ...actual,
    timeBasis: (ms: number, scale?: Parameters<typeof actual.timeBasis>[1], pin?: number) => {
      if (scale === undefined || scale === "utc") calls.add(ms);
      return actual.timeBasis(ms, scale, pin);
    }
  };
});

const { UT1_TO_MS } = await import("./time-scale-data.js");
const { timeBasis } = await import("./time-scale.js");
const { partition, expectExact } = await import("./window.testkit.js");

afterEach(() => calls.clear());

describe("the end of the IERS table in a birth window on UTC input", () => {
  const place = { latitude: 48.2, longitude: 16.37, houseSystem: "placidus" as const };

  it("is a change of basis with TT running on, which elapsedDays alone would not report", async () => {
    const { elapsedDays } = await import("./time-scale.js");
    const [before, after] = [timeBasis(UT1_TO_MS), timeBasis(UT1_TO_MS + 1)];
    expect([before.timeScale.basis, after.timeScale.basis]).toEqual(["iers", "continuous-utc"]);
    expect(elapsedDays(before, after, Number.NaN)).toBeNaN();
  });

  it("is a seam: the search evaluates the last millisecond of the table and the two after it", () => {
    // A window that starts and ends on odd milliseconds, so that nothing but a seam lands on these instants.
    const start = UT1_TO_MS - 3_600_000 + 337;
    const window = partition(start, 7_200_000, place);
    expect(window.flags).toEqual([]);
    for (const at of [UT1_TO_MS, UT1_TO_MS + 1, UT1_TO_MS + 2]) expect(calls.has(at), new Date(at).toISOString()).toBe(true);
    expectExact(window, place);
  }, 120_000);
});
