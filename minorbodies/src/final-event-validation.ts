/** M11 finite event comparisons with independent Horizons/ERFA brackets. */
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { ACCEPTANCE_POLICY } from "./acceptance.ts";
import { sha256 } from "./horizons-client.ts";
import { createBodyAdapter } from "./body-adapter.ts";
import type { BodyAdapter } from "./body-adapter.ts";
import { loadFullBody } from "./full.ts";
import type { MinorBody } from "./catalog.ts";
import { createStationSearcher } from "./stations.ts";
import type { StationEvent, StationSearcher } from "./stations.ts";
import { createRetrogradeWindowSearcher } from "./retrogrades.ts";
import type { RetrogradeWindowSearcher } from "./retrogrades.ts";
import { createIngressSearcher } from "./ingresses.ts";
import type { IngressSearcher } from "./ingresses.ts";
import { readFinalEventReference, FINAL_EVENT_RECIPE, finalEventWindows } from "./final-event-reference.ts";
import type { FinalEventReference } from "./final-event-reference.ts";
import type { StationReferenceRate } from "./station-reference.ts";
import type { IndependentEclipticRow } from "./pilot-validation.ts";
import type { EngineSourceIdentity } from "./engine-identity.ts";

type ReferenceStation = FinalEventReference["windows"][number]["stations"][number];
type Bracket = Readonly<{ bracketStartJdTt: number; bracketEndJdTt: number }>;
const angularError = (actual: number, expected: number) => Math.abs(((actual - expected + 540) % 360 + 360) % 360 - 180) * 3600;

/** Distance to a reference interval, not the unknown exact physical event time. */
export function finalEventOutsideBracketSeconds(jdTt: number, bracket: Bracket) {
  assert(Number.isFinite(jdTt) && Number.isFinite(bracket.bracketStartJdTt) && Number.isFinite(bracket.bracketEndJdTt) &&
    bracket.bracketStartJdTt < bracket.bracketEndJdTt, "Invalid event agreement bracket.");
  return Math.max(bracket.bracketStartJdTt - jdTt, jdTt - bracket.bracketEndJdTt, 0) * 86400;
}

