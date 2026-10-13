import { afterEach, describe, expect, it, vi } from "vitest";
import * as engine from "@zodiacs/engine";
import type { BirthInput } from "@zodiacs/engine";
import { createNatalEnvelope, natalReplayInput, parseNatalEnvelope, serializeNatalEnvelope } from "@zodiacs/engine/receipt";
import { GridBudgetError, MAX_GRID_SAMPLES, planGrid, relocateChart, sampleGrid } from "../src/index.js";
import type { GridOptions } from "../src/index.js";

// Native ESM exports cannot be spied on in place. The forwarding mock still
// executes the carried engine and only counts chart evaluations.
vi.mock("@zodiacs/engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@zodiacs/engine")>();
  return { ...actual, natalChart: vi.fn(actual.natalChart) };
});

// Invented birth. Engine comparisons are regression checks, not accuracy evidence.
const birth: BirthInput = {
  utc: "2004-05-06T07:08:09.010+03:00", latitude: 10, longitude: 20,
  houseSystem: "placidus", timeScale: "ut1", deltaT: 65, flags: ["dst-fold"]
};
const options: GridOptions = {
  bounds: { south: -10, north: 10, west: 170, east: -170 },
  latitudeStep: 10, longitudeStep: 10, maxSamples: 9
};
afterEach(() => vi.clearAllMocks());

describe("bounded grid plans", () => {
  it("samples inclusive bounds in south-to-north, eastward order across the seam", () => {
    const plan = planGrid(options);
    expect(plan.latitudes).toEqual([-10, 0, 10]);
    expect(plan.longitudes).toEqual([170, -180, -170]);
    expect(plan.unwrappedLongitudes).toEqual([170, 180, 190]);
    expect(plan.rows).toBe(3);
    expect(plan.columns).toBe(3);
    expect(plan.sampleCount).toBe(9);
    expect(plan.maxSamples).toBe(9);
  });

  it("includes the final boundary with a shorter last interval and no duplicate", () => {
    const plan = planGrid({ ...options, latitudeStep: 7, longitudeStep: 7, maxSamples: 16 });
    expect(plan.latitudes).toEqual([-10, -3, 4, 10]);
    expect(plan.unwrappedLongitudes).toEqual([170, 177, 184, 190]);
    expect(plan.longitudes).toEqual([170, 177, -176, -170]);
  });

  it("supports full-world grids and retains both seam endpoint spellings", () => {
    const plan = planGrid({ ...options, bounds: { south: 0, north: 0, west: -180, east: 180 },
      longitudeStep: 90, maxSamples: 5 });
    expect(plan.longitudes).toEqual([-180, -90, 0, 90, 180]);
    expect(plan.unwrappedLongitudes).toEqual(plan.longitudes);
    expect(plan.latitudes).toEqual([0]);
    expect(plan.sampleCount).toBe(5);
  });

  it("treats equal bounds and opposite seam spellings as a single grid point", () => {
    for (const east of [180, -180]) {
      const plan = planGrid({ ...options, bounds: { south: 5, north: 5, west: 180, east }, maxSamples: 1 });
      expect(plan.latitudes).toEqual([5]);
      expect(plan.longitudes).toEqual([180]);
      expect(plan.sampleCount).toBe(1);
    }
  });

  it("permits the hard limit and refuses an exceeded budget with structured counts", () => {
    const plan = planGrid({ ...options, bounds: { south: 0, north: 63, west: 0, east: 63 },
      latitudeStep: 1, longitudeStep: 1, maxSamples: MAX_GRID_SAMPLES });
    expect(plan.sampleCount).toBe(MAX_GRID_SAMPLES);
    try {
      planGrid({ ...options, maxSamples: 8 });
      throw new Error("Expected a budget refusal");
    } catch (error) {
      expect(error).toBeInstanceOf(GridBudgetError);
      expect(error).toMatchObject({ requiredSamples: 9, maxSamples: 8, name: "GridBudgetError" });
    }
    expect(() => planGrid({ ...options, longitudeStep: Number.MIN_VALUE })).toThrow(GridBudgetError);
    expect(() => planGrid({ ...options, latitudeStep: 1e-100 })).toThrow(GridBudgetError);
  });

  it.each([
    null, [], {}, { ...options, latitudeStep: 0 }, { ...options, longitudeStep: -1 },
    { ...options, latitudeStep: NaN }, { ...options, longitudeStep: Infinity },
    { ...options, latitudeStep: 181 }, { ...options, longitudeStep: 361 },
    { ...options, maxSamples: 0 }, { ...options, maxSamples: 1.5 },
    { ...options, maxSamples: Infinity }, { ...options, maxSamples: MAX_GRID_SAMPLES + 1 },
    { ...options, maxSamples: "9" },
    { ...options, bounds: { ...options.bounds, north: 90 } },
    { ...options, bounds: { ...options.bounds, south: -90 } }
  ])("rejects invalid options and exact chart-grid poles: %j", (input) => {
    expect(() => planGrid(input as GridOptions)).toThrow(RangeError);
  });

  it("rejects steps that collapse at floating-point precision", () => {
    expect(() => planGrid({ ...options,
      bounds: { south: 80, north: 80 + 2 ** -46, west: 0, east: 0 },
      latitudeStep: 2 ** -48, maxSamples: 5
    })).toThrow(/distinct, ordered coordinates/);
  });

  it("retains both endpoints when a positive subnormal span divided by the step underflows", () => {
    const plan = planGrid({ bounds: { south: 0, north: Number.MIN_VALUE, west: 0, east: Number.MIN_VALUE },
      latitudeStep: 180, longitudeStep: 360, maxSamples: 4 });
    expect(plan.latitudes).toEqual([0, Number.MIN_VALUE]);
    expect(plan.longitudes).toEqual([0, Number.MIN_VALUE]);
    expect(plan.sampleCount).toBe(4);
  });

  it("owns plan coordinates and bounds", () => {
    const input = Object.freeze({ ...options, bounds: Object.freeze({ ...options.bounds }) });
    const plan = planGrid(input);
    expect(plan.bounds).not.toBe(input.bounds);
    (plan.latitudes as number[])[0] = 50;
    expect(planGrid(input).latitudes[0]).toBe(-10);
  });
});

