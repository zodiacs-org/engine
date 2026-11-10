import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as engine from "../src/engine.js";
import { OCCULTATION_RADII, searchLunarOccultations } from "../src/index.js";
import type { LunarOccultationRequest, LunarOccultationResult } from "../src/index.js";
import { groupCandidatePassages } from "../src/occultation-series.js";

// Analytic trajectories, with synthetic adapter receipts. No accuracy evidence.
const DAY = 86_400_000, PERIOD = 4 * DAY, ORIGIN = Date.parse("2024-01-02T00:00:00Z");
const baseline = engine.positionAt({ body: "Moon", time: new Date(ORIGIN) });
if (baseline.status !== "ok") throw new Error("test position unavailable");
let origin: number, evaluated: number[];
let latitude: (ms: number) => number;
let longitude: (ms: number) => number;
let moonDistance: number | null;
const wrap = (x: number) => (x % 360 + 360) % 360;
const request = (from = -PERIOD / 4, to = PERIOD * 5.25): LunarOccultationRequest => ({
  target: "Mars", window: { from: new Date(origin + from), to: new Date(origin + to) }
});
function complete(result: LunarOccultationResult) {
  if (result.status !== "complete") throw new Error(`Unexpected candidate refusal: ${result.reason}`);
  return result;
}
beforeEach(() => {
  origin = ORIGIN;
  evaluated = [];
  latitude = (ms) => 1 + Math.cos(Math.PI * ms / (2 * PERIOD));
  longitude = (ms) => wrap(360 * ms / PERIOD);
  moonDistance = 384_400;
  vi.spyOn(engine, "positionAt").mockImplementation((input) => {
    const ms = new Date(input.time).getTime();
    evaluated.push(ms);
    const elapsed = ms - origin, moon = input.body === "Moon";
    return { ...baseline, body: input.body, lon: moon ? longitude(elapsed) : 0,
      lat: moon ? latitude(elapsed) : 0,
      dist: moon ? moonDistance === null ? null : moonDistance / OCCULTATION_RADII.auKm : 1,
      receipt: { ...baseline.receipt, request: { ...baseline.receipt.request,
        body: input.body, time: new Date(ms).toISOString(), frame: input.frame! } } };
  });
});
afterEach(() => vi.restoreAllMocks());

describe("window-local series on independent analytic lunar passages", () => {
  it("joins consecutive accepted revolutions and breaks after a rejected passage", () => {
    const result = complete(searchLunarOccultations(request()));
    expect(result.candidates.map((candidate) => candidate.passageIndex)).toEqual([1, 2, 3, 5]);
    expect(result.series.map((series) => series.passageIndices)).toEqual([[1, 2, 3], [5]]);
    expect(result.series.map((series) => series.candidateIndices)).toEqual([[0, 1, 2], [3]]);
    expect(result.candidates.map((candidate) => candidate.seriesIndex)).toEqual([0, 0, 0, 1]);
    expect(result.candidates.map((candidate) => candidate.geocentricOverlap)).toEqual([false, true, false, false]);
    for (const candidate of result.candidates) {
      const exact = origin + PERIOD * candidate.passageIndex;
      expect(Date.parse(candidate.interval.from)).toBeLessThan(exact);
      expect(Date.parse(candidate.interval.to)).toBeGreaterThan(exact);
      expect(candidate.receipt.search).toBe(result.receipt);
      expect(candidate.sample.envelopeClearanceDegrees).toBeLessThan(0);
    }
    for (const series of result.series) {
      expect(series.receipt.search).toBe(result.receipt);
      expect(series.receipt.continuation).toBe("outside-window-unknown");
    }
    expect(evaluated.length).toBe(2 * result.receipt.search.samples);
    expect(Math.min(...evaluated)).toBe(origin - PERIOD / 4);
    expect(Math.max(...evaluated)).toBe(origin + PERIOD * 5.25);
  });

  it("uses a local revolution origin without inventing persistent series ids", () => {
    const result = complete(searchLunarOccultations(request(PERIOD * 2.75, PERIOD * 5.25)));
    expect(result.candidates.map((candidate) => candidate.passageIndex)).toEqual([0, 2]);
    expect(result.series.map((series) => series.passageIndices)).toEqual([[0], [2]]);
  });

  it.each([ORIGIN, Date.parse("1923-01-27T00:00:00Z")])("retains clipped intervals before and after Unix time %#", (epoch) => {
    origin = epoch;
    latitude = () => 0;
    const whole = complete(searchLunarOccultations(request(-DAY, DAY)));
    expect(whole.candidates).toHaveLength(1);
    const candidate = whole.candidates[0]!;
    const left = complete(searchLunarOccultations(request(-DAY, 0))).candidates[0]!;
    const right = complete(searchLunarOccultations(request(0, DAY))).candidates[0]!;
    expect(left.interval.from).toBe(candidate.interval.from);
    expect(right.interval.to).toBe(candidate.interval.to);
    expect(left.interval).toMatchObject({ to: new Date(origin).toISOString(), end: "window" });
    expect(right.interval).toMatchObject({ from: new Date(origin).toISOString(), start: "window" });
    expect(left.geocentricOverlap).toBe(true);
    expect(right.geocentricOverlap).toBe(true);
  });

  it("rejects near misses even when the relative RA passes exactly through zero", () => {
    latitude = () => 2;
    const result = complete(searchLunarOccultations(request(-DAY, DAY)));
    expect(result.candidates).toEqual([]);
    expect(result.series).toEqual([]);
  });

  it("refuses reverse winding instead of inventing membership", () => {
    longitude = (ms) => wrap(-360 * ms / PERIOD);
    expect(searchLunarOccultations(request())).toMatchObject({ status: "refused",
      reason: "unresolved-passage", candidates: [], series: [] });
  });

  it.each([null, 0, NaN, 1_000, 2e8])("refuses impossible lunar range %s", (range) => {
    moonDistance = range;
    expect(searchLunarOccultations(request())).toMatchObject({ status: "refused",
      reason: "invalid-geometry", candidates: [], series: [] });
  });

  it("discards all candidates when the final output sample exceeds the budget", () => {
    const full = complete(searchLunarOccultations(request()));
    const budget = full.receipt.search.samples - 1;
    evaluated = [];
    const result = searchLunarOccultations({ ...request(), maxSamples: budget });
    expect(result).toMatchObject({ status: "refused", reason: "sample-budget", candidates: [], series: [],
      receipt: { search: { samples: budget, maxSamples: budget } } });
    expect(evaluated.length).toBe(2 * budget);
  });

  it("groups multiple intervals in the same passage without conflating a later gap", () => {
    expect(groupCandidatePassages([0, 0, 1, 3, 4, 7])).toEqual([[0, 1, 2], [3, 4], [5]]);
    expect(groupCandidatePassages([])).toEqual([]);
    for (const invalid of [[1, 0], [NaN], [0.5], [Infinity]]) {
      expect(() => groupCandidatePassages(invalid)).toThrow(RangeError);
    }
  });
});
