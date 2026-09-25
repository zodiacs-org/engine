/**
 * The crossing solver on synthetic longitudes (brief v1 rule 1i). The first
 * two groups are the site's longitude-crossings.test.ts and the synthetic half
 * of its grazing-crossings.test.ts, run against the package's solver.
 */
import { describe, expect, it } from "vitest";
import {
  findLongitudeCrossingsWith,
  searchLongitudeCrossingsWith,
  type BodyLongitudeAt,
  type CrossingSearchOptions
} from "./crossings.js";

const DAY = 86_400_000;
const normalize = (value: number) => ((value % 360) + 360) % 360;
const byDay =
  (longitudeAtDay: (day: number) => number): BodyLongitudeAt =>
  (_body, date) =>
    normalize(longitudeAtDay(date.getTime() / DAY));

function counted(longitudeAtDay: (day: number) => number) {
  const calls: number[] = [];
  const longitudeAt: BodyLongitudeAt = (_body, date) => {
    calls.push(date.getTime());
    return normalize(longitudeAtDay(date.getTime() / DAY));
  };
  return { calls, longitudeAt };
}

describe("longitude crossing interval (from, to]", () => {
  const crossings = (longitudeAtDay: (day: number) => number, target: number) =>
    findLongitudeCrossingsWith(byDay(longitudeAtDay), "Sun", target, new Date(0), new Date(2 * DAY), 1);

  for (const retrograde of [false, true]) {
    const direction = retrograde ? "retrograde" : "direct";
    const longitude = (day: number) => (retrograde ? 20 - 10 * day : 10 * day);

    it(`${direction}: excludes an exact lower endpoint`, () => {
      expect(crossings(longitude, longitude(0))).toEqual([]);
    });

    it(`${direction}: emits an exact internal sample once`, () => {
      expect(crossings(longitude, longitude(1))).toEqual([{ at: new Date(DAY), retrograde }]);
    });

    it(`${direction}: includes an exact upper endpoint once`, () => {
      expect(crossings(longitude, longitude(2))).toEqual([{ at: new Date(2 * DAY), retrograde }]);
    });

    it(`${direction}: still bisects between samples`, () => {
      const result = crossings(longitude, longitude(0.375));
      expect(result).toHaveLength(1);
      expect(result[0]?.retrograde).toBe(retrograde);
      // One 24-step bisection of a day is 5.15 ms; Date adds under 1 ms.
      expect(Math.abs(result[0]!.at.getTime() - 0.375 * DAY)).toBeLessThanOrEqual(6);
    });

    it(`${direction}: recognizes the real 360° wrap once`, () => {
      const wrap = (day: number) => (retrograde ? 10 - 10 * day : 350 + 10 * day);
      expect(crossings(wrap, 0)).toEqual([{ at: new Date(DAY), retrograde }]);
    });

    it(`${direction}: rejects the antipodal sign change`, () => {
      const opposite = (day: number) => (retrograde ? 190 - 10 * day : 170 + 10 * day);
      expect(crossings(opposite, 0)).toEqual([]);
    });
  }

  it("reports a touch at a coarse sample once, in the direction it arrived", () => {
    // Down onto 100° by day 1 and back up: it arrives moving backward.
    const touch = (day: number) => 100 + (day - 1) ** 2;
    expect(crossings(touch, 100)).toEqual([{ at: new Date(DAY), retrograde: true }]);
    expect(crossings((day) => 200 - touch(day), 100)).toEqual([
      { at: new Date(DAY), retrograde: false }
    ]);
  });

  it("reports a sampled plateau on the target once, where it begins", () => {
    const plateau = (day: number) => (day < 1 ? 359 : day <= 2 ? 0 : 1);
    expect(
      findLongitudeCrossingsWith(byDay(plateau), "Sun", 0, new Date(0), new Date(3 * DAY), 1)
    ).toEqual([{ at: new Date(DAY), retrograde: false }]);
  });

  it("has no crossings, and takes no sample, in a zero-length window", () => {
    const { calls, longitudeAt } = counted((day) => 10 * day - 10);
    expect(findLongitudeCrossingsWith(longitudeAt, "Sun", 0, new Date(DAY), new Date(DAY))).toEqual(
      []
    );
    expect(calls).toEqual([]);
  });
});

