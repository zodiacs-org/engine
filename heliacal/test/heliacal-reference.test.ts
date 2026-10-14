import { afterEach, describe, expect, it, vi } from "vitest";
import type { SkyEventKind } from "../../src/sky/riseset.js";
import type { ReceiptedSkyEvent } from "../src/engine.js";
import * as geometryModule from "../src/geometry.js";
import type { SunBodyGeometry } from "../src/geometry.js";
import { heliacalEvents } from "../src/heliacal.js";
import type { DateInput } from "../src/inputs.js";
import * as windowModule from "../src/windows.js";
import type { ObservingWindowsResult } from "../src/windows.js";
import reference from "./fixtures/visibility-reference.json" with { type: "json" };

const SITE = { latitude: 0, longitude: 0, height: 0 };
const START = Date.parse("2001-02-03T00:00:00Z");
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const MODEL = "horizon-arcus-visionis/1";

// Only the thresholds come from Schoch (1924), printed p. 734, the m = 0.0
// row: Firsts. 10.5 degrees; Lasts. 9.5 degrees. Source URL and limitations
// are in visibility-reference.json. The dates, site, horizon schedules and
// solar altitudes below are invented criterion examples, not observations.
const firstThreshold = reference.horizonCases[0]!.requiredSolarDepressionDeg;
const lastThreshold = reference.horizonCases[1]!.requiredSolarDepressionDeg;

function time(day: number, hour = 0): number { return START + day * DAY + hour * HOUR; }
function iso(day: number, hour = 0): string { return new Date(time(day, hour)).toISOString(); }

function mockSchedule(morningDepression: readonly number[], eveningDepression: readonly number[]) {
  if (morningDepression.length !== eveningDepression.length) throw new Error("Schedule lengths differ");
  const days = morningDepression.length;
  // These partial structural doubles intentionally contain no ephemeris
  // values or real engine receipts. Identity checks below test preservation,
  // and do not assert that synthetic positions are valid engine results.
  const event = (kind: SkyEventKind, day: number, hour: number): ReceiptedSkyEvent => ({
    kind, at: new Date(time(day, hour)), altitude: 0, azimuth: 0,
    position: { status: "ok", receipt: { fixture: "synthetic-schedule" } }
  } as unknown as ReceiptedSkyEvent);
  const sun: ReceiptedSkyEvent[] = [];
  const target: ReceiptedSkyEvent[] = [];
  const geometryByTime = new Map<number, SunBodyGeometry>();
  for (let day = 0; day < days; day += 1) {
    sun.push(event("lower-transit", day, 0), event("rise", day, 6),
      event("upper-transit", day, 12), event("set", day, 18));
    for (const [kind, hour, depression] of [
      ["rise", 5, morningDepression[day]!], ["set", 19, eveningDepression[day]!]
    ] as const) {
      const crossing = event(kind, day, hour);
      target.push(crossing);
      geometryByTime.set(time(day, hour), {
        status: "ok", body: "Venus", at: iso(day, hour), observer: SITE,
        topocentric: {
          sun: { horizontal: { altitudeDeg: -depression } },
          target: { horizontal: { altitudeDeg: 0 } }
        },
        receiptScope: "positions"
      } as unknown as SunBodyGeometry);
    }
  }
  sun.push(event("lower-transit", days, 0));
  const horizon = (body: "Sun" | "Venus", events: readonly ReceiptedSkyEvent[]) => ({
    body, status: "complete", events, flags: [], samples: 0,
    observer: SITE, from: new Date(START), to: new Date(time(days)),
    conventions: { limb: "centre", refraction: "none", refractionArcmin: 0 },
    receiptScope: "event-positions"
  });
  const windows = {
    status: "complete", body: "Venus", observer: SITE,
    from: iso(0), to: iso(days), support: { from: iso(0), to: iso(days) },
    horizons: { sun: horizon("Sun", sun), target: horizon("Venus", target) },
    diagnostics: [], samples: 0, maxSamples: 200_000,
    // No candidate windows are needed to evaluate a horizon criterion.
    // Deliberately empty to detect filtering opportunities through windows.
    windows: [], receiptScope: "event-positions", conventions: {}
  } as unknown as ObservingWindowsResult;
  vi.spyOn(windowModule, "observingWindows").mockReturnValue(windows);
  const geometry = vi.spyOn(geometryModule, "sunBodyGeometry").mockImplementation((_body, at: DateInput) => {
    const ms = at instanceof Date ? at.getTime() : typeof at === "number" ? at : Date.parse(at);
    const result = geometryByTime.get(ms);
    if (!result) throw new Error("Geometry requested away from a synthetic target crossing");
    return result;
  });
  return { days, geometry, geometryByTime, target };
}

