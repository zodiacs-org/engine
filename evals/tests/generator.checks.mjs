import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import {
  generateInterpretations, validateGenerationPlan, InterpretationGenerationError,
  MEANING_PROMPT_VERSION, INTERPRETATION_GENERATOR_VERSION
} from "../lib/generate-interpretations.mjs";
import { canonicalJson, freezeData, GENERATOR_FILE_BYTES } from "../lib/generator-data.mjs";
import { validateDataset } from "../lib/validate-dataset.mjs";

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const seed = read("../data/seed.json");
const hash = (text) => `sha256:${createHash("sha256").update(text, "utf8").digest("hex")}`;
const draft = { summary: "An original test reflection.", themes: ["reflection"], epistemicStatus: "symbolic-interpretation" };
const plan = () => ({
  schemaVersion: "1.0.0", id: "test-generation", seed: 0,
  license: { spdxId: "MIT", attribution: "Original inline test contributions." },
  targets: seed.entries.map((entry, index) => ({
    id: `draft-${index}`, factor: structuredClone(entry.factor), sourceEntryIds: [entry.id]
  }))
});
const adapter = (generate) => ({ id: "local-test", model: "inline-test-model", version: "test-v1", mode: "offline", generate });
const options = (generate) => ({ backend: "local-test", adapters: [adapter(generate)] });
const isCode = (code) => (error) => {
  assert.equal(error.code, code);
  assert.equal(error.cause, undefined);
  assert.ok(!error.message.includes("private-marker"));
  return true;
};

test("generator produces a schema-valid closed dataset across all seed factor categories", async () => {
  const inputPlan = plan();
  const originals = structuredClone({ seed, inputPlan });
  const result = await generateInterpretations(freezeData(structuredClone(seed)), freezeData(inputPlan));
  assert.equal(validateDataset(result.dataset).valid, true);
  assert.deepEqual(seed, originals.seed);
  assert.deepEqual(inputPlan, originals.inputPlan);
  assert.deepEqual(result.dataset.entries.slice(0, seed.entries.length), seed.entries);
  const generated = result.dataset.entries.slice(seed.entries.length);
  assert.deepEqual(generated.map(({ factor }) => factor), seed.entries.map(({ factor }) => factor));
  for (const [i, entry] of generated.entries()) {
    assert.match(entry.meaning.summary, /^Offline mock /);
    assert.equal(entry.provenance.kind, "generated");
    assert.equal(entry.provenance.reviewStatus, "unreviewed");
    assert.equal(entry.provenance.promptVersion, MEANING_PROMPT_VERSION);
    assert.equal(entry.provenance.inputDigest, result.manifest.calls[i].requestDigest);
    assert.deepEqual(entry.provenance.sourceEntryIds, [seed.entries[i].id]);
    assert.deepEqual(entry.license, inputPlan.license);
  }
  assert.ok(Object.isFrozen(result.dataset.entries[0].meaning.themes));
  assert.ok(Object.isFrozen(result.dataset.entries.at(-1).factor));
  assert.ok(Object.isFrozen(result.manifest.plan.targets));
  assert.throws(() => { result.manifest.backend.model = "changed"; }, TypeError);
});

test("manifest schemas load offline and digests bind inputs, raw responses and dataset bytes", async () => {
  const requests = [];
  const text = ` \n${JSON.stringify(draft)}\r\n`;
  const result = await generateInterpretations(seed, plan(), options((request) => {
    requests.push(request);
    return { text, finishReason: "stop" };
  }));
  const ajv = new Ajv2020({ strict: true });
  ajv.addSchema(read("../schema/meaning-entry.schema.json"));
  ajv.addSchema(read("../schema/generation-plan.schema.json"));
  const validate = ajv.compile(read("../schema/generation-manifest.schema.json"));
  assert.equal(validate(result.manifest), true, JSON.stringify(validate.errors));
  const { manifest } = result;
  assert.equal(manifest.generator.version, INTERPRETATION_GENERATOR_VERSION);
  assert.equal(manifest.generator.node, process.versions.node);
  assert.match(manifest.generator.implementationDigest, /^sha256:[a-f0-9]{64}$/);
  assert.equal(manifest.sources.digest, hash(canonicalJson(seed)));
  assert.equal(manifest.datasetDigest, hash(canonicalJson(result.dataset)));
  assert.equal(manifest.prompt.digest, hash(canonicalJson(read("../prompts/meaning-v1.json"))));
  assert.deepEqual(manifest.sources.entryIds, seed.entries.map(({ id }) => id));
  assert.deepEqual(manifest.plan, plan());
  for (const [i, request] of requests.entries()) {
    const prompt = JSON.parse(request.prompt);
    assert.deepEqual(prompt.factor, seed.entries[i].factor);
    assert.deepEqual(prompt.sources, [seed.entries[i]]);
    assert.equal(request.seed, 0);
    assert.ok(Object.isFrozen(request));
    assert.equal(manifest.calls[i].requestDigest, hash(JSON.stringify({
      schemaVersion: "1.0.0", backend: manifest.backend, limits: manifest.limits, request
    })));
    assert.equal(manifest.calls[i].responseDigest, hash(text));
  }
  const invalidManifest = structuredClone(manifest);
  invalidManifest.calls[0].finishReason = "length";
  assert.equal(validate(invalidManifest), false);
});

