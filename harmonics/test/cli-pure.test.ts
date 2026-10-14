import { expect, it, vi } from "vitest";

vi.mock("../../src/api.js", () => { throw new Error("Supplied CLI points loaded the chart API."); });
vi.mock("astronomy-engine", () => { throw new Error("Supplied CLI points loaded the ephemeris."); });

it("runs the supplied-point command without loading the casting adapter", async () => {
  const { parseChartArguments, executeChart } = await import("../src/cli.js");
  const { parseChartRequest } = await import("../src/cli-input.js");
  const args = parseChartArguments(["chart", "--input", "-", "--harmonic", "2"]);
  if (args === "help") throw new Error("Expected chart arguments");
  const request = parseChartRequest(Buffer.from('{"points":[{"body":"A","lon":-0.5}]}'));
  // -1 mod 360 = 359, after source normalization to 359.5 and multiplication by 2.
  expect(await executeChart(request, args)).toMatchObject({
    sourceMode: "points", harmonicChart: { points: [{ body: "A", sourceLon: 359.5, lon: 359 }] }
  });
});
