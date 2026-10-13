import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";
import { computeChartFacts } from "../lib/chart-facts.mjs";
import { EVALUATION_REPORT_BYTES, EvaluationError, evaluateReading } from "../lib/evaluate-reading.mjs";
import { EXTRACTION_LIMITS, extractReadingClaims } from "../lib/extract-reading-claims.mjs";
import { canonicalJson, sha256 } from "../lib/generator-data.mjs";
import { validateReading } from "../lib/validate-reading.mjs";
import { assertMetric, readingFor, resolveEvidencePointer, syntheticCase } from "./scoring-helpers.mjs";

// Original inline prose for invented charts, including deliberately false and
// unsupported assertions. References are local-engine consistency checks only.
const project = fileURLToPath(new URL("..", import.meta.url));
const repository = fileURLToPath(new URL("../..", import.meta.url));
const cli = join(project, "bin", "evaluate-reading.mjs");
const outputs = new Set();
let scratch;

// Regression guard for common network APIs, not a sandbox for trusted code.
const networkGuard = `data:text/javascript,${encodeURIComponent(`
  import http from "node:http";
  import https from "node:https";
  import net from "node:net";
  import tls from "node:tls";
  import { syncBuiltinESMExports } from "node:module";
  const deny = () => { throw new Error("Network access forbidden by adversarial tests."); };
  globalThis.fetch = deny;
  http.get = http.request = https.get = https.request = deny;
  net.connect = net.createConnection = tls.connect = deny;
  net.Socket.prototype.connect = deny;
  syncBuiltinESMExports();
`)}`;

// Observe the report writer's filesystem calls in this child only. A global
// reports/ inventory would race the other CLI tests running in parallel.
// Observation preserves the operation, so a refusal cannot pass merely because
// an injected write failure stopped a buggy publication path.
const reportWriteMarker = "ADVERSARIAL_REPORT_WRITE_OBSERVED\n";
const reportWriteObserver = `data:text/javascript,${encodeURIComponent(`
  import fs from "node:fs/promises";
  import { syncBuiltinESMExports } from "node:module";
  import { resolve, sep } from "node:path";
  import { fileURLToPath } from "node:url";
  const directory = ${JSON.stringify(join(project, "reports"))};
  for (const name of ["mkdir", "mkdtemp", "writeFile", "appendFile", "link", "rename", "copyFile"]) {
    const original = fs[name];
    fs[name] = function (...args) {
      const paths = ["link", "rename", "copyFile"].includes(name) ? args.slice(0, 2) : args.slice(0, 1);
      if (paths.some((value) => {
        if (value instanceof URL) value = fileURLToPath(value);
        if (typeof value !== "string") return false;
        const path = resolve(value);
        return path === directory || path.startsWith(directory + sep);
      })) process.stderr.write(${JSON.stringify(reportWriteMarker)});
      return Reflect.apply(original, this, args);
    };
  }
  syncBuiltinESMExports();
`)}`;

before(async () => {
  await mkdir(join(project, "scratch"), { recursive: true });
  scratch = await mkdtemp(join(project, "scratch", "adversarial-e2e-"));
});

after(async () => {
  for (const path of outputs) await rm(path, { force: true });
  if (scratch) await rm(scratch, { recursive: true, force: true });
});

function input(settings = {}) {
  return { ...syntheticCase(settings), id: `adversarial-${randomUUID()}` };
}

function proseReading(value, paragraphs, conventions = {}) {
  const reading = readingFor(value, [], conventions);
  reading.text = paragraphs.join("\n\n");
  reading.extraction.method = "none";
  return reading;
}

function sentence(factor, prefix = "At the supplied instant, ") {
  if (factor.kind === "placement") return `${prefix}${factor.body} is in ${factor.sign}.`;
  if (factor.kind === "aspect") return `${prefix}${factor.a} forms ${factor.aspect} with ${factor.b} under ${factor.policy}.`;
  if (factor.kind === "house") return `${prefix}${factor.body} occupies house ${factor.house} under ${factor.houseSystem}.`;
  return `${prefix}${factor.body} is in ${factor.sign} with ${factor.dignity} under ${factor.system}.`;
}

function run(casePath, readingPath, observeWrites = false) {
  const result = spawnSync(process.execPath,
    ["--import", networkGuard, ...(observeWrites ? ["--import", reportWriteObserver] : []),
      cli, casePath, "--reading", readingPath, "--extract"],
    { cwd: scratch, encoding: "utf8", timeout: 30000, maxBuffer: EVALUATION_REPORT_BYTES });
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  return result;
}

async function saveInputs(value, reading) {
  const casePath = join(scratch, `${value.id}.case.json`);
  const readingPath = join(scratch, `${value.id}.reading.json`);
  const caseBytes = `${canonicalJson(value)}\n`;
  const readingBytes = `${canonicalJson(reading)}\n`;
  await writeFile(casePath, caseBytes);
  await writeFile(readingPath, readingBytes);
  return { casePath, readingPath, caseBytes, readingBytes };
}

