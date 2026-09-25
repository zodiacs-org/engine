/**
 * The crossing solver on the engine's own longitudes (brief v1 rule 1i).
 *
 * The first group runs the audit's s2 cases (engine audit 2026-09-22, ledger
 * production-event-search-5) and expects the answers the site's solver gave
 * there, where rc.7's solver answered differently or threw. The second is the
 * ephemeris half of the site's grazing-crossings.test.ts.
 */
import { describe, expect, it } from "vitest";
import { saturnReturn } from "./api.js";
import { findLongitudeCrossingsWith, searchLongitudeCrossingsWith } from "./crossings.js";
import type { BodyLongitudeAt, LongitudeCrossing } from "./crossings.js";
import { bodyLongitude, longitudeSpeed } from "./ephemeris.js";
import { computeSaturnReturns, findLongitudeCrossings, searchLongitudeCrossings } from "./returns.js";

const DAY = 86_400_000;
const HOUR = 3_600_000;
const normalize = (value: number) => ((value % 360) + 360) % 360;
const isoDays = (crossings: LongitudeCrossing[]) =>
  crossings.map((crossing) => crossing.at.toISOString().slice(0, 10));

/**
 * An independent reference: a plain scan at a fine step, with each sign
 * change of the offset bisected to the millisecond.
 */
function fineScan(body: "Moon" | "Saturn", target: number, from: number, to: number, step: number) {
  const offset = (time: number) => {
    const difference = normalize(bodyLongitude(body, new Date(time)) - target);
    return difference > 180 ? difference - 360 : difference;
  };
  const roots: { lower: number; upper: number; at: number; retrograde: boolean }[] = [];
  let previousTime = from;
  let previous = offset(from);
  for (let time = from + step; time <= to; time += step) {
    const current = offset(time);
    if (previous !== 0 && current !== 0 && Math.sign(previous) !== Math.sign(current)) {
      if (Math.abs(previous) < 90 && Math.abs(current) < 90) {
        let lower = previousTime;
        let upper = time;
        while (upper - lower > 1) {
          const middle = Math.floor((lower + upper) / 2);
          if (offset(middle) > 0 === current > previous) upper = middle;
          else lower = middle;
        }
        roots.push({ lower: previousTime, upper: time, at: upper, retrograde: current < previous });
      }
    }
    previousTime = time;
    previous = current;
  }
  return roots;
}

