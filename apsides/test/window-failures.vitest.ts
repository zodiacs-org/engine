import { afterEach, describe, expect, it, vi } from "vitest";
import { CALC_SPAN } from "@zodiacs/engine/calc";
import type { CalcRefusal, CalcTime } from "@zodiacs/engine/calc";
import { searchApsidesWindow } from "../src/index.js";
import type { ApsidesWindowOptions } from "../src/index.js";
import * as lunar from "../src/lunar.js";
import * as planetary from "../src/planetary.js";
import * as sampling from "../src/sample.js";

const tt = (jd: number): CalcTime => ({ jd, scale: "tt" });
const month = { from: tt(2_451_544.5), to: tt(2_451_575.5) };
const originalSample = sampling.sampleDistance;

afterEach(() => vi.restoreAllMocks());

describe("combined window input validation", () => {
  it.each([null, undefined, [], {}, { from: month.from }, { ...month, stepDays: 1 }])(
    "rejects malformed options before sampling: %j", (options) => {
      const spy = vi.spyOn(sampling, "sampleDistance");
      expect(() => searchApsidesWindow(options as ApsidesWindowOptions)).toThrow(RangeError);
      expect(spy).not.toHaveBeenCalled();
    }
  );

  it.each([0, -1, 1.5, NaN, Infinity, null, undefined, Number.MAX_SAFE_INTEGER + 1])(
    "rejects explicit invalid global budget %s", (maxEvaluations) => {
      const spy = vi.spyOn(sampling, "sampleDistance");
      expect(() => searchApsidesWindow({ ...month, maxEvaluations } as ApsidesWindowOptions)).toThrow(RangeError);
      expect(spy).not.toHaveBeenCalled();
    }
  );

  it.each([
    [], ["Moon", "Moon"], ["Moon", "Sun"], ["moon"], ["toString"], ["EMB"],
    [null], [undefined], [3], "Moon", new Set(["Moon"]), null, undefined,
    Array(1), Array(11).fill("Moon")
  ])("rejects malformed body selections before sampling: %j", (bodies) => {
    const spy = vi.spyOn(sampling, "sampleDistance");
    expect(() => searchApsidesWindow({ ...month, bodies } as ApsidesWindowOptions)).toThrow(RangeError);
    expect(spy).not.toHaveBeenCalled();
  });

  it("rejects getters and unexpected own option properties without executing getters", () => {
    const getter = vi.fn(() => ["Moon"]);
    const accessor = Object.defineProperty({ ...month }, "bodies", { get: getter, enumerable: true });
    const hidden = Object.defineProperty({ ...month }, "maxEvaluations", { value: 100 });
    const symbol = { ...month, [Symbol("unknown")]: true };
    const inherited = Object.create(month) as ApsidesWindowOptions;
    const spy = vi.spyOn(sampling, "sampleDistance");
    for (const options of [accessor, hidden, symbol, inherited]) {
      expect(() => searchApsidesWindow(options)).toThrow(RangeError);
    }
    expect(getter).not.toHaveBeenCalled();
    expect(spy).not.toHaveBeenCalled();
  });

  it("rejects array accessor, hidden, extra, and inherited slots without executing them", () => {
    const getter = vi.fn(() => "Moon");
    const accessor = Object.defineProperty(["Moon"], "0", { get: getter });
    const hidden = Object.defineProperty(["Moon"], "0", { value: "Moon", enumerable: false });
    const extra = Object.assign(["Moon"], { extra: "Earth" });
    const symbol = Object.assign(["Moon"], { [Symbol("extra")]: "Earth" });
    const inherited = Array(1) as string[];
    Object.setPrototypeOf(inherited, { 0: "Moon" });
    const spy = vi.spyOn(sampling, "sampleDistance");
    for (const bodies of [accessor, hidden, extra, symbol, inherited]) {
      expect(() => searchApsidesWindow({ ...month, bodies } as ApsidesWindowOptions)).toThrow(RangeError);
    }
    expect(getter).not.toHaveBeenCalled();
    expect(spy).not.toHaveBeenCalled();
  });

  it.each(["2000-02-30", "2000-01-01T12:00:00", new Date(NaN), { jd: Infinity, scale: "tt" }])(
    "delegates either malformed endpoint to engine validation: %j", (time) => {
      expect(() => searchApsidesWindow({ from: time as CalcTime, to: month.to, bodies: ["Moon"] })).toThrow(RangeError);
      expect(() => searchApsidesWindow({ from: month.from, to: time as CalcTime, bodies: ["Moon"] })).toThrow(RangeError);
    }
  );

  it("rejects reversed endpoints on resolved TT, including mixed scales", () => {
    expect(() => searchApsidesWindow({ from: month.to, to: month.from })).toThrow(RangeError);
    expect(() => searchApsidesWindow({ from: "2000-01-01T12:00:00Z", to: tt(2_451_545) })).toThrow(RangeError);
  });
});

