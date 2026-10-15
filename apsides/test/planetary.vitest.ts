import { readFileSync } from "node:fs";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { calc } from "@zodiacs/engine/calc";
import type { CalcRefusal, CalcTime } from "@zodiacs/engine/calc";
import {
  AU_KM, DISTANCE_TARGETS, PLANETARY_BODIES, PLANETARY_SEARCH_POLICIES,
  searchPlanetaryApsides
} from "../src/index.js";
import type {
  PlanetaryBody, PlanetarySearchOptions, PlanetarySearchResult
} from "../src/index.js";
import * as sampling from "../src/sample.js";

const DAY_SECONDS = 86_400;
const tt = (jd: number): CalcTime => ({ jd, scale: "tt" });
type Complete = Extract<PlanetarySearchResult, { status: "complete" }>;
interface DevelopmentWindow {
  readonly fromJdTt: number;
  readonly toJdTt: number;
  readonly options: PlanetarySearchOptions;
}
const plan = JSON.parse(readFileSync(new URL("../references/plan.json", import.meta.url), "utf8")) as {
  cases: { id: string; split: string; body: string; fromTt: string; toTt: string }[];
};
const windows = new Map<PlanetaryBody, DevelopmentWindow>();
for (const body of PLANETARY_BODIES) {
  const selected = plan.cases.filter((item) => item.split === "development" && item.body === body);
  if (selected.length !== 1) throw new Error(`Expected one development window for ${body}`);
  const entry = selected[0]!;
  // These calendar strings name TT. Date arithmetic only converts their
  // Gregorian calendar labels to JDs; no UTC-to-TT correction is applied.
  const fromJdTt = Date.parse(`${entry.fromTt}T00:00:00Z`) / 86_400_000 + 2_440_587.5;
  const toJdTt = Date.parse(`${entry.toTt}T00:00:00Z`) / 86_400_000 + 2_440_587.5;
  windows.set(body, { fromJdTt, toJdTt, options: { from: tt(fromJdTt), to: tt(toJdTt) } });
}
const baseline = new Map<PlanetaryBody, Complete>();
function complete(body: PlanetaryBody, options = windows.get(body)!.options): Complete {
  const result = searchPlanetaryApsides(body, options);
  if (result.status !== "complete") throw new Error(`${body}: ${result.reason}: ${result.detail}`);
  return result;
}
const mercuryWindow = windows.get("Mercury")!;
const mercuryOptions = mercuryWindow.options;
const originalSampleDistance = sampling.sampleDistance;

beforeAll(() => {
  for (const body of PLANETARY_BODIES) baseline.set(body, complete(body));
}, 30_000);
afterEach(() => vi.restoreAllMocks());

