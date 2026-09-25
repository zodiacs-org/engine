import { beforeEach, describe, expect, it, vi } from "vitest";
import { bodyLongitude } from "./ephemeris.js";
import { findLongitudeCrossings } from "./returns.js";

vi.mock("./ephemeris.js", () => ({ bodyLongitude: vi.fn() }));

const DAY = 86_400_000;
const longitude = vi.mocked(bodyLongitude);
const normalize = (value: number) => ((value % 360) + 360) % 360;

function linearCrossing(atDay: number, direction: number): void {
  longitude.mockImplementation((_body, date) =>
    normalize(direction * (date.getTime() / DAY - atDay))
  );
}

beforeEach(() => {
  longitude.mockReset();
});

describe.each([
  { direction: 1, retrograde: false },
  { direction: -1, retrograde: true }
])("exact crossing boundaries, direction $direction", ({ direction, retrograde }) => {
  it("leaves an exact root at from to the window that ends there", () => {
    linearCrossing(0, direction);
    expect(findLongitudeCrossings("Sun", 0, new Date(0), new Date(2 * DAY), 1)).toEqual([]);
  });

  it.each([1, 2])("reports an exact root at day %s once", (day) => {
    linearCrossing(day, direction);
    expect(findLongitudeCrossings("Sun", 0, new Date(0), new Date(2 * DAY), 1)).toEqual([
      { at: new Date(day * DAY), retrograde }
    ]);
  });

  it("retains ordinary roots between coarse samples within the refinement tolerance", () => {
    const day = 1.123456;
    linearCrossing(day, direction);
    const crossings = findLongitudeCrossings("Sun", 0, new Date(0), new Date(2 * DAY), 1);
    expect(crossings).toHaveLength(1);
    expect(crossings[0]?.retrograde).toBe(retrograde);
    expect(Math.abs(crossings[0]!.at.getTime() - day * DAY)).toBeLessThanOrEqual(DAY / 2 ** 24 + 1);
  });

  it("does not infer direction from an isolated zero-length window", () => {
    linearCrossing(1, direction);
    expect(findLongitudeCrossings("Sun", 0, new Date(DAY), new Date(DAY), 1)).toEqual([]);
    expect(longitude).not.toHaveBeenCalled();
  });

  it("reports an exact touch at a coarse sample once, in the direction it arrived", () => {
    longitude.mockImplementation((_body, date) =>
      normalize(direction * (date.getTime() / DAY - 1) ** 2)
    );
    // Coming down onto the degree is backward motion.
    expect(findLongitudeCrossings("Sun", 0, new Date(0), new Date(2 * DAY), 1)).toEqual([
      { at: new Date(DAY), retrograde: direction > 0 }
    ]);
  });

  it("finds both crossings of a station that falls between two samples", () => {
    longitude.mockImplementation((_body, date) =>
      normalize(direction * (0.001 - 0.001 * (date.getTime() / DAY - 12.5) ** 2))
    );
    const crossings = findLongitudeCrossings("Saturn", 0, new Date(0), new Date(25 * DAY));
    expect(crossings.map((crossing) => crossing.retrograde)).toEqual(
      direction > 0 ? [false, true] : [true, false]
    );
    expect(Math.abs(crossings[0]!.at.getTime() - 11.5 * DAY)).toBeLessThan(1_000);
    expect(Math.abs(crossings[1]!.at.getTime() - 13.5 * DAY)).toBeLessThan(1_000);
  });
});

it("reports a sampled zero plateau once, where it begins", () => {
  longitude.mockImplementation((_body, date) => {
    const day = date.getTime() / DAY;
    return day < 1 ? 359 : day <= 2 ? 0 : 1;
  });
  expect(findLongitudeCrossings("Sun", 0, new Date(0), new Date(3 * DAY), 1)).toEqual([
    { at: new Date(DAY), retrograde: false }
  ]);
});

it("does not infer direction from an antipodal adjacent sample", () => {
  longitude.mockImplementation((_body, date) => (date.getTime() === 0 ? 0 : 180));
  expect(findLongitudeCrossings("Sun", 0, new Date(0), new Date(DAY), 1)).toEqual([]);
});
