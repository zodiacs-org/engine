import { beforeEach, describe, expect, it, vi } from "vitest";
import { bodyLongitude } from "./ephemeris.js";
import { computeSaturnReturns, findLongitudeCrossings, searchLongitudeCrossings } from "./returns.js";

vi.mock("./ephemeris.js", () => ({
  SPEED_STEP_DAYS: 0.001,
  bodyLongitude: vi.fn(),
  longitudeSpeed: vi.fn()
}));

const DAY = 86_400_000;
const start = new Date("2024-01-01T00:00:00Z");
const end = new Date("2024-01-02T00:00:00Z");
const longitude = vi.mocked(bodyLongitude);
const refused = (samples: number, maxSamples: number) => ({
  status: "refused",
  reason: "sample-budget",
  samples,
  maxSamples,
  crossings: []
});

beforeEach(() => {
  longitude.mockReset();
  longitude.mockReturnValue(180);
});

describe("longitude crossing searches, with and without a budget", () => {
  it.each([Number.MIN_VALUE, 1e-20, 0.5 / DAY, Number.MAX_VALUE])(
    "rejects a nonrepresentable millisecond step %s before ephemeris work",
    (stepDays) => {
      expect(() => findLongitudeCrossings("Sun", 0, start, end, stepDays)).toThrowError(
        /finite step of at least one millisecond/u
      );
      expect(() => searchLongitudeCrossings("Sun", 0, start, end, { stepDays })).toThrowError(
        /finite step of at least one millisecond/u
      );
      expect(longitude).not.toHaveBeenCalled();
    }
  );

  it.each([0, -1, NaN, Infinity])("rejects invalid step %s", (stepDays) => {
    expect(() => findLongitudeCrossings("Sun", 0, start, end, stepDays)).toThrowError(
      /stepDays must be positive/u
    );
    expect(() => searchLongitudeCrossings("Sun", 0, start, end, { stepDays })).toThrowError(
      /stepDays must be positive/u
    );
    expect(longitude).not.toHaveBeenCalled();
  });

  it("refuses an excessive coarse scan before ephemeris work, without throwing", () => {
    expect(
      searchLongitudeCrossings("Sun", 0, start, end, { stepDays: 1 / DAY, maxSamples: 10_000 })
    ).toEqual(refused(0, 10_000));
    expect(longitude).not.toHaveBeenCalled();
  });

  it("stops at the budget when refinements pass it, and has no budget of its own", () => {
    // This deliberately adversarial ephemeris alternates sides at each day.
    // The coarse scan fits the budget; the refinements exhaust it.
    longitude.mockImplementation((_body, date) =>
      Math.floor((date.getTime() - start.getTime()) / DAY) % 2 === 0 ? 359 : 1
    );
    const to = new Date(start.getTime() + 1_000 * DAY);
    expect(searchLongitudeCrossings("Sun", 0, start, to, { stepDays: 1, maxSamples: 10_000 })).toEqual(
      refused(10_000, 10_000)
    );
    expect(longitude).toHaveBeenCalledTimes(10_000);
    longitude.mockClear();
    const crossings = findLongitudeCrossings("Sun", 0, start, to, 1);
    expect(crossings).toHaveLength(1_000);
    expect(longitude).toHaveBeenCalledTimes(1_001 + 24 * 1_000);
    expect(searchLongitudeCrossings("Sun", 0, start, to, { stepDays: 1 })).toEqual({
      status: "complete",
      crossings,
      samples: 25_001
    });
  });

  it("accepts a coarse scan of exactly the budget and clips the last interval", () => {
    const to = new Date(start.getTime() + 9_998.5 * DAY);
    expect(searchLongitudeCrossings("Sun", 0, start, to, { stepDays: 1, maxSamples: 10_000 })).toEqual({
      status: "complete",
      crossings: [],
      samples: 10_000
    });
    expect(longitude).toHaveBeenCalledTimes(10_000);
    expect(longitude).toHaveBeenLastCalledWith("Sun", to);
    longitude.mockClear();
    expect(searchLongitudeCrossings("Sun", 0, start, to, { stepDays: 1, maxSamples: 9_999 })).toEqual(
      refused(0, 9_999)
    );
    expect(longitude).not.toHaveBeenCalled();
  });

  it("handles a zero-length window without sampling", () => {
    expect(findLongitudeCrossings("Sun", 0, start, start)).toEqual([]);
    expect(searchLongitudeCrossings("Sun", 0, start, start, { maxSamples: 1 })).toEqual({
      status: "complete",
      crossings: [],
      samples: 0
    });
    expect(longitude).not.toHaveBeenCalled();
  });

  it("rejects invalid dates, reversed windows, and non-finite targets", () => {
    for (const search of [
      (target: number, from: Date, to: Date) => findLongitudeCrossings("Sun", target, from, to),
      (target: number, from: Date, to: Date) => searchLongitudeCrossings("Sun", target, from, to)
    ]) {
      expect(() => search(0, new Date(NaN), end)).toThrowError(/valid Date/u);
      expect(() => search(0, start, new Date(NaN))).toThrowError(/valid Date/u);
      expect(() => search(0, end, start)).toThrowError(/from <= to/u);
      expect(() => search(NaN, start, end)).toThrowError(/finite/u);
      expect(() => search(Infinity, start, end)).toThrowError(/finite/u);
    }
    expect(longitude).not.toHaveBeenCalled();
  });

  it.each([0, -1, 2.5, NaN])("rejects a budget of %s before ephemeris work", (maxSamples) => {
    expect(() => searchLongitudeCrossings("Sun", 0, start, end, { maxSamples })).toThrowError(
      /maxSamples must be a positive integer/u
    );
    expect(longitude).not.toHaveBeenCalled();
  });

  it("rejects non-finite ephemeris output explicitly", () => {
    longitude.mockReturnValue(NaN);
    expect(() => findLongitudeCrossings("Sun", 0, start, end)).toThrowError(
      /non-finite longitude/u
    );
    expect(() => searchLongitudeCrossings("Sun", 0, start, end, { maxSamples: 100 })).toThrowError(
      /non-finite longitude/u
    );
  });

  it("rejects overflowing Saturn windows before ephemeris work", () => {
    expect(() => computeSaturnReturns(new Date(8.64e15))).toThrowError(/valid Date/u);
    expect(() => computeSaturnReturns(new Date(-8.64e15))).toThrowError(/valid Date/u);
    expect(longitude).not.toHaveBeenCalled();
  });
});
