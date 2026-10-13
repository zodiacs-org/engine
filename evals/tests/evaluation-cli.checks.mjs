import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";
import { computeChartFacts } from "../lib/chart-facts.mjs";
import { canonicalJson } from "../lib/generator-data.mjs";
import { scoreReading } from "../lib/score-reading.mjs";
import { readingFor, resolved, syntheticCase } from "./scoring-helpers.mjs";

const project = fileURLToPath(new URL("..", import.meta.url));
const repository = fileURLToPath(new URL("../..", import.meta.url));
const cli = join(project, "bin", "evaluate-reading.mjs");
const FILE_BYTES = 1_048_576;
const outputs = new Set();
let scratch;

// Regression guard for common network APIs, not a sandbox for trusted code.
const networkGuard = `data:text/javascript,${encodeURIComponent(`
  import http from "node:http";
  import https from "node:https";
  import net from "node:net";
  import tls from "node:tls";
  import { syncBuiltinESMExports } from "node:module";
  const deny = () => { throw new Error("Network access forbidden by evaluation CLI tests."); };
  globalThis.fetch = deny;
  http.get = http.request = https.get = https.request = deny;
  net.connect = net.createConnection = tls.connect = deny;
  net.Socket.prototype.connect = deny;
  syncBuiltinESMExports();
`)}`;

before(async () => {
  await mkdir(join(project, "scratch"), { recursive: true });
  scratch = await mkdtemp(join(project, "scratch", "evaluation-cli-"));
});

after(async () => {
  for (const path of outputs) await rm(path, { recursive: true, force: true });
  if (scratch) await rm(scratch, { recursive: true, force: true });
});

function input(settings = {}) {
  return { ...syntheticCase(settings), id: `evaluation-cli-${randomUUID()}` };
}

async function save(name, value) {
  const path = join(scratch, name);
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
  return path;
}

function runAt(cwd, ...args) {
  const result = spawnSync(process.execPath, ["--import", networkGuard, cli, ...args], {
    cwd, encoding: "utf8", timeout: 30000, maxBuffer: FILE_BYTES
  });
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  return result;
}

const run = (...args) => runAt(scratch, ...args);

async function success(result, mode) {
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  const summary = JSON.parse(result.stdout);
  assert.deepEqual(Object.keys(summary).sort(), [
    "diagnostics", "digest", "limits", "mode", "overall", "report", "reused"
  ]);
  assert.match(summary.report, /^evals\/reports\/[a-f0-9]{64}\.json$/);
  const path = join(repository, summary.report);
  outputs.add(path);
  assert.equal(typeof summary.reused, "boolean");
  assert.equal(summary.mode, mode);
  const bytes = await readFile(path);
  const digest = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
  assert.equal(summary.digest, digest);
  assert.equal(summary.report, `evals/reports/${digest.slice(7)}.json`);
  assert.ok(bytes.length <= FILE_BYTES);
  const report = JSON.parse(bytes.toString("utf8"));
  assert.equal(bytes.toString("utf8"), `${canonicalJson(report)}\n`);
  assert.deepEqual(Object.keys(report).sort(), ["schemaVersion", "score", "status", "workflow"]);
  assert.equal(report.schemaVersion, "1.0.0");
  assert.equal(report.status, "completed");
  assert.equal(report.workflow.id, "offline-reading-evaluation");
  assert.equal(report.workflow.version, "1.0.0");
  assert.match(report.workflow.digest, /^sha256:[a-f0-9]{64}$/);
  assert.equal(report.workflow.mode, mode);
  if (mode === "mock") assert.ok(report.workflow.mock && typeof report.workflow.mock === "object");
  else assert.equal(report.workflow.mock, null);
  assert.equal(report.score.status, "completed");
  assert.deepEqual(summary.overall, report.score.overall);
  assert.deepEqual(summary.diagnostics, report.score.diagnostics);
  assert.deepEqual(summary.limits, report.score.limits);
  return { summary, report, bytes, path };
}

function failure(result, status, prefix) {
  assert.equal(result.status, status, result.stderr);
  assert.equal(result.stdout, "");
  assert.ok(result.stderr.startsWith(prefix), result.stderr);
  assert.ok(!result.stderr.includes("private-input-marker"));
  assert.ok(!result.stderr.includes(scratch));
}

