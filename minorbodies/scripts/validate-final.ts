/** Explicit offline final accuracy measurements. Missing source data or ERFA must fail. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { ACCEPTANCE_POLICY } from "../src/acceptance.ts";
import { MINOR_BODY_NAMES, isMinorBody } from "../src/catalog.ts";
import type { MinorBody } from "../src/catalog.ts";
import { readFinalBodySources } from "../src/final-sources.ts";
import { measureFinalAccuracy } from "../src/final-validation.ts";
import { prepareFullBody } from "./generate-full.ts";

const hash = (text: string) => createHash("sha256").update(text).digest("hex");

/** Comparison identity is separate from the immutable fit and final-source generator identities. */
async function validationImplementation() {
  const project = new URL("../", import.meta.url);
  const files = [];
  for (const path of ["scripts/validate-final.ts", "src/final-validation.ts", "src/final-recipe.ts",
    "src/final-sources.ts", "src/full-validation.ts", "src/full-recipe.ts", "src/acceptance.ts",
    "src/coefficient-shard.ts", "src/chebyshev.ts", "src/pilot-validation.ts", "src/reference-derivative.ts",
    "tests/full-final-accuracy.test.ts", "tests/final-validation.test.ts", "tests/reference-derivative.test.ts"]) {
    files.push({ path, sha256: hash(await readFile(new URL(path, project), "utf8")) });
  }
  const record = { schema: "minorbodies-final-validation-implementation-v1", nodeVersion: process.version, files };
  return { ...record, sha256: hash(JSON.stringify(record)) };
}

/** Save completed measurements, including failures, before the CLI sets its failure exit status. */
export async function validateFinalBody(body: MinorBody) {
  const implementation = await validationImplementation();
  const prepared = await prepareFullBody(body);
  const source = await readFinalBodySources(body);
  assert.equal(source.source.baseSourceManifestSha256, prepared.sourceManifestSha256,
    "Final reference does not identify the frozen fit source.");
  const measured = await measureFinalAccuracy({
    body, shards: prepared.shards.map(item => item.shard), validationRows: source.rows,
    calculateAt: jdTt => {
      const result = prepared.ephemeris.calculate(body, { jd: jdTt, scale: "tt" });
      if (result.status !== "ok") throw new Error(`Final result refused for ${body} at TT JD ${jdTt}: ${result.reason}`);
      return result;
    }
  });
  const report = { ...measured,
    shardDescriptors: prepared.shards.map(item => item.descriptor),
    sourceIdentity: prepared.sourceIdentity, engineSource: prepared.ephemeris.engineSource,
    validationImplementation: implementation,
    finalReferenceSource: { sourceManifestSha256: source.sourceManifestSha256,
      baseSourceManifestSha256: source.source.baseSourceManifestSha256,
      recipeSha256: hash(JSON.stringify(source.source.recipe)),
      generatorSha256: hash(JSON.stringify(source.source.generator)) }
  };
  assert.deepEqual(await validationImplementation(), implementation, "Validation implementation changed during comparison.");
  assert.equal(report.sourceManifestSha256, prepared.sourceManifestSha256, "Fit source identity changed during validation.");
  assert.equal(report.generatorSha256, prepared.generatorSha256, "Fit generator identity changed during validation.");
  const directory = new URL(`../generated/final/${body.toLowerCase()}/`, import.meta.url);
  await mkdir(directory, { recursive: true });
  const text = JSON.stringify(report, null, 2) + "\n";
  assert(Buffer.byteLength(text) < ACCEPTANCE_POLICY.maxCommittedFileBytesExclusive, "Final report exceeds the file-size limit.");
  await writeFile(new URL("accuracy-report.json", directory), text);
  return { prepared, source, report };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  assert(args.length === 0 || (args.length === 2 && args[0] === "--body" && isMinorBody(args[1])),
    "Usage: node --import ./scripts/register-source.mjs --experimental-strip-types scripts/validate-final.ts [--body Chiron|Ceres|Pallas|Juno|Vesta]");
  const bodies = args.length === 2 ? [args[1] as MinorBody] : MINOR_BODY_NAMES;
  for (const body of bodies) {
    const { report } = await validateFinalBody(body);
    console.log(JSON.stringify(report, null, 2));
    if (!report.passed) process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
