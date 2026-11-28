import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";

const project = fileURLToPath(new URL("..", import.meta.url));
const cli = fileURLToPath(new URL("../bin/validate-dataset.mjs", import.meta.url));
const seedPath = new URL("../data/seed.json", import.meta.url);
const MAX_DATASET_BYTES = 1_048_576;
let scratch;
let seed;

before(async () => {
  await mkdir(join(project, "scratch"), { recursive: true });
  scratch = await mkdtemp(join(project, "scratch", "dataset-cli-"));
  seed = JSON.parse(await readFile(seedPath, "utf8"));
});
after(async () => { if (scratch) await rm(scratch, { recursive: true, force: true }); });

function dataset() {
  const value = structuredClone(seed);
  value.id = "test-dataset";
  return value;
}

function run(...args) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: scratch, encoding: "utf8", timeout: 10000
  });
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  return result;
}

function rejected(result) {
  assert.equal(result.status, 1);
  assert.equal(result.stderr, "");
  const report = JSON.parse(result.stdout);
  assert.deepEqual(Object.keys(report).sort(), ["errors", "valid"]);
  assert.equal(report.valid, false);
  assert.ok(report.errors.length > 0);
  for (const error of report.errors) {
    assert.deepEqual(Object.keys(error).sort(), ["keyword", "message", "path"]);
    assert.equal(typeof error.path, "string");
    assert.equal(typeof error.keyword, "string");
    assert.equal(typeof error.message, "string");
  }
  return report;
}

test("dataset CLI accepts the authored seed from another working directory without rewriting it", async () => {
  const original = `${JSON.stringify(dataset(), null, 2)}\n`;
  const path = join(scratch, "seed-copy.json");
  await writeFile(path, original);
  for (const args of [["seed-copy.json"], ["--seed", "seed-copy.json"]]) {
    const result = run(...args);
    assert.equal(result.status, 0);
    assert.equal(result.stderr, "");
    assert.deepEqual(JSON.parse(result.stdout), { valid: true, errors: [] });
    assert.equal(await readFile(path, "utf8"), original);
  }
});

test("dataset CLI reports indexed schema errors without echoing input values", async () => {
  const invalid = dataset();
  invalid.entries[0].license.spdxId = "private-marker-not-for-logs";
  const path = join(scratch, "invalid.json");
  const original = JSON.stringify(invalid);
  await writeFile(path, original);
  const result = run("invalid.json");
  const report = rejected(result);
  assert.ok(report.errors.some((error) => error.path === "/entries/0/license/spdxId"));
  assert.ok(!result.stdout.includes("private-marker-not-for-logs"));
  assert.equal(await readFile(path, "utf8"), original);
});

test("dataset CLI applies dataset integrity checks beyond the entry schema", async () => {
  const duplicate = dataset();
  duplicate.entries[1].id = duplicate.entries[0].id;
  await writeFile(join(scratch, "duplicate.json"), JSON.stringify(duplicate));
  rejected(run("duplicate.json"));

  const missingSource = dataset();
  missingSource.entries[0].provenance = {
    kind: "generated", backend: "mock", model: "offline-test-model",
    promptVersion: "test-prompt-v1", inputDigest: `sha256:${"a".repeat(64)}`,
    sourceEntryIds: ["absent-source-entry"], reviewStatus: "unreviewed"
  };
  await writeFile(join(scratch, "missing-source.json"), JSON.stringify(missingSource));
  rejected(run("missing-source.json"));
});

test("dataset CLI permits sourced variants by default and enforces authored seed mode", async () => {
  const value = dataset();
  const generated = structuredClone(value.entries[0]);
  generated.id = "generated-test-variant";
  generated.provenance = {
    kind: "generated", backend: "mock", model: "offline-test-model",
    promptVersion: "test-prompt-v1", inputDigest: `sha256:${"b".repeat(64)}`,
    sourceEntryIds: [value.entries[0].id], reviewStatus: "unreviewed"
  };
  value.entries.push(generated);
  await writeFile(join(scratch, "variant.json"), JSON.stringify(value));
  const accepted = run("variant.json");
  assert.equal(accepted.status, 0);
  assert.equal(accepted.stderr, "");
  assert.deepEqual(JSON.parse(accepted.stdout), { valid: true, errors: [] });
  rejected(run("--seed", "variant.json"));
});

test("dataset CLI reports usage errors and supports help alone", () => {
  for (const args of [
    [], ["--unknown"], ["--seed"], ["--seed", "--help"],
    ["--help", "seed-copy.json"], ["a.json", "b.json"],
    ["--seed", "a.json", "b.json"], ["a.json", "--seed"]
  ]) {
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

test("dataset CLI rejects unreadable, non-file, malformed and invalid UTF-8 inputs", async () => {
  await writeFile(join(scratch, "broken.json"), '{"private-marker-not-for-logs":');
  await writeFile(join(scratch, "utf8.json"), Buffer.from([0xff, 0xfe]));
  for (const file of ["missing-private-path-marker.json", ".", "broken.json", "utf8.json"]) {
    for (const args of [[file], ["--seed", file]]) {
      const result = run(...args);
      assert.equal(result.status, 2);
      assert.equal(result.stdout, "");
      assert.match(result.stderr, /^Cannot read dataset:/);
      assert.ok(!result.stderr.includes("private-marker-not-for-logs"));
      assert.ok(!result.stderr.includes("missing-private-path-marker"));
    }
  }
});

test("dataset CLI bounds UTF-8 bytes inclusively at 1 MiB", async () => {
  const exact = JSON.stringify(dataset()).padEnd(MAX_DATASET_BYTES, " ");
  assert.equal(Buffer.byteLength(exact), MAX_DATASET_BYTES);
  await writeFile(join(scratch, "exact.json"), exact);
  for (const args of [["exact.json"], ["--seed", "exact.json"]]) {
    assert.equal(run(...args).status, 0);
  }

  await writeFile(join(scratch, "over.json"), `${exact} `);
  const wide = dataset();
  wide.entries[0].meaning.summary = "月".repeat(1600);
  const overBytes = JSON.stringify(wide).padEnd(MAX_DATASET_BYTES, " ");
  assert.equal(overBytes.length, MAX_DATASET_BYTES);
  assert.ok(Buffer.byteLength(overBytes) > MAX_DATASET_BYTES);
  await writeFile(join(scratch, "wide.json"), overBytes);

  for (const file of ["over.json", "wide.json"]) {
    const result = run(file);
    assert.equal(result.status, 2);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /^Cannot read dataset:/);
  }
});
