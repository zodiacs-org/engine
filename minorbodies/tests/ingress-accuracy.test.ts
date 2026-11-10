import { expect, it } from "vitest";
import { validatePilot } from "../scripts/validate-pilot.ts";
import { createBodyAdapter } from "../src/body-adapter.ts";
import { createIngressSearcher } from "../src/ingresses.ts";
import { checkIngressAccuracy } from "./ingress-accuracy-helper.ts";

it("checks the Chiron pilot's empty ingress scan against independent held-out calendar-2000 Horizons/ERFA positions", async () => {
  const { ephemeris } = await validatePilot();
  const adapter = await createBodyAdapter([ephemeris]);
  const checked = await checkIngressAccuracy("Chiron", adapter, await createIngressSearcher(adapter));
  expect(checked.result.ingresses).toEqual([]);
  expect(checked.reference.scan).toHaveLength(366);
}, 60_000);
