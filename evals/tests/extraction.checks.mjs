import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { EXTRACTION_LIMITS, ExtractionError, extractReadingClaims } from "../lib/extract-reading-claims.mjs";
import { canonicalJson, freezeData, sha256 } from "../lib/generator-data.mjs";
import { validateReading } from "../lib/validate-reading.mjs";
import { readingFor, resolved, syntheticCase } from "./scoring-helpers.mjs";

// Original inline prose about invented charts. The extractor receives no chart
// reference and these checks establish grammar behavior, not extraction recall.
const placement = { kind: "placement", body: "Sun", sign: "aries" };
const aspect = { kind: "aspect", a: "Sun", b: "Moon", aspect: "trine", policy: "natal-major-defaults" };
const house = { kind: "house", body: "Moon", house: 3, houseSystem: "whole" };
const dignity = { kind: "dignity", body: "Mercury", sign: "virgo", dignity: "exaltation", system: "classical-sign" };

function input(text = "At the supplied instant, Sun is in Aries.", conventions = {}) {
  const value = readingFor(syntheticCase(), [], conventions);
  value.text = text;
  value.extraction.method = "none";
  return value;
}

function extract(text, conventions) {
  return extractReadingClaims(input(text, conventions));
}

function onlyClaim(text, conventions) {
  const result = extract(text, conventions);
  assert.equal(validateReading(result.reading).valid, true);
  assert.equal(result.reading.claims.length, 1);
  return result.reading.claims[0];
}

function refuses(value, code) {
  assert.throws(() => extractReadingClaims(value), (error) => {
    assert.ok(error instanceof ExtractionError);
    assert.equal(error.code, code);
    assert.equal(error.cause, undefined);
    assert.ok(!error.message.includes("private-input-marker"));
    assert.deepEqual(Object.keys(error).sort(), ["code", "name"]);
    return true;
  });
}

function assertNoResolution(text, conventions) {
  const result = extract(text, conventions);
  assert.equal(result.reading.text, text);
  assert.ok(result.reading.claims.length > 0);
  for (const claim of result.reading.claims) {
    assert.notEqual(claim.status, "resolved", text);
    assert.equal(Object.hasOwn(claim, "factor"), false);
    assert.equal(claim.span.quote, text.slice(claim.span.start, claim.span.end));
  }
  return result;
}

test("extracts explicit placement, aspect, house and dignity grammar without reference facts", () => {
  for (const [text, factor] of [
    ["At the supplied instant, Sun is in Aries.", placement],
    ["At the reference instant, The Sun forms a trine with the Moon under natal-major-defaults.", aspect],
    ["At the supplied instant, Moon is in house 3 under whole.", house],
    ["At the supplied instant, Moon occupies house 3.", house],
    ["At the supplied instant, Mercury is in Virgo with exaltation under classical-sign.", dignity],
    ["AT THE SUPPLIED INSTANT, THE SUN IS IN ARIES.", placement],
    ["At the supplied instant, North Node is in Libra.", { kind: "placement", body: "North Node", sign: "libra" }]
  ]) {
    const claim = onlyClaim(text);
    assert.equal(claim.status, "resolved", text);
    assert.deepEqual(claim.factor, factor);
    assert.equal(claim.polarity, "affirmed");
    assert.equal(claim.certainty, "unqualified");
    assert.equal(claim.temporalScope, "reference-instant");
    assert.equal(claim.span.quote, text);
  }
});

