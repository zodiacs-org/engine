import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";
import { edgeRoot } from "../scripts/build-support.mjs";
import { runtimeEnvironment } from "../scripts/runtime-process.mjs";
import {
  checkRuntime, loadExactProtocol, parseOptions, parseRuntimeOutput, runSmokeSuite
} from "../scripts/smoke-runtimes.mjs";

const protocol = await loadExactProtocol();
const runtime = { name: "node", version: process.versions.node, v8: process.versions.v8, platform: process.platform, arch: process.arch };
const value = { longitude: 1, at: new Date("2000-03-20T12:34:56Z"), zero: -0, absent: undefined };
const exact = protocol.serializeExact(value);
const wire = (changes = {}) => JSON.stringify({ schema: "edge-runtime-output/1", runtime, exact, ...changes }) + "\n";
const moduleUrl = (source) => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const moduleFor = (text, extra = "") => moduleUrl(`export function runExactSmokeCases() { return ${JSON.stringify(text)}; }\n${extra}`);
const check = (url, options = {}) => checkRuntime({
  name: "node", executable: process.execPath, moduleUrl: url, reference: exact, protocol, ...options
});
const missing = resolve(edgeRoot, ".generated/nonexistent-smoke-runtime");

test("runtime selection defaults to all required runtimes and always includes Node", () => {
  assert.deepEqual(parseOptions([]).runtimes, ["node", "deno", "bun"]);
  assert.deepEqual(parseOptions(["--runtimes", "deno"]).runtimes, ["node", "deno"]);
  assert.deepEqual(parseOptions(["--runtimes", "bun,node"]).runtimes, ["node", "bun"]);
  assert.deepEqual(parseOptions(["--runtimes", "node"]).runtimes, ["node"]);
  assert.equal(parseOptions(["--deno", "./edge/.cache/custom deno"]).executables.deno, resolve("./edge/.cache/custom deno"));
  assert.equal(parseOptions(["--bun", "bun"]).executables.bun, "bun");
  for (const args of [
    ["--runtimes", ""], ["--runtimes", "node,node"], ["--runtimes", "node,"],
    ["--runtimes", "toString"], ["--runtimes", "browser"], ["--unknown", "node"],
    ["--deno"], ["--bun", "--runtimes"], ["--bun", "bun", "--bun", "bun"], ["node"]
  ]) assert.throws(() => parseOptions(args), undefined, JSON.stringify(args));
});

test("runtime parser preserves every exact bit and validates framing and identity", () => {
  assert.deepEqual(parseRuntimeOutput(wire(), "node", protocol), {
    schema: "edge-runtime-output/1", runtime, exact
  });
  for (const text of [
    "", "{}\n", "null\n", "[]\n", wire().trimEnd(), " " + wire(), wire() + "\n", wire() + wire(),
    "log message\n" + wire(), "\ufeff" + wire(), wire({ schema: "future" }), wire({ extra: true }),
    wire({ runtime: null }), wire({ runtime: { ...runtime, name: "deno" } }),
    wire({ runtime: { ...runtime, version: "20.19.2" } }),
    wire({ runtime: { ...runtime, version: "" } }), wire({ runtime: { ...runtime, v8: "" } }),
    wire({ runtime: { ...runtime, arch: 64 } }), wire({ runtime: { ...runtime, extra: "ignored?" } }),
    wire({ exact: ["edge-exact/1", ["null"]] }), wire({ exact: '["edge-exact/1",["number","bad"]]' }),
    wire({ exact: " " + exact })
  ]) assert.throws(() => parseRuntimeOutput(text, "node", protocol));
});

test("native Node execution matches the full exact transport and records runtime details", async () => {
  const checked = await check(moduleFor(exact));
  assert.equal(checked.status, "passed");
  assert.equal(checked.difference, null);
  assert.equal(checked.exact, exact);
  assert.deepEqual(checked.runtime, runtime);
  assert.equal(checked.repeatable, true);
  assert.equal(checked.result.bytes, Buffer.byteLength(exact));
  assert.match(checked.result.sha256, /^[a-f0-9]{64}$/);
});

