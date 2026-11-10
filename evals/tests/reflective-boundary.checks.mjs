import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  checkReflectiveLanguage, ReflectiveLanguageError, REFLECTIVE_LIMITS
} from "../lib/check-reflective-language.mjs";

// Original MIT test prose and rejected inputs, authored for this checker.
// These checks establish input, evidence and runtime contracts only.
const benign = "Consider how you approach shared work.\nNotice which habits support careful reflection.";
const digest = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const policyBytes = readFileSync(new URL("../rubrics/reflective-v1.json", import.meta.url));
const selection = { rubricId: "chart-reading-reflective", rubricVersion: "1.0.0" };

function refuses(text, options, code) {
  assert.throws(() => checkReflectiveLanguage(text, options), (error) => {
    assert.ok(error instanceof ReflectiveLanguageError);
    assert.equal(error.code, code);
    assert.deepEqual(Object.keys(error).sort(), ["code", "name"]);
    assert.equal(error.cause, undefined);
    assert.equal(error.score, undefined);
    assert.equal(error.findings, undefined);
    assert.ok(!error.message.includes("private-input-marker"));
    return true;
  });
}

function assertFrozen(value) {
  if (!value || typeof value !== "object") return;
  assert.ok(Object.isFrozen(value));
  for (const child of Object.values(value)) assertFrozen(child);
}

function assertReport(result, text) {
  assert.equal(result.schemaVersion, "1.0.0");
  assert.equal(result.dimension, "reflective-not-predictive");
  assert.deepEqual(result.rubric, {
    id: selection.rubricId, version: selection.rubricVersion, digest: digest(policyBytes)
  });
  assert.match(result.implementation.id, /^\S+$/);
  assert.match(result.implementation.version, /^\d+\.\d+\.\d+$/);
  assert.match(result.implementation.digest, /^sha256:[a-f0-9]{64}$/);
  assert.deepEqual(result.input, {
    textDigest: digest(text), utf16CodeUnits: text.length, codePoints: [...text].length
  });
  assert.equal(result.offsetUnit, "utf16-code-unit");
  assert.equal(result.counts.findings, result.findings.length);
  assert.equal(result.counts.matches,
    Object.values(result.counts.byRule).reduce((total, count) => total + count, 0));
  assert.ok(result.counts.matches >= result.counts.findings);
  assert.ok(result.counts.matches <= REFLECTIVE_LIMITS.matches);
  for (const count of Object.values(result.counts.byRule)) {
    assert.ok(Number.isSafeInteger(count) && count >= 0);
  }
  assert.equal(result.score.maximum, 100);
  assert.equal(result.score.rawPenaltyPoints,
    result.findings.reduce((total, finding) => total + finding.penaltyPoints, 0));
  assert.equal(result.score.appliedPenaltyPoints, Math.min(result.score.rawPenaltyPoints, 100));
  if (result.score.points !== null) {
    assert.equal(result.score.points, 100 - result.score.appliedPenaltyPoints);
  }
  assert.equal(new Set(result.findings.map(({ id }) => id)).size, result.findings.length);
  for (const finding of result.findings) {
    const { start, end, quote } = finding.span;
    assert.ok(Number.isSafeInteger(start) && Number.isSafeInteger(end));
    assert.ok(start >= 0 && end > start && end <= text.length);
    assert.equal(text.slice(start, end), quote);
    assert.equal(quote.isWellFormed(), true);
    assert.ok(finding.ruleIds.length > 0);
    assert.equal(new Set(finding.ruleIds).size, finding.ruleIds.length);
    assert.equal(finding.penaltyPoints, 25);
  }
  assert.deepEqual(result.limits, REFLECTIVE_LIMITS);
  assert.ok(result.limitations && typeof result.limitations === "object");
  assert.ok(Buffer.byteLength(JSON.stringify(result), "utf8") + 1 <= REFLECTIVE_LIMITS.reportBytes);
  assertFrozen(result);
}

test("reflective checker retains empty-input uncertainty and explicit policy selection", () => {
  assert.deepEqual(REFLECTIVE_LIMITS, {
    textCodePoints: 32768, matches: 512, reportBytes: 1048576
  });
  assertFrozen(REFLECTIVE_LIMITS);
  for (const text of ["", " \t\r\n\n ", "\u00a0\u2003"]) {
    const result = checkReflectiveLanguage(text);
    assertReport(result, text);
    assert.equal(result.status, "unassessed");
    assert.equal(result.score.points, null);
    assert.equal(result.score.rawPenaltyPoints, 0);
    assert.equal(result.score.appliedPenaltyPoints, 0);
    assert.equal(result.counts.matches, 0);
    assert.deepEqual(result.findings, []);
  }
  const result = checkReflectiveLanguage(benign);
  assertReport(result, benign);
  assert.equal(result.status, "no-detected-violations");
  assert.equal(result.score.points, 100);
  assert.deepEqual(checkReflectiveLanguage(benign, selection), result);
  assert.deepEqual(checkReflectiveLanguage(benign, Object.freeze({ ...selection })), result);
  assert.deepEqual(checkReflectiveLanguage(benign, Object.create(null)), result);
});

