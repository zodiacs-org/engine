/**
 * A regression case the owner asked for: on the package's default source,
 * the shipped DE440 pack, the Sun enters Sagittarius (apparent longitude
 * 240° in the true ecliptic of date) on 2026-11-22 at 07:23:21 UTC, to the
 * second. The reference is NAIF's de440.bsp, reduced independently by the
 * rc.11 review (docs/evidence/1.1.0-rc.11-20261115/breaker/results/ingress-ref.json:
 * 07:23:20.563 UTC, with TT − UTC = 69.184 s); astronomy-engine, the fallback,
 * gives 07:23:38. Every function that finds it on the default path must give
 * it within a second: a bisection of positions(), the crossing searches, the
 * solar-return search, and calc()'s events. The Sun's place has no light
 * deflection, so 1.1.0-rc.12's change behind the solar disc leaves it as it was.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { events } from "./calc.js";
import { positions, setDefaultEphemeris } from "./index.js";
import { findLongitudeCrossings, searchLongitudeCrossings } from "./returns.js";
import { solarReturnInstantDetailed } from "./techniques.js";

const INGRESS = Date.parse("2026-11-22T07:23:21Z");
const FROM = "2026-11-20T00:00:00Z";
const TO = "2026-11-24T00:00:00Z";

// The suite's setup puts every file on astronomy-engine; this one tests the package's default.
beforeAll(() => setDefaultEphemeris("de440"));
afterAll(() => setDefaultEphemeris("astronomy-engine"));

describe("the Sun's ingress into Sagittarius in 2026, on the shipped DE440 pack", () => {
  it("is 07:23:21 UTC within a second by a bisection of positions(), named jpl-de440", () => {
    const sun = (ms: number) => positions(new Date(ms)).find((row) => row.body === "Sun")!;
    let [a, b] = [Date.parse(FROM), Date.parse(TO)];
    expect(sun(a).lon).toBeLessThan(240);
    expect(sun(b).lon).toBeGreaterThan(240);
    while (b - a > 1) {
      const middle = Math.floor((a + b) / 2);
      if (sun(middle).lon < 240) a = middle;
      else b = middle;
    }
    expect(Math.abs(b - INGRESS)).toBeLessThanOrEqual(1000);
    expect(sun(b).ephemeris).toBe("jpl-de440");
  });

  it("is found within a second by the crossing searches, the solar-return search and calc()'s events", () => {
    const found = findLongitudeCrossings("Sun", 240, FROM, TO);
    expect(found).toHaveLength(1);
    expect(Math.abs(found[0]!.at.getTime() - INGRESS)).toBeLessThanOrEqual(1000);

    const searched = searchLongitudeCrossings("Sun", 240, FROM, TO);
    expect(searched.status).toBe("complete");
    if (searched.status !== "complete") return;
    expect(searched.flags).toEqual([]);
    expect(Math.abs(searched.crossings[0]!.at.getTime() - INGRESS)).toBeLessThanOrEqual(1000);

    const solar = solarReturnInstantDetailed(240, "2026-11-22T00:00:00Z");
    expect(solar.ephemeris.name).toBe("jpl-de440");
    expect(solar.flags).toEqual([]);
    expect(Math.abs(solar.value.getTime() - INGRESS)).toBeLessThanOrEqual(1000);

    const listed = events({ kind: "longitude-crossing", body: "Sun", longitude: 240, from: FROM, to: TO });
    expect(listed.status).toBe("ok");
    if (listed.status !== "ok") return;
    expect(listed.receipt.engine.ephemeris.name).toBe("jpl-de440");
    expect(listed.events).toHaveLength(1);
    expect(Math.abs(Date.parse(listed.events[0]!.at) - INGRESS)).toBeLessThanOrEqual(1000);
  });
});