test("native comparison fails for one changed bit, signed zero and Date/string identity", async () => {
  const cases = [
    [{ ...value, longitude: 1 + Number.EPSILON }, '$["longitude"]', "value"],
    [{ ...value, zero: 0 }, '$["zero"]', "value"],
    [{ ...value, at: value.at.toISOString() }, '$["at"]', "type"],
    [{ longitude: value.longitude, zero: value.zero, at: value.at }, '$["absent"]', "missing"]
  ];
  for (const [changed, path, reason] of cases) {
    const checked = await check(moduleFor(protocol.serializeExact(changed)));
    assert.equal(checked.status, "mismatch");
    assert.equal(checked.difference.path, path);
    assert.equal(checked.difference.reason, reason);
    assert.notEqual(checked.difference.expected, checked.difference.actual);
  }
});

test("invalid, noisy, missing and failed runtime output cannot become a pass", async () => {
  const cases = [
    [moduleFor(exact), { executable: missing }, "missing-runtime"],
    [moduleFor(exact, "process.exitCode = 17;"), {}, "process-error"],
    [moduleUrl('throw new Error("synthetic import failure");'), {}, "process-error"],
    [moduleFor("not the protocol"), {}, "invalid-report"],
    [moduleFor(exact, 'console.log("extra log");'), {}, "invalid-report"],
    [moduleUrl(`let count = 0; export function runExactSmokeCases() { return count++ ? "changed" : ${JSON.stringify(exact)}; }`), {}, "process-error"],
    [moduleFor(exact, "setInterval(() => {}, 1000);"), { timeoutMs: 200 }, "timeout"]
  ];
  for (const [url, options, code] of cases) {
    const checked = await check(url, options);
    assert.equal(checked.status, "error");
    assert.equal(checked.error.code, code);
    assert.equal(checked.exact, undefined);
    assert.equal(checked.runtime, undefined);
  }
});

test("full suite requires selected runtimes and never counts missing tools as tested", async () => {
  const report = await runSmokeSuite({
    runtimes: ["node", "deno", "bun"], executables: { node: process.execPath, deno: missing, bun: missing }
  });
  assert.equal(report.passed, false);
  assert.deepEqual(report.requiredRuntimes, ["node", "deno", "bun"]);
  assert.deepEqual(report.unselectedRuntimes, []);
  assert.equal(report.reports[0].status, "passed");
  for (const item of report.reports.slice(1)) {
    assert.equal(item.status, "error");
    assert.equal(item.error.code, "missing-runtime");
    assert.equal(item.runtime, undefined);
  }
  for (const item of report.reports) {
    assert.equal(item.exact, undefined, "Compact evidence must not carry raw generated results");
    assert.match(item.build.output.sha256, /^[a-f0-9]{64}$/);
  }
  for (const source of report.runnerSources) assert.match(source.sha256, /^[a-f0-9]{64}$/);
});

test("CLI uses exit status for success, required runtime failure and invalid options", () => {
  const run = (args) => spawnSync(process.execPath, ["scripts/smoke-runtimes.mjs", ...args], {
    cwd: edgeRoot, env: runtimeEnvironment(), encoding: "utf8", timeout: 30_000, maxBuffer: 1_999_999
  });
  const passed = run(["--runtimes", "node"]);
  assert.equal(passed.status, 0, passed.stderr);
  const nodeOnly = JSON.parse(passed.stdout);
  assert.equal(nodeOnly.passed, true);
  assert.deepEqual(nodeOnly.requiredRuntimes, ["node"]);
  assert.deepEqual(nodeOnly.unselectedRuntimes, ["deno", "bun"]);
  const failed = run(["--runtimes", "deno", "--deno", missing]);
  assert.equal(failed.status, 1);
  const missingReport = JSON.parse(failed.stdout);
  assert.equal(missingReport.passed, false);
  assert.equal(missingReport.reports[1].error.code, "missing-runtime");
  const invalid = run(["--runtimes", "unknown"]);
  assert.equal(invalid.status, 1);
  assert.equal(invalid.stdout, "");
  assert.match(invalid.stderr, /Select unique runtimes/);
});
