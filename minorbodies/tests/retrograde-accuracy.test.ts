import { expect, it } from "vitest";
import { validatePilot } from "../scripts/validate-pilot.ts";
import { createBodyAdapter } from "../src/body-adapter.ts";
import { createRetrogradeWindowSearcher } from "../src/retrogrades.ts";
import { checkRetrogradeAccuracy } from "./retrograde-accuracy-helper.ts";

it("checks Chiron retrograde extents and adjacent clipping against held-out Horizons/ERFA in calendar 2000 TT", async () => {
  const { ephemeris } = await validatePilot();
  const adapter = await createBodyAdapter([ephemeris]);
  const checked = await checkRetrogradeAccuracy("Chiron", adapter, await createRetrogradeWindowSearcher(adapter));
  expect(checked.result.windows).toHaveLength(1);
  expect(checked.result.windows[0]).toMatchObject({ clippedStart: false, clippedEnd: false });
}, 60_000);
