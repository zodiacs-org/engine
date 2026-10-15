import { readFile } from "node:fs/promises";
import { expect } from "vitest";
import { ACCEPTANCE_POLICY } from "../src/acceptance.ts";
import type { BodyAdapter } from "../src/body-adapter.ts";
import type { MinorBody } from "../src/catalog.ts";
import { decodeHorizonsFileCapture, makeHorizonsFileRequest } from "../src/horizons-file.ts";
import { reduceWithIndependentErfa } from "../src/pilot-validation.ts";
import type { RetrogradeWindowSearcher } from "../src/retrogrades.ts";
import {
  readStationReference, STATION_REFERENCE_RECIPE, stationReferenceBrackets,
  stationReferenceEpochs, stationReferenceRates, stationScanCenters
} from "../src/station-reference.ts";
import type { StationReferenceRate } from "../src/station-reference.ts";

type Reference = Awaited<ReturnType<typeof readStationReference>>;
type ReferenceEvent = Reference["events"][number];
interface ReferenceEpisode {
  start: ReferenceEvent | null;
  end: ReferenceEvent | null;
  firstNegative: StationReferenceRate;
  lastNegative: StationReferenceRate;
}

/** Reuses original verified sources, never fitted values, to choose signs and endpoints. */
async function readWindowReference(body: MinorBody) {
  const reference = await readStationReference(body);
  const centers = stationScanCenters();
  const recipe = STATION_REFERENCE_RECIPE;
  const request = makeHorizonsFileRequest(body,
    stationReferenceEpochs(centers, recipe.scanFineStepDays, recipe.scanCoarseStepDays));
  const encoded = await readFile(new URL(`fixtures/stations/${body.toLowerCase()}/scan.json`, import.meta.url), "utf8");
  const capture = decodeHorizonsFileCapture(encoded, request);
  const source = reference.sources.find(item => item.name === "scan")!;
  expect(capture.manifest.requestSha256).toBe(source.requestSha256);
  expect(capture.manifest.responseSha256).toBe(source.responseSha256);
  expect(capture.response.identity).toEqual(reference.sourceIdentity);
  const reduced = await reduceWithIndependentErfa(capture.response.rows);
  expect(reduced.reference).toEqual(reference.reference);
  const scan = stationReferenceRates(reduced.samples, centers, recipe.scanFineStepDays, recipe.scanCoarseStepDays)
    .filter(row => row.jdTt >= recipe.startJdTt && row.jdTt < recipe.endJdTtExclusive);
  const scannedBrackets = stationReferenceBrackets(scan);
  expect(scannedBrackets.map(bracket => bracket.direction)).toEqual(reference.events.map(event => event.direction));
  for (const [index, bracket] of scannedBrackets.entries()) {
    const event = reference.events[index]!;
    expect(event.bracketStartJdTt).toBeGreaterThanOrEqual(bracket.before.jdTt);
    expect(event.bracketEndJdTt).toBeLessThanOrEqual(bracket.after.jdTt);
  }

  // Each interval between independent station brackets has its own sampled sign.
  // The expected windows are negative phases, without consulting the package search.
  const episodes: ReferenceEpisode[] = [];
  for (let index = 0; index <= reference.events.length; index++) {
    const start = reference.events[index - 1] ?? null;
    const end = reference.events[index] ?? null;
    const inside = scan.filter(row => row.jdTt > (start?.bracketEndJdTt ?? -Infinity) &&
      row.jdTt < (end?.bracketStartJdTt ?? Infinity));
    expect(inside.length).toBeGreaterThan(0);
    const signs = new Set(inside.map(row => Math.sign(row.fineLongitudeSpeedDegPerDay)));
    expect(signs.size).toBe(1);
    expect(signs.has(0)).toBe(false);
    if (signs.has(-1)) {
      expect(start?.direction ?? "direct-to-retrograde").toBe("direct-to-retrograde");
      expect(end?.direction ?? "retrograde-to-direct").toBe("retrograde-to-direct");
      episodes.push({ start, end, firstNegative: inside[0]!, lastNegative: inside.at(-1)! });
    }
  }
  expect(episodes.length).toBeGreaterThan(0);
  return { reference, scan, episodes };
}

