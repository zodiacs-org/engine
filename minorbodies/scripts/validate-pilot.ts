/** Offline validation against frozen, held-out JPL rows and an independent ERFA reducer. */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { loadMinorBodyEphemeris } from "../src/ephemeris.ts";
import { measurePilotAccuracy, reduceWithIndependentErfa } from "../src/pilot-validation.ts";
import { preparePilot } from "./generate-pilot.ts";

export async function validatePilot() {
  const pilot = await preparePilot();
  const rawSources = new Map(pilot.sourceManifest.entries.map((entry, index) =>
    [entry.rawFile, pilot.captures[index]!.capture.raw] as const));
  const ephemeris = await loadMinorBodyEphemeris({
    sourceManifestText: pilot.sourceManifestText,
    sourceManifestSha256: pilot.descriptor.sourceManifestSha256,
    rawSources, shards: [{ text: pilot.text, descriptor: pilot.descriptor }]
  });
  const reference = await reduceWithIndependentErfa(pilot.validationRows);
  const report = measurePilotAccuracy({
    shard: pilot.shard, validationRows: pilot.validationRows, reference,
    calculateAt: jdTt => {
      const result = ephemeris.calculate(pilot.recipe.body, { jd: jdTt, scale: "tt" });
      if (result.status !== "ok") throw new Error(`Pilot result refused at TT JD ${jdTt}: ${result.reason}`);
      return result;
    }
  });
  return { pilot, ephemeris, reference, report: { ...report, shardDescriptor: pilot.descriptor,
    sourceIdentity: pilot.sourceManifest.identity, engineSource: ephemeris.engineSource } };
}

async function main(): Promise<void> {
  assert.equal(process.argv.length, 2, "Usage: node --import ./scripts/register-source.mjs --experimental-strip-types scripts/validate-pilot.ts");
  const { reference, report } = await validatePilot();
  const directory = new URL("../generated/pilot/", import.meta.url);
  await mkdir(directory, { recursive: true });
  for (const [file, data] of [["reference-erfa.json", reference], ["accuracy-report.json", report]] as const) {
    const text = JSON.stringify(data, null, 2) + "\n";
    assert(Buffer.byteLength(text) < 2_000_000, "Split generated reference data before reaching the size limit.");
    await writeFile(new URL(file, directory), text);
  }
  console.log(JSON.stringify(report, null, 2));
  // A failed comparison is written before returning a failing status.
  if (!report.passed) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
