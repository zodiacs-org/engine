import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { goldenCases, projectGoldenResult, runGoldenCase } from "../.cache/fixtures-build/scripts/golden-data.js";

const check = process.argv.length === 3 && process.argv[2] === "--check";
if (process.argv.length !== 2 && !check) throw new Error("Usage: generate-golden.mjs [--check]");
// Byte checks use the same runtime that generated the committed fixtures.
if (process.versions.node !== "22.22.2") throw new Error("Golden generation/check requires Node 22.22.2.");
const archiveUrl = new URL("../../artifacts/zodiacs-engine-1.0.0.tgz", import.meta.url);
const digest = createHash("sha256").update(await readFile(archiveUrl)).digest("hex");
const receipt = (await readFile(new URL("../../artifacts/zodiacs-engine-1.0.0.sha256", import.meta.url), "utf8")).split(/\s+/)[0];
if (digest !== receipt) throw new Error("Carried engine archive does not match its receipt.");
const locked = JSON.parse(await readFile(new URL("../package-lock.json", import.meta.url), "utf8"));
const integrity = "sha512-" + createHash("sha512").update(await readFile(archiveUrl)).digest("base64");
if (locked.packages["node_modules/@zodiacs/engine"].integrity !== integrity) {
  throw new Error("Locked engine dependency does not match the carried archive.");
}
const installed = JSON.parse(await readFile(new URL("../node_modules/@zodiacs/engine/package.json", import.meta.url), "utf8"));
if (installed.version !== "1.0.0") throw new Error("Install the locked carried engine before generating fixtures.");

// Compute all payloads and enforce size limits before writing any fixture.
const files = [];
const entries = [];
for (const spec of goldenCases) {
  const result = runGoldenCase(spec);
  const projection = projectGoldenResult(result);
  const content = JSON.stringify({ schema: "zodiacs.relocation-golden.v1", id: spec.id,
    reference: "installed-carried-engine-regression;not-independent-accuracy", request: spec,
    output: projection }, null, 2) + "\n";
  const bytes = Buffer.byteLength(content);
  if (bytes > 100_000) throw new Error(`Golden fixture exceeds compact data limit: ${spec.id}`);
  files.push([spec.id + ".json", content]);
  entries.push({ file: spec.id + ".json", bytes,
    sha256: createHash("sha256").update(content).digest("hex") });
}
const first = projectGoldenResult(runGoldenCase(goldenCases[0]));
files.push(["manifest.json", JSON.stringify({ schema: "zodiacs.relocation-golden-manifest.v1",
  generator: "scripts/generate-golden.mjs", node: process.versions.node,
  reference: "regression-only;synthetic-births;no-independent-astronomical-accuracy-claim",
  archive: { path: "../artifacts/zodiacs-engine-1.0.0.tgz", sha256: digest, integrity },
  engine: first.sampling.natalReceipt.engine,
  projection: "geometry-and-crossing-metadata;full-position-receipts;observer-axis-summaries;full-observer-receipts-replayed-in-tests",
  fixtures: entries }, null, 2) + "\n"]);
for (const [name, content] of files) {
  const target = new URL("../test/fixtures/" + name, import.meta.url);
  if (check) {
    if (await readFile(target, "utf8") !== content) throw new Error(`Golden fixture is stale: ${fileURLToPath(target)}`);
  } else {
    await writeFile(target, content);
  }
}
console.log(`Golden fixtures ${check ? "checked" : "generated"}: ${entries.length}; archive ${digest}.`);
