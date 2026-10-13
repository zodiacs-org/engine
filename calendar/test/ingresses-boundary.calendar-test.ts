import { afterEach, describe, expect, it, vi } from "vitest";
import { calc } from "../../src/calc.js";
import { EngineAdapter } from "../.cache/events-source/events/src/engine.js";
import type { EvaluationContext } from "../.cache/events-source/events/src/context.js";
import { searchIngressSchedule } from "../src/ingresses.js";
import type { IngressScheduleRequest } from "../src/ingresses.js";
import type { ScheduleEvent } from "../src/types.js";

const DAY_MS = 86_400_000;
const epoch = Date.parse("2026-02-01T00:00:00.000Z");
const instant = (days: number) => new Date(epoch + days * DAY_MS).toISOString();
const request: IngressScheduleRequest = {
  namespace: "synthetic-ingress-boundaries.calendar.invalid",
  body: "Sun", startUtc: instant(0), endUtc: instant(1),
  clock: "utc", stepMs: DAY_MS / 16, maxEvaluations: 10_000
};

// Invented longitudes exercise the actual upstream scanner, including its root
// refinement and budgets. The receipt calc remains real to test UTC plumbing.
// These mixed synthetic/real records are not astronomical accuracy evidence.
function useSyntheticLongitude(longitude: (days: number) => number,
  onSample?: (context: EvaluationContext) => void) {
  const reference = calc({ body: "Sun", time: instant(0) });
  if (reference.status !== "ok") throw new Error("Test reference instant was refused.");
  const sourceInstant = reference.receipt.instants[0]!;
  return vi.spyOn(EngineAdapter.prototype, "sample").mockImplementation(function (this: EngineAdapter, _body, atMs) {
    return this.context.evaluate(() => {
      onSample?.(this.context);
      const angle = longitude((atMs - epoch) / DAY_MS);
      return { atMs, longitude: (angle % 360 + 360) % 360,
        speedDegreesPerDay: null, instant: sourceInstant };
    });
  });
}

const repeatedPasses = (days: number) => 30 + 5 * Math.cos(4 * Math.PI * days);
const identities = (events: readonly ScheduleEvent[]) => events.map(({ uid, identity, receipt }) => ({
  uid, identity, utc: receipt.utc
}));

afterEach(() => vi.restoreAllMocks());

describe("ingress schedules at fixed UTC day boundaries", () => {
  it("uses the following day to suppress an exact midnight touch", () => {
    const sampledWindows: { startMs: number; endMs: number }[] = [];
    useSyntheticLongitude(days => 30 - 5 * (days - 1) ** 2, context => {
      sampledWindows.push(context.window);
    });
    const result = searchIngressSchedule({ ...request, startUtc: instant(0.9) });
    expect(result.status).toBe("complete");
    expect(result.events).toEqual([]);
    expect(result.evaluations).toBeGreaterThan(0);
    expect(sampledWindows.every(window => window.startMs === epoch && window.endMs === epoch + 2 * DAY_MS)).toBe(true);
  });

  it("assigns an exact midnight crossing to the preceding day once", () => {
    useSyntheticLongitude(days => 20 + 10 * days);
    const whole = searchIngressSchedule({ ...request, endUtc: instant(2) });
    const left = searchIngressSchedule(request);
    const right = searchIngressSchedule({ ...request, startUtc: instant(1), endUtc: instant(2) });
    expect(whole.status).toBe("complete");
    expect(whole.events.map(event => event.receipt.utc)).toEqual([instant(1)]);
    expect(whole.events[0]?.identity?.occurrence).toEqual({
      scheme: "utc-day-ordinal/1", startUtc: instant(0), ordinal: 0
    });
    expect(identities([...left.events, ...right.events])).toEqual(identities(whole.events));
    expect(right.events).toEqual([]);
  });

  it("retains complete-day ordinals through overlaps, regeneration and partitions", () => {
    useSyntheticLongitude(repeatedPasses);
    const whole = searchIngressSchedule({ ...request, endUtc: instant(2) });
    const regenerated = searchIngressSchedule({ ...request, endUtc: instant(2) });
    const overlap = searchIngressSchedule({ ...request, startUtc: instant(0.5), endUtc: instant(1.5) });
    expect(whole.status).toBe("complete");
    expect(whole.events).toHaveLength(8);
    expect(identities(regenerated.events)).toEqual(identities(whole.events));
    expect(identities(overlap.events)).toEqual(identities(whole.events.filter(event =>
      event.receipt.utc > instant(0.5) && event.receipt.utc <= instant(1.5))));
    expect(overlap.events[0]?.identity?.occurrence).toEqual({
      scheme: "utc-day-ordinal/1", startUtc: instant(0), ordinal: 1
    });
    // Include both a midnight split and a split exactly at a returned instant.
    for (const split of [instant(1), whole.events[2]!.receipt.utc, instant(0.6)]) {
      const left = searchIngressSchedule({ ...request, endUtc: split });
      const right = searchIngressSchedule({ ...request, startUtc: split, endUtc: instant(2) });
      expect(identities([...left.events, ...right.events])).toEqual(identities(whole.events));
      expect(new Set([...left.events, ...right.events].map(event => event.uid)).size).toBe(8);
    }
  });
});

