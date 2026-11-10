import assert from "node:assert/strict";
import test from "node:test";
import { validateEntry } from "../lib/validate-entry.mjs";

const factors = {
  placement: { kind: "placement", body: "Sun", sign: "aries" },
  aspect: {
    kind: "aspect", a: "Sun", b: "Moon", aspect: "trine",
    policy: "natal-major-defaults"
  },
  house: { kind: "house", body: "Moon", house: 1, houseSystem: "whole" },
  dignity: {
    kind: "dignity", body: "Mercury", sign: "virgo", dignity: "exaltation",
    system: "classical-sign"
  }
};

function entry(factor = factors.placement) {
  return {
    schemaVersion: "1.0.0",
    id: "inline-test-entry",
    language: "en",
    tradition: "western-tropical",
    factor: structuredClone(factor),
    meaning: {
      summary: "This invented test description marks a symbolic theme.",
      themes: ["test theme"],
      epistemicStatus: "symbolic-interpretation"
    },
    provenance: {
      kind: "authored", authors: ["Evals test contributors"],
      note: "Original AI-assisted inline test content; no source quotations or seed data."
    },
    license: { spdxId: "MIT", attribution: "Evals test contributors" }
  };
}

function generatedEntry() {
  const value = entry();
  value.provenance = {
    kind: "generated", backend: "mock", model: "offline-test-model",
    promptVersion: "test-prompt-v1", inputDigest: `sha256:${"a".repeat(64)}`,
    sourceEntryIds: ["inline-source-entry"], reviewStatus: "unreviewed"
  };
  return value;
}

function rejects(value) {
  const result = validateEntry(value);
  assert.equal(result.valid, false);
  assert.ok(result.errors.length > 0);
  return result;
}

