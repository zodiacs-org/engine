import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";
import { validateDataset } from "../lib/validate-dataset.mjs";

const project = fileURLToPath(new URL("..", import.meta.url));
const repository = fileURLToPath(new URL("../..", import.meta.url));
const cli = join(project, "bin", "generate-interpretations.mjs");
const outputs = new Set();
let scratch;
let sources;

before(async () => {
  await mkdir(join(project, "scratch"), { recursive: true });
  scratch = await mkdtemp(join(project, "scratch", "generator-cli-"));
  sources = JSON.parse(await readFile(join(project, "data", "seed.json"), "utf8"));
  await writeFile(join(scratch, "sources.json"), JSON.stringify(sources));
});
after(async () => {
  for (const path of outputs) await rm(path, { recursive: true, force: true });
  if (scratch) await rm(scratch, { recursive: true, force: true });
});

function plan() {
  return {
    schemaVersion: "1.0.0", id: `cli-${randomUUID()}`, seed: 42,
    license: { spdxId: "MIT", attribution: "Original generator CLI test contribution." },
    targets: [{
      id: "cli-generated-sun-aries", factor: structuredClone(sources.entries[0].factor),
      sourceEntryIds: [sources.entries[0].id]
    }]
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

function success(result) {
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  const summary = JSON.parse(result.stdout);
  assert.deepEqual(Object.keys(summary).sort(), ["directory", "reused"]);
  assert.match(summary.directory, /^evals\/generated\/[a-f0-9]{64}$/);
  assert.equal(typeof summary.reused, "boolean");
  outputs.add(join(repository, summary.directory));
  return summary;
}

function failure(result, status, prefix) {
  assert.equal(result.status, status);
  assert.equal(result.stdout, "");
  assert.ok(result.stderr.startsWith(prefix), result.stderr);
  assert.ok(!result.stderr.includes("private-input-marker"));
}

test("generator CLI defaults offline, publishes a valid dataset and reuses identical reruns", async () => {
  const value = plan();
  const path = join(scratch, "plan.json");
  const original = JSON.stringify(value);
  await writeFile(path, original);
  const first = success(run("sources.json", "plan.json"));
  assert.equal(first.reused, false);
  const directory = join(repository, first.directory);
  assert.deepEqual((await readdir(directory)).sort(), ["dataset.json", "manifest.json"]);
  const dataset = JSON.parse(await readFile(join(directory, "dataset.json"), "utf8"));
  const manifest = JSON.parse(await readFile(join(directory, "manifest.json"), "utf8"));
  assert.equal(validateDataset(dataset).valid, true);
  assert.equal(dataset.id, value.id);
  assert.equal(dataset.entries.length, sources.entries.length + value.targets.length);
  const generated = dataset.entries.find((entry) => entry.id === value.targets[0].id);
  assert.equal(generated.provenance.backend, "mock");
  assert.equal(generated.provenance.reviewStatus, "unreviewed");
  assert.deepEqual(generated.provenance.sourceEntryIds, value.targets[0].sourceEntryIds);
  assert.equal(manifest.schemaVersion, "1.0.0");
  const second = success(run("sources.json", "plan.json", "--backend", "mock"));
  assert.deepEqual(second, { ...first, reused: true });
  assert.equal(await readFile(path, "utf8"), original);
  assert.deepEqual(JSON.parse(await readFile(join(scratch, "sources.json"), "utf8")), sources);
});

test("generator CLI requires valid positional paths and an explicit supported backend", () => {
  for (const args of [
    [], ["sources.json"], ["--help", "plan.json"], ["sources.json", "plan.json", "extra"],
    ["sources.json", "plan.json", "--backend"],
    ["sources.json", "plan.json", "--backend", "private-input-marker"],
    ["sources.json", "plan.json", "--output", "private-input-marker"],
    ["--backend", "mock", "sources.json", "plan.json"],
    ["", "plan.json"]
  ]) failure(run(...args), 2, "Usage:");
  const help = run("--help");
  assert.equal(help.status, 0);
  assert.match(help.stdout, /^Usage:/);
  assert.equal(help.stderr, "");
});

test("generator CLI rejects unreadable, malformed, oversized and symlinked input safely", async () => {
  const value = plan();
  await writeFile(join(scratch, "read-plan.json"), JSON.stringify(value));
  await writeFile(join(scratch, "broken.json"), '{"private-input-marker":');
  await writeFile(join(scratch, "invalid-utf8.json"), Buffer.from([0xff]));
  await writeFile(join(scratch, "oversized.json"), " ".repeat(1_048_577));
  await symlink(join(scratch, "sources.json"), join(scratch, "linked.json"));
  for (const path of ["missing-private-input-marker", ".", "broken.json", "invalid-utf8.json", "oversized.json", "linked.json"]) {
    failure(run(path, "read-plan.json"), 2, "Cannot read generation inputs:");
    failure(run("sources.json", path), 2, "Cannot read generation inputs:");
  }
});

test("generator CLI emits a fixed generation error for invalid datasets and plans", async () => {
  const badPlan = plan();
  badPlan.targets[0].sourceEntryIds = ["private-input-marker"];
  await writeFile(join(scratch, "bad-plan.json"), JSON.stringify(badPlan));
  failure(run("sources.json", "bad-plan.json"), 1, "Generation failed:");
  await writeFile(join(scratch, "good-plan.json"), JSON.stringify(plan()));
  const badSources = structuredClone(sources);
  badSources.entries[0].meaning.summary = { text: "private-input-marker" };
  await writeFile(join(scratch, "bad-sources.json"), JSON.stringify(badSources));
  failure(run("bad-sources.json", "good-plan.json"), 1, "Generation failed:");
});

test("generator CLI refuses a conflicting published result without overwriting it", async () => {
  await writeFile(join(scratch, "conflict-plan.json"), JSON.stringify(plan()));
  const summary = success(run("sources.json", "conflict-plan.json"));
  const path = join(repository, summary.directory, "dataset.json");
  await writeFile(path, "private-input-marker");
  failure(run("sources.json", "conflict-plan.json"), 2, "Cannot write generation output:");
  assert.equal(await readFile(path, "utf8"), "private-input-marker");
});
