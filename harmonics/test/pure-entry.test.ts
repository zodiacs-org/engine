import { expect, it, vi } from "vitest";

// Importing the default entry must not load the optional pattern detector's
// chart dependency. A factory that throws makes accidental graph expansion fail.
vi.mock("../../src/api.js", () => { throw new Error("Pure entry loaded the engine chart API."); });
vi.mock("astronomy-engine", () => { throw new Error("Pure entry loaded the ephemeris."); });

it("keeps the default longitude and aspect entry free of casting and ephemeris imports", async () => {
  const { harmonicChart, findHarmonicAspects } = await import("../src/index.js");
  // Twice 0 and 180 reduces to two zero longitudes, an exact conjunction.
  const points = [{ body: "Sun", lon: 0, speed: 0 }, { body: "Moon", lon: 180, speed: 0 }];
  expect(harmonicChart(points, 2).points.map((point) => point.lon)).toEqual([0, 0]);
  expect(findHarmonicAspects(points, 2).analysis.aspects).toMatchObject([
    { a: "Sun", b: "Moon", type: "conjunction", orb: 0 }
  ]);
});
