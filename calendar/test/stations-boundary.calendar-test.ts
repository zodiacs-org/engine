import { afterEach, describe, expect, it, vi } from "vitest";
import { calc } from "../../src/calc.js";
import * as calculations from "../../src/calc.js";
import { EngineAdapter } from "../.cache/events-source/events/src/engine.js";
import type { EvaluationContext } from "../.cache/events-source/events/src/context.js";
import { searchStationSchedule } from "../src/stations.js";
import type { StationScheduleRequest } from "../src/stations.js";
import type { ScheduleEvent } from "../src/types.js";

const DAY_MS = 86_400_000;
const epoch = Date.parse("2026-02-01T00:00:00.000Z");
const instant = (days: number) => new Date(epoch + days * DAY_MS).toISOString();
const request: StationScheduleRequest = {
  namespace: "synthetic-station-boundaries.calendar.invalid",
  body: "Mercury", startUtc: instant(0), endUtc: instant(1),
  clock: "utc", stepMs: DAY_MS / 16, maxEvaluations: 10_000
};

// Invented motion drives the actual upstream scanner, root refinement and work
// accounting. Receipt calculations remain real to exercise the UTC interface;
// these mixed records are not astronomical accuracy evidence.
function useSyntheticMotion(speed: (days: number) => number,
  longitude: (days: number) => number = () => 100,
  onSample?: (context: EvaluationContext) => void) {
  const reference = calc({ body: "Mercury", time: instant(0) });
  if (reference.status !== "ok") throw new Error("Test reference instant was refused.");
  const sourceInstant = reference.receipt.instants[0]!;
  return vi.spyOn(EngineAdapter.prototype, "sample").mockImplementation(function (this: EngineAdapter, _body, atMs, withSpeed) {
    expect(withSpeed).toBe(true);
    return this.context.evaluate(() => {
      onSample?.(this.context);
      const days = (atMs - epoch) / DAY_MS;
      return { atMs, longitude: longitude(days), speedDegreesPerDay: speed(days), instant: sourceInstant };
    });
  });
}

const repeatedPasses = (days: number) => Math.cos(4 * Math.PI * days);
const identities = (events: readonly ScheduleEvent[]) => events.map(({ uid, identity, receipt }) => ({
  uid, identity, utc: receipt.utc
}));

afterEach(() => vi.restoreAllMocks());

describe("station schedules at fixed UTC day boundaries", () => {
  it.each(["direct", "retrograde"] as const)("owns an exact midnight %s crossing only on the preceding day", direction => {
    const factor = direction === "direct" ? 1 : -1;
    useSyntheticMotion(days => factor * (days - 1), days => 100 + factor * (days - 1) ** 2 / 2);
    const whole = searchStationSchedule({ ...request, endUtc: instant(2) });
    const left = searchStationSchedule(request);
    const right = searchStationSchedule({ ...request, startUtc: instant(1), endUtc: instant(2) });
    expect(whole.status).toBe("complete");
    expect(whole.events.map(event => event.receipt.utc)).toEqual([instant(1)]);
    expect(whole.events[0]?.identity?.occurrence).toEqual({
      scheme: "utc-day-ordinal/1", startUtc: instant(0), ordinal: 0
    });
    expect(whole.events[0]?.identity?.definition.parameters.direction).toBe(direction);
    expect(identities([...left.events, ...right.events])).toEqual(identities(whole.events));
    expect(right.events).toEqual([]);
  });

  it("uses the following day to distinguish an exact midnight touch from a reversal", () => {
    const windows: { startMs: number; endMs: number }[] = [];
    useSyntheticMotion(days => (days - 1) ** 2, days => 100 + (days - 1) ** 3 / 3,
      context => windows.push(context.window));
    const result = searchStationSchedule({ ...request, startUtc: instant(0.9) });
    expect(result.status).toBe("complete");
    expect(result.events).toEqual([]);
    expect(result.evaluations).toBeGreaterThan(0);
    expect(windows.every(window => window.startMs === epoch && window.endMs === epoch + 2 * DAY_MS)).toBe(true);
  });

  it("propagates the upstream unresolved zero-speed plateau, including one across midnight", () => {
    useSyntheticMotion(days => Math.abs(days - 1) <= 0.125 ? 0 : days - 1);
    expect(() => searchStationSchedule(request)).toThrow("Unresolved zero-speed plateau");
  });

  it("preserves complete-day ordinals across filters, overlapping requests and partitions", () => {
    useSyntheticMotion(repeatedPasses, days => 100 + Math.sin(4 * Math.PI * days) / (4 * Math.PI));
    const whole = searchStationSchedule({ ...request, endUtc: instant(2) });
    expect(whole.status).toBe("complete");
    expect(whole.events).toHaveLength(8);
    expect(identities(searchStationSchedule({ ...request, endUtc: instant(2) }).events)).toEqual(identities(whole.events));
    const overlap = searchStationSchedule({ ...request, startUtc: instant(0.5), endUtc: instant(1.5) });
    expect(identities(overlap.events)).toEqual(identities(whole.events.filter(event =>
      event.receipt.utc > instant(0.5) && event.receipt.utc <= instant(1.5))));
    expect(overlap.events[0]?.identity?.occurrence).toEqual({
      scheme: "utc-day-ordinal/1", startUtc: instant(0), ordinal: 1
    });
    for (const direction of ["direct", "retrograde"] as const) {
      const filtered = searchStationSchedule({ ...request, endUtc: instant(2), direction });
      expect(filtered.evaluations).toBe(whole.evaluations);
      expect(filtered.events).toEqual(whole.events.filter(event => event.identity?.definition.parameters.direction === direction));
    }
    for (const split of [instant(1), whole.events[2]!.receipt.utc, instant(0.6)]) {
      const left = searchStationSchedule({ ...request, endUtc: split });
      const right = searchStationSchedule({ ...request, startUtc: split, endUtc: instant(2) });
      expect(identities([...left.events, ...right.events])).toEqual(identities(whole.events));
      expect(new Set([...left.events, ...right.events].map(event => event.uid)).size).toBe(8);
    }
  });
});

