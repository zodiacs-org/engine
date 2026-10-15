import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { MINOR_BODY_NAMES } from "../src/catalog.ts";
import { fullTrainingEpochs, fullValidationCenters } from "../src/full-recipe.ts";
import { SPEED_REFERENCE_RECIPE, encodeSpeedManifest, speedGeneratorIdentity,
  speedReferenceEpochs, speedRequests, verifySpeedManifest } from "../src/speed-reference-sources.ts";

describe("supplemental speed reference corpus", () => {
  it("fixes wider sixth-order stencils without touching coefficients or acceptance budgets", () => {
    expect(SPEED_REFERENCE_RECIPE.fineStepDays).toBe(0.25);
    expect(SPEED_REFERENCE_RECIPE.coarseStepDays).toBe(0.5);
    expect(SPEED_REFERENCE_RECIPE.offsetsDays).toEqual([-1.5, -1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1, 1.5]);
    const epochs = speedReferenceEpochs();
    expect(epochs).toHaveLength(110154);
    const training = new Set(fullTrainingEpochs());
    expect(epochs.some(epoch => training.has(epoch))).toBe(false);
    const set = new Set(epochs);
    expect(fullValidationCenters().every(center => set.has(center))).toBe(true);
    const requests = speedRequests("Chiron");
    expect(requests).toHaveLength(54);
    expect(requests.flatMap(item => [...item.request.epochs])).toEqual(epochs);
    const requestAt = new Map(requests.flatMap(item => item.request.epochs.map(epoch => [epoch, item.index] as const)));
    for (const center of fullValidationCenters()) {
      const indices = SPEED_REFERENCE_RECIPE.offsetsDays.map(offset => requestAt.get(Number((center + offset).toFixed(6))));
      expect(new Set(indices).size).toBe(1);
      expect(indices[0]).not.toBeUndefined();
    }
    expect(SPEED_REFERENCE_RECIPE.convergence).toBe("unchanged-v1;one-tenth-of-speed-acceptance-budgets");
  });

  it("checks frozen manifests and current generator identity for every body", async () => {
    const generator = await speedGeneratorIdentity();
    for (const body of MINOR_BODY_NAMES) {
      const name = body.toLowerCase();
      const base = await readFile(new URL(`../data/manifests/${name}.json`, import.meta.url), "utf8");
      const text = await readFile(new URL(`../data/speed-manifests/${name}.json`, import.meta.url), "utf8");
      const { source } = verifySpeedManifest(text, base);
      expect(source.body).toBe(body);
      expect(source.generator).toEqual(generator);
    }
  }, 30000);

  it("refuses substituted base datasets, recipes, metadata or source digests", async () => {
    const base = await readFile(new URL("../data/manifests/chiron.json", import.meta.url), "utf8");
    const text = await readFile(new URL("../data/speed-manifests/chiron.json", import.meta.url), "utf8");
    for (const mutate of [
      (s: any) => { s.baseSourceManifestSha256 = "0".repeat(64); },
      (s: any) => { s.recipe.fineStepDays = 0.005; },
      (s: any) => { s.entries[0].manifest.requestSha256 = "0".repeat(64); },
      (s: any) => { s.entries[0].manifest.responseSha256 = "bad"; },
      (s: any) => { s.entries[0].manifest.schema = "bad"; },
      (s: any) => { s.entries[0].manifest.identity.targetSource = "JPL#1"; },
      (s: any) => { s.entries[0].manifest.byteLength = 0; }
    ]) {
      const source = JSON.parse(text);
      mutate(source);
      expect(() => verifySpeedManifest(encodeSpeedManifest(source), base)).toThrow();
    }
  }, 30000);
});
