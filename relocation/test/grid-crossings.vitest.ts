import { afterEach, describe, expect, it, vi } from "vitest";
import { natalChart } from "@zodiacs/engine";
import type { BirthInput } from "@zodiacs/engine";
import * as calcEngine from "@zodiacs/engine/calc";
import { createNatalEnvelope } from "@zodiacs/engine/receipt";
import { AngularBudgetError, containsPoint, gridCrossings, MAX_ANGLE_EVALUATIONS,
  MAX_GRID_REFINEMENTS, planGridCrossings, wrapLongitude } from "../src/index.js";
import type { GridCrossingOptions, GridCrossingsResult } from "../src/index.js";

vi.mock("@zodiacs/engine/calc", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@zodiacs/engine/calc")>();
  return { ...actual, calc: vi.fn(actual.calc), houses: vi.fn(actual.houses) };
});
const actual = await vi.importActual<typeof calcEngine>("@zodiacs/engine/calc");
// Invented birth. Receipt replay and engine comparisons are regression checks.
const instant = "2004-05-06T07:08:09.010Z";
const birth: BirthInput = { utc: instant, latitude: 12, longitude: 34,
  houseSystem: "placidus", deltaT: 65 };
const options: GridCrossingOptions = { bounds: { south: -5, north: 5, west: -10, east: 10 },
  latitudeStep: 5, longitudeStep: 10, bodies: ["Sun"], lines: ["MC"],
  maxEvaluations: 512, maxRefinements: 32, coordinateTolerance: 1e-6, residualTolerance: 1e-6 };

function ok(result: GridCrossingsResult) {
  if (result.status !== "ok") throw new Error(result.reason);
  return result;
}

function engineDirection() {
  const position = actual.calc({ body: "Sun", time: { iso: instant, deltaT: 65 },
    frame: "equatorial-true-of-date", flags: { speeds: false } });
  const reference = actual.houses({ time: { iso: instant, deltaT: 65 }, place: { latitude: 0, longitude: 0 } });
  if (position.status !== "ok" || reference.status !== "ok") throw new Error("Expected engine results");
  return { position, reference };
}

function injectDirection(dec: number, meridian: number) {
  const { position, reference } = engineDirection();
  // Artificial directions exercise topology; modified engine results are not
  // authentic receipts and are never used as accuracy evidence or fixtures.
  vi.mocked(calcEngine.calc).mockReturnValueOnce({ ...position,
    lon: (reference.armc + meridian + 360) % 360, lat: dec });
}

afterEach(() => {
  vi.mocked(calcEngine.calc).mockReset().mockImplementation(actual.calc);
  vi.mocked(calcEngine.houses).mockReset().mockImplementation(actual.houses);
});

