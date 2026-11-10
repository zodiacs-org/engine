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

it("runs spectra and complete dial analysis without importing chart casting or the ephemeris", async () => {
  const { parseCliArguments, executeSpectrum, executeDial } = await import("../src/cli.js");
  const { parseChartRequest } = await import("../src/cli-input.js");
  const request = parseChartRequest(Buffer.from(JSON.stringify({ points: [
    { body: "Sun", lon: 0, speed: 0 }, { body: "Moon", lon: 180, speed: 0 }
  ] })));
  const spectrum = parseCliArguments(["spectrum", "--input", "-", "--harmonics", "2"]);
  const dial = parseCliArguments(["dial", "--input", "-"]);
  if (typeof spectrum === "string" || spectrum.command !== "spectrum" ||
    typeof dial === "string" || dial.command !== "dial") throw new Error("Expected analysis args");
  // N=2 maps both to 0; the 180-degree gap also folds to 0 on the default dial.
  expect(await executeSpectrum(request, spectrum)).toMatchObject({
    sourceMode: "points", spectrum: { rows: [{ harmonic: 2, score: 1 }] }
  });
  expect(await executeDial(request, dial)).toMatchObject({
    sourceMode: "points", planetaryPictures: { dial: { contacts: [{ a: "Moon", b: "Sun", orb: 0 }] } },
    midpointTrees: { midpoints: [{ members: ["Moon", "Sun"], antipodal: true }] }
  });
});