async function unchanged(files) {
  assert.equal(await readFile(files.casePath, "utf8"), files.caseBytes);
  assert.equal(await readFile(files.readingPath, "utf8"), files.readingBytes);
}

async function success(value, reading) {
  const files = await saveInputs(value, reading);
  const result = run(files.casePath, files.readingPath);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  const summary = JSON.parse(result.stdout);
  assert.match(summary.report, /^evals\/reports\/[a-f0-9]{64}\.json$/);
  const path = join(repository, summary.report);
  outputs.add(path);
  const bytes = await readFile(path, "utf8");
  const report = JSON.parse(bytes);
  assert.equal(bytes, `${canonicalJson(report)}\n`);
  assert.equal(summary.digest, sha256(bytes));
  assert.equal(summary.report, `evals/reports/${summary.digest.slice(7)}.json`);
  assert.equal(summary.mode, "supplied");
  assert.equal(report.workflow.mock, null);
  assert.equal(report.status, "completed");
  assert.equal(report.score.status, "completed");
  assert.deepEqual(summary.overall, report.score.overall);
  assert.deepEqual(summary.diagnostics, report.score.diagnostics);
  assert.deepEqual(summary.extraction, report.workflow.extraction);
  assert.equal(report.workflow.extraction.inputDigest, sha256(canonicalJson(reading)));
  assert.equal(report.workflow.extraction.readingDigest, report.score.identity.readingDigest);
  assert.equal(report.score.identity.caseDigest, sha256(canonicalJson(value)));
  assert.equal(report.score.identity.referenceDigest, sha256(canonicalJson(report.score.reference)));
  assert.equal(report.workflow.extraction.coverage, "unverified");
  assert.equal(summary.limits.interpretiveQuality, "not-scored");
  assert.equal(summary.limits.extractionCoverage, "unverified");
  assert.equal(report.score.reading.text, reading.text);
  assert.deepEqual(report.score.reading.conventions, reading.conventions);
  assert.deepEqual(report.score.reading.provenance, reading.provenance);
  assert.deepEqual(report.score.reading.license, reading.license);
  assert.equal(validateReading(report.score.reading).valid, true);
  for (const claim of report.score.reading.claims) {
    assert.equal(reading.text.slice(claim.span.start, claim.span.end), claim.span.quote);
  }
  for (const unit of report.score.units) {
    if (unit.verdict === "unassessed") assert.equal(unit.evidence, null);
    else {
      assert.ok(unit.evidence.rows.length > 0);
      for (const pointer of unit.evidence.rows) resolveEvidencePointer(report.score.reference, pointer);
      if (unit.evidence.membership === "present") {
        const factor = report.score.reference.facts[unit.evidence.referenceFactorIndex];
        assert.equal(factor.kind, unit.category);
      } else assert.equal(unit.evidence.referenceFactorIndex, null);
    }
  }
  await unchanged(files);
  return { report, summary, path, bytes, files };
}

async function refusal(value, reading) {
  const files = await saveInputs(value, reading);
  const result = run(files.casePath, files.readingPath, true);
  assert.equal(result.status, 1, result.stderr);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr,
    "Evaluation failed: case, reading, engine reference or report did not pass validation.\n");
  assert.ok(!result.stderr.includes(scratch));
  await unchanged(files);
}

test("offline CLI retains invented factors in saved reports without borrowing factual credit from a valid assertion", async () => {
  const value = input();
  const reference = await computeChartFacts(value);
  const correct = reference.facts.find(({ kind }) => kind === "placement");
  const invented = [
    "At the supplied instant, Vulcan is in aries.",
    "At the supplied instant, Sun is in ophiuchus.",
    "At the supplied instant, Sun forms quintile with Moon.",
    "At the supplied instant, Sun forms trine with Sun.",
    "At the supplied instant, Moon occupies house 13 under whole.",
    "At the supplied instant, Moon occupies house 3 under invented-system.",
    "At the supplied instant, Uranus is in aries with exaltation.",
    "At the supplied instant, Mercury is in virgo with super-dignity."
  ];
  const { report } = await success(value, proseReading(value, [sentence(correct), ...invented]));
  const { score } = report;
  assert.deepEqual(score.reference, reference);
  assert.equal(score.units.length, 1);
  assert.deepEqual(score.units[0].factor, correct);
  assertMetric(score.overall.metrics.correctness, 1, 1);
  assertMetric(score.overall.metrics.coverage, 1, reference.facts.length);
  assert.equal(score.diagnostics.unassigned, invented.length);
  assert.equal(score.reading.claims.length, invented.length + 1);
  assert.deepEqual(score.reading.claims.slice(1).map(({ span }) => span.quote), invented);
  for (const claim of score.reading.claims.slice(1)) {
    assert.ok(["unsupported", "ambiguous"].includes(claim.status));
    assert.equal(Object.hasOwn(claim, "factor"), false);
    const occurrence = score.occurrences.find(({ claimId }) => claimId === claim.id);
    assert.equal(occurrence.category, "unassigned");
    assert.equal(occurrence.unitId, null);
  }
});