export function measureFinalEventAccuracy(reference: FinalEventReference, adapter: BodyAdapter,
  stationSearcher: StationSearcher, retrogradeSearcher: RetrogradeWindowSearcher, ingressSearcher: IngressSearcher) {
  assert.deepEqual(reference.recipe, FINAL_EVENT_RECIPE);
  const expectedWindows = finalEventWindows();
  assert.deepEqual(reference.windows.map(window => [window.year, window.fromJdTt, window.toJdTt]),
    expectedWindows.map(window => [window.year, window.fromJdTt, window.toJdTt]), "Incomplete final event windows.");
  const failures: string[] = [];
  const maxima = { longitudeArcsec: 0, latitudeArcsec: 0, distanceAu: 0,
    longitudeSpeedArcsecPerDay: 0, referenceSpeedConvergenceArcsecPerDay: 0,
    stationOutsideBracketSeconds: 0, ingressOutsideBracketSeconds: 0, retrogradeOutsideBracketSeconds: 0,
    referenceBracketSeconds: 0 };
  const counts = { positions: 0, speeds: 0, stationEvents: 0, ingressEvents: 0,
    retrogradeWindows: 0, referenceStations: 0, referenceIngresses: 0, directSamples: 0, retrogradeSamples: 0 };
  const summaries = [];
  let searchImplementations: Readonly<Record<string, EngineSourceIdentity>> | undefined;
  const record = (condition: boolean, message: string) => { if (!condition) failures.push(message); };
  const update = (key: keyof typeof maxima, value: number, context: string) => {
    if (!Number.isFinite(value) || value < 0) failures.push(`${context}: invalid ${key} measurement`);
    else maxima[key] = Math.max(maxima[key], value);
  };
  const positionEpochs = new Set<number>();
  const speedEpochs = new Set<number>();
  const positionAt = (row: Pick<IndependentEclipticRow, "jdTt" | "longitudeDeg"> & Partial<IndependentEclipticRow>) => {
    const sampled = adapter.calcWithMinorBodies({ body: reference.body, time: { jd: row.jdTt, scale: "tt" } });
    if (sampled.status !== "ok" || sampled.provider !== "minorbodies") {
      failures.push(`position refused at TT JD ${row.jdTt}`); return null;
    }
    const actual = sampled.result;
    const finite = [actual.jdTt, actual.longitudeDeg, actual.latitudeDeg, actual.distanceAu,
      actual.longitudeSpeedDegPerDay, actual.latitudeSpeedDegPerDay, actual.distanceSpeedAuPerDay].every(Number.isFinite);
    record(finite && actual.longitudeDeg >= 0 && actual.longitudeDeg < 360 && Math.abs(actual.latitudeDeg) <= 90 &&
      actual.distanceAu > 0 && actual.jdTt === row.jdTt && actual.retrograde === (actual.longitudeSpeedDegPerDay < 0),
    `invalid measured position at TT JD ${row.jdTt}`);
    record(JSON.stringify(actual.receipt.dataset.sourceIdentity) === JSON.stringify(reference.sourceIdentity),
      `source identity differs at TT JD ${row.jdTt}`);
    update("longitudeArcsec", angularError(actual.longitudeDeg, row.longitudeDeg), `${row.jdTt}`);
    if (row.latitudeDeg !== undefined) update("latitudeArcsec", Math.abs(actual.latitudeDeg - row.latitudeDeg) * 3600, `${row.jdTt}`);
    if (row.distanceAu !== undefined) update("distanceAu", Math.abs(actual.distanceAu - row.distanceAu), `${row.jdTt}`);
    if (!positionEpochs.has(row.jdTt)) { positionEpochs.add(row.jdTt); counts.positions++; }
    return actual;
  };
  const speedAt = (row: StationReferenceRate) => {
    update("referenceSpeedConvergenceArcsecPerDay", row.convergenceArcsecPerDay, `${row.jdTt}`);
    const actual = positionAt(row);
    if (!actual) return;
    update("longitudeSpeedArcsecPerDay", Math.abs(actual.longitudeSpeedDegPerDay - row.fineLongitudeSpeedDegPerDay) * 3600, `${row.jdTt}`);
    if (!speedEpochs.has(row.jdTt)) {
      speedEpochs.add(row.jdTt); counts.speeds++;
      if (Math.abs(row.fineLongitudeSpeedDegPerDay) * 3600 > ACCEPTANCE_POLICY.limits.longitudeSpeedArcsecPerDay) {
        record(actual.retrograde === (row.fineLongitudeSpeedDegPerDay < 0), `independent motion differs at TT JD ${row.jdTt}`);
        if (row.fineLongitudeSpeedDegPerDay < 0) counts.retrogradeSamples++; else counts.directSamples++;
      }
    }
  };
  const checkStation = (actual: StationEvent, expected: ReferenceStation, context: string,
    metric: "stationOutsideBracketSeconds" | "retrogradeOutsideBracketSeconds") => {
    record(actual.direction === expected.direction, `${context}: station direction differs`);
    update(metric, finalEventOutsideBracketSeconds(actual.jdTt, expected), context);
    record(actual.receipt.before.longitudeSpeedDegPerDay * actual.receipt.after.longitudeSpeedDegPerDay < 0,
      `${context}: station lacks opposite direction evidence`);
    record(actual.position.jdTt === actual.jdTt, `${context}: station position clock differs`);
  };
  for (const [windowIndex, window] of reference.windows.entries()) {
    const context = `${reference.body} ${window.year}`;
    assert.deepEqual(window.scan.map(row => row.jdTt), expectedWindows[windowIndex]!.centers, "Incomplete independent event position scan.");
    assert.deepEqual(window.scanRates.map(row => row.jdTt), expectedWindows[windowIndex]!.centers, "Incomplete independent event speed scan.");
    for (const row of window.scan) positionAt(row);
    for (const row of window.scanRates) speedAt(row);
    for (const expected of window.stations) {
      update("referenceBracketSeconds", expected.widthSeconds, context);
      speedAt(expected.before); speedAt(expected.after);
    }
    for (const expected of window.ingresses) {
      update("referenceBracketSeconds", expected.widthSeconds, context);
      positionAt(expected.before); positionAt(expected.after);
      speedAt(expected.beforeRate); speedAt(expected.afterRate);
    }
    counts.referenceStations += window.stations.length;
    counts.referenceIngresses += window.ingresses.length;
    const request = { body: reference.body, from: { jd: window.fromJdTt, scale: "tt" as const },
      to: { jd: window.toJdTt, scale: "tt" as const }, stepDays: 1, maxSamples: 20_000 };
    const stationResult = stationSearcher.searchStations(request);
    record(stationResult.status === "complete", `${context}: station search refused${stationResult.status === "refused" ? ` (${stationResult.reason})` : ""}`);
    if (stationResult.status === "complete") {
      record(stationResult.stations.length === window.stations.length, `${context}: station count differs`);
      counts.stationEvents += stationResult.stations.length;
      for (const [index, actual] of stationResult.stations.entries()) {
        const expected = window.stations[index];
        if (expected) checkStation(actual, expected, context, "stationOutsideBracketSeconds");
      }
    }
    const ingressResult = ingressSearcher.searchIngresses(request);
    record(ingressResult.status === "complete", `${context}: ingress search refused${ingressResult.status === "refused" ? ` (${ingressResult.reason})` : ""}`);
    if (ingressResult.status === "complete") {
      record(ingressResult.ingresses.length === window.ingresses.length, `${context}: ingress count differs`);
      counts.ingressEvents += ingressResult.ingresses.length;
      for (const [index, actual] of ingressResult.ingresses.entries()) {
        const expected = window.ingresses[index];
        if (!expected) continue;
        record(actual.direction === expected.direction && actual.longitudeDeg === expected.longitudeDeg, `${context}: ingress identity differs`);
        update("ingressOutsideBracketSeconds", finalEventOutsideBracketSeconds(actual.jdTt, expected), context);
        update("longitudeArcsec", angularError(actual.position.longitudeDeg, expected.longitudeDeg), context);
        record(actual.position.jdTt === actual.jdTt && actual.receipt.before.jdTt < actual.jdTt &&
          actual.receipt.after.jdTt > actual.jdTt, `${context}: ingress classification clocks differ`);
      }
    }
    const firstRate = window.scanRates[0]!;
    const lastRate = window.scanRates.at(-1)!;
    for (const rate of [firstRate, lastRate]) record(Math.abs(rate.fineLongitudeSpeedDegPerDay) * 3600 >
      ACCEPTANCE_POLICY.limits.longitudeSpeedArcsecPerDay, `${context}: retrograde endpoint sign lacks independent margin`);
    const expectedEpisodes: { start: ReferenceStation | null; end: ReferenceStation | null }[] = [];
    for (let index = 0; index <= window.stations.length; index++) {
      const start = window.stations[index - 1] ?? null;
      const end = window.stations[index] ?? null;
      const inside = window.scanRates.filter(row => row.jdTt > (start?.bracketEndJdTt ?? -Infinity) &&
        row.jdTt < (end?.bracketStartJdTt ?? Infinity));
      const signs = new Set(inside.map(row => Math.sign(row.fineLongitudeSpeedDegPerDay)));
      record(inside.length > 0 && signs.size === 1 && !signs.has(0), `${context}: independent retrograde phase is ambiguous`);
      if (signs.has(-1)) expectedEpisodes.push({ start, end });
    }
    const retrogradeResult = retrogradeSearcher.searchRetrogradeWindows(request);
    const identities = { stations: stationResult.receipt.implementation, ingresses: ingressResult.receipt.implementation,
      retrogrades: retrogradeResult.receipt.implementation, adapter: stationResult.receipt.adapterImplementation };
    if (searchImplementations) assert.deepEqual(identities, searchImplementations, "Search implementation changed between windows.");
    else searchImplementations = identities;
    record(retrogradeResult.status === "complete", `${context}: retrograde search refused${retrogradeResult.status === "refused" ? ` (${retrogradeResult.reason})` : ""}`);
    if (retrogradeResult.status === "complete") {
      record(retrogradeResult.stations.length === window.stations.length, `${context}: retrograde station count differs`);
      for (const [index, actual] of retrogradeResult.stations.entries()) {
        const expected = window.stations[index];
        if (expected) checkStation(actual, expected, context, "retrogradeOutsideBracketSeconds");
      }
      record(retrogradeResult.windows.length === expectedEpisodes.length, `${context}: retrograde window count differs`);
      counts.retrogradeWindows += retrogradeResult.windows.length;
      for (const [index, actual] of retrogradeResult.windows.entries()) {
        const expected = expectedEpisodes[index];
        if (!expected) continue;
        record(actual.startJdTt < actual.endJdTt && actual.clippedStart === (expected.start === null) &&
          actual.clippedEnd === (expected.end === null), `${context}: retrograde clipping differs`);
        if (expected.start) update("retrogradeOutsideBracketSeconds", finalEventOutsideBracketSeconds(actual.startJdTt, expected.start), context);
        else record(actual.startJdTt === window.fromJdTt, `${context}: clipped retrograde start differs`);
        if (expected.end) update("retrogradeOutsideBracketSeconds", finalEventOutsideBracketSeconds(actual.endJdTt, expected.end), context);
        else record(actual.endJdTt === window.toJdTt, `${context}: clipped retrograde end differs`);
      }
    }
    summaries.push({ year: window.year, fromJdTt: window.fromJdTt, toJdTt: window.toJdTt,
      scanEpochs: window.scan.length, stationBrackets: window.stations.length, ingressBrackets: window.ingresses.length,
      referenceRetrogradeWindows: expectedEpisodes.length,
      stations: { status: stationResult.status, samples: stationResult.samples, events: stationResult.stations.length },
      ingresses: { status: ingressResult.status, samples: ingressResult.samples, events: ingressResult.ingresses.length },
      retrogrades: { status: retrogradeResult.status, samples: retrogradeResult.samples, windows: retrogradeResult.windows.length } });
  }
  record(counts.referenceStations > 0, "No independent final station events for required body");
  record(counts.referenceIngresses > 0, "No independent final ingress events for required body");
  record(counts.directSamples > 0 && counts.retrogradeSamples > 0, "Missing direct or retrograde independent motion coverage");
  for (const metric of ["longitudeArcsec", "latitudeArcsec", "distanceAu", "longitudeSpeedArcsecPerDay"] as const) {
    record(maxima[metric] <= ACCEPTANCE_POLICY.limits[metric], `${metric} exceeds unchanged acceptance`);
  }
  record(maxima.referenceSpeedConvergenceArcsecPerDay <= FINAL_EVENT_RECIPE.maxReferenceLongitudeSpeedDifferenceArcsecPerDay,
    "Reference event speed differences have not converged");
  record(maxima.referenceBracketSeconds <= FINAL_EVENT_RECIPE.maxReferenceBracketSeconds, "Reference event bracket exceeds unchanged gate");
  for (const metric of ["stationOutsideBracketSeconds", "ingressOutsideBracketSeconds", "retrogradeOutsideBracketSeconds"] as const) {
    record(maxima[metric] <= FINAL_EVENT_RECIPE.eventAgreementMarginSeconds, `${metric} exceeds unchanged event gate`);
  }
  return { schema: "minorbodies-final-event-accuracy-v1", body: reference.body, scope: FINAL_EVENT_RECIPE.scope,
    recipe: FINAL_EVENT_RECIPE, recipeSha256: reference.recipeSha256,
    baseSourceManifestSha256: reference.baseSourceManifestSha256, sourceIdentity: reference.sourceIdentity,
    reference: reference.reference, searchImplementations: searchImplementations!,
    maxima, counts, windows: summaries, passed: failures.length === 0, failures };
}

