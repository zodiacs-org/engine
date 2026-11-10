import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { computeChartFacts } from "../lib/chart-facts.mjs";
import { canonicalJson, freezeData } from "../lib/generator-data.mjs";
import { SCORING_REPORT_BYTES, ScoringError, scoreReading } from "../lib/score-reading.mjs";
import { validateReading } from "../lib/validate-reading.mjs";

const synthetic = (birth = {}) => ({
  schemaVersion: "1.0.0", id: "scoring-boundary-case", synthetic: true,
  birth: { utc: "2003-05-17T08:13:00Z", latitude: 35, longitude: 12, ...birth }
});
const reading = () => ({
  schemaVersion: "1.0.0", id: "scoring-boundary-reading", caseId: synthetic().id,
  synthetic: true, language: "en", text: "", offsetUnit: "utf16-code-unit",
  conventions: { zodiac: "tropical", houseSystem: "whole", aspectPolicy: "natal-major-defaults", dignitySystem: "classical-sign" },
  provenance: { kind: "authored", authors: ["Evals test contributors"], note: "Original AI-assisted synthetic test input." },
  extraction: { method: "none", producer: "boundary-test", version: "v1", coverage: "unverified" },
  claims: [], license: { spdxId: "MIT", attribution: "Evals test contributors" }
});
const hash = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const rejects = (promise, code) => assert.rejects(promise, (error) => {
  assert.ok(error instanceof ScoringError);
  assert.equal(error.code, code);
  assert.deepEqual(Object.keys(error).sort(), ["code", "name"]);
  assert.equal(error.cause, undefined);
  assert.equal(error.overall, undefined);
  assert.equal(error.scores, undefined);
  return true;
});

test("scorer refuses malformed inputs, case mismatch and failed engine computation without scores", async () => {
  for (const value of [null, [], {}, { ...synthetic(), synthetic: false }, { ...synthetic(), schemaVersion: "2.0.0" }]) {
    await rejects(scoreReading(value, reading()), "invalid-case");
  }
  for (const value of [null, [], {}, { ...reading(), schemaVersion: "2.0.0" }, { ...reading(), claims: [null] }]) {
    await rejects(scoreReading(synthetic(), value), "invalid-reading");
  }
  await rejects(scoreReading(synthetic(), { ...reading(), caseId: "another-case" }), "case-mismatch");
  await rejects(scoreReading(synthetic({ utc: "2003-02-30T08:13:00Z" }), reading()), "reference-failed");
  await rejects(scoreReading(synthetic({ utc: "9000-01-01T00:00:00Z" }), reading()), "reference-failed");
  const nonJson = reading();
  nonJson.text = () => "not JSON";
  await rejects(scoreReading(synthetic(), nonJson), "invalid-reading");
  const cyclic = reading();
  cyclic.claims.push(cyclic);
  await rejects(scoreReading(synthetic(), cyclic), "invalid-reading");
});

test("scorer allows only the implemented rubric and never accepts supplied reference facts", async () => {
  const expected = await scoreReading(synthetic(), reading());
  assert.deepEqual(await scoreReading(synthetic(), reading(), {
    rubricId: "chart-reading-factual", rubricVersion: "1.0.0"
  }), expected);
  for (const options of [{ rubricId: "other" }, { rubricVersion: "2.0.0" }, { rubricVersion: null }, { rubricId: 1 }]) {
    await rejects(scoreReading(synthetic(), reading(), options), "unsupported-rubric");
  }
  for (const options of [null, [], 1, { reference: {} }, { facts: [] }, { rubricId: undefined }, { backend: "mock" }]) {
    await rejects(scoreReading(synthetic(), reading(), options), "invalid-options");
  }
  const supplied = await computeChartFacts(synthetic());
  await rejects(scoreReading(supplied, reading()), "invalid-case");
  await rejects(scoreReading(synthetic(), reading(), { reference: supplied }), "invalid-options");
  await rejects(scoreReading(synthetic(), reading(), { reference: { ...supplied, facts: [] } }), "invalid-options");
});