describe("the audit's s2 cases, with the site's answers", () => {
  it("counts two passes for a parabola over the target and one touch on it, at 5, 1 and 0.5 days", () => {
    const start = Date.UTC(2020, 0, 1);
    for (const dip of [0.05, 0.01, 0.004, 0.002, 0.001, 0.0005, 0.0001, 0]) {
      const longitudeAt: BodyLongitudeAt = (_body, date) =>
        normalize(100 + dip - 0.001 * ((date.getTime() - start) / DAY - 10) ** 2);
      const counts = [5, 1, 0.5].map(
        (step) =>
          findLongitudeCrossingsWith(longitudeAt, "Sun", 100, new Date(start), new Date(start + 20 * DAY), step)
            .length
      );
      expect(counts, `dip ${dip}`).toEqual(dip > 0 ? [2, 2, 2] : [1, 1, 1]);
    }
  });

  it("keeps an exact sample inside the window and at its end, but not at its start", () => {
    const start = Date.UTC(2020, 0, 1);
    const line: BodyLongitudeAt = (_body, date) => 100 + (date.getTime() - start) / DAY;
    const exact = (target: number) =>
      findLongitudeCrossingsWith(line, "Sun", target, new Date(start), new Date(start + 2 * DAY), 1);
    expect(exact(101)).toEqual([{ at: new Date("2020-01-02T00:00:00.000Z"), retrograde: false }]);
    expect(exact(100)).toEqual([]);
    expect(exact(102)).toEqual([{ at: new Date("2020-01-03T00:00:00.000Z"), retrograde: false }]);

    // The Sun's own longitude at each sample of 2026-03-01 to 03-03, one-day
    // step. rc.7 returned 2026-03-01T00:00:00.000Z for the first target.
    const from = new Date("2026-03-01T00:00:00.000Z");
    const to = new Date("2026-03-03T00:00:00.000Z");
    const sun = (target: Date) =>
      findLongitudeCrossings("Sun", bodyLongitude("Sun", target), from, to, 1).map((crossing) =>
        crossing.at.toISOString()
      );
    expect(sun(from)).toEqual([]);
    expect(sun(new Date("2026-03-02T00:00:00.000Z"))).toEqual(["2026-03-02T00:00:00.000Z"]);
    expect(sun(to)).toEqual(["2026-03-03T00:00:00.000Z"]);
  });

  it("finds no crossing at the February 2026 Mercury station when the station longitude is the audit's", () => {
    const L = (time: number) => bodyLongitude("Mercury", new Date(time));
    let lower = Date.UTC(2026, 1, 20);
    let upper = Date.UTC(2026, 2, 5);
    const golden = (Math.sqrt(5) - 1) / 2;
    for (let iteration = 0; iteration < 120 && upper - lower > 1; iteration += 1) {
      const a = upper - golden * (upper - lower);
      const b = lower + golden * (upper - lower);
      if (L(a) > L(b)) upper = b;
      else lower = a;
    }
    const station = Math.round((lower + upper) / 2);
    // rc.7 put it at 06:47:01.559Z; the observed ΔT, 6.3 s smaller, moves it later.
    expect(new Date(station).toISOString()).toBe("2026-02-26T06:47:07.889Z");
    const window = [new Date(station - 2 * DAY), new Date(station + 2 * DAY)] as const;

    // astronomy-engine reuses its nutation for instants within 1e-6 day, so
    // the longitude taken 1 ms after the search's last sample is 2.3e-11°
    // above the one the scan computes afresh at the station. The target
    // stays just beyond the maximum: no crossing, as for the site and rc.7.
    const audit = L(station);
    expect(findLongitudeCrossings("Mercury", audit, ...window, 0.5)).toEqual([]);

    // Computed afresh, the target is the station sample's own longitude, and
    // the touch is reported once, in the direction it arrived. rc.7 dropped it.
    L(Date.UTC(1900, 0, 1));
    const fresh = L(station);
    expect(fresh - audit).toBeLessThan(0);
    expect(findLongitudeCrossings("Mercury", fresh, ...window, 0.5)).toEqual([
      { at: new Date(station), retrograde: false }
    ]);
  });

  it.each([
    [2_100, 77, 10_000],
    [2_400, 88, 10_000],
    [2_600, 95, 0]
  ])(
    "returns %s days of Moon crossings of 0° at a quarter-day step, where rc.7 threw",
    (days, count, samplesAtRefusal) => {
      const from = new Date(Date.UTC(2000, 0, 1));
      const to = new Date(from.getTime() + days * DAY);
      const found = findLongitudeCrossings("Moon", 0, from, to, 0.25);
      expect(found).toHaveLength(count);
      expect(found.every((crossing) => !crossing.retrograde)).toBe(true);
      // Under rc.7's 10,000-sample budget the same search is now refused with
      // a typed result: before sampling when the coarse scan alone is over,
      // otherwise at the budget.
      expect(searchLongitudeCrossings("Moon", 0, from, to, { stepDays: 0.25, maxSamples: 10_000 })).toEqual({
        status: "refused",
        reason: "sample-budget",
        samples: samplesAtRefusal,
        maxSamples: 10_000,
        crossings: []
      });
    },
    30_000
  );

  it("matches an hourly scan of the 2,600-day Moon window, crossing by crossing", () => {
    const from = Date.UTC(2000, 0, 1);
    const to = from + 2_600 * DAY;
    const result = searchLongitudeCrossings("Moon", 0, new Date(from), new Date(to), { stepDays: 0.25 });
    expect(result.status).toBe("complete");
    // 10,401 coarse samples and 24 bisection steps for each crossing.
    expect(result.samples).toBe(10_401 + 24 * 95);
    const reference = fineScan("Moon", 0, from, to, HOUR);
    expect(reference).toHaveLength(95);
    expect(result.crossings).toHaveLength(95);
    result.crossings.forEach((crossing, index) => {
      const root = reference[index]!;
      expect(crossing.retrograde).toBe(root.retrograde);
      expect(crossing.at.getTime()).toBeGreaterThan(root.lower);
      expect(crossing.at.getTime()).toBeLessThanOrEqual(root.upper);
      // A quarter day over 2^24 is 1.29 ms; the Date adds under 1 ms.
      expect(Math.abs(crossing.at.getTime() - root.at)).toBeLessThanOrEqual(3);
    });
  }, 60_000);

  it("returns Saturn's crossings of 0° from 1900 to 2100 at a 5-day step, and a daily scan agrees", () => {
    const from = Date.UTC(1900, 0, 1);
    const to = Date.UTC(2100, 0, 1);
    const found = findLongitudeCrossings("Saturn", 0, new Date(from), new Date(to));
    expect(isoDays(found)).toEqual([
      "1908-03-19",
      "1937-04-25",
      "1937-10-18",
      "1938-01-14",
      "1967-03-03",
      "1996-04-07",
      "2025-05-25",
      "2025-09-01",
      "2026-02-14",
      "2055-03-22",
      "2084-05-01",
      "2084-10-02",
      "2085-01-24"
    ]);
    const reference = fineScan("Saturn", 0, from, to, DAY);
    expect(found.map((crossing) => crossing.retrograde)).toEqual(
      reference.map((root) => root.retrograde)
    );
    found.forEach((crossing, index) => {
      // Five days over 2^24 is 25.7 ms.
      expect(Math.abs(crossing.at.getTime() - reference[index]!.at)).toBeLessThanOrEqual(27);
    });
    // 14,611 coarse samples: over rc.7's budget before any sampling.
    expect(
      searchLongitudeCrossings("Saturn", 0, new Date(from), new Date(to), { maxSamples: 10_000 })
    ).toMatchObject({ status: "refused", samples: 0 });
  }, 60_000);
});

