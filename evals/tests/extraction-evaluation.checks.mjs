import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";
import { computeChartFacts } from "../lib/chart-facts.mjs";
import { EvaluationError, evaluateReading } from "../lib/evaluate-reading.mjs";
import { extractReadingClaims } from "../lib/extract-reading-claims.mjs";
import { canonicalJson, sha256 } from "../lib/generator-data.mjs";
import { scoreReading } from "../lib/score-reading.mjs";
import { assertMetric, readingFor, syntheticCase } from "./scoring-helpers.mjs";

// Original inline assertions for invented inputs. Expected factors come from
// the local engine, so these are consistency checks, not accuracy evidence.
function proseReading(input, text, conventions = {}) {
  const reading = readingFor(input, [], conventions);
  reading.text = text;
  reading.extraction.method = "none";
  return reading;
}

function sentence(factor) {
  const prefix = "At the supplied instant, ";
  if (factor.kind === "placement") return `${prefix}${factor.body} is in ${factor.sign}.`;
  if (factor.kind === "aspect") return `${prefix}${factor.a} forms ${factor.aspect} with ${factor.b}.`;
  if (factor.kind === "house") return `${prefix}${factor.body} is in house ${factor.house} under ${factor.houseSystem}.`;
  return `${prefix}${factor.body} is in ${factor.sign} with ${factor.dignity}.`;
}

async function rejects(promise, code) {
  await assert.rejects(promise, (error) => {
    assert.ok(error instanceof EvaluationError);
    assert.equal(error.code, code);
    assert.equal(error.cause, undefined);
    assert.ok(!error.message.includes("private-input-marker"));
    return true;
  });
}

test("opt-in extraction scores every supported category against a fresh local reference and preserves reading metadata", async () => {
  const input = syntheticCase();
  const reference = await computeChartFacts(input);
  const factors = ["placement", "aspect", "house", "dignity"]
    .map((kind) => reference.facts.find((factor) => factor.kind === kind));
  const reading = proseReading(input, factors.map(sentence).join("\n\n"));
  const saved = structuredClone(reading);
  const standalone = extractReadingClaims(reading);
  const result = await evaluateReading(input, { reading, extract: true });
  assert.equal(result.workflow.mode, "supplied");
  assert.equal(result.workflow.mock, null);
  assert.deepEqual(result.workflow.extraction, standalone.extraction);
  assert.deepEqual(result.score, await scoreReading(input, standalone.reading));
  assert.deepEqual(result.score.reading, standalone.reading);
  assert.deepEqual(result.score.reading.claims.map(({ factor }) => factor), factors);
  assert.equal(result.score.reading.extraction.method, "parser");
  for (const key of Object.keys(reading).filter((key) => !["claims", "extraction"].includes(key))) {
    assert.deepEqual(result.score.reading[key], saved[key], `preserve ${key}`);
  }
  assert.deepEqual(reading, saved);
  assert.equal(Object.isFrozen(reading), false);
  assert.ok(Object.isFrozen(result.workflow.extraction));
  assert.ok(Object.isFrozen(result.workflow.extraction.limits));
  for (const kind of ["placement", "aspect", "house", "dignity"]) {
    assertMetric(result.score.categories[kind].metrics.correctness, 1, 1);
  }
  assertMetric(result.score.overall.metrics.coverage, factors.length, reference.facts.length);
  assert.equal(result.workflow.extraction.coverage, "unverified");
  assert.equal(result.score.limits.extractionCoverage, "unverified");
});

test("extraction retains incorrect assertions, unresolved prose and omitted facts without claiming complete coverage", async () => {
  const input = syntheticCase();
  const reference = await computeChartFacts(input);
  const placements = reference.facts.filter((factor) => factor.kind === "placement");
  const correct = placements[0];
  const wrong = { ...placements[1], sign: placements[1].sign === "aries" ? "taurus" : "aries" };
  const reading = proseReading(input, [sentence(correct), sentence(wrong),
    "An original symbolic reflection invites consideration."].join("\n\n"));
  const result = await evaluateReading(input, { reading, extract: true });
  assert.equal(result.score.overall.counts.correct, 1);
  assert.equal(result.score.overall.counts.incorrect, 1);
  assert.equal(result.score.units.length, 2);
  assert.ok(result.score.reading.claims.some((claim) => claim.status !== "resolved"));
  assertMetric(result.score.overall.metrics.correctness, 1, 2);
  assertMetric(result.score.overall.metrics.coverage, 1, reference.facts.length);
  assert.equal(result.workflow.extraction.diagnostics.resolved, 2);
  assert.ok(result.workflow.extraction.diagnostics.unsupported + result.workflow.extraction.diagnostics.ambiguous > 0);
  assert.equal(result.workflow.extraction.coverage, "unverified");
});

