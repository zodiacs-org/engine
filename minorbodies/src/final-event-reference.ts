/** M11 independent event windows. No fitted evaluator or event solver is imported. */
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { sha256 } from "./horizons-client.ts";
import { decodeHorizonsFileCapture, makeHorizonsFileRequest } from "./horizons-file.ts";
import type { HorizonsFileCapture, HorizonsFileRequest } from "./horizons-file.ts";
import { isMinorBody } from "./catalog.ts";
import type { MinorBody } from "./catalog.ts";
import { reduceWithIndependentErfa } from "./pilot-validation.ts";
import type { IndependentEclipticRow } from "./pilot-validation.ts";
import { stationReferenceBrackets, stationReferenceEpochs, stationReferenceRates,
  stationReferenceSourceIdentity, STATION_REFERENCE_IMPLEMENTATION_FILES } from "./station-reference.ts";
import type { StationReferenceRate } from "./station-reference.ts";
import { ingressReferenceBrackets, INGRESS_REFERENCE_IMPLEMENTATION_FILES } from "./ingress-reference.ts";

/** Fixed before source intake; the original calendar-2000 suites remain separate. */
export const FINAL_EVENT_RECIPE = Object.freeze({
  schema: "minorbodies-final-event-recipe-v1",
  years: Object.freeze([1800, 1900, 2100, 2200]),
  firstCenterOffsetDays: 0.125003,
  dailyCentersPerWindow: 365,
  intervalDays: 364,
  scanStepDays: 1,
  scanFineStepDays: 1,
  scanCoarseStepDays: 2,
  refinementSubdivisions: 32,
  refinementPasses: 2,
  fineStepDays: 0.25,
  coarseStepDays: 0.5,
  requestedEpochPrecisionDecimals: 6,
  maximumRequestEpochs: 2048,
  maxReferenceBracketSeconds: 85,
  eventAgreementMarginSeconds: 300,
  maxReferenceLongitudeSpeedDifferenceArcsecPerDay: 0.01,
  maximumAdjacentLongitudeStepDeg: 15,
  requireStationEventsPerBody: true,
  requireIngressEventsPerBody: true,
  scope: "four-finite-364-day-TT-windows;retained-2000-suites-separate;not-full-range-event-completeness"
} as const);

const project = new URL("../", import.meta.url);
const printed = (jd: number) => Number(jd.toFixed(FINAL_EVENT_RECIPE.requestedEpochPrecisionDecimals));
export const FINAL_EVENT_IMPLEMENTATION_FILES = Object.freeze([...new Set([
  "src/final-event-reference.ts", "scripts/capture-final-events.ts",
  ...STATION_REFERENCE_IMPLEMENTATION_FILES, ...INGRESS_REFERENCE_IMPLEMENTATION_FILES
])].sort());

export async function finalEventGeneratorIdentity() {
  const files = [];
  for (const path of FINAL_EVENT_IMPLEMENTATION_FILES) files.push({ path, sha256: sha256(await readFile(new URL(path, project))) });
  return { name: "minorbodies-final-event-generator-v1", nodeVersion: process.version, files };
}

export function finalEventWindows() {
  return FINAL_EVENT_RECIPE.years.map(year => {
    const first = Date.parse(`${year}-01-01T00:00:00Z`) / 86400000 + 2440587.5 + FINAL_EVENT_RECIPE.firstCenterOffsetDays;
    const centers = Array.from({ length: FINAL_EVENT_RECIPE.dailyCentersPerWindow }, (_, index) => printed(first + index));
    return { year, fromJdTt: centers[0]!, toJdTt: centers.at(-1)!, centers };
  });
}

export function finalEventRefinementCenters(before: number, after: number) {
  assert(Number.isFinite(before) && Number.isFinite(after) && after > before, "Invalid reference refinement bracket.");
  return stationReferenceEpochs(Array.from({ length: FINAL_EVENT_RECIPE.refinementSubdivisions + 1 }, (_, index) =>
    printed(before + (after - before) * index / FINAL_EVENT_RECIPE.refinementSubdivisions)), 0, 0);
}

export function assertFinalEventReferenceRates(rates: readonly StationReferenceRate[]) {
  assert(rates.length > 0, "Empty final event derivative corpus.");
  for (const rate of rates) {
    assert(Number.isFinite(rate.convergenceArcsecPerDay) && rate.convergenceArcsecPerDay >= 0 &&
      rate.convergenceArcsecPerDay <= FINAL_EVENT_RECIPE.maxReferenceLongitudeSpeedDifferenceArcsecPerDay,
    "Final event reference derivative did not converge.");
    assert(Number.isFinite(rate.fineLongitudeSpeedDegPerDay) && Number.isFinite(rate.coarseLongitudeSpeedDegPerDay) &&
      rate.fineLongitudeSpeedDegPerDay !== 0 && rate.coarseLongitudeSpeedDegPerDay !== 0 &&
      Math.sign(rate.fineLongitudeSpeedDegPerDay) === Math.sign(rate.coarseLongitudeSpeedDegPerDay),
    "Final event reference derivatives disagree about motion.");
  }
}

