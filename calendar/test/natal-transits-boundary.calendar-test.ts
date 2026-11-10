import { afterEach, describe, expect, it, vi } from "vitest";
import { natalChart } from "../../src/index.js";
import { calc } from "../../src/calc.js";
import { EngineAdapter, EngineRefused } from "../.cache/events-source/events/src/engine.js";
import type { EvaluationContext } from "../.cache/events-source/events/src/context.js";
import { searchNatalTransitSchedule } from "../src/index.js";
import type { NatalTransitScheduleRequest } from "../src/index.js";

const DAY_MS = 86_400_000;
const epoch = Date.parse("2026-02-01T00:00:00.000Z");
const instant = (days: number) => new Date(epoch + days * DAY_MS).toISOString();
const request: NatalTransitScheduleRequest = {
  namespace: "synthetic-transit-boundaries.calendar.invalid", body: "Moon", natalBody: "Sun",
  startUtc: instant(0), endUtc: instant(1), clock: "utc", stepMs: DAY_MS / 16, maxEvaluations: 10_000,
  natal: { id: "invented-chart-a", synthetic: true,
    birth: { utc: "2001-02-03T04:05:06.789Z", timeScale: "utc" } },
  policy: { aspects: [{ id: "conjunction", angleDegrees: 0 }] }
};
const target = natalChart(request.natal.birth).bodies.find(body => body.body === "Sun")!.lon;
// Do not add a turn to an already positive value: that would round the natal
// target itself and turn an intended exact touch into a tiny crossing.
const wrap = (angle: number) => { const reduced = angle % 360; return reduced < 0 ? reduced + 360 : reduced; };

// Invented moving longitudes run through the real upstream scanner. Natal and
// receipt calculations remain real. These mixed records only test plumbing.
function useSyntheticMotion(relativeLongitude: (days: number) => number,
  onSample?: (context: EvaluationContext) => void) {
  const position = calc({ body: "Moon", time: instant(0) });
  if (position.status !== "ok") throw new Error("Synthetic fixture reference refused.");
  const referenceInstant = position.receipt.instants[0]!;
  return vi.spyOn(EngineAdapter.prototype, "sample").mockImplementation(function (this: EngineAdapter, _body, atMs) {
    return this.context.evaluate(() => {
      onSample?.(this.context);
      return { atMs, longitude: wrap(target + relativeLongitude((atMs - epoch) / DAY_MS)),
        speedDegreesPerDay: null, instant: referenceInstant };
    });
  });
}

const repeatedPasses = (days: number) => 5 * Math.cos(4 * Math.PI * days);
const complete = (input = request) => {
  const result = searchNatalTransitSchedule(input);
  expect(result.status).toBe("complete");
  if (result.status !== "complete") throw new Error(result.reason);
  return result;
};

afterEach(() => vi.restoreAllMocks());

describe("natal transit canonical day ownership", () => {
  it("suppresses an exact midnight touch using the following day's motion", () => {
    useSyntheticMotion(days => -5 * (days - 1) ** 2);
    expect(complete({ ...request, startUtc: instant(0.9) }).events).toEqual([]);
  });

  it("owns an exact midnight crossing once and excludes a crossing at the start", () => {
    useSyntheticMotion(days => 10 * (days - 1));
    const whole = complete({ ...request, endUtc: instant(2) });
    expect(whole.events.map(event => event.receipt.utc)).toEqual([instant(1)]);
    expect(whole.events[0]!.identity!.occurrence).toEqual({
      scheme: "utc-day-ordinal/1", startUtc: instant(0), ordinal: 0
    });
    const right = complete({ ...request, startUtc: instant(1), endUtc: instant(2) });
    expect(right.events).toEqual([]);
    expect(complete().events).toEqual(whole.events);
  });

  it("retains distinct repeat contacts and ordinals across overlaps and exact partitions", () => {
    useSyntheticMotion(repeatedPasses);
    const whole = complete({ ...request, endUtc: instant(2) });
    expect(whole.events).toHaveLength(8);
    expect(new Set(whole.events.map(event => event.uid)).size).toBe(8);
    expect(complete({ ...request, endUtc: instant(2) }).events).toEqual(whole.events);
    const overlap = complete({ ...request, startUtc: instant(0.5), endUtc: instant(1.5) });
    expect(overlap.events).toEqual(whole.events.filter(event =>
      event.receipt.utc > instant(0.5) && event.receipt.utc <= instant(1.5)));
    expect(overlap.events[0]!.identity!.occurrence).toEqual({
      scheme: "utc-day-ordinal/1", startUtc: instant(0), ordinal: 1
    });
    for (const split of [instant(1), whole.events[2]!.receipt.utc, instant(0.6)]) {
      const left = complete({ ...request, endUtc: split });
      const right = complete({ ...request, startUtc: split, endUtc: instant(2) });
      expect([...left.events, ...right.events]).toEqual(whole.events);
    }
  });

  it("keeps both custom-angle branches and single conjunction/opposition branches", () => {
    useSyntheticMotion(days => 360 * days);
    const result = complete({ ...request, policy: { aspects: [
      { id: "conjunction", angleDegrees: 0 }, { id: "opposition", angleDegrees: 180 },
      { id: "custom", angleDegrees: 72 }
    ] } });
    expect(result.events.map(event => event.identity!.definition.parameters.relativeLongitude)).toEqual([72, 180, 288, 0]);
    expect(result.events.map(event => event.receipt.aspect!.angleDegrees)).toEqual([72, 180, 72, 0]);
    expect(result.events.map(event => event.receipt.bodies)).toEqual(Array.from({ length: 4 }, () => ["Moon", "Sun"]));
  });
});

