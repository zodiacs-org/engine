import { afterEach, describe, expect, it, vi } from "vitest";
import { natalChart } from "@zodiacs/engine";
import type { BirthInput } from "@zodiacs/engine";
import * as calcEngine from "@zodiacs/engine/calc";
import { createNatalEnvelope } from "@zodiacs/engine/receipt";
import { AngularBudgetError, MAX_ANGLE_EVALUATIONS, containsPoint, meridianLines,
  planMeridianLines, wrapLongitude } from "../src/index.js";
import type { MeridianLineOptions, MeridianLinesResult } from "../src/index.js";

vi.mock("@zodiacs/engine/calc", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@zodiacs/engine/calc")>();
  return { ...actual, calc: vi.fn(actual.calc), houses: vi.fn(actual.houses) };
});
const actual = await vi.importActual<typeof calcEngine>("@zodiacs/engine/calc");

// Invented birth. Engine parity and residuals are regression evidence only.
const instant = "2004-05-06T07:08:09.010Z";
const birth: BirthInput = { utc: instant, latitude: 12, longitude: 34,
  houseSystem: "placidus", deltaT: 65 };
const options: MeridianLineOptions = { bounds: { south: -80, north: 80, west: -180, east: 180 },
  latitudeStep: 40, bodies: ["Sun", "Moon"], maxEvaluations: 23 };

function ok(result: MeridianLinesResult) {
  if (result.status !== "ok") throw new Error(result.reason);
  return result;
}

afterEach(() => vi.clearAllMocks());