/** All epochs depend solely on the fixed recipe and earlier independent reference rows. */
export async function buildFinalEventReference(body: MinorBody,
  load: (name: string, request: HorizonsFileRequest) => Promise<HorizonsFileCapture>) {
  assert(isMinorBody(body), "Unknown minor body.");
  const base = await stationReferenceSourceIdentity(body);
  const sources: { name: string; requestSha256: string; responseSha256: string; epochs: number }[] = [];
  let referenceMetadata: Readonly<Record<string, string>> | undefined;
  const samplesAt = async (name: string, epochs: readonly number[]) => {
    assert(epochs.length > 0 && epochs.length <= FINAL_EVENT_RECIPE.maximumRequestEpochs, "Final event request exceeds its registered cap.");
    const request = makeHorizonsFileRequest(body, epochs);
    const capture = await load(name, request);
    assert.deepEqual(capture.request, request);
    assert.deepEqual(capture.response.identity, base.identity, "Final event source solution differs from fitted source.");
    const reduced = await reduceWithIndependentErfa(capture.response.rows);
    if (referenceMetadata) assert.deepEqual(reduced.reference, referenceMetadata); else referenceMetadata = reduced.reference;
    sources.push({ name, requestSha256: capture.manifest.requestSha256,
      responseSha256: capture.manifest.responseSha256, epochs: epochs.length });
    return reduced.samples;
  };
  const ratesAt = async (name: string, centers: readonly number[], fineStep: number, coarseStep: number) => {
    const rows = await samplesAt(name, stationReferenceEpochs(centers, fineStep, coarseStep));
    return { rows, rates: stationReferenceRates(rows, centers, fineStep, coarseStep) };
  };
  const windows = [];
  for (const window of finalEventWindows()) {
    const scanSource = await ratesAt(`${window.year}-scan`, window.centers,
      FINAL_EVENT_RECIPE.scanFineStepDays, FINAL_EVENT_RECIPE.scanCoarseStepDays);
    assertFinalEventReferenceRates(scanSource.rates);
    const byEpoch = new Map(scanSource.rows.map(row => [row.jdTt, row]));
    const scan = window.centers.map(jd => { const row = byEpoch.get(jd); assert(row); return row; });
    const initialStations = stationReferenceBrackets(scanSource.rates);
    const stations = [];
    for (const [index, initial] of initialStations.entries()) {
      let bracket = initial;
      for (let pass = 0; pass < FINAL_EVENT_RECIPE.refinementPasses; pass++) {
        const centers = finalEventRefinementCenters(bracket.before.jdTt, bracket.after.jdTt);
        const { rates } = await ratesAt(`${window.year}-station-${index}-pass-${pass}`, centers,
          FINAL_EVENT_RECIPE.fineStepDays, FINAL_EVENT_RECIPE.coarseStepDays);
        assertFinalEventReferenceRates(rates);
        const refined = stationReferenceBrackets(rates);
        assert.equal(refined.length, 1, "A daily station bracket must refine to one reference event.");
        assert.equal(refined[0]!.direction, initial.direction);
        bracket = refined[0]!;
      }
      const widthSeconds = (bracket.after.jdTt - bracket.before.jdTt) * 86400;
      assert(widthSeconds <= FINAL_EVENT_RECIPE.maxReferenceBracketSeconds, "Final station reference bracket exceeds its gate.");
      stations.push({ ...bracket, bracketStartJdTt: bracket.before.jdTt, bracketEndJdTt: bracket.after.jdTt, widthSeconds });
    }
    let ingressBrackets = ingressReferenceBrackets(scan);
    for (let pass = 0; pass < FINAL_EVENT_RECIPE.refinementPasses && ingressBrackets.length; pass++) {
      const initial = ingressBrackets;
      // Batch only independent positions. Speed stencils are kept intact below.
      const epochs = stationReferenceEpochs(initial.flatMap(bracket =>
        finalEventRefinementCenters(bracket.before.jdTt, bracket.after.jdTt)), 0, 0);
      const samples = await samplesAt(`${window.year}-ingress-pass-${pass}`, epochs);
      ingressBrackets = initial.map(bracket => {
        const rows = samples.filter(row => row.jdTt >= bracket.before.jdTt && row.jdTt <= bracket.after.jdTt);
        const refined = ingressReferenceBrackets(rows);
        assert.equal(refined.length, 1, "A daily ingress bracket must refine to one reference event.");
        assert.equal(refined[0]!.direction, bracket.direction);
        assert.equal(refined[0]!.longitudeDeg, bracket.longitudeDeg);
        return refined[0]!;
      });
    }
    const endpointCenters = [...new Set(ingressBrackets.flatMap(bracket => [bracket.before.jdTt, bracket.after.jdTt]))].sort((a, b) => a - b);
    const endpointRates = endpointCenters.length ? (await ratesAt(`${window.year}-ingress-endpoints`, endpointCenters,
      FINAL_EVENT_RECIPE.fineStepDays, FINAL_EVENT_RECIPE.coarseStepDays)).rates : [];
    if (endpointRates.length) assertFinalEventReferenceRates(endpointRates);
    const ratesByEpoch = new Map(endpointRates.map(row => [row.jdTt, row]));
    const ingresses = ingressBrackets.map(bracket => {
      const beforeRate = ratesByEpoch.get(bracket.before.jdTt)!;
      const afterRate = ratesByEpoch.get(bracket.after.jdTt)!;
      for (const rate of [beforeRate, afterRate]) {
        assert.equal(Math.sign(rate.fineLongitudeSpeedDegPerDay), bracket.direction === "direct" ? 1 : -1,
          "Independent ingress derivative disagrees with bracket direction.");
        const repeated = ((rate.longitudeDeg - bracket.longitudeDeg + 540) % 360) - 180;
        const original = ((rate.jdTt === bracket.before.jdTt ? bracket.before.longitudeDeg : bracket.after.longitudeDeg) - bracket.longitudeDeg + 540) % 360 - 180;
        assert.equal(Math.sign(repeated), Math.sign(original), "Independent ingress endpoint capture changed bracket side.");
      }
      const widthSeconds = (bracket.after.jdTt - bracket.before.jdTt) * 86400;
      assert(widthSeconds <= FINAL_EVENT_RECIPE.maxReferenceBracketSeconds, "Final ingress reference bracket exceeds its gate.");
      return { ...bracket, beforeRate, afterRate,
        bracketStartJdTt: bracket.before.jdTt, bracketEndJdTt: bracket.after.jdTt, widthSeconds };
    });
    windows.push({ year: window.year, fromJdTt: window.fromJdTt, toJdTt: window.toJdTt,
      scan, scanRates: scanSource.rates, stations, ingresses });
  }
  // Record empty astronomical outcomes too; the validation suite enforces these coverage gates.
  return { schema: "minorbodies-final-event-reference-v1", body, recipe: FINAL_EVENT_RECIPE,
    recipeSha256: sha256(JSON.stringify(FINAL_EVENT_RECIPE)), baseSourceManifestSha256: base.sourceManifestSha256,
    sourceIdentity: base.identity, reference: referenceMetadata!, sources, windows };
}

