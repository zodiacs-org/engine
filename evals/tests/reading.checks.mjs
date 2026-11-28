import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import { validateClaim, validateReading } from "../lib/validate-reading.mjs";

const factors = {
  placement: { kind: "placement", body: "Sun", sign: "aries" },
  aspect: {
    kind: "aspect", a: "Sun", b: "Moon", aspect: "trine", policy: "natal-major-defaults"
  },
  house: { kind: "house", body: "Moon", house: 1, houseSystem: "whole" },
  dignity: {
    kind: "dignity", body: "Mercury", sign: "virgo", dignity: "exaltation", system: "classical-sign"
  }
};
const quotes = {
  placement: "The Sun is in Aries.",
  aspect: "The Sun trines the Moon.",
  house: "The Moon is in the first whole-sign house.",
  dignity: "Mercury is exalted in Virgo."
};

function claim(kind = "placement", text = quotes[kind]) {
  return {
    schemaVersion: "1.0.0", id: "claim-a", status: "resolved",
    span: { start: 0, end: text.length, quote: text },
    factor: structuredClone(factors[kind]), polarity: "affirmed",
    certainty: "unqualified", temporalScope: "reference-instant"
  };
}

function unresolved(status = "unsupported", text = "Chiron is in Aries.") {
  return {
    schemaVersion: "1.0.0", id: "claim-a", status,
    span: { start: 0, end: text.length, quote: text },
    reason: "This original inline assertion has no resolved factor in the supported vocabulary."
  };
}

function reading(text = quotes.placement, claims = [claim("placement", text)]) {
  return {
    schemaVersion: "1.0.0", id: "inline-reading", caseId: "synthetic-test-case",
    synthetic: true, language: "en", text, offsetUnit: "utf16-code-unit",
    conventions: {
      zodiac: "tropical", houseSystem: "whole",
      aspectPolicy: "natal-major-defaults", dignitySystem: "classical-sign"
    },
    provenance: {
      kind: "authored", authors: ["Evals test contributors"],
      note: "Original AI-assisted inline synthetic test reading; no external source text."
    },
    extraction: { method: "manual", producer: "test-author", version: "test-v1", coverage: "unverified" },
    claims,
    license: { spdxId: "MIT", attribution: "Evals test contributors" }
  };
}

function generatedReading() {
  const value = reading();
  value.provenance = {
    kind: "generated", backend: "mock", model: "offline-test-model",
    promptVersion: "reading-test-v1", inputDigest: `sha256:${"a".repeat(64)}`,
    reviewStatus: "unreviewed"
  };
  return value;
}

function assertValid(result) {
  assert.deepEqual(result, { valid: true, errors: [] });
}

function assertInvalid(result, keyword, path) {
  assert.equal(result.valid, false);
  assert.ok(result.errors.length > 0);
  for (const error of result.errors) {
    assert.deepEqual(Object.keys(error).sort(), ["keyword", "message", "path"]);
    assert.equal(typeof error.path, "string");
    assert.equal(typeof error.keyword, "string");
    assert.equal(typeof error.message, "string");
  }
  if (keyword) assert.ok(result.errors.some((error) => error.keyword === keyword &&
    (path === undefined || error.path === path)), JSON.stringify(result.errors));
}

