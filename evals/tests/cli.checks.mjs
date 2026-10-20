import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { after, before, test } from "node:test";

const root = fileURLToPath(new URL("..", import.meta.url));
const cli = fileURLToPath(new URL("../bin/validate-entry.mjs", import.meta.url));
let scratch;

before(async () => {
  await mkdir(join(root, "scratch"), { recursive: true });
  scratch = await mkdtemp(join(root, "scratch", "cli-"));
});
after(async () => { if (scratch) await rm(scratch, { recursive: true, force: true }); });

const entry = () => ({
  schemaVersion: "1.0.0",
  id: "test-moon-cancer",
  language: "en",
  tradition: "western-tropical",
  factor: { kind: "placement", body: "Moon", sign: "cancer" },
  meaning: {
    summary: "This symbolic example invites reflection on familiar routines.",
    themes: ["familiarity"],
    epistemicStatus: "symbolic-interpretation"
  },
  provenance: {
    kind: "authored",
    authors: ["evals test contributors (AI assisted)"],
    note: "Original inline test prose, without a person's birth data or external quotations."
  },
  license: { spdxId: "MIT", attribution: "evals test contributors" }
});

function run(...args) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: scratch, encoding: "utf8", timeout: 10000
  });
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  return result;
}

test("CLI accepts a valid entry from another working directory without rewriting it", async () => {
  const file = join(scratch, "valid.json");
  const original = `${JSON.stringify(entry(), null, 2)}\n`;
  await writeFile(file, original);
  const result = run("valid.json");
  assert.equal(result.status, 0);
  assert.equal(result.stderr, "");
  assert.deepEqual(JSON.parse(result.stdout), { valid: true, errors: [] });
  assert.equal(await readFile(file, "utf8"), original);
});

test("CLI rejects schema-invalid JSON with structured errors and no input echo", async () => {
  const invalid = entry();
  invalid.license.spdxId = "private-marker-not-for-logs";
  await writeFile(join(scratch, "invalid.json"), JSON.stringify(invalid));
  const result = run("invalid.json");
  assert.equal(result.status, 1);
  assert.equal(result.stderr, "");
  const report = JSON.parse(result.stdout);
  assert.equal(report.valid, false);
  assert.ok(report.errors.some((error) => error.path === "/license/spdxId"));
  assert.ok(!result.stdout.includes("private-marker-not-for-logs"));
});

test("CLI reports usage errors and supports help", () => {
  for (const args of [[], ["--unknown"], ["a.json", "b.json"]]) {
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

test("CLI rejects unreadable, non-file, malformed and invalid UTF-8 inputs", async () => {
  await writeFile(join(scratch, "broken.json"), '{"private-marker-not-for-logs":');
  await writeFile(join(scratch, "utf8.json"), Buffer.from([0xff, 0xfe]));
  for (const file of ["absent.json", ".", "broken.json", "utf8.json"]) {
    const result = run(file);
    assert.equal(result.status, 2);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /^Cannot read entry:/);
    assert.ok(!result.stderr.includes("private-marker-not-for-logs"));
  }
});

test("CLI enforces its UTF-8 byte limit, inclusive at 64 KiB", async () => {
  const exact = JSON.stringify(entry()).padEnd(64 * 1024, " ");
  await writeFile(join(scratch, "exact.json"), exact);
  assert.equal(run("exact.json").status, 0);
  await writeFile(join(scratch, "over.json"), `${exact} `);
  assert.equal(run("over.json").status, 2);

  // Multibyte input must be bounded by bytes, not JavaScript string length.
  const wide = entry();
  wide.meaning.summary = "月".repeat(1600);
  const json = JSON.stringify(wide);
  const overBytes = json.padEnd(64 * 1024, " ");
  assert.equal(overBytes.length, 64 * 1024);
  assert.ok(Buffer.byteLength(overBytes) > 64 * 1024);
  await writeFile(join(scratch, "wide.json"), overBytes);
  assert.equal(run("wide.json").status, 2);
});
