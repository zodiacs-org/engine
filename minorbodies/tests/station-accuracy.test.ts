import { expect, it } from "vitest";
import { validatePilot } from "../scripts/validate-pilot.ts";
import { createBodyAdapter } from "../src/body-adapter.ts";
import { createStationSearcher } from "../src/stations.ts";
import { checkStationAccuracy } from "./station-accuracy-helper.ts";

it("checks both Chiron station directions against independent held-out Horizons/ERFA brackets in calendar 2000 TT", async () => {
  const { ephemeris } = await validatePilot();
  const adapter = await createBodyAdapter([ephemeris]);
  const checked = await checkStationAccuracy("Chiron", adapter, await createStationSearcher(adapter));
  expect(checked.result.stations.map(event => event.direction).sort()).toEqual(["direct-to-retrograde", "retrograde-to-direct"]);
}, 60_000);
