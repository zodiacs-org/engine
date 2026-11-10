import { afterEach, describe, expect, it, vi } from "vitest";
import * as calculation from "../../src/calc.js";
import { EclipseEngineAdapter } from "../.cache/events-source/events/src/eclipses.js";
import type { EclipseKind, EclipseVector } from "../.cache/events-source/events/src/eclipses.js";
import type { EvaluationContext } from "../.cache/events-source/events/src/context.js";
import { searchEclipseSchedule } from "../src/eclipses.js";
import type { EclipseScheduleRequest } from "../src/eclipses.js";

const DAY_MS = 86_400_000;
const epoch = Date.parse("2026-02-01T00:00:00.000Z");
const instant = (days: number) => new Date(epoch + days * DAY_MS).toISOString();
const request: EclipseScheduleRequest = {
  namespace: "synthetic-eclipse-boundaries.calendar.invalid",
  kind: "lunar", startUtc: instant(0), endUtc: instant(1), clock: "utc",
  stepMs: DAY_MS / 16, derivativeStepMs: 1_000, maxEvaluations: 10_000,
  model: { sunRadiusAu: 0.00465, moonRadiusAu: 0.000012, earthRadiusAu: 0.000043 }
};
const repeatedPasses = (days: number) => 0.0001 * Math.cos(4 * Math.PI * days);

// Invented vectors exercise the real upstream geometry, derivative and root
// searches. Each sample charges both bodies as the engine adapter does. Receipt
// calculations remain real; these mixed records test plumbing, not sky accuracy.
function useSyntheticVectors(offset: (days: number) => number,
  kind: EclipseKind = "lunar", onSample?: (context: EvaluationContext) => void) {
  return vi.spyOn(EclipseEngineAdapter.prototype, "sample")
    .mockImplementation(function (this: EclipseEngineAdapter, atMs) {
      const sun = this.context.evaluate((): EclipseVector => {
        onSample?.(this.context);
        return [1, 0, 0];
      });
      const moon = this.context.evaluate((): EclipseVector => [
        kind === "solar" ? 0.00257 : -0.00257, offset((atMs - epoch) / DAY_MS), 0
      ]);
      return { sun, moon };
    });
}

function complete(input = request) {
  const result = searchEclipseSchedule(input);
  expect(result.status).toBe("complete");
  if (result.status !== "complete") throw new Error(result.reason);
  return result;
}

afterEach(() => vi.restoreAllMocks());

describe("eclipse canonical day ownership", () => {
  it.each(["solar", "lunar"] as const)("finds a %s minimum closer to day start than the derivative step", kind => {
    const windows: { startMs: number; endMs: number }[] = [];
    const rootMs = 500;
    useSyntheticVectors(days => 0.0001 * (days - rootMs / DAY_MS), kind, context => {
      windows.push(context.window);
    });
    const result = complete({ ...request, kind });
    expect(result.events.map(event => event.receipt.utc)).toEqual([new Date(epoch + rootMs).toISOString()]);
    expect(windows.length).toBeGreaterThan(0);
    expect(windows.every(window => window.startMs === epoch - DAY_MS && window.endMs === epoch + 2 * DAY_MS)).toBe(true);
    expect(result.events[0]!.identity!.occurrence).toEqual({
      scheme: "utc-day-ordinal/1", startUtc: instant(0), ordinal: 0
    });
  });

  it.each(["solar", "lunar"] as const)("owns an exact midnight %s minimum once", kind => {
    useSyntheticVectors(days => 0.0001 * (days - 1), kind);
    const whole = complete({ ...request, kind, endUtc: instant(2) });
    const left = complete({ ...request, kind });
    const right = complete({ ...request, kind, startUtc: instant(1), endUtc: instant(2) });
    expect(whole.events.map(event => event.receipt.utc)).toEqual([instant(1)]);
    expect(whole.events[0]!.identity!.occurrence).toEqual({
      scheme: "utc-day-ordinal/1", startUtc: instant(0), ordinal: 0
    });
    expect([...left.events, ...right.events]).toEqual(whole.events);
    expect(right.events).toEqual([]);
  });

  it("retains repeated minima, ordinals and UIDs through regeneration, overlaps and partitions", () => {
    useSyntheticVectors(repeatedPasses);
    const whole = complete({ ...request, endUtc: instant(2) });
    expect(whole.events).toHaveLength(8);
    expect(new Set(whole.events.map(event => event.uid)).size).toBe(8);
    expect(complete({ ...request, endUtc: instant(2) })).toEqual(whole);
    const overlap = complete({ ...request, startUtc: instant(0.5), endUtc: instant(1.5) });
    expect(overlap.events).toEqual(whole.events.filter(event =>
      event.receipt.utc > instant(0.5) && event.receipt.utc <= instant(1.5)));
    expect(overlap.events[0]!.identity!.occurrence).toEqual({
      scheme: "utc-day-ordinal/1", startUtc: instant(0), ordinal: 2
    });
    for (const split of [instant(1), whole.events[2]!.receipt.utc, instant(0.6)]) {
      const left = complete({ ...request, endUtc: split });
      const right = complete({ ...request, startUtc: split, endUtc: instant(2) });
      expect([...left.events, ...right.events]).toEqual(whole.events);
    }
  });
});

