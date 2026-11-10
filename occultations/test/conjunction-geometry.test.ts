import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as engine from "../src/engine.js";
import { searchConjunctions } from "../src/conjunctions.js";
import type { ConjunctionRequest, ConjunctionResult } from "../src/conjunctions.js";

// Independent analytic trajectories exercise the wrapper and engine solver.
// Adapter receipts below are test doubles, never astronomy accuracy evidence.
const HOUR = 3_600_000;
const EPOCH = Date.parse("2024-01-01T00:00:00Z");
const baseline = engine.positionAt({ body: "Moon", time: new Date(EPOCH) });
if (baseline.status !== "ok") throw new Error("test adapter baseline refused");
let epoch = EPOCH;
let trajectory: (body: engine.SolarSystemBody, elapsedMs: number) => number;
let times: number[];

function request(from = 0, to = HOUR): ConjunctionRequest {
  return { first: "Moon", second: "Mars", coordinate: "right-ascension",
    window: { from: new Date(epoch + from), to: new Date(epoch + to) } };
}
function complete(result: ConjunctionResult) {
  expect(result.status).toBe("complete");
  if (result.status !== "complete") throw new Error(result.reason);
  return result;
}
function offsets(result: ConjunctionResult): number[] {
  return complete(result).events.map((event) => Date.parse(event.at) - epoch);
}

beforeEach(() => {
  epoch = EPOCH;
  times = [];
  trajectory = (body, ms) => body === "Moon" ? 359.75 + ms / HOUR : 0.25;
  vi.spyOn(engine, "positionAt").mockImplementation((input) => {
    const ms = new Date(input.time).getTime();
    times.push(ms);
    return { ...baseline, body: input.body,
      lon: ((trajectory(input.body, ms - epoch) % 360) + 360) % 360,
      lat: input.body === "Moon" ? 3 : -2,
      receipt: { ...baseline.receipt, request: { ...baseline.receipt.request,
        body: input.body, time: new Date(ms).toISOString(), frame: input.frame! } } };
  });
});
afterEach(() => vi.restoreAllMocks());