test("preserves explicit single and full-tuple negation without asserting implied factors", () => {
  for (const [text, factor] of [
    ["At the supplied instant, Sun is not in Aries.", placement],
    ["At the supplied instant, Sun isn't in Aries.", placement],
    ["At the supplied instant, Sun does not form a trine with Moon.", aspect],
    ["At the supplied instant, Moon is not in house 3.", house],
    ["At the supplied instant, Moon isn't in house 3.", house],
    ["At the supplied instant, Moon does not occupy house 3.", house],
    ["At the supplied instant, It is not the case that Sun is in Aries.", placement],
    ["At the supplied instant, It is not the case that Mercury is in Virgo with exaltation.", dignity]
  ]) {
    const claim = onlyClaim(text);
    assert.equal(claim.status, "resolved", text);
    assert.deepEqual(claim.factor, factor);
    assert.equal(claim.polarity, "negated");
  }
  for (const text of [
    "At the supplied instant, Mercury is in Virgo but not exalted.",
    "At the supplied instant, Mercury is in Virgo with no exaltation.",
    "At the supplied instant, Mercury is not exalted.",
    "At the supplied instant, Sun is not only in Aries.",
    "At the supplied instant, Sun is in neither Aries nor Taurus.",
    "At the supplied instant, It is not the case that Sun is not in Aries."
  ]) assertNoResolution(text);
});

test("retains missing scope, whole-day scope and supported uncertainty without upgrading them", () => {
  for (const [text, temporalScope, certainty] of [
    ["Sun is in Aries.", "unspecified", "unqualified"],
    ["Throughout the day, Sun is in Aries.", "whole-day", "unqualified"],
    ["At the supplied instant, Perhaps Sun is in Aries.", "reference-instant", "hedged"],
    ["At the supplied instant, If this input is correct, Sun is in Aries.", "reference-instant", "conditional"],
    ["Perhaps Sun is in Aries.", "unspecified", "hedged"]
  ]) {
    const claim = onlyClaim(text);
    assert.equal(claim.status, "resolved", text);
    assert.equal(claim.temporalScope, temporalScope);
    assert.equal(claim.certainty, certainty);
  }
  assertNoResolution("Sun may be in Aries.");
  assertNoResolution("At the supplied instant, Sun is probably in Aries.");
});

test("does not infer missing factor conventions or normalize explicit conflicts away", () => {
  for (const [text, conventions] of [
    ["At the supplied instant, Moon occupies house 3.", { houseSystem: "unspecified" }],
    ["At the supplied instant, Moon occupies house 3.", { houseSystem: "other" }],
    ["At the supplied instant, Sun forms trine with Moon.", { aspectPolicy: "unspecified" }],
    ["At the supplied instant, Mercury is in Virgo with exaltation.", { dignitySystem: "other" }]
  ]) assertNoResolution(text, conventions);

  const conflictingHouse = onlyClaim("At the supplied instant, Moon occupies house 3 under placidus.", { houseSystem: "whole" });
  assert.equal(conflictingHouse.status, "resolved");
  assert.equal(conflictingHouse.factor.houseSystem, "placidus");
  const unspecified = extract("At the supplied instant, Sun is in Aries.", { zodiac: "unspecified" });
  assert.equal(unspecified.reading.conventions.zodiac, "unspecified");
  const sidereal = extract("At the supplied instant, Sun is in Aries.", { zodiac: "sidereal" });
  assert.equal(sidereal.reading.conventions.zodiac, "sidereal");
  assertNoResolution("At the supplied instant, Sun is in Aries in the sidereal zodiac.");
});

test("retains false but representable assertions and does not guess unsupported factors", () => {
  const falseDignity = onlyClaim("At the supplied instant, Mercury is in Aries with exaltation.");
  assert.equal(falseDignity.status, "resolved");
  assert.deepEqual(falseDignity.factor, { ...dignity, sign: "aries" });
  for (const text of [
    "At the supplied instant, Chiron is in Aries.",
    "At the supplied instant, Sun is in Ophiuchus.",
    "At the supplied instant, North Node forms trine with Moon.",
    "At the supplied instant, Sun forms quintile with Moon.",
    "At the supplied instant, Sun forms trine with Sun.",
    "At the supplied instant, Moon occupies house 0.",
    "At the supplied instant, Moon occupies house 13.",
    "At the supplied instant, Moon occupies house 3 under invented-system.",
    "At the supplied instant, Uranus is in Aries with exaltation.",
    "At the supplied instant, Mercury has exaltation.",
    "At the supplied instant, Mercury is in Virgo with peregrine."
  ]) assertNoResolution(text);
});