test("offline CLI cannot turn missing birth time into house evidence or day-wide certainty", async () => {
  const value = input({ timeKnown: false, houseSystem: "placidus" });
  const reference = await computeChartFacts(value);
  const factors = ["placement", "aspect", "dignity"]
    .map((kind) => reference.facts.find((factor) => factor.kind === kind));
  const { report } = await success(value, proseReading(value, [
    ...factors.map((factor) => sentence(factor)), sentence(factors[0], "Throughout the day, "),
    "At the supplied instant, Moon occupies house 3 under placidus.",
    "At the supplied instant, Moon does not occupy house 3 under placidus."
  ], { houseSystem: "placidus" }));
  const { score } = report;
  assert.deepEqual(score.case.birth, value.birth);
  assert.ok(score.reference.flags.includes("no-time"));
  assert.deepEqual(score.reference.availability.houses.reasons, ["unknown-time"]);
  assert.equal(score.reference.availability.houses.actualSystem, null);
  assert.equal(score.reference.reference.houses, null);
  const houses = score.units.filter(({ category }) => category === "house");
  assert.equal(houses.length, 2);
  assert.ok(houses.every((unit) => unit.verdict === "unassessed" &&
    unit.eligibility.reasons.includes("unavailable-houses") && !unit.coverage.credited));
  assert.deepEqual(score.contradictions, []);
  assert.equal(score.units.find(({ temporalScope }) => temporalScope === "whole-day").verdict, "unassessed");
  assertMetric(score.categories.house.metrics.correctness, 0, 0);
  assertMetric(score.categories.house.metrics.coverage, 0, 0);
  assertMetric(score.overall.metrics.correctness, factors.length, factors.length);
  assertMetric(score.overall.metrics.resolvedAssessmentRate, factors.length, factors.length + 3);
  assertMetric(score.overall.metrics.coverage, factors.length, reference.facts.length);
});

test("offline CLI retains polar fallback and explicit convention conflicts even for engine-matching factors", async () => {
  const value = input({ latitude: 78, houseSystem: "placidus" });
  const reference = await computeChartFacts(value);
  const factors = ["placement", "aspect", "house", "dignity"]
    .map((kind) => reference.facts.find((factor) => factor.kind === kind));
  const conventions = { houseSystem: "placidus", aspectPolicy: "other", dignitySystem: "other" };
  const reading = proseReading(value, factors.map((factor) => sentence(factor)), conventions);
  const { report } = await success(value, reading);
  const { score } = report;
  assert.equal(score.reference.availability.houses.requestedSystem, "placidus");
  assert.equal(score.reference.availability.houses.actualSystem, "whole");
  assert.ok(score.reference.flags.includes("polar-fallback"));
  assertMetric(score.overall.metrics.correctness, 1, 1);
  assertMetric(score.overall.metrics.resolvedAssessmentRate, 1, factors.length);
  assertMetric(score.overall.metrics.coverage, 1, reference.facts.length);
  for (const unit of score.units.filter(({ category }) => category !== "placement")) {
    assert.equal(unit.verdict, "unassessed");
    assert.deepEqual(unit.eligibility.reasons, ["convention-mismatch", "factor-context-conflict"]);
    assert.ok(unit.eligibility.conventions.some(({ declared, factor }) => factor !== null && declared !== factor));
    assert.equal(unit.coverage.credited, false);
  }

  const sidereal = structuredClone(reading);
  sidereal.conventions = { ...reading.conventions, zodiac: "sidereal" };
  const excluded = (await success(value, sidereal)).report.score;
  assert.ok(excluded.units.every(({ verdict }) => verdict === "unassessed"));
  assertMetric(excluded.overall.metrics.correctness, 0, 0);
  assertMetric(excluded.overall.metrics.coverage, 0, reference.facts.length);
});

