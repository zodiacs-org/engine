import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import { encodeCoefficientShard } from "../src/coefficient-shard.ts";
import { sha256 } from "../src/horizons-client.ts";
import { MAX_PILOT_REQUEST_EPOCHS } from "../src/pilot-sources.ts";
import {
  assertPilotEpochDisjointness, PILOT_RECIPE, PILOT_RECIPE_V1, pilotSegments, pilotTrainingEpochs,
  pilotValidationCenters, pilotValidationEpochs, printedJd
} from "../src/pilot-recipe.ts";
import { pilotRequests, preparePilot, verifyPilotSources } from "../scripts/generate-pilot.ts";
import type { PilotSourceManifest } from "../scripts/generate-pilot.ts";

const fixtures = new URL("./fixtures/pilot/", import.meta.url);
async function originalSources() {
  const sourceManifestText = await readFile(new URL("manifest.json", fixtures), "utf8");
  const rawFiles = new Map<string, string>();
  for (const { rawFile } of pilotRequests()) rawFiles.set(rawFile, await readFile(new URL(rawFile, fixtures), "utf8"));
  return { sourceManifestText, rawFiles };
}

describe("preregistered Chiron pilot recipe", () => {
  it("fixes the fit before any held-out result is used", () => {
    expect(PILOT_RECIPE).toMatchObject({ body: "Chiron", startJdTt: 2451544.5, endJdTt: 2451910.5,
      segmentDays: 16, degree: 14, trainingNodesPerSegment: 17,
      seamLimits: { positionAu: 1e-9, velocityAuPerDay: 1e-9 } });
    expect(PILOT_RECIPE.tuningEpochs).toEqual([]);
    expect(PILOT_RECIPE_V1.schema).toBe("minorbodies-chiron-pilot-recipe-v1");
    expect(PILOT_RECIPE_V1.trainingNodes).toBe("Chebyshev-Gauss;ascending;rounded-to-JD9");
    expect(PILOT_RECIPE.schema).toBe("minorbodies-chiron-pilot-recipe-v2");
    expect(PILOT_RECIPE.requestedEpochPrecisionDecimals).toBe(6);
    expect(PILOT_RECIPE.degree).toBe(PILOT_RECIPE_V1.degree);
    expect(PILOT_RECIPE.seamLimits).toEqual(PILOT_RECIPE_V1.seamLimits);
    const segments = pilotSegments();
    expect(segments).toHaveLength(23);
    expect(segments[22]!.endJdTt - segments[22]!.startJdTt).toBe(14);
    expect(pilotTrainingEpochs()).toHaveLength(391);
    expect(pilotValidationCenters()).toHaveLength(137);
    expect(pilotValidationEpochs()).toHaveLength(641);
    expect(Object.isFrozen(PILOT_RECIPE.referenceStencilOffsetsDays)).toBe(true);
    expect(Object.isFrozen(segments[0]!.trainingEpochs)).toBe(true);
  });

  it("uses printed epochs, irregular holdouts and disjoint complete reference stencils", () => {
    assertPilotEpochDisjointness();
    const training = new Set(pilotTrainingEpochs());
    const validation = new Set(pilotValidationEpochs());
    expect([...training].every(epoch => epoch === printedJd(epoch))).toBe(true);
    expect([...validation].every(epoch => !training.has(epoch))).toBe(true);
    for (const segment of pilotSegments()) {
      expect(segment.trainingEpochs.every(epoch => epoch > segment.startJdTt && epoch < segment.endJdTt)).toBe(true);
      for (const fraction of PILOT_RECIPE.holdoutInteriorFractions) {
        expect(validation.has(printedJd(segment.startJdTt + fraction * (segment.endJdTt - segment.startJdTt)))).toBe(true);
      }
    }
    for (const center of pilotValidationCenters()) {
      expect(center).toBeGreaterThanOrEqual(PILOT_RECIPE.startJdTt);
      expect(center).toBeLessThan(PILOT_RECIPE.endJdTt);
      for (const offset of PILOT_RECIPE.referenceStencilOffsetsDays) expect(validation.has(printedJd(center + offset))).toBe(true);
    }
    expect(Math.min(...validation)).toBeLessThan(PILOT_RECIPE.startJdTt);
    expect(Math.max(...validation)).toBeGreaterThan(PILOT_RECIPE.endJdTt);
    expect(MAX_PILOT_REQUEST_EPOCHS).toBe(32);
    expect(pilotRequests().every(record => record.request.epochs.length <= MAX_PILOT_REQUEST_EPOCHS)).toBe(true);
  });
});

describe("frozen pilot source regeneration", () => {
  it("regenerates identical offline shards and enforces every seam limit", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network forbidden in offline regeneration."));
    try {
      const a = await preparePilot();
      const b = await preparePilot();
      expect(a.text).toBe(b.text);
      expect(encodeCoefficientShard(a.shard).descriptor).toEqual(a.descriptor);
      expect(a.shard.provenance.sourceManifestSha256).toBe(sha256(a.sourceManifestText));
      expect(a.shard.provenance.generatorSha256).toBe(a.sourceManifest.generatorSha256);
      expect(a.shard.validation).toBe("unvalidated");
      expect(a.validationRows.map(row => row.jdTt)).toEqual(pilotValidationEpochs());
      expect(a.seams).toHaveLength(22);
      for (const seam of a.seams) {
        expect(seam.positionAu).toBeLessThanOrEqual(PILOT_RECIPE.seamLimits.positionAu);
        expect(seam.velocityAuPerDay).toBeLessThanOrEqual(PILOT_RECIPE.seamLimits.velocityAuPerDay);
      }
      expect(fetch).not.toHaveBeenCalled();
    } finally { fetch.mockRestore(); }
  });

  it("refuses changed original bytes, missing batches and relabelled source roles", async () => {
    const { sourceManifestText, rawFiles } = await originalSources();
    expect(() => verifyPilotSources(sourceManifestText, rawFiles)).not.toThrow();
    const rawFile = pilotRequests()[0]!.rawFile;
    const changed = new Map(rawFiles);
    changed.set(rawFile, changed.get(rawFile)! + " ");
    expect(() => verifyPilotSources(sourceManifestText, changed)).toThrow(/digest mismatch/);
    changed.delete(rawFile);
    expect(() => verifyPilotSources(sourceManifestText, changed)).toThrow(/exactly/);
    const relabelled = JSON.parse(sourceManifestText);
    relabelled.entries[0].role = "validation";
    expect(() => verifyPilotSources(JSON.stringify(relabelled) + "\n", rawFiles)).toThrow(/preregistration/);
  });

  it("refuses changed solution identity, generation hashes, recipe and noncanonical manifests", async () => {
    const { sourceManifestText, rawFiles } = await originalSources();
    for (const mutation of [
      (record: any) => { record.identity.targetSource = "JPL#0"; },
      (record: any) => { record.generatorSha256 = "0".repeat(64); },
      (record: any) => { record.recipe.degree = 16; },
      (record: any) => { record.entries[0].manifest.identity.targetSource = "JPL#0"; }
    ]) {
      const record: PilotSourceManifest = JSON.parse(sourceManifestText);
      mutation(record);
      expect(() => verifyPilotSources(JSON.stringify(record) + "\n", rawFiles)).toThrow();
    }
    expect(() => verifyPilotSources(sourceManifestText.trim(), rawFiles)).toThrow(/canonical/);
  });
});
