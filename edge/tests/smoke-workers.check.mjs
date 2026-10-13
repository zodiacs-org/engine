import assert from "node:assert/strict";
import test from "node:test";
import { buildTarget } from "../scripts/build-bundles.mjs";
import { loadExactProtocol } from "../scripts/smoke-runtimes.mjs";
import { checkWorkersModules, WORKERS_COMPATIBILITY_DATE } from "../scripts/smoke-workers.mjs";

const built = await buildTarget("workers", { write: false });
const modules = Object.fromEntries(["engine.mjs", "workloads.mjs", "worker.mjs"]
  .map((name) => [name, built.files.get(name).toString("utf8")]));

test("workerd imports real bundles, denies outbound requests and checks the native HTTP handler", async () => {
  const { exact, report } = await checkWorkersModules(modules);
  const protocol = await loadExactProtocol();
  protocol.parseExact(exact);
  assert.equal(report.runtime.name, "workers");
  assert.equal(report.runtime.compatibilityDate, WORKERS_COMPATIBILITY_DATE);
  assert.match(report.runtime.version, /^\d+\.\d+\.\d+$/);
  assert.equal(report.repeatable, true);
  assert.deepEqual(report.network, {
    passed: true, guardInstalledBeforeImports: true, cfFetchDisabled: true, nativeDenyProbePassed: true,
    unexpectedRequests: 0, guardedRequests: 0
  });
  assert(report.imports.engineExports.includes("natalChart"));
  assert(report.imports.workloadExports.includes("runExactSmokeCases"));
  assert.deepEqual(report.imports.workerExports, ["default"]);
  assert.equal(report.handlers.passed, true);
  assert.deepEqual(report.handlers.cases.map(({ id, status }) => [id, status]), [
    ["whole-utc", 200], ["southern-placidus", 200], ["polar-koch", 200], ["untimed", 200],
    ["wrong-route", 404], ["wrong-method", 405], ["head", 405], ["malformed-json", 400],
    ["invalid-input", 400], ["invalid-date", 422], ["body-over-limit", 413]
  ]);
  // Actual parity is a smoke-suite verdict. This test checks that either
  // verdict has enough detail and never assumes V8 versions agree numerically.
  assert.equal(report.handlers.exactToNode, report.handlers.cases.every(({ exactToNode }) => exactToNode));
  for (const item of report.handlers.cases) {
    assert.match(item.body.sha256, /^[a-f0-9]{64}$/);
    assert.equal(item.difference === null, item.exactToNode);
  }
});

for (const name of Object.keys(modules)) {
  test(`network guard runs before ${name}, even when import-time fetch failure is swallowed`, async () => {
    await assert.rejects(checkWorkersModules({
      ...modules,
      [name]: 'try { fetch("https://edge-smoke.invalid/unexpected"); } catch {}\n' + modules[name]
    }), (error) => error.code === "process-error" && /Bundle attempted network access/.test(error.message));
  });
}

test("calculation-time network attempts are rejected", async () => {
  const changed = modules["workloads.mjs"].replace("function runExactSmokeCases() {",
    'function runExactSmokeCases() { try { fetch("https://edge-smoke.invalid/unexpected"); } catch {}');
  assert.notEqual(changed, modules["workloads.mjs"]);
  await assert.rejects(checkWorkersModules({ ...modules, "workloads.mjs": changed }),
    (error) => error.code === "process-error" && /Bundle attempted network access/.test(error.message));
});

test("module failures and missing Worker exports fail explicitly", async () => {
  await assert.rejects(checkWorkersModules({ ...modules, "engine.mjs": 'throw new Error("synthetic-import-failure");' }),
    (error) => error.code === "process-error" && /synthetic-import-failure/.test(error.message));
  await assert.rejects(checkWorkersModules({ ...modules, "worker.mjs": "export default {};" }),
    (error) => error.code === "process-error" && /Missing module Worker fetch handler/.test(error.message));
});

test("nonrepeatable runtime results fail before comparison", async () => {
  const changed = modules["workloads.mjs"].replace("function runExactSmokeCases() {",
    "let smokeCallCount = 0; function runExactSmokeCases() { return String(smokeCallCount++);");
  assert.notEqual(changed, modules["workloads.mjs"]);
  await assert.rejects(checkWorkersModules({ ...modules, "workloads.mjs": changed }),
    (error) => error.code === "process-error" && /Workloads changed on repeat/.test(error.message));
});

test("handler parity mismatches retain the full exact workload result", async () => {
  // Alter only an error response in Node. HTTP structure is still valid in
  // both runtimes, but the cross-runtime response must be reported unequal.
  // Appending a wrapper avoids depending on the engine's implementation names.
  const wrapper = modules["worker.mjs"].replace("worker_default as default",
    "worker_parity_probe as default")
    + '\nconst worker_parity_probe = { async fetch(request) {\n'
    + ' const response = await worker_default.fetch(request);\n'
    + ' if (typeof process === "undefined" || response.status !== 400) return response;\n'
    + ' const body = await response.json(); body.error.message += " synthetic-parity-change";\n'
    + ' return new Response(JSON.stringify(body), {status:response.status, headers:response.headers});\n'
    + '} };\n';
  assert(wrapper.includes("worker_parity_probe as default"));
  const { exact, report } = await checkWorkersModules({ ...modules, "worker.mjs": wrapper });
  assert.equal(typeof exact, "string");
  assert.equal(report.handlers.passed, true);
  assert.equal(report.handlers.exactToNode, false);
  assert.equal(report.handlers.cases.find(({ id }) => id === "malformed-json").difference.bodyMatches, false);
});

test("a stuck workerd import is killed by the subprocess deadline", async () => {
  await assert.rejects(checkWorkersModules({ ...modules, "engine.mjs": "while (true) {}" }, { timeoutMs: 2500 }),
    (error) => error.code === "timeout");
});

test("a pre-aborted Workers smoke does not start a runtime", async () => {
  await assert.rejects(checkWorkersModules(modules, { signal: AbortSignal.abort() }),
    (error) => error.code === "interrupted");
});
