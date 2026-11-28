import { afterEach, describe, expect, it, vi } from "vitest";
import { natalChart } from "@zodiacs/engine";
import * as engine from "@zodiacs/engine";
import * as calcEngine from "@zodiacs/engine/calc";
import { createNatalEnvelope } from "@zodiacs/engine/receipt";
import { executeJsonRequest, MAX_CLI_INPUT_BYTES, MAX_CLI_JSON_DEPTH } from "../src/cli-request.js";
import { gridCrossings, horizonLines, localSpaceLines, meridianLines, pathCrossings,
  planHorizonLines, planMeridianLines, relocateChart, sampleGrid } from "../src/index.js";

vi.mock("@zodiacs/engine", async (load) => {
  const original = await load<typeof engine>();
  return { ...original, natalChart: vi.fn(original.natalChart) };
});
vi.mock("@zodiacs/engine/calc", async (load) => {
  const original = await load<typeof calcEngine>();
  return { ...original, calc: vi.fn(original.calc), houses: vi.fn(original.houses) };
});
const originalCalc = await vi.importActual<typeof calcEngine>("@zodiacs/engine/calc");
// Invented instant and places. CLI parity is regression evidence only.
const birth = { utc: "2004-05-06T07:08:09.010Z", latitude: 12, longitude: 34,
  houseSystem: "placidus" as const, deltaT: 65 };
const destination = { latitude: 78, longitude: -180 };
const bounds = { south: -70, north: 80, west: -180, east: 180 };
const angular = { bounds, latitudeStep: 50, bodies: ["Sun", "Moon"] as const, maxEvaluations: 256 };
const refinement = { maxEvaluations: 256, maxRefinements: 24, coordinateTolerance: 1e-5, residualTolerance: 1e-5 };
const path = { from: { latitude: 80, longitude: 170 }, to: { latitude: 75, longitude: -160 },
  stepDegrees: 10, bodies: ["Sun"] as const, ...refinement };
const local = { origin: { latitude: -75, longitude: 175 }, lengthDegrees: 40, stepDegrees: 20,
  bodies: ["Moon"] as const, maxEvaluations: 32 };
const charts = { bounds: { south: 75, north: 80, west: 175, east: -175 },
  latitudeStep: 5, longitudeStep: 10, maxSamples: 4 };
const crossingGrid = { bounds: { south: -10, north: 10, west: 170, east: -160 }, latitudeStep: 20,
  longitudeStep: 30, bodies: ["Sun"] as const, ...refinement };
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as unknown;

afterEach(() => {
  vi.mocked(engine.natalChart).mockClear();
  vi.mocked(calcEngine.calc).mockReset().mockImplementation(originalCalc.calc);
  vi.mocked(calcEngine.houses).mockReset().mockImplementation(originalCalc.houses);
});