describe("grazing crossing pairs on the ephemeris", () => {
  function stationNear(body: "Jupiter" | "Saturn", from: number, to: number) {
    // Golden-section maximum of longitude: both stations here are retrograde stations.
    let lower = from;
    let upper = to;
    const golden = (Math.sqrt(5) - 1) / 2;
    const L = (time: number) => bodyLongitude(body, new Date(time));
    while (upper - lower > 1) {
      const a = upper - golden * (upper - lower);
      const b = lower + golden * (upper - lower);
      if (L(a) > L(b)) upper = b;
      else lower = a;
    }
    const at = Math.round((lower + upper) / 2);
    expect(longitudeSpeed(body, new Date(at - 5 * DAY))).toBeGreaterThan(0);
    return { at, lon: L(at) };
  }

  it("keeps all three first-return passes for a natal Saturn 0.002° below the 2019 station", () => {
    const birth = new Date("1990-02-12T20:13:55.742Z");
    const station = stationNear("Saturn", Date.UTC(2019, 3, 1), Date.UTC(2019, 5, 1));
    expect(station.lon - bodyLongitude("Saturn", birth)).toBeCloseTo(0.002, 6);
    const { natalLon, seasons } = computeSaturnReturns(birth);
    // A quarter-day scan sees the pair directly; the 5-day scan must agree.
    const reference = findLongitudeCrossingsWith(
      bodyLongitude,
      "Saturn",
      natalLon,
      new Date(Date.UTC(2018, 11, 1)),
      new Date(Date.UTC(2020, 2, 1)),
      0.25
    );
    expect(reference.map((crossing) => crossing.retrograde)).toEqual([false, true, false]);
    const first = seasons[0]!;
    expect(first.crossings.map((crossing) => crossing.retrograde)).toEqual([false, true, false]);
    first.crossings.forEach((crossing, index) => {
      expect(Math.abs(crossing.at.getTime() - reference[index]!.at.getTime())).toBeLessThan(1_000);
    });
    expect(first.crossings[1]?.at.toISOString().slice(0, 10)).toBe("2019-05-01");
    expect(seasons.reduce((count, season) => count + season.crossings.length, 0)).toBe(7);
    // rc.7's public API returned one first-return pass for this birth.
    expect(saturnReturn("1990-02-12T20:13:55.742Z").seasons[0]?.crossings).toEqual(first.crossings);
  }, 60_000);

  it("returns both Jupiter passes for targets up to 0.005° below the station, at every scan phase", () => {
    const station = stationNear("Jupiter", Date.UTC(2026, 10, 1), Date.UTC(2027, 0, 15));
    for (const dip of [0.005, 0.001, 0.0001]) {
      for (let phase = 0; phase < 5; phase += 1) {
        const from = new Date(Date.UTC(2026, 6, 1 + phase));
        const to = new Date(Date.UTC(2027, 6, 1 + phase));
        const found = findLongitudeCrossings("Jupiter", station.lon - dip, from, to);
        expect(found.map((crossing) => crossing.retrograde), `dip ${dip} phase ${phase}`).toEqual([
          false,
          true
        ]);
      }
    }
  }, 60_000);

  it("leaves ordinary windows with the same answers and no extra probe", () => {
    let calls = 0;
    const counted: BodyLongitudeAt = (body, date) => {
      calls += 1;
      return bodyLongitude(body, date);
    };
    const from = new Date(Date.UTC(2018, 0, 1));
    const to = new Date(Date.UTC(2023, 0, 1));
    const found = findLongitudeCrossingsWith(counted, "Saturn", 300, from, to, 5);
    expect(found.length).toBeGreaterThan(0);
    // One sample per 5-day step and 24 bisection steps per crossing, nothing else.
    expect(calls).toBe(Math.ceil((5 * 365.25) / 5) + 1 + 24 * found.length);
    const searched = searchLongitudeCrossingsWith(bodyLongitude, "Saturn", 300, from, to);
    expect(searched).toEqual({ status: "complete", crossings: found, samples: calls });
  });
});
