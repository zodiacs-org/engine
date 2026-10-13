import { afterEach, describe, expect, it, vi } from "vitest";
import { natalChart } from "../../src/index.js";
import * as calculation from "../../src/calc.js";
import * as progressions from "../../src/progressions.js";
import { searchSynastrySchedule } from "../src/synastry.js";
import type { SynastryScheduleRequest } from "../src/synastry.js";
import type { JsonObject } from "../src/types.js";

const DAY_MS = 86_400_000;
const epoch = Date.parse("2026-02-01T00:00:00.000Z");
const instant = (days: number) => new Date(epoch + days * DAY_MS).toISOString();
const request: SynastryScheduleRequest = {
  namespace: "synthetic-synastry-boundaries.calendar.invalid",
  convention: "secondary-progressed-first-to-natal-second/1",
  firstBody: "Moon", secondBody: "Sun",
  startUtc: instant(0), endUtc: instant(1), clock: "utc", stepMs: DAY_MS / 16, maxEvaluations: 10_000,
  first: { id: "invented-chart-a", synthetic: true,
    birth: { utc: "2001-02-03T04:05:06.789Z", timeScale: "utc" } },
  second: { id: "invented-chart-b", synthetic: true,
    birth: { utc: "2003-07-08T09:10:11.123Z", timeScale: "utc" } },
  policy: { aspects: [{ id: "conjunction", angleDegrees: 0 }] }
};
const target = natalChart(request.second.birth).bodies.find(body => body.body === "Sun")!.lon;
const actualCalc = calculation.calc;
const actualProgressedInstant = progressions.progressedInstant;
const wrap = (angle: number) => { const reduced = angle % 360; return reduced < 0 ? reduced + 360 : reduced; };
const repeatedPasses = (days: number) => 5 * Math.cos(4 * Math.PI * days);

function utcOf(time: calculation.CalcTime): string {
  if (typeof time === "string") return time;
  if (time instanceof Date) return time.toISOString();
  if ("iso" in time) return time.iso;
  throw new Error("Expected a UTC calculation request.");
}

// Only synthetic clock/longitude values are mocked. The pinned upstream scanner
// and natal envelopes remain real. These mixed records test control flow only.
function useSyntheticMotion(relativeLongitude: (days: number) => number,
  onSample?: (atMs: number, call: number) => void) {
  vi.spyOn(progressions, "progressedInstant").mockImplementation((_birth, at) => new Date(at));
  let calls = 0;
  return vi.spyOn(calculation, "calc").mockImplementation(input => {
    const atMs = Date.parse(utcOf(input.time));
    onSample?.(atMs, ++calls);
    const position = actualCalc(input);
    if (position.status !== "ok") throw new Error("Synthetic motion fixture calculation refused.");
    return { ...position, lon: wrap(target + relativeLongitude((atMs - epoch) / DAY_MS)) };
  });
}

const complete = (input = request) => {
  const result = searchSynastrySchedule(input);
  expect(result.status).toBe("complete");
  if (result.status !== "complete") throw new Error(result.reason);
  return result;
};

afterEach(() => vi.restoreAllMocks());