describe("grazing crossing pairs", () => {
  it("finds a synthetic pair inside one 5-day cell", () => {
    for (const dip of [0.005, 0.001, 1e-6]) {
      const k = 0.001;
      const found = findLongitudeCrossingsWith(
        byDay((day) => 100 + dip - k * (day - 12.5) ** 2),
        "Mars",
        100,
        new Date(0),
        new Date(25 * DAY),
        5
      );
      const half = Math.sqrt(dip / k);
      expect(found.map((crossing) => crossing.retrograde)).toEqual([false, true]);
      expect(Math.abs(found[0]!.at.getTime() / DAY - (12.5 - half))).toBeLessThan(1e-6);
      expect(Math.abs(found[1]!.at.getTime() / DAY - (12.5 + half))).toBeLessThan(1e-6);
    }
  });

  it("never evaluates outside [from, to], and finds a pair in the first or the last cell", () => {
    for (const center of [1.5, 23.5]) {
      const { calls, longitudeAt } = counted((day) => 100 + 0.001 - 0.001 * (day - center) ** 2);
      const found = findLongitudeCrossingsWith(longitudeAt, "Mars", 100, new Date(0), new Date(25 * DAY), 5);
      expect(Math.min(...calls)).toBeGreaterThanOrEqual(0);
      expect(Math.max(...calls)).toBeLessThanOrEqual(25 * DAY);
      expect(found.map((crossing) => crossing.retrograde), `center ${center}`).toEqual([false, true]);
    }
  });

  it("finds a pair inside a window of one short cell", () => {
    const found = findLongitudeCrossingsWith(
      byDay((day) => 100 + 0.001 - 0.001 * (day - 1.5) ** 2),
      "Mars",
      100,
      new Date(0),
      new Date(4 * DAY),
      5
    );
    expect(found.map((crossing) => crossing.retrograde)).toEqual([false, true]);
  });

  it("reports an extremum that only touches the target once, as direct", () => {
    // Samples at days 0, 5, 10, 15 and 20 straddle the touch at day 12.
    const found = findLongitudeCrossingsWith(
      byDay((day) => 100 - 0.001 * (day - 12) ** 2),
      "Mars",
      100,
      new Date(0),
      new Date(20 * DAY),
      5
    );
    expect(found).toHaveLength(1);
    expect(found[0]?.retrograde).toBe(false);
    expect(Math.abs(found[0]!.at.getTime() - 12 * DAY)).toBeLessThan(1_000);
  });

  it("leaves an extremum short of the target alone", () => {
    expect(
      findLongitudeCrossingsWith(
        byDay((day) => 100 - 1e-6 - 0.001 * (day - 12.5) ** 2),
        "Mars",
        100,
        new Date(0),
        new Date(25 * DAY),
        5
      )
    ).toEqual([]);
  });

  it("takes one sample per step and 24 per crossing where nothing turns", () => {
    // 3.1° a day puts the three crossings between samples.
    const { calls, longitudeAt } = counted((day) => 3.1 * day);
    const found = findLongitudeCrossingsWith(longitudeAt, "Mars", 0, new Date(0), new Date(400 * DAY), 5);
    expect(found.map((crossing) => Math.round(crossing.at.getTime() / DAY))).toEqual([116, 232, 348]);
    expect(calls).toHaveLength(81 + 24 * 3);
  });
});