describe("eclipse resource controls", () => {
  it("charges two body calculations per sample and per owned event before display filtering", () => {
    const sample = useSyntheticVectors(repeatedPasses);
    const whole = complete();
    expect(whole.events).toHaveLength(4);
    expect(whole.evaluations).toBe(2 * sample.mock.calls.length + 2 * whole.events.length);
    sample.mockClear();
    const clipped = complete({ ...request, startUtc: instant(0.5), endUtc: instant(0.9) });
    expect(clipped.events).toHaveLength(2);
    expect(clipped.evaluations).toBe(whole.evaluations);
    expect(clipped.evaluations).toBe(2 * sample.mock.calls.length + 2 * whole.events.length);
  });

  it("discards events when either search or receipt calculations exhaust the budget", () => {
    useSyntheticVectors(repeatedPasses);
    const result = complete();
    for (const maxEvaluations of [1, 2, result.evaluations - 8, result.evaluations - 1]) {
      expect(searchEclipseSchedule({ ...request, maxEvaluations })).toEqual({
        status: "refused", reason: "evaluation-budget", events: [], evaluations: maxEvaluations
      });
    }
    expect(complete({ ...request, maxEvaluations: result.evaluations })).toEqual(result);
  });

  it("shares the budget across days and discards earlier completed events", () => {
    useSyntheticVectors(repeatedPasses);
    const firstDay = complete();
    const maxEvaluations = firstDay.evaluations + 1;
    expect(searchEclipseSchedule({ ...request, endUtc: instant(2), maxEvaluations })).toEqual({
      status: "refused", reason: "evaluation-budget", events: [], evaluations: maxEvaluations
    });
  });

  it("cancels before any work and discards earlier days when cancellation occurs during sampling", () => {
    const sample = useSyntheticVectors(repeatedPasses);
    expect(searchEclipseSchedule({ ...request, signal: AbortSignal.abort() })).toEqual({
      status: "refused", reason: "cancelled", events: [], evaluations: 0
    });
    expect(sample).not.toHaveBeenCalled();
    const firstDay = complete();
    sample.mockRestore();
    const controller = new AbortController();
    useSyntheticVectors(repeatedPasses, "lunar", context => {
      if (context.window.startMs === epoch) controller.abort();
    });
    expect(searchEclipseSchedule({ ...request, endUtc: instant(2), signal: controller.signal })).toEqual({
      status: "refused", reason: "cancelled", events: [], evaluations: firstDay.evaluations + 1
    });
  });

  it("refuses and discards prior receipts if a body receipt calculation is refused", () => {
    useSyntheticVectors(repeatedPasses);
    const refusal = calculation.calc({ body: "Moon", time: "1700-01-01T00:00:00.000Z" });
    expect(refusal.status).toBe("refused");
    const actualCalc = calculation.calc;
    let calls = 0;
    const receipts = vi.spyOn(calculation, "calc").mockImplementation(input =>
      ++calls === 4 ? refusal : actualCalc(input));
    const result = searchEclipseSchedule(request);
    expect(result).toMatchObject({ status: "refused", reason: "engine-refused", events: [] });
    expect(result.evaluations).toBeGreaterThan(4);
    expect(receipts).toHaveBeenCalledTimes(4);
  });

  it("propagates unexpected provider errors", () => {
    useSyntheticVectors(() => { throw new Error("Synthetic eclipse provider failure"); });
    expect(() => searchEclipseSchedule(request)).toThrow("Synthetic eclipse provider failure");
  });
});