function freeze(value) {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

for (const [kind, factor] of Object.entries(factors)) {
  test(`accepts an original ${kind} entry`, () => {
    assert.deepEqual(validateEntry(entry(factor)), { valid: true, errors: [] });
  });

  test(`requires every ${kind} factor field`, () => {
    for (const key of Object.keys(factor)) {
      const value = entry(factor);
      delete value.factor[key];
      rejects(value);
    }
  });
}

test("requires top-level identity, meaning, provenance, and license fields", () => {
  for (const key of Object.keys(entry())) {
    const value = entry();
    delete value[key];
    rejects(value);
  }
  for (const group of ["meaning", "provenance", "license"]) {
    for (const key of Object.keys(entry()[group])) {
      const value = entry();
      delete value[group][key];
      rejects(value);
    }
  }
});

test("rejects extra properties, including mixed factor variants", () => {
  for (const group of [null, "meaning", "provenance", "license", "factor"]) {
    const value = entry();
    (group === null ? value : value[group]).unexpected = "unused";
    rejects(value);
  }
  for (const factor of Object.values(factors)) {
    const value = entry(factor);
    value.factor[factor.kind === "house" ? "sign" : "house"] =
      factor.kind === "house" ? "aries" : 1;
    rejects(value);
  }
});

test("rejects unsupported version, language, tradition, and license claims", () => {
  for (const [key, replacement] of [
    ["schemaVersion", "2.0.0"], ["language", "fr"],
    ["tradition", "western-sidereal"], ["id", "Bad ID"]
  ]) {
    const value = entry();
    value[key] = replacement;
    rejects(value);
  }
  const value = entry();
  value.license.spdxId = "proprietary";
  rejects(value);
  value.license.spdxId = "MIT";
  value.meaning.epistemicStatus = "established-fact";
  rejects(value);
});

test("enforces exact factor vocabulary and field casing", () => {
  for (const factor of [
    { ...factors.placement, body: "sun" },
    { ...factors.placement, sign: "Aries" },
    { ...factors.placement, body: "Chiron" },
    { ...factors.placement, kind: "Placement" },
    { ...factors.aspect, aspect: "Trine" },
    { ...factors.aspect, aspect: "quincunx" },
    { ...factors.aspect, policy: "custom" },
    { ...factors.house, houseSystem: "Whole" },
    { ...factors.dignity, dignity: "Exaltation" },
    { ...factors.dignity, system: "modern" }
  ]) rejects(entry(factor));
  const value = entry();
  value.factor.Body = value.factor.body;
  delete value.factor.body;
  rejects(value);
});

test("allows lunar nodes in placements and houses, but excludes them from natal aspects", () => {
  for (const body of ["North Node", "South Node"]) {
    assert.equal(validateEntry(entry({ ...factors.placement, body })).valid, true);
    assert.equal(validateEntry(entry({ ...factors.house, body })).valid, true);
    rejects(entry({ ...factors.aspect, a: body }));
    rejects(entry({ ...factors.aspect, b: body }));
  }
});

test("restricts sign dignities to classical planets and sign-level conditions", () => {
  for (const body of ["Uranus", "Neptune", "Pluto", "North Node", "South Node"]) {
    rejects(entry({ ...factors.dignity, body }));
  }
  for (const dignity of ["triplicity", "term", "face", "peregrine"]) {
    rejects(entry({ ...factors.dignity, dignity }));
  }
  assert.equal(validateEntry(entry({ ...factors.dignity, dignity: "domicile" })).valid, true);
});

test("house numbers accept inclusive endpoints without coercion", () => {
  for (const house of [1, 12]) {
    assert.equal(validateEntry(entry({ ...factors.house, house })).valid, true);
  }
  for (const house of [0, 13, 1.5, "1", null, false]) {
    rejects(entry({ ...factors.house, house }));
  }
});

test("rejects empty, whitespace-only, and oversized text", () => {
  for (const summary of ["", " \t\n", "x".repeat(1601), null, 10]) {
    const value = entry();
    value.meaning.summary = summary;
    rejects(value);
  }
  const value = entry();
  value.meaning.summary = "x".repeat(1600);
  assert.equal(validateEntry(value).valid, true);
  for (const attribution of ["", " \n"]) {
    value.license.attribution = attribution;
    rejects(value);
  }
});

test("requires bounded, nonempty, unique themes and authored attribution", () => {
  for (const themes of [[], [" "], ["same", "same"], ["x".repeat(81)],
    Array.from({ length: 13 }, (_, index) => `theme ${index}`)]) {
    const value = entry();
    value.meaning.themes = themes;
    rejects(value);
  }
  for (const authors of [[], [""], [" \n"], ["same", "same"]]) {
    const value = entry();
    value.provenance.authors = authors;
    rejects(value);
  }
});

test("accepts generated provenance with reproducibility inputs and unreviewed status", () => {
  assert.deepEqual(validateEntry(generatedEntry()), { valid: true, errors: [] });
  for (const key of Object.keys(generatedEntry().provenance)) {
    const value = generatedEntry();
    delete value.provenance[key];
    rejects(value);
  }
});

test("rejects incomplete or mixed generated provenance", () => {
  for (const [key, replacement] of [
    ["inputDigest", `sha256:${"a".repeat(63)}`],
    ["inputDigest", `sha256:${"A".repeat(64)}`],
    ["inputDigest", "not-a-digest"],
    ["sourceEntryIds", []], ["sourceEntryIds", ["same", "same"]],
    ["sourceEntryIds", ["Bad ID"]], ["reviewStatus", "approved"],
    ["backend", "Mock Backend"], ["model", " "], ["promptVersion", ""]
  ]) {
    const value = generatedEntry();
    value.provenance[key] = replacement;
    rejects(value);
  }
  const value = generatedEntry();
  value.provenance.authors = ["Unverified author"];
  rejects(value);
});

test("rejects self-aspects with a semantic error", () => {
  for (const body of ["Sun", "Moon", "Pluto"]) {
    assert.deepEqual(validateEntry(entry({ ...factors.aspect, a: body, b: body })), {
      valid: false,
      errors: [{ path: "/factor", keyword: "distinctBodies", message: "aspect bodies must differ" }]
    });
  }
  assert.equal(validateEntry(entry({ ...factors.aspect, a: "Moon", b: "Sun" })).valid, true);
});

test("rejects nonobject entry input", () => {
  for (const value of [null, [], "entry", 1, true]) rejects(value);
});

test("does not mutate valid or invalid inputs, coerce values, or insert defaults", () => {
  const invalid = entry(factors.house);
  invalid.factor.house = "1";
  delete invalid.language;
  for (const value of [entry(), generatedEntry(), invalid]) {
    const original = structuredClone(value);
    freeze(value);
    validateEntry(value);
    assert.deepEqual(value, original);
  }
});

test("returns stable normalized error snapshots across later validation calls", () => {
  const value = entry();
  delete value.schemaVersion;
  const first = validateEntry(value);
  const expected = {
    valid: false,
    errors: [{ path: "/", keyword: "required", message: "must have required property 'schemaVersion'" }]
  };
  assert.deepEqual(first, expected);
  validateEntry(null);
  validateEntry(entry());
  assert.deepEqual(first, expected);
  first.errors[0].message = "caller modified its snapshot";
  assert.deepEqual(validateEntry(value), expected);
});

test("identifiers and digests cannot carry trailing line breaks", () => {
  for (const suffix of ["\n", "\r", "\r\n", "\u2028", "\u2029"]) {
    const value = entry();
    value.id += suffix;
    rejects(value);
    const generated = generatedEntry();
    generated.provenance.inputDigest += suffix;
    rejects(generated);
  }
});