describe("sample budget", () => {
  const refused = (samples: number, maxSamples: number) => ({
    status: "refused",
    reason: "sample-budget",
    samples,
    maxSamples,
    crossings: []
  });
  const alternating = (day: number) => (Math.floor(day) % 2 === 0 ? 359 : 1);
  const search = (
    longitudeAt: BodyLongitudeAt,
    days: number,
    options?: CrossingSearchOptions
  ) => searchLongitudeCrossingsWith(longitudeAt, "Sun", 0, new Date(0), new Date(days * DAY), options);

  it("has no limit unless one is given", () => {
    const { calls, longitudeAt } = counted(alternating);
    const result = search(longitudeAt, 1_000, { stepDays: 1 });
    expect(result.status).toBe("complete");
    expect(result.crossings).toHaveLength(1_000);
    expect(result.crossings[0]).toEqual({ at: new Date(DAY), retrograde: false });
    expect(result.crossings[1]).toEqual({ at: new Date(2 * DAY), retrograde: true });
    // 1,001 coarse samples and 24 bisection steps for each crossing.
    expect(result).toMatchObject({ samples: 25_001 });
    expect(calls).toHaveLength(25_001);
    expect(search(byDay(alternating), 1_000, { stepDays: 1, maxSamples: Infinity })).toEqual(result);
    expect(findLongitudeCrossingsWith(byDay(alternating), "Sun", 0, new Date(0), new Date(1_000 * DAY), 1)).toEqual(
      result.crossings
    );
  });

  it("refuses before sampling when the coarse scan alone is over budget", () => {
    const { calls, longitudeAt } = counted(alternating);
    expect(search(longitudeAt, 1, { stepDays: 1 / DAY, maxSamples: 10_000 })).toEqual(
      refused(0, 10_000)
    );
    // 2,600 days at a quarter day is 10,401 coarse samples.
    expect(search(longitudeAt, 2_600, { stepDays: 0.25, maxSamples: 10_000 })).toEqual(
      refused(0, 10_000)
    );
    expect(calls).toEqual([]);
  });

  it("accepts a coarse scan of exactly the budget, with a short last cell", () => {
    const { calls, longitudeAt } = counted(() => 180);
    expect(search(longitudeAt, 9_998.5, { stepDays: 1, maxSamples: 10_000 })).toEqual({
      status: "complete",
      crossings: [],
      samples: 10_000
    });
    expect(calls).toHaveLength(10_000);
    expect(calls.at(-1)).toBe(9_998.5 * DAY);
    expect(calls.at(-2)).toBe(9_998 * DAY);
    calls.length = 0;
    expect(search(longitudeAt, 9_998.5, { stepDays: 1, maxSamples: 9_999 })).toEqual(
      refused(0, 9_999)
    );
    expect(calls).toEqual([]);
  });

  it("stops at the budget when refinements would pass it, and returns no partial result", () => {
    const { calls, longitudeAt } = counted(alternating);
    expect(search(longitudeAt, 1_000, { stepDays: 1, maxSamples: 10_000 })).toEqual(
      refused(10_000, 10_000)
    );
    expect(calls).toHaveLength(10_000);
    calls.length = 0;
    expect(search(longitudeAt, 1_000, { stepDays: 1, maxSamples: 25_000 })).toEqual(
      refused(25_000, 25_000)
    );
    expect(calls).toHaveLength(25_000);
    const complete = search(longitudeAt, 1_000, { stepDays: 1, maxSamples: 25_001 });
    expect(complete).toMatchObject({ status: "complete", samples: 25_001 });
    expect(complete.crossings).toHaveLength(1_000);
  });

  it("counts grazing searches and edge probes as samples", () => {
    const { calls, longitudeAt } = counted((day) => 100 + 0.001 - 0.001 * (day - 1.5) ** 2);
    const result = searchLongitudeCrossingsWith(longitudeAt, "Mars", 100, new Date(0), new Date(25 * DAY));
    expect(result.status).toBe("complete");
    expect(result.crossings).toHaveLength(2);
    expect(result.samples).toBe(calls.length);
    expect(result.samples).toBeGreaterThan(6 + 2 * 24);
    expect(
      searchLongitudeCrossingsWith(longitudeAt, "Mars", 100, new Date(0), new Date(25 * DAY), {
        maxSamples: result.samples - 1
      })
    ).toEqual(refused(result.samples - 1, result.samples - 1));
  });

  it("refuses a single sample without throwing", () => {
    expect(search(byDay((day) => day), 2, { maxSamples: 1 })).toEqual(refused(0, 1));
  });
});

