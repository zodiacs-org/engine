import { expect } from "vitest";
import type { BodyAdapter } from "../src/body-adapter.ts";
import { ACCEPTANCE_POLICY } from "../src/acceptance.ts";
import { readStationReference, STATION_REFERENCE_RECIPE } from "../src/station-reference.ts";
import type { StationSearcher } from "../src/stations.ts";
import type { MinorBody } from "../src/catalog.ts";

/** Independent expected brackets come only from held-out JPL positions and ERFA. */
export async function checkStationAccuracy(body: MinorBody, adapter: BodyAdapter, searcher: StationSearcher) {
  const reference = await readStationReference(body);
  const result = searcher.searchStations({ body,
    from: { jd: reference.recipe.startJdTt, scale: "tt" },
    to: { jd: reference.recipe.endJdTtExclusive - 1 / 86400, scale: "tt" },
    stepDays: 1, maxSamples: 10_000 });
  expect(result.status).toBe("complete");
  if (result.status !== "complete") throw new Error(`Station search refused: ${result.reason}`);
  expect(result.stations).toHaveLength(reference.events.length);
  const allowance = STATION_REFERENCE_RECIPE.stationAgreementMarginSeconds / 86400;
  let maximumLongitudeErrorArcsec = 0;
  let maximumSpeedErrorArcsecPerDay = 0;
  for (const [index, expected] of reference.events.entries()) {
    const actual = result.stations[index]!;
    expect(actual.direction).toBe(expected.direction);
    expect(actual.jdTt).toBeGreaterThanOrEqual(expected.bracketStartJdTt - allowance);
    expect(actual.jdTt).toBeLessThanOrEqual(expected.bracketEndJdTt + allowance);
    expect(actual.position.jdTt).toBe(actual.jdTt);
    expect(actual.receipt.search).toBe(result.receipt);
    const beforeSpeed = actual.receipt.before.longitudeSpeedDegPerDay;
    const afterSpeed = actual.receipt.after.longitudeSpeedDegPerDay;
    expect(beforeSpeed * afterSpeed).toBeLessThan(0);
    expect(beforeSpeed > 0 ? "direct-to-retrograde" : "retrograde-to-direct").toBe(expected.direction);
    for (const heldOut of [expected.before, expected.after]) {
      const sampled = adapter.calcWithMinorBodies({ body, time: { jd: heldOut.jdTt, scale: "tt" } });
      if (sampled.status !== "ok" || sampled.provider !== "minorbodies") throw new Error("Missing station-neighborhood position.");
      const position = sampled.result;
      const longitudeError = Math.abs(((position.longitudeDeg - heldOut.longitudeDeg + 540) % 360) - 180) * 3600;
      const speedError = Math.abs(position.longitudeSpeedDegPerDay - heldOut.fineLongitudeSpeedDegPerDay) * 3600;
      maximumLongitudeErrorArcsec = Math.max(maximumLongitudeErrorArcsec, longitudeError);
      maximumSpeedErrorArcsecPerDay = Math.max(maximumSpeedErrorArcsecPerDay, speedError);
      expect(longitudeError).toBeLessThanOrEqual(ACCEPTANCE_POLICY.limits.longitudeArcsec);
      expect(speedError).toBeLessThanOrEqual(ACCEPTANCE_POLICY.limits.longitudeSpeedArcsecPerDay);
      expect(position.receipt.dataset.sourceIdentity).toEqual(reference.sourceIdentity);
    }
  }
  return { reference, result, maximumLongitudeErrorArcsec, maximumSpeedErrorArcsecPerDay };
}
