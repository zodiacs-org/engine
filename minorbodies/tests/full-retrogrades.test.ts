import { expect, it } from "vitest";
import { createBodyAdapter } from "../src/body-adapter.ts";
import { MINOR_BODY_NAMES } from "../src/catalog.ts";
import { FULL_RECIPE } from "../src/full-recipe.ts";
import { loadFullBody } from "../src/full.ts";
import { createRetrogradeWindowSearcher } from "../src/retrogrades.ts";
import { checkRetrogradeAccuracy } from "./retrograde-accuracy-helper.ts";

// Missing full source bytes, coefficients or the independent reducer fails this gate.
it.each(MINOR_BODY_NAMES)("checks %s full-data retrograde windows against Horizons/ERFA and coverage handling", async body => {
  const ephemeris = await loadFullBody(body);
  const adapter = await createBodyAdapter([ephemeris]);
  const searcher = await createRetrogradeWindowSearcher(adapter);
  const checked = await checkRetrogradeAccuracy(body, adapter, searcher);
  if (body === "Pallas") {
    // The retained independent scan starts retrograde and contains its direct station.
    expect(checked.result.windows[0]).toMatchObject({ clippedStart: true, clippedEnd: false });
  }
  // These are loaded-coverage integration checks; the independent event corpus is above.
  for (const [from, to] of [
    [FULL_RECIPE.startJdTt, FULL_RECIPE.startJdTt + 1],
    [FULL_RECIPE.endJdTt - 1, FULL_RECIPE.endJdTt - FULL_RECIPE.finalHoldoutInsetDays]
  ] as const) {
    const result = searcher.searchRetrogradeWindows({ body,
      from: { jd: from, scale: "tt" }, to: { jd: to, scale: "tt" } });
    if (result.status !== "complete") throw new Error(`Coverage-edge search refused: ${result.reason}`);
    expect(result.receipt.stationSearch.dataset).toEqual(ephemeris.dataset);
    expect(result.receipt.endpoints.from?.jdTt).toBe(from);
    expect(result.receipt.endpoints.to?.jdTt).toBe(to);
    for (const window of result.windows) {
      expect(window.startJdTt).toBeGreaterThanOrEqual(from);
      expect(window.endJdTt).toBeLessThanOrEqual(to);
      expect(window.receipt.search).toBe(result.receipt);
      expect(window.clippedStart).toBe(window.receipt.startStation === null);
      expect(window.clippedEnd).toBe(window.receipt.endStation === null);
    }
  }
  for (const [from, to] of [
    [FULL_RECIPE.startJdTt - FULL_RECIPE.finalHoldoutInsetDays, FULL_RECIPE.startJdTt + 1],
    [FULL_RECIPE.endJdTt - 1, FULL_RECIPE.endJdTt]
  ] as const) {
    const result = searcher.searchRetrogradeWindows({ body,
      from: { jd: from, scale: "tt" }, to: { jd: to, scale: "tt" } });
    expect(result).toMatchObject({ status: "refused", reason: "outside-coverage", samples: 0, windows: [], stations: [] });
    expect(result.receipt.stationSearch.dataset).toEqual(ephemeris.dataset);
    expect(result.receipt.endpoints).toEqual({ from: null, to: null });
  }
}, 120_000);
