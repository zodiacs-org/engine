import { it, expect } from "vitest";
import { createBodyAdapter } from "../src/body-adapter.ts";
import { createIngressSearcher } from "../src/ingresses.ts";
import { loadFullBody } from "../src/full.ts";
import { MINOR_BODY_NAMES } from "../src/catalog.ts";
import { FULL_RECIPE } from "../src/full-recipe.ts";
import { checkIngressAccuracy } from "./ingress-accuracy-helper.ts";

// Missing local source captures or coefficients fails this explicit full-data gate.
it.each(MINOR_BODY_NAMES)("checks %s full-data sign ingresses against held-out Horizons/ERFA and installed coverage edges", async body => {
  const ephemeris = await loadFullBody(body);
  const adapter = await createBodyAdapter([ephemeris]);
  const searcher = await createIngressSearcher(adapter);
  const checked = await checkIngressAccuracy(body, adapter, searcher);
  if (body === "Vesta") {
    expect(checked.result.ingresses.filter(event => event.longitudeDeg === 300).map(event => event.direction)).toEqual(["direct", "retrograde", "direct"]);
  }
  for (const [from, to] of [
    [FULL_RECIPE.startJdTt, FULL_RECIPE.startJdTt + 1],
    [FULL_RECIPE.endJdTt - 1, FULL_RECIPE.endJdTt - 1 / 86400]
  ]) {
    const result = searcher.searchIngresses({ body, from: { jd: from!, scale: "tt" }, to: { jd: to!, scale: "tt" } });
    expect(result.status).toBe("complete");
    expect(result.receipt.dataset).toEqual(ephemeris.dataset);
  }
  expect(searcher.searchIngresses({ body,
    from: { jd: FULL_RECIPE.endJdTt - 1, scale: "tt" }, to: { jd: FULL_RECIPE.endJdTt, scale: "tt" }
  })).toMatchObject({ status: "refused", reason: "outside-coverage", samples: 0, ingresses: [] });
}, 120_000);