test("reflective checker refuses malformed options and unsupported rubric selections", () => {
  for (const options of [null, [], 1, true, "private-input-marker", { extra: "private-input-marker" },
    { rubricId: undefined }, { rubricVersion: () => "private-input-marker" }, { rubricId: 1n },
    new Map(), Object.create({ rubricId: selection.rubricId })]) {
    refuses(benign, options, "invalid-options");
  }
  for (const options of [
    { rubricId: "private-input-marker" }, { rubricVersion: "2.0.0" },
    { rubricId: null }, { rubricVersion: null }, { rubricId: 1 }, { rubricVersion: false }
  ]) refuses(benign, options, "unsupported-rubric");

  const cyclic = {};
  cyclic.rubricId = cyclic;
  refuses(benign, cyclic, "invalid-options");
  const symbolKey = { [Symbol("private-input-marker")]: "hidden" };
  refuses(benign, symbolKey, "invalid-options");
  const nonenumerable = {};
  Object.defineProperty(nonenumerable, "rubricId", { value: selection.rubricId });
  refuses(benign, nonenumerable, "invalid-options");
});

test("reflective checker does not coerce text or invoke option accessors", () => {
  let reads = 0;
  const coercible = {
    toString() { reads++; return "private-input-marker"; },
    [Symbol.toPrimitive]() { reads++; return "private-input-marker"; }
  };
  for (const text of [undefined, null, true, 1, 1n, Symbol("private-input-marker"),
    [], {}, new String(benign), coercible, () => "private-input-marker"]) {
    refuses(text, {}, "invalid-text");
  }
  const accessor = {};
  Object.defineProperty(accessor, "rubricId", {
    enumerable: true, get() { reads++; return selection.rubricId; }
  });
  refuses(benign, accessor, "invalid-options");
  assert.equal(reads, 0);
  for (const text of ["\ud800", "\udfff", "x\ud800y", "\udfff\ud800"]) {
    refuses(text, {}, "invalid-text");
  }
});

test("reflective checker counts Unicode code points at the exact input boundary", () => {
  for (const character of ["x", "\u{1f319}"]) {
    const text = character.repeat(REFLECTIVE_LIMITS.textCodePoints);
    const result = checkReflectiveLanguage(text);
    assertReport(result, text);
    assert.equal(result.input.codePoints, REFLECTIVE_LIMITS.textCodePoints);
    assert.equal(result.input.utf16CodeUnits, character.length * REFLECTIVE_LIMITS.textCodePoints);
    refuses(text + character, {}, "input-limit");
  }
});

test("rejected-input findings retain exact UTF-16 offsets after Unicode and CRLF", () => {
  // Rejected input only: an original prohibited outcome assertion.
  const prefix = "\u{1f319} e\u0301 original reflection.\r\n\r\n";
  const rejected = "You\r\nwill meet someone.";
  const text = `${prefix}${rejected}\r\n`;
  const result = checkReflectiveLanguage(text);
  assertReport(result, text);
  assert.ok(result.findings.length > 0);
  assert.ok(result.score.points < 100);
  for (const { span } of result.findings) {
    assert.ok(span.start >= prefix.length);
    assert.ok(span.end <= prefix.length + rejected.length);
  }
  assert.notEqual(result.input.textDigest, digest(text.normalize("NFC")));
  assert.notEqual(result.input.textDigest, digest(text.replaceAll("\r\n", "\n")));
});

test("rejected-input match bounds refuse the whole assessment without partial evidence", () => {
  // Rejected input only: a financial token creates one match per occurrence.
  const token = "money";
  const acceptedAtBound = Array(REFLECTIVE_LIMITS.matches).fill(token).join(" ");
  const result = checkReflectiveLanguage(acceptedAtBound);
  assertReport(result, acceptedAtBound);
  assert.equal(result.counts.matches, REFLECTIVE_LIMITS.matches);
  assert.equal(result.findings.length, REFLECTIVE_LIMITS.matches);
  assert.equal(result.score.rawPenaltyPoints, 25 * REFLECTIVE_LIMITS.matches);
  assert.equal(result.score.appliedPenaltyPoints, 100);
  assert.equal(result.score.points, 0);
  refuses(`${acceptedAtBound} ${token}`, {}, "match-limit");
});

test("reflective checker returns immutable owned data and exact raw-text identities", () => {
  const options = { ...selection };
  const before = structuredClone(options);
  const result = checkReflectiveLanguage(benign, options);
  assertReport(result, benign);
  assert.deepEqual(options, before);
  assert.equal(Object.isFrozen(options), false);
  options.rubricVersion = "2.0.0";
  assert.equal(result.rubric.version, selection.rubricVersion);
  assert.throws(() => { result.score.points = 0; }, TypeError);
  assert.throws(() => { result.findings.push({}); }, TypeError);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
  const changed = checkReflectiveLanguage(`${benign} `);
  assert.notEqual(changed.input.textDigest, result.input.textDigest);
  assert.equal(changed.rubric.digest, result.rubric.digest);
  assert.equal(changed.implementation.digest, result.implementation.digest);
});

test("reflective checker repeats offline across fresh processes and working directories", () => {
  const moduleUrl = new URL("../lib/check-reflective-language.mjs", import.meta.url).href;
  const code = `globalThis.fetch = () => { throw new Error('Network forbidden in test'); };
    const { checkReflectiveLanguage } = await import(${JSON.stringify(moduleUrl)});
    console.log(JSON.stringify(checkReflectiveLanguage(${JSON.stringify(benign)}, ${JSON.stringify(selection)})));`;
  const run = (cwd) => execFileSync(process.execPath, ["--input-type=module", "-e", code], {
    cwd, encoding: "utf8", timeout: 30000, maxBuffer: REFLECTIVE_LIMITS.reportBytes
  });
  const first = run(new URL("../../", import.meta.url));
  assert.equal(run(new URL("../", import.meta.url)), first);
  const reordered = Object.fromEntries(Object.entries(selection).reverse());
  assert.equal(JSON.stringify(checkReflectiveLanguage(benign, reordered)) + "\n", first);
});
