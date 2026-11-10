import { beforeEach, describe, expect, it, vi } from "vitest";
import { natalChart } from "../src/engine.js";
import { cast } from "../src/index.js";
import type { HoraryInput } from "../src/index.js";
import { questionInput, schematicChart } from "./fixtures.js";

vi.mock("../src/engine.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../src/engine.js")>(),
  natalChart: vi.fn()
}));

beforeEach(() => vi.mocked(natalChart).mockReset());

describe("cast adapter", () => {
  it("forwards only normalized chart settings and preserves engine data", () => {
    const chart = schematicChart();
    vi.mocked(natalChart).mockReturnValue(chart);
    const result = cast({ ...questionInput, houseSystem: "whole" });
    expect(natalChart).toHaveBeenCalledTimes(1);
    expect(natalChart).toHaveBeenCalledWith({
      utc: "2000-01-01T12:00:00.000Z", latitude: 12, longitude: 34,
      houseSystem: "whole", timeKnown: true
    });
    expect(result.schema).toBe("horary.cast/v1");
    expect(result.chart).toEqual(chart);
    expect(result.chart.bodies).toBe(chart.bodies);
    expect(result.chart.houses).toBe(chart.houses);
    expect(result.chart.deltaT).toBe(chart.deltaT);
    expect(result.chart.timeScale).toBe(chart.timeScale);
    expect(result.chart.engineVersion).toBe("synthetic-adapter-fixture");
    expect(result.input.question).toEqual({ id: "lost-object", quesitedHouse: 2, naturalSignificators: [] });
  });

  it("keeps the requested system separate from an engine fallback", () => {
    const chart = schematicChart();
    chart.input.houseSystem = "placidus";
    chart.flags = ["polar-fallback"];
    vi.mocked(natalChart).mockReturnValue(chart);
    const result = cast({ ...questionInput, houseSystem: "placidus" });
    expect(result.input.houseSystem).toBe("placidus");
    expect(result.chart.houses.system).toBe("whole");
    expect(result.chart.flags).toEqual(["polar-fallback"]);
  });

  it("rejects invalid questions before astronomical computation", () => {
    expect(() => cast({ ...questionInput, question: { id: "invalid", quesitedHouse: 0 } } as unknown as HoraryInput))
      .toThrow(RangeError);
    expect(natalChart).not.toHaveBeenCalled();
  });

  it.each(["angles", "houses"] as const)("rejects an engine chart missing %s", (field) => {
    const chart = schematicChart();
    chart[field] = null;
    vi.mocked(natalChart).mockReturnValue(chart);
    expect(() => cast(questionInput)).toThrow("requires computed angles and houses");
  });
});
