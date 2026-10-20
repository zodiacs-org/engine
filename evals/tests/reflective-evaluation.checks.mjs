import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";
import { checkReflectiveLanguage, REFLECTIVE_LIMITS } from "../lib/check-reflective-language.mjs";
import { EvaluationError, evaluateReading } from "../lib/evaluate-reading.mjs";
import { extractReadingClaims } from "../lib/extract-reading-claims.mjs";
import { canonicalJson, sha256 } from "../lib/generator-data.mjs";
import { scoreReading } from "../lib/score-reading.mjs";
import { validateReading } from "../lib/validate-reading.mjs";
import { readingFor, resolved, syntheticCase, unresolved } from "./scoring-helpers.mjs";

// Original MIT test prose for invented chart inputs. Prohibited wording below
// is explicitly rejected input, never suggested reading or interpretation text.
const reflection = "Consider which habits support careful reflection.";
const project = fileURLToPath(new URL("..", import.meta.url));
const repository = fileURLToPath(new URL("../..", import.meta.url));
const cli = join(project, "bin", "evaluate-reading.mjs");
const reportDirectory = join(project, "reports");
const outputs = new Set();
let scratch;

function proseReading(input, text, method = "manual") {
  const reading = readingFor(input);
  reading.text = text;
  reading.extraction.method = method;
  return reading;
}

function assertFrozen(value) {
  if (!value || typeof value !== "object") return;
  assert.ok(Object.isFrozen(value));
  for (const child of Object.values(value)) assertFrozen(child);
}

async function reflectiveRefusal(promise) {
  await assert.rejects(promise, (error) => {
    assert.ok(error instanceof EvaluationError);
    assert.equal(error.code, "reflective-failed");
    assert.deepEqual(Object.keys(error).sort(), ["code", "name"]);
    assert.equal(error.cause, undefined);
    assert.equal(error.score, undefined);
    assert.equal(error.reflective, undefined);
    assert.equal(error.findings, undefined);
    assert.ok(!error.message.includes("private-input-marker"));
    return true;
  });
}

test("evaluations keep reflective points separate from factual scores, including empty readings", async () => {
  const input = syntheticCase();
  for (const text of [reflection, "", " \t\r\n\u00a0 "]) {
    const reading = proseReading(input, text);
    const saved = structuredClone(reading);
    const result = await evaluateReading(input, { reading });
    assert.equal(result.schemaVersion, "1.0.0");
    assert.equal(result.workflow.version, "1.1.0");
    assert.deepEqual(result.reflective, checkReflectiveLanguage(text));
    assert.deepEqual(result.score, await scoreReading(input, saved));
    assert.deepEqual(result.score.reading, saved);
    assert.deepEqual(reading, saved);
    assert.equal(result.score.overall.metrics.correctness.value, null);
    assert.equal(result.score.overall.metrics.coverage.value, 0);
    assert.equal(result.score.limits.interpretiveQuality, "not-scored");
    assert.equal(result.reflective.status, text.trim() ? "no-detected-violations" : "unassessed");
    assert.equal(result.reflective.score.points, text.trim() ? 100 : null);
  }
});

test("rejected input outside factual claims and in unresolved claims receives the same language assessment", async () => {
  const input = syntheticCase();
  const mock = await evaluateReading(input);
  const factor = mock.score.reference.facts.find(({ kind }) => kind === "placement");
  // Rejected input only: a prohibited assertion has no factual scoring credit.
  const rejected = "You will meet a visitor-private-input-marker.";
  const withFactualClaim = readingFor(input, [resolved(factor)]);
  withFactualClaim.text += rejected;
  for (const reading of [withFactualClaim,
    proseReading(input, rejected),
    readingFor(input, [unresolved("interpretive", rejected)]),
    readingFor(input, [unresolved("unsupported", rejected)]),
    { ...withFactualClaim, conventions: { ...withFactualClaim.conventions, zodiac: "sidereal" } }
  ]) {
    const result = await evaluateReading(input, { reading });
    assert.deepEqual(result.reflective, checkReflectiveLanguage(reading.text));
    assert.equal(result.reflective.status, "flagged");
    assert.equal(result.reflective.score.points, 75);
    assert.deepEqual(result.score, await scoreReading(input, reading));
    assert.deepEqual(result.score.reading, reading);
    if (reading.conventions.zodiac === "sidereal") {
      assert.equal(result.score.units[0].verdict, "unassessed");
      assert.ok(result.score.units[0].eligibility.reasons.includes("convention-mismatch"));
    }
  }
  assert.equal(withFactualClaim.claims.length, 1);
  assert.ok(!withFactualClaim.claims[0].span.quote.includes("private-input-marker"));
});

