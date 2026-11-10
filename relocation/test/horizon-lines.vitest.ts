import { afterEach, describe, expect, it, vi } from "vitest";
import { natalChart } from "@zodiacs/engine";
import type { BirthInput } from "@zodiacs/engine";
import * as calcEngine from "@zodiacs/engine/calc";
import { createNatalEnvelope } from "@zodiacs/engine/receipt";
import { ANGULAR_BODIES, AngularBudgetError, containsPoint, horizonLines,
  MAX_ANGLE_EVALUATIONS, planHorizonLines } from "../src/index.js";
import type { HorizonLineOptions, HorizonLinesResult } from "../src/index.js";

vi.mock("@zodiacs/engine/calc", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@zodiacs/engine/calc")>();
  return { ...actual, calc: vi.fn(actual.calc), houses: vi.fn(actual.houses) };
});
const actual = await vi.importActual<typeof calcEngine>("@zodiacs/engine/calc");
// Invented instant and coordinates. Engine comparisons are regression checks.
const instant = "2004-05-06T07:08:09.010Z";
const birth: BirthInput = { utc: instant, latitude: 12, longitude: 34, houseSystem: "placidus", deltaT: 65 };
const options: HorizonLineOptions = { bounds: { south: -90, north: 90, west: -180, east: 180 },
  latitudeStep: 30, bodies: ["Sun", "Moon"], maxEvaluations: 39 };
function ok(result: HorizonLinesResult) {
  if (result.status !== "ok") throw new Error(result.reason);
  return result;
}
function direction(dec: number, meridian = 0) {
  const position = actual.calc({ body: "Sun", time: { iso: instant, deltaT: 65 }, frame: "equatorial-true-of-date" });
  const reference = actual.houses({ time: { iso: instant, deltaT: 65 }, place: { latitude: 0, longitude: 0 } });
  if (position.status !== "ok" || reference.status !== "ok") throw new Error("Expected engine results");
  // Synthetic branch injection, not authentic position receipts or accuracy evidence.
  vi.mocked(calcEngine.calc).mockReturnValueOnce({ ...position, lon: (reference.armc + meridian + 360) % 360, lat: dec });
}
afterEach(() => {
  vi.mocked(calcEngine.calc).mockReset().mockImplementation(actual.calc);
  vi.mocked(calcEngine.houses).mockReset().mockImplementation(actual.houses);
});