describe("engine-backed grid crossings", () => {
  it("refines real MC/IC and ASC/DSC roots, replays every receipt and shares cell edges", () => {
    const result = ok(gridCrossings(birth, { ...options,
      bounds: { south: -50, north: 50, west: -180, east: 180 },
      latitudeStep: 25, longitudeStep: 60, lines: ["MC", "IC", "ASC", "DSC"], maxEvaluations: 4096 }));
    expect(result.schema).toBe("zodiacs.relocation-grid-crossings.v1");
    expect(new Set(result.crossings.map((crossing) => crossing.kind))).toEqual(new Set(["MC", "IC", "ASC", "DSC"]));
    expect(result.sampling.evaluations.positions).toBe(1);
    expect(calcEngine.calc).toHaveBeenCalledTimes(1);
    expect(calcEngine.houses).toHaveBeenCalledTimes(result.sampling.evaluations.houses);
    expect(result.sampling.evaluations.houses + 1).toBeLessThanOrEqual(4096);
    expect(result.edges).toHaveLength(58);
    expect(result.cells).toHaveLength(96);
    for (const position of result.sampling.positions) {
      expect(position.engine).toEqual(actual.calc(position.engine.receipt.request));
    }
    for (const observer of result.sampling.samples) {
      if (observer.status !== "ok") throw new Error(observer.reason);
      expect(observer.engine).toEqual(actual.houses(observer.engine.receipt.request));
      expect(observer.engine.receipt.instants).toEqual(result.sampling.positions[0]!.engine.receipt.instants);
    }
    for (const crossing of result.crossings) {
      const observer = result.sampling.samples[crossing.observerIndex]!;
      if (observer.status !== "ok") throw new Error(observer.reason);
      const direction = observer.bodies[crossing.positionIndex]!;
      expect(crossing.point).toEqual(observer.point);
      expect(crossing.residual).toBe(direction.residuals[crossing.kind]);
      expect(Math.abs(crossing.residual)).toBeLessThanOrEqual(1e-6);
      expect(containsPoint(result.plan.grid.bounds, crossing.point)).toBe(true);
      // Separate Cartesian projections of engine RA/declination against the
      // local zenith and meridian-plane normal, not physical accuracy evidence.
      const rad = Math.PI / 180;
      const ra = result.sampling.positions[crossing.positionIndex]!.rightAscension! * rad;
      const dec = result.sampling.positions[crossing.positionIndex]!.declination * rad;
      const theta = observer.engine.armc * rad;
      const phi = observer.point.latitude * rad;
      const x = Math.cos(dec) * Math.cos(ra);
      const y = Math.cos(dec) * Math.sin(ra);
      const z = Math.sin(dec);
      if (crossing.kind === "ASC" || crossing.kind === "DSC") {
        expect(Math.abs(x * Math.cos(phi) * Math.cos(theta) + y * Math.cos(phi) * Math.sin(theta)
          + z * Math.sin(phi))).toBeLessThan(2e-8);
        expect(crossing.horizonMotion).toBe(crossing.kind === "ASC" ? "rising" : "setting");
      } else {
        expect(Math.abs(-x * Math.sin(theta) + y * Math.cos(theta))).toBeLessThan(2e-8);
        expect(Math.sign(x * Math.cos(theta) + y * Math.sin(theta))).toBe(crossing.kind === "MC" ? 1 : -1);
      }
    }
    for (const edge of result.edgeResults.filter((edge) => edge.status === "crossing")) {
      expect(edge.bracket!.width).toBeLessThanOrEqual(1e-6);
      expect(edge.refinements).toBeLessThanOrEqual(32);
      expect(edge.bracket!.from.coordinate).toBeGreaterThanOrEqual(edge.initialBracket!.from.coordinate);
      expect(edge.bracket!.to.coordinate).toBeLessThanOrEqual(edge.initialBracket!.to.coordinate);
      expect(edge.bracket!.from.residual === 0 || edge.bracket!.to.residual === 0
        || (edge.bracket!.from.residual < 0) !== (edge.bracket!.to.residual < 0)).toBe(true);
      for (const end of [edge.bracket!.from, edge.bracket!.to]) {
        const observer = result.sampling.samples[end.observerIndex]!;
        if (observer.status !== "ok") throw new Error(observer.reason);
        expect(end.residual).toBe(observer.bodies[edge.positionIndex]!.residuals[edge.kind]);
      }
    }
    const connected = result.cells.filter((cell) => cell.status === "sampled");
    expect(connected.length).toBeGreaterThan(0);
    expect(result.crossings.some((crossing) => connected.filter((cell) =>
      cell.crossingIndices.includes(crossing.index)).length === 2)).toBe(true);
    for (const cell of connected) {
      expect(cell.crossingIndices).toHaveLength(2);
      expect(cell.polylines.length).toBeGreaterThan(0);
      for (const vertex of cell.polylines.flat()) {
        if (vertex.source.kind === "sample") expect(vertex.point).toEqual(result.sampling.samples[vertex.source.index]!.point);
        else expect(Math.abs(vertex.point.longitude)).toBe(180);
      }
    }
    expect(result.unresolvedCells).toEqual(result.cells.filter((cell) => cell.status === "unresolved"));
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it("uses unwrapped brackets across the antimeridian without mistaking the opposite meridian for a root", () => {
    injectDirection(12, 179.25);
    const result = ok(gridCrossings(birth, { ...options, lines: ["MC", "IC"],
      bounds: { south: -5, north: 5, west: 170, east: -170 }, longitudeStep: 20 }));
    expect(result.crossings).toHaveLength(3);
    expect(result.crossings.every((crossing) => crossing.kind === "MC")).toBe(true);
    expect(result.cells.filter((cell) => cell.kind === "MC").every((cell) => cell.status === "sampled")).toBe(true);
    for (const crossing of result.crossings) expect(crossing.point.longitude).toBeCloseTo(179.25, 5);
    for (const resultEdge of result.edgeResults.filter((edge) => edge.status === "crossing")) {
      expect(resultEdge.initialBracket).toMatchObject({ from: { coordinate: 170 }, to: { coordinate: 190 }, width: 20 });
    }
    expect(result.edgeResults.filter((edge) => edge.kind === "IC").every((edge) => edge.status === "no-crossing")).toBe(true);
  });

  it("splits seam-crossing cell segments with global observer provenance", () => {
    injectDirection(20, -90);
    const result = ok(gridCrossings(birth, { ...options, lines: ["ASC"],
      bounds: { south: -5, north: 5, west: 170, east: -170 }, latitudeStep: 10, longitudeStep: 20 }));
    expect(result.cells).toHaveLength(1);
    const cell = result.cells[0]!;
    expect(cell.status).toBe("sampled");
    expect(cell.polylines).toHaveLength(2);
    const seam = cell.polylines.flat().filter((vertex) => vertex.source.kind === "seam");
    expect(seam).toHaveLength(2);
    expect(new Set(seam.map((vertex) => vertex.point.longitude))).toEqual(new Set([180, -180]));
    expect(seam[0]!.source).toEqual(seam[1]!.source);
    for (const vertex of seam) {
      if (vertex.source.kind !== "seam") throw new Error("Expected seam");
      expect(cell.crossingIndices.map((index) => result.crossings[index]!.observerIndex))
        .toEqual(expect.arrayContaining([vertex.source.fromIndex, vertex.source.toIndex]));
      expect(vertex.source.fraction).toBeGreaterThan(0);
      expect(vertex.source.fraction).toBeLessThan(1);
    }
  });

  it("reuses exact endpoint roots and reports coincident edges without invented connections", () => {
    // Override observer ARMC too, solely to produce exact binary endpoints.
    const { position } = engineDirection();
    vi.mocked(calcEngine.calc).mockReturnValueOnce({ ...position, lon: 0, lat: 10 });
    vi.mocked(calcEngine.houses).mockImplementation((request) => {
      const value = actual.houses(request);
      return value.status === "ok" ? { ...value, armc: request.place.longitude } : value;
    });
    const result = ok(gridCrossings(birth, options));
    expect(result.crossings).toHaveLength(3);
    expect(result.crossings.map((crossing) => crossing.observerIndex)).toEqual([1, 4, 7]);
    expect(result.sampling.evaluations).toEqual({ positions: 1, houses: 9 });
    expect(result.edgeResults.filter((edge) => edge.status === "crossing").every((edge) => edge.bracket!.width === 0)).toBe(true);
    expect(result.unresolvedCells.every((cell) => cell.reason === "coincident-edge" && cell.polylines.length === 0)).toBe(true);
    expect(new Set(result.crossings.map((crossing) => `${crossing.kind}:${crossing.observerIndex}`)).size).toBe(3);
  });

  it("detects hidden horizon pairs near a tangent even when coarse endpoints have the same sign", () => {
    injectDirection(20, 0);
    const result = ok(gridCrossings(birth, { ...options, lines: ["ASC", "DSC"],
      bounds: { south: 69, north: 71, west: 150, east: -150 }, latitudeStep: 2, longitudeStep: 60 }));
    expect(result.crossings).toHaveLength(0);
    const hidden = result.edgeResults.filter((edge) => edge.reason === "unbracketed-edge");
    expect(hidden).toHaveLength(2);
    for (const edge of hidden) {
      expect(edge.initialBracket!.from.residual).toBeGreaterThan(0);
      expect(edge.initialBracket!.to.residual).toBeGreaterThan(0);
    }
    expect(result.unresolvedCells).toHaveLength(2);
    expect(result.unresolvedCells.every((cell) => cell.polylines.length === 0)).toBe(true);
  });

  it("reports tangencies, empty circumpolar cells and undefined celestial meridians explicitly", () => {
    injectDirection(90, 0);
    const pole = ok(gridCrossings(birth, { ...options, lines: ["MC", "IC", "ASC", "DSC"],
      bounds: { south: -1, north: 1, west: -1, east: 1 }, latitudeStep: 2, longitudeStep: 2 }));
    expect(pole.edgeResults.filter((edge) => edge.kind === "MC" || edge.kind === "IC")
      .every((edge) => edge.reason === "undefined-direction" && edge.bracket === null)).toBe(true);
    expect(pole.crossings.every((crossing) => crossing.status === "tangent")).toBe(true);
    expect(pole.unresolvedCells.filter((cell) => cell.kind === "ASC" || cell.kind === "DSC")
      .every((cell) => cell.reason === "ambiguous-cell" && cell.polylines.length === 0)).toBe(true);
    injectDirection(20, 0);
    const polar = ok(gridCrossings({ ...birth, houseSystem: "koch" }, { ...options, lines: ["ASC", "DSC"],
      bounds: { south: 89, north: 89.5, west: -1, east: 1 }, latitudeStep: 1, longitudeStep: 2 }));
    expect(polar.crossings).toEqual([]);
    expect(polar.cells.every((cell) => cell.status === "empty")).toBe(true);
    expect(polar.unresolvedCells).toEqual([]);
    for (const sample of polar.sampling.samples) {
      if (sample.status !== "ok") throw new Error(sample.reason);
      expect(sample.engine).toMatchObject({ requested: "koch", system: "whole" });
    }
  });

  it("supports line-only and point grids without manufacturing cells", () => {
    injectDirection(10, 3);
    const line = ok(gridCrossings(birth, { ...options,
      bounds: { south: 0, north: 0, west: 0, east: 10 } }));
    expect(line.edges).toHaveLength(1);
    expect(line.crossings).toHaveLength(1);
    expect(line.cells).toEqual([]);
    const point = ok(gridCrossings(birth, { ...options,
      bounds: { south: 0, north: 0, west: 180, east: -180 }, maxEvaluations: 2 }));
    expect(point.sampling.samples).toHaveLength(1);
    expect(point.edges).toEqual([]);
    expect(point.crossings).toEqual([]);
    expect(point.cells).toEqual([]);
  });

  it("does not select a diagonal for a cell with four distinct meridian boundary crossings", () => {
    const { position } = engineDirection();
    vi.mocked(calcEngine.calc).mockReturnValueOnce({ ...position, lon: 0, lat: 10 });
    vi.mocked(calcEngine.houses).mockImplementation((request) => {
      const value = actual.houses(request);
      // Deliberately inconsistent artificial observer field, solely to force
      // marching-cell ambiguity. These are not authentic observer receipts.
      return value.status === "ok" ? { ...value, armc: wrapLongitude(request.place.latitude * request.place.longitude) } : value;
    });
    const result = ok(gridCrossings(birth, { ...options,
      bounds: { south: -1, north: 1, west: -1, east: 1 }, latitudeStep: 2, longitudeStep: 2 }));
    expect(result.crossings).toHaveLength(4);
    expect(result.unresolvedCells[0]).toMatchObject({ reason: "ambiguous-cell", polylines: [] });
    expect(result.unresolvedCells[0]!.crossingIndices).toHaveLength(4);
  });

  it("preserves source forms, clocks, pins, house requests and ownership", () => {
    const { position, reference } = engineDirection();
    const meridian = wrapLongitude(position.lon - reference.armc);
    const settings = { ...options, bounds: { south: 0, north: 2,
      west: wrapLongitude(meridian - 2), east: wrapLongitude(meridian + 2) }, latitudeStep: 2, longitudeStep: 4 };
    for (const timeScale of ["utc", "ut1", "tt"] as const) {
      for (const pin of [undefined, 72.25]) {
        const input: BirthInput = { utc: instant, timeScale, houseSystem: "koch", ...(pin === undefined ? {} : { deltaT: pin }) };
        const chart = natalChart(input);
        const envelope = createNatalEnvelope(chart);
        const direct = ok(gridCrossings(input, settings));
        for (const source of [chart, envelope]) {
          const result = ok(gridCrossings(source, settings));
          expect(result.crossings).toEqual(direct.crossings);
          expect(result.sampling.positions).toEqual(direct.sampling.positions);
          for (const observer of result.sampling.samples) {
            if (observer.status !== "ok") throw new Error(observer.reason);
            expect(observer.engine).toEqual(actual.houses(observer.engine.receipt.request));
            expect(observer.engine.requested).toBe("koch");
            expect(observer.engine.receipt.instants[0]!.timeScale.input).toBe(timeScale);
            expect(observer.engine.receipt.instants[0]!.deltaT.model === "pinned").toBe(pin !== undefined);
          }
        }
      }
    }
    const envelope = createNatalEnvelope(natalChart(birth));
    const opt = structuredClone(settings);
    const result = ok(gridCrossings(envelope, opt));
    const snapshot = structuredClone(result);
    envelope.result.bodies[0]!.lon = 0;
    (opt.bounds as { south: number }).south = -20;
    (opt.lines as string[])[0] = "IC";
    expect(result).toEqual(snapshot);
  });
});

describe("grid crossing work limits and uncertainty", () => {
  it("reserves coarse work and validates before reading the source", () => {
    const getter = vi.fn(() => { throw new Error("Source must not be read"); });
    const source = Object.defineProperty({}, "utc", { get: getter }) as BirthInput;
    expect(planGridCrossings(options).requiredEvaluations).toBe(10);
    expect(() => gridCrossings(source, { ...options, maxEvaluations: 9 })).toThrow(AngularBudgetError);
    expect(() => gridCrossings(source, { ...options, longitudeStep: Number.MIN_VALUE })).toThrow(RangeError);
    expect(getter).not.toHaveBeenCalled();
    expect(calcEngine.calc).not.toHaveBeenCalled();
    expect(calcEngine.houses).not.toHaveBeenCalled();
  });

  it("keeps bounded partial brackets on budget exhaustion and refinement limits", () => {
    for (const [maxEvaluations, maxRefinements, reason] of [[5, 32, "refinement-budget"],
      [6, 32, "refinement-budget"], [512, 0, "refinement-limit"], [512, 1, "refinement-limit"]] as const) {
      injectDirection(10, 3);
      const result = ok(gridCrossings(birth, { ...options,
        bounds: { south: 0, north: 1, west: 0, east: 10 }, latitudeStep: 1, longitudeStep: 10,
        maxEvaluations, maxRefinements }));
      expect(result.crossings).toEqual([]);
      expect(result.unresolvedCells[0]!.reason).toBe(reason);
      expect(result.unresolvedCells[0]!.polylines).toEqual([]);
      expect(result.edgeResults.filter((edge) => edge.status === "unresolved").every((edge) =>
        edge.reason === reason && edge.bracket!.width <= edge.initialBracket!.width)).toBe(true);
      expect(result.sampling.evaluations.positions + result.sampling.evaluations.houses).toBeLessThanOrEqual(maxEvaluations);
      expect(result.edgeResults.every((edge) => edge.refinements <= maxRefinements)).toBe(true);
    }
  });

  it("does not discard successful crossings when a later edge exhausts the budget", () => {
    injectDirection(10, 5);
    const result = ok(gridCrossings(birth, { ...options,
      bounds: { south: 0, north: 1, west: 0, east: 10 }, latitudeStep: 1, longitudeStep: 10,
      maxEvaluations: 6 }));
    expect(result.sampling.evaluations).toEqual({ positions: 1, houses: 5 });
    expect(result.crossings).toHaveLength(1);
    expect(result.unresolvedCells[0]!.reason).toBe("refinement-budget");
  });

  it("leaves half-world edges and cells unresolved rather than searching across angular wraps", () => {
    const result = ok(gridCrossings(birth, { ...options,
      bounds: { south: -5, north: 5, west: -180, east: 180 }, longitudeStep: 180 }));
    expect(result.edgeResults.filter((edge) => result.edges[edge.edgeIndex]!.axis === "longitude")
      .every((edge) => edge.reason === "wide-edge" && edge.refinements === 0)).toBe(true);
    expect(result.unresolvedCells).toHaveLength(4);
    expect(result.cells.every((cell) => cell.polylines.length === 0)).toBe(true);
  });

  it("leaves insufficient corner margins unresolved when no edge brackets a root", () => {
    injectDirection(10, 11);
    const result = ok(gridCrossings(birth, { ...options,
      bounds: { south: 0, north: 1, west: 0, east: 10 }, latitudeStep: 1, longitudeStep: 10 }));
    expect(result.crossings).toEqual([]);
    expect(result.unresolvedCells[0]!.reason).toBe("unbracketed-cell");
    expect(result.unresolvedCells[0]!.polylines).toEqual([]);
  });

  it("ends tiny-tolerance horizon refinements at coordinate precision", () => {
    injectDirection(23, 0);
    const result = ok(gridCrossings(birth, { ...options, lines: ["ASC"],
      bounds: { south: 10, north: 11, west: -100, east: -90 }, latitudeStep: 1, longitudeStep: 10,
      coordinateTolerance: Number.MIN_VALUE, residualTolerance: Number.MIN_VALUE, maxRefinements: 52 }));
    expect(result.edgeResults.some((edge) => edge.reason === "coordinate-precision")).toBe(true);
    expect(result.sampling.evaluations.houses + 1).toBeLessThanOrEqual(512);
  });

  it.each([null, [], {}, { ...options, lines: [] }, { ...options, lines: ["asc"] },
    { ...options, lines: ["MC", "MC"] }, { ...options, lines: ["ASC", , "DSC"] },
    { ...options, bodies: [] }, { ...options, bodies: ["Earth"] }, { ...options, bodies: ["Sun", "Sun"] },
    { ...options, maxEvaluations: MAX_ANGLE_EVALUATIONS + 1 }, { ...options, maxEvaluations: NaN },
    { ...options, maxRefinements: MAX_GRID_REFINEMENTS + 1 }, { ...options, maxRefinements: -1 },
    { ...options, maxRefinements: 1.5 }, { ...options, coordinateTolerance: 0 },
    { ...options, coordinateTolerance: Infinity }, { ...options, residualTolerance: NaN },
    { ...options, residualTolerance: 181 }, { ...options, bounds: { south: -90, north: 1, west: 0, east: 1 } },
    { ...options, bounds: { south: 0, north: 90, west: 0, east: 1 } }
  ])("rejects malformed plans: %j", (value) => {
    expect(() => planGridCrossings(value as GridCrossingOptions)).toThrow(RangeError);
  });

  it("rejects selection accessors without invoking them and accepts frozen plans", () => {
    const getter = vi.fn(() => { throw new Error("Not data"); });
    const lines = Object.defineProperty(["MC"], "0", { get: getter });
    expect(() => planGridCrossings({ ...options, lines: lines as never })).toThrow(RangeError);
    expect(getter).not.toHaveBeenCalled();
    expect(ok(gridCrossings(birth, Object.freeze({ ...options,
      bounds: Object.freeze({ ...options.bounds }), lines: Object.freeze(["MC"] as const) }))).status).toBe("ok");
  });

  it("preserves the requested selection order and defaults to all supported lines and bodies", () => {
    const { bodies: _bodies, lines: _lines, ...defaults } = options;
    const plan = planGridCrossings(defaults);
    expect(plan.bodies).toHaveLength(10);
    expect(plan.lines).toEqual(["ASC", "DSC", "MC", "IC"]);
    const result = ok(gridCrossings(birth, { ...options, bodies: ["Moon", "Pluto"], lines: ["IC", "ASC"] }));
    expect(result.cells.map((cell) => [cell.body, cell.kind]).filter((_, index) => index % 4 === 0))
      .toEqual([["Moon", "IC"], ["Moon", "ASC"], ["Pluto", "IC"], ["Pluto", "ASC"]]);
  });

  it("returns no geometry for unknown time or a position refusal", () => {
    const unknown = gridCrossings({ ...birth, timeKnown: false }, options);
    expect(unknown).toMatchObject({ status: "refused", reason: "unknown-time", crossings: [], edgeResults: [], cells: [],
      sampling: { positions: [], samples: [], evaluations: { positions: 0, houses: 0 } } });
    expect(calcEngine.calc).not.toHaveBeenCalled();
    expect(calcEngine.houses).not.toHaveBeenCalled();
    const outside = gridCrossings({ utc: "2304-05-06T07:08:09Z" }, options);
    expect(outside).toMatchObject({ status: "refused", reason: "engine-refusal", crossings: [], edges: [],
      sampling: { positions: [], samples: [], engineRefusal: { reason: "out-of-range" } } });
    expect(JSON.parse(JSON.stringify(outside))).toEqual(outside);
  });

  it("discards all partial geometry on a later observer refusal, including refinement", () => {
    const refusal = { status: "refused", reason: "not-in-this-version", detail: "synthetic refusal" } as const;
    for (const refusalAt of [2, 5, 6]) {
      injectDirection(10, 3);
      let calls = 0;
      vi.mocked(calcEngine.houses).mockImplementation((request) => ++calls === refusalAt ? refusal : actual.houses(request));
      const result = gridCrossings(birth, { ...options,
        bounds: { south: 0, north: 1, west: 0, east: 10 }, latitudeStep: 1, longitudeStep: 10 });
      expect(result).toMatchObject({ status: "refused", reason: "engine-refusal", edges: [], edgeResults: [],
        crossings: [], cells: [], unresolvedCells: [], sampling: { engineRefusal: refusal, positions: [], samples: [],
          evaluations: { positions: 1, houses: refusalAt } } });
    }
  });
});