/** Finite calendar-2000 checks, not full-range event completeness or physical orbit bounds. */
export async function checkRetrogradeAccuracy(body: MinorBody, adapter: BodyAdapter, searcher: RetrogradeWindowSearcher) {
  const { reference, scan, episodes } = await readWindowReference(body);
  const allowance = STATION_REFERENCE_RECIPE.stationAgreementMarginSeconds / 86400;
  const first = scan[0]!;
  const last = scan.at(-1)!;
  const checkedEpochs = new Set<number>();
  let maximumLongitudeErrorArcsec = 0;
  let maximumSpeedErrorArcsecPerDay = 0;

  const checkReferencePosition = (heldOut: StationReferenceRate) => {
    if (checkedEpochs.has(heldOut.jdTt)) return;
    expect(heldOut.convergenceArcsecPerDay).toBeLessThanOrEqual(
      STATION_REFERENCE_RECIPE.maxReferenceLongitudeSpeedDifferenceArcsecPerDay);
    const sampled = adapter.calcWithMinorBodies({ body, time: { jd: heldOut.jdTt, scale: "tt" } });
    if (sampled.status !== "ok" || sampled.provider !== "minorbodies") throw new Error("Missing held-out retrograde position.");
    const longitudeError = Math.abs(((sampled.result.longitudeDeg - heldOut.longitudeDeg + 540) % 360) - 180) * 3600;
    const speedError = Math.abs(sampled.result.longitudeSpeedDegPerDay - heldOut.fineLongitudeSpeedDegPerDay) * 3600;
    maximumLongitudeErrorArcsec = Math.max(maximumLongitudeErrorArcsec, longitudeError);
    maximumSpeedErrorArcsecPerDay = Math.max(maximumSpeedErrorArcsecPerDay, speedError);
    expect(longitudeError).toBeLessThanOrEqual(ACCEPTANCE_POLICY.limits.longitudeArcsec);
    expect(speedError).toBeLessThanOrEqual(ACCEPTANCE_POLICY.limits.longitudeSpeedArcsecPerDay);
    expect(sampled.result.receipt.dataset.sourceIdentity).toEqual(reference.sourceIdentity);
    if (Math.abs(heldOut.fineLongitudeSpeedDegPerDay) * 3600 > ACCEPTANCE_POLICY.limits.longitudeSpeedArcsecPerDay) {
      expect(sampled.result.retrograde).toBe(heldOut.fineLongitudeSpeedDegPerDay < 0);
    }
    checkedEpochs.add(heldOut.jdTt);
  };
  const checkBoundary = (actual: number, expected: ReferenceEvent) => {
    expect(actual).toBeGreaterThanOrEqual(expected.bracketStartJdTt - allowance);
    expect(actual).toBeLessThanOrEqual(expected.bracketEndJdTt + allowance);
  };
  const checkSearch = (from: StationReferenceRate, to: StationReferenceRate) => {
    // Endpoints are reference samples with an unambiguous sign under the original gate.
    for (const row of [from, to]) {
      expect(Math.abs(row.fineLongitudeSpeedDegPerDay) * 3600)
        .toBeGreaterThan(ACCEPTANCE_POLICY.limits.longitudeSpeedArcsecPerDay);
      checkReferencePosition(row);
      for (const event of reference.events) {
        expect(row.jdTt < event.bracketStartJdTt - allowance || row.jdTt > event.bracketEndJdTt + allowance).toBe(true);
      }
    }
    const result = searcher.searchRetrogradeWindows({ body,
      from: { jd: from.jdTt, scale: "tt" }, to: { jd: to.jdTt, scale: "tt" }, stepDays: 1, maxSamples: 10_000 });
    if (result.status !== "complete") throw new Error(`Retrograde search refused: ${result.reason}`);
    const expectedEvents = reference.events.filter(event => event.bracketStartJdTt > from.jdTt && event.bracketEndJdTt < to.jdTt);
    expect(result.stations).toHaveLength(expectedEvents.length);
    for (const [index, expected] of expectedEvents.entries()) {
      const actual = result.stations[index]!;
      expect(actual.direction).toBe(expected.direction);
      checkBoundary(actual.jdTt, expected);
      expect(actual.receipt.search).toBe(result.receipt.stationSearch);
      checkReferencePosition(expected.before);
      checkReferencePosition(expected.after);
    }
    const expectedEpisodes = episodes.filter(episode =>
      (episode.start?.jdTt ?? first.jdTt) < to.jdTt && (episode.end?.jdTt ?? last.jdTt) > from.jdTt);
    expect(result.windows).toHaveLength(expectedEpisodes.length);
    for (const [index, expected] of expectedEpisodes.entries()) {
      const actual = result.windows[index]!;
      const start = expected.start !== null && expected.start.bracketStartJdTt > from.jdTt ? expected.start : null;
      const end = expected.end !== null && expected.end.bracketEndJdTt < to.jdTt ? expected.end : null;
      expect(actual.body).toBe(body);
      expect(actual.startJdTt).toBeLessThan(actual.endJdTt);
      expect(actual.clippedStart).toBe(start === null);
      expect(actual.clippedEnd).toBe(end === null);
      expect(actual.receipt.search).toBe(result.receipt);
      if (start) {
        checkBoundary(actual.startJdTt, start);
        expect(actual.receipt.startStation).toBe(result.stations[expectedEvents.indexOf(start)]);
        expect(actual.startJdTt).toBe(actual.receipt.startStation!.jdTt);
      } else {
        expect(actual.startJdTt).toBe(from.jdTt);
        expect(actual.receipt.startStation).toBeNull();
      }
      if (end) {
        checkBoundary(actual.endJdTt, end);
        expect(actual.receipt.endStation).toBe(result.stations[expectedEvents.indexOf(end)]);
        expect(actual.endJdTt).toBe(actual.receipt.endStation!.jdTt);
      } else {
        expect(actual.endJdTt).toBe(to.jdTt);
        expect(actual.receipt.endStation).toBeNull();
      }
    }
    for (const [key, expected] of [["from", from], ["to", to]] as const) {
      const actual = result.receipt.endpoints[key]!;
      expect(actual.jdTt).toBe(expected.jdTt);
      expect(actual.receipt.time?.jdTt).toBe(expected.jdTt);
      expect(actual.receipt.dataset?.sourceIdentity).toEqual(reference.sourceIdentity);
      expect(Math.abs(actual.longitudeSpeedDegPerDay - expected.fineLongitudeSpeedDegPerDay) * 3600)
        .toBeLessThanOrEqual(ACCEPTANCE_POLICY.limits.longitudeSpeedArcsecPerDay);
    }
    expect(result.receipt.initialProbe).toBeNull();
    expect(result.samples).toBe(result.receipt.samples);
    expect(result.samples).toBe(result.receipt.stationSearch.samples + 2);
    return result;
  };

  const result = checkSearch(first, last);
  // Pick an interior split from original negative scan samples, never found event times.
  const episode = episodes[0]!;
  const negative = scan.filter(row => row.jdTt >= episode.firstNegative.jdTt && row.jdTt <= episode.lastNegative.jdTt);
  expect(negative.length).toBeGreaterThanOrEqual(5);
  const clippedFrom = negative[Math.floor(negative.length / 4)]!;
  const split = negative[Math.floor(negative.length / 2)]!;
  const clippedTo = negative[Math.floor(negative.length * 3 / 4)]!;
  const clipped = checkSearch(clippedFrom, clippedTo);
  expect(clipped.windows).toHaveLength(1);
  expect(clipped.windows[0]).toMatchObject({ clippedStart: true, clippedEnd: true });
  const left = checkSearch(first, split);
  const right = checkSearch(split, last);
  expect(left.windows.at(-1)).toMatchObject({ endJdTt: split.jdTt, clippedEnd: true });
  expect(right.windows[0]).toMatchObject({ startJdTt: split.jdTt, clippedStart: true });
  expect(left.stations.length + right.stations.length).toBe(result.stations.length);

  const directPair = scan.findIndex((row, index) => row.fineLongitudeSpeedDegPerDay > 0 &&
    scan[index + 1] !== undefined && scan[index + 1]!.fineLongitudeSpeedDegPerDay > 0);
  expect(directPair).toBeGreaterThanOrEqual(0);
  expect(checkSearch(scan[directPair]!, scan[directPair + 1]!).windows).toEqual([]);
  expect(searcher.searchRetrogradeWindows({ body,
    from: { jd: first.jdTt, scale: "tt" }, to: { jd: last.jdTt, scale: "tt" }, maxSamples: 1
  })).toMatchObject({ status: "refused", reason: "sample-budget", windows: [], stations: [] });
  return { reference, result, clipped, left, right, maximumLongitudeErrorArcsec, maximumSpeedErrorArcsecPerDay };
}