test("extraction is explicitly selected and does not annotate an otherwise identical supplied reading", async () => {
  const input = syntheticCase();
  const reading = proseReading(input, "At the supplied instant, Sun is in aries.");
  const unchanged = await evaluateReading(input, { reading });
  assert.deepEqual(await evaluateReading(input, { reading, extract: false }), unchanged);
  assert.deepEqual(unchanged.score.reading, reading);
  assert.equal(unchanged.workflow.extraction, null);
  assert.equal(unchanged.score.units.length, 0);
  assertMetric(unchanged.score.overall.metrics.correctness, 0, 0);
  assert.equal((await evaluateReading(input, { extract: false })).workflow.extraction, null);

  for (const options of [{ extract: true }, { reading, extract: "true" }, { reading, extract: undefined },
    { reading, extract: null }, { reading, extract: 1 }]) {
    await rejects(evaluateReading(input, options), "invalid-options");
  }
  let reads = 0;
  await rejects(evaluateReading(input, { reading, get extract() { reads++; return true; } }), "invalid-options");
  assert.equal(reads, 0);
  await rejects(evaluateReading(input, { reading: readingFor(input), extract: true }), "extraction-failed");
  await rejects(evaluateReading(input, { reading: { ...reading, caseId: "private-input-marker" }, extract: true }),
    "case-mismatch");
  await rejects(evaluateReading(input, {
    reading: proseReading(input, Array(257).fill("Sun is in aries.").join("\n\n")), extract: true
  }), "extraction-failed");
});

test("extracted duplicate and negated claims use the same scoring and contradiction rules as supplied claims", async () => {
  const input = syntheticCase();
  const reference = await computeChartFacts(input);
  const factor = reference.facts.find(({ kind }) => kind === "placement");
  const quote = sentence(factor);
  const reading = proseReading(input, `${quote}\n\n${quote}\n\nAt the supplied instant, ${factor.body} is not in ${factor.sign}.`);
  const result = await evaluateReading(input, { reading, extract: true });
  assert.equal(result.score.reading.claims.length, 3);
  assert.equal(result.score.diagnostics.duplicateResolved, 1);
  assert.equal(result.score.overall.counts.correct, 1);
  assert.equal(result.score.overall.counts.incorrect, 1);
  assert.equal(result.score.overall.counts.contradicted, 2);
  assert.equal(result.score.overall.counts.coveredFactors, 0);
});

test("extraction does not repair different conventions, unspecified temporal scope or unavailable houses", async () => {
  const input = syntheticCase();
  const sidereal = await evaluateReading(input, {
    reading: proseReading(input, "At the supplied instant, Sun is in aries.", { zodiac: "sidereal" }), extract: true
  });
  assert.equal(sidereal.score.units[0].verdict, "unassessed");
  assert.ok(sidereal.score.units[0].eligibility.reasons.includes("convention-mismatch"));
  assert.equal(sidereal.score.reading.conventions.zodiac, "sidereal");
  const unspecified = await evaluateReading(input, { reading: proseReading(input, "Sun is in aries."), extract: true });
  assert.equal(unspecified.score.reading.claims[0].temporalScope, "unspecified");
  assert.equal(unspecified.score.units[0].verdict, "unassessed");
  const unknown = syntheticCase({ timeKnown: false });
  const unavailable = await evaluateReading(unknown, {
    reading: proseReading(unknown, "At the supplied instant, Moon is in house 3 under whole."), extract: true
  });
  assert.equal(unavailable.score.reference.availability.houses.status, "unavailable");
  assert.equal(unavailable.score.units[0].verdict, "unassessed");
  assert.equal(unavailable.score.categories.house.counts.referenceFactors, 0);
});

test("quoted, hypothetical and refuted engine-matching text receives no factual credit", async () => {
  const input = syntheticCase();
  const reference = await computeChartFacts(input);
  const quote = sentence(reference.facts.find(({ kind }) => kind === "placement"));
  for (const text of [
    `'Quoted material.\n\n${quote}\n\n'`,
    `<blockquote>\n\n${quote}\n\n</blockquote>`,
    `The following assertion is false:\n\n${quote}`,
    `If this were another chart:\n\n${quote}`,
    `${quote}\n\nThe previous statement is false.`
  ]) {
    const result = await evaluateReading(input, { reading: proseReading(input, text), extract: true });
    assert.equal(result.score.units.length, 0);
    assertMetric(result.score.overall.metrics.correctness, 0, 0);
    assertMetric(result.score.overall.metrics.coverage, 0, reference.facts.length);
    assert.equal(result.workflow.extraction.diagnostics.resolved, 0);
  }
});