describe("combined coverage and incomplete work", () => {
  it("reuses captured endpoint requests when a nested time getter changes later", () => {
    let reads = 0;
    const to = {
      scale: "tt" as const,
      get jd() {
        reads += 1;
        // The engine reads this field for shape validation and then its value.
        // Any later body re-reading the caller object would get a longer window.
        return reads <= 2 ? 2_451_545.5 : 2_451_575.5;
      }
    };
    const result = searchApsidesWindow({ from: month.from, to, bodies: ["Moon", "Mercury"] });
    expect(result.status).toBe("complete");
    if (result.status !== "complete") throw new Error("Expected completed window");
    expect(result.window.to.jdTt).toBe(2_451_545.5);
    expect(reads).toBe(2);
    for (const entry of result.diagnostics.bodies) {
      expect(entry.window?.from).toEqual(result.window.from);
      expect(entry.window?.to).toEqual(result.window.to);
      expect(entry.window?.endpointReceipts.to.request.time).toEqual({ jd: 2_451_545.5, scale: "tt" });
    }
    expect(result.events.every(({ instant }) =>
      instant.jdTt > result.window.from.jdTt && instant.jdTt <= result.window.to.jdTt)).toBe(true);
  });

  it.each([
    { from: "1799-12-31", to: "1800-01-10" },
    { from: "2199-12-20", to: "2200-01-01" }
  ])("preserves endpoint reference-span refusals without clipping: %j", (input) => {
    const result = searchApsidesWindow({ ...input, bodies: ["Moon", "Mercury"] });
    expect(result).toMatchObject({
      status: "refused", failedBody: "Moon", reason: "engine-refusal", events: [], window: null,
      engineRefusal: { reason: "out-of-range", span: CALC_SPAN }
    });
    expect(result.diagnostics.bodies.map(({ status }) => status)).toEqual(["refused", "not-started"]);
    expect(result.diagnostics.bodies[1]).toMatchObject({ window: null, diagnostics: null });
    expect(result.diagnostics.completeness).toBe("sampled-not-proven");
  });

  it("does not mistake a TT coordinate inside the span for valid UT1 coverage", () => {
    const firstJd = Date.parse(CALC_SPAN.from) / 86_400_000 + 2_440_587.5;
    const input = { jd: firstJd + 0.5, scale: "tt", deltaT: 86_400 } as const;
    const result = searchApsidesWindow({ from: input, to: input, bodies: ["Earth"] });
    expect(result).toMatchObject({
      status: "refused", reason: "engine-refusal", failedBody: "Earth", events: [],
      engineRefusal: { reason: "out-of-range", span: CALC_SPAN }
    });
    expect(result.diagnostics.evaluations).toBe(1);
  });

  it.each([
    { from: "1800-01-10", to: "1800-01-11" },
    { from: "2199-12-20", to: "2199-12-21" }
  ])("refuses larger planetary padding after completing lunar work: %j", (input) => {
    const spy = vi.spyOn(sampling, "sampleDistance");
    const result = searchApsidesWindow({ ...input, bodies: ["Pluto", "Moon"] });
    expect(result).toMatchObject({
      status: "refused", reason: "edge-coverage", failedBody: "Pluto", events: [],
      engineRefusal: { reason: "out-of-range", span: CALC_SPAN }
    });
    expect(result.window).not.toBeNull();
    expect(result.diagnostics.bodies.map(({ status }) => status)).toEqual(["complete", "refused"]);
    expect(result.diagnostics.bodies.every(({ window }) => window !== null)).toBe(true);
    expect(result.diagnostics.evaluations).toBe(spy.mock.calls.length);
  });

  it("discards earlier bodies' events and preserves a later body's original refusal", () => {
    const prior = lunar.searchLunarApsides(month);
    expect(prior.events.length).toBeGreaterThan(0);
    const refusal: CalcRefusal = {
      status: "refused", reason: "sample-budget", detail: "Synthetic dependency refusal",
      samples: 1, maxSamples: 1
    };
    const spy = vi.spyOn(sampling, "sampleDistance").mockImplementation((body, time) =>
      body === "Mercury" ? refusal : originalSample(body, time));
    const result = searchApsidesWindow({ ...month, bodies: ["Earth", "Mercury", "Moon"] });
    expect(result).toMatchObject({
      status: "refused", reason: "engine-refusal", failedBody: "Mercury", events: []
    });
    if (result.status !== "refused") throw new Error("Expected refusal");
    expect(result.engineRefusal).toBe(refusal);
    expect(result.window).not.toBeNull();
    expect(result.diagnostics.bodies.map(({ status }) => status)).toEqual(["complete", "refused", "not-started"]);
    const entry = result.diagnostics.bodies[1]!;
    if (entry.status !== "refused") throw new Error("Expected per-body refusal");
    expect(entry.engineRefusal).toBe(refusal);
    expect(result.diagnostics.bodies.every((body) => !("events" in body))).toBe(true);
    expect(result.diagnostics.evaluations).toBe(spy.mock.calls.length);
    expect(spy.mock.calls.some(([body]) => body === "Earth")).toBe(false);
  });

  it("preserves numerical solver refusal details and does not start later bodies", () => {
    const prior = lunar.searchLunarApsides(month);
    if (prior.status !== "complete") throw new Error("Expected development search to complete");
    vi.spyOn(lunar, "searchLunarApsides").mockReturnValue({
      status: "refused", reason: "non-unimodal", detail: "Synthetic contradictory turn",
      engineRefusal: null, events: [], window: prior.window, diagnostics: prior.diagnostics
    });
    const spy = vi.spyOn(planetary, "searchPlanetaryApsides");
    const result = searchApsidesWindow({ ...month, bodies: ["Moon", "Earth"] });
    expect(result).toMatchObject({
      status: "refused", failedBody: "Moon", reason: "non-unimodal",
      detail: "Synthetic contradictory turn", engineRefusal: null, events: []
    });
    expect(spy).not.toHaveBeenCalled();
  });

  it("propagates unexpected dependency exceptions", () => {
    const failure = new Error("Synthetic unexpected engine failure");
    vi.spyOn(sampling, "sampleDistance").mockImplementation(() => { throw failure; });
    expect(() => searchApsidesWindow(month)).toThrow(failure);
  });
});

describe("simultaneous events", () => {
  it("retains different bodies at equal TT and orders them canonically", () => {
    const moon = lunar.searchLunarApsides(month);
    const earth = planetary.searchPlanetaryApsides("Earth", month);
    if (moon.status !== "complete" || earth.status !== "complete" || !moon.events[0] || !earth.events[0]) {
      throw new Error("Expected development events");
    }
    const moonEvent = moon.events[0];
    // Fabricate only the tie for merger testing. These modified records are
    // synthetic inputs to the merger, not astronomical accuracy evidence.
    const earthEvent = { ...earth.events[0], instant: moonEvent.instant };
    vi.spyOn(lunar, "searchLunarApsides").mockReturnValue({ ...moon, events: [moonEvent] });
    vi.spyOn(planetary, "searchPlanetaryApsides").mockReturnValue({ ...earth, events: [earthEvent] });
    const result = searchApsidesWindow({ ...month, bodies: ["Earth", "Moon"] });
    expect(result.status).toBe("complete");
    expect(result.events).toEqual([moonEvent, earthEvent]);
    expect(result.events[0]).toBe(moonEvent);
    expect(result.events[1]).toBe(earthEvent);
  });
});