test("rejects partial matches, disjunctions, degrees, questions, quotations and code", () => {
  for (const text of [
    "At the supplied instant, Sun is in Aries or Taurus.",
    "At the supplied instant, Sun is in Aries except when this date changes.",
    "At the supplied instant, Sun is in Aries if this input is correct.",
    "At the supplied instant, Sun is in Aries and Moon is in Taurus.",
    "At the supplied instant, Sun is in Aries at 10.5 degrees.",
    "At the supplied instant, Sun is in Aries?",
    "\"At the supplied instant, Sun is in Aries.\"",
    "`At the supplied instant, Sun is in Aries.`",
    "```text\nAt the supplied instant, Sun is in Aries.\n```",
    "Suppose that at the supplied instant, Sun is in Aries.",
    "At the supplied instant, At the reference instant, Sun is in Aries.",
    "At the supplied instant, Sun forms trine with Moon under natal-major-defaults under another-policy."
  ]) assertNoResolution(text);
});

test("unknown paragraph context prevents newline, colon and sentence scope escapes", () => {
  const assertion = "At the supplied instant, Sun is in Aries.";
  for (const text of [
    `If this were a different chart:\n${assertion}`,
    `If this were a different chart; ${assertion}`,
    `If this were a different chart, ${assertion}`,
    `This is hypothetical.\n${assertion}`,
    `${assertion} The previous statement is false.`,
    `${assertion}\nPerhaps a different date was intended.`,
    `Example:\n${assertion}\nEnd of example.`,
    `\"Quoted context.\n${assertion}\"`
  ]) assertNoResolution(text);

  const separated = extract(`A symbolic reflection.\n\n${assertion}`);
  assert.equal(separated.reading.claims.filter((claim) => claim.status === "resolved").length, 1);
  assert.equal(separated.reading.claims.at(-1).span.quote, assertion);
  assert.equal(separated.extraction.diagnostics.paragraphs, 2);
});

test("quoted documents and code withhold claims across blank paragraphs while questions guard their paragraph", () => {
  const assertion = "At the supplied instant, Sun is in Aries.";
  for (const text of [
    `\"A quoted example.\n\n${assertion}\"`,
    `\u201cA quoted example.\n\n${assertion}\u201d`,
    `'A quoted example.\n\n${assertion}'`,
    `\u2018A quoted example.\n\n${assertion}\u2019`,
    `\x60\x60\x60text\n\n${assertion}\n\n\x60\x60\x60`,
    `~~~text\n\n${assertion}\n\n~~~`,
    `<blockquote>\n\n${assertion}\n\n</blockquote>`,
    `> An example follows.\n\n${assertion}`,
    `${assertion}\nIs that certain?`,
    `${assertion}\nThis is only an example!`
  ]) assertNoResolution(text);
  const paragraphQuestion = extract(`What might this symbolize?\n\n${assertion}`);
  assert.equal(paragraphQuestion.reading.claims.at(-1).status, "resolved");
});

test("recognizable conditional and correction context guards claims across blank paragraphs", () => {
  const assertion = "At the supplied instant, Sun is in Aries.";
  for (const text of [
    `If this were another chart:\n\n${assertion}`,
    `Suppose a different date had been supplied.\n\n${assertion}`,
    `This is a hypothetical reading.\n\n${assertion}`,
    `An example follows.\n\n${assertion}`,
    `Another chart:\n\n${assertion}`,
    `${assertion}\n\nThe previous statement is false.`,
    `${assertion}\n\nThe preceding statement is incorrect.`,
    `${assertion}\n\nI never asserted the above.`
  ]) {
    const result = assertNoResolution(text);
    assert.ok(result.extraction.reasons["unresolved-document-context"] > 0);
  }
});

