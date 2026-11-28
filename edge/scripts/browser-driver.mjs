import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright-core";
import { browserRequestPolicy, startBrowserServer } from "./smoke-browser.mjs";

// The parent supplies a sanitized process environment and an edge-local TMPDIR.
// Playwright's profile, downloads and transient artifacts all stay below it.
assert(process.env.TMPDIR, "Browser driver requires its parent-managed temporary directory.");
let input = "";
for await (const chunk of process.stdin) {
  input += chunk;
  assert(Buffer.byteLength(input) < 2_000_000, "Browser driver input exceeds its byte limit.");
}
const { engine, workloads, exact, executable } = JSON.parse(input);
let browser, host;
const stop = () => {
  // Playwright starts Chromium in a separate process group. A plain SIGKILL
  // of this driver cannot reach it. Exit while Playwright's synchronous exit
  // hook can still kill that group, before the parent's force-kill deadline.
  setTimeout(() => process.exit(143), 100);
  void Promise.allSettled([browser?.close()]).then(() => process.exit(143));
};
process.once("SIGTERM", stop);
process.once("SIGINT", stop);
process.once("SIGHUP", stop);
try {
  host = await startBrowserServer({ engine, workloads, exact });
  browser = await chromium.launch({
    executablePath: executable, headless: true, timeout: 15_000,
    env: process.env, downloadsPath: resolve(process.env.TMPDIR, "downloads"),
    handleSIGINT: true, handleSIGTERM: true, handleSIGHUP: true
  });
  const context = await browser.newContext({ serviceWorkers: "block", acceptDownloads: false });
  const policy = browserRequestPolicy(host.origin);
  const blocked = [];
  let phase = "imports";
  let eventBytes = 0;
  let eventOverflow = false;
  const record = (kind, detail) => {
    eventBytes += Buffer.byteLength(detail);
    if (eventBytes > 64_000 || blocked.length >= 100) { eventOverflow = true; return; }
    blocked.push({ phase, kind, detail: detail.slice(0, 200) });
  };
  await context.route("**/*", async (route) => {
    const request = route.request();
    if (policy.allow(request.url(), request.method(), request.resourceType())) await route.continue();
    else {
      record("request", request.url());
      await route.abort("blockedbyclient");
    }
  });
  await context.routeWebSocket(/.*/, (socket) => {
    record("websocket", socket.url());
    socket.close({ code: 1008, reason: "Network disabled during edge smoke." });
  });
  await context.addInitScript(() => {
    const attempts = [];
    let currentPhase = "imports";
    const deny = (api) => {
      if (attempts.length < 100) attempts.push({ phase: currentPhase, api });
      throw new Error(`Network disabled during edge smoke: ${api}`);
    };
    Object.defineProperty(globalThis, "__edgeNetwork", {
      value: Object.freeze({ read: () => attempts.slice(), phase: (value) => { currentPhase = value; } })
    });
    for (const api of ["XMLHttpRequest", "WebSocket", "EventSource", "Worker", "SharedWorker", "RTCPeerConnection"]) {
      Object.defineProperty(globalThis, api, { configurable: false, writable: false, value: function () { deny(api); } });
    }
    Object.defineProperty(globalThis, "fetch", {
      configurable: false, writable: false, value: async () => deny("fetch")
    });
    Object.defineProperty(navigator, "sendBeacon", { value: () => deny("sendBeacon") });
    if (navigator.serviceWorker) Object.defineProperty(navigator.serviceWorker, "register", { value: async () => deny("serviceWorker") });
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => { if (pageErrors.length < 100) pageErrors.push(String(error.message).slice(0, 200)); });
  let consoleBytes = 0;
  page.on("console", (event) => { consoleBytes += Buffer.byteLength(event.text()); });
  const session = await context.newCDPSession(page);
  const version = await session.send("Browser.getVersion");
  await page.goto(host.origin + "/", { waitUntil: "load", timeout: 10_000 });
  await page.evaluate(async () => {
    globalThis.__edgeModules = {
      exact: await import("/exact.mjs"), engine: await import("/engine.mjs"), workloads: await import("/workloads.mjs")
    };
  });
  policy.finish();
  const assertQuiet = async () => {
    // Drain immediate promise/timer callbacks before inspecting attempted I/O.
    const attempts = await page.evaluate(async () => {
      await new Promise((fulfill) => setTimeout(fulfill, 0));
      return globalThis.__edgeNetwork.read();
    });
    assert.deepEqual(attempts, [], `Browser attempted network during ${phase}.`);
    assert.deepEqual(blocked, [], `Browser requested unexpected resources during ${phase}.`);
    assert.deepEqual(pageErrors, [], "Browser reported an uncaught page error.");
    assert.equal(eventOverflow, false, "Browser event output limit exceeded.");
    assert(consoleBytes < 64_000, "Browser console exceeded its byte limit.");
  };
  await assertQuiet();
  phase = "calculations";
  const browserSession = await browser.newBrowserCDPSession();
  const { processInfo } = await browserSession.send("SystemInfo.getProcessInfo");
  const browserPid = processInfo.find(({ type }) => type === "browser")?.id;
  assert(Number.isSafeInteger(browserPid) && browserPid > 0, "Missing Chromium process identity.");
  await writeFile(resolve(process.env.TMPDIR, "browser-ready.json"), JSON.stringify({ pid: browserPid, origin: host.origin }));
  const result = await page.evaluate(() => {
    globalThis.__edgeNetwork.phase("calculations");
    const { engine, workloads, exact: protocol } = globalThis.__edgeModules;
    const first = workloads.runExactSmokeCases();
    if (first !== workloads.runExactSmokeCases()) throw new Error("Browser workload results changed on repeat.");
    protocol.parseExact(first);
    const fromEngine = protocol.serializeExact(engine.natalChart(workloads.CHART_CASES[0].input));
    const fromWorkload = protocol.serializeExact(workloads.chartWorkload()[0].result);
    if (protocol.compareExact(fromEngine, fromWorkload)) throw new Error("Browser engine and workload chart disagree.");
    return {
      exact: first, engineExports: Object.keys(engine).sort(),
      engineChart: { matchesWorkload: true, case: workloads.CHART_CASES[0].id },
      userAgent: navigator.userAgent, platform: navigator.platform
    };
  });
  await assertQuiet();
  const calculationRequests = host.requests.length;
  phase = "negative-control";
  const controls = await page.evaluate(async () => {
    globalThis.__edgeNetwork.phase("negative-control");
    let fetchDenied = false;
    try { await fetch("/__edge_denied_fetch"); } catch { fetchDenied = true; }
    const imageDenied = await new Promise((fulfill) => {
      const image = new Image();
      image.onload = () => fulfill(false);
      image.onerror = () => fulfill(true);
      image.src = "/__edge_denied_image";
    });
    return { fetchDenied, imageDenied, attempts: globalThis.__edgeNetwork.read() };
  });
  assert.equal(controls.fetchDenied, true);
  assert.equal(controls.imageDenied, true);
  assert.deepEqual(controls.attempts, [{ phase: "negative-control", api: "fetch" }]);
  assert.deepEqual(blocked, [{ phase: "negative-control", kind: "request", detail: `${host.origin}/__edge_denied_image` }]);
  assert.equal(host.requests.length, calculationRequests, "A denied request reached the loopback server.");
  assert.deepEqual(pageErrors, []);
  assert.equal(eventOverflow, false);
  const output = {
    exact: result.exact,
    report: {
      runtime: {
        name: "browser", browser: "chromium", version: version.product,
        v8: version.jsVersion, userAgent: result.userAgent, platform: result.platform
      },
      repeatable: true, engineExports: result.engineExports, engineChart: result.engineChart,
      network: {
        passed: true,
        policy: "Allow each loopback bootstrap asset once; block page network APIs, service workers and all subsequent requests.",
        bootstrap: host.requests.map(({ method, path }) => ({ method, path })),
        importAttempts: 0, calculationAttempts: 0,
        negativeControl: { fetchDenied: true, resourceDenied: true, reachedServer: false },
        scope: "Observed page imports and synchronous calculations; browser background services are outside this request monitor."
      }
    }
  };
  assert(Buffer.byteLength(JSON.stringify(output)) < 1_999_998, "Browser output exceeds its byte limit.");
  console.log(JSON.stringify(output));
} catch (error) {
  console.error(`Browser smoke failed: ${String(error.message).slice(0, 2000)}`);
  process.exitCode = 1;
} finally {
  await browser?.close();
  await host?.close();
}