const project = fileURLToPath(new URL("..", import.meta.url));
const repository = fileURLToPath(new URL("../..", import.meta.url));
const cli = join(project, "bin", "evaluate-reading.mjs");
const outputs = new Set();
let scratch;

before(async () => {
  await mkdir(join(project, "scratch"), { recursive: true });
  scratch = await mkdtemp(join(project, "scratch", "extraction-evaluation-"));
});
after(async () => {
  for (const path of outputs) await rm(path, { force: true });
  if (scratch) await rm(scratch, { recursive: true, force: true });
});

function run(...args) {
  const guard = "data:text/javascript,globalThis.fetch=()=>{throw new Error('Network forbidden')};";
  const result = spawnSync(process.execPath, ["--import", guard, cli, ...args], {
    cwd: scratch, encoding: "utf8", timeout: 30000, maxBuffer: 1_048_576
  });
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  return result;
}
async function save(name, value) {
  const path = join(scratch, name);
  await writeFile(path, `${canonicalJson(value)}\n`);
  return path;
}
function failure(result, status, prefix) {
  assert.equal(result.status, status);
  assert.equal(result.stdout, "");
  assert.ok(result.stderr.startsWith(prefix), result.stderr);
  assert.ok(!result.stderr.includes("private-input-marker"));
  assert.ok(!result.stderr.includes(scratch));
}

test("evaluation CLI extracts only on request and saves the full parser report with visible summary limits", async () => {
  const input = { ...syntheticCase(), id: `extract-cli-${randomUUID()}` };
  const reading = proseReading(input, "At the supplied instant, Sun is in aries.");
  const casePath = await save("case.json", input);
  const readingPath = await save("reading.json", reading);
  const beforeCase = await readFile(casePath, "utf8");
  const beforeReading = await readFile(readingPath, "utf8");
  for (const extract of [false, true]) {
    const args = [casePath, "--reading", readingPath, ...(extract ? ["--extract"] : [])];
    const result = run(...args);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, "");
    const summary = JSON.parse(result.stdout);
    const reportPath = join(repository, summary.report);
    outputs.add(reportPath);
    const bytes = await readFile(reportPath, "utf8");
    const report = JSON.parse(bytes);
    assert.equal(bytes, `${canonicalJson(report)}\n`);
    assert.equal(summary.digest, sha256(bytes));
    assert.equal(summary.mode, "supplied");
    assert.deepEqual(summary.extraction, report.workflow.extraction);
    assert.equal(summary.limits.extractionCoverage, "unverified");
    if (extract) {
      assert.equal(summary.extraction.coverage, "unverified");
      assert.ok(summary.extraction.limits && summary.extraction.reasons);
      assert.equal(summary.extraction.diagnostics.resolved, 1);
      assert.deepEqual(report, await evaluateReading(input, { reading, extract: true }));
      assert.equal(report.score.reading.extraction.method, "parser");
    } else {
      assert.equal(summary.extraction, null);
      assert.deepEqual(report.score.reading, reading);
    }
  }
  assert.equal(await readFile(casePath, "utf8"), beforeCase);
  assert.equal(await readFile(readingPath, "utf8"), beforeReading);
});

test("evaluation CLI strictly requires a supplied unannotated reading for extraction", async () => {
  for (const args of [
    ["case.json", "--extract"], ["case.json", "--mock", "--extract"],
    ["case.json", "--extract", "--reading", "reading.json"],
    ["case.json", "--reading", "reading.json", "--extract", "--extract"],
    ["case.json", "--reading", "reading.json", "--extract", "--mock"],
    ["case.json", "--reading", "reading.json", "--extract=true"]
  ]) failure(run(...args), 2, "Usage:");
  const input = { ...syntheticCase(), id: `extract-refusal-${randomUUID()}` };
  const casePath = await save("refusal-case.json", input);
  const reading = readingFor(input);
  reading.text = "private-input-marker";
  const readingPath = await save("annotated-reading.json", reading);
  failure(run(casePath, "--reading", readingPath, "--extract"), 1, "Evaluation failed:");
  failure(run(casePath, "--reading", "missing-private-input-marker", "--extract"), 2, "Cannot read evaluation inputs:");
});