describe("validated offline JSON requests", () => {
  it("relocates a synthetic birth without losing clocks, pins, receipts or polar fallback", () => {
    for (const timeScale of ["utc", "ut1", "tt"] as const) {
      const source = { ...birth, timeScale };
      expect(executeJsonRequest("chart", JSON.stringify({ source, destination }))).toEqual(relocateChart(source, destination));
    }
  });

  it("accepts a decoded engine natal envelope and replays its requested houses", () => {
    const envelope = createNatalEnvelope(natalChart({ ...birth, latitude: 80 }));
    const target = { latitude: birth.latitude, longitude: birth.longitude };
    const output = executeJsonRequest("chart", JSON.stringify({ source: envelope, destination: target }));
    expect(output).toEqual(relocateChart(envelope, target));
  });

  it("retains envelope provenance without importing stored planetary positions as directions", () => {
    const envelope = createNatalEnvelope(natalChart({ ...birth, latitude: 80 }));
    const output = executeJsonRequest("chart", JSON.stringify({ source: envelope, destination }));
    expect(output).toEqual(relocateChart(envelope, destination));
    expect(() => executeJsonRequest("chart", JSON.stringify({ source: { ...envelope, requiredFeatures: ["unknown"] }, destination }))).toThrow();
    expect(() => executeJsonRequest("chart", JSON.stringify({ source: json(natalChart(birth)), destination }))).toThrow(/unsupported fields/);
  });

  it("returns all four angular families with full library geometry and receipts", () => {
    const output = executeJsonRequest("lines", JSON.stringify({ source: birth, mode: "angular", options: angular }));
    expect(output).toMatchObject({ schema: "zodiacs.relocation-lines.v1", status: "ok",
      results: [meridianLines(birth, angular), horizonLines(birth, angular)].map((result) => ({ ...result,
        plan: { ...result.plan, maxEvaluations: result.plan.requiredEvaluations } })) });
    // A raw birth is captured once for the combined command, rather than once per family.
    vi.mocked(engine.natalChart).mockClear();
    executeJsonRequest("lines", JSON.stringify({ source: birth, mode: "angular", options: angular }));
    expect(engine.natalChart).toHaveBeenCalledTimes(1);
  });

  it("enforces one aggregate budget before any engine evaluation", () => {
    const m = planMeridianLines(angular).requiredEvaluations;
    const h = planHorizonLines(angular).requiredEvaluations;
    const maxEvaluations = m + h - 1;
    expect(maxEvaluations).toBeGreaterThanOrEqual(Math.max(m, h));
    expect(() => executeJsonRequest("lines", JSON.stringify({ source: birth, mode: "angular",
      options: { ...angular, maxEvaluations } }))).toThrow(/budget/i);
    expect(engine.natalChart).not.toHaveBeenCalled();
    expect(calcEngine.calc).not.toHaveBeenCalled();
    expect(calcEngine.houses).not.toHaveBeenCalled();
  });

  it("supports a single family and keeps exact pole metadata", () => {
    const options = { ...angular, bounds: { ...bounds, south: -90, north: 90 }, lines: ["IC"] as const };
    const output = executeJsonRequest("lines", JSON.stringify({ source: birth, mode: "angular", options }));
    expect(output).toMatchObject({ status: "ok", results: [{ lines: expect.arrayContaining([
      expect.objectContaining({ kind: "IC", samples: expect.arrayContaining([
        expect.objectContaining({ status: "undefined", reason: "geographic-pole" })]) })]) }] });
    expect("results" in output && output.results.length).toBe(1);
  });

  it("dispatches path, local-space and both grid modes without rounding outputs", () => {
    expect(json(executeJsonRequest("lines", JSON.stringify({ source: birth, mode: "path", options: path }))))
      .toEqual(json(pathCrossings(birth, path)));
    expect(json(executeJsonRequest("lines", JSON.stringify({ source: birth, mode: "local-space", options: local }))))
      .toEqual(json(localSpaceLines(birth, local)));
    expect(json(executeJsonRequest("grid", JSON.stringify({ source: birth, mode: "charts", options: charts }))))
      .toEqual(json(sampleGrid(birth, charts)));
    expect(json(executeJsonRequest("grid", JSON.stringify({ source: birth, mode: "crossings", options: crossingGrid }))))
      .toEqual(json(gridCrossings(birth, crossingGrid)));
  });

  it("preserves unknown-time refusals and discards earlier geometry after a family refusal", () => {
    expect(executeJsonRequest("lines", JSON.stringify({ source: { ...birth, timeKnown: false },
      mode: "angular", options: angular }))).toMatchObject({ status: "refused", reason: "unknown-time",
      results: [{ sampling: { samples: [], positions: [] }, lines: [] }] });
    // Artificial refusal, not a receipt or astronomical reference.
    const refused = originalCalc.calc({ body: "Sun", time: "2500-01-01T00:00:00Z" });
    if (refused.status !== "refused") throw new Error("Expected refusal");
    vi.mocked(calcEngine.calc).mockImplementationOnce(originalCalc.calc).mockImplementationOnce(originalCalc.calc)
      .mockReturnValueOnce(refused);
    const output = executeJsonRequest("lines", JSON.stringify({ source: birth, mode: "angular", options: angular }));
    expect(output).toMatchObject({ status: "refused", reason: "engine-refusal", results: [{ lines: [] }] });
    expect("results" in output && output.results).toHaveLength(1);
  });

  it.each([
    null, [], {}, { source: birth }, { source: birth, destination, extra: true },
    { source: { ...birth, timezone: "UTC" }, destination },
    { source: { ...birth, timeKnown: null }, destination },
    { source: { ...birth, houseSystem: "fake" }, destination },
    { source: { ...birth, utc: "2004-02-30T07:08Z" }, destination },
    { source: { ...birth, utc: "2004-05-06T07:08" }, destination },
    { source: { ...birth, utc: {} }, destination },
    { source: birth, destination: { latitude: 90, longitude: 0 } },
    { source: birth, destination: { latitude: "12", longitude: 0 } },
    { source: birth, destination: { ...destination, label: "extra" } }
  ])("rejects malformed chart requests %#", (request) => {
    expect(() => executeJsonRequest("chart", JSON.stringify(request))).toThrow();
  });

  it.each([
    { ...angular, lines: null }, { ...angular, bodies: null }, { ...angular, lines: [] },
    { ...angular, lines: ["MC", "MC"] }, { ...angular, lines: ["mc"] },
    { ...angular, bounds: { ...bounds, extra: 1 } }, { ...angular, latitudeStep: "5" },
    { ...angular, maxEvaluations: 4097 }, { ...angular, maxEvaluations: 1.5 },
    { ...angular, maxSamples: 20 }, { ...angular, latitudeStep: 0 },
    { ...angular, bounds: null }
  ])("rejects invalid angular options %# before engine work", (options) => {
    expect(() => executeJsonRequest("lines", JSON.stringify({ source: birth, mode: "angular", options }))).toThrow();
    expect(engine.natalChart).not.toHaveBeenCalled();
    expect(calcEngine.calc).not.toHaveBeenCalled();
  });

  it("requires explicit modes, steps and budgets, and rejects cross-mode options", () => {
    for (const command of ["lines", "grid"] as const) {
      for (const request of [{ source: birth, options: {} }, { source: birth, mode: "unknown", options: {} },
        { source: birth, mode: command === "grid" ? "charts" : "angular", options: { bounds } }]) {
        expect(() => executeJsonRequest(command, JSON.stringify(request))).toThrow();
      }
    }
    expect(() => executeJsonRequest("lines", JSON.stringify({ source: birth, mode: "path",
      options: { ...path, from: { ...path.from, label: "extra" } } }))).toThrow();
    expect(() => executeJsonRequest("grid", JSON.stringify({ source: birth, mode: "charts",
      options: { ...charts, bodies: ["Sun"] } }))).toThrow();
    expect(() => executeJsonRequest("grid", JSON.stringify({ source: birth, mode: "crossings",
      options: { ...crossingGrid, residualTolerance: null } }))).toThrow();
  });

  it("bounds JSON bytes and nesting, rejects duplicate escaped keys and malformed JSON", () => {
    expect(MAX_CLI_INPUT_BYTES).toBe(131_072);
    expect(MAX_CLI_JSON_DEPTH).toBe(32);
    const request = JSON.stringify({ source: birth, destination });
    expect(executeJsonRequest("chart", request.padEnd(MAX_CLI_INPUT_BYTES))).toEqual(relocateChart(birth, destination));
    expect(() => executeJsonRequest("chart", request.padEnd(MAX_CLI_INPUT_BYTES + 1))).toThrow(/byte limit/);
    expect(() => executeJsonRequest("chart", '"' + "é".repeat(MAX_CLI_INPUT_BYTES / 2) + '"')).toThrow(/byte limit/);
    expect(() => executeJsonRequest("chart", "[".repeat(33) + "0" + "]".repeat(33))).toThrow(/depth limit/);
    expect(() => executeJsonRequest("chart", '{"source":{},"sou\\u0072ce":{}}')).toThrow(/unique/);
    expect(() => executeJsonRequest("chart", '{"source":{"utc":1,"utc":2}}')).toThrow(/unique/);
    for (const bad of ["", "{", '"unfinished', "{} {}", "{\"x\":NaN}", "{\"x\":Infinity}", "\uFEFF{}"]) {
      expect(() => executeJsonRequest("chart", bad)).toThrow();
    }
    // JSON exponent overflow parses as Infinity, but never reaches the engine.
    expect(() => executeJsonRequest("chart", '{"source":{"utc":1e999},"destination":{"latitude":0,"longitude":0}}')).toThrow(/finite/);
  });
});