test("scorer rejects accessors without evaluating them and rejects unsupported resolved factors", async () => {
  const value = reading();
  let reads = 0;
  Object.defineProperty(value, "text", { enumerable: true, get() { reads++; return "ignored"; } });
  await rejects(scoreReading(synthetic(), value), "invalid-reading");
  assert.equal(reads, 0);
  for (const factor of [
    { kind: "aspect", a: "North Node", b: "Sun", aspect: "trine", policy: "natal-major-defaults" },
    { kind: "dignity", body: "Pluto", sign: "scorpio", dignity: "domicile", system: "classical-sign" },
    { kind: "placement", body: "Chiron", sign: "aries" }
  ]) {
    const input = reading();
    input.text = "Unsupported categorical test assertion.";
    input.extraction.method = "manual";
    input.claims = [{ schemaVersion: "1.0.0", id: "unsupported-factor", status: "resolved", factor,
      span: { start: 0, end: input.text.length, quote: input.text }, polarity: "negated",
      certainty: "unqualified", temporalScope: "reference-instant" }];
    await rejects(scoreReading(synthetic(), input), "invalid-reading");
  }
});

test("scorer snapshots inputs before awaiting the engine and returns deeply frozen self-contained evidence", async () => {
  const originalCase = synthetic();
  const originalReading = reading();
  const savedCase = structuredClone(originalCase);
  const savedReading = structuredClone(originalReading);
  const pending = scoreReading(originalCase, originalReading);
  originalCase.birth.utc = "2005-01-01T00:00:00Z";
  originalReading.text = "Changed while computation was pending.";
  originalReading.provenance.authors[0] = "Changed author";
  const result = await pending;
  assert.deepEqual(result.case, savedCase);
  assert.deepEqual(result.reading, savedReading);
  assert.deepEqual(result.reference, await computeChartFacts(savedCase));
  assert.deepEqual(await scoreReading(freezeData(savedCase), freezeData(savedReading)), result);
  function checkFrozen(value) {
    if (!value || typeof value !== "object") return;
    assert.ok(Object.isFrozen(value));
    for (const child of Object.values(value)) checkFrozen(child);
  }
  checkFrozen(result);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
  assert.throws(() => { result.reference.facts.pop(); }, TypeError);
  assert.throws(() => { result.reading.text = "changed"; }, TypeError);
  assert.equal(Object.isFrozen(originalReading), false);
});

test("scorer hashes complete inputs, exact rubric bytes and complete reference while retaining provenance", async () => {
  const value = reading();
  value.text = "Original prose with no supplied extraction.";
  value.provenance = { kind: "generated", backend: "mock", model: "offline-test", promptVersion: "test-v1",
    inputDigest: `sha256:${"a".repeat(64)}`, reviewStatus: "unreviewed" };
  const result = await scoreReading(synthetic({ timeScale: "ut1", deltaT: 65 }), value);
  assert.equal(result.identity.caseDigest, hash(canonicalJson(result.case)));
  assert.equal(result.identity.readingDigest, hash(canonicalJson(value)));
  assert.equal(result.identity.referenceDigest, hash(canonicalJson(result.reference)));
  assert.equal(result.rubric.digest, hash(readFileSync(new URL("../rubrics/factual-v1.json", import.meta.url))));
  assert.deepEqual({ ...result.implementation, digest: null }, {
    id: "deterministic-reading-scorer", version: "1.0.0", digest: null
  });
  assert.match(result.implementation.digest, /^sha256:[0-9a-f]{64}$/);
  assert.equal(result.reference.time.deltaT.model, "pinned");
  assert.equal(result.reference.time.deltaT.seconds, 65);
  assert.equal(result.reference.time.timeScale.input, "ut1");
  assert.equal(result.limits.extractionCoverage, "unverified");
  assert.equal(result.limits.interpretiveQuality, "not-scored");
  assert.equal(result.limits.exhaustiveLogicalConsistency, false);
  assert.deepEqual(result.reading.provenance, value.provenance);
  assert.equal(result.overall.metrics.correctness.value, null);
  assert.equal(result.overall.metrics.coverage.value, 0);
  const changed = await scoreReading(synthetic({ timeScale: "ut1", deltaT: 65 }), { ...value, text: value.text + " " });
  assert.notEqual(changed.identity.readingDigest, result.identity.readingDigest);
  assert.equal(changed.identity.referenceDigest, result.identity.referenceDigest);
  const otherCase = synthetic({ utc: "2004-05-17T08:13:00Z" });
  const other = await scoreReading(otherCase, value);
  assert.notEqual(other.identity.caseDigest, result.identity.caseDigest);
  assert.notEqual(other.identity.referenceDigest, result.identity.referenceDigest);
});