function freeze(value) {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

for (const kind of Object.keys(factors)) {
  test(`accepts a resolved ${kind} claim and reading without scoring it`, () => {
    const text = quotes[kind];
    const value = claim(kind, text);
    assertValid(validateClaim(value, text));
    assertValid(validateReading(reading(text, [value])));
    for (const field of Object.keys(value.factor)) {
      const incomplete = structuredClone(value);
      delete incomplete.factor[field];
      assertInvalid(validateClaim(incomplete, text));
    }
  });
}

test("registers local schema references in strict JSON Schema 2020-12 validators", () => {
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  for (const name of ["meaning-entry", "meaning-dataset", "synthetic-chart", "factual-claim", "reading"]) {
    ajv.addSchema(JSON.parse(readFileSync(new URL(`../schema/${name}.schema.json`, import.meta.url), "utf8")));
  }
  const checkClaim = ajv.getSchema("urn:zodiacs:evals:factual-claim:1.0.0");
  const checkReading = ajv.getSchema("urn:zodiacs:evals:reading:1.0.0");
  assert.equal(checkClaim(claim()), true);
  assert.equal(checkReading(reading()), true);
  const wrongQuote = reading();
  wrongQuote.claims[0].span.quote = "Another quotation.";
  assert.equal(checkReading(wrongQuote), true);
  assertInvalid(validateReading(wrongQuote), "quoteMismatch", "/claims/0/span/quote");
});

test("requires reading identity, conventions, extraction, attribution and all claim fields", () => {
  for (const field of Object.keys(reading())) {
    const value = reading();
    delete value[field];
    assertInvalid(validateReading(value), "required");
  }
  for (const group of ["conventions", "extraction", "provenance", "license"]) {
    for (const field of Object.keys(reading()[group])) {
      const value = reading();
      delete value[group][field];
      assertInvalid(validateReading(value), "required");
    }
  }
  for (const field of Object.keys(claim())) {
    const value = claim();
    delete value[field];
    assertInvalid(validateClaim(value, quotes.placement), "required");
  }
  for (const field of Object.keys(claim().span)) {
    const value = claim();
    delete value.span[field];
    assertInvalid(validateClaim(value, quotes.placement), "required");
  }
});

test("rejects extra fields at reading and nested object boundaries", () => {
  for (const group of [null, "conventions", "provenance", "extraction", "license"]) {
    const value = reading();
    (group === null ? value : value[group]).unexpected = "unrecognized";
    assertInvalid(validateReading(value), "additionalProperties");
  }
  for (const group of [null, "span", "factor"]) {
    const value = claim();
    (group === null ? value : value[group]).unexpected = "unrecognized";
    assertInvalid(validateClaim(value, quotes.placement), "additionalProperties");
  }
});

test("rejects unsupported metadata, enum values and coercion", () => {
  for (const [field, replacement] of [
    ["schemaVersion", "2.0.0"], ["id", "Bad ID"], ["caseId", ""],
    ["synthetic", false], ["synthetic", "true"], ["language", "fr"],
    ["offsetUnit", "unicode-code-point"], ["claims", {}], ["text", 1]
  ]) {
    const value = reading();
    value[field] = replacement;
    assertInvalid(validateReading(value));
  }
  for (const [group, field, replacement] of [
    ["conventions", "zodiac", "unknown"], ["conventions", "houseSystem", "Whole"],
    ["conventions", "aspectPolicy", "custom"], ["conventions", "dignitySystem", "modern"],
    ["extraction", "method", "automatic"], ["extraction", "coverage", "complete"],
    ["extraction", "version", ""], ["extraction", "producer", "Test Author"],
    ["license", "spdxId", "proprietary"], ["license", "attribution", " \n"]
  ]) {
    const value = reading();
    value[group][field] = replacement;
    assertInvalid(validateReading(value));
  }
  for (const [field, replacement] of [
    ["status", "correct"], ["polarity", "positive"], ["certainty", "certain"],
    ["temporalScope", "natal"], ["schemaVersion", "2.0.0"], ["id", "Bad ID"]
  ]) {
    const value = claim();
    value[field] = replacement;
    assertInvalid(validateClaim(value, quotes.placement));
  }
});

test("retains unsupported, ambiguous, abstained and interpretive text without invented factors", () => {
  for (const [status, text] of [
    ["unsupported", "Chiron is in Aries and Uranus is exalted."],
    ["ambiguous", "The Moon might be in Aries or Taurus."],
    ["abstained", "I cannot determine a house without a known time."],
    ["interpretive", "This symbolic theme invites reflection."]
  ]) {
    const value = unresolved(status, text);
    const before = structuredClone(value);
    assertValid(validateClaim(value, text));
    assertValid(validateReading(reading(text, [value])));
    assert.deepEqual(value, before);
    for (const field of ["factor", "polarity", "certainty", "temporalScope"]) {
      const mixed = structuredClone(value);
      mixed[field] = claim()[field];
      assertInvalid(validateClaim(mixed, text));
    }
    delete value.reason;
    assertInvalid(validateClaim(value, text), "required");
  }
  const value = claim();
  value.reason = "Do not combine resolution variants.";
  assertInvalid(validateClaim(value, quotes.placement));
});

test("keeps wrong but vocabulary-valid dignity factors for later scoring", () => {
  const text = "Mercury is exalted in Aries.";
  const value = claim("dignity", text);
  value.factor.sign = "aries";
  assertValid(validateClaim(value, text));
  assertValid(validateReading(reading(text, [value])));
  value.factor.body = "Uranus";
  assertInvalid(validateClaim(value, text));
  const outside = unresolved("unsupported", "Uranus is exalted in Aries.");
  assertValid(validateClaim(outside, outside.span.quote));
});

test("preserves explicit negation, hedging, conditionality and temporal scope", () => {
  for (const [polarity, certainty, temporalScope, text] of [
    ["negated", "unqualified", "reference-instant", "The Sun is not in Aries."],
    ["affirmed", "hedged", "whole-day", "The Sun might stay in Aries all day."],
    ["affirmed", "conditional", "unspecified", "If this date is right, the Sun is in Aries."]
  ]) {
    const value = claim("placement", text);
    Object.assign(value, { polarity, certainty, temporalScope });
    assertValid(validateReading(reading(text, [value])));
    assert.equal(value.span.quote, text);
  }
});

test("accepts differing reading and factor conventions without an implicit agreement verdict", () => {
  const value = reading(quotes.house, [claim("house")]);
  value.conventions = {
    zodiac: "sidereal", houseSystem: "placidus", aspectPolicy: "other", dignitySystem: "other"
  };
  assertValid(validateReading(value));
  assert.equal(value.claims[0].factor.houseSystem, "whole");
  for (const key of Object.keys(value.conventions)) value.conventions[key] = "unspecified";
  assertValid(validateReading(value));
  value.conventions.houseSystem = "other";
  assertValid(validateReading(value));
});

test("does not claim to verify normalized meaning or extraction completeness", () => {
  const text = "The Moon is not in Taurus.";
  assertValid(validateReading(reading(text, [claim("placement", text)])));
  assertValid(validateReading(reading(text, [])));
  assertValid(validateReading(reading("", [])));
});

test("requires extraction method none to have an empty list without inventing claims", () => {
  for (const method of ["manual", "model", "parser"]) {
    const value = reading();
    value.extraction.method = method;
    assertValid(validateReading(value));
  }
  const value = reading();
  value.extraction.method = "none";
  assertInvalid(validateReading(value), "extractionMethod", "/extraction/method");
  value.claims = [];
  assertValid(validateReading(value));
});

test("preserves duplicate factors, overlapping spans, reverse aspects and contradictions", () => {
  const text = quotes.aspect;
  const first = claim("aspect", text);
  const repeated = { ...structuredClone(first), id: "claim-b" };
  [repeated.factor.a, repeated.factor.b] = [repeated.factor.b, repeated.factor.a];
  const contradicted = { ...structuredClone(first), id: "claim-c", polarity: "negated" };
  const overlapping = unresolved("interpretive", "Sun");
  overlapping.id = "claim-d";
  overlapping.span = { start: 4, end: 7, quote: "Sun" };
  const value = reading(text, [first, repeated, contradicted, overlapping]);
  const before = structuredClone(value);
  assertValid(validateReading(value));
  assert.deepEqual(value, before);
  value.claims[3].id = first.id;
  assertInvalid(validateReading(value), "uniqueClaimId", "/claims/3/id");
});

test("rejects self-aspects in both entry points but retains reversed distinct bodies", () => {
  const value = claim("aspect");
  value.factor.b = value.factor.a;
  assertInvalid(validateClaim(value, quotes.aspect), "distinctBodies", "/factor");
  assertInvalid(validateReading(reading(quotes.aspect, [value])), "distinctBodies", "/claims/0/factor");
  value.factor.a = "Moon";
  assertValid(validateClaim(value, quotes.aspect));
});

test("checks span ordering, reading bounds and exact quote spelling", () => {
  for (const [start, end, keyword] of [
    [2, 2, "spanOrder"], [4, 2, "spanOrder"],
    [quotes.placement.length, quotes.placement.length + 1, "spanBounds"],
    [0, quotes.placement.length + 1, "spanBounds"]
  ]) {
    const value = claim();
    Object.assign(value.span, { start, end });
    assertInvalid(validateClaim(value, quotes.placement), keyword, "/span");
    assertInvalid(validateReading(reading(quotes.placement, [value])), keyword, "/claims/0/span");
  }
  const value = claim();
  value.span.quote = value.span.quote.toLowerCase();
  assertInvalid(validateClaim(value, quotes.placement), "quoteMismatch", "/span/quote");
  assertInvalid(validateClaim(claim(), ""), "spanBounds");
});

test("rejects invalid offset types and schema bounds without coercion", () => {
  for (const [field, values] of [
    ["start", [-1, 0.5, "0", null, false, 65537]],
    ["end", [0, -1, 1.5, "1", null, false, 65537]]
  ]) {
    for (const replacement of values) {
      const value = claim();
      value.span[field] = replacement;
      assertInvalid(validateClaim(value, quotes.placement));
    }
  }
  for (const quote of ["", " \t\n", 1, null]) {
    const value = claim();
    value.span.quote = quote;
    assertInvalid(validateClaim(value, quotes.placement));
  }
});

test("uses exact UTF-16 offsets through repeated emoji, CRLF and combining marks", () => {
  const text = "🌙\r\nThe Sun is in Aries.\r\ne\u0301 🌙\r\nThe Sun is in Aries.";
  const value = reading(text, [claim(), { ...claim(), id: "claim-b" }]);
  for (const [index, start] of [text.indexOf(quotes.placement), text.lastIndexOf(quotes.placement)].entries()) {
    value.claims[index].span = { start, end: start + quotes.placement.length, quote: quotes.placement };
  }
  assertValid(validateReading(value));
  assert.notEqual(value.claims[0].span.start, value.claims[1].span.start);
  const markStart = text.indexOf("e\u0301");
  const combining = unresolved("interpretive", "e\u0301");
  combining.span = { start: markStart, end: markStart + 2, quote: "e\u0301" };
  assertValid(validateClaim(combining, text));
  combining.span.quote = "é";
  assertInvalid(validateClaim(combining, text), "quoteMismatch");
  const lineBreak = unresolved("interpretive", "🌙\r\n");
  assertValid(validateClaim(lineBreak, text));
  lineBreak.span.quote = "🌙\n";
  assertInvalid(validateClaim(lineBreak, text), "quoteMismatch");
});

test("rejects offsets splitting surrogate pairs even when JavaScript slices match", () => {
  const text = "🌙a";
  for (const [start, end] of [[0, 1], [1, 2], [1, 3]]) {
    const value = unresolved("unsupported", text.slice(start, end));
    value.span = { start, end, quote: text.slice(start, end) };
    assertInvalid(validateClaim(value, text), "spanBoundary", "/span");
    assertInvalid(validateReading(reading(text, [value])), "spanBoundary", "/claims/0/span");
  }
  const value = unresolved("unsupported", "🌙");
  assertValid(validateClaim(value, text));
});

test("rejects unpaired surrogates anywhere in reading text", () => {
  for (const malformed of ["\ud800", "\udfff", "a\ud800b", "\udfff\ud800"]) {
    const text = `${quotes.placement} ${malformed}`;
    assertInvalid(validateClaim(claim(), text), "wellFormedText", "/text");
    assertInvalid(validateReading(reading(text, [claim()])), "wellFormedText", "/text");
    assertInvalid(validateReading(reading(malformed, [])), "wellFormedText", "/text");
  }
  for (const text of [undefined, null, [], 12, true]) {
    assertInvalid(validateClaim(claim(), text), "type", "/text");
  }
});

test("enforces the text limit in code points and allows the maximum UTF-16 offset", () => {
  for (const character of ["x", "🌙"]) {
    const text = character.repeat(32768);
    const value = unresolved("interpretive", character);
    value.span = { start: text.length - character.length, end: text.length, quote: character };
    assertValid(validateClaim(value, text));
    assertValid(validateReading(reading(text, [value])));
    assertInvalid(validateClaim(value, text + character), "maxLength", "/text");
    assertInvalid(validateReading(reading(text + character, [value])), "maxLength", "/text");
  }
});

test("enforces the quote limit in code points", () => {
  for (const character of ["x", "🌙"]) {
    const text = character.repeat(4096);
    assertValid(validateClaim(unresolved("interpretive", text), text));
    assertValid(validateReading(reading(text, [unresolved("interpretive", text)])));
    const oversized = text + character;
    assertInvalid(validateClaim(unresolved("interpretive", oversized), oversized), "maxLength", "/span/quote");
    assertInvalid(validateReading(reading(oversized, [unresolved("interpretive", oversized)])), "maxLength", "/claims/0/span/quote");
  }
});

test("allows the claim count boundary and rejects excess before member traversal", () => {
  const value = reading();
  value.claims = Array.from({ length: 256 }, (_, index) => ({ ...claim(), id: `claim-${index}` }));
  assertValid(validateReading(value));
  value.claims.push(null);
  assert.deepEqual(validateReading(value), {
    valid: false,
    errors: [{ path: "/claims", keyword: "maxItems", message: "must NOT have more than 256 items" }]
  });
});

test("accepts generated reading provenance and rejects mixed or incomplete attribution", () => {
  assertValid(validateReading(generatedReading()));
  for (const field of Object.keys(generatedReading().provenance)) {
    const value = generatedReading();
    delete value.provenance[field];
    assertInvalid(validateReading(value), "required");
  }
  for (const [field, replacement] of [
    ["reviewStatus", "approved"], ["inputDigest", `sha256:${"a".repeat(63)}`],
    ["inputDigest", `sha256:${"a".repeat(64)}\n`], ["backend", "Mock Backend"],
    ["model", " \n"], ["promptVersion", ""], ["authors", ["A claimed author"]]
  ]) {
    const value = generatedReading();
    value.provenance[field] = replacement;
    assertInvalid(validateReading(value));
  }
});

test("rejects nonobject readings and claims", () => {
  for (const value of [undefined, null, [], "reading", 1, true]) {
    assertInvalid(validateReading(value));
    assertInvalid(validateClaim(value, quotes.placement));
  }
});

test("validation and JSON round trips preserve all submitted data", () => {
  const invalid = reading();
  invalid.claims[0].span.start = "0";
  delete invalid.conventions.zodiac;
  for (const value of [reading(), generatedReading(), reading("", []), invalid]) {
    const before = structuredClone(value);
    freeze(value);
    const result = validateReading(value);
    assert.deepEqual(value, before);
    assert.deepEqual(validateReading(JSON.parse(JSON.stringify(value))), result);
    if (value.claims.length) {
      validateClaim(value.claims[0], value.text);
      assert.deepEqual(value, before);
    }
  }
});

test("returns independent normalized error snapshots", () => {
  const value = reading();
  delete value.schemaVersion;
  const result = validateReading(value);
  const before = structuredClone(result);
  validateReading(null);
  validateClaim(null, null);
  validateReading(reading());
  assert.deepEqual(result, before);
  result.errors[0].message = "caller changes its snapshot";
  assert.deepEqual(validateReading(value), before);
  const badQuote = claim();
  badQuote.span.quote = "Changed quote";
  const badResult = validateClaim(badQuote, quotes.placement);
  const badBefore = structuredClone(badResult);
  validateClaim(claim(), quotes.placement);
  assert.deepEqual(badResult, badBefore);
});