// These tests check integration, deterministic event ownership and accounting.
// The baseline is not astronomical accuracy evidence. All actual event searches
// use registered development windows or their subwindows, never held-out cases.
describe("planetary policies and event records", () => {
  it("freezes each body's explicit grid and work policy, including Earth", () => {
    const days: Record<PlanetaryBody, number> = {
      Mercury: 0.5, Venus: 1, Earth: 0.5, Mars: 2, Jupiter: 8,
      Saturn: 16, Uranus: 16, Neptune: 32, Pluto: 32
    };
    expect(Object.keys(PLANETARY_SEARCH_POLICIES)).toEqual([...PLANETARY_BODIES]);
    expect(Object.isFrozen(PLANETARY_SEARCH_POLICIES)).toBe(true);
    for (const body of PLANETARY_BODIES) {
      const policy = PLANETARY_SEARCH_POLICIES[body];
      expect(policy).toMatchObject({
        originJdTt: 2_451_545, stepSeconds: days[body] * DAY_SECONDS,
        paddingSteps: 2, toleranceSeconds: 1, defaultMaxEvaluations: 100_000,
        method: body === "Pluto" ? "golden-section-distance" : "bisected-analytic-rate"
      });
      expect(Object.isFrozen(policy)).toBe(true);
    }
  });

  it.each(PLANETARY_BODIES)("preserves %s geometry, units, receipts and numerical intervals", (body) => {
    const result = baseline.get(body)!;
    expect(result.events.length).toBeGreaterThan(0);
    expect(result.diagnostics).toMatchObject({
      policy: PLANETARY_SEARCH_POLICIES[body], completeness: "sampled-not-proven"
    });
    expect(result.window.boundary).toBe("(from,to]");
    expect(result.window.endpointReceipts.from.request.body).toBe(body);
    expect(result.window.endpointReceipts.to.request.body).toBe(body);
    for (const [index, event] of result.events.entries()) {
      expect(event.body).toBe(body);
      expect(["perihelion", "aphelion"]).toContain(event.kind);
      expect(event.target).toEqual(DISTANCE_TARGETS[body]);
      expect(event.target.center).toBe("heliocentric");
      expect(event.target.referencePoint).toBe(
        ["Mercury", "Venus", "Earth"].includes(body) ? "body-center" : "system-barycenter"
      );
      expect(event.receipt.request).toMatchObject({
        body, center: "heliocentric", frame: "equatorial-j2000",
        time: { jd: event.instant.jdTt, scale: "tt" },
        flags: { correction: "geometric", cartesian: true, speeds: true }
      });
      expect(event.instant).toEqual(event.receipt.instants[0]);
      expect(event.instant.jdTt).toBeGreaterThan(result.window.from.jdTt);
      expect(event.instant.jdTt).toBeLessThanOrEqual(result.window.to.jdTt);
      if (index > 0) expect(event.instant.jdTt).toBeGreaterThan(result.events[index - 1]!.instant.jdTt);
      const { lower, upper, bracket } = event.refinement;
      expect(event.refinement.method).toBe(PLANETARY_SEARCH_POLICIES[body].method);
      expect(lower.jdTt).toBeLessThanOrEqual(event.instant.jdTt);
      expect(upper.jdTt).toBeGreaterThanOrEqual(event.instant.jdTt);
      expect(upper.jdTt).toBeGreaterThan(lower.jdTt);
      expect((upper.jdTt - lower.jdTt) * DAY_SECONDS).toBeLessThanOrEqual(1);
      expect(bracket[0].jdTt).toBeLessThan(event.instant.jdTt);
      expect(bracket[2].jdTt).toBeGreaterThan(event.instant.jdTt);
      // Wider scalar witnesses identify the distance turn. Tiny rate-root
      // brackets need not have distinguishable endpoint distances.
      const sign = event.kind === "perihelion" ? 1 : -1;
      expect(sign * (bracket[0].distanceKm - event.distanceKm)).toBeGreaterThan(0);
      expect(sign * (bracket[2].distanceKm - event.distanceKm)).toBeGreaterThan(0);
      if (body === "Pluto") {
        expect(event.refinement.rateBracket).toBeUndefined();
        expect(sign * (lower.distanceKm - event.distanceKm)).toBeGreaterThan(0);
        expect(sign * (upper.distanceKm - event.distanceKm)).toBeGreaterThan(0);
      } else {
        expect(event.refinement.rateBracket).toBeDefined();
        expect(sign * event.refinement.rateBracket!.lowerKmPerSecond).toBeLessThan(0);
        expect(sign * event.refinement.rateBracket!.upperKmPerSecond).toBeGreaterThan(0);
      }
      const replay = calc(event.receipt.request);
      expect(replay.status).toBe("ok");
      if (replay.status !== "ok") throw new Error("Receipt replay refused");
      expect(event.distanceAu).toBe(replay.dist);
      expect(event.distanceKm).toBe(replay.dist! * AU_KM);
      expect(event.radialSpeedKmPerSecond).toBe(replay.speeds!.dist! * AU_KM / DAY_SECONDS);
      expect(event.orbitalSpeedKmPerSecond).toBe(
        Math.hypot(replay.cartesian!.vx!, replay.cartesian!.vy!, replay.cartesian!.vz!) * AU_KM / DAY_SECONDS
      );
      expect(event.receipt).toEqual(replay.receipt);
    }
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });
});