test("evaluation CLI defaults to offline mock and reuses canonical reports across working directories", async () => {
  const value = input();
  const casePath = await save("mock-case.json", value);
  const original = await readFile(casePath, "utf8");
  const first = await success(run("mock-case.json"), "mock");
  assert.equal(first.summary.reused, false);
  assert.deepEqual(first.report.score.case, value);
  const counts = first.report.score.overall.counts;
  assert.ok(counts.referenceFactors > 0);
  assert.equal(counts.correct, counts.referenceFactors);
  assert.equal(counts.coveredFactors, counts.referenceFactors);
  assert.equal(counts.incorrect, 0);
  assert.equal(first.report.score.limits.extractionCoverage, "unverified");

  const explicit = await success(runAt(repository, casePath, "--mock"), "mock");
  assert.deepEqual(explicit.summary, { ...first.summary, reused: true });
  assert.deepEqual(explicit.bytes, first.bytes);
  const reordered = Object.fromEntries(Object.entries(value).reverse());
  reordered.birth = Object.fromEntries(Object.entries(value.birth).reverse());
  const reorderedPath = await save("mock-reordered.json", reordered);
  const third = await success(runAt(project, reorderedPath), "mock");
  assert.deepEqual(third.summary, explicit.summary);
  assert.equal(await readFile(casePath, "utf8"), original);
});

test("evaluation CLI completes incorrect supplied readings and preserves the entire scoring report", async () => {
  const value = input();
  const reference = await computeChartFacts(value);
  const factor = reference.facts.find(({ kind }) => kind === "placement");
  const wrong = { ...factor, sign: factor.sign === "aries" ? "taurus" : "aries" };
  const reading = readingFor(value, [resolved(wrong)]);
  const casePath = await save("supplied-case.json", value);
  const readingPath = await save("supplied-reading.json", reading);
  const originalCase = await readFile(casePath, "utf8");
  const originalReading = await readFile(readingPath, "utf8");
  const result = await success(run("supplied-case.json", "--reading", "supplied-reading.json"), "supplied");
  assert.deepEqual(result.report.score, await scoreReading(value, reading));
  assert.deepEqual(result.report.score.reading, reading);
  assert.equal(result.summary.overall.counts.incorrect, 1);
  assert.equal(result.summary.overall.metrics.correctness.value, 0);
  const repeat = await success(runAt(project, casePath, "--reading", readingPath), "supplied");
  assert.deepEqual(repeat.summary, { ...result.summary, reused: true });
  assert.equal(await readFile(casePath, "utf8"), originalCase);
  assert.equal(await readFile(readingPath, "utf8"), originalReading);
});

test("evaluation CLI retains omitted claims with undefined correctness and zero coverage", async () => {
  const value = input({ timeKnown: false });
  const reading = readingFor(value);
  reading.text = "Original synthetic prose with no supplied factual extraction.";
  reading.extraction.method = "none";
  await save("empty-case.json", value);
  await save("empty-reading.json", reading);
  const { report, summary } = await success(run("empty-case.json", "--reading", "empty-reading.json"), "supplied");
  assert.deepEqual(report.score.reading, reading);
  assert.deepEqual(report.score.units, []);
  assert.equal(summary.overall.metrics.correctness.value, null);
  assert.equal(summary.overall.metrics.coverage.value, 0);
  assert.equal(summary.limits.extractionCoverage, "unverified");
  assert.equal(report.score.categories.house.counts.referenceFactors, 0);
});

test("evaluation CLI only accepts its documented positional and mode arguments", () => {
  for (const args of [
    [], [""], ["--unknown"], ["--help", "private-input-marker"], ["case.json", "--help"],
    ["case.json", "extra"], ["case.json", "--reading"], ["case.json", "--reading", ""],
    ["case.json", "--mock", "--mock"], ["case.json", "--reading", "a.json", "--reading", "b.json"],
    ["case.json", "--mock", "--reading", "a.json"], ["case.json", "--reading", "a.json", "--mock"],
    ["case.json", "--backend", "private-input-marker"], ["case.json", "--output", "private-input-marker"],
    ["case.json", "--reading", "--mock"], ["--mock", "case.json"],
    ["--reading", "reading.json", "case.json"], ["case.json", "--reading=reading.json"]
  ]) failure(run(...args), 2, "Usage:");
  const help = run("--help");
  assert.equal(help.status, 0);
  assert.match(help.stdout, /^Usage:/);
  assert.equal(help.stderr, "");
});

