import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { computeChartFacts } from "../lib/chart-facts.mjs";
import { EVALUATION_REPORT_BYTES, EvaluationError, evaluateReading } from "../lib/evaluate-reading.mjs";
import { canonicalJson, freezeData, sha256 } from "../lib/generator-data.mjs";
import { scoreReading } from "../lib/score-reading.mjs";
import { validateReading } from "../lib/validate-reading.mjs";
import { assertMetric, readingFor, resolved, syntheticCase, unresolved } from "./scoring-helpers.mjs";

function rejects(promise, code) {
  return assert.rejects(promise, (error) => {
    assert.ok(error instanceof EvaluationError);
    assert.equal(error.code, code);
    assert.deepEqual(Object.keys(error).sort(), ["code", "name"]);
    assert.equal(error.cause, undefined);
    assert.ok(!error.message.includes("private-input-marker"));
    return true;
  });
}

test("default evaluation renders local facts as a labeled mock and retains the full recomputed score", async () => {
  const input = syntheticCase();
  const result = await evaluateReading(input);
  assert.equal(result.schemaVersion, "1.0.0");
  assert.equal(result.status, "completed");
  const { workflow, score } = result;
  assert.equal(workflow.id, "offline-reading-evaluation");
  assert.equal(workflow.version, "1.1.0");
  assert.match(workflow.digest, /^sha256:[0-9a-f]{64}$/);
  assert.equal(workflow.mode, "mock");
  assert.deepEqual(score.reference, await computeChartFacts(input));
  assert.deepEqual(score, await scoreReading(input, score.reading));
  assert.deepEqual(score.reading.claims.map(({ factor }) => factor), score.reference.facts);
  assert.equal(validateReading(score.reading).valid, true);
  assert.match(score.reading.text, /^Offline mock reading derived from the local engine for workflow checks\./);
  assert.deepEqual(score.reading.provenance, {
    kind: "generated", backend: "mock-reading", model: "offline-fact-renderer-v1",
    promptVersion: "mock-reading-v1", inputDigest: workflow.mock.inputDigest, reviewStatus: "unreviewed"
  });
  assert.deepEqual(score.reading.extraction, {
    method: "parser", producer: "mock-reading-renderer", version: "mock-reading-v1", coverage: "unverified"
  });
  assert.equal(workflow.mock.id, "engine-fact-reading-mock");
  assert.equal(workflow.mock.version, "1.0.0");
  assert.equal(workflow.mock.referenceDigest, score.identity.referenceDigest);
  assert.equal(workflow.mock.inputDigest, sha256(canonicalJson({
    templateVersion: "mock-reading-v1", caseDigest: score.identity.caseDigest,
    referenceDigest: score.identity.referenceDigest
  })));
  assert.equal(score.reading.license.spdxId, "MIT");
  for (const kind of ["placement", "aspect", "house", "dignity"]) {
    const count = score.reference.facts.filter((factor) => factor.kind === kind).length;
    assert.ok(count > 0, `synthetic example exercises ${kind}`);
    assertMetric(score.categories[kind].metrics.correctness, count, count);
    assertMetric(score.categories[kind].metrics.coverage, count, count);
  }
  assert.deepEqual(score.limits, {
    extractionCoverage: "unverified", interpretiveQuality: "not-scored", exhaustiveLogicalConsistency: false
  });
});

test("mock keeps reference-instant scope, missing-house reasons and actual polar fallback", async () => {
  const missingPlace = syntheticCase();
  delete missingPlace.birth.latitude;
  delete missingPlace.birth.longitude;
  for (const input of [syntheticCase({ timeKnown: false }), missingPlace,
    { ...missingPlace, birth: { ...missingPlace.birth, timeKnown: false } }]) {
    const { score } = await evaluateReading(input);
    assert.equal(score.reference.availability.houses.status, "unavailable");
    assert.ok(score.reference.availability.houses.reasons.length > 0);
    assert.equal(score.reading.conventions.houseSystem, "unspecified");
    assert.equal(score.reading.claims.filter((claim) => claim.factor?.kind === "house").length, 0);
    assert.equal(score.diagnostics.occurrences.abstained, 1);
    assert.equal(score.categories.house.counts.referenceFactors, 0);
    assertMetric(score.categories.house.metrics.coverage, 0, 0);
    assert.ok(score.units.every((unit) => unit.temporalScope === "reference-instant" && unit.verdict === "correct"));
    assertMetric(score.overall.metrics.coverage, score.reference.facts.length, score.reference.facts.length);
  }
  const { score } = await evaluateReading(syntheticCase({ latitude: 78, houseSystem: "placidus" }));
  assert.equal(score.reference.availability.houses.requestedSystem, "placidus");
  assert.equal(score.reference.availability.houses.actualSystem, "whole");
  assert.ok(score.reference.flags.includes("polar-fallback"));
  assert.equal(score.reading.conventions.houseSystem, "whole");
  assert.ok(score.units.filter((unit) => unit.category === "house")
    .every((unit) => unit.factor.houseSystem === "whole" && unit.verdict === "correct"));
});

