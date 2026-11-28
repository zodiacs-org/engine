import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { edgeRoot } from "../scripts/build-support.mjs";
import {
  BROWSER_PATHS, browserRequestPolicy, checkBrowserModules, runBrowserSmoke, startBrowserServer
} from "../scripts/smoke-browser.mjs";

const origin = "http://127.0.0.1:12345";
const engine = "export function natalChart(input) { return { value: input.value }; }";
const workloads = `
import { serializeExact } from "/exact.mjs";
export const CHART_CASES = [{ id: "synthetic", input: { value: -0 } }];
export function chartWorkload() { return [{ result: { value: -0 } }]; }
export function runExactSmokeCases() { return serializeExact({ value: -0 }); }
`;
const executable = process.env.EDGE_CHROMIUM_EXECUTABLE;
const browserTest = { skip: !executable && "Set EDGE_CHROMIUM_EXECUTABLE to run native browser failure tests." };
const check = (changes = {}) => checkBrowserModules({ executable, engine, workloads, ...changes });

test("browser policy permits each exact bootstrap resource once, then denies everything", () => {
  const policy = browserRequestPolicy(origin);
  for (const [url, method, type] of [
    [origin + "/engine.mjs", "POST", "script"], [origin + "/engine.mjs", "GET", "fetch"],
    [origin + "/", "GET", "script"], [origin + "/engine.mjs?cache=1", "GET", "script"],
    [origin + "/engine.mjs#fragment", "GET", "script"], [origin + "/src/index.ts", "GET", "script"],
    [origin + "/nested/../engine.mjs", "GET", "script"], ["http://localhost:12345/engine.mjs", "GET", "script"],
    ["http://name@127.0.0.1:12345/engine.mjs", "GET", "script"], ["https://example.invalid/engine.mjs", "GET", "script"],
    ["not a URL", "GET", "script"]
  ]) assert.equal(policy.allow(url, method, type), false, url);
  assert.throws(() => policy.finish(), /did not import/);
  for (const path of BROWSER_PATHS) {
    const type = path === "/" ? "document" : "script";
    assert.equal(policy.allow(origin + path, "GET", type), true);
    assert.equal(policy.allow(origin + path, "GET", type), false);
  }
  policy.finish();
  for (const path of BROWSER_PATHS) assert.equal(policy.allow(origin + path, "GET", path === "/" ? "document" : "script"), false);
});

test("browser server serves captured ESM bytes and refuses file traversal, queries and other methods", async () => {
  const host = await startBrowserServer({ engine, workloads, exact: "export {};" });
  try {
    const response = await fetch(host.origin + "/engine.mjs");
    assert.equal(response.status, 200);
    assert.equal(await response.text(), engine);
    assert.equal(response.headers.get("content-type"), "text/javascript; charset=utf-8");
    assert.equal(response.headers.get("cache-control"), "no-store");
    for (const path of ["/README.md", "/%2e%2e%2fpackage.json", "/engine.mjs?ignored=1", "/favicon.ico"]) {
      assert.equal((await fetch(host.origin + path)).status, 404);
    }
    assert.equal((await fetch(host.origin + "/engine.mjs", { method: "POST" })).status, 404);
  } finally { await host.close(); }
  await assert.rejects(fetch(host.origin), /fetch failed/);
});

test("browser smoke fails on missing executable or an already aborted signal", async () => {
  await assert.rejects(check({ executable: undefined }), { code: "missing-runtime" });
  await assert.rejects(check({ executable: resolve(edgeRoot, ".cache/no-such-browser") }), { code: "missing-runtime" });
  await assert.rejects(check({ signal: AbortSignal.abort() }), { code: "interrupted" });
});