describe("planetary window ownership", () => {
  it.each(PLANETARY_BODIES)("keeps canonical %s event records across window partitions", (body) => {
    const whole = baseline.get(body)!;
    const limits = windows.get(body)!;
    const { originJdTt, stepSeconds } = PLANETARY_SEARCH_POLICIES[body];
    const stepDays = stepSeconds / DAY_SECONDS;
    for (const event of whole.events) {
      const jd = event.instant.jdTt;
      const from = Math.max(limits.fromJdTt, jd - 4 * stepDays);
      const to = Math.min(limits.toJdTt, jd + 4 * stepDays);
      const subwindow = complete(body, { from: tt(from), to: tt(to) });
      const expected = whole.events.filter(({ instant }) => instant.jdTt > from && instant.jdTt <= to);
      expect(subwindow.events).toEqual(expected);
      const gridNode = originJdTt + Math.floor((jd - originJdTt) / stepDays) * stepDays;
      const cuts = [jd, jd - 1 / DAY_SECONDS, jd + 1 / DAY_SECONDS,
        jd - 2 ** -31, jd + 2 ** -31, gridNode].filter((cut) => cut > from && cut < to);
      for (const cut of cuts) {
        const left = complete(body, { from: tt(from), to: tt(cut) });
        const right = complete(body, { from: tt(cut), to: tt(to) });
        expect([...left.events, ...right.events]).toEqual(subwindow.events);
        expect(left.events.every(({ instant }) => instant.jdTt <= cut)).toBe(true);
        expect(right.events.every(({ instant }) => instant.jdTt > cut)).toBe(true);
      }
      expect(complete(body, { from: tt(jd - 1 / DAY_SECONDS), to: tt(jd) }).events).toEqual([event]);
      expect(complete(body, { from: tt(jd), to: tt(jd + 1 / DAY_SECONDS) }).events).toEqual([]);
    }
  });

  it.each(PLANETARY_BODIES)("returns an empty %s interval without constructing a padded grid", (body) => {
    const from = windows.get(body)!.options.from;
    const empty = complete(body, { from, to: from });
    expect(empty.events).toEqual([]);
    expect(empty.diagnostics).toMatchObject({ evaluations: 2, grid: null });
  });

  it("keeps endpoint time pins separate from internal TT samples", () => {
    const options = {
      from: { iso: "2000-01-02", deltaT: 100 },
      to: { iso: "2000-03-31", deltaT: 200 }
    };
    const result = complete("Mercury", options);
    expect(result.window.from.deltaT.model).toBe("pinned");
    expect(result.window.to.deltaT.model).toBe("pinned");
    for (const event of result.events) {
      expect(event.instant.timeScale.input).toBe("tt");
      expect(event.instant.deltaT.model).not.toBe("pinned");
    }
    expect(complete("Mercury", {
      from: tt(result.window.from.jdTt), to: tt(result.window.to.jdTt)
    }).events).toEqual(result.events);
  });
});

describe("planetary work accounting and refusals", () => {
  it.each(PLANETARY_BODIES)("honors the exact %s budget and refuses one call short", (body) => {
    const expected = baseline.get(body)!;
    const options = windows.get(body)!.options;
    const cap = expected.diagnostics.evaluations;
    const spy = vi.spyOn(sampling, "sampleDistance");
    const exact = complete(body, { ...options, maxEvaluations: cap });
    expect(exact.events).toEqual(expected.events);
    expect(exact.diagnostics.evaluations).toBe(cap);
    expect(spy).toHaveBeenCalledTimes(cap);
    expect(spy.mock.calls.every(([sampledBody]) => sampledBody === body)).toBe(true);
    const internal = spy.mock.calls.slice(2).map(([, time]) => {
      expect(time).toMatchObject({ scale: "tt" });
      return (time as { jd: number }).jd;
    });
    expect(new Set(internal).size).toBe(internal.length);
    spy.mockClear();
    const short = searchPlanetaryApsides(body, { ...options, maxEvaluations: cap - 1 });
    expect(short).toMatchObject({
      status: "refused", reason: "evaluation-budget", events: [], engineRefusal: null
    });
    expect(short.diagnostics.evaluations).toBe(cap - 1);
    expect(spy).toHaveBeenCalledTimes(cap - 1);
  });

  it.each([1, 2, 20])("refuses an unaffordable grid under budget %s", (maxEvaluations) => {
    const spy = vi.spyOn(sampling, "sampleDistance");
    const result = searchPlanetaryApsides("Mercury", { ...mercuryOptions, maxEvaluations });
    expect(result).toMatchObject({ status: "refused", reason: "evaluation-budget", events: [] });
    expect(result.diagnostics.evaluations).toBe(Math.min(2, maxEvaluations));
    expect(spy).toHaveBeenCalledTimes(result.diagnostics.evaluations);
  });

  it("preserves unavailable padded-edge coverage and does not return partial events", () => {
    const refusal: CalcRefusal = {
      status: "refused", reason: "sample-budget", detail: "Synthetic unavailable padded sample",
      samples: 1, maxSamples: 1
    };
    const spy = vi.spyOn(sampling, "sampleDistance").mockImplementation((body, time) => {
      const jd = (time as { jd: number }).jd;
      if (jd < mercuryWindow.fromJdTt || jd > mercuryWindow.toJdTt) return refusal;
      return originalSampleDistance(body, time);
    });
    const result = searchPlanetaryApsides("Mercury", mercuryOptions);
    expect(result).toMatchObject({ status: "refused", reason: "edge-coverage", events: [] });
    if (result.status !== "refused") throw new Error("Padded edge refusal was lost");
    expect(result.engineRefusal).toBe(refusal);
    expect(result.window).not.toBeNull();
    expect(result.diagnostics.evaluations).toBe(spy.mock.calls.length);
    expect(spy).toHaveBeenCalledTimes(3);
  });

  it("retains the engine's out-of-range endpoint refusal before any grid evaluation", () => {
    const result = searchPlanetaryApsides("Earth", { from: "1799-01-01", to: "1801-01-01" });
    expect(result).toMatchObject({
      status: "refused", reason: "engine-refusal", events: [], window: null,
      engineRefusal: { status: "refused", reason: "out-of-range" }
    });
    expect(result.diagnostics.evaluations).toBe(1);
  });

  it("propagates unexpected sampler exceptions", () => {
    const failure = new Error("Synthetic unexpected planetary sample failure");
    vi.spyOn(sampling, "sampleDistance").mockImplementation(() => { throw failure; });
    expect(() => searchPlanetaryApsides("Mercury", mercuryOptions)).toThrow(failure);
  });
});