test("source closure includes generated ancestors without relabeling provenance or licenses", async () => {
  const firstPlan = plan();
  firstPlan.targets = firstPlan.targets.slice(0, 1);
  const first = await generateInterpretations(seed, firstPlan);
  const nextPlan = plan();
  nextPlan.id = "descendant-dataset";
  nextPlan.targets = [{ id: "descendant", factor: seed.entries[0].factor, sourceEntryIds: [firstPlan.targets[0].id] }];
  const next = await generateInterpretations(first.dataset, nextPlan);
  assert.deepEqual(next.dataset.entries.slice(0, -1), first.dataset.entries);
  assert.equal(validateDataset(next.dataset).valid, true);
  assert.deepEqual(next.dataset.entries.at(-1).provenance.sourceEntryIds, ["draft-0"]);
});

test("complete input and invocation validation happens before any backend dispatch", async () => {
  let calls = 0;
  const backendOptions = options(() => { calls++; return { text: JSON.stringify(draft), finishReason: "stop" }; });
  const scenarios = [
    ["invalid-plan", (s, p) => { p.targets.at(-1).factor.body = "private-marker"; }],
    ["invalid-plan", (s, p) => { p.targets[2].factor.b = p.targets[2].factor.a; }],
    ["invalid-plan", (s, p) => { p.seed = -1; }],
    ["invalid-plan", (s, p) => { p.license.spdxId = "unknown"; }],
    ["invalid-plan", (s, p) => { p.targets[0].sourceEntryIds = []; }],
    ["invalid-plan", (s, p) => { p.targets[0].sourceEntryIds.push(p.targets[0].sourceEntryIds[0]); }],
    ["invalid-plan", (s, p) => { p.targets[0].extra = true; }],
    ["invalid-sources", (s) => { s.entries[0].license = {}; }],
    ["invalid-sources", (s) => { s.entries[0].meaning.summary = "\ud800"; }],
    ["entry-collision", (s, p) => { p.targets.at(-1).id = p.targets[0].id; }],
    ["entry-collision", (s, p) => { p.targets[0].id = s.entries[0].id; }],
    ["source-reference", (s, p) => { p.targets.at(-1).sourceEntryIds = ["missing-source"]; }],
    ["source-reference", (s, p) => { p.targets.at(-1).sourceEntryIds = [p.targets[0].id]; }]
  ];
  for (const [code, change] of scenarios) {
    const s = structuredClone(seed), p = plan();
    change(s, p);
    await assert.rejects(generateInterpretations(s, p, backendOptions), isCode(code));
  }
  await assert.rejects(generateInterpretations(seed, plan(), { ...backendOptions, limits: { maxCalls: 1 } }), isCode("call-limit"));
  await assert.rejects(generateInterpretations(seed, plan(), { ...backendOptions, limits: { maxInputBytes: 10 } }), isCode("input-limit"));
  await assert.rejects(generateInterpretations(seed, plan(), { ...backendOptions, signal: {} }), isCode("invalid-options"));
  await assert.rejects(generateInterpretations(seed, plan(), { ...backendOptions, unexpected: true }), isCode("invalid-options"));
  await assert.rejects(generateInterpretations(seed, plan(), { backend: "unavailable" }), isCode("invalid-backend"));
  assert.equal(calls, 0);
});

test("plan validator rejects missing metadata, excessive targets and invalid semantic factors", () => {
  assert.equal(validateGenerationPlan(plan()).valid, true);
  for (const field of ["schemaVersion", "id", "seed", "license", "targets"]) {
    const input = plan();
    delete input[field];
    assert.equal(validateGenerationPlan(input).valid, false);
  }
  const input = plan();
  input.targets = Array(256).fill(input.targets[0]);
  assert.equal(validateGenerationPlan(input).valid, false);
  assert.equal(validateGenerationPlan(null).valid, false);
  input.targets = [{ ...plan().targets[2], factor: { ...plan().targets[2].factor, b: "Sun" } }];
  assert.equal(validateGenerationPlan(input).errors[0].keyword, "distinctBodies");
});

