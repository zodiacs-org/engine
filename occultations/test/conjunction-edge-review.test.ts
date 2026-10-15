import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as engine from "../src/engine.js";
import { searchConjunctions } from "../src/conjunctions.js";
import type { ConjunctionRequest, ConjunctionResult } from "../src/conjunctions.js";

// Analytic input trajectories and edge-contract checks only. These mocks do
// not provide physical ephemeris or conjunction-time accuracy evidence.
const MODERN = Date.parse("2024-01-01T00:00:00Z");
const HISTORICAL = Date.parse("1960-01-01T00:00:00Z");
const baseline = engine.positionAt({ body: "Moon", time: new Date(MODERN) });
if (baseline.status !== "ok") throw new Error("test adapter baseline refused");
let origin = MODERN;
let longitude: (body: engine.SolarSystemBody, elapsed: number) => number;
let evaluated: number[];

function request(from: number, to: number): ConjunctionRequest {
  return { first: "Moon", second: "Mars", coordinate: "right-ascension",
    window: { from: new Date(origin + from), to: new Date(origin + to) } };
}

function offsets(result: ConjunctionResult): readonly number[] {
  expect(result.status).toBe("complete");
  if (result.status !== "complete") throw new Error(`Unexpected refusal: ${result.reason}`);
  return result.events.map((event) => Date.parse(event.at) - origin);
}

beforeEach(() => {
  origin = MODERN;
  evaluated = [];
  longitude = () => 30;
  vi.spyOn(engine, "positionAt").mockImplementation((input) => {
    const ms = new Date(input.time).getTime();
    evaluated.push(ms);
    return { ...baseline, body: input.body, lon: longitude(input.body, ms - origin), lat: 0,
      receipt: { ...baseline.receipt, request: { ...baseline.receipt.request,
        body: input.body, time: new Date(ms).toISOString(), frame: input.frame! } } };
  });
});
afterEach(() => vi.restoreAllMocks());

describe("conjunction Date-lattice edge review", () => {
  it.each([MODERN, HISTORICAL])("owns submillisecond roots on the integer lattice at epoch %s", (epoch) => {
    origin = epoch;
    for (const root of [0.25, 0.75, 1, 1.25, 8.75, 9, 9.75]) {
      for (const slope of [-0.001, 0.001]) {
        longitude = (body, ms) => body === "Moon" ? 30 + slope * (ms - root) : 30;
        const at = Math.ceil(root);
        expect(offsets(searchConjunctions(request(0, 10)))).toEqual([at]);
        expect(offsets(searchConjunctions(request(at - 1, at)))).toEqual([at]);
        expect(offsets(searchConjunctions(request(at, 11)))).toEqual([]);
        if (at > 1) expect(offsets(searchConjunctions(request(0, at - 1)))).toEqual([]);
      }
    }
  });

  it.each([MODERN, HISTORICAL])("does not invent events immediately outside a small window at epoch %s", (epoch) => {
    origin = epoch;
    for (const root of [-0.25, 0, 10.25]) {
      longitude = (body, ms) => body === "Moon" ? 30 + 0.001 * (ms - root) : 30;
      expect(offsets(searchConjunctions(request(0, 10)))).toEqual([]);
    }
  });

  it.each([-1, 1])("owns an exact boundary touch from either side (sign %s)", (sign) => {
    longitude = (body, ms) => body === "Moon" ? 30 + sign * 0.001 * (ms - 10) ** 2 : 30;
    expect(offsets(searchConjunctions(request(0, 10)))).toEqual([10]);
    expect(offsets(searchConjunctions(request(10, 20)))).toEqual([]);
  });

  it("does not report departure from a numerical zero plateau that began before from", () => {
    longitude = (body, ms) => body === "Moon" ? 30 + Math.max(0, ms - 10) * 0.001 : 30;
    expect(offsets(searchConjunctions(request(5, 20)))).toEqual([]);
  });

  it("refuses an unconfirmed zero caused by the shared solver's circular rounding", () => {
    // These finite directions never coincide. The shared solver's modulo
    // arithmetic rounds the tiny positive midpoint offset to an exact zero;
    // the wrapper must not promote that candidate into a conjunction.
    longitude = (body, ms) => body === "Moon" ? 1e-14 + 1e-8 * (ms - 10) ** 2 : 0;
    const result = searchConjunctions({ ...request(0, 20), stepDays: 10 / 86_400_000 });
    expect(result).toMatchObject({ status: "refused", reason: "unresolved-root", events: [] });
    expect(evaluated.every((ms) => ms >= origin && ms <= origin + 20)).toBe(true);
    expect(result.receipt.search.samples * 2).toBe(evaluated.length);
  });

  it("does not sample outside a clipped one-millisecond search during normalization", () => {
    longitude = (body, ms) => body === "Moon" ? 30 + 0.001 * (ms - 0.25) : 30;
    const result = searchConjunctions(request(0, 1));
    expect(offsets(result)).toEqual([1]);
    expect(new Set(evaluated)).toEqual(new Set([origin, origin + 1]));
    expect(result.receipt.search.samples * 2).toBe(evaluated.length);
  });
});
