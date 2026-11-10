import { afterEach, describe, expect, it, vi } from "vitest";
import { natalChart } from "@zodiacs/engine";
import type { BirthInput } from "@zodiacs/engine";
import * as calcEngine from "@zodiacs/engine/calc";
import { createNatalEnvelope } from "@zodiacs/engine/receipt";
import { AngularBudgetError, GreatCircleBudgetError, MAX_ANGLE_EVALUATIONS,
  MAX_PATH_REFINEMENTS, pathCrossings, planPathCrossings, wrapLongitude } from "../src/index.js";
import type { AngularLine, PathCrossingOptions, PathCrossingsResult } from "../src/index.js";

vi.mock("@zodiacs/engine/calc", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@zodiacs/engine/calc")>();
  return { ...actual, calc: vi.fn(actual.calc), houses: vi.fn(actual.houses) };
});
const actual = await vi.importActual<typeof calcEngine>("@zodiacs/engine/calc");
// Invented instant and place, engine comparisons are regression checks.
const instant = "2004-05-06T07:08:09.010Z";
const birth: BirthInput = { utc: instant, latitude: 12, longitude: 34, houseSystem: "placidus", deltaT: 65 };
const options: PathCrossingOptions = { from: { latitude: 0, longitude: 0 }, to: { latitude: 0, longitude: 10 },
  stepDegrees: 10, bodies: ["Sun"], lines: ["MC"], maxEvaluations: 512,
  maxRefinements: 32, coordinateTolerance: 1e-6, residualTolerance: 1e-6 };

function ok(result: PathCrossingsResult) {
  if (result.status !== "ok") throw new Error(result.reason);
  return result;
}

function engineDirection() {
  const position = actual.calc({ body: "Sun", time: { iso: instant, deltaT: 65 },
    frame: "equatorial-true-of-date", flags: { speeds: false } });
  const reference = actual.houses({ time: { iso: instant, deltaT: 65 }, place: { latitude: 0, longitude: 0 } });
  if (position.status !== "ok" || reference.status !== "ok") throw new Error("Expected engine results");
  return { position, reference, meridian: wrapLongitude(position.lon - reference.armc) };
}

function injectDirection(dec: number, meridian: number) {
  const { position, reference } = engineDirection();
  // Artificial topology inputs, never presented as authentic receipts or accuracy evidence.
  vi.mocked(calcEngine.calc).mockReturnValueOnce({ ...position, lat: dec,
    lon: (reference.armc + meridian + 360) % 360 });
}

afterEach(() => {
  vi.mocked(calcEngine.calc).mockReset().mockImplementation(actual.calc);
  vi.mocked(calcEngine.houses).mockReset().mockImplementation(actual.houses);
});