async function validationImplementation() {
  const project = new URL("../", import.meta.url);
  const files = [];
  for (const path of ["src/final-event-validation.ts", "src/final-event-reference.ts", "src/acceptance.ts",
    "tests/full-final-events.test.ts", "tests/final-event-reference.test.ts"]) {
    files.push({ path, sha256: sha256(await readFile(new URL(path, project))) });
  }
  const record = { schema: "minorbodies-final-event-validation-implementation-v1", nodeVersion: process.version, files };
  return { ...record, sha256: sha256(JSON.stringify(record)) };
}

/** Writes numerical failures as well as successes. No runtime network or source mutation. */
export async function validateFinalEvents(body: MinorBody) {
  const implementation = await validationImplementation();
  const reference = await readFinalEventReference(body);
  const ephemeris = await loadFullBody(body);
  const adapter = await createBodyAdapter([ephemeris]);
  const stationSearcher = await createStationSearcher(adapter);
  const retrogradeSearcher = await createRetrogradeWindowSearcher(adapter);
  const ingressSearcher = await createIngressSearcher(adapter);
  const measured = measureFinalEventAccuracy(reference, adapter, stationSearcher, retrogradeSearcher, ingressSearcher);
  assert.deepEqual(await validationImplementation(), implementation, "Final event validation changed during comparison.");
  const report = { ...measured, sourceManifestSha256: reference.sourceManifestSha256,
    dataset: ephemeris.dataset, engineSource: ephemeris.engineSource, validationImplementation: implementation };
  const text = JSON.stringify(report, null, 2) + "\n";
  assert(Buffer.byteLength(text) < 2_000_000, "Final event report exceeds file cap.");
  const directory = new URL(`../generated/final-events/${body.toLowerCase()}/`, import.meta.url);
  await mkdir(directory, { recursive: true });
  await writeFile(new URL("accuracy-report.json", directory), text);
  return report;
}
