import { it, expect } from "vitest";
import { createBodyAdapter } from "../src/body-adapter.ts";
import { createStationSearcher } from "../src/stations.ts";
import { loadFullBody } from "../src/full.ts";
import { MINOR_BODY_NAMES } from "../src/catalog.ts";
import { FULL_RECIPE } from "../src/full-recipe.ts";
import { checkStationAccuracy } from "./station-accuracy-helper.ts";

// Deliberate full-data gate: missing local source bytes or shards fails, never skips.
it.each(MINOR_BODY_NAMES)("checks %s full-data stations against held-out Horizons/ERFA and installed coverage edges", async body => {
  const ephemeris = await loadFullBody(body);
  const adapter = await createBodyAdapter([ephemeris]);
  const searcher = await createStationSearcher(adapter);
  await checkStationAccuracy(body, adapter, searcher);
  for (const [from, to] of [
    [FULL_RECIPE.startJdTt, FULL_RECIPE.startJdTt + 1],
    [FULL_RECIPE.endJdTt - 1, FULL_RECIPE.endJdTt - 1 / 86400]
  ]) {
    const result = searcher.searchStations({ body, from: { jd: from!, scale: "tt" }, to: { jd: to!, scale: "tt" } });
    expect(result.status).toBe("complete");
    expect(result.receipt.dataset).toEqual(ephemeris.dataset);
  }
  expect(searcher.searchStations({ body,
    from: { jd: FULL_RECIPE.endJdTt - 1, scale: "tt" }, to: { jd: FULL_RECIPE.endJdTt, scale: "tt" }
  })).toMatchObject({ status: "refused", reason: "outside-coverage", samples: 0, stations: [] });
}, 120_000);