describe("natal transit work controls", () => {
  it("distinguishes an empty completed scan from a moving-engine refusal and a natal error", () => {
    const sample = useSyntheticMotion(() => 10);
    const empty = complete();
    expect(empty.events).toEqual([]);
    expect(empty.evaluations).toBeGreaterThan(1);
    sample.mockRestore();
    expect(searchNatalTransitSchedule({ ...request,
      startUtc: "1700-01-01T00:00:00.000Z", endUtc: "1700-01-02T00:00:00.000Z"
    })).toEqual({ status: "refused", reason: "engine-refused", events: [], evaluations: 2 });
    expect(() => searchNatalTransitSchedule({ ...request,
      natal: { ...request.natal, birth: { ...request.natal.birth, utc: "9998-01-01T00:00:00.000Z" } }
    })).toThrow(RangeError);
  });

  it("charges natal creation once, scan calls, padding and every owned receipt before display filtering", () => {
    const sample = useSyntheticMotion(repeatedPasses);
    const result = complete();
    expect(result.events).toHaveLength(4);
    expect(result.evaluations).toBe(1 + sample.mock.calls.length + 4);
    sample.mockClear();
    const clipped = complete({ ...request, startUtc: instant(0.5), endUtc: instant(0.9) });
    expect(clipped.events).toHaveLength(2);
    expect(clipped.evaluations).toBe(result.evaluations);
    sample.mockClear();
    const twoDays = complete({ ...request, endUtc: instant(2) });
    expect(twoDays.evaluations).toBe(1 + sample.mock.calls.length + twoDays.events.length);
  });

  it("discards all events for exhaustion during scanning, receipt creation or a later day", () => {
    useSyntheticMotion(repeatedPasses);
    const result = complete();
    for (const maxEvaluations of [1, result.evaluations - 4, result.evaluations - 1]) {
      expect(searchNatalTransitSchedule({ ...request, maxEvaluations })).toEqual({
        status: "refused", reason: "evaluation-budget", events: [], evaluations: maxEvaluations
      });
    }
    expect(complete({ ...request, maxEvaluations: result.evaluations })).toEqual(result);
    const maxEvaluations = result.evaluations + 1;
    expect(searchNatalTransitSchedule({ ...request, endUtc: instant(2), maxEvaluations })).toEqual({
      status: "refused", reason: "evaluation-budget", events: [], evaluations: maxEvaluations
    });
  });

  it("cancels before the natal request and clears earlier days on later cancellation", () => {
    const sample = useSyntheticMotion(repeatedPasses);
    expect(searchNatalTransitSchedule({ ...request, signal: AbortSignal.abort() })).toEqual({
      status: "refused", reason: "cancelled", events: [], evaluations: 0
    });
    expect(sample).not.toHaveBeenCalled();
    sample.mockRestore();
    const controller = new AbortController();
    useSyntheticMotion(repeatedPasses, context => {
      if (context.window.startMs === epoch + DAY_MS) controller.abort();
    });
    expect(searchNatalTransitSchedule({ ...request, endUtc: instant(2), signal: controller.signal })).toMatchObject({
      status: "refused", reason: "cancelled", events: []
    });
  });

  it("drops earlier events after a typed engine refusal, and propagates unexpected errors", () => {
    const refusal = calc({ body: "Moon", time: "1700-01-01T00:00:00.000Z" });
    if (refusal.status !== "refused") throw new Error("Fixture must be outside calc coverage.");
    const sample = useSyntheticMotion(repeatedPasses, context => {
      if (context.window.startMs === epoch + DAY_MS) throw new EngineRefused(refusal);
    });
    expect(searchNatalTransitSchedule({ ...request, endUtc: instant(2) })).toMatchObject({
      status: "refused", reason: "engine-refused", events: []
    });
    sample.mockRestore();
    useSyntheticMotion(() => { throw new Error("Synthetic provider failure"); });
    expect(() => searchNatalTransitSchedule(request)).toThrow("Synthetic provider failure");
  });
});