describe("engine-backed ASC and DSC polylines", () => {
  it("replays every engine receipt and verifies altitude, Cartesian horizon and branch projections", () => {
    const result = ok(horizonLines(birth, options));
    expect(result.schema).toBe("zodiacs.relocation-horizons.v1");
    expect(result.referenceObserverIndex).toBe(0);
    expect(result.plan.requiredEvaluations).toBe(39);
    expect(calcEngine.calc).toHaveBeenCalledTimes(2);
    expect(calcEngine.houses).toHaveBeenCalledTimes(result.sampling.evaluations.houses);
    expect(result.sampling.evaluations.houses + 2).toBeLessThanOrEqual(39);
    for (const position of result.sampling.positions) {
      expect(position.engine).toEqual(actual.calc(position.engine.receipt.request));
    }
    expect(result.lines.map((line) => [line.body, line.kind])).toEqual([
      ["Sun", "ASC"], ["Sun", "DSC"], ["Moon", "ASC"], ["Moon", "DSC"]
    ]);
    for (const line of result.lines) {
      expect(line.status).toBe("sampled");
      const position = result.sampling.positions[line.positionIndex]!;
      const tangents = line.samples.filter((sample) => sample.status === "tangent");
      expect(tangents).toHaveLength(2);
      expect(tangents.map((sample) => sample.latitude)).toEqual([
        -(90 - Math.abs(position.declination)), 90 - Math.abs(position.declination)
      ]);
      for (const sample of line.samples) {
        if (sample.observerIndex === null) {
          expect(sample.residual).toBeNull();
          continue;
        }
        const observer = result.sampling.samples[sample.observerIndex]!;
        if (observer.status !== "ok") throw new Error(observer.reason);
        expect(observer.engine).toEqual(actual.houses(observer.engine.receipt.request));
        expect(observer.engine.receipt.instants).toEqual(position.engine.receipt.instants);
        expect(observer.point).toEqual(sample.point);
        expect(sample.residual).toBe(observer.bodies[line.positionIndex]!.altitude);
        expect(sample.residual).toBeCloseTo(0, 10);
        if (sample.status === "ok") {
          expect(observer.bodies[line.positionIndex]!.horizonMotion).toBe(line.kind === "ASC" ? "rising" : "setting");
        } else {
          expect(observer.bodies[line.positionIndex]!.horizonMotion).toBe("stationary");
        }
        const ra = position.rightAscension! * Math.PI / 180;
        const dec = position.declination * Math.PI / 180;
        const theta = observer.engine.armc * Math.PI / 180;
        const phi = observer.point.latitude * Math.PI / 180;
        const dot = Math.cos(dec) * Math.cos(ra) * Math.cos(phi) * Math.cos(theta)
          + Math.cos(dec) * Math.sin(ra) * Math.cos(phi) * Math.sin(theta) + Math.sin(dec) * Math.sin(phi);
        expect(dot).toBeCloseTo(0, 12);
      }
      for (const polyline of line.polylines) {
        for (const vertex of polyline) {
          expect(containsPoint(options.bounds, vertex.point)).toBe(true);
          if (vertex.source.kind === "sample") {
            expect(result.sampling.samples[vertex.source.index]!.point.latitude).toBe(vertex.point.latitude);
          } else {
            expect(result.sampling.samples[vertex.source.fromIndex]!.status).toBe("ok");
            expect(result.sampling.samples[vertex.source.toIndex]!.status).toBe("ok");
          }
        }
      }
    }
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it("records circumpolar gaps in both hemispheres and inserts coincident tangent endpoints", () => {
    for (const dec of [-30, 30]) {
      direction(dec);
      const result = ok(horizonLines(birth, { ...options, bodies: ["Sun"] }));
      for (const line of result.lines) {
        expect(line.samples.map((sample) => sample.latitude)).toEqual([-90, -60, -30, 0, 30, 60, 90]);
        expect(line.samples.filter((s) => s.status === "tangent").map((s) => s.latitude)).toEqual([-60, 60]);
        expect(line.samples[0]).toMatchObject({ status: "undefined", reason: "geographic-pole", observerIndex: null });
        expect(line.samples.at(-1)).toMatchObject({ status: "undefined", reason: "geographic-pole", observerIndex: null });
      }
      const asc = result.lines[0]!;
      const dsc = result.lines[1]!;
      for (const latitude of [-60, 60]) {
        expect(asc.samples.find((s) => s.latitude === latitude)!.point)
          .toEqual(dsc.samples.find((s) => s.latitude === latitude)!.point);
      }
      direction(dec);
      const gaps = ok(horizonLines(birth, { ...options, bodies: ["Sun"], latitudeStep: 10, maxEvaluations: 44 }));
      for (const line of gaps.lines) {
        for (const sample of line.samples.filter((s) => s.status === "gap")) {
          expect(Math.abs(sample.latitude)).toBeGreaterThan(60);
          expect(sample.reason).toBe(sample.latitude * dec > 0 ? "always-above" : "always-below");
          expect(sample).toMatchObject({ point: null, observerIndex: null, residual: null });
        }
      }
    }
  });

  it("adds tangencies even when a coarse plan samples only poles", () => {
    direction(20);
    const result = ok(horizonLines(birth, { ...options, bodies: ["Sun"], latitudeStep: 180, maxEvaluations: 10 }));
    expect(result.plan.latitudes).toEqual([-90, 90]);
    for (const line of result.lines) {
      expect(line.samples.map((s) => [s.latitude, s.status])).toEqual([
        [-90, "undefined"], [-70, "tangent"], [70, "tangent"], [90, "undefined"]
      ]);
      expect(line.polylines.flat().every((v) => Math.abs(v.point.latitude) === 70)).toBe(true);
    }
  });

  it("selects the branch's longitude arc for half-world tangent links", () => {
    for (const dec of [-20, 20]) {
      direction(dec, -100);
      const result = ok(horizonLines(birth, { ...options, bodies: ["Sun"], latitudeStep: 180, maxEvaluations: 10 }));
      const asc = result.lines[0]!;
      const dsc = result.lines[1]!;
      expect(asc.polylines).toHaveLength(2);
      expect(dsc.polylines).toHaveLength(1);
      const seams = asc.polylines.flat().filter((v) => v.source.kind === "seam");
      expect(seams).toHaveLength(2);
      expect(seams.map((v) => v.point.longitude)).toEqual(dec > 0 ? [-180, 180] : [180, -180]);
      expect(seams[0]!.source).toEqual(seams[1]!.source);
      // Exclude the middle of the ASC arc but keep both endpoints. No link may
      // cross that excluded arc, despite both tangent endpoints being admitted.
      direction(dec, -100);
      const bounded = ok(horizonLines(birth, { ...options, bodies: ["Sun"], latitudeStep: 180, maxEvaluations: 10,
        bounds: { ...options.bounds, west: -110, east: 90 } }));
      expect(bounded.lines[0]!.polylines.map((p) => p.length)).toEqual([1, 1]);
      expect(bounded.lines[1]!.polylines).toHaveLength(1);
    }
  });

  it("skips all houses work for a polar gap, and supports a singleton tangent or pole bound", () => {
    for (const latitude of [75, -75, 60, 90, -90]) {
      direction(30);
      const result = ok(horizonLines(birth, { ...options, bodies: ["Sun"], lines: ["ASC"],
        bounds: { ...options.bounds, south: latitude, north: latitude }, maxEvaluations: 5 }));
      expect(result.lines[0]!.samples).toHaveLength(1);
      expect(result.sampling.evaluations.houses).toBe(latitude === 60 ? 2 : 1);
      expect(result.lines[0]!.polylines.flat()).toHaveLength(latitude === 60 ? 1 : 0);
    }
  });

  it("retains engine polar fallback near either pole for an equatorial direction", () => {
    direction(0);
    const result = ok(horizonLines({ ...birth, houseSystem: "koch", latitude: 89 }, {
      ...options, bodies: ["Sun"], bounds: { south: -89.999, north: 89.999, west: -180, east: 180 },
      latitudeStep: 90, maxEvaluations: 12
    }));
    expect(result.sampling.natal.receipt.houses.actual).toBe("whole");
    for (const line of result.lines) {
      expect(line.samples.every((s) => s.status === "ok")).toBe(true);
      for (const sample of [line.samples[0]!, line.samples.at(-1)!]) {
        const observer = result.sampling.samples[sample.observerIndex!]!;
        if (observer.status !== "ok") throw new Error(observer.reason);
        expect(observer.engine).toMatchObject({ requested: "koch", system: "whole" });
        expect(sample.residual).toBeCloseTo(0, 10);
      }
    }
  });

  it("splits antimeridian geometry with global seam provenance inside wrapped bounds", () => {
    direction(30, -100);
    const result = ok(horizonLines(birth, { ...options, bodies: ["Sun"], lines: ["ASC"],
      bounds: { south: -30, north: 30, west: 150, east: -150 }, latitudeStep: 30, maxEvaluations: 7 }));
    const line = result.lines[0]!;
    expect(line.polylines).toHaveLength(2);
    const seams = line.polylines.flat().filter((v) => v.source.kind === "seam");
    expect(seams).toHaveLength(2);
    expect(seams[0]!.source).toEqual(seams[1]!.source);
    for (const vertex of line.polylines.flat()) expect(containsPoint(result.plan.bounds, vertex.point)).toBe(true);
    const seam = seams[0]!.source;
    if (seam.kind !== "seam") throw new Error("Expected seam");
    expect(seam.fromIndex).toBe(1);
    expect(seam.toIndex).toBe(2);
    expect(seam.fraction).toBeGreaterThan(0);
    expect(seam.fraction).toBeLessThan(1);
  });

  it("breaks geometry at clipped rows and when a link traverses an excluded longitude arc", () => {
    direction(30);
    const clipped = ok(horizonLines(birth, { ...options, bodies: ["Sun"], lines: ["ASC"],
      bounds: { south: -60, north: 60, west: -100, east: -80 }, latitudeStep: 30, maxEvaluations: 9 }));
    expect(clipped.lines[0]!.samples.filter((s) => s.status === "outside-bounds")).toHaveLength(4);
    expect(clipped.lines[0]!.polylines.flat()).toHaveLength(1);
    expect(clipped.sampling.evaluations.houses).toBe(2);
    direction(30);
    const disconnected = ok(horizonLines(birth, { ...options, bodies: ["Sun"], lines: ["ASC"],
      bounds: { south: -60, north: 60, west: -50, east: -130 }, latitudeStep: 120, maxEvaluations: 6 }));
    expect(disconnected.lines[0]!.polylines).toHaveLength(2);
    expect(disconnected.lines[0]!.polylines.every((p) => p.length === 1)).toBe(true);
    direction(0);
    const outside = ok(horizonLines(birth, { ...options, bodies: ["Sun"],
      bounds: { south: -1, north: 1, west: -10, east: 10 }, latitudeStep: 1, maxEvaluations: 12 }));
    expect(outside.lines.every((line) => line.status === "outside-bounds" && line.polylines.length === 0)).toBe(true);
    expect(outside.sampling.evaluations).toEqual({ positions: 1, houses: 1 });
  });

  it("treats seam aliases inclusively without duplicate samples", () => {
    for (const [west, east] of [[180, -180], [180, 180], [-180, -180]] as const) {
      direction(0, -90);
      const result = ok(horizonLines(birth, { ...options, bodies: ["Sun"], lines: ["ASC"],
        bounds: { south: -1, north: 1, west, east }, latitudeStep: 1, maxEvaluations: 7 }));
      expect(result.lines[0]!.samples).toHaveLength(3);
      expect(result.lines[0]!.polylines.flat().map((v) => v.point.longitude)).toEqual([-180, -180, -180]);
    }
  });

  it("returns no fabricated curves for a numerical celestial pole", () => {
    direction(90);
    const result = ok(horizonLines(birth, { ...options, bodies: ["Sun"] }));
    expect(result.lines.every((line) => line.status === "undefined" && line.reason === "celestial-pole"
      && line.samples.length === 0 && line.polylines.length === 0)).toBe(true);
    expect(result.sampling.evaluations).toEqual({ positions: 1, houses: 1 });
  });

  it("preserves source forms, clocks, pins and ownership, and selected ordering", () => {
    for (const timeScale of ["utc", "ut1", "tt"] as const) {
      for (const deltaT of [undefined, 72.25]) {
        const input: BirthInput = { utc: instant, timeScale, houseSystem: "koch", ...(deltaT === undefined ? {} : { deltaT }) };
        const chart = natalChart(input);
        const envelope = createNatalEnvelope(chart);
        const opt = { ...options, bodies: ["Moon"] as const, lines: ["DSC"] as const };
        const direct = ok(horizonLines(input, opt));
        for (const source of [chart, envelope]) {
          const result = ok(horizonLines(source, opt));
          expect(result.lines).toEqual(direct.lines);
          for (const observer of result.sampling.samples) {
            if (observer.status !== "ok") throw new Error(observer.reason);
            expect(observer.engine.requested).toBe("koch");
            expect(observer.engine).toEqual(actual.houses(observer.engine.receipt.request));
            expect(observer.engine.receipt.instants[0]!.timeScale.input).toBe(timeScale);
            expect(observer.engine.receipt.instants[0]!.deltaT.model === "pinned").toBe(deltaT !== undefined);
          }
        }
      }
    }
    const mutable = structuredClone(options);
    const envelope = createNatalEnvelope(natalChart(birth));
    const result = ok(horizonLines(envelope, mutable));
    const snapshot = structuredClone(result);
    envelope.result.bodies[0]!.lat = 88;
    (mutable.bounds as { south: number }).south = -1;
    (mutable.bodies as string[])[0] = "Pluto";
    expect(result).toEqual(snapshot);
    const ordered = ok(horizonLines(birth, { ...options, bodies: ["Pluto", "Sun"], lines: ["DSC", "ASC"] }));
    expect(ordered.lines.map((line) => [line.body, line.kind])).toEqual([
      ["Pluto", "DSC"], ["Pluto", "ASC"], ["Sun", "DSC"], ["Sun", "ASC"]
    ]);
    const { bodies: _bodies, ...defaults } = options;
    expect(planHorizonLines({ ...defaults, maxEvaluations: 191 }).bodies).toEqual(ANGULAR_BODIES);
  });
});

describe("horizon planning and refusals", () => {
  it("reserves tangent work before reading a source or allocating tiny-step axes", () => {
    const getter = vi.fn(() => { throw new Error("Source must not be read"); });
    const source = Object.defineProperty({}, "utc", { get: getter }) as BirthInput;
    expect(() => horizonLines(source, { ...options, maxEvaluations: 38 })).toThrow(AngularBudgetError);
    expect(getter).not.toHaveBeenCalled();
    expect(calcEngine.calc).not.toHaveBeenCalled();
    expect(() => planHorizonLines({ ...options, latitudeStep: Number.MIN_VALUE })).toThrow(AngularBudgetError);
    try { planHorizonLines({ ...options, maxEvaluations: 38 }); } catch (error) {
      expect(error).toMatchObject({ requiredEvaluations: 39, maxEvaluations: 38 });
    }
    const tiny = planHorizonLines({ ...options, bodies: ["Sun"], lines: ["ASC"],
      bounds: { south: 0, north: Number.MIN_VALUE, west: 0, east: 0 }, maxEvaluations: 6 });
    expect(tiny.latitudes).toEqual([0, Number.MIN_VALUE]);
  });

  it("rejects invalid options, sparse/accessor selections and indistinguishable latitudes", () => {
    const invalid = [null, [], { ...options, latitudeStep: 0 }, { ...options, latitudeStep: Infinity },
      { ...options, latitudeStep: 181 }, { ...options, maxEvaluations: MAX_ANGLE_EVALUATIONS + 1 },
      { ...options, maxEvaluations: 1.5 }, { ...options, bounds: { ...options.bounds, north: 91 } },
      { ...options, lines: [] }, { ...options, lines: ["MC"] }, { ...options, lines: ["ASC", "ASC"] },
      { ...options, lines: new Array(1) }, { ...options, bodies: ["Earth"] }];
    for (const value of invalid) expect(() => planHorizonLines(value as HorizonLineOptions)).toThrow(RangeError);
    const getter = vi.fn();
    const lines = Object.defineProperty(["ASC"], "0", { get: getter });
    expect(() => planHorizonLines({ ...options, lines: lines as ["ASC"] })).toThrow(RangeError);
    expect(getter).not.toHaveBeenCalled();
    expect(() => planHorizonLines({ ...options, bodies: ["Sun"], lines: ["ASC"],
      bounds: { south: 60, north: 60 + 2 ** -47, west: 0, east: 0 }, latitudeStep: 2 ** -49 })).toThrow(/precision/);
  });

  it("refuses unknown time and engine coverage without partial results", () => {
    const unknown = horizonLines({ ...birth, timeKnown: false }, options);
    expect(unknown).toMatchObject({ status: "refused", reason: "unknown-time", lines: [],
      sampling: { evaluations: { positions: 0, houses: 0 }, positions: [], samples: [] } });
    const outside = horizonLines({ ...birth, utc: "1700-01-02T00:00:00Z" }, options);
    expect(outside).toMatchObject({ status: "refused", reason: "engine-refusal", lines: [], referenceObserverIndex: null,
      sampling: { positions: [], samples: [], evaluations: { positions: 1, houses: 0 } } });
  });

  it("discards all partial curves after a later observer refusal", () => {
    const refusal = { status: "refused", reason: "not-in-this-version", detail: "synthetic refusal" } as const;
    vi.mocked(calcEngine.houses).mockImplementationOnce(actual.houses).mockImplementationOnce(actual.houses)
      .mockReturnValueOnce(refusal);
    expect(horizonLines(birth, options)).toMatchObject({ status: "refused", reason: "engine-refusal", lines: [],
      referenceObserverIndex: null, sampling: { positions: [], samples: [], engineRefusal: refusal,
        evaluations: { positions: 2, houses: 3 } } });
  });
});