describe("analytic conjunction trajectories, not sky accuracy", () => {
  it.each(["right-ascension", "ecliptic-longitude"] as const)("wraps both coordinates in %s without losing the crossing", (coordinate) => {
    const result = complete(searchConjunctions({ ...request(), coordinate }));
    expect(offsets(result)).toEqual([HOUR / 2]);
    expect(result.events[0]!.relativeRetrograde).toBe(false);
    expect(result.events[0]!.crossCoordinateDifferenceDegrees).toBe(5);
    // Equal longitude with latitudes +3 and -2 is a five-degree separation,
    // which establishes why a coordinate conjunction is not disk overlap.
    expect(result.events[0]!.separationDegrees).toBeCloseTo(5, 12);
    expect(result.receipt.search.samples * 2).toBe(times.length);
    expect(times.every((at) => at >= epoch && at <= epoch + HOUR)).toBe(true);
  });

  it("never mistakes passage across the antipode for a conjunction", () => {
    trajectory = (body, ms) => body === "Moon" ? 179 + 2 * ms / HOUR : 0;
    expect(offsets(searchConjunctions(request()))).toEqual([]);
  });

  it("reports decreasing relative motion even when both bodies move forward", () => {
    trajectory = (body, ms) => body === "Moon" ? 30 + ms / HOUR : 29.5 + 2 * ms / HOUR;
    const result = complete(searchConjunctions(request()));
    expect(offsets(result)).toEqual([HOUR / 2]);
    expect(result.events[0]!.relativeRetrograde).toBe(true);
  });

  it("owns a root at to once and leaves a root at from out", () => {
    expect(offsets(searchConjunctions(request(0, HOUR / 2)))).toEqual([HOUR / 2]);
    expect(offsets(searchConjunctions(request(HOUR / 2, HOUR)))).toEqual([]);
    trajectory = (body, ms) => body === "Moon" ? 0.25 + ms / HOUR : 0.25;
    expect(offsets(searchConjunctions(request()))).toEqual([]);
  });

  it.each([EPOCH, Date.parse("1960-01-01T00:00:00Z")])("assigns fractional roots consistently on the Date lattice at epoch %s", (origin) => {
    epoch = origin;
    trajectory = (body, ms) => body === "Moon" ? 30 + (ms - 1_234_567.25) / HOUR : 30;
    const full = searchConjunctions(request());
    expect(offsets(full)).toEqual([1_234_568]);
    expect(offsets(searchConjunctions(request(0, 1_234_568)))).toEqual([1_234_568]);
    expect(offsets(searchConjunctions(request(1_234_568, HOUR)))).toEqual([]);
  });

  it("finds both passes hidden within one coarse cell by a relative station", () => {
    trajectory = (body, ms) => body === "Moon" ? 30 + ((ms - HOUR / 2) / HOUR) ** 2 - 0.01 : 30;
    const result = complete(searchConjunctions(request()));
    expect(result.events).toHaveLength(2);
    const found = offsets(result);
    expect(Math.abs(found[0]! - 0.4 * HOUR)).toBeLessThanOrEqual(1);
    expect(Math.abs(found[1]! - 0.6 * HOUR)).toBeLessThanOrEqual(1);
    expect(result.events.map((event) => event.relativeRetrograde)).toEqual([true, false]);
  });

  it("retains an exactly sampled touch with the inherited preceding-side convention", () => {
    trajectory = (body, ms) => body === "Moon" ? 30 + 100 * ((ms - HOUR / 2) / HOUR) ** 2 : 30;
    const result = complete(searchConjunctions({ ...request(), stepDays: 1 / 48 }));
    expect(offsets(result)).toEqual([HOUR / 2]);
    // At an exactly sampled zero the inherited solver uses the preceding side.
    expect(result.events[0]!.coordinateDifferenceDegrees).toBe(0);
  });

  it("refuses a discontinuity before evaluating any position", () => {
    epoch = Date.parse("2017-01-01T00:00:00Z") - HOUR / 2;
    const result = searchConjunctions(request());
    expect(result).toMatchObject({ status: "refused", reason: "time-discontinuity", events: [],
      receipt: { search: { samples: 0 }, seams: [{ at: "2017-01-01T00:00:00.000Z", kind: "leap-second" }] } });
    expect(times).toEqual([]);
  });

  it("never exceeds its paired-sample budget during refinement or output verification", () => {
    const successful = complete(searchConjunctions(request()));
    const needed = successful.receipt.search.samples;
    for (const maxSamples of [1, 2, 10, needed - 1, needed]) {
      times = [];
      const result = searchConjunctions({ ...request(), maxSamples });
      expect(result.receipt.search.samples).toBeLessThanOrEqual(maxSamples);
      expect(times.length).toBe(result.receipt.search.samples * 2);
      if (maxSamples < needed) expect(result).toMatchObject({ status: "refused", reason: "sample-budget", events: [] });
      else expect(offsets(result)).toEqual([HOUR / 2]);
    }
  });

  it("retains the adapter refusal and discards any already discovered events", () => {
    const successful = vi.mocked(engine.positionAt).getMockImplementation()!;
    vi.mocked(engine.positionAt).mockImplementation((input) => {
      const at = new Date(input.time).getTime();
      if (at === epoch + HOUR && input.body === "Mars") return { status: "refused", reason: "out-of-range",
        detail: "synthetic refusal", span: { from: "", to: "" }, receipt: baseline.receipt };
      return successful(input);
    });
    const result = searchConjunctions({ ...request(), stepDays: 1 / 96 });
    expect(result).toMatchObject({ status: "refused", reason: "position-refused", events: [],
      failure: { at: new Date(epoch + HOUR).toISOString(), position: baseline.receipt, positionReason: "out-of-range" } });
  });

  it("refuses an undefined coordinate without leaking a solver exception", () => {
    trajectory = () => Number.NaN;
    expect(searchConjunctions(request())).toMatchObject({ status: "refused", reason: "undefined-coordinate", events: [] });
  });

  it("uses the receipted whole-millisecond coarse step for a fractional request", () => {
    trajectory = (body, ms) => body === "Moon" ? 30 + (ms - 5.5) / 1000 : 30;
    const result = complete(searchConjunctions({ ...request(0, 10), stepDays: 1.5 / 86_400_000 }));
    expect(offsets(result)).toEqual([6]);
    expect(result.receipt.search.stepMilliseconds).toBe(1);
    expect(times.every((at) => Number.isInteger(at) && at >= epoch && at <= epoch + 10)).toBe(true);
  });
});