describe("station schedule resource controls", () => {
  it("charges receipt calculations before time and direction filtering", () => {
    const sample = useSyntheticMotion(repeatedPasses);
    const whole = searchStationSchedule(request);
    expect(whole.status).toBe("complete");
    expect(whole.events).toHaveLength(4);
    expect(whole.evaluations).toBe(sample.mock.calls.length + whole.events.length);
    sample.mockClear();
    const clipped = searchStationSchedule({ ...request, startUtc: instant(0.5), endUtc: instant(0.9), direction: "direct" });
    expect(clipped.status).toBe("complete");
    expect(clipped.events).toHaveLength(1);
    expect(clipped.evaluations).toBe(whole.evaluations);
    expect(clipped.evaluations).toBe(sample.mock.calls.length + whole.events.length);
  });

  it("discards partial output when scanning or receipt creation exhausts the total budget", () => {
    useSyntheticMotion(repeatedPasses);
    const complete = searchStationSchedule(request);
    expect(complete.status).toBe("complete");
    for (const maxEvaluations of [1, complete.evaluations - 4, complete.evaluations - 1]) {
      expect(searchStationSchedule({ ...request, maxEvaluations })).toEqual({
        status: "refused", reason: "evaluation-budget", events: [], evaluations: maxEvaluations
      });
    }
    expect(searchStationSchedule({ ...request, maxEvaluations: complete.evaluations })).toEqual(complete);
  });

  it("does not reset the budget or retain earlier events on a later day", () => {
    useSyntheticMotion(repeatedPasses);
    const firstDay = searchStationSchedule(request);
    const maxEvaluations = firstDay.evaluations + 1;
    expect(searchStationSchedule({ ...request, endUtc: instant(2), maxEvaluations })).toEqual({
      status: "refused", reason: "evaluation-budget", events: [], evaluations: maxEvaluations
    });
  });

  it("cancels before work and discards earlier days when cancelled later", () => {
    const sample = useSyntheticMotion(repeatedPasses);
    expect(searchStationSchedule({ ...request, signal: AbortSignal.abort() })).toEqual({
      status: "refused", reason: "cancelled", events: [], evaluations: 0
    });
    expect(sample).not.toHaveBeenCalled();
    sample.mockRestore();
    const controller = new AbortController();
    useSyntheticMotion(repeatedPasses, undefined, context => {
      if (context.window.startMs === epoch + DAY_MS) controller.abort();
    });
    const cancelled = searchStationSchedule({ ...request, endUtc: instant(2), signal: controller.signal });
    expect(cancelled).toMatchObject({ status: "refused", reason: "cancelled", events: [] });
    expect(cancelled.evaluations).toBeGreaterThan(1);
  });

  it("discards events when cancelled during a receipt calculation", () => {
    useSyntheticMotion(repeatedPasses);
    const done = searchStationSchedule(request);
    const searchEvaluations = done.evaluations - done.events.length;
    const controller = new AbortController();
    const realCalc = calculations.calc;
    vi.spyOn(calculations, "calc").mockImplementationOnce(input => {
      const result = realCalc(input);
      controller.abort();
      return result;
    });
    expect(searchStationSchedule({ ...request, signal: controller.signal })).toEqual({
      status: "refused", reason: "cancelled", events: [], evaluations: searchEvaluations + 1
    });
  });

  it("discards events when the receipt calculation is refused by the engine", () => {
    useSyntheticMotion(repeatedPasses);
    const done = searchStationSchedule(request);
    const searchEvaluations = done.evaluations - done.events.length;
    const refusal = calc({ body: "Mercury", time: "1700-01-01T00:00:00.000Z" });
    expect(refusal.status).toBe("refused");
    vi.spyOn(calculations, "calc").mockReturnValueOnce(refusal);
    expect(searchStationSchedule(request)).toEqual({
      status: "refused", reason: "engine-refused", events: [], evaluations: searchEvaluations + 1
    });
  });

  it("propagates unexpected computation errors", () => {
    useSyntheticMotion(() => { throw new Error("Synthetic provider failure"); });
    expect(() => searchStationSchedule(request)).toThrow("Synthetic provider failure");
  });
});

describe("station schedule input validation", () => {
  it.each([
    { clock: "tt" }, { clock: "ut1" }, { clock: undefined }, { body: "Earth" },
    { direction: "reverse" }, { direction: null }, { direction: undefined },
    { startUtc: instant(1) }, { startUtc: instant(2) },
    { startUtc: "2026-02-30T00:00:00.000Z" },
    { startUtc: "2026-02-01T00:00:00.000+00:00" },
    { startUtc: "2026-02-01T00:00:00Z" },
    { endUtc: "9999-12-31T23:59:59.999Z" },
    { stepMs: 0 }, { stepMs: -1 }, { stepMs: 7 }, { stepMs: 0.5 }, { stepMs: Infinity },
    { maxEvaluations: 0 }, { maxEvaluations: -1 }, { maxEvaluations: 1.5 }, { maxEvaluations: Infinity },
    { namespace: "" }, { unexpected: true }, { signal: {} }
  ])("rejects invalid settings before sampling: %j", invalid => {
    const sample = useSyntheticMotion(repeatedPasses);
    expect(() => searchStationSchedule({ ...request, ...invalid } as StationScheduleRequest)).toThrow();
    expect(sample).not.toHaveBeenCalled();
  });
});