describe("engine-backed crossings along great circles", () => {
  it("refines each real angular branch, replays all receipts and verifies arc brackets", () => {
    const { meridian } = engineDirection();
    const found = new Set<AngularLine>();
    for (const [target, offset] of [["MC", 0], ["IC", 180], ["ASC", -90], ["DSC", 90]] as const) {
      const result = ok(pathCrossings(birth, { ...options, lines: ["ASC", "DSC", "MC", "IC"],
        from: { latitude: -30, longitude: wrapLongitude(meridian + offset - 25) },
        to: { latitude: 20, longitude: wrapLongitude(meridian + offset + 25) }, stepDegrees: 15 }));
      expect(result.schema).toBe("zodiacs.relocation-path-crossings.v1");
      const crossing = result.crossings.find((value) => value.kind === target);
      expect(crossing).toBeDefined();
      expect(result.unresolvedIntervals).toEqual([]);
      expect(result.sampling.evaluations.positions).toBe(1);
      expect(result.sampling.evaluations.houses + 1).toBeLessThanOrEqual(512);
      for (const position of result.sampling.positions) expect(position.engine).toEqual(actual.calc(position.engine.receipt.request));
      for (const sample of result.sampling.samples) {
        if (sample.status !== "ok") throw new Error(sample.reason);
        expect(sample.engine).toEqual(actual.houses(sample.engine.receipt.request));
        expect(sample.engine.receipt.instants).toEqual(result.sampling.positions[0]!.engine.receipt.instants);
      }
      for (const root of result.crossings) {
        found.add(root.kind);
        const observer = result.sampling.samples[root.observerIndex]!;
        if (observer.status !== "ok") throw new Error(observer.reason);
        expect(root.point).toEqual(observer.point);
        expect(root.distanceDegrees).toBe(result.observerDistances[root.observerIndex]);
        expect(root.fraction).toBe(root.distanceDegrees / result.plan.path.lengthDegrees);
        expect(root.residual).toBe(observer.bodies[root.positionIndex]!.residuals[root.kind]);
        expect(Math.abs(root.residual)).toBeLessThanOrEqual(1e-6);
        expect(root.fraction).toBeGreaterThan(0);
        expect(root.fraction).toBeLessThan(1);
        // Independent Cartesian projection from engine RA/declination.
        const rad = Math.PI / 180;
        const p = result.sampling.positions[root.positionIndex]!;
        const x = Math.cos(p.declination * rad) * Math.cos(p.rightAscension! * rad);
        const y = Math.cos(p.declination * rad) * Math.sin(p.rightAscension! * rad);
        const z = Math.sin(p.declination * rad);
        const theta = observer.engine.armc * rad;
        const phi = root.point.latitude * rad;
        if (root.kind === "MC" || root.kind === "IC") {
          expect(Math.abs(-x * Math.sin(theta) + y * Math.cos(theta))).toBeLessThan(2e-8);
          expect(Math.sign(x * Math.cos(theta) + y * Math.sin(theta))).toBe(root.kind === "MC" ? 1 : -1);
        } else {
          expect(Math.abs(x * Math.cos(phi) * Math.cos(theta) + y * Math.cos(phi) * Math.sin(theta)
            + z * Math.sin(phi))).toBeLessThan(2e-8);
          expect(root.horizonMotion).toBe(root.kind === "ASC" ? "rising" : "setting");
        }
      }
      for (const interval of result.intervalResults.filter((value) => value.status === "crossing")) {
        expect(interval.bracket.width).toBeLessThanOrEqual(1e-6);
        expect(interval.bracket.from.distanceDegrees).toBeGreaterThanOrEqual(interval.initialBracket.from.distanceDegrees);
        expect(interval.bracket.to.distanceDegrees).toBeLessThanOrEqual(interval.initialBracket.to.distanceDegrees);
        expect(interval.refinements).toBeLessThanOrEqual(32);
        for (const end of [interval.bracket.from, interval.bracket.to]) {
          const sample = result.sampling.samples[end.observerIndex]!;
          if (sample.status !== "ok") throw new Error(sample.reason);
          expect(end.distanceDegrees).toBe(result.observerDistances[end.observerIndex]);
          expect(end.residual).toBe(sample.bodies[interval.positionIndex]!.residuals[interval.kind]);
        }
        expect(interval.bracket.from.projection === 0 || interval.bracket.to.projection === 0
          || interval.bracket.width === 0 || (interval.bracket.from.projection! < 0) !== (interval.bracket.to.projection! < 0)).toBe(true);
      }
      for (const vertex of result.polylines.flat()) {
        if (vertex.source.kind === "sample") {
          expect(vertex.point.latitude).toBe(result.sampling.samples[vertex.source.index]!.point.latitude);
        } else {
          expect(Math.abs(vertex.point.longitude)).toBe(180);
          expect(result.sampling.samples[vertex.source.fromIndex]).toBeDefined();
          expect(result.sampling.samples[vertex.source.toIndex]).toBeDefined();
        }
      }
      expect(result.observerDistances).toHaveLength(result.sampling.samples.length);
      expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    }
    expect(found).toEqual(new Set(["MC", "IC", "ASC", "DSC"]));
  });

  it("crosses the antimeridian on the short arc and excludes the opposite meridian", () => {
    injectDirection(20, -179.25);
    const result = ok(pathCrossings(birth, { ...options, from: { latitude: 10, longitude: 170 },
      to: { latitude: 20, longitude: -170 }, lines: ["MC", "IC"], stepDegrees: 30 }));
    expect(result.crossings).toHaveLength(1);
    expect(result.crossings[0]).toMatchObject({ kind: "MC", point: { longitude: expect.closeTo(-179.25, 5) } });
    expect(result.intervalResults.find((value) => value.kind === "IC")!.status).toBe("no-crossing");
    expect(result.polylines).toHaveLength(2);
    expect(result.polylines.flat().filter((vertex) => vertex.source.kind === "seam")).toHaveLength(2);
    expect(result.crossings[0]!.point.latitude).toBeGreaterThan(10);
    expect(result.crossings[0]!.point.latitude).toBeLessThan(20);
    expect(result.sampling.samples.length).toBeLessThan(40);
  });

  it("keeps reversed path locations and complements arc fractions", () => {
    injectDirection(12, 3);
    const forward = ok(pathCrossings(birth, { ...options, from: { latitude: -20, longitude: 0 },
      to: { latitude: 20, longitude: 10 } }));
    injectDirection(12, 3);
    const reverse = ok(pathCrossings(birth, { ...options, from: forward.plan.path.to, to: forward.plan.path.from }));
    expect(forward.crossings).toHaveLength(1);
    expect(reverse.crossings).toHaveLength(1);
    expect(reverse.crossings[0]!.point.latitude).toBeCloseTo(forward.crossings[0]!.point.latitude, 5);
    expect(reverse.crossings[0]!.point.longitude).toBeCloseTo(forward.crossings[0]!.point.longitude, 5);
    expect(reverse.crossings[0]!.fraction + forward.crossings[0]!.fraction).toBeCloseTo(1, 7);
  });

  it("deduplicates exact shared endpoint roots and uses cached refinements across kinds", () => {
    const { position } = engineDirection();
    vi.mocked(calcEngine.calc).mockReturnValueOnce({ ...position, lon: 0, lat: 12 });
    vi.mocked(calcEngine.houses).mockImplementation((request) => {
      const value = actual.houses(request);
      return value.status === "ok" ? { ...value, armc: request.place.longitude } : value;
    });
    const result = ok(pathCrossings(birth, { ...options, from: { latitude: 0, longitude: -10 },
      to: { latitude: 0, longitude: 10 }, stepDegrees: 10 }));
    expect(result.crossings).toHaveLength(1);
    expect(result.crossings[0]).toMatchObject({ observerIndex: 1, distanceDegrees: 10, residual: 0 });
    expect(result.intervalResults.map((value) => value.crossingIndex)).toEqual([0, 0]);
    expect(result.intervalResults.every((value) => value.bracket.width === 0 && value.refinements === 0)).toBe(true);
    expect(result.sampling.evaluations).toEqual({ positions: 1, houses: 3 });
    vi.mocked(calcEngine.houses).mockReset().mockImplementation(actual.houses);
    injectDirection(12, 3);
    const cached = ok(pathCrossings(birth, { ...options, lines: ["MC", "IC"] }));
    expect(cached.intervalResults[0]!.refinements).toBeGreaterThan(0);
    expect(cached.intervalResults[1]!.refinements).toBe(cached.intervalResults[0]!.refinements);
    expect(cached.sampling.evaluations.houses).toBe(2 + cached.intervalResults[0]!.refinements);
    expect(new Set(cached.observerDistances).size).toBe(cached.observerDistances.length);
  });

  it("keeps exact start and end roots with collapsed brackets", () => {
    const { position } = engineDirection();
    vi.mocked(calcEngine.houses).mockImplementation((request) => {
      const value = actual.houses(request);
      return value.status === "ok" ? { ...value, armc: request.place.longitude } : value;
    });
    for (const longitude of [0, 10]) {
      vi.mocked(calcEngine.calc).mockReturnValueOnce({ ...position, lon: longitude, lat: 12 });
      const result = ok(pathCrossings(birth, { ...options, lines: ["MC", "IC"] }));
      expect(result.crossings).toHaveLength(1);
      expect(result.crossings[0]!.point.longitude).toBe(longitude);
      expect(result.crossings[0]!.fraction).toBe(longitude / 10);
      expect(result.intervalResults[0]!.bracket.width).toBe(0);
      expect(result.intervalResults[1]).toMatchObject({ kind: "IC", status: "no-crossing", refinements: 0 });
    }
  });

  it("reports geographic poles, coincident paths and undefined celestial meridians", () => {
    for (const latitude of [80, -80]) {
      const result = ok(pathCrossings(birth, { ...options, from: { latitude, longitude: 0 },
        to: { latitude, longitude: 180 }, stepDegrees: 30, lines: ["ASC", "DSC", "MC", "IC"] }));
      expect(result.sampling.samples[1]).toMatchObject({ status: "undefined", engine: null, point: { latitude: Math.sign(latitude) * 90 } });
      expect(result.intervalResults).toHaveLength(8);
      expect(result.intervalResults.every((value) => value.reason === "geographic-pole")).toBe(true);
      expect(result.crossings).toEqual([]);
      expect(result.polylines.map((line) => line.length)).toEqual([1, 1]);
      for (const sample of result.sampling.samples) {
        if (sample.status === "ok") expect(sample.engine).toMatchObject({ requested: "placidus", system: "whole" });
      }
    }
    injectDirection(90, 0);
    const pole = ok(pathCrossings(birth, { ...options, lines: ["MC", "IC", "ASC", "DSC"] }));
    expect(pole.intervalResults.map((value) => value.reason))
      .toEqual(["undefined-direction", "undefined-direction", "coincident-path", "coincident-path"]);
    expect(pole.crossings).toEqual([]);
    injectDirection(12, 3);
    const coincident = ok(pathCrossings(birth, { ...options, from: { latitude: -20, longitude: 3 },
      to: { latitude: 20, longitude: 3 }, lines: ["MC", "IC"] }));
    expect(coincident.intervalResults.every((value) => value.reason === "coincident-path")).toBe(true);
    const point = ok(pathCrossings(birth, { ...options, to: options.from, maxEvaluations: 2 }));
    expect(point.intervalResults).toEqual([]);
    expect(point.crossings).toEqual([]);
    expect(point.sampling.samples).toHaveLength(1);
    const onlyPole = ok(pathCrossings(birth, { ...options, from: { latitude: 90, longitude: 0 },
      to: { latitude: 90, longitude: 120 }, maxEvaluations: 2 }));
    expect(onlyPole.polylines).toEqual([]);
    expect(onlyPole.sampling.evaluations).toEqual({ positions: 1, houses: 0 });
  });

  it("keeps stationary horizon crossing metadata for both requested branches", () => {
    injectDirection(90, 0);
    const result = ok(pathCrossings(birth, { ...options, from: { latitude: -10, longitude: 12 },
      to: { latitude: 10, longitude: 12 }, lines: ["ASC", "DSC"], stepDegrees: 20 }));
    expect(result.crossings).toHaveLength(2);
    for (const crossing of result.crossings) {
      expect(crossing).toMatchObject({ status: "tangent", horizonMotion: "stationary", residual: 0, point: { latitude: 0 } });
    }
    expect(result.crossings[0]!.observerIndex).toBe(result.crossings[1]!.observerIndex);
  });

  it("preserves sources, clocks, pins and ownership without importing source positions", () => {
    const { meridian } = engineDirection();
    const settings = { ...options, from: { latitude: 72, longitude: wrapLongitude(meridian - 10) },
      to: { latitude: 75, longitude: wrapLongitude(meridian + 10) } };
    for (const timeScale of ["utc", "ut1", "tt"] as const) {
      for (const pin of [undefined, 72.25]) {
        const input: BirthInput = { utc: instant, timeScale, houseSystem: "koch", ...(pin === undefined ? {} : { deltaT: pin }) };
        const chart = natalChart(input);
        const envelope = createNatalEnvelope(chart);
        const direct = ok(pathCrossings(input, settings));
        expect(direct.crossings).toHaveLength(1);
        for (const source of [chart, envelope]) {
          const result = ok(pathCrossings(source, settings));
          expect(result.crossings).toEqual(direct.crossings);
          expect(result.sampling.positions).toEqual(direct.sampling.positions);
          for (const observer of result.sampling.samples) {
            if (observer.status !== "ok") throw new Error(observer.reason);
            expect(observer.engine).toMatchObject({ requested: "koch", system: "whole" });
            expect(observer.engine).toEqual(actual.houses(observer.engine.receipt.request));
            expect(observer.engine.receipt.instants[0]!.timeScale.input).toBe(timeScale);
            expect(observer.engine.receipt.instants[0]!.deltaT.model === "pinned").toBe(pin !== undefined);
          }
        }
      }
    }
    const source = createNatalEnvelope(natalChart(birth));
    const input = structuredClone(settings);
    const result = ok(pathCrossings(source, input));
    const snapshot = structuredClone(result);
    source.result.bodies[0]!.lon = 0;
    (input.from as { latitude: number }).latitude = 0;
    (input.lines as string[])[0] = "IC";
    expect(result).toEqual(snapshot);
  });
});

