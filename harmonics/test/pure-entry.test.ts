import { expect, it, vi } from "vitest";

// Importing the default entry must not load the optional pattern detector's
// chart dependency. A factory that throws makes accidental graph expansion fail.
vi.mock("../../src/api.js", () => { throw new Error("Pure entry loaded the engine chart API."); });
vi.mock("astronomy-engine", () => { throw new Error("Pure entry loaded the ephemeris."); });

it("keeps the default longitude and aspect entry free of casting and ephemeris imports", async () => {
  const { harmonicChart, findHarmonicAspects, harmonicSpectrum, projectDial, dialDistance,
    findPlanetaryPictures } = await import("../src/index.js");
  // Twice 0 and 180 reduces to two zero longitudes, an exact conjunction.
  const points = [{ body: "Sun", lon: 0, speed: 0 }, { body: "Moon", lon: 180, speed: 0 }];
  expect(harmonicChart(points, 2).points.map((point) => point.lon)).toEqual([0, 0]);
  expect(findHarmonicAspects(points, 2).analysis.aspects).toMatchObject([
    { a: "Sun", b: "Moon", type: "conjunction", orb: 0 }
  ]);
  expect(harmonicSpectrum(points, { harmonics: [2] }).rows[0]!.score).toBe(1);
  // 180 is two 90-degree sectors, so these source points coincide on the dial.
  expect(projectDial(points).contacts).toEqual([{ a: "Moon", b: "Sun", orb: 0 }]);
  expect(dialDistance(0, 180)).toBe(0);
  // Moon+Moon-Sun=360 -> 0, contacting Sun on the dial in doubled mode.
  expect(findPlanetaryPictures(points, 90, { repeatedMembers: "doubled", contactOrb: 0 }).pictures)
    .toMatchObject([{ left: ["Moon", "Moon"], right: ["Sun", "Sun"], orb: 0 }]);
});
