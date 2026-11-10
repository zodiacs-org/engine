import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";
import { edgeRoot } from "../scripts/build-support.mjs";
import { runtimeEnvironment } from "../scripts/runtime-process.mjs";
import { loadExactProtocol } from "../scripts/smoke-runtimes.mjs";
import { parseWebOptions, summarizeWebResult } from "../scripts/smoke-web.mjs";

const protocol = await loadExactProtocol();
const value = { at: new Date("2000-03-20T12:34:56Z"), longitude: 1, zero: -0 };
const exact = protocol.serializeExact(value);
function output(name, changes = {}) {
  return { exact, report: {
    runtime: { name }, repeatable: true,
    build: { target: name }, network: { passed: true },
    ...(name === "workers" ? { handlers: { passed: true, exactToNode: true, cases: [] } } : {}),
    ...changes
  } };
}
const summarize = (name, result, reference = exact) => summarizeWebResult(name, result, reference, protocol);

test("web CLI requires selected runtimes, always includes Node and accepts explicit browser paths", () => {
  assert.deepEqual(parseWebOptions([]).runtimes, ["node", "workers", "browser"]);
  assert.deepEqual(parseWebOptions(["--runtimes", "browser,node"]).runtimes, ["node", "browser"]);
  assert.deepEqual(parseWebOptions(["--runtimes", "workers"]).runtimes, ["node", "workers"]);
  assert.equal(parseWebOptions(["--browser", "./a browser"]).browserExecutable, resolve("./a browser"));
  for (const args of [
    ["--runtimes", ""], ["--runtimes", "workers,workers"], ["--runtimes", "deno"],
    ["--runtimes", "browser,"], ["--browser"], ["--browser", "--runtimes"],
    ["--browser", "a", "--browser", "b"], ["--unknown", "yes"], ["workers"]
  ]) assert.throws(() => parseWebOptions(args));
});

test("web summary records exact result digests without storing generated results", () => {
  for (const name of ["workers", "browser"]) {
    const report = summarize(name, output(name));
    assert.equal(report.status, "passed");
    assert.equal(report.difference, null);
    assert.equal(report.result.bytes, Buffer.byteLength(exact));
    assert.match(report.result.sha256, /^[a-f0-9]{64}$/);
    assert.equal(report.exact, undefined);
  }
});

test("web summary refuses one-bit, signed-zero and Date changes and HTTP-only differences", () => {
  for (const name of ["workers", "browser"]) {
    for (const [changed, path] of [
      [{ ...value, longitude: 1 + Number.EPSILON }, '$["longitude"]'],
      [{ ...value, zero: 0 }, '$["zero"]'],
      [{ ...value, at: value.at.toISOString() }, '$["at"]']
    ]) {
      const report = summarize(name, { ...output(name), exact: protocol.serializeExact(changed) });
      assert.equal(report.status, "mismatch");
      assert.equal(report.difference.path, path);
    }
  }
  const report = summarize("workers", output("workers", { handlers: { passed: true, exactToNode: false } }));
  assert.equal(report.status, "mismatch");
  assert.equal(report.difference, null);
});

test("missing reference, malformed reports and failed web checks cannot pass", () => {
  assert.equal(summarizeWebResult("browser", output("browser"), undefined, protocol).status, "uncompared");
  for (const result of [
    null, {}, { ...output("browser"), extra: true }, { ...output("browser"), exact: "malformed" },
    output("workers"), output("browser", { repeatable: false }), output("browser", { build: null }),
    output("browser", { network: null }), output("browser", { network: { passed: false } }),
    output("browser", { exact })
  ]) {
    const report = summarize("browser", result);
    assert.equal(report.status, "error");
    assert.equal(report.error.code, "invalid-report");
  }
  assert.equal(summarize("workers", output("workers", { handlers: { passed: false, exactToNode: true } })).status, "error");
  assert.equal(summarize("workers", output("workers", { handlers: undefined })).status, "error");
});

test("web CLI exits successfully only for tested selections and fails for missing browser", () => {
  const run = (args) => spawnSync(process.execPath, ["scripts/smoke-web.mjs", ...args], {
    cwd: edgeRoot, env: runtimeEnvironment(), encoding: "utf8", timeout: 45_000, maxBuffer: 1_999_999
  });
  const node = run(["--runtimes", "node"]);
  assert.equal(node.status, 0, node.stderr);
  const report = JSON.parse(node.stdout);
  assert.equal(report.passed, true);
  assert.deepEqual(report.requiredRuntimes, ["node"]);
  assert.deepEqual(report.unselectedRuntimes, ["workers", "browser"]);
  const missing = run(["--runtimes", "browser", "--browser", resolve(edgeRoot, ".cache/missing-browser")]);
  assert.equal(missing.status, 1, missing.stderr);
  const failed = JSON.parse(missing.stdout);
  assert.equal(failed.passed, false);
  assert.equal(failed.reports[1].status, "error");
  const invalid = run(["--runtimes", "unknown"]);
  assert.equal(invalid.status, 1);
  assert.equal(invalid.stdout, "");
});