test("real browser imports ESM, checks repeated exact results, and proves its network blocks", browserTest, async () => {
  const result = await check();
  assert.equal(result.exact, '["edge-exact/1",["object","ordinary",[["value",["number","8000000000000000"]]]]]');
  assert.equal(result.report.runtime.name, "browser");
  assert.match(result.report.runtime.version, /\d+\.\d+/);
  assert.match(result.report.runtime.v8, /\d+\.\d+/);
  assert.equal(result.report.repeatable, true);
  assert.deepEqual(result.report.engineExports, ["natalChart"]);
  assert.equal(result.report.engineChart.matchesWorkload, true);
  assert.equal(result.report.network.importAttempts, 0);
  assert.equal(result.report.network.calculationAttempts, 0);
  assert.deepEqual(result.report.network.negativeControl, { fetchDenied: true, resourceDenied: true, reachedServer: false });
  assert.match(result.report.protocolBuild.sha256, /^[a-f0-9]{64}$/);
  assert.match(result.report.toolchain.playwright, /^\d+\.\d+\.\d+$/);
});

test("real browser rejects caught network attempts at import and calculation, and resource requests", browserTest, async () => {
  for (const change of [
    { engine: engine + '\nvoid fetch("/attempted-import").catch(() => {});' },
    { workloads: workloads.replace("return serializeExact", 'void fetch("/attempted-calculation").catch(() => {}); return serializeExact') },
    { engine: engine + '\nconst image = new Image(); image.src = "/attempted-resource";' }
  ]) await assert.rejects(check(change), /Browser (attempted network|requested unexpected resources)/);
});

test("real browser fails import errors, changed repeats, bad transport and differing engine output", browserTest, async () => {
  for (const [change, message] of [
    [{ engine: 'throw new Error("synthetic import failure");' }, /synthetic import failure/],
    [{ workloads: "let count = 0;\n" + workloads.replace("serializeExact({ value: -0 })", "serializeExact({ value: count++ })") }, /changed on repeat/],
    [{ workloads: workloads.replace("serializeExact({ value: -0 })", '"bad protocol"') }, /Invalid protocol JSON/],
    [{ engine: engine.replace("input.value", "0") }, /engine and workload chart disagree/]
  ]) await assert.rejects(check(change), message);
});

test("real browser timeout and interrupt terminate children and clean their temporary directories", browserTest, async () => {
  const cache = resolve(edgeRoot, ".cache/browser");
  const before = (await readdir(cache).catch(() => [])).sort();
  const ready = async () => {
    for (let retry = 0; retry < 250; retry++) {
      for (const name of (await readdir(cache)).filter((name) => !before.includes(name))) {
        try { return JSON.parse(await readFile(resolve(cache, name, "browser-ready.json"), "utf8")); }
        catch (error) { if (error.code !== "ENOENT") throw error; }
      }
      await new Promise((fulfill) => setTimeout(fulfill, 20));
    }
    assert.fail("Browser did not reach calculation before the lifecycle deadline.");
  };
  const gone = async ({ pid, origin }) => {
    for (let retry = 0; retry < 100; retry++) {
      try { process.kill(pid, 0); }
      catch (error) { if (error.code === "ESRCH") break; throw error; }
      await new Promise((fulfill) => setTimeout(fulfill, 20));
    }
    assert.throws(() => process.kill(pid, 0), { code: "ESRCH" }, "Chromium process survived driver termination.");
    await assert.rejects(fetch(origin), /fetch failed/);
  };
  const hanging = workloads.replace("return serializeExact", "while (true) {} return serializeExact");
  const timeoutResult = assert.rejects(check({ workloads: hanging, timeoutMs: 6_000 }), { code: "timeout" });
  const timedOutBrowser = await ready();
  await timeoutResult;
  await gone(timedOutBrowser);
  const controller = new AbortController();
  const abortResult = assert.rejects(check({ workloads: hanging, signal: controller.signal }), { code: "interrupted" });
  const abortedBrowser = await ready();
  controller.abort();
  await abortResult;
  await gone(abortedBrowser);
  assert.deepEqual((await readdir(cache)).sort(), before);
});

test("real browser executes both actual engine bundles and verifies their export surface", browserTest, async () => {
  const result = await runBrowserSmoke({ executable });
  assert.equal(result.report.build.target, "browser");
  assert.equal(result.report.build.outputs.length, 2);
  assert(result.report.engineExports.includes("natalChart"));
  assert(result.report.engineExports.includes("searchLongitudeCrossings"));
  assert.equal(result.report.engineChart.case, "whole-utc");
});
