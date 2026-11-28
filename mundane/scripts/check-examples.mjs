import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const project = new URL("../", import.meta.url);
await mkdir(new URL("generated/", project), { recursive: true });
const scratch = await mkdtemp(fileURLToPath(new URL("generated/usage-", project)));
try {
  const outfile = `${scratch}/usage.mjs`;
  await build({
    entryPoints: [fileURLToPath(new URL("examples/usage.ts", project))],
    outfile, bundle: true, platform: "node", format: "esm", target: "node22",
    alias: {
      "astronomy-engine": fileURLToPath(new URL("node_modules/astronomy-engine/esm/astronomy.js", project))
    }
  });
  const { runUsageExamples } = await import(pathToFileURL(outfile).href);
  const summary = runUsageExamples();
  assert(summary.annualIngresses > 0 && summary.rangedLunations > 0);
  assert(summary.eventLabels.includes("Aries") && summary.eventLabels.includes("new") &&
    summary.eventLabels.includes("full"));
  assert.deepEqual(summary.refusal, { status: "refused", reason: "sample-budget", events: [] });
  assert.equal(summary.firstEvent.factorList.label, "traditional conventions, not predictions");
  assert(Object.isFrozen(summary.firstEvent.bodies));
  assert(Object.isFrozen(summary.customFactors));
  assert(summary.firstEvent.factorList.items.every(factor => {
    const source = factor.source.split("/").slice(1).reduce((value, key) => value?.[key], summary.firstEvent);
    return source !== undefined;
  }));
  assert.deepEqual(JSON.parse(JSON.stringify(summary)), summary);
  console.log("PASS: runnable annual ingress, range lunation, chronological report, chart fields, custom factor analysis, and atomic refusal examples.");
  console.log("Integration and usage only; no independent astronomical accuracy claim.");
} finally {
  await rm(scratch, { recursive: true, force: true });
}