describe("eclipse request validation", () => {
  it.each([
    { clock: "tt" }, { clock: "ut1" }, { clock: undefined }, { kind: "annular" }, { kind: undefined },
    { startUtc: instant(1) }, { startUtc: instant(2) },
    { startUtc: "2026-02-30T00:00:00.000Z" },
    { startUtc: "2026-02-01T00:00:00.000+00:00" }, { startUtc: "2026-02-01T00:00:00Z" },
    { startUtc: "0001-01-01T00:00:00.000Z" }, { endUtc: "9999-12-31T23:59:59.999Z" },
    { stepMs: 0 }, { stepMs: -1 }, { stepMs: 7 }, { stepMs: 0.5 }, { stepMs: Infinity },
    { derivativeStepMs: 0 }, { derivativeStepMs: -1 }, { derivativeStepMs: 0.5 },
    { derivativeStepMs: Infinity }, { derivativeStepMs: DAY_MS + 1 }, { derivativeStepMs: undefined },
    { model: null }, { model: undefined }, { model: {} },
    { model: { ...request.model, earthRadiusAu: 0 } },
    { model: { ...request.model, moonRadiusAu: -1 } },
    { model: { ...request.model, sunRadiusAu: NaN } },
    { model: { ...request.model, earthRadiusAu: Infinity } },
    { model: { ...request.model, sunRadiusAu: request.model.earthRadiusAu } },
    { model: { ...request.model, sunRadiusAu: request.model.moonRadiusAu } },
    { model: { ...request.model, unexpected: 1 } },
    { maxEvaluations: 0 }, { maxEvaluations: -1 }, { maxEvaluations: 1.5 }, { maxEvaluations: Infinity },
    { namespace: "" }, { unexpected: true }, { signal: {} }
  ])("rejects invalid settings before sampling, even when cancelled: %j", invalid => {
    const sample = useSyntheticVectors(repeatedPasses);
    expect(() => searchEclipseSchedule({ ...request, signal: AbortSignal.abort(),
      ...invalid } as EclipseScheduleRequest)).toThrow();
    expect(sample).not.toHaveBeenCalled();
  });

  it("accepts the largest supported derivative step before cancellation", () => {
    const sample = useSyntheticVectors(repeatedPasses);
    expect(searchEclipseSchedule({ ...request, derivativeStepMs: DAY_MS, signal: AbortSignal.abort() })).toEqual({
      status: "refused", reason: "cancelled", events: [], evaluations: 0
    });
    expect(sample).not.toHaveBeenCalled();
  });

  it("snapshots the spherical model before a provider mutates caller input", () => {
    const mutable = structuredClone(request);
    useSyntheticVectors(repeatedPasses);
    const expected = complete(mutable);
    vi.restoreAllMocks();
    useSyntheticVectors(repeatedPasses, "lunar", () => {
      (mutable.model as { earthRadiusAu: number }).earthRadiusAu = 0;
      (mutable.model as { moonRadiusAu: number }).moonRadiusAu = 0;
    });
    expect(complete(mutable)).toEqual(expected);
  });
});