describe("bounded MC and IC polylines", () => {
  it("computes positions once, samples every vertex with receipts and reports meridian residuals", () => {
    const result = ok(meridianLines(birth, options));
    expect(result.schema).toBe("zodiacs.relocation-meridians.v1");
    expect(result.referenceObserverIndex).toBe(0);
    expect(result.plan.requiredEvaluations).toBe(23);
    expect(result.sampling.evaluations).toEqual({ positions: 2, houses: 21 });
    expect(calcEngine.calc).toHaveBeenCalledTimes(2);
    expect(calcEngine.houses).toHaveBeenCalledTimes(21);
    expect(result.lines.map((line) => [line.body, line.kind])).toEqual([
      ["Sun", "MC"], ["Sun", "IC"], ["Moon", "MC"], ["Moon", "IC"]
    ]);
    const reference = result.sampling.samples[0]!;
    if (reference.status !== "ok") throw new Error(reference.reason);
    expect(reference.point).toEqual({ latitude: 0, longitude: 0 });
    for (const position of result.sampling.positions) {
      expect(position.engine).toEqual(actual.calc(position.engine.receipt.request));
    }
    for (const line of result.lines) {
      expect(line.status).toBe("sampled");
      expect(line.reason).toBeNull();
      expect(line.samples).toHaveLength(5);
      expect(line.polylines).toHaveLength(1);
      expect(line.polylines[0]!.map((vertex) => vertex.point.latitude)).toEqual([-80, -40, 0, 40, 80]);
      const position = result.sampling.positions[line.positionIndex]!;
      for (const [index, sample] of line.samples.entries()) {
        const observer = result.sampling.samples[sample.observerIndex]!;
        if (observer.status !== "ok") throw new Error(observer.reason);
        const vertex = line.polylines[0]![index]!;
        expect(vertex).toEqual({ point: observer.point, source: { kind: "sample", index: sample.observerIndex } });
        expect(observer.index).toBe(sample.observerIndex);
        expect(observer.engine).toEqual(actual.houses(observer.engine.receipt.request));
        expect(observer.engine.receipt.instants).toEqual(position.engine.receipt.instants);
        expect(sample.residual).toBe(observer.bodies[line.positionIndex]!.residuals[line.kind]);
        expect(sample.residual).toBeCloseTo(0, 10);
        expect(containsPoint(options.bounds, vertex.point)).toBe(true);
        // Separate Cartesian dot product against the observer's meridian-plane
        // normal, and radial projection to distinguish upper from lower branch.
        const ra = position.rightAscension! * Math.PI / 180;
        const dec = position.declination * Math.PI / 180;
        const theta = observer.engine.armc * Math.PI / 180;
        const x = Math.cos(dec) * Math.cos(ra);
        const y = Math.cos(dec) * Math.sin(ra);
        expect(-x * Math.sin(theta) + y * Math.cos(theta)).toBeCloseTo(0, 12);
        expect(Math.sign(x * Math.cos(theta) + y * Math.sin(theta))).toBe(line.kind === "MC" ? 1 : -1);
      }
      const pair = result.lines.find((other) => other.body === line.body && other.kind !== line.kind)!;
      expect(Math.abs(wrapLongitude(line.longitude! - pair.longitude!))).toBeCloseTo(180, 12);
    }
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it("clips meridians to inclusive wrapped bounds and skips outside observer work", () => {
    const seed = ok(meridianLines(birth, options));
    const longitude = seed.lines[0]!.longitude!;
    const localOptions = { ...options, bodies: ["Sun"] as const,
      bounds: { south: -10, north: 11, west: longitude, east: longitude }, latitudeStep: 10,
      maxEvaluations: 10 };
    vi.clearAllMocks();
    const result = ok(meridianLines(birth, localOptions));
    expect(result.lines[0]).toMatchObject({ status: "sampled", longitude });
    expect(result.lines[0]!.polylines[0]!.map((vertex) => vertex.point.latitude)).toEqual([-10, 0, 10, 11]);
    expect(result.lines[1]).toMatchObject({ status: "outside-bounds", samples: [], polylines: [] });
    expect(result.sampling.evaluations).toEqual({ positions: 1, houses: 5 });
    expect(calcEngine.houses).toHaveBeenCalledTimes(5);
    const none = ok(meridianLines(birth, { ...localOptions,
      bounds: { ...localOptions.bounds, west: wrapLongitude(longitude + 45), east: wrapLongitude(longitude + 50) } }));
    expect(none.lines.every((line) => line.status === "outside-bounds")).toBe(true);
    expect(none.sampling.samples).toHaveLength(1);
    expect(none.sampling.evaluations).toEqual({ positions: 1, houses: 1 });
    expect(none.sampling.positions).toHaveLength(1);
  });

  it("handles both seam aliases and wrapped bounds without interpolated vertices", () => {
    const realPosition = actual.calc({ body: "Sun", time: instant, frame: "equatorial-true-of-date" });
    const realObserver = actual.houses({ time: instant, place: { latitude: 0, longitude: 0 } });
    if (realPosition.status !== "ok" || realObserver.status !== "ok") throw new Error("Expected engine results");
    // Artificial directions and reference ARMC exercise exact-seam geometry.
    // Modified results here are branch injection, not authentic engine receipts.
    for (const [west, east] of [[170, -170], [180, -180], [-180, -180], [180, 180]] as const) {
      vi.mocked(calcEngine.calc).mockReturnValueOnce({ ...realPosition, lon: 180, lat: 0 });
      vi.mocked(calcEngine.houses).mockReturnValueOnce({ ...realObserver, armc: 0 });
      const result = ok(meridianLines(birth, { ...options, bodies: ["Sun"],
        bounds: { south: -1, north: 1, west, east }, latitudeStep: 1, maxEvaluations: 8 }));
      expect(result.lines[0]).toMatchObject({ longitude: -180, status: "sampled" });
      expect(result.lines[1]!.status).toBe("outside-bounds");
      expect(result.lines[0]!.polylines[0]).toHaveLength(3);
      for (const vertex of result.lines[0]!.polylines[0]!) {
        expect(vertex.source.kind).toBe("sample");
        expect(vertex.point.longitude).toBe(-180);
        expect(containsPoint(result.plan.bounds, vertex.point)).toBe(true);
      }
    }
  });

  it("retains exact poles as undefined metadata and engine polar fallback at nearby vertices", () => {
    const result = ok(meridianLines({ ...birth, latitude: 89, houseSystem: "koch" }, {
      ...options, bodies: ["Sun"], bounds: { south: -90, north: 90, west: -180, east: 180 },
      latitudeStep: 30, maxEvaluations: 12
    }));
    expect(result.sampling.natal.receipt.houses.actual).toBe("whole");
    expect(result.sampling.evaluations).toEqual({ positions: 1, houses: 11 });
    for (const line of result.lines) {
      expect(line.samples[0]).toMatchObject({ status: "undefined", reason: "geographic-pole", residual: null });
      expect(line.samples.at(-1)).toMatchObject({ status: "undefined", reason: "geographic-pole", residual: null });
      expect(line.polylines[0]!.map((vertex) => vertex.point.latitude)).toEqual([-60, -30, 0, 30, 60]);
      for (const sample of [line.samples[0]!, line.samples.at(-1)!]) {
        expect(result.sampling.samples[sample.observerIndex]).toMatchObject({ status: "undefined", engine: null, bodies: [] });
      }
    }
    const near = ok(meridianLines(birth, { ...options, bodies: ["Sun"], lines: ["IC"],
      bounds: { south: 89.5, north: 89.999, west: -180, east: 180 }, latitudeStep: 1, maxEvaluations: 4 }));
    expect(near.lines[0]!.samples.every((sample) => sample.status === "ok")).toBe(true);
    for (const sample of near.sampling.samples.slice(1)) {
      if (sample.status !== "ok") throw new Error(sample.reason);
      expect(sample.engine).toMatchObject({ requested: "placidus", system: "whole" });
    }
  });

  it("supports single-point bounds, including either pole, without fabricated geometry", () => {
    for (const latitude of [-90, 0, 90]) {
      const result = ok(meridianLines(birth, { ...options, bodies: ["Sun"], lines: ["MC"],
        bounds: { south: latitude, north: latitude, west: -180, east: 180 }, maxEvaluations: latitude === 0 ? 3 : 2 }));
      expect(result.plan.latitudes).toEqual([latitude]);
      expect(result.lines[0]!.samples).toHaveLength(1);
      expect(result.lines[0]!.polylines).toHaveLength(latitude === 0 ? 1 : 0);
      expect(result.plan.requiredEvaluations).toBe(latitude === 0 ? 3 : 2);
    }
    const polesOnly = ok(meridianLines(birth, { ...options, bodies: ["Sun"],
      bounds: { south: -90, north: 90, west: -180, east: 180 }, latitudeStep: 180, maxEvaluations: 2 }));
    expect(polesOnly.lines.every((line) => line.polylines.length === 0)).toBe(true);
  });

  it("does not invent meridians at a numerical celestial pole", () => {
    const position = actual.calc({ body: "Sun", time: instant });
    if (position.status !== "ok") throw new Error(position.reason);
    vi.mocked(calcEngine.calc).mockReturnValueOnce({ ...position, lat: 90 });
    const result = ok(meridianLines(birth, { ...options, bodies: ["Sun"], maxEvaluations: 12 }));
    expect(result.lines).toEqual(["MC", "IC"].map((kind) => ({ body: "Sun", kind, positionIndex: 0,
      status: "undefined", reason: "celestial-pole", longitude: null, samples: [], polylines: [] })));
    expect(result.sampling.evaluations).toEqual({ positions: 1, houses: 1 });
  });

  it("preserves clocks, pins, source forms, ownership and requested houses", () => {
    for (const timeScale of ["utc", "ut1", "tt"] as const) {
      for (const pinned of [false, true]) {
        const input: BirthInput = { utc: birth.utc, timeScale, houseSystem: "koch",
          ...(pinned ? { deltaT: 72.25 } : {}) };
        const chart = natalChart(input);
        const envelope = createNatalEnvelope(chart);
        const opt: MeridianLineOptions = { ...options, bodies: ["Moon"], lines: ["IC"], maxEvaluations: 7 };
        const direct = ok(meridianLines(input, opt));
        for (const source of [chart, envelope]) {
          const result = ok(meridianLines(source, opt));
          expect(result.lines).toEqual(direct.lines);
          expect(result.sampling.positions).toEqual(direct.sampling.positions);
          for (const sample of result.sampling.samples) {
            if (sample.status !== "ok") throw new Error(sample.reason);
            expect(sample.engine.requested).toBe("koch");
            expect(sample.engine.receipt.instants[0]!.timeScale.input).toBe(timeScale);
            expect(sample.engine.receipt.instants[0]!.deltaT.model === "pinned").toBe(pinned);
            expect(sample.engine).toEqual(actual.houses(sample.engine.receipt.request));
          }
        }
      }
    }
    const envelope = createNatalEnvelope(natalChart(birth));
    const mutable = structuredClone(options);
    const result = ok(meridianLines(envelope, mutable));
    const snapshot = structuredClone(result);
    envelope.result.bodies[0]!.lat = 88;
    (mutable.bounds as { south: number }).south = -30;
    (mutable.bodies as string[])[0] = "Pluto";
    expect(result).toEqual(snapshot);
  });

  it("defaults to supported bodies and retains selected body and line order", () => {
    const { bodies: _bodies, ...defaults } = options;
    const result = ok(meridianLines(birth, { ...defaults, maxEvaluations: 111 }));
    expect(result.lines).toHaveLength(20);
    const selected = ok(meridianLines(birth, { ...options, bodies: ["Pluto", "Moon"], lines: ["IC", "MC"] }));
    expect(selected.lines.map((line) => [line.body, line.kind])).toEqual([
      ["Pluto", "IC"], ["Pluto", "MC"], ["Moon", "IC"], ["Moon", "MC"]
    ]);
  });
});

describe("meridian planning and refusals", () => {
  it("preflights conservative work before reading a source, even when longitude clipping would skip work", () => {
    const getter = vi.fn(() => { throw new Error("Source must not be read"); });
    const source = Object.defineProperty({}, "utc", { get: getter }) as BirthInput;
    expect(() => meridianLines(source, { ...options, maxEvaluations: 22 })).toThrow(AngularBudgetError);
    try { meridianLines(source, { ...options, maxEvaluations: 22 }); } catch (error) {
      expect(error).toMatchObject({ requiredEvaluations: 23, maxEvaluations: 22 });
    }
    expect(() => meridianLines(source, { ...options, latitudeStep: Number.MIN_VALUE })).toThrow(AngularBudgetError);
    expect(getter).not.toHaveBeenCalled();
    expect(calcEngine.calc).not.toHaveBeenCalled();
    expect(calcEngine.houses).not.toHaveBeenCalled();
  });

  it("caps observer arrays separately from evaluations, including undefined poles", () => {
    expect(() => planMeridianLines({ ...options, bodies: ["Sun"],
      bounds: { south: -90, north: 90, west: -180, east: 180 }, latitudeStep: 180 / 2048,
      maxEvaluations: MAX_ANGLE_EVALUATIONS })).toThrow(/observer sample count/);
    const plan = planMeridianLines({ ...options, bodies: ["Sun"], lines: ["MC"],
      bounds: { south: 0, north: 1, west: -180, east: 180 }, latitudeStep: 1 / 4093,
      maxEvaluations: MAX_ANGLE_EVALUATIONS });
    expect(plan.requiredEvaluations).toBe(MAX_ANGLE_EVALUATIONS);
    expect(plan.maximumObserverSamples).toBe(MAX_ANGLE_EVALUATIONS - 1);
  });

  it("includes subnormal endpoints and rejects steps that cannot advance floating-point coordinates", () => {
    expect(planMeridianLines({ ...options, bodies: ["Sun"], lines: ["MC"],
      bounds: { south: 0, north: Number.MIN_VALUE, west: 0, east: 0 }, latitudeStep: 180,
      maxEvaluations: 4 }).latitudes).toEqual([0, Number.MIN_VALUE]);
    expect(() => planMeridianLines({ ...options, bodies: ["Sun"], lines: ["MC"],
      bounds: { south: 1, north: 1 + Number.EPSILON, west: 0, east: 0 },
      latitudeStep: Number.EPSILON / 4, maxEvaluations: 7 })).toThrow(/distinct, ordered/);
  });

  it.each([null, [], {}, { ...options, latitudeStep: 0 }, { ...options, latitudeStep: 181 },
    { ...options, latitudeStep: Infinity }, { ...options, maxEvaluations: NaN },
    { ...options, maxEvaluations: 0 }, { ...options, maxEvaluations: 1.5 },
    { ...options, maxEvaluations: MAX_ANGLE_EVALUATIONS + 1 }, { ...options, bodies: [] },
    { ...options, bodies: ["Earth"] }, { ...options, bodies: ["Sun", "Sun"] },
    { ...options, lines: [] }, { ...options, lines: ["ASC"] }, { ...options, lines: ["mc"] },
    { ...options, lines: ["MC", "MC"] }, { ...options, lines: ["IC", , "MC"] },
    { ...options, bounds: { south: 10, north: 0, west: 0, east: 0 } }
  ])("rejects malformed plans: %j", (input) => {
    expect(() => planMeridianLines(input as MeridianLineOptions)).toThrow(RangeError);
  });

  it("rejects selection accessors without invoking them and accepts frozen data", () => {
    const getter = vi.fn(() => { throw new Error("Not data"); });
    const lines = Object.defineProperty(["MC"], "0", { get: getter });
    const bodies = Object.defineProperty(["Sun"], "0", { get: getter });
    expect(() => planMeridianLines({ ...options, lines: lines as never })).toThrow(RangeError);
    expect(() => planMeridianLines({ ...options, bodies: bodies as never })).toThrow(RangeError);
    expect(getter).not.toHaveBeenCalled();
    expect(ok(meridianLines(birth, Object.freeze({ ...options, lines: Object.freeze(["MC"] as const),
      bounds: Object.freeze({ ...options.bounds }) }))).status).toBe("ok");
  });

  it("returns no partial geometry for unknown time or an engine position refusal", () => {
    const unknown = meridianLines({ ...birth, timeKnown: false }, options);
    expect(unknown).toMatchObject({ status: "refused", reason: "unknown-time", lines: [], referenceObserverIndex: null,
      sampling: { positions: [], samples: [], evaluations: { positions: 0, houses: 0 } } });
    expect(calcEngine.calc).not.toHaveBeenCalled();
    expect(calcEngine.houses).not.toHaveBeenCalled();
    const outside = meridianLines({ utc: "2304-05-06T07:08:09Z" }, options);
    expect(outside).toMatchObject({ status: "refused", reason: "engine-refusal", lines: [],
      sampling: { engineRefusal: { reason: "out-of-range" }, positions: [], samples: [],
        evaluations: { positions: 1, houses: 0 } } });
    expect(JSON.parse(JSON.stringify(outside))).toEqual(outside);
  });

  it("discards the reference and all line metadata after a later observer refusal", () => {
    const refusal = { status: "refused", reason: "not-in-this-version", detail: "synthetic observer refusal" } as const;
    vi.mocked(calcEngine.houses).mockImplementationOnce(actual.houses).mockImplementationOnce(actual.houses)
      .mockReturnValueOnce(refusal);
    const result = meridianLines(birth, options);
    expect(result).toMatchObject({ status: "refused", reason: "engine-refusal", lines: [], referenceObserverIndex: null,
      sampling: { engineRefusal: refusal, positions: [], samples: [], evaluations: { positions: 2, houses: 3 } } });
  });
});