test("combined entry cap includes copied sources and permits its exact boundary", async () => {
  const source = { ...seed, entries: Array.from({ length: 255 }, (_, i) => ({ ...seed.entries[0], id: `source-${i}` })) };
  const input = plan();
  input.targets = [{ id: "new-meaning", factor: seed.entries[0].factor, sourceEntryIds: ["source-0"] }];
  const result = await generateInterpretations(source, input);
  assert.equal(result.dataset.entries.length, 256);
  input.targets.push({ ...input.targets[0], id: "too-many" });
  await assert.rejects(generateInterpretations(source, input), isCode("entry-limit"));
});

test("large later prompt is refused before an earlier valid target can run", async () => {
  const s = structuredClone(seed);
  s.entries = Array.from({ length: 32 }, (_, i) => ({ ...s.entries[0], id: `source-${i}`, meaning: {
    ...s.entries[0].meaning, summary: "😀".repeat(1600)
  } }));
  const p = plan();
  p.targets = [
    { id: "small", factor: s.entries[0].factor, sourceEntryIds: ["source-0"] },
    { id: "large", factor: s.entries[0].factor, sourceEntryIds: s.entries.map(({ id }) => id) }
  ];
  let calls = 0;
  await assert.rejects(generateInterpretations(s, p, options(() => { calls++; })), isCode("input-limit"));
  assert.equal(calls, 0);
});

test("valid meanings that exceed the aggregate dataset byte cap discard the run", async () => {
  const source = structuredClone(seed);
  const largeMeaning = { ...draft, summary: "😀".repeat(1600) };
  source.entries = Array.from({ length: 140 }, (_, i) => ({
    ...source.entries[0], id: `large-source-${i}`, meaning: largeMeaning
  }));
  assert.ok(Buffer.byteLength(canonicalJson(source)) < GENERATOR_FILE_BYTES);
  const input = plan();
  input.targets = Array.from({ length: 116 }, (_, i) => ({
    id: `new-${i}`, factor: source.entries[0].factor, sourceEntryIds: [source.entries[0].id]
  }));
  let calls = 0;
  await assert.rejects(generateInterpretations(source, input, options(() => {
    calls++;
    return { text: JSON.stringify(largeMeaning), finishReason: "stop" };
  })), isCode("artifact-limit"));
  assert.ok(calls > 0 && calls < input.targets.length);
  assert.equal(source.entries.length, 140);
});

test("malformed, invented metadata, invalid Unicode and incomplete outputs never become entries", async () => {
  const texts = [
    "private-marker", "null", "[]", "```json\n{}\n```", JSON.stringify(seed.entries[0]),
    JSON.stringify({ ...draft, factor: seed.entries[0].factor }),
    JSON.stringify({ ...draft, provenance: { kind: "authored" } }),
    JSON.stringify({ ...draft, themes: ["same", "same"] }),
    JSON.stringify({ ...draft, summary: "" }), JSON.stringify({ ...draft, summary: "x".repeat(1601) }),
    JSON.stringify({ ...draft, epistemicStatus: "proven" }), JSON.stringify({ ...draft, summary: "\ud800" })
  ];
  for (const text of texts) {
    let calls = 0;
    await assert.rejects(generateInterpretations(seed, plan(), options(() => {
      calls++;
      return { text, finishReason: "stop" };
    })), isCode("invalid-output"));
    assert.equal(calls, 1);
  }
  for (const finishReason of ["length", "refusal"]) {
    await assert.rejects(generateInterpretations(seed, plan(), options(() => ({
      text: JSON.stringify(draft), finishReason
    }))), isCode("incomplete-output"));
  }
  assert.equal(new InterpretationGenerationError("private-marker").code, "invalid-output");
});

test("input snapshots survive asynchronous caller changes and failure stops subsequent calls", async () => {
  const s = structuredClone(seed), p = plan();
  const original = structuredClone({ s, p });
  const result = await generateInterpretations(s, p, options(() => {
    s.entries[0].meaning.summary = "changed";
    p.targets.length = 0;
    p.license.attribution = "changed";
    return { text: JSON.stringify(draft), finishReason: "stop" };
  }));
  assert.deepEqual(result.dataset.entries.slice(0, seed.entries.length), original.s.entries);
  assert.deepEqual(result.manifest.plan, original.p);
  let calls = 0;
  await assert.rejects(generateInterpretations(seed, plan(), options(() => {
    calls++;
    if (calls === 2) throw new Error("private-marker");
    return { text: JSON.stringify(draft), finishReason: "stop" };
  })), isCode("backend-failure"));
  assert.equal(calls, 2);
});