test("scorer retains outside-reference-span warnings without changing comparison eligibility", async () => {
  const input = synthetic({ utc: "1700-05-17T08:13:00Z" });
  const facts = await computeChartFacts(input);
  const value = reading();
  value.text = "A synthetic reference placement assertion.";
  value.extraction.method = "manual";
  value.claims = [{ schemaVersion: "1.0.0", id: "outside-reference", status: "resolved", factor: facts.facts[0],
    span: { start: 0, end: value.text.length, quote: value.text }, polarity: "affirmed",
    certainty: "unqualified", temporalScope: "reference-instant" }];
  const result = await scoreReading(input, value);
  assert.equal(result.reference.coverage.outsideReferenceSpan, true);
  assert.ok(result.reference.flags.includes("outside-reference-span"));
  assert.equal(result.units[0].verdict, "correct");
  assert.equal(result.units[0].coverage.credited, true);
});

test("scorer reports repeat identically across property order, fresh processes and working directories offline", async () => {
  const moduleUrl = new URL("../lib/score-reading.mjs", import.meta.url).href;
  const code = `globalThis.fetch = () => { throw new Error('Network forbidden in test'); };
    const { scoreReading } = await import(${JSON.stringify(moduleUrl)});
    console.log(JSON.stringify(await scoreReading(${JSON.stringify(synthetic())}, ${JSON.stringify(reading())})));`;
  const root = new URL("../../", import.meta.url);
  const project = new URL("../", import.meta.url);
  const first = execFileSync(process.execPath, ["--input-type=module", "-e", code], {
    cwd: root, encoding: "utf8", timeout: 30000, maxBuffer: SCORING_REPORT_BYTES
  });
  const second = execFileSync(process.execPath, ["--input-type=module", "-e", code], {
    cwd: project, encoding: "utf8", timeout: 30000, maxBuffer: SCORING_REPORT_BYTES
  });
  assert.equal(first, second);
  function reorder(value) {
    if (Array.isArray(value)) return value.map(reorder);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).reverse().map(([k, v]) => [k, reorder(v)]));
    return value;
  }
  assert.equal(JSON.stringify(await scoreReading(reorder(synthetic()), reorder(reading()))) + "\n", first);
});

test("scorer bounds canonical inputs and compact reports without truncating readings", async () => {
  assert.equal(SCORING_REPORT_BYTES, 1_048_576);
  const value = reading();
  value.extraction.method = "manual";
  value.text = "x".repeat(4096);
  value.claims = Array.from({ length: 220 }, (_, index) => ({
    schemaVersion: "1.0.0", id: `bound-${index}`, status: "resolved",
    span: { start: 0, end: value.text.length, quote: value.text },
    factor: { kind: "dignity", body: ["Sun", "Moon", "Mercury", "Venus", "Mars"][Math.floor(index / 48)],
      sign: ["aries", "taurus", "gemini", "cancer", "leo", "virgo", "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces"][Math.floor(index / 4) % 12],
      dignity: ["domicile", "exaltation", "detriment", "fall"][index % 4], system: "classical-sign" },
    polarity: "affirmed", certainty: "unqualified", temporalScope: "reference-instant"
  }));
  assert.equal(validateReading(value).valid, true);
  assert.ok(Buffer.byteLength(canonicalJson(value)) < 1_048_576);
  const saved = structuredClone(value);
  await rejects(scoreReading(synthetic(), value), "output-limit");
  assert.deepEqual(value, saved);
  const smaller = { ...value, claims: value.claims.slice(0, 20) };
  const result = await scoreReading(synthetic(), smaller);
  assert.ok(Buffer.byteLength(JSON.stringify(result)) + 1 <= SCORING_REPORT_BYTES);
  assert.deepEqual(result.reading, smaller);
  const tooLarge = { ...value, claims: [...value.claims, ...value.claims.slice(0, 36).map((claim, i) => ({ ...claim, id: `extra-${i}` }))] };
  assert.equal(validateReading(tooLarge).valid, true);
  assert.ok(Buffer.byteLength(JSON.stringify(tooLarge)) > 1_048_576);
  await rejects(scoreReading(synthetic(), tooLarge), "invalid-reading");
});