test("supplied evaluations preserve incorrect, duplicated, unresolved and conflicting assertions without replacing them", async () => {
  const input = syntheticCase();
  const reference = await computeChartFacts(input);
  const factor = reference.facts.find((factor) => factor.kind === "placement");
  const reading = readingFor(input, [resolved(factor), resolved(factor),
    resolved(factor, { polarity: "negated" }), unresolved("unsupported", "Original unsupported assertion.")]);
  const result = await evaluateReading(input, { reading });
  assert.equal(result.workflow.mode, "supplied");
  assert.equal(result.workflow.mock, null);
  assert.deepEqual(result.score, await scoreReading(input, reading));
  assert.deepEqual(result.score.reading, reading);
  assert.equal(result.score.overall.counts.correct, 1);
  assert.equal(result.score.overall.counts.incorrect, 1);
  assert.equal(result.score.overall.counts.contradicted, 2);
  assert.equal(result.score.overall.counts.coveredFactors, 0);
  assert.equal(result.score.diagnostics.duplicateResolved, 1);
  assert.equal(result.score.diagnostics.occurrences.unsupported, 1);

  const empty = readingFor(input);
  empty.text = "Original symbolic reflection without supplied claims: consider what matters to you.\n";
  const noClaims = await evaluateReading(input, { reading: empty });
  assert.equal(noClaims.workflow.mode, "supplied");
  assert.equal(noClaims.score.reading.text, empty.text);
  assertMetric(noClaims.score.overall.metrics.correctness, 0, 0);
  assertMetric(noClaims.score.overall.metrics.coverage, 0, reference.facts.length);

  const sidereal = readingFor(input, [resolved(factor)], { zodiac: "sidereal" });
  const excluded = await evaluateReading(input, { reading: sidereal });
  assert.equal(excluded.score.units[0].verdict, "unassessed");
  assert.ok(excluded.score.units[0].eligibility.reasons.includes("convention-mismatch"));
});

test("evaluation captures options and inputs before awaiting and freezes only its own result", async () => {
  const input = syntheticCase();
  const reading = readingFor(input);
  const saved = structuredClone({ input, reading });
  const options = { reading };
  const pending = evaluateReading(input, options);
  input.birth.utc = "2004-01-01T00:00:00Z";
  reading.text = "Changed while waiting.";
  options.reading = null;
  const result = await pending;
  assert.deepEqual(result.score.case, saved.input);
  assert.deepEqual(result.score.reading, saved.reading);
  assert.equal(Object.isFrozen(input), false);
  assert.equal(Object.isFrozen(reading), false);
  function frozen(value) {
    if (value && typeof value === "object") {
      assert.ok(Object.isFrozen(value));
      for (const child of Object.values(value)) frozen(child);
    }
  }
  frozen(result);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
  assert.deepEqual(await evaluateReading(freezeData(saved.input), freezeData({ reading: saved.reading })), result);

  const mockInput = syntheticCase();
  const expectedMockCase = structuredClone(mockInput);
  const mockPromise = evaluateReading(mockInput);
  mockInput.birth.timeKnown = false;
  assert.deepEqual((await mockPromise).score.case, expectedMockCase);
});

test("invalid supplied inputs, unknown options and unavailable rubrics fail without fallback or raw diagnostics", async () => {
  const input = syntheticCase();
  for (const value of [null, [], {}, { ...input, synthetic: false }]) {
    await rejects(evaluateReading(value), "invalid-case");
  }
  for (const reading of [undefined, null, "private-input-marker", {}, { ...readingFor(input), text: 123 }]) {
    await rejects(evaluateReading(input, { reading }), "invalid-reading");
  }
  await rejects(evaluateReading(input, { reading: { ...readingFor(input), caseId: "private-input-marker" } }), "case-mismatch");
  for (const options of [null, [], true, { mode: "mock" }, { backend: "mock" }, { reference: {} }, { facts: [] },
    { rubricId: undefined }, { reading: readingFor(input), unknown: "private-input-marker" }]) {
    await rejects(evaluateReading(input, options), "invalid-options");
  }
  for (const options of [{ rubricId: "private-input-marker" }, { rubricVersion: "2.0.0" }, { rubricVersion: null }]) {
    await rejects(evaluateReading(input, options), "unsupported-rubric");
  }
  assert.deepEqual(await evaluateReading(input, { rubricId: "chart-reading-factual", rubricVersion: "1.0.0" }),
    await evaluateReading(input));
  for (const utc of ["2003-02-30T08:13:00Z", "9000-01-01T00:00:00Z"]) {
    const badCase = syntheticCase({ utc });
    await rejects(evaluateReading(badCase), "reference-failed");
    await rejects(evaluateReading(badCase, { reading: readingFor(badCase) }), "reference-failed");
  }
  let reads = 0;
  const options = { get reading() { reads++; return {}; } };
  await rejects(evaluateReading(input, options), "invalid-options");
  const accessorReading = readingFor(input);
  Object.defineProperty(accessorReading, "text", { enumerable: true, get() { reads++; return "private-input-marker"; } });
  await rejects(evaluateReading(input, { reading: accessorReading }), "invalid-reading");
  assert.equal(reads, 0);
});

