import { beforeEach, describe, expect, it, vi } from "vitest";
import { bodyLongitude } from "./ephemeris.js";
import { computeSaturnReturns, findLongitudeCrossings } from "./returns.js";

vi.mock("./ephemeris.js", () => ({ bodyLongitude: vi.fn() }));

const DAY = 86_400_000;
const start = new Date("2024-01-01T00:00:00Z");
const end = new Date("2024-01-02T00:00:00Z");
const longitude = vi.mocked(bodyLongitude);

beforeEach(() => {
  longitude.mockReset();
  longitude.mockReturnValue(180);
});

describe("bounded longitude crossing searches", () => {
  it.each([Number.MIN_VALUE, 1e-20, 0.5 / DAY, Number.MAX_VALUE])(
    "rejects a nonrepresentable millisecond step %s before ephemeris work",
    (stepDays) => {
      expect(() => findLongitudeCrossings("Sun", 0, start, end, stepDays)).toThrowError(
        /finite step of at least one millisecond/u
      );
      expect(longitude).not.toHaveBeenCalled();
    }
  );

  it.each([0, -1, NaN, Infinity])("rejects invalid step %s", (stepDays) => {
    expect(() => findLongitudeCrossings("Sun", 0, start, end, stepDays)).toThrowError(
      /stepDays must be positive/u
    );
    expect(longitude).not.toHaveBeenCalled();
  });

  it("rejects an excessive coarse scan before ephemeris work", () => {
    expect(() => findLongitudeCrossings("Sun", 0, start, end, 1 / DAY)).toThrowError(
      /10,000-sample budget/u
    );
    expect(longitude).not.toHaveBeenCalled();
  });

  it("counts refinement samples toward the runtime budget", () => {
    // This deliberately adversarial ephemeris alternates sides at each day.
    // The coarse scan fits the limit; repeated refinements exhaust the budget.
    longitude.mockImplementation((_body, date) =>
      Math.floor((date.getTime() - start.getTime()) / DAY) % 2 === 0 ? 359 : 1
    );
    expect(() =>
      findLongitudeCrossings("Sun", 0, start, new Date(start.getTime() + 1_000 * DAY), 1)
    ).toThrowError(/10,000-sample budget/u);
    expect(longitude).toHaveBeenCalledTimes(10_000);
  });

  it("accepts the exact coarse-sample budget and clips the last interval", () => {
    const to = new Date(start.getTime() + 9_998.5 * DAY);
    expect(findLongitudeCrossings("Sun", 0, start, to, 1)).toEqual([]);
    expect(longitude).toHaveBeenCalledTimes(10_000);
    expect(longitude).toHaveBeenLastCalledWith("Sun", to);
  });

  it("handles a zero-length window without scanning", () => {
    expect(findLongitudeCrossings("Sun", 0, start, start)).toEqual([]);
    expect(longitude).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid dates, reversed windows, and non-finite targets", () => {
    expect(() => findLongitudeCrossings("Sun", 0, new Date(NaN), end)).toThrowError(/valid Date/u);
    expect(() => findLongitudeCrossings("Sun", 0, start, new Date(NaN))).toThrowError(
      /valid Date/u
    );
    expect(() => findLongitudeCrossings("Sun", 0, end, start)).toThrowError(/from <= to/u);
    expect(() => findLongitudeCrossings("Sun", NaN, start, end)).toThrowError(/finite/u);
    expect(() => findLongitudeCrossings("Sun", Infinity, start, end)).toThrowError(/finite/u);
    expect(longitude).not.toHaveBeenCalled();
  });

  it("rejects non-finite ephemeris output explicitly", () => {
    longitude.mockReturnValue(NaN);
    expect(() => findLongitudeCrossings("Sun", 0, start, end)).toThrowError(
      /non-finite longitude/u
    );
  });

  it("rejects overflowing Saturn windows before ephemeris work", () => {
    expect(() => computeSaturnReturns(new Date(8.64e15))).toThrowError(/valid Date/u);
    expect(() => computeSaturnReturns(new Date(-8.64e15))).toThrowError(/valid Date/u);
    expect(longitude).not.toHaveBeenCalled();
  });
});