test("extraction scope guards withhold factual claims without hiding rejected wording", async () => {
  const input = syntheticCase();
  // Rejected input only: quoted prohibited wording still belongs to the full
  // language check even when quotation guards prevent factual assessment.
  const text = '<blockquote>\r\n\r\nAt the supplied instant, Sun is in aries.\r\n\r\nYou will meet a visitor.\r\n\r\n</blockquote>';
  const reading = proseReading(input, text, "none");
  const saved = structuredClone(reading);
  const extracted = extractReadingClaims(reading);
  const result = await evaluateReading(input, { reading, extract: true });
  assert.deepEqual(result.workflow.extraction, extracted.extraction);
  assert.deepEqual(result.score, await scoreReading(input, extracted.reading));
  assert.deepEqual(result.score.units, []);
  assert.equal(result.workflow.extraction.diagnostics.resolved, 0);
  assert.equal(result.score.limits.extractionCoverage, "unverified");
  assert.deepEqual(result.reflective, checkReflectiveLanguage(text));
  assert.equal(result.reflective.status, "flagged");
  assert.equal(result.reflective.input.textDigest, sha256(result.score.reading.text));
  assert.equal(result.score.reading.text, text);
  assert.deepEqual(reading, saved);
});

test("reflective evidence uses captured unchanged Unicode text and immutable owned identities", async () => {
  const input = syntheticCase();
  // Rejected input only: soft-wrapped prohibited wording follows Unicode text.
  const rejected = "You\r\nwill meet a visitor.";
  const prefix = "\u{1f319} e\u0301 original reflection.\r\n\r\n";
  const reading = proseReading(input, `${prefix}${rejected}\r\n`);
  const saved = structuredClone({ input, reading });
  const options = { reading };
  const pending = evaluateReading(input, options);
  reading.text = reflection;
  input.birth.timeKnown = false;
  options.reading = null;
  const result = await pending;
  assert.deepEqual(result.score.case, saved.input);
  assert.deepEqual(result.score.reading, saved.reading);
  assert.deepEqual(result.reflective, checkReflectiveLanguage(saved.reading.text));
  assert.equal(result.reflective.input.textDigest, sha256(saved.reading.text));
  assert.notEqual(result.reflective.input.textDigest, sha256(saved.reading.text.normalize("NFC")));
  assert.notEqual(result.reflective.input.textDigest, sha256(saved.reading.text.replaceAll("\r\n", "\n")));
  assert.equal(result.reflective.rubric.id, "chart-reading-reflective");
  assert.equal(result.reflective.rubric.version, "1.0.0");
  assert.match(result.reflective.rubric.digest, /^sha256:[a-f0-9]{64}$/);
  assert.match(result.reflective.implementation.digest, /^sha256:[a-f0-9]{64}$/);
  assert.equal(result.reflective.offsetUnit, "utf16-code-unit");
  assert.equal(result.reflective.findings.length, 1);
  const { span } = result.reflective.findings[0];
  assert.ok(span.start >= prefix.length);
  assert.equal(saved.reading.text.slice(span.start, span.end), span.quote);
  assert.equal(span.quote, "You\r\nwill");
  assertFrozen(result);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
  assert.equal(Object.isFrozen(reading), false);
  assert.equal(Object.isFrozen(input), false);
  assert.equal(Object.isFrozen(options), false);
});