export type FinalEventReference = Awaited<ReturnType<typeof buildFinalEventReference>>;
export interface FinalEventSourceManifest {
  schema: "minorbodies-final-event-sources-v1";
  body: MinorBody;
  recipe: typeof FINAL_EVENT_RECIPE;
  generator: Awaited<ReturnType<typeof finalEventGeneratorIdentity>>;
  captures: { name: string; sha256: string; byteLength: number }[];
}

async function readBounded(url: URL) {
  assert((await stat(url)).size < 2_000_000, "Final event source exceeds file cap.");
  return readFile(url, "utf8");
}

/** Committed source manifest pins ignored capture files; missing inputs cannot skip validation. */
export async function readFinalEventReference(body: MinorBody) {
  assert(isMinorBody(body), "Unknown minor body.");
  const text = await readBounded(new URL(`data/final-event-manifests/${body.toLowerCase()}.json`, project));
  const manifest = JSON.parse(text) as FinalEventSourceManifest;
  assert.deepEqual(Object.keys(manifest), ["schema", "body", "recipe", "generator", "captures"]);
  assert.equal(manifest.schema, "minorbodies-final-event-sources-v1");
  assert.equal(manifest.body, body);
  assert.deepEqual(manifest.recipe, FINAL_EVENT_RECIPE);
  assert.deepEqual(manifest.generator, await finalEventGeneratorIdentity());
  const directory = new URL(`generated/final-events/${body.toLowerCase()}/`, project);
  let next = 0;
  const result = await buildFinalEventReference(body, async (name, request) => {
    const item = manifest.captures[next++];
    assert(item, "Missing final event source manifest entry.");
    assert.deepEqual(Object.keys(item), ["name", "sha256", "byteLength"]);
    assert.equal(item.name, name);
    const encoded = await readBounded(new URL(`${name}.json`, directory));
    assert.equal(Buffer.byteLength(encoded), item.byteLength);
    assert.equal(sha256(encoded), item.sha256);
    return decodeHorizonsFileCapture(encoded, request);
  });
  assert.equal(next, manifest.captures.length, "Unexpected extra final event source manifest entries.");
  return { ...result, sourceManifestSha256: sha256(text) };
}