test("evaluation CLI rejects invalid cases, readings and case mismatches without exposing content", async () => {
  const value = input();
  await save("valid-case.json", value);
  await save("valid-reading.json", readingFor(value));
  for (const bad of [null, [], {}, { ...value, synthetic: false }, { ...value, private: "private-input-marker" }]) {
    await save("invalid-case.json", bad);
    failure(run("invalid-case.json"), 1, "Evaluation failed:");
    failure(run("invalid-case.json", "--reading", "valid-reading.json"), 1, "Evaluation failed:");
  }
  for (const bad of [
    null, [], {}, "private-input-marker", { ...readingFor(value), caseId: "private-input-marker" },
    { ...readingFor(value), text: "private-input-marker", synthetic: false }
  ]) {
    await save("invalid-reading.json", bad);
    failure(run("valid-case.json", "--reading", "invalid-reading.json"), 1, "Evaluation failed:");
  }
  const brokenSpan = readingFor(value, [resolved({ kind: "placement", body: "Sun", sign: "aries" })]);
  brokenSpan.claims[0].span.quote = "private-input-marker";
  await save("broken-span.json", brokenSpan);
  failure(run("valid-case.json", "--reading", "broken-span.json"), 1, "Evaluation failed:");
  for (const utc of ["2003-02-30T08:13:00Z", "9000-01-01T00:00:00Z"]) {
    await save("unevaluable-case.json", { ...value, birth: { ...value.birth, utc } });
    failure(run("unevaluable-case.json"), 1, "Evaluation failed:");
  }
});

test("evaluation CLI rejects unreadable, malformed, nonregular and symlinked inputs safely", async () => {
  const value = input();
  await save("read-case.json", value);
  await save("read-reading.json", readingFor(value));
  await writeFile(join(scratch, "broken.json"), '{"private-input-marker":');
  await writeFile(join(scratch, "invalid-utf8.json"), Buffer.from([0xff, 0xfe]));
  await writeFile(join(scratch, "too-large.json"), " ".repeat(FILE_BYTES + 1));
  await symlink(join(scratch, "read-case.json"), join(scratch, "linked.json"));
  await mkdir(join(scratch, "real-parent"));
  await save("real-parent/input.json", value);
  await symlink(join(scratch, "real-parent"), join(scratch, "linked-parent"));
  for (const path of [
    "missing-private-input-marker", ".", "broken.json", "invalid-utf8.json", "too-large.json",
    "linked.json", "linked-parent/input.json"
  ]) {
    failure(run(path), 2, "Cannot read evaluation inputs:");
    failure(run("read-case.json", "--reading", path), 2, "Cannot read evaluation inputs:");
  }
});

test("evaluation CLI enforces an inclusive UTF-8 byte limit on both inputs", async () => {
  const value = input();
  const reading = readingFor(value);
  const exactCase = JSON.stringify(value).padEnd(FILE_BYTES, " ");
  const exactReading = JSON.stringify(reading).padEnd(FILE_BYTES, " ");
  assert.equal(Buffer.byteLength(exactCase), FILE_BYTES);
  assert.equal(Buffer.byteLength(exactReading), FILE_BYTES);
  await writeFile(join(scratch, "exact-case.json"), exactCase);
  await writeFile(join(scratch, "exact-reading.json"), exactReading);
  await success(run("exact-case.json", "--reading", "exact-reading.json"), "supplied");
  reading.text = "月";
  const wide = JSON.stringify(reading).padEnd(FILE_BYTES, " ");
  assert.equal(wide.length, FILE_BYTES);
  assert.ok(Buffer.byteLength(wide) > FILE_BYTES);
  await writeFile(join(scratch, "wide-reading.json"), wide);
  failure(run("exact-case.json", "--reading", "wide-reading.json"), 2, "Cannot read evaluation inputs:");
});

test("evaluation CLI rejects a FIFO without blocking for a writer", { skip: process.platform === "win32" }, async () => {
  const value = input();
  await save("fifo-case.json", value);
  const path = join(scratch, "input.fifo");
  execFileSync("mkfifo", [path], { timeout: 1000 });
  failure(run(path), 2, "Cannot read evaluation inputs:");
  failure(run("fifo-case.json", "--reading", path), 2, "Cannot read evaluation inputs:");
});

test("evaluation CLI refuses a conflicting report without overwriting its bytes", async () => {
  await save("conflict-case.json", input());
  const { path } = await success(run("conflict-case.json"), "mock");
  await writeFile(path, "private-input-marker");
  failure(run("conflict-case.json"), 2, "Cannot write evaluation report:");
  assert.equal(await readFile(path, "utf8"), "private-input-marker");
});