describe("path crossing limits and refusals", () => {
  it("preflights coarse work, tiny steps and antipodal inputs before source capture", () => {
    const getter = vi.fn(() => { throw new Error("Source must not be read"); });
    const source = Object.defineProperty({}, "utc", { get: getter }) as BirthInput;
    expect(planPathCrossings(options).requiredEvaluations).toBe(3);
    expect(() => pathCrossings(source, { ...options, maxEvaluations: 2 })).toThrow(AngularBudgetError);
    expect(() => pathCrossings(source, { ...options, stepDegrees: Number.MIN_VALUE })).toThrow(GreatCircleBudgetError);
    expect(() => pathCrossings(source, { ...options, to: { latitude: 0, longitude: 180 } })).toThrow(/Antipodal/);
    expect(getter).not.toHaveBeenCalled();
    expect(calcEngine.calc).not.toHaveBeenCalled();
    expect(calcEngine.houses).not.toHaveBeenCalled();
  });

  it("keeps partial brackets on evaluation exhaustion and per-interval limits", () => {
    for (const [maxEvaluations, maxRefinements, reason] of [[3, 32, "refinement-budget"],
      [4, 32, "refinement-budget"], [512, 0, "refinement-limit"], [512, 1, "refinement-limit"]] as const) {
      injectDirection(12, 3);
      const result = ok(pathCrossings(birth, { ...options, maxEvaluations, maxRefinements }));
      expect(result.crossings).toEqual([]);
      expect(result.unresolvedIntervals).toHaveLength(1);
      expect(result.intervalResults[0]).toMatchObject({ status: "unresolved", reason });
      expect(result.intervalResults[0]!.bracket.width).toBeLessThanOrEqual(result.intervalResults[0]!.initialBracket.width);
      expect(result.intervalResults[0]!.refinements).toBeLessThanOrEqual(maxRefinements);
      expect(result.sampling.evaluations.positions + result.sampling.evaluations.houses).toBeLessThanOrEqual(maxEvaluations);
    }
  });

  it("preserves an earlier successful root when a later body exhausts the shared budget", () => {
    injectDirection(12, 5);
    injectDirection(12, 3);
    const result = ok(pathCrossings(birth, { ...options, bodies: ["Sun", "Moon"], maxEvaluations: 5 }));
    expect(result.crossings).toHaveLength(1);
    expect(result.crossings[0]!.body).toBe("Sun");
    expect(result.sampling.evaluations).toEqual({ positions: 2, houses: 3 });
    expect(result.intervalResults[1]).toMatchObject({ body: "Moon", reason: "refinement-budget" });
  });

  it("stops unattainable tolerances at floating-point coordinate precision", () => {
    const issues: string[] = [];
    for (const latitude of [10, 10.1, 10.25, 10.5]) {
      injectDirection(23, 0);
      const result = ok(pathCrossings(birth, { ...options, lines: ["ASC"],
        from: { latitude, longitude: -130 }, to: { latitude: 11, longitude: -90 }, stepDegrees: 50, maxRefinements: 52,
        coordinateTolerance: Number.MIN_VALUE, residualTolerance: Number.MIN_VALUE }));
      for (const crossing of result.crossings) {
        expect(crossing.residual).toBe(0);
        expect(result.intervalResults.find((value) => value.crossingIndex === crossing.index)!.bracket.width).toBe(0);
      }
      issues.push(...result.unresolvedIntervals.map((value) => value.reason!));
      expect(result.sampling.evaluations.houses + 1).toBeLessThanOrEqual(512);
    }
    expect(issues).toContain("coordinate-precision");
    expect(issues.every((reason) => ["coordinate-precision", "refinement-limit"].includes(reason))).toBe(true);
  });

  it.each([null, [], {}, { ...options, bodies: [] }, { ...options, bodies: ["Earth"] },
    { ...options, bodies: ["Sun", "Sun"] }, { ...options, lines: [] }, { ...options, lines: ["mc"] },
    { ...options, lines: ["MC", "MC"] }, { ...options, lines: ["MC", , "IC"] },
    { ...options, maxEvaluations: MAX_ANGLE_EVALUATIONS + 1 }, { ...options, maxEvaluations: Infinity },
    { ...options, maxRefinements: -1 }, { ...options, maxRefinements: 1.5 },
    { ...options, maxRefinements: MAX_PATH_REFINEMENTS + 1 }, { ...options, coordinateTolerance: 0 },
    { ...options, coordinateTolerance: NaN }, { ...options, residualTolerance: Infinity },
    { ...options, residualTolerance: 181 }
  ])("rejects invalid path plans: %j", (value) => {
    expect(() => planPathCrossings(value as PathCrossingOptions)).toThrow(RangeError);
  });

  it("preserves requested order and refuses selection accessors", () => {
    const { bodies: _bodies, lines: _lines, ...defaults } = options;
    const plan = planPathCrossings(defaults);
    expect(plan.bodies).toHaveLength(10);
    expect(plan.lines).toEqual(["ASC", "DSC", "MC", "IC"]);
    expect(planPathCrossings({ ...options, bodies: ["Moon", "Pluto"], lines: ["IC", "ASC"] }))
      .toMatchObject({ bodies: ["Moon", "Pluto"], lines: ["IC", "ASC"] });
    const getter = vi.fn(() => "MC");
    const lines = Object.defineProperty(["MC"], "0", { get: getter });
    expect(() => planPathCrossings({ ...options, lines: lines as never })).toThrow(RangeError);
    expect(getter).not.toHaveBeenCalled();
  });

  it("returns empty geometry for unknown time or a typed position refusal", () => {
    const unknown = pathCrossings({ ...birth, timeKnown: false }, options);
    expect(unknown).toMatchObject({ status: "refused", reason: "unknown-time", polylines: [], crossings: [],
      sampling: { positions: [], samples: [], evaluations: { positions: 0, houses: 0 } } });
    expect(calcEngine.calc).not.toHaveBeenCalled();
    expect(calcEngine.houses).not.toHaveBeenCalled();
    const outside = pathCrossings({ utc: "2304-05-06T07:08:09Z" }, options);
    expect(outside).toMatchObject({ status: "refused", reason: "engine-refusal", polylines: [], crossings: [],
      sampling: { positions: [], samples: [], engineRefusal: { reason: "out-of-range" } } });
    expect(JSON.parse(JSON.stringify(outside))).toEqual(outside);
  });

  it("discards all partial output on an observer refusal, including during refinement", () => {
    const refusal = { status: "refused", reason: "not-in-this-version", detail: "synthetic refusal" } as const;
    for (const refusalAt of [2, 3, 4]) {
      injectDirection(12, 3);
      let calls = 0;
      vi.mocked(calcEngine.houses).mockImplementation((request) => ++calls === refusalAt ? refusal : actual.houses(request));
      const result = pathCrossings(birth, options);
      expect(result).toMatchObject({ status: "refused", reason: "engine-refusal", crossings: [], polylines: [],
        intervalResults: [], unresolvedIntervals: [], observerDistances: [], sampling: { positions: [], samples: [],
          engineRefusal: refusal, evaluations: { positions: 1, houses: refusalAt } } });
    }
  });
});
