/** Explicit offline full-data validation. Missing local captures are errors, never skips. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { ACCEPTANCE_POLICY } from "../src/acceptance.ts";
import { MINOR_BODY_NAMES, isMinorBody } from "../src/catalog.ts";
import type { MinorBody } from "../src/catalog.ts";
import { measureFullAccuracy } from "../src/full-validation.ts";
import { readSpeedBodySources } from "../src/speed-reference-sources.ts";
import { prepareFullBody } from "./generate-full.ts";

const hash = (text: string) => createHash("sha256").update(text).digest("hex");

/** Explicitly identify the comparison implementation, separately from the coefficient generator. */
async function validationImplementation() {
  const project = new URL("../", import.meta.url);
  const files = [];
  for (const path of ["scripts/validate-full.ts", "src/full-validation.ts", "src/full-recipe.ts",
    "src/acceptance.ts", "tests/full-accuracy.test.ts", "src/pilot-validation.ts", "src/reference-derivative.ts",
    "src/speed-reference-sources.ts", "tests/reference-derivative.test.ts"]) {
    files.push({ path, sha256: hash(await readFile(new URL(path, project), "utf8")) });
  }
  const record = { schema: "minorbodies-full-validation-implementation-v2", nodeVersion: process.version, files };
  return { ...record, sha256: hash(JSON.stringify(record)) };
}

/** Every completed numerical comparison is saved, including failed acceptance gates. */
export async function validateFullBody(body: MinorBody) {
  const implementation = await validationImplementation();
  const prepared = await prepareFullBody(body);
  const speed = await readSpeedBodySources(body);
  assert.equal(speed.source.baseSourceManifestSha256, prepared.sourceManifestSha256);
  const measured = await measureFullAccuracy({
    body, shards: prepared.shards.map(item => item.shard), validationRows: prepared.validationRows, speedRows: speed.rows,
    calculateAt: jdTt => {
      const result = prepared.ephemeris.calculate(body, { jd: jdTt, scale: "tt" });
      if (result.status !== "ok") throw new Error(`Full result refused for ${body} at TT JD ${jdTt}: ${result.reason}`);
      return result;
    }
  });
  const report = { ...measured,
    shardDescriptors: prepared.shards.map(item => item.descriptor),
    sourceIdentity: prepared.sourceIdentity, engineSource: prepared.ephemeris.engineSource,
    validationImplementation: implementation,
    speedReferenceSource: { sourceManifestSha256: speed.sourceManifestSha256,
      baseSourceManifestSha256: speed.source.baseSourceManifestSha256,
      recipeSha256: speed.source.recipeSha256, generatorSha256: speed.source.generatorSha256 }
  };
  assert.deepEqual(await validationImplementation(), implementation, "Validation implementation changed during comparison.");
  assert.equal(report.sourceManifestSha256, prepared.sourceManifestSha256, "Source identity changed during validation.");
  assert.equal(report.generatorSha256, prepared.generatorSha256, "Generator identity changed during validation.");
  const directory = new URL(`../generated/full/${body.toLowerCase()}/`, import.meta.url);
  await mkdir(directory, { recursive: true });
  const text = JSON.stringify(report, null, 2) + "\n";
  assert(Buffer.byteLength(text) < ACCEPTANCE_POLICY.maxCommittedFileBytesExclusive, "Report exceeds the file-size limit.");
  await writeFile(new URL("accuracy-report.json", directory), text);
  return { prepared, speed, report };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  assert(args.length === 0 || (args.length === 2 && args[0] === "--body" && isMinorBody(args[1])),
    "Usage: node --import ./scripts/register-source.mjs --experimental-strip-types scripts/validate-full.ts [--body Chiron|Ceres|Pallas|Juno|Vesta]");
  const bodies = args.length === 2 ? [args[1] as MinorBody] : MINOR_BODY_NAMES;
  for (const body of bodies) {
    const { report } = await validateFullBody(body);
    console.log(JSON.stringify(report, null, 2));
    if (!report.passed) process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