afterEach(() => vi.restoreAllMocks());

describe("heliacal transitions from published criterion constants", () => {
  it("applies Schoch's distinct first/last thresholds with inclusive boundary equality", () => {
    // Solar depressions 10 and 10.5 straddle the published Firsts. threshold.
    // 9.5 passes the published Lasts. threshold exactly; the following 9 fails.
    const schedule = mockSchedule([10, 10.5, 11, 9], [10, 10.5, 9.5, 9]);
    const result = heliacalEvents("Venus", SITE, iso(0), iso(schedule.days), {
      model: MODEL,
      thresholds: {
        "first-morning": firstThreshold, "last-morning": lastThreshold,
        "first-evening": firstThreshold, "last-evening": lastThreshold
      }
    });
    expect(result.status).toBe("complete");
    expect(result.events.map(({ appearance, at }) => [appearance, at])).toEqual([
      ["first-morning", iso(1, 5)], ["first-evening", iso(1, 19)],
      ["last-morning", iso(2, 5)], ["last-evening", iso(2, 19)]
    ]);
    const morning = result.opportunities.find((item) => item.period === "morning" && item.status === "evaluated");
    if (!morning || morning.status !== "evaluated") throw new Error("Expected morning opportunity");
    expect(morning.criteria["first-morning"]).toMatchObject(reference.horizonCases[0]!.expected);
    expect(morning.criteria["last-morning"]).toMatchObject(reference.horizonCases[1]!.expected);

    const first = result.events[0]!;
    expect(first.bracket.before.criteria["first-morning"]?.marginDeg).toBe(-0.5);
    expect(first.bracket.after.criteria["first-morning"]?.marginDeg).toBe(0);
    const last = result.events[3]!;
    expect(last.bracket.before.criteria["last-evening"]?.marginDeg).toBe(0);
    expect(last.bracket.after.criteria["last-evening"]?.marginDeg).toBe(-0.5);
    for (const item of result.events) {
      const passing = item.appearance.startsWith("first-") ? item.bracket.after : item.bracket.before;
      expect(item.at).toBe(passing.crossing.at.toISOString());
      expect(passing.crossing).toBe(schedule.target.find((entry) => entry.at.toISOString() === item.at));
      expect(passing.geometry).toBe(schedule.geometryByTime.get(Date.parse(item.at)));
      expect(item.receiptScope).toBe("positions");
    }
    expect(schedule.geometry).toHaveBeenCalledTimes(8);
  });

  it("keeps four caller-selected thresholds separate instead of inheriting a default", () => {
    // These thresholds are arbitrary exact arithmetic, with no calibration
    // claim. A transition appears only in its own solar half and direction.
    const schedule = mockSchedule([1, 2, 4, 3], [5, 6, 8, 7]);
    const result = heliacalEvents("Venus", SITE, iso(0), iso(schedule.days), {
      model: MODEL,
      thresholds: { "last-evening": 8, "last-morning": 4, "first-evening": 6, "first-morning": 2 }
    });
    expect(result.status).toBe("complete");
    expect(result.events.map(({ appearance, at }) => [appearance, at])).toEqual([
      ["first-morning", iso(1, 5)], ["first-evening", iso(1, 19)],
      ["last-morning", iso(2, 5)], ["last-evening", iso(2, 19)]
    ]);
    for (const event of result.events) {
      const before = event.bracket.before.criteria[event.appearance]!;
      const after = event.bracket.after.criteria[event.appearance]!;
      const isFirst = event.appearance.startsWith("first-");
      expect(before.passesCriterion).toBe(!isFirst);
      expect(after.passesCriterion).toBe(isFirst);
      expect(isFirst ? after.marginDeg : before.marginDeg).toBe(0);
    }
  });

  it("does not infer a first or last appearance from the bounded range edges", () => {
    const schedule = mockSchedule([11, 11], [11, 11]);
    const result = heliacalEvents("Venus", SITE, iso(0), iso(schedule.days), {
      model: MODEL,
      thresholds: { "first-morning": firstThreshold, "last-evening": lastThreshold }
    });
    expect(result.status).toBe("complete");
    expect(result.events).toEqual([]);
    expect(result.opportunities.filter((item) => item.status === "evaluated")).toHaveLength(4);
  });

  describe.each(["missing", "wrong-half", "multiple"] as const)("%s crossing gaps", (gap) => {
    it.each(["first", "last"] as const)("breaks %s transitions without resetting the opposite period", (direction) => {
      const first = direction === "first";
      const schedule = first
        ? mockSchedule([10, 10.5, 11], [10, 10.5, 11])
        : mockSchedule([11, 9.5, 9], [11, 9.5, 9]);
      const middleRise = schedule.target[2]!;
      if (gap === "missing") schedule.target.splice(2, 1);
      if (gap === "wrong-half") schedule.target[2] = { ...middleRise, at: new Date(time(1, 13)) };
      if (gap === "multiple") schedule.target.push({ ...middleRise, at: new Date(time(1, 4)) });
      schedule.target.sort((a, b) => a.at.getTime() - b.at.getTime());
      const threshold = first ? firstThreshold : lastThreshold;
      const appearance = first ? "first-morning" : "last-morning";
      const eveningAppearance = first ? "first-evening" : "last-evening";
      const result = heliacalEvents("Venus", SITE, iso(0), iso(schedule.days), {
        model: MODEL, thresholds: { [appearance]: threshold, [eveningAppearance]: threshold }
      });
      expect(result.status).toBe("complete");
      // The morning failure/pass pair is separated by an unavailable morning.
      // The interleaved evening halves still form their own adjacent sequence.
      expect(result.events.map(({ appearance: kind, at }) => [kind, at]))
        .toEqual([[eveningAppearance, iso(1, 19)]]);
      expect(result.opportunities.filter((item) => item.period === "morning").map((item) => item.status))
        .toEqual(["evaluated", "unavailable", "evaluated"]);
      expect(result.diagnostics).toContainEqual({
        code: "opportunity-gap", period: "morning", from: iso(1), to: iso(1, 12),
        reason: gap === "multiple" ? "multiple-crossings" : "missing-crossing"
      });
      expect(schedule.geometry).toHaveBeenCalledTimes(5);
    });
  });

  it("does not use a support crossing before the request to infer a first appearance", () => {
    const schedule = mockSchedule([10, 10.5, 11], [0, 0, 0]);
    const result = heliacalEvents("Venus", SITE, iso(0, 6), iso(schedule.days), {
      model: MODEL, thresholds: { "first-morning": firstThreshold }
    });
    expect(result.status).toBe("complete");
    expect(result.events).toEqual([]);
    expect(result.opportunities[0]).toMatchObject({
      status: "unavailable", period: "morning", reason: "crossing-outside-range"
    });
    expect(result.opportunities[0]!.crossing).toBe(schedule.target[0]);
    expect(schedule.geometry.mock.calls.map((call) => (call[1] as Date).toISOString()))
      .toEqual([iso(1, 5), iso(2, 5)]);
  });

  it("does not use a support crossing at the excluded end to infer a last appearance", () => {
    const schedule = mockSchedule([0, 0, 0], [11, 9.5, 9]);
    const result = heliacalEvents("Venus", SITE, iso(0), iso(2, 19), {
      model: MODEL, thresholds: { "last-evening": lastThreshold }
    });
    expect(result.status).toBe("complete");
    expect(result.events).toEqual([]);
    expect(result.opportunities.at(-1)).toMatchObject({
      status: "unavailable", period: "evening", reason: "crossing-outside-range"
    });
    expect(result.opportunities.at(-1)!.crossing).toBe(schedule.target[5]);
    expect(schedule.geometry.mock.calls.map((call) => (call[1] as Date).toISOString()))
      .toEqual([iso(0, 19), iso(1, 19)]);
  });
});
