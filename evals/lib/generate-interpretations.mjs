import { readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";
import { createGenerationClient, GenerationError } from "./generation-backend.mjs";
import { validateEntry } from "./validate-entry.mjs";
import { validateDataset } from "./validate-dataset.mjs";
import { canonicalJson, freezeData, GENERATOR_FILE_BYTES, sha256 } from "./generator-data.mjs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const entrySchema = JSON.parse(read("../schema/meaning-entry.schema.json"));
const planSchema = JSON.parse(read("../schema/generation-plan.schema.json"));
const manifestSchema = JSON.parse(read("../schema/generation-manifest.schema.json"));
const ajv = new Ajv2020({ strict: true, allErrors: true });
ajv.addSchema(entrySchema);
const checkPlan = ajv.compile(planSchema);
const checkManifest = ajv.compile(manifestSchema);
const checkMeaning = ajv.compile({ $ref: `${entrySchema.$id}#/properties/meaning` });
const template = freezeData(JSON.parse(read("../prompts/meaning-v1.json")));

export const INTERPRETATION_GENERATOR_VERSION = "interpretation-generator-v1";
export const MEANING_PROMPT_VERSION = template.version;

// Covers the code, prompt, validator schemas and locked dependency declarations
// used here. This is local byte identity, not a signature or provider receipt.
const implementationFiles = [
  "./generate-interpretations.mjs", "./generator-data.mjs", "./generation-backend.mjs",
  "./validate-entry.mjs", "./validate-dataset.mjs", "../prompts/meaning-v1.json",
  "../schema/meaning-entry.schema.json", "../schema/meaning-dataset.schema.json",
  "../schema/generation-plan.schema.json", "../schema/generation-manifest.schema.json",
  "../package-lock.json"
];
const implementationDigest = sha256(canonicalJson(implementationFiles.map((path) => ({
  path, digest: sha256(read(path))
}))));

const messages = Object.freeze({
  "invalid-sources": "Invalid interpretation source dataset.",
  "invalid-plan": "Invalid interpretation generation plan.",
  "entry-limit": "Source and generated entries exceed the dataset limit.",
  "entry-collision": "Generation entry ids must be distinct from all source and target ids.",
  "source-reference": "Generation source ids must resolve in the supplied source dataset.",
  "incomplete-output": "Interpretation generation did not finish with a complete response.",
  "invalid-output": "Interpretation generation returned an invalid meaning.",
  "artifact-limit": "Interpretation generation exceeds an artifact size limit."
});

export class InterpretationGenerationError extends Error {
  constructor(code) {
    const safeCode = Object.hasOwn(messages, code) ? code : "invalid-output";
    super(messages[safeCode]);
    this.name = "InterpretationGenerationError";
    this.code = safeCode;
  }
}
const fail = (code) => { throw new InterpretationGenerationError(code); };

function snapshot(value, code) {
  try { return freezeData(JSON.parse(canonicalJson(value))); }
  catch { fail(code); }
}

/** Structural plan check; source resolution and combined limits need sources. */
export function validateGenerationPlan(value) {
  let plan;
  try { plan = snapshot(value, "invalid-plan"); }
  catch {
    return { valid: false, errors: [{ path: "/", keyword: "jsonData", message: "must be bounded well-formed JSON data" }] };
  }
  if (!checkPlan(plan)) {
    return { valid: false, errors: checkPlan.errors.map(({ instancePath, keyword, message }) => ({
      path: instancePath || "/", keyword, message
    })) };
  }
  const errors = [];
  plan.targets.forEach(({ factor }, index) => {
    if (factor.kind === "aspect" && factor.a === factor.b) {
      errors.push({ path: `/targets/${index}/factor`, keyword: "distinctBodies", message: "aspect bodies must differ" });
    }
  });
  return { valid: errors.length === 0, errors };
}

function makeRequest(target, sourceIndex, seed) {
  return freezeData({
    schemaVersion: "1.0.0",
    promptVersion: template.version,
    system: template.system,
    prompt: canonicalJson({
      task: template.task,
      language: "en", tradition: "western-tropical", factor: target.factor,
      sources: target.sourceEntryIds.map((id) => sourceIndex.get(id))
    }),
    seed
  });
}

function assemble(target, meaning, plan, backend, requestDigest) {
  return {
    schemaVersion: "1.0.0", id: target.id, language: "en", tradition: "western-tropical",
    factor: target.factor, meaning,
    provenance: {
      kind: "generated", backend: backend.id, model: backend.model,
      promptVersion: template.version, inputDigest: requestDigest,
      sourceEntryIds: target.sourceEntryIds, reviewStatus: "unreviewed"
    },
    license: plan.license
  };
}

/**
 * Generate a complete dataset in memory. No I/O writes or implicit providers.
 * The model supplies only meaning; identity/provenance/rights labels are local.
 * Parsed JSON and registered adapters are trusted host inputs, not a sandbox.
 */
export async function generateInterpretations(sourceValue, planValue, options = {}) {
  const sources = snapshot(sourceValue, "invalid-sources");
  const plan = snapshot(planValue, "invalid-plan");
  if (!validateDataset(sources).valid) fail("invalid-sources");
  if (!validateGenerationPlan(plan).valid) fail("invalid-plan");
  if (sources.entries.length + plan.targets.length > 256) fail("entry-limit");

  const sourceIndex = new Map(sources.entries.map((entry) => [entry.id, entry]));
  const ids = new Set(sourceIndex.keys());
  for (const target of plan.targets) {
    if (ids.has(target.id)) fail("entry-collision");
    ids.add(target.id);
    if (target.sourceEntryIds.some((id) => !sourceIndex.has(id))) fail("source-reference");
  }

  // Keep options separate from data, since registered adapters contain functions.
  if (!options || typeof options !== "object" || Array.isArray(options) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(options))) throw new GenerationError("invalid-options");
  const descriptors = Object.getOwnPropertyDescriptors(options);
  if (Reflect.ownKeys(descriptors).some((key) => typeof key !== "string" ||
      !["backend", "adapters", "limits", "signal"].includes(key) ||
      !Object.hasOwn(descriptors[key], "value"))) throw new GenerationError("invalid-options");
  const { signal, ...clientOptions } = options;
  if (Object.hasOwn(options, "signal") && !(signal instanceof AbortSignal)) throw new GenerationError("invalid-options");
  const client = createGenerationClient(clientOptions);
  if (signal?.aborted) throw new GenerationError("aborted");
  if (plan.targets.length > client.limits.maxCalls) throw new GenerationError("call-limit");
  let requests;
  try { requests = plan.targets.map((target) => makeRequest(target, sourceIndex, plan.seed)); }
  catch { throw new GenerationError("input-limit"); }
  // Preflight every request before any backend dispatch. These fields use the
  // backend contract's fixed order, including JSON escapes and its metadata.
  if (requests.some((request) => Buffer.byteLength(JSON.stringify(request), "utf8") > client.limits.maxInputBytes)) {
    throw new GenerationError("input-limit");
  }

  const dataset = { schemaVersion: "1.0.0", id: plan.id, entries: [...sources.entries] };
  const calls = [];
  for (let index = 0; index < requests.length; index++) {
    const response = await client.generate(requests[index], signal ? { signal } : {});
    if (response.finishReason !== "stop") fail("incomplete-output");
    let meaning;
    try { meaning = snapshot(JSON.parse(response.text), "invalid-output"); }
    catch { fail("invalid-output"); }
    if (!checkMeaning(meaning)) fail("invalid-output");
    const target = plan.targets[index];
    const entry = assemble(target, meaning, plan, response.backend, response.requestDigest);
    if (!validateEntry(entry).valid) fail("invalid-output");
    dataset.entries.push(entry);
    calls.push({
      entryId: target.id, requestDigest: response.requestDigest,
      responseDigest: sha256(response.text), finishReason: response.finishReason
    });
    try { canonicalJson(dataset, GENERATOR_FILE_BYTES - 1); }
    catch { fail("artifact-limit"); }
  }
  if (!validateDataset(dataset).valid) fail("invalid-output");
  const manifest = {
    schemaVersion: "1.0.0",
    generator: { version: INTERPRETATION_GENERATOR_VERSION, implementationDigest, node: process.versions.node },
    prompt: { version: template.version, digest: sha256(canonicalJson(template)) },
    sources: { id: sources.id, entryIds: sources.entries.map(({ id }) => id), digest: sha256(canonicalJson(sources)) },
    plan,
    backend: client.backend, limits: client.limits, calls,
    datasetDigest: sha256(canonicalJson(dataset))
  };
  if (!checkManifest(manifest)) fail("invalid-output");
  try { canonicalJson(manifest, GENERATOR_FILE_BYTES - 1); }
  catch { fail("artifact-limit"); }
  return freezeData({ dataset, manifest });
}
