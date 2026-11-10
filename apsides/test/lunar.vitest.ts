import { afterEach, describe, expect, it, vi } from "vitest";
import { calc } from "@zodiacs/engine/calc";
import type { CalcTime } from "@zodiacs/engine/calc";
import { LUNAR_SEARCH_POLICY, searchLunarApsides } from "../src/index.js";
import type { LunarSearchOptions, LunarSearchResult } from "../src/index.js";
import * as sampling from "../src/sample.js";

const tt = (jd: number): CalcTime => ({ jd, scale: "tt" });
const month = { from: tt(2_451_544.5), to: tt(2_451_575.5) };
const run = (options: LunarSearchOptions = month): Extract<LunarSearchResult, { status: "complete" }> => {
  const result = searchLunarApsides(options);
  if (result.status !== "complete") throw new Error(`${result.reason}: ${result.detail}`);
  return result;
};

afterEach(() => vi.restoreAllMocks());

// These are integration and boundary contracts. Reusing an event in a new
// request checks deterministic ownership, not independent astronomical accuracy.
describe("lunar window ownership and canonical sampling", () => {
  it("partitions identically at events, grid nodes, and times just beside events", () => {
    const whole = run();
    const cuts = [
      2_451_550,
      ...whole.events.flatMap(({ instant }) => [
        instant.jdTt - 1 / 86_400, instant.jdTt, instant.jdTt + 1 / 86_400,
        // Nearest neighboring binary64 JDs in this epoch's binade.
        instant.jdTt - 2 ** -31, instant.jdTt + 2 ** -31
      ])
    ];
    for (const cut of cuts) {
      const left = run({ from: month.from, to: tt(cut) });
      const right = run({ from: tt(cut), to: month.to });
      expect([...left.events, ...right.events]).toEqual(whole.events);
      expect(left.events.every(({ instant }) => instant.jdTt <= cut)).toBe(true);
      expect(right.events.every(({ instant }) => instant.jdTt > cut)).toBe(true);
    }
  });

  it("finds events in tiny windows using padded witnesses and excludes its left edge", () => {
    for (const event of run().events) {
      const jd = event.instant.jdTt;
      expect(run({ from: tt(jd - 1 / 86_400), to: tt(jd) }).events).toEqual([event]);
      expect(run({ from: tt(jd), to: tt(jd + 1 / 86_400) }).events).toEqual([]);
      expect(run({ from: tt(jd - 1 / 86_400), to: tt(jd + 1 / 86_400) }).events).toEqual([event]);
    }
  });

  it("does not fabricate events at empty or monotone window endpoints", () => {
    const empty = run({ from: month.from, to: month.from });
    expect(empty.events).toEqual([]);
    expect(empty.diagnostics).toMatchObject({ evaluations: 2, grid: null });
    expect(run({ from: tt(2_451_550), to: tt(2_451_551) }).events).toEqual([]);
  });

  it("records the fixed grid, completion qualification, geometry and numerical witnesses", () => {
    const result = run();
    expect(LUNAR_SEARCH_POLICY).toEqual({
      originJdTt: 2_451_545, stepSeconds: 43_200, paddingSteps: 2,
      toleranceSeconds: 1, defaultMaxEvaluations: 100_000
    });
    expect(Object.isFrozen(LUNAR_SEARCH_POLICY)).toBe(true);
    expect(result.diagnostics).toMatchObject({
      policy: LUNAR_SEARCH_POLICY, completeness: "sampled-not-proven",
      grid: { fromJdTt: 2_451_543.5, toJdTt: 2_451_576.5, samples: 67 }
    });
    expect(result.window.boundary).toBe("(from,to]");
    for (const event of result.events) {
      expect(event.target).toMatchObject({ body: "Moon", center: "geocentric", referencePoint: "body-center" });
      const { lower, upper, bracket } = event.refinement;
      expect(lower.jdTt).toBeLessThan(event.instant.jdTt);
      expect(upper.jdTt).toBeGreaterThan(event.instant.jdTt);
      expect((upper.jdTt - lower.jdTt) * 86_400).toBeLessThanOrEqual(1);
      const sign = event.kind === "perigee" ? 1 : -1;
      for (const point of [lower, upper, bracket[0], bracket[2]]) {
        expect(sign * (point.distanceKm - event.distanceKm)).toBeGreaterThan(0);
      }
      expect(calc(event.receipt.request)).toMatchObject({ status: "ok", dist: event.distanceAu });
    }
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it("is deterministic across repeated calls and does not retain input Dates", () => {
    const from = new Date("2000-01-01T00:00:00Z");
    const to = new Date("2000-02-01T00:00:00Z");
    const input = Object.freeze({ from, to });
    const result = run(input);
    expect(run(input)).toEqual(result);
    expect(from.toISOString()).toBe("2000-01-01T00:00:00.000Z");
    from.setUTCFullYear(2002);
    to.setUTCFullYear(2002);
    expect(result.window.endpointReceipts.from.request.time).toEqual({ iso: "2000-01-01T00:00:00.000Z" });
    expect(result.window.endpointReceipts.to.request.time).toEqual({ iso: "2000-02-01T00:00:00.000Z" });
  });

  it("resolves UTC across a leap second then evaluates all internal samples on TT", () => {
    const spy = vi.spyOn(sampling, "sampleDistance");
    const result = run({ from: "2016-12-25", to: "2017-01-05" });
    expect(result.window.to.deltaT.model).toBe("iers-utc/1");
    expect(result.window.from.timeScale.input).toBe("utc");
    const times = spy.mock.calls.slice(2).map(([, time]) => time);
    expect(times.length).toBeGreaterThan(0);
    for (const time of times) expect(time).toMatchObject({ scale: "tt" });
    expect(run({ from: tt(result.window.from.jdTt), to: tt(result.window.to.jdTt) }).events).toEqual(result.events);
  });

  it("keeps pinned endpoint receipts but uses the normal engine basis for interior TT samples", () => {
    const result = run({
      from: { iso: "2000-01-01", deltaT: 100 },
      to: { iso: "2000-02-01", deltaT: 200 }
    });
    expect(result.window.from.deltaT.model).toBe("pinned");
    expect(result.window.to.deltaT.model).toBe("pinned");
    for (const event of result.events) {
      expect(event.instant.timeScale.input).toBe("tt");
      expect(event.instant.deltaT.model).not.toBe("pinned");
      expect(event.receipt.request.time).toEqual({ jd: event.instant.jdTt, scale: "tt" });
    }
    expect(run({ from: tt(result.window.from.jdTt), to: tt(result.window.to.jdTt) }).events).toEqual(result.events);
  });
});

describe("lunar work accounting and refusals", () => {
  it("counts all engine calls once and reuses TT samples during event assembly", () => {
    const spy = vi.spyOn(sampling, "sampleDistance");
    const result = run();
    expect(result.diagnostics.evaluations).toBe(spy.mock.calls.length);
    const internal = spy.mock.calls.slice(2).map(([, time]) => (time as { jd: number }).jd);
    expect(new Set(internal).size).toBe(internal.length);
  });

  it("accepts the exact budget and refuses one call short without returning partial events", () => {
    const baseline = run();
    const cap = baseline.diagnostics.evaluations;
    expect(run({ ...month, maxEvaluations: cap }).events).toEqual(baseline.events);
    const spy = vi.spyOn(sampling, "sampleDistance");
    const result = searchLunarApsides({ ...month, maxEvaluations: cap - 1 });
    expect(result).toMatchObject({ status: "refused", reason: "evaluation-budget", events: [], engineRefusal: null });
    expect(result.diagnostics.evaluations).toBe(cap - 1);
    expect(spy).toHaveBeenCalledTimes(cap - 1);
  });

  it.each([1, 2, 20])("refuses an unaffordable grid under budget %s", (maxEvaluations) => {
    const spy = vi.spyOn(sampling, "sampleDistance");
    const result = searchLunarApsides({ ...month, maxEvaluations });
    expect(result).toMatchObject({ status: "refused", reason: "evaluation-budget", events: [] });
    expect(result.diagnostics.evaluations).toBe(Math.min(2, maxEvaluations));
    expect(spy).toHaveBeenCalledTimes(result.diagnostics.evaluations);
  });

  it.each([
    { from: "1800-01-01T12:00:00Z", to: "1800-01-02T00:00:00Z" },
    { from: "2199-12-30T00:00:00Z", to: "2199-12-31T12:00:00Z" }
  ])("refuses unavailable padded edge coverage instead of silently truncating the grid", (input) => {
    const result = searchLunarApsides(input);
    expect(result).toMatchObject({
      status: "refused", reason: "edge-coverage", events: [],
      engineRefusal: { status: "refused", reason: "out-of-range" }
    });
    expect(result.window).not.toBeNull();
  });

  it("preserves an endpoint engine refusal", () => {
    const result = searchLunarApsides({ from: "1799-01-01", to: "1801-01-01" });
    expect(result).toMatchObject({
      status: "refused", reason: "engine-refusal", events: [], window: null,
      engineRefusal: { status: "refused", reason: "out-of-range" }
    });
    expect(result.diagnostics.evaluations).toBe(1);
  });

  it("propagates unexpected sampler exceptions instead of disguising a broken computation", () => {
    const failure = new Error("Unexpected engine failure");
    vi.spyOn(sampling, "sampleDistance").mockImplementation(() => { throw failure; });
    expect(() => searchLunarApsides(month)).toThrow(failure);
  });
});

describe("lunar input validation", () => {
  it.each([0, -1, 1.5, NaN, Infinity, null, undefined, Number.MAX_SAFE_INTEGER + 1])(
    "rejects an explicitly invalid budget %s before engine evaluation", (maxEvaluations) => {
      const spy = vi.spyOn(sampling, "sampleDistance");
      expect(() => searchLunarApsides({ ...month, maxEvaluations } as LunarSearchOptions)).toThrow(RangeError);
      expect(spy).not.toHaveBeenCalled();
    }
  );

  it.each([null, [], {}, { from: month.from }, { ...month, stepDays: 10 }])(
    "rejects malformed options %j", (options) => {
      expect(() => searchLunarApsides(options as LunarSearchOptions)).toThrow(RangeError);
    }
  );

  it("rejects accessor options without invoking them", () => {
    const getter = vi.fn(() => month.from);
    const input = Object.defineProperty({ to: month.to }, "from", { get: getter, enumerable: true });
    expect(() => searchLunarApsides(input as LunarSearchOptions)).toThrow(RangeError);
    expect(getter).not.toHaveBeenCalled();
  });

  it.each(["2000-02-30", "2000-01-01T12:00:00", new Date(NaN), { jd: Infinity, scale: "tt" }])(
    "keeps the engine's malformed-time validation for %j", (from) => {
      expect(() => searchLunarApsides({ from: from as CalcTime, to: month.to })).toThrow(RangeError);
    }
  );

  it("rejects reversed endpoints after comparing their resolved TT instants", () => {
    expect(() => searchLunarApsides({ from: month.to, to: month.from })).toThrow(RangeError);
    expect(() => searchLunarApsides({ from: "2000-01-01T12:00:00Z", to: tt(2_451_545) })).toThrow(RangeError);
  });
});