test("offline mock assessments preserve complete factual scoring without claiming reflective quality", async () => {
  const input = syntheticCase();
  const result = await evaluateReading(input);
  assert.equal(result.workflow.mode, "mock");
  assert.deepEqual(result.reflective, checkReflectiveLanguage(result.score.reading.text));
  assert.equal(result.reflective.status, "no-detected-violations");
  assert.equal(result.reflective.score.points, 100);
  assert.deepEqual(result.reflective.findings, []);
  assert.deepEqual(result.score, await scoreReading(input, result.score.reading));
  assert.equal(result.score.overall.counts.correct, result.score.reference.facts.length);
  assert.equal(result.score.overall.counts.coveredFactors, result.score.reference.facts.length);
  assert.equal(result.score.limits.interpretiveQuality, "not-scored");
  assert.ok(result.reflective.limitations);
});

test("rejected-input language overflow refuses the evaluation without partial assessments", async () => {
  const input = syntheticCase();
  // Rejected input only: one financial trigger per token exceeds the checker
  // bound while the reading remains within its structural text and claim limits.
  const text = Array(REFLECTIVE_LIMITS.matches + 1).fill("money").join(" ") + " private-input-marker";
  const reading = proseReading(input, text);
  const saved = structuredClone(reading);
  assert.equal(validateReading(reading).valid, true);
  await reflectiveRefusal(evaluateReading(input, { reading }));
  assert.deepEqual(reading, saved);
});

// A guard for common network APIs in end-to-end subprocesses, not a sandbox.
const networkGuard = `data:text/javascript,${encodeURIComponent(`
  import http from "node:http";
  import https from "node:https";
  import net from "node:net";
  import tls from "node:tls";
  import { syncBuiltinESMExports } from "node:module";
  const deny = () => { throw new Error("Network forbidden by reflective evaluation tests."); };
  globalThis.fetch = deny;
  http.get = http.request = https.get = https.request = deny;
  net.connect = net.createConnection = tls.connect = deny;
  net.Socket.prototype.connect = deny;
  syncBuiltinESMExports();
`)}`;

before(async () => {
  await mkdir(join(project, "scratch"), { recursive: true });
  scratch = await mkdtemp(join(project, "scratch", "reflective-evaluation-"));
});

after(async () => {
  for (const path of outputs) await rm(path, { force: true });
  if (scratch) await rm(scratch, { recursive: true, force: true });
});

function runAt(cwd, ...args) {
  const result = spawnSync(process.execPath, ["--import", networkGuard, cli, ...args], {
    cwd, encoding: "utf8", timeout: 30000, maxBuffer: 1_048_576
  });
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  return result;
}

const run = (...args) => runAt(scratch, ...args);

async function save(name, value) {
  const path = join(scratch, name);
  await writeFile(path, `${canonicalJson(value)}\n`);
  return path;
}