describe("ingress schedule resource controls", () => {
  it("charges full-day receipt calculations even when display filtering hides events", () => {
    const sample = useSyntheticLongitude(repeatedPasses);
    const whole = searchIngressSchedule(request);
    expect(whole.status).toBe("complete");
    expect(whole.events).toHaveLength(4);
    expect(whole.evaluations).toBe(sample.mock.calls.length + whole.events.length);
    sample.mockClear();
    const clipped = searchIngressSchedule({ ...request, startUtc: instant(0.5), endUtc: instant(0.9) });
    expect(clipped.status).toBe("complete");
    expect(clipped.events).toHaveLength(2);
    expect(clipped.evaluations).toBe(whole.evaluations);
    expect(clipped.evaluations).toBe(sample.mock.calls.length + whole.events.length);
  });

  it("returns no events if scanning or receipt creation exhausts the total budget", () => {
    useSyntheticLongitude(repeatedPasses);
    const complete = searchIngressSchedule(request);
    expect(complete.status).toBe("complete");
    for (const maxEvaluations of [1, complete.evaluations - 4, complete.evaluations - 1]) {
      expect(searchIngressSchedule({ ...request, maxEvaluations })).toEqual({
        status: "refused", reason: "evaluation-budget", events: [], evaluations: maxEvaluations
      });
    }
    expect(searchIngressSchedule({ ...request, maxEvaluations: complete.evaluations })).toEqual(complete);
  });

  it("does not reset the budget or retain earlier events on a later day", () => {
    useSyntheticLongitude(repeatedPasses);
    const firstDay = searchIngressSchedule(request);
    const maxEvaluations = firstDay.evaluations + 1;
    expect(searchIngressSchedule({ ...request, endUtc: instant(2), maxEvaluations })).toEqual({
      status: "refused", reason: "evaluation-budget", events: [], evaluations: maxEvaluations
    });
  });

  it("cancels before sampling and discards earlier days if cancellation occurs later", () => {
    const preAborted = new AbortController();
    preAborted.abort();
    const sample = useSyntheticLongitude(repeatedPasses);
    expect(searchIngressSchedule({ ...request, signal: preAborted.signal })).toEqual({
      status: "refused", reason: "cancelled", events: [], evaluations: 0
    });
    expect(sample).not.toHaveBeenCalled();
    sample.mockRestore();
    const controller = new AbortController();
    useSyntheticLongitude(repeatedPasses, context => {
      if (context.window.startMs === epoch + DAY_MS) controller.abort();
    });
    const cancelled = searchIngressSchedule({ ...request, endUtc: instant(2), signal: controller.signal });
    expect(cancelled).toMatchObject({ status: "refused", reason: "cancelled", events: [] });
    expect(cancelled.evaluations).toBeGreaterThan(1);
  });

  it("propagates unexpected sample errors instead of reporting a complete feed", () => {
    useSyntheticLongitude(() => { throw new Error("Synthetic provider failure"); });
    expect(() => searchIngressSchedule(request)).toThrow("Synthetic provider failure");
  });
});

describe("ingress schedule input validation", () => {
  it.each([
    { clock: "tt" }, { clock: "ut1" }, { clock: undefined }, { body: "Earth" },
    { startUtc: instant(1) }, { startUtc: instant(2) },
    { startUtc: "2026-02-30T00:00:00.000Z" },
    { startUtc: "2026-02-01T00:00:00.000+00:00" },
    { startUtc: "2026-02-01T00:00:00Z" },
    { endUtc: "9999-12-31T23:59:59.999Z" },
    { stepMs: 0 }, { stepMs: -1 }, { stepMs: 7 }, { stepMs: 0.5 }, { stepMs: Infinity },
    { maxEvaluations: 0 }, { maxEvaluations: -1 }, { maxEvaluations: 1.5 }, { maxEvaluations: Infinity },
    { namespace: "" }, { unexpected: true }, { signal: {} }
  ])("rejects invalid settings before sampling: %j", invalid => {
    const sample = useSyntheticLongitude(repeatedPasses);
    expect(() => searchIngressSchedule({ ...request, ...invalid } as IngressScheduleRequest)).toThrow();
    expect(sample).not.toHaveBeenCalled();
  });
});
