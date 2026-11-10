import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { beforeAll, describe, expect, it } from "vitest";
import { validateFinalBody } from "../scripts/validate-final.ts";
import { ACCEPTANCE_POLICY } from "../src/acceptance.ts";
import { MINOR_BODY_NAMES } from "../src/catalog.ts";
import { FINAL_RECIPE, finalEpochs, finalPositionEpochs, finalSpeedCenters } from "../src/final-recipe.ts";
import { FULL_RECIPE, fullSegments, fullTrainingEpochs } from "../src/full-recipe.ts";
import { REFERENCE_CONVERGENCE_LIMITS } from "../src/pilot-validation.ts";

const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const epochSpan = (epochs: readonly number[]) => ({ first: epochs[0], last: epochs.at(-1), count: epochs.length });

// The explicit full-data suite requires every final capture and ERFA. Missing files are failures.
for (const body of MINOR_BODY_NAMES) {
  describe(`${body} final held-out corpus versus original Horizons and independent ERFA`, () => {
    let validation: Awaited<ReturnType<typeof validateFinalBody>>;
    beforeAll(async () => { validation = await validateFinalBody(body); }, 300_000);

    it("measures every registered final epoch within coverage and every independent speed stencil", () => {
      const { report, source } = validation;
      const epochs = finalEpochs();
      const inRange = epochs.filter(jd => jd >= FULL_RECIPE.startJdTt && jd < FULL_RECIPE.endJdTt);
      const training = new Set(fullTrainingEpochs());
      expect(epochs.some(epoch => training.has(epoch))).toBe(false);
      expect(source.rows.map(row => row.jdTt)).toEqual(epochs);
      expect(report.schema).toBe("minorbodies-final-accuracy-v1");
      expect(report.body).toBe(body);
      expect(report.referenceEpochs).toEqual(epochSpan(epochs));
      expect(report.registeredPositionEpochs).toEqual(epochSpan(finalPositionEpochs()));
      expect(report.measuredPositionEpochs).toEqual(epochSpan(inRange));
      expect(report.positionSamples).toBe(inRange.length);
      expect(report.speedSamples).toBe(finalSpeedCenters().length);
      expect(report.speedCenterEpochs).toEqual(epochSpan(finalSpeedCenters()));
      expect(report.coverage).toEqual({ startJdTt: FULL_RECIPE.startJdTt, endJdTtExclusive: FULL_RECIPE.endJdTt, scale: "tt" });
      expect(report.scope).toBe("finite-final-held-out-full-coverage-samples;not-continuous-or-physical-error-bounds");
      expect(report.validationStage).toBe("M11-final-position-corpus");
      expect(report.finalRecipe).toEqual(FINAL_RECIPE);
      expect(report.acceptance).toEqual(ACCEPTANCE_POLICY);
      expect(report.convergenceLimits).toEqual(REFERENCE_CONVERGENCE_LIMITS);
      expect(report.seamLimits).toEqual(FULL_RECIPE.seamLimits);
    });

    for (const metric of Object.keys(ACCEPTANCE_POLICY.limits) as (keyof typeof ACCEPTANCE_POLICY.limits)[]) {
      it(`enforces the unchanged ${metric} maximum on the final corpus`, () => {
        const maximum = validation.report.maxima[metric];
        expect(Number.isFinite(maximum.value)).toBe(true);
        expect(maximum.value).toBeGreaterThanOrEqual(0);
        expect(maximum.value).toBeLessThanOrEqual(ACCEPTANCE_POLICY.limits[metric]);
        expect(maximum.jdTt).toBeGreaterThanOrEqual(FULL_RECIPE.startJdTt);
        expect(maximum.jdTt).toBeLessThan(FULL_RECIPE.endJdTt);
      });
    }

    it("requires convergence of all independently differentiated speed components", () => {
      for (const metric of Object.keys(REFERENCE_CONVERGENCE_LIMITS) as (keyof typeof REFERENCE_CONVERGENCE_LIMITS)[]) {
        const maximum = validation.report.convergenceMaxima[metric];
        expect(maximum.value).toBeGreaterThanOrEqual(0);
        expect(maximum.value).toBeLessThanOrEqual(REFERENCE_CONVERGENCE_LIMITS[metric]);
        expect(finalSpeedCenters()).toContain(maximum.jdTt);
      }
    });

    it("checks every unchanged segment join, including all shard boundaries", () => {
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

    it("checks direct and retrograde states against the independent reference away from stations", () => {
      expect(validation.report.directSamples).toBeGreaterThan(0);
      expect(validation.report.retrogradeSamples).toBeGreaterThan(0);
      expect(validation.report.retrogradeMismatches).toBe(0);
      expect(validation.report.directSamples + validation.report.retrogradeSamples).toBeLessThanOrEqual(finalSpeedCenters().length);
    });

    it("binds reference, source, frozen coefficients, evaluator and validator identities", async () => {
      const { report, prepared, source } = validation;
      expect(report.sourceManifestSha256).toBe(prepared.sourceManifestSha256);
      expect(report.generatorSha256).toBe(prepared.generatorSha256);
      expect(report.sourceIdentity).toEqual(prepared.sourceIdentity);
      expect(report.engineSource).toEqual(prepared.ephemeris.engineSource);
      expect(report.engineSource.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(report.shardDescriptors).toEqual(prepared.shards.map(item => item.descriptor));
      expect(report.finalReferenceSource).toEqual({ sourceManifestSha256: source.sourceManifestSha256,
        baseSourceManifestSha256: prepared.sourceManifestSha256, recipeSha256: hash(JSON.stringify(source.source.recipe)),
        generatorSha256: hash(JSON.stringify(source.source.generator)) });
      expect(report.reference.frame).toBe("ecliptic-true-of-date;IAU2006/2000A");
      expect(report.reference.correctionsApplied).toBe("rotation-only;input-already-LT+S;no-deflection");
      expect(report.validationImplementation.schema).toBe("minorbodies-final-validation-implementation-v1");
      expect(report.validationImplementation.nodeVersion).toBe(process.version);
      expect(report.validationImplementation.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(report.validationImplementation.files.map(file => file.path)).toEqual([
        "scripts/validate-final.ts", "src/final-validation.ts", "src/final-recipe.ts", "src/final-sources.ts",
        "src/full-validation.ts", "src/full-recipe.ts", "src/acceptance.ts", "src/coefficient-shard.ts", "src/chebyshev.ts",
        "src/pilot-validation.ts", "src/reference-derivative.ts", "tests/full-final-accuracy.test.ts",
        "tests/final-validation.test.ts", "tests/reference-derivative.test.ts"
      ]);
      for (const file of report.validationImplementation.files) {
        expect(file.sha256).toBe(hash(await readFile(new URL(`../${file.path}`, import.meta.url), "utf8")));
      }
      const receipt = JSON.parse(await readFile(new URL(`../data/receipts/${body.toLowerCase()}.json`, import.meta.url), "utf8"));
      expect(prepared.shards.map(item => item.descriptor)).toEqual(receipt.shards.map((item: any) => item.descriptor));
    });

    it("retains the complete measured report within the file limit", async () => {
      const text = await readFile(new URL(`../generated/final/${body.toLowerCase()}/accuracy-report.json`, import.meta.url), "utf8");
      expect(Buffer.byteLength(text)).toBeLessThan(ACCEPTANCE_POLICY.maxCommittedFileBytesExclusive);
      expect(JSON.parse(text)).toEqual(validation.report);
      for (const shard of validation.prepared.shards) {
        expect(shard.descriptor.byteLength).toBe(Buffer.byteLength(shard.text));
        expect(shard.descriptor.byteLength).toBeLessThan(ACCEPTANCE_POLICY.maxCommittedFileBytesExclusive);
      }
    });
  });
}