async function reportNames() {
  try {
    return (await readdir(reportDirectory)).sort();
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function success(result, mode) {
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  const summary = JSON.parse(result.stdout);
  assert.match(summary.report, /^evals\/reports\/[a-f0-9]{64}\.json$/);
  const reportPath = join(repository, summary.report);
  outputs.add(reportPath);
  const bytes = await readFile(reportPath, "utf8");
  const report = JSON.parse(bytes);
  assert.equal(bytes, `${canonicalJson(report)}\n`);
  assert.equal(summary.digest, sha256(bytes));
  assert.equal(summary.report, `evals/reports/${summary.digest.slice(7)}.json`);
  assert.equal(summary.mode, mode);
  assert.equal(report.workflow.mode, mode);
  assert.equal(report.workflow.version, "1.1.0");
  assert.deepEqual(report.reflective, checkReflectiveLanguage(report.score.reading.text));
  const { findings, ...expectedSummary } = report.reflective;
  assert.deepEqual(summary.reflective, expectedSummary);
  assert.equal(Object.hasOwn(summary.reflective, "findings"), false);
  assert.deepEqual(summary.overall, report.score.overall);
  assert.deepEqual(summary.diagnostics, report.score.diagnostics);
  assert.deepEqual(summary.limits, report.score.limits);
  assert.deepEqual(summary.extraction, report.workflow.extraction);
  assert.ok(Buffer.byteLength(bytes) <= 1_048_576);
  assert.ok(Array.isArray(findings));
  return { summary, report, bytes };
}

test("CLI saves rejected-input findings for supplied readings but prints no evidence text and reuses exact reports", async () => {
  const input = { ...syntheticCase(), id: `reflective-supplied-${randomUUID()}` };
  // Rejected input only: no supplied factual claims can conceal this wording.
  const reading = proseReading(input, `${reflection}\r\nYou will meet a visitor-private-input-marker.`);
  const casePath = await save("supplied-case.json", input);
  const readingPath = await save("supplied-reading.json", reading);
  const beforeCase = await readFile(casePath, "utf8");
  const beforeReading = await readFile(readingPath, "utf8");
  const first = await success(run(casePath, "--reading", readingPath), "supplied");
  assert.equal(first.summary.reused, false);
  assert.equal(first.summary.reflective.status, "flagged");
  assert.equal(first.summary.reflective.score.points, 75);
  assert.ok(first.report.reflective.findings.length > 0);
  assert.deepEqual(first.report.score, await scoreReading(input, reading));
  assert.equal(first.summary.overall.metrics.correctness.value, null);
  assert.ok(!JSON.stringify(first.summary).includes("private-input-marker"));
  assert.ok(!JSON.stringify(first.summary).includes("You will"));
  const repeat = await success(runAt(repository, casePath, "--reading", readingPath), "supplied");
  assert.deepEqual(repeat.summary, { ...first.summary, reused: true });
  assert.equal(repeat.bytes, first.bytes);
  assert.equal(await readFile(casePath, "utf8"), beforeCase);
  assert.equal(await readFile(readingPath, "utf8"), beforeReading);
});

test("CLI retains separate assessments for extracted guarded prose and the offline mock", async () => {
  const input = { ...syntheticCase(), id: `reflective-extracted-${randomUUID()}` };
  // Rejected input only: the parser's quotation guard does not suppress the
  // independent full-text reflective assessment.
  const reading = proseReading(input,
    '<blockquote>\n\nAt the supplied instant, Sun is in aries.\n\nYou will meet a visitor.\n\n</blockquote>', "none");
  const casePath = await save("extracted-case.json", input);
  const readingPath = await save("extracted-reading.json", reading);
  const extracted = await success(run(casePath, "--reading", readingPath, "--extract"), "supplied");
  assert.equal(extracted.summary.reflective.status, "flagged");
  assert.deepEqual(extracted.report.score.units, []);
  assert.equal(extracted.summary.extraction.diagnostics.resolved, 0);
  assert.equal(extracted.summary.extraction.coverage, "unverified");
  assert.deepEqual(extracted.report, await evaluateReading(input, { reading, extract: true }));
  assert.ok(!JSON.stringify(extracted.summary).includes("You will"));
  const mock = await success(run(casePath, "--mock"), "mock");
  assert.equal(mock.summary.reflective.status, "no-detected-violations");
  assert.equal(mock.summary.reflective.score.points, 100);
  assert.deepEqual(mock.report.reflective.findings, []);
  assert.equal(mock.summary.overall.counts.correct, mock.summary.overall.counts.referenceFactors);
  assert.deepEqual(mock.report, await evaluateReading(input));
  const repeated = await success(runAt(project, casePath), "mock");
  assert.deepEqual(repeated.summary, { ...mock.summary, reused: true });
  assert.equal(repeated.bytes, mock.bytes);
});

test("CLI refuses a structurally valid rejected-input match overflow with no report or partial output", async () => {
  const input = { ...syntheticCase(), id: `reflective-overflow-${randomUUID()}` };
  // Rejected input only: the financial token crosses the raw match bound.
  const reading = proseReading(input,
    Array(REFLECTIVE_LIMITS.matches + 1).fill("money").join(" ") + " private-input-marker");
  assert.equal(validateReading(reading).valid, true);
  const casePath = await save("overflow-case.json", input);
  const readingPath = await save("overflow-reading.json", reading);
  const beforeNames = await reportNames();
  const result = run(casePath, "--reading", readingPath);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.ok(result.stderr.startsWith("Evaluation failed:"));
  assert.ok(!result.stderr.includes("private-input-marker"));
  assert.ok(!result.stderr.includes("money"));
  assert.ok(!result.stderr.includes(scratch));
  assert.deepEqual(await reportNames(), beforeNames);
});