test("pipeline cancellation and deadlines propagate without returning partial results", async () => {
  const controller = new AbortController();
  let calls = 0;
  await assert.rejects(generateInterpretations(seed, plan(), {
    ...options(() => { calls++; controller.abort("private-marker"); return new Promise(() => {}); }),
    signal: controller.signal
  }), isCode("aborted"));
  await assert.rejects(generateInterpretations(seed, plan(), { signal: controller.signal }), isCode("aborted"));
  assert.equal(calls, 1);
  await assert.rejects(generateInterpretations(seed, plan(), {
    ...options(() => new Promise(() => {})), limits: { timeoutMs: 1 }
  }), isCode("timeout"));
});

function reverseKeys(value) {
  if (Array.isArray(value)) return value.map(reverseKeys);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).reverse().map(([k, v]) => [k, reverseKeys(v)]));
  return value;
}

test("canonical property order and repeated invocations produce identical mock artifacts", async () => {
  const first = await generateInterpretations(seed, plan());
  const second = await generateInterpretations(reverseKeys(seed), reverseKeys(plan()));
  assert.deepEqual(second, first);
  assert.equal(canonicalJson(second), canonicalJson(first));
  const changed = plan();
  changed.seed = 1;
  const next = await generateInterpretations(seed, changed);
  assert.notEqual(next.manifest.calls[0].requestDigest, first.manifest.calls[0].requestDigest);
  assert.notEqual(next.manifest.datasetDigest, first.manifest.datasetDigest);
  const editedSource = structuredClone(seed);
  editedSource.entries[0].license.attribution += " Edited.";
  const edited = await generateInterpretations(editedSource, plan());
  assert.notEqual(edited.manifest.sources.digest, first.manifest.sources.digest);
  assert.notEqual(edited.manifest.calls[0].requestDigest, first.manifest.calls[0].requestDigest);
});

test("same invocation with different raw responses retains distinct response identity", async () => {
  const first = await generateInterpretations(seed, plan(), options(() => ({ text: JSON.stringify(draft), finishReason: "stop" })));
  const second = await generateInterpretations(seed, plan(), options(() => ({ text: ` ${JSON.stringify(draft)}`, finishReason: "stop" })));
  assert.deepEqual(first.dataset, second.dataset);
  assert.equal(first.manifest.calls[0].requestDigest, second.manifest.calls[0].requestDigest);
  assert.notEqual(first.manifest.calls[0].responseDigest, second.manifest.calls[0].responseDigest);
});

test("mock generation is repeatable in fresh processes and different working directories", () => {
  const moduleUrl = new URL("../lib/generate-interpretations.mjs", import.meta.url).href;
  const seedUrl = new URL("../data/seed.json", import.meta.url).href;
  const script = `
    import { readFileSync } from 'node:fs';
    import { generateInterpretations } from ${JSON.stringify(moduleUrl)};
    const sources = JSON.parse(readFileSync(new URL(${JSON.stringify(seedUrl)})));
    globalThis.fetch = () => { throw new Error('network forbidden'); };
    process.stdout.write(JSON.stringify(await generateInterpretations(sources, ${JSON.stringify(plan())})));
  `;
  const outputs = [new URL("../", import.meta.url), new URL("../../", import.meta.url)].map((cwd) =>
    execFileSync(process.execPath, ["--input-type=module", "-e", script], { cwd, encoding: "utf8", timeout: 30000 }));
  assert.equal(outputs[0], outputs[1]);
});

test("canonical JSON preserves string bytes, bounds UTF-8 and refuses non-JSON host values", () => {
  assert.equal(canonicalJson({ b: -0, a: "\r\n😀" }), '{"a":"\\r\\n😀","b":0}');
  const encoded = canonicalJson({ text: "😀\"\n" });
  const bytes = Buffer.byteLength(encoded);
  assert.equal(canonicalJson({ text: "😀\"\n" }, bytes), encoded);
  assert.throws(() => canonicalJson({ text: "😀\"\n" }, bytes - 1), TypeError);
  assert.equal(GENERATOR_FILE_BYTES, 1_048_576);
  const cycle = {}; cycle.cycle = cycle;
  for (const value of [undefined, NaN, Infinity, 1n, new Date(), new Set(), cycle, [1, , 2], "\ud800", { a: undefined }]) {
    assert.throws(() => canonicalJson(value), TypeError);
  }
  let getters = 0;
  assert.throws(() => canonicalJson({ get value() { getters++; return 1; } }), TypeError);
  assert.equal(getters, 0);
  assert.throws(() => canonicalJson("x".repeat(GENERATOR_FILE_BYTES)), TypeError);
  let deep = {};
  for (let i = 0; i < 34; i++) deep = { child: deep };
  assert.throws(() => canonicalJson(deep), TypeError);
  const shared = { value: 1 };
  assert.equal(canonicalJson([shared, shared]), '[{"value":1},{"value":1}]');
});
