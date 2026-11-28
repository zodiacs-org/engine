import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateDataset } from "../lib/validate-dataset.mjs";

const seed = JSON.parse(readFileSync(new URL("../data/seed.json", import.meta.url), "utf8"));
const copySeed = () => structuredClone(seed);
const authored = (id = "test-authored") => ({ ...structuredClone(seed.entries[0]), id });
const dataset = (entries = [authored()]) => ({ schemaVersion: "1.0.0", id: "test-dataset", entries });
const generated = (id, sourceEntryIds) => ({
  ...authored(id),
  provenance: {
    kind: "generated", backend: "mock", model: "offline-test-model",
    promptVersion: "test-prompt-v1", inputDigest: `sha256:${"b".repeat(64)}`,
    sourceEntryIds, reviewStatus: "unreviewed"
  }
});

function rejects(value, keyword, path, options) {
  const report = validateDataset(value, options);
  assert.equal(report.valid, false);
  assert.ok(report.errors.some((error) => error.keyword === keyword && error.path === path),
    JSON.stringify(report));
  return report;
}

function freeze(value) {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

test("committed seed covers all factor kinds and sign dignities with original attribution", () => {
  assert.deepEqual(validateDataset(seed, { seed: true }), { valid: true, errors: [] });
  assert.equal(seed.entries.length, 10);
  assert.deepEqual([...new Set(seed.entries.map(({ factor }) => factor.kind))].sort(),
    ["aspect", "dignity", "house", "placement"]);
  assert.deepEqual(seed.entries.filter(({ factor }) => factor.kind === "dignity")
    .map(({ factor }) => factor.dignity).sort(), ["detriment", "domicile", "exaltation", "fall"]);
  for (const entry of seed.entries) {
    assert.equal(entry.provenance.kind, "authored");
    assert.ok(entry.provenance.authors.includes("OpenAI Codex (AI assistant)"));
    assert.match(entry.provenance.note, /AI assistance/);
    assert.match(entry.provenance.note, /no human review is asserted/);
    assert.equal(entry.license.spdxId, "MIT");
    assert.match(entry.license.attribution, /AI-assisted authoring by OpenAI Codex/);
    assert.equal(entry.meaning.epistemicStatus, "symbolic-interpretation");
  }
});

test("dataset envelope is versioned, strict and nonempty", () => {
  for (const value of [null, [], "dataset", false, 1]) rejects(value, "type", "/");
  for (const key of ["schemaVersion", "id", "entries"]) {
    const value = dataset();
    delete value[key];
    rejects(value, "required", "/");
  }
  rejects({ ...dataset(), extra: true }, "additionalProperties", "/");
  rejects({ ...dataset(), schemaVersion: "2.0.0" }, "const", "/schemaVersion");
  rejects({ ...dataset(), id: "Bad ID" }, "pattern", "/id");
  rejects({ ...dataset(), id: "test-id\n" }, "pattern", "/id");
  rejects(dataset([]), "minItems", "/entries");
  rejects(dataset({}), "type", "/entries");
});

test("malformed entries and self-aspects return indexed errors without throwing", () => {
  for (const member of [null, [], 42, "meaning"]) {
    rejects(dataset([authored(), member]), "type", "/entries/1");
  }
  const invalid = authored();
  invalid.factor = { kind: "aspect", a: "Sun", b: "Sun", aspect: "trine", policy: "natal-major-defaults" };
  rejects(dataset([invalid]), "distinctBodies", "/entries/0/factor");
  for (const key of ["provenance", "license"]) {
    const value = dataset();
    delete value.entries[0][key];
    rejects(value, "required", "/entries/0");
  }
  const wrongLicense = dataset();
  wrongLicense.entries[0].license.spdxId = "not-licensed";
  rejects(wrongLicense, "const", "/entries/0/license/spdxId");
});

test("duplicate IDs are rejected even when entries describe different factors", () => {
  const value = copySeed();
  value.entries[1].id = value.entries[0].id;
  rejects(value, "uniqueEntryId", "/entries/1/id");
  const referenced = dataset([
    authored("repeated"), authored("repeated"), generated("derived", ["repeated"])
  ]);
  const report = rejects(referenced, "uniqueEntryId", "/entries/1/id");
  assert.equal(report.errors.length, 1);
});

test("general datasets allow factor variants and source records in any order", () => {
  const value = dataset([
    generated("final-variant", ["branch-a", "branch-b"]),
    generated("branch-b", ["source"]),
    authored("source"),
    generated("branch-a", ["source"])
  ]);
  assert.deepEqual(validateDataset(value), { valid: true, errors: [] });
  assert.deepEqual(validateDataset(dataset([authored("one"), authored("two")])),
    { valid: true, errors: [] });
});

test("source lookup treats IDs as data, not object properties or external resources", () => {
  assert.equal(validateDataset(dataset([
    generated("derived", ["constructor", "tostring"]),
    authored("constructor"), authored("tostring")
  ])).valid, true);
  rejects(dataset([generated("derived", ["constructor"])]), "missingSource",
    "/entries/0/provenance/sourceEntryIds/0");
});

test("generated provenance cannot cite missing records or itself", () => {
  rejects(dataset([authored(), generated("derived", ["missing"])]), "missingSource",
    "/entries/1/provenance/sourceEntryIds/0");
  rejects(dataset([generated("derived", ["derived"])]), "selfSource",
    "/entries/0/provenance/sourceEntryIds/0");
  const duplicateSource = generated("derived", ["source", "source"]);
  rejects(dataset([authored("source"), duplicateSource]), "uniqueItems",
    "/entries/1/provenance/sourceEntryIds");
});

test("source cycles reject even when connected to an authored source or disconnected from it", () => {
  for (const includeRoot of [false, true]) {
    const value = dataset([
      authored("source"),
      generated("cycle-a", includeRoot ? ["source", "cycle-b"] : ["cycle-b"]),
      generated("cycle-b", ["cycle-c"]),
      generated("cycle-c", ["cycle-a"])
    ]);
    rejects(value, "sourceCycle", "/entries/3/provenance/sourceEntryIds/0");
  }
});

test("seed mode rejects generated entries even when all their sources exist", () => {
  const value = copySeed();
  value.entries[0].provenance = generated("ignored", [value.entries[1].id]).provenance;
  assert.equal(validateDataset(value).valid, true);
  rejects(value, "authoredSeed", "/entries/0/provenance/kind", { seed: true });
});

test("seed coverage requires every factor kind and every sign dignity", () => {
  for (const kind of ["placement", "aspect", "house", "dignity"]) {
    const value = copySeed();
    value.entries = value.entries.filter(({ factor }) => factor.kind !== kind);
    assert.equal(validateDataset(value).valid, true);
    rejects(value, "seedCoverage", "/entries", { seed: true });
  }
  for (const dignity of ["domicile", "exaltation", "detriment", "fall"]) {
    const value = copySeed();
    value.entries = value.entries.filter(({ factor }) => factor.dignity !== dignity);
    rejects(value, "seedCoverage", "/entries", { seed: true });
  }
});

test("seed factor deduplication ignores JSON property order for every kind", () => {
  for (const kind of ["placement", "aspect", "house", "dignity"]) {
    const value = copySeed();
    const duplicate = structuredClone(value.entries.find(({ factor }) => factor.kind === kind));
    duplicate.id = "duplicate-factor";
    duplicate.factor = Object.fromEntries(Object.entries(duplicate.factor).reverse());
    duplicate.meaning.summary = "Different prose does not make a different seed factor.";
    value.entries.push(duplicate);
    rejects(value, "uniqueSeedFactor", "/entries/10/factor", { seed: true });
  }
});

test("seed factor deduplication treats reversed aspect pairs as the same factor", () => {
  const value = copySeed();
  const duplicate = structuredClone(value.entries.find(({ factor }) => factor.kind === "aspect"));
  duplicate.id = "reversed-aspect";
  [duplicate.factor.a, duplicate.factor.b] = [duplicate.factor.b, duplicate.factor.a];
  value.entries.push(duplicate);
  rejects(value, "uniqueSeedFactor", "/entries/10/factor", { seed: true });
  duplicate.factor.aspect = "opposition";
  assert.equal(validateDataset(value, { seed: true }).valid, true);
});

test("seed identity distinguishes house systems, house numbers and sign dignities", () => {
  const value = copySeed();
  const anotherHouse = structuredClone(value.entries.find(({ factor }) => factor.kind === "house"));
  anotherHouse.id = "different-house-convention";
  anotherHouse.factor.houseSystem = "equal";
  value.entries.push(anotherHouse);
  assert.equal(validateDataset(value, { seed: true }).valid, true);
  anotherHouse.factor.houseSystem = "whole";
  anotherHouse.factor.house = 5;
  assert.equal(validateDataset(value, { seed: true }).valid, true);
  const mercury = value.entries.filter(({ factor }) => factor.kind === "dignity" && factor.body === "Mercury");
  assert.deepEqual(mercury.map(({ factor }) => [factor.sign, factor.dignity]),
    [["virgo", "domicile"], ["virgo", "exaltation"]]);
});

test("dataset validation does not claim that a dignity or interpretation is factually true", () => {
  const value = dataset([structuredClone(seed.entries.find(({ factor }) => factor.kind === "dignity"))]);
  value.entries[0].factor.sign = "aries";
  assert.deepEqual(validateDataset(value), { valid: true, errors: [] });
});

test("entry count limit is inclusive and bounds a long generated-source chain", () => {
  const entries = [authored("source")];
  for (let index = 1; index < 256; index++) {
    entries.push(generated(`derived-${index}`, [entries[index - 1].id]));
  }
  // Begin at the last descendant so traversal reaches the full chain depth.
  entries.reverse();
  assert.deepEqual(validateDataset(dataset(entries)), { valid: true, errors: [] });
  entries.push(null);
  assert.deepEqual(validateDataset(dataset(entries)), {
    valid: false,
    errors: [{ path: "/entries", keyword: "maxItems", message: "must NOT have more than 256 items" }]
  });
});

test("validation preserves frozen inputs and independent diagnostic snapshots", () => {
  const invalid = dataset([generated("derived", ["absent"])]);
  for (const value of [copySeed(), invalid, dataset([null])]) {
    const original = structuredClone(value);
    freeze(value);
    validateDataset(value, { seed: true });
    assert.deepEqual(value, original);
  }
  const report = validateDataset(invalid);
  const snapshot = structuredClone(report);
  validateDataset(seed);
  validateDataset(null);
  assert.deepEqual(report, snapshot);
  report.errors[0].message = "caller-owned edit";
  assert.deepEqual(validateDataset(invalid), snapshot);
});