describe("progressed synastry canonical day ownership", () => {
  it("suppresses an exact midnight touch using the following day's motion", () => {
    useSyntheticMotion(days => -5 * (days - 1) ** 2);
    expect(complete({ ...request, startUtc: instant(0.9) }).events).toEqual([]);
  });

  it("owns a midnight crossing once and excludes a crossing at the start", () => {
    useSyntheticMotion(days => 10 * (days - 1));
    const whole = complete({ ...request, endUtc: instant(2) });
    expect(whole.events.map(event => event.receipt.utc)).toEqual([instant(1)]);
    expect(whole.events[0]!.identity!.occurrence).toEqual({
      scheme: "utc-day-ordinal/1", startUtc: instant(0), ordinal: 0
    });
    expect(complete({ ...request, startUtc: instant(1), endUtc: instant(2) }).events).toEqual([]);
    expect(complete().events).toEqual(whole.events);
  });

  it("preserves repeat contacts and UIDs across overlaps and range partitions", () => {
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

describe("progressed synastry work controls", () => {
  it("charges both natal envelopes once and every scan/receipt calculation before filtering", () => {
    const sample = useSyntheticMotion(repeatedPasses);
    const result = complete();
    expect(result.events).toHaveLength(4);
    expect(result.evaluations).toBe(2 + sample.mock.calls.length);
    sample.mockClear();
    const clipped = complete({ ...request, startUtc: instant(0.5), endUtc: instant(0.9) });
    expect(clipped.events).toHaveLength(2);
    expect(clipped.evaluations).toBe(result.evaluations);
    expect(clipped.evaluations).toBe(2 + sample.mock.calls.length);
    sample.mockClear();
    const twoDays = complete({ ...request, endUtc: instant(2) });
    expect(twoDays.evaluations).toBe(2 + sample.mock.calls.length);
  });

  it("discards all events for exhaustion during natal, scan, receipt and later-day work", () => {
    useSyntheticMotion(repeatedPasses);
    const result = complete();
    for (const maxEvaluations of [1, 2, result.evaluations - 4, result.evaluations - 1]) {
      expect(searchSynastrySchedule({ ...request, maxEvaluations })).toEqual({
        status: "refused", reason: "evaluation-budget", events: [], evaluations: maxEvaluations
      });
    }
    expect(complete({ ...request, maxEvaluations: result.evaluations })).toEqual(result);
    const maxEvaluations = result.evaluations + 1;
    expect(searchSynastrySchedule({ ...request, endUtc: instant(2), maxEvaluations })).toEqual({
      status: "refused", reason: "evaluation-budget", events: [], evaluations: maxEvaluations
    });
  });

  it("cancels before natal work and discards earlier days on later cancellation", () => {
    const sample = useSyntheticMotion(repeatedPasses);
    expect(searchSynastrySchedule({ ...request, signal: AbortSignal.abort() })).toEqual({
      status: "refused", reason: "cancelled", events: [], evaluations: 0
    });
    expect(sample).not.toHaveBeenCalled();
    complete();
    const firstDayCalls = sample.mock.calls.length;
    vi.restoreAllMocks();
    const controller = new AbortController();
    useSyntheticMotion(repeatedPasses, (_atMs, calls) => {
      if (calls > firstDayCalls) controller.abort();
    });
    expect(searchSynastrySchedule({ ...request, endUtc: instant(2), signal: controller.signal })).toEqual({
      status: "refused", reason: "cancelled", events: [], evaluations: 2 + firstDayCalls + 1
    });
  });

  it("distinguishes an empty scan from an engine refusal and drops previous days on refusal", () => {
    useSyntheticMotion(() => 10);
    expect(complete().events).toEqual([]);
    vi.restoreAllMocks();
    const passes = useSyntheticMotion(repeatedPasses);
    complete();
    const firstDayCalls = passes.mock.calls.length;
    passes.mockClear();
    const refusal = actualCalc({ body: "Moon", time: "1700-01-01T00:00:00.000Z" });
    expect(refusal.status).toBe("refused");
    const motion = passes.getMockImplementation()!;
    let calls = 0;
    passes.mockImplementation(input => ++calls > firstDayCalls ? refusal : motion(input));
    expect(searchSynastrySchedule({ ...request, endUtc: instant(2) })).toEqual({
      status: "refused", reason: "engine-refused", events: [], evaluations: 2 + firstDayCalls + 1
    });
  });

  it("propagates unexpected provider errors", () => {
    useSyntheticMotion(() => { throw new Error("Synthetic provider failure"); });
    expect(() => searchSynastrySchedule(request)).toThrow("Synthetic provider failure");
  });
});

describe("progressed synastry separate clocks", () => {
  it("maps schedule samples through the real engine progression function before calc", () => {
    const mapping = vi.spyOn(progressions, "progressedInstant");
    const sample = vi.spyOn(calculation, "calc").mockImplementation(input => {
      const position = actualCalc(input);
      if (position.status !== "ok") throw new Error("Progressed fixture calculation refused.");
      return { ...position, lon: wrap(target + 10) };
    });
    const result = complete();
    expect(result.events).toEqual([]);
    expect(sample.mock.calls.length).toBeGreaterThan(0);
    expect(mapping.mock.calls).toHaveLength(sample.mock.calls.length);
    mapping.mock.calls.forEach(([birthUtc, scheduleUtc], index) => {
      expect(birthUtc).toBe(request.first.birth.utc);
      const calculatedUtc = utcOf(sample.mock.calls[index]![0].time);
      expect(calculatedUtc).toBe(actualProgressedInstant(birthUtc, scheduleUtc).toISOString());
      expect(calculatedUtc).not.toBe(new Date(scheduleUtc).toISOString());
    });
  });

  it("retains the schedule and calculation UTC labels separately for exact contacts", () => {
    useSyntheticMotion(repeatedPasses);
    vi.mocked(progressions.progressedInstant).mockImplementation((_birth, at) =>
      new Date(new Date(at).getTime() - DAY_MS));
    const event = complete().events[0]!;
    expect(event.receipt.utc).toBe(instant(0.125));
    expect(event.receipt.source!.convention).toBe(request.convention);
    const progression = event.receipt.source!.progression as JsonObject;
    expect(progression).toMatchObject({
      method: "engine.progressedInstant", birthUtc: request.first.birth.utc,
      scheduleUtc: event.receipt.utc, calculationUtc: instant(-0.875)
    });
    expect((event.receipt.source!.event as JsonObject).clock).toBe("utc");
  });
});

describe("progressed synastry validation", () => {
  it.each([
    { convention: undefined }, { convention: "natal-to-natal" }, { convention: "progressed-both" },
    { clock: "tt" }, { clock: "ut1" }, { clock: undefined }, { firstBody: "Earth" }, { secondBody: "Node" },
    { startUtc: instant(1) }, { startUtc: instant(2) }, { startUtc: "2026-02-30T00:00:00.000Z" },
    { endUtc: "9999-12-31T23:59:59.999Z" }, { stepMs: 0 }, { stepMs: 1 }, { stepMs: 360 }, { stepMs: 500 },
    { stepMs: 7 }, { stepMs: 0.5 },
    { maxEvaluations: 0 }, { maxEvaluations: Infinity }, { namespace: "" }, { signal: {} }, { surprise: true },
    { first: null }, { second: null }, { first: { ...request.first, synthetic: false } },
    { second: { ...request.second, synthetic: false } }, { first: { ...request.first, id: "" } },
    { second: { ...request.second, surprise: true } }, { second: { ...request.second, id: request.first.id } },
    { policy: { aspects: [] } }, { policy: { aspects: [{ id: "square", angleDegrees: NaN }] } },
    { policy: { aspects: [{ id: "a", angleDegrees: 60 }, { id: "b", angleDegrees: 60 }] } },
    { policy: { aspects: [{ id: "a", angleDegrees: 60 }, { id: "a", angleDegrees: 90 }] } },
    { policy: { aspects: [{ id: "custom", angleDegrees: 181 }] } },
    { policy: { aspects: [{ id: "custom", angleDegrees: 60, orb: 5 }] } }
  ])("rejects invalid requests before scanning: %j", invalid => {
    const sample = useSyntheticMotion(repeatedPasses);
    expect(() => searchSynastrySchedule({ ...request, ...invalid } as SynastryScheduleRequest)).toThrow();
    expect(sample).not.toHaveBeenCalled();
  });

  it("accepts a one-second step while checking cancellation before any calculation", () => {
    const sample = useSyntheticMotion(repeatedPasses);
    expect(searchSynastrySchedule({ ...request, stepMs: 1_000, signal: AbortSignal.abort() })).toEqual({
      status: "refused", reason: "cancelled", events: [], evaluations: 0
    });
    expect(sample).not.toHaveBeenCalled();
  });

  for (const side of ["first", "second"] as const) {
    it.each([
      { utc: "2001-02-30T00:00:00.000Z" }, { utc: "2001-02-03T04:05:06Z" },
      { utc: "2001-02-03T04:05:06.789+00:00" }, { timeScale: "tt" }, { timeScale: "ut1" },
      { timeScale: undefined }, { latitude: 20 }, { latitude: 91, longitude: 0 },
      { latitude: 0, longitude: -181 }, { latitude: null, longitude: null },
      { timeKnown: null }, { houseSystem: "invented" }, { flags: [] }, { deltaT: Infinity }, { deltaT: 1e11 }
    ])(`rejects invalid ${side} chart settings even if already cancelled: %j`, invalid => {
      const sample = useSyntheticMotion(repeatedPasses);
      expect(() => searchSynastrySchedule({ ...request, signal: AbortSignal.abort(),
        [side]: { ...request[side], birth: { ...request[side].birth, ...invalid } }
      } as SynastryScheduleRequest)).toThrow();
      expect(sample).not.toHaveBeenCalled();
    });
  }

  it("detaches both nested births and the policy before a provider mutates caller data", () => {
    const original = structuredClone(request);
    useSyntheticMotion(repeatedPasses);
    const expected = complete(original);
    vi.restoreAllMocks();
    useSyntheticMotion(repeatedPasses, () => {
      (original.first.birth as { utc: string }).utc = "2002-01-01T00:00:00.000Z";
      (original.second.birth as { utc: string }).utc = "2004-01-01T00:00:00.000Z";
      (original.policy.aspects[0] as { angleDegrees: number }).angleDegrees = 180;
    });
    expect(complete(original)).toEqual(expected);
  });
});
