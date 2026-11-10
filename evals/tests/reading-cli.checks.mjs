import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";

const project = fileURLToPath(new URL("..", import.meta.url));
const cli = fileURLToPath(new URL("../bin/validate-reading.mjs", import.meta.url));
const MAX_READING_BYTES = 1_048_576;
let scratch;

before(async () => {
  await mkdir(join(project, "scratch"), { recursive: true });
  scratch = await mkdtemp(join(project, "scratch", "reading-cli-"));
});
after(async () => { if (scratch) await rm(scratch, { recursive: true, force: true }); });

// Original inline synthetic assertion, deliberately not an engine truth fixture.
function reading() {
  const text = "The Sun is not in Aries.";
  return {
    schemaVersion: "1.0.0", id: "inline-reading", caseId: "synthetic-inline-case",
    synthetic: true, language: "en", text, offsetUnit: "utf16-code-unit",
    conventions: {
      zodiac: "tropical", houseSystem: "unspecified", aspectPolicy: "unspecified",
      dignitySystem: "unspecified"
    },
    provenance: {
      kind: "authored", authors: ["Evals test contributors"],
      note: "Original AI-assisted inline test assertion for an invented case."
    },
    extraction: { method: "manual", producer: "inline-test", version: "v1", coverage: "unverified" },
    claims: [{
      schemaVersion: "1.0.0", id: "sun-claim", status: "resolved",
      span: { start: 0, end: text.length, quote: text },
      factor: { kind: "placement", body: "Sun", sign: "aries" },
      polarity: "negated", certainty: "unqualified", temporalScope: "reference-instant"
    }],
    license: { spdxId: "MIT", attribution: "Evals test contributors" }
  };
}

function run(...args) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: scratch, encoding: "utf8", timeout: 10000
  });
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  return result;
}

test("reading CLI validates from another directory without rewriting the reading", async () => {
  const original = `${JSON.stringify(reading(), null, 2)}\n`;
  const path = join(scratch, "reading.json");
  await writeFile(path, original);
  const result = run("reading.json");
  assert.equal(result.status, 0);
  assert.equal(result.stderr, "");
  assert.deepEqual(JSON.parse(result.stdout), { valid: true, errors: [] });
  assert.equal(await readFile(path, "utf8"), original);
});

test("reading CLI reports structural and quote errors without echoing supplied text", async () => {
  for (const [filename, change, expectedPath] of [
    ["schema.json", (value) => { value.license.spdxId = "private-test-marker"; }, "/license/spdxId"],
    ["span.json", (value) => { value.claims[0].span.quote = "private-test-marker"; }, "/claims/0/span/quote"],
    ["id.json", (value) => { value.claims.push(structuredClone(value.claims[0])); }, "/claims/1/id"]
  ]) {
    const value = reading();
    change(value);
    const original = JSON.stringify(value);
    const path = join(scratch, filename);
    await writeFile(path, original);
    const result = run(filename);
    assert.equal(result.status, 1);
    assert.equal(result.stderr, "");
    const report = JSON.parse(result.stdout);
    assert.deepEqual(Object.keys(report).sort(), ["errors", "valid"]);
    assert.equal(report.valid, false);
    assert.ok(report.errors.some(({ path }) => path === expectedPath));
    for (const error of report.errors) {
      assert.deepEqual(Object.keys(error).sort(), ["keyword", "message", "path"]);
    }
    assert.ok(!result.stdout.includes("private-test-marker"));
    assert.equal(await readFile(path, "utf8"), original);
  }
});

test("reading CLI accepts unresolved assertions without claiming a factual verdict", async () => {
  const value = reading();
  value.claims = [{
    schemaVersion: "1.0.0", id: "unresolved-claim", status: "ambiguous",
    span: { start: 0, end: value.text.length, quote: value.text },
    reason: "The test intentionally leaves this assertion unresolved."
  }];
  await writeFile(join(scratch, "unresolved.json"), JSON.stringify(value));
  const result = run("unresolved.json");
  assert.equal(result.status, 0);
  assert.deepEqual(JSON.parse(result.stdout), { valid: true, errors: [] });
});

test("reading CLI gives help and rejects unsupported argument forms", () => {
  for (const args of [[], ["--unknown"], ["--help", "reading.json"], ["a.json", "b.json"]]) {
    const result = run(...args);
    assert.equal(result.status, 2);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /^Usage:/);
  }
  const result = run("--help");
  assert.equal(result.status, 0);
  assert.match(result.stdout, /^Usage:/);
  assert.equal(result.stderr, "");
});

test("reading CLI rejects missing, non-file, malformed and invalid UTF-8 inputs", async () => {
  await writeFile(join(scratch, "broken.json"), '{"private-test-marker":');
  await writeFile(join(scratch, "utf8.json"), Buffer.from([0xff, 0xfe]));
  for (const path of ["missing-private-test-marker.json", ".", "broken.json", "utf8.json"]) {
    const result = run(path);
    assert.equal(result.status, 2);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /^Cannot read reading:/);
    assert.ok(!result.stderr.includes("private-test-marker"));
  }
});

test("reading CLI enforces an inclusive 1 MiB UTF-8 byte limit", async () => {
  const exact = JSON.stringify(reading()).padEnd(MAX_READING_BYTES, " ");
  assert.equal(Buffer.byteLength(exact), MAX_READING_BYTES);
  await writeFile(join(scratch, "exact.json"), exact);
  assert.equal(run("exact.json").status, 0);
  await writeFile(join(scratch, "over.json"), `${exact} `);

  const wide = reading();
  wide.text += "月";
  const overBytes = JSON.stringify(wide).padEnd(MAX_READING_BYTES, " ");
  assert.equal(overBytes.length, MAX_READING_BYTES);
  assert.ok(Buffer.byteLength(overBytes) > MAX_READING_BYTES);
  await writeFile(join(scratch, "wide.json"), overBytes);
  for (const file of ["over.json", "wide.json"]) {
    const result = run(file);
    assert.equal(result.status, 2);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /^Cannot read reading:/);
  }
});

test("reading CLI rejects a FIFO without waiting for a writer", { skip: process.platform === "win32" }, () => {
  const path = join(scratch, "reading.fifo");
  execFileSync("mkfifo", [path], { timeout: 1000 });
  const result = run(path);
  assert.equal(result.status, 2);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /^Cannot read reading:/);
});