test("mock supports long case ids and retains time basis and reference-span warnings", async () => {
  const input = { ...syntheticCase({ utc: "1700-05-17T08:13:00Z", timeScale: "ut1", deltaT: 65 }), id: "a".repeat(100) };
  const { score } = await evaluateReading(input);
  assert.equal(score.reading.caseId, input.id);
  assert.equal(validateReading(score.reading).valid, true);
  assert.equal(score.reference.time.timeScale.input, "ut1");
  assert.equal(score.reference.time.deltaT.seconds, 65);
  assert.equal(score.reference.coverage.outsideReferenceSpan, true);
  assert.ok(score.reference.flags.includes("outside-reference-span"));
});

test("evaluation reports repeat across property order, fresh processes and working directories offline", async () => {
  const input = syntheticCase();
  const moduleUrl = new URL("../lib/evaluate-reading.mjs", import.meta.url).href;
  const code = `globalThis.fetch = () => { throw new Error('Network forbidden'); };
    const { evaluateReading } = await import(${JSON.stringify(moduleUrl)});
    console.log(JSON.stringify(await evaluateReading(${JSON.stringify(input)})));`;
  const run = (cwd) => execFileSync(process.execPath, ["--input-type=module", "-e", code], {
    cwd, encoding: "utf8", timeout: 30000, maxBuffer: EVALUATION_REPORT_BYTES
  });
  const first = run(new URL("../../", import.meta.url));
  assert.equal(run(new URL("../", import.meta.url)), first);
  const reordered = { birth: Object.fromEntries(Object.entries(input.birth).reverse()), synthetic: true,
    id: input.id, schemaVersion: input.schemaVersion };
  assert.equal(JSON.stringify(await evaluateReading(reordered)) + "\n", first);
});

test("evaluation refuses expanded report overflow without truncating an otherwise valid reading", async () => {
  assert.equal(EVALUATION_REPORT_BYTES, 1_048_576);
  const input = syntheticCase();
  const reading = readingFor(input);
  reading.text = "x".repeat(4096);
  const signs = ["aries", "taurus", "gemini", "cancer", "leo", "virgo", "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces"];
  const bodies = ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"];
  reading.claims = Array.from({ length: 220 }, (_, index) => ({
    schemaVersion: "1.0.0", id: `limit-${index}`, status: "resolved",
    span: { start: 0, end: reading.text.length, quote: reading.text },
    factor: { kind: "placement", body: bodies[Math.floor(index / 24)], sign: signs[index % 12] },
    polarity: Math.floor(index / 12) % 2 ? "negated" : "affirmed",
    certainty: "unqualified", temporalScope: "reference-instant"
  }));
  assert.equal(validateReading(reading).valid, true);
  assert.ok(Buffer.byteLength(canonicalJson(reading)) < EVALUATION_REPORT_BYTES);
  const saved = structuredClone(reading);
  await rejects(evaluateReading(input, { reading }), "output-limit");
  assert.deepEqual(reading, saved);
  const smaller = { ...reading, claims: reading.claims.slice(0, 20) };
  const result = await evaluateReading(input, { reading: smaller });
  assert.ok(Buffer.byteLength(canonicalJson(result) + "\n") <= EVALUATION_REPORT_BYTES);
  assert.deepEqual(result.score.reading, smaller);
});

test("evaluation counts language evidence toward the final byte cap when factual scoring alone fits", async () => {
  const input = syntheticCase();
  const reading = readingFor(input);
  // Rejected input only: repeated financial wording exercises bounded evidence.
  reading.text = "money ".repeat(512).padEnd(4096, "x");
  reading.claims = Array.from({ length: 222 }, (_, index) => ({
    schemaVersion: "1.0.0", id: `large-${index}`, status: "unsupported",
    reason: "Original rejected wording retained for bounds checking.",
    span: { start: 0, end: reading.text.length, quote: reading.text }
  }));
  assert.equal(validateReading(reading).valid, true);
  const score = await scoreReading(input, reading);
  assert.ok(Buffer.byteLength(canonicalJson(score)) + 1 <= EVALUATION_REPORT_BYTES);
  await rejects(evaluateReading(input, { reading }), "output-limit");

  const smaller = { ...reading, claims: reading.claims.slice(0, 220) };
  const result = await evaluateReading(input, { reading: smaller });
  assert.equal(result.reflective.counts.findings, 512);
  assert.equal(result.reflective.score.points, 0);
  assert.equal(result.score.reading.claims.length, smaller.claims.length);
  assert.ok(Buffer.byteLength(canonicalJson(result)) + 1 <= EVALUATION_REPORT_BYTES);
  const { reflective, ...withoutLanguage } = result;
  assert.ok(Buffer.byteLength(canonicalJson({ ...withoutLanguage, score })) + 1 <= EVALUATION_REPORT_BYTES);
  assert.ok(Buffer.byteLength(JSON.stringify({ ...result, score })) + 1 > EVALUATION_REPORT_BYTES);
  assert.equal(reflective.findings.length, 512);
});