describe("natal transit validation", () => {
  it.each([
    { clock: "tt" }, { clock: "ut1" }, { clock: undefined }, { body: "Earth" }, { natalBody: "Node" },
    { startUtc: instant(1) }, { startUtc: instant(2) }, { startUtc: "2026-02-30T00:00:00.000Z" },
    { endUtc: "9999-12-31T23:59:59.999Z" }, { stepMs: 0 }, { stepMs: 7 }, { stepMs: 0.5 },
    { maxEvaluations: 0 }, { maxEvaluations: Infinity }, { namespace: "" }, { signal: {} }, { surprise: true },
    { natal: null }, { natal: { ...request.natal, synthetic: false } },
    { natal: { ...request.natal, id: "" } }, { natal: { ...request.natal, surprise: true } },
    { policy: { aspects: [] } }, { policy: { aspects: [{ id: "square", angleDegrees: NaN }] } },
    { policy: { aspects: [{ id: "a", angleDegrees: 60 }, { id: "b", angleDegrees: 60 }] } },
    { policy: { aspects: [{ id: "a", angleDegrees: 60 }, { id: "a", angleDegrees: 90 }] } },
    { policy: { aspects: [{ id: "custom", angleDegrees: 181 }] } },
    { policy: { aspects: [{ id: "custom", angleDegrees: 60, orb: 5 }] } }
  ])("rejects invalid request settings before scanning: %j", invalid => {
    const sample = useSyntheticMotion(repeatedPasses);
    expect(() => searchNatalTransitSchedule({ ...request, ...invalid } as NatalTransitScheduleRequest)).toThrow();
    expect(sample).not.toHaveBeenCalled();
  });

  it.each([
    { utc: "2001-02-30T00:00:00.000Z" }, { utc: "2001-02-03T04:05:06Z" },
    { utc: "2001-02-03T04:05:06.789+00:00" }, { timeScale: "tt" }, { timeScale: "ut1" },
    { timeScale: undefined }, { latitude: 20 }, { latitude: 91, longitude: 0 },
    { latitude: 0, longitude: -181 }, { latitude: null, longitude: null },
    { timeKnown: null }, { houseSystem: "invented" }, { flags: [] }, { deltaT: Infinity }, { deltaT: 1e11 }
  ])("rejects invalid natal settings even if already cancelled: %j", invalid => {
    const sample = useSyntheticMotion(repeatedPasses);
    expect(() => searchNatalTransitSchedule({ ...request, signal: AbortSignal.abort(),
      natal: { ...request.natal, birth: { ...request.natal.birth, ...invalid } }
    } as NatalTransitScheduleRequest)).toThrow();
    expect(sample).not.toHaveBeenCalled();
  });

  it("detaches nested inputs before a provider can mutate caller data", () => {
    const original = structuredClone(request);
    const expectedSample = useSyntheticMotion(repeatedPasses);
    const expected = complete(original);
    expectedSample.mockRestore();
    useSyntheticMotion(repeatedPasses, () => {
      (original.natal.birth as { utc: string }).utc = "2002-01-01T00:00:00.000Z";
      (original.policy.aspects[0] as { angleDegrees: number }).angleDegrees = 180;
    });
    expect(complete(original)).toEqual(expected);
  });
});