test("preserves duplicate and reversed-aspect occurrences without adding omitted facts", () => {
  const lines = [
    "At the supplied instant, Sun is in Aries.",
    "At the supplied instant, Sun is in Aries.",
    "At the supplied instant, Sun forms trine with Moon.",
    "At the supplied instant, Moon forms trine with Sun.",
    "At the supplied instant, Sun is not in Aries."
  ];
  const result = extract(lines.join("\n"));
  const claims = result.reading.claims;
  assert.equal(claims.length, lines.length);
  assert.ok(claims.every((claim) => claim.status === "resolved"));
  assert.equal(new Set(claims.map((claim) => claim.id)).size, claims.length);
  assert.deepEqual(claims[0].factor, claims[1].factor);
  assert.notEqual(claims[0].span.start, claims[1].span.start);
  assert.deepEqual(claims[2].factor, aspect);
  assert.deepEqual(claims[3].factor, { ...aspect, a: "Moon", b: "Sun" });
  assert.equal(claims[4].polarity, "negated");
  assert.deepEqual(claims.map((claim) => claim.span.quote), lines);
  assert.equal(result.reading.claims.some((claim) => claim.factor?.kind === "house"), false);
  assert.equal(result.reading.claims.some((claim) => claim.factor?.kind === "dignity"), false);
});

test("unknown and empty prose supplies no invented facts or perfect extraction claim", () => {
  for (const text of ["", " \t\r\n\n "]) {
    const result = extract(text);
    assert.deepEqual(result.reading.claims, []);
    assert.equal(result.extraction.coverage, "unverified");
    assert.equal(result.extraction.diagnostics.resolved, 0);
    assert.equal(result.reading.text, text);
  }
  const unknown = assertNoResolution("This original symbolic reflection invites curiosity.");
  assert.equal(unknown.extraction.coverage, "unverified");
  assert.equal(unknown.extraction.diagnostics.resolved, 0);
  assert.ok(unknown.extraction.diagnostics.unsupported + unknown.extraction.diagnostics.ambiguous > 0);
});

test("preserves exact UTF-16 spans, CRLF, combining marks and every non-whitespace character", () => {
  const text = " 🌙 e\u0301 original reflection.\r\n\r\n  At the supplied instant, The Sun is in Aries.\r\n";
  const result = extract(text);
  assert.equal(result.reading.text, text);
  assert.equal(validateReading(result.reading).valid, true);
  const seen = new Set();
  for (const claim of result.reading.claims) {
    const { start, end, quote } = claim.span;
    assert.equal(text.slice(start, end), quote);
    for (let offset = start; offset < end; offset++) {
      assert.equal(seen.has(offset), false);
      seen.add(offset);
    }
  }
  for (let offset = 0; offset < text.length; offset++) {
    if (!/\s/.test(text[offset])) assert.ok(seen.has(offset), `unretained offset ${offset}`);
  }
  const diagnostics = result.extraction.diagnostics;
  assert.equal(diagnostics.utf16CodeUnits, text.length);
  assert.equal(diagnostics.quotedCodeUnits, seen.size);
  assert.equal(diagnostics.unquotedCodeUnits, text.length - seen.size);
  assert.equal(diagnostics.segments, result.reading.claims.length);
  for (const status of ["resolved", "ambiguous", "unsupported", "abstained"]) {
    assert.equal(diagnostics[status], result.reading.claims.filter((claim) => claim.status === status).length);
  }
});