describe("planetary input validation", () => {
  it.each(["Moon", "Sun", "EMB", "mercury", "toString", null, undefined, {}, 3])(
    "rejects unsupported body %j before sampling", (body) => {
      const spy = vi.spyOn(sampling, "sampleDistance");
      expect(() => searchPlanetaryApsides(body as PlanetaryBody, mercuryOptions)).toThrow(RangeError);
      expect(spy).not.toHaveBeenCalled();
    }
  );

  it.each([0, -1, 1.5, NaN, Infinity, null, undefined, Number.MAX_SAFE_INTEGER + 1])(
    "rejects an explicitly invalid budget %s before sampling", (maxEvaluations) => {
      const spy = vi.spyOn(sampling, "sampleDistance");
      expect(() => searchPlanetaryApsides("Mercury", {
        ...mercuryOptions, maxEvaluations
      } as PlanetarySearchOptions)).toThrow(RangeError);
      expect(spy).not.toHaveBeenCalled();
    }
  );

  it.each([null, [], {}, { from: mercuryOptions.from }, { ...mercuryOptions, stepDays: 10 }])(
    "rejects malformed options %j before sampling", (options) => {
      const spy = vi.spyOn(sampling, "sampleDistance");
      expect(() => searchPlanetaryApsides("Mercury", options as PlanetarySearchOptions)).toThrow(RangeError);
      expect(spy).not.toHaveBeenCalled();
    }
  );

  it("rejects accessor options without invoking their getters", () => {
    const getter = vi.fn(() => mercuryOptions.from);
    const options = Object.defineProperty({ to: mercuryOptions.to }, "from", { get: getter, enumerable: true });
    const spy = vi.spyOn(sampling, "sampleDistance");
    expect(() => searchPlanetaryApsides("Mercury", options as PlanetarySearchOptions)).toThrow(RangeError);
    expect(getter).not.toHaveBeenCalled();
    expect(spy).not.toHaveBeenCalled();
  });

  it.each(["2000-02-30", "2000-01-01T12:00:00", new Date(NaN), { jd: Infinity, scale: "tt" }])(
    "uses engine malformed-time validation for %j", (from) => {
      expect(() => searchPlanetaryApsides("Mercury", {
        from: from as CalcTime, to: mercuryOptions.to
      })).toThrow(RangeError);
    }
  );

  it("rejects reversed endpoints by their resolved TT values", () => {
    expect(() => searchPlanetaryApsides("Mercury", {
      from: mercuryOptions.to, to: mercuryOptions.from
    })).toThrow(RangeError);
    expect(() => searchPlanetaryApsides("Mercury", {
      from: "2000-01-01T12:00:00Z", to: tt(2_451_545)
    })).toThrow(RangeError);
  });
});