describe("input errors", () => {
  const start = new Date(0);
  const end = new Date(DAY);
  const { calls, longitudeAt } = counted((day) => day);
  const both = (
    targetLongitude: number,
    from: Date,
    to: Date,
    stepDays?: number
  ): (() => unknown)[] => [
    () => findLongitudeCrossingsWith(longitudeAt, "Sun", targetLongitude, from, to, stepDays),
    () =>
      searchLongitudeCrossingsWith(
        longitudeAt,
        "Sun",
        targetLongitude,
        from,
        to,
        stepDays === undefined ? {} : { stepDays }
      )
  ];

  it.each([
    ["an invalid start", 0, new Date(Number.NaN), end, undefined, /start must be a valid Date/u],
    ["an invalid end", 0, start, new Date(Number.NaN), undefined, /end must be a valid Date/u],
    ["a start that is not a Date", 0, 0 as unknown as Date, end, undefined, /valid Date/u],
    ["a reversed window", 0, end, start, undefined, /from <= to/u],
    ["a NaN target", Number.NaN, start, end, undefined, /targetLongitude must be finite/u],
    ["an infinite target", Infinity, start, end, undefined, /targetLongitude must be finite/u],
    ["a zero step", 0, start, end, 0, /stepDays must be positive/u],
    ["a negative step", 0, start, end, -1, /stepDays must be positive/u],
    ["a NaN step", 0, start, end, Number.NaN, /stepDays must be positive/u],
    ["an infinite step", 0, start, end, Infinity, /stepDays must be positive/u],
    ["a step of a string", 0, start, end, "5" as unknown as number, /stepDays must be positive/u],
    ["a sub-millisecond step", 0, start, end, 0.5 / DAY, /at least one millisecond/u],
    ["the smallest step", 0, start, end, Number.MIN_VALUE, /at least one millisecond/u],
    ["a step that overflows", 0, start, end, Number.MAX_VALUE, /finite step/u]
  ])("rejects %s with RangeError before any sample", (_label, target, from, to, step, message) => {
    for (const call of both(target, from, to, step)) {
      expect(call).toThrowError(RangeError);
      expect(call).toThrowError(message);
    }
    expect(calls).toEqual([]);
  });

  it.each([0, -1, 1.5, Number.NaN, -Infinity, null])(
    "rejects a maxSamples of %s before any sample",
    (maxSamples) => {
      expect(() =>
        searchLongitudeCrossingsWith(longitudeAt, "Sun", 0, start, end, {
          maxSamples: maxSamples as number
        })
      ).toThrowError(/maxSamples must be a positive integer/u);
      expect(calls).toEqual([]);
    }
  );

  it("rejects options that are not an object", () => {
    expect(() =>
      searchLongitudeCrossingsWith(
        longitudeAt,
        "Sun",
        0,
        start,
        end,
        null as unknown as CrossingSearchOptions
      )
    ).toThrowError(RangeError);
    expect(calls).toEqual([]);
  });

  it("rejects a non-finite longitude from the longitude function", () => {
    for (const bad of [Number.NaN, Infinity, "10" as unknown as number]) {
      expect(() =>
        findLongitudeCrossingsWith(() => bad, "Sun", 0, start, end)
      ).toThrowError(/non-finite longitude/u);
      expect(() =>
        searchLongitudeCrossingsWith(() => bad, "Sun", 0, start, end, { maxSamples: 10 })
      ).toThrowError(/non-finite longitude/u);
    }
  });

  it("passes the body and the sample instant to the longitude function", () => {
    const seen: [string, number][] = [];
    findLongitudeCrossingsWith(
      (body, date) => {
        seen.push([body, date.getTime()]);
        return 50;
      },
      "Jupiter",
      0,
      new Date(0),
      new Date(10 * DAY)
    );
    expect(seen).toEqual([
      ["Jupiter", 0],
      ["Jupiter", 5 * DAY],
      ["Jupiter", 10 * DAY]
    ]);
  });
});