test("offline CLI saves contradiction edges and duplicate occurrences without allowing repetition to inflate scores", async () => {
  const value = input();
  const reference = await computeChartFacts(value);
  const factors = ["placement", "aspect", "house", "dignity"]
    .map((kind) => reference.facts.find((factor) => factor.kind === kind));
  const paragraphs = factors.flatMap((factor) => [sentence(factor), sentence(factor),
    sentence(factor, "At the supplied instant, It is not the case that ")]);
  const { report } = await success(value, proseReading(value, paragraphs));
  const { score } = report;
  assert.equal(score.diagnostics.duplicateResolved, factors.length);
  assert.equal(score.units.length, factors.length * 2);
  assert.equal(score.reading.claims.length, paragraphs.length);
  assertMetric(score.overall.metrics.correctness, factors.length, factors.length * 2);
  assertMetric(score.overall.metrics.contradictionRate, factors.length * 2, factors.length * 2);
  assertMetric(score.overall.metrics.coverage, 0, reference.facts.length);
  for (const kind of ["placement", "aspect", "house", "dignity"]) {
    const units = score.units.filter(({ category }) => category === kind);
    const positive = units.find(({ polarity }) => polarity === "affirmed");
    const negative = units.find(({ polarity }) => polarity === "negated");
    assert.equal(positive.claimIds.length, 2);
    assert.equal(negative.claimIds.length, 1);
    assert.equal(positive.verdict, "correct");
    assert.equal(negative.verdict, "incorrect");
    const edge = score.contradictions.find(({ unitIds }) =>
      unitIds.includes(positive.id) && unitIds.includes(negative.id));
    assert.ok(edge.rules.includes("same-factor-opposite-polarity"));
    assert.ok(positive.contradictionIds.includes(edge.id));
    assert.ok(negative.contradictionIds.includes(edge.id));
    assert.equal(positive.coverage.reason, "contradicted");
  }
});

test("offline CLI keeps every allowed repeated claim and rejects one beyond the extraction bound without partial scores", async () => {
  const value = input();
  const reference = await computeChartFacts(value);
  const factor = reference.facts.find(({ kind }) => kind === "placement");
  const paragraphs = Array(EXTRACTION_LIMITS.maxClaims).fill(sentence(factor));
  const accepted = await success(value, proseReading(value, paragraphs));
  const { score } = accepted.report;
  assert.equal(score.reading.claims.length, EXTRACTION_LIMITS.maxClaims);
  assert.equal(score.units.length, 1);
  assert.equal(score.units[0].claimIds.length, EXTRACTION_LIMITS.maxClaims);
  assert.equal(score.diagnostics.duplicateResolved, EXTRACTION_LIMITS.maxClaims - 1);
  assertMetric(score.overall.metrics.correctness, 1, 1);
  assertMetric(score.overall.metrics.coverage, 1, reference.facts.length);
  // Positive control: reusing a successful report still enters the publisher
  // and its lock/mkdir calls must be observable before testing refused runs.
  const observed = run(accepted.files.casePath, accepted.files.readingPath, true);
  assert.equal(observed.status, 0);
  assert.ok(observed.stderr.includes(reportWriteMarker));
  assert.equal(JSON.parse(observed.stdout).report, accepted.summary.report);
  await refusal(value, proseReading(value, [...paragraphs, sentence(factor)]));
  assert.equal(await readFile(accepted.path, "utf8"), accepted.bytes);

  const wide = "🌙".repeat(EXTRACTION_LIMITS.maxQuoteCodePoints);
  const unicode = await success(value, proseReading(value, [wide]));
  assert.equal(unicode.report.score.reading.claims[0].span.end, wide.length);
  assertMetric(unicode.report.score.overall.metrics.correctness, 0, 0);
  await refusal(value, proseReading(value, [`${wide}🌙`]));
  assert.equal(await readFile(unicode.path, "utf8"), unicode.bytes);
});

test("offline CLI refuses contradiction-driven report expansion after valid extraction instead of publishing truncated evidence", async () => {
  const value = input();
  const signs = ["aries", "taurus", "gemini", "cancer", "leo", "virgo", "libra", "scorpio",
    "sagittarius", "capricorn", "aquarius", "pisces"];
  const labels = ["domicile", "exaltation", "detriment", "fall"];
  const paragraphs = ["Mercury", "Venus", "Mars", "Jupiter"].flatMap((body) => signs.flatMap((sign) =>
    labels.map((dignity) => sentence({ kind: "dignity", body, sign, dignity, system: "classical-sign" }))));
  const reading = proseReading(value, paragraphs);
  assert.equal(validateReading(reading).valid, true);
  assert.ok(Buffer.byteLength(canonicalJson(reading)) < EVALUATION_REPORT_BYTES);
  const extracted = extractReadingClaims(reading);
  assert.equal(extracted.reading.claims.length, paragraphs.length);
  assert.ok(extracted.reading.claims.every(({ status }) => status === "resolved"));
  await assert.rejects(evaluateReading(value, { reading, extract: true }),
    (error) => error instanceof EvaluationError && error.code === "output-limit");
  const accepted = await success(value, proseReading(value, paragraphs.slice(0, 8)));
  await refusal(value, reading);
  assert.equal(await readFile(accepted.path, "utf8"), accepted.bytes);
});