test("returns frozen owned snapshots and digests while retaining supplied provenance and conventions", () => {
  const value = input();
  const before = structuredClone(value);
  const result = extractReadingClaims(value);
  assert.deepEqual(value, before);
  assert.equal(Object.isFrozen(value), false);
  assert.deepEqual(result.reading.provenance, before.provenance);
  assert.deepEqual(result.reading.license, before.license);
  assert.deepEqual(result.reading.conventions, before.conventions);
  assert.equal(result.reading.caseId, before.caseId);
  assert.equal(result.reading.id, before.id);
  assert.equal(result.reading.extraction.method, "parser");
  assert.equal(result.reading.extraction.coverage, "unverified");
  assert.equal(result.reading.extraction.producer, result.extraction.id);
  assert.equal(result.reading.extraction.version, "prose-v1");
  assert.equal(result.extraction.version, "1.0.0");
  assert.match(result.extraction.digest, /^sha256:[a-f0-9]{64}$/);
  assert.equal(result.extraction.inputDigest, sha256(canonicalJson(before)));
  assert.equal(result.extraction.readingDigest, sha256(canonicalJson(result.reading)));
  assert.equal(result.extraction.coverage, "unverified");
  assert.deepEqual(result.extraction.limits, EXTRACTION_LIMITS);
  assert.equal(result.extraction.limits.discourseUnderstanding, false);
  assert.equal(result.extraction.limits.recallMeasured, false);
  assert.equal(result.extraction.limits.characterAccountingIsRecall, false);
  assert.equal(result.extraction.limits.factualCorrectnessChecked, false);
  function frozen(value) {
    if (value && typeof value === "object") {
      assert.equal(Object.isFrozen(value), true);
      Object.values(value).forEach(frozen);
    }
  }
  frozen(result);
  value.text = "Changed after extraction.";
  value.conventions.zodiac = "sidereal";
  assert.equal(result.reading.text, before.text);
  assert.deepEqual(result, extractReadingClaims(freezeData(before)));
  assert.deepEqual(result, JSON.parse(JSON.stringify(result)));
});

test("refuses malformed envelopes and existing extractions without getter reads or raw error text", () => {
  for (const value of [undefined, null, [], {}, "private-input-marker", { ...input(), text: 1 },
    { ...input(), synthetic: false }, { ...input(), text: "\ud800" }]) refuses(value, "invalid-reading");
  for (const method of ["manual", "model", "parser"]) {
    const value = input();
    value.extraction.method = method;
    refuses(value, "already-extracted");
  }
  const extracted = readingFor(syntheticCase(), [resolved(placement)]);
  refuses(extracted, "already-extracted");
  const invalidNone = structuredClone(extracted);
  invalidNone.extraction.method = "none";
  refuses(invalidNone, "invalid-reading");
  let reads = 0;
  const accessor = input();
  Object.defineProperty(accessor, "text", { enumerable: true, get() { reads++; return "private-input-marker"; } });
  refuses(accessor, "invalid-reading");
  assert.equal(reads, 0);
});

test("enforces quote and claim bounds without truncating or returning a partial extraction", () => {
  for (const character of ["x", "🌙"]) {
    const accepted = extract(character.repeat(4096));
    assert.equal(accepted.reading.claims.length, 1);
    assert.equal(accepted.reading.claims[0].span.quote, character.repeat(4096));
    refuses(input(character.repeat(4097)), "extraction-limit");
  }
  const sentence = "Sun is in Aries.";
  const accepted = extract(Array(256).fill(sentence).join("\n"));
  assert.equal(accepted.reading.claims.length, 256);
  refuses(input(Array(257).fill(sentence).join("\n")), "extraction-limit");
  refuses(input("x".repeat(32769)), "invalid-reading");
});

test("extraction repeats offline across property order and fresh-process working directories", () => {
  const value = input();
  const moduleUrl = new URL("../lib/extract-reading-claims.mjs", import.meta.url).href;
  const code = `globalThis.fetch = () => { throw new Error('Network forbidden'); };
    const { extractReadingClaims } = await import(${JSON.stringify(moduleUrl)});
    console.log(JSON.stringify(extractReadingClaims(${JSON.stringify(value)})));`;
  const run = (cwd) => execFileSync(process.execPath, ["--input-type=module", "-e", code], {
    cwd, encoding: "utf8", timeout: 30000, maxBuffer: 1024 * 1024
  });
  const first = run(new URL("../../", import.meta.url));
  assert.equal(run(new URL("../", import.meta.url)), first);
  const reordered = Object.fromEntries(Object.entries(value).reverse());
  assert.equal(JSON.stringify(extractReadingClaims(reordered)) + "\n", first);
});
