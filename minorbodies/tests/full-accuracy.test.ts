import { beforeAll, describe, expect, it } from "vitest";
import { validateFullBody } from "../scripts/validate-full.ts";
import { ACCEPTANCE_POLICY } from "../src/acceptance.ts";
import { MINOR_BODY_NAMES } from "../src/catalog.ts";
import { FULL_RECIPE, fullSegments, fullTrainingEpochs, fullValidationCenters, fullValidationEpochs } from "../src/full-recipe.ts";
import { REFERENCE_CONVERGENCE_LIMITS } from "../src/pilot-validation.ts";
import { SPEED_REFERENCE_RECIPE, speedReferenceEpochs } from "../src/speed-reference-sources.ts";
import { loadFullBody } from "../src/full.ts";
import { readFile } from "node:fs/promises";

// Run only through the explicit full-data configuration. Missing captures or ERFA must fail.
for (const body of MINOR_BODY_NAMES) {
  describe(`${body} full coverage versus held-out Horizons and independent ERFA`, () => {
    let validation: Awaited<ReturnType<typeof validateFullBody>>;
    beforeAll(async () => { validation = await validateFullBody(body); }, 300_000);

    it("compares the entire registered independent corpus without fitting holdouts", () => {
      const { report, prepared, speed } = validation;
      const epochs = fullValidationEpochs();
      const training = new Set(fullTrainingEpochs());
      expect(epochs.some(epoch => training.has(epoch))).toBe(false);
      expect(prepared.validationRows.map(row => row.jdTt)).toEqual(epochs);
      expect(report.body).toBe(body);
      expect(report.referenceEpochs).toEqual({ first: epochs[0], last: epochs.at(-1), count: epochs.length });
      expect(report.positionSamples).toBe(epochs.filter(jd => jd >= FULL_RECIPE.startJdTt && jd < FULL_RECIPE.endJdTt).length);
      expect(report.speedSamples).toBe(fullValidationCenters().length);
      expect(report.coverage).toEqual({ startJdTt: FULL_RECIPE.startJdTt, endJdTtExclusive: FULL_RECIPE.endJdTt, scale: "tt" });
      expect(report.scope).toBe("finite-held-out-full-coverage-samples;not-continuous-or-physical-error-bounds");
      expect(report.validationStage).toBe("M5-coverage-samples;M11-final-corpus-pending");
      expect(report.sourceManifestSha256).toBe(prepared.sourceManifestSha256);
      expect(report.generatorSha256).toBe(prepared.generatorSha256);
      expect(report.reference.frame).toBe("ecliptic-true-of-date;IAU2006/2000A");
      expect(report.reference.correctionsApplied).toBe("rotation-only;input-already-LT+S;no-deflection");
      expect(report.schema).toBe("minorbodies-full-accuracy-v2");
      const speedEpochs = speedReferenceEpochs();
      expect(speedEpochs.some(epoch => training.has(epoch))).toBe(false);
      expect(speed.rows.map(row => row.jdTt)).toEqual(speedEpochs);
      expect(report.speedReferenceEpochs).toEqual({ first: speedEpochs[0], last: speedEpochs.at(-1), count: speedEpochs.length });
      expect(report.speedReferenceRecipe).toEqual(SPEED_REFERENCE_RECIPE);
      expect(report.speedReferenceSource).toEqual({ sourceManifestSha256: speed.sourceManifestSha256,
        baseSourceManifestSha256: prepared.sourceManifestSha256, recipeSha256: speed.source.recipeSha256,
        generatorSha256: speed.source.generatorSha256 });
      expect(report.validationImplementation.schema).toBe("minorbodies-full-validation-implementation-v2");
      expect(report.validationImplementation.nodeVersion).toBe(process.version);
      expect(report.validationImplementation.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(report.validationImplementation.files.map(file => file.path)).toEqual([
        "scripts/validate-full.ts", "src/full-validation.ts", "src/full-recipe.ts",
        "src/acceptance.ts", "tests/full-accuracy.test.ts", "src/pilot-validation.ts", "src/reference-derivative.ts",
        "src/speed-reference-sources.ts", "tests/reference-derivative.test.ts"
      ]);
      for (const file of report.validationImplementation.files) expect(file.sha256).toMatch(/^[a-f0-9]{64}$/);
    });

    for (const metric of Object.keys(ACCEPTANCE_POLICY.limits) as (keyof typeof ACCEPTANCE_POLICY.limits)[]) {
      it(`enforces the unchanged ${metric} maximum`, () => {
        const maximum = validation.report.maxima[metric];
        expect(maximum.value).toBeGreaterThanOrEqual(0);
        expect(maximum.value).toBeLessThanOrEqual(ACCEPTANCE_POLICY.limits[metric]);
        expect(maximum.jdTt).toBeGreaterThanOrEqual(FULL_RECIPE.startJdTt);
        expect(maximum.jdTt).toBeLessThan(FULL_RECIPE.endJdTt);
      });
    }

    it("requires convergence of every independent speed stencil", () => {
      for (const metric of Object.keys(REFERENCE_CONVERGENCE_LIMITS) as (keyof typeof REFERENCE_CONVERGENCE_LIMITS)[]) {
        const maximum = validation.report.convergenceMaxima[metric];
        expect(maximum.value).toBeGreaterThanOrEqual(0);
        expect(maximum.value).toBeLessThanOrEqual(REFERENCE_CONVERGENCE_LIMITS[metric]);
      }
    });

    it("checks every segment join, including shard boundaries", () => {
      const { report, prepared } = validation;
      expect(report.segments).toBe(fullSegments().length);
      expect(report.shards).toBe(prepared.shards.length);
      expect(report.seams).toBe(report.segments - 1);
      expect(report.crossShardSeams).toBe(report.shards - 1);
      expect(report.internalSeams).toBe(report.segments - report.shards);
      expect(report.seamMaxima.positionAu.value).toBeLessThanOrEqual(FULL_RECIPE.seamLimits.positionAu);
      expect(report.seamMaxima.velocityAuPerDay.value).toBeLessThanOrEqual(FULL_RECIPE.seamLimits.velocityAuPerDay);
      expect(report.passed).toBe(true);
      expect(report.failures).toEqual([]);
    });

    it("checks direct and retrograde states against independent speeds away from stations", () => {
      expect(validation.report.directSamples).toBeGreaterThan(0);
      expect(validation.report.retrogradeSamples).toBeGreaterThan(0);
      expect(validation.report.retrogradeMismatches).toBe(0);
    });

    it("keeps every coefficient file below the registered file-size limit", () => {
      for (const item of validation.prepared.shards) {
        expect(item.descriptor.byteLength).toBe(Buffer.byteLength(item.text));
        expect(item.descriptor.byteLength).toBeLessThan(ACCEPTANCE_POLICY.maxCommittedFileBytesExclusive);
      }
    });

    it("reproduces frozen coefficient receipts and loads them offline at coverage edges", async () => {
      const receipt = JSON.parse(await readFile(new URL(`../data/receipts/${body.toLowerCase()}.json`, import.meta.url), "utf8"));
      expect(validation.prepared.shards.map(item => item.descriptor)).toEqual(receipt.shards.map((item: any) => item.descriptor));
      expect(receipt.totalBytes).toBe(validation.prepared.shards.reduce((sum, item) => sum + item.descriptor.byteLength, 0));
      const loaded = await loadFullBody(body);
      for (const jd of [FULL_RECIPE.startJdTt, 2451545, FULL_RECIPE.endJdTt - 0.000001]) {
        const result = loaded.calculate(body, { jd, scale: "tt" });
        expect(result).toEqual(validation.prepared.ephemeris.calculate(body, { jd, scale: "tt" }));
        expect(result.status).toBe("ok");
        expect(result.receipt.dataset.sourceManifestSha256).toBe(receipt.sourceManifestSha256);
        expect(result.receipt.evaluatedShard).not.toBeNull();
      }
      for (const jd of [FULL_RECIPE.startJdTt - 0.000001, FULL_RECIPE.endJdTt]) {
        expect(loaded.calculate(body, { jd, scale: "tt" })).toMatchObject({ status: "refused", reason: "outside-coverage" });
      }
    }, 60000);
  });
}