describe("engine-backed chart grids", () => {
  it("captures one natal chart and evaluates exactly one engine chart per grid point", () => {
    const calculate = vi.mocked(engine.natalChart);
    const result = sampleGrid(birth, options);
    expect(calculate).toHaveBeenCalledTimes(1 + result.plan.sampleCount);
    expect(result.schema).toBe("zodiacs.relocation-grid.v1");
    expect(result.samples).toHaveLength(9);
    for (const [index, sample] of result.samples.entries()) {
      expect(sample.row).toBe(Math.floor(index / 3));
      expect(sample.column).toBe(index % 3);
      expect(sample.envelope).toEqual(relocateChart(result.natal, sample.point).relocated);
      expect(sample.envelope.receipt.coordinates).toEqual(sample.point);
      expect(sample.envelope.receipt.timeScale).toBe("ut1");
      expect(sample.envelope.receipt.sourceInstant).toBe(birth.utc);
      expect(sample.envelope.receipt.inputFlags).toEqual(["dst-fold"]);
      expect(sample.envelope.result.deltaT?.model).toBe("pinned");
      expect(sample.envelope.receipt.engine.ephemeris?.name).toBe("astronomy-engine");
      expect(sample.envelope.result.bodies).toEqual(result.natal.result.bodies);
      const parsed = parseNatalEnvelope(serializeNatalEnvelope(sample.envelope));
      expect(parsed.ok).toBe(true);
      expect(createNatalEnvelope(engine.natalChart(natalReplayInput(sample.envelope))).result).toEqual(sample.envelope.result);
    }
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it("rejects excess work before reading or calculating a natal source", () => {
    const calculate = vi.mocked(engine.natalChart);
    const getter = vi.fn(() => { throw new Error("Source must not be read"); });
    const source = Object.defineProperty({}, "utc", { get: getter });
    expect(() => sampleGrid(source as BirthInput, { ...options, maxSamples: 8 })).toThrow(GridBudgetError);
    expect(() => sampleGrid(source as BirthInput, { ...options, bounds: { ...options.bounds, north: 90 } })).toThrow(RangeError);
    expect(getter).not.toHaveBeenCalled();
    expect(calculate).not.toHaveBeenCalled();
  });

  it("uses existing charts and envelopes without recalculating their source", () => {
    const chart = engine.natalChart(birth);
    const envelope = createNatalEnvelope(chart);
    const calculate = vi.mocked(engine.natalChart);
    for (const source of [chart, envelope]) {
      calculate.mockClear();
      expect(sampleGrid(source, options).natal).toEqual(envelope);
      expect(calculate).toHaveBeenCalledTimes(9);
    }
  });

  it("uses engine polar fallback in both hemispheres and keeps each receipt independently owned", () => {
    const result = sampleGrid({ ...birth, latitude: 80, flags: ["polar-fallback"] }, {
      ...options, bounds: { south: -89.5, north: 89.5, west: 0, east: 0 },
      latitudeStep: 89.5, maxSamples: 3
    });
    expect(result.samples.map((sample) => sample.envelope.receipt.houses.actual)).toEqual(["whole", "placidus", "whole"]);
    expect(result.samples.map((sample) => sample.envelope.receipt.resultFlags.includes("polar-fallback"))).toEqual([true, false, true]);
    result.samples[0]!.envelope.result.bodies[0]!.lon = -1;
    expect(result.samples[1]!.envelope.result.bodies[0]!.lon).toBeGreaterThanOrEqual(0);
    expect(result.natal.result.bodies[0]!.lon).toBeGreaterThanOrEqual(0);
  });

  it("keeps unknown-time grid angles absent and does not infer an instant", () => {
    const result = sampleGrid({ ...birth, timeKnown: false }, options);
    for (const sample of result.samples) {
      expect(sample.envelope.result.angles).toBeNull();
      expect(sample.envelope.result.houses).toBeNull();
      expect(sample.envelope.receipt.instant).toBe(result.natal.receipt.instant);
    }
  });
});
