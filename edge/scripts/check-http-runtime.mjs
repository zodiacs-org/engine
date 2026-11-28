import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { request } from "node:http";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { buildTarget } from "./build-bundles.mjs";
import { edgeRoot, requireNode22 } from "./build-support.mjs";

const origin = "http://127.0.0.1:8787";
const startupMarker = `Chart HTTP listening on ${origin}`;
const outputLimit = 65_536;
const responseLimit = 262_144;
const activeChildren = new Set();
let interrupted;

// Pass no tokens, preload settings, proxy settings or inherited runtime flags.
const runtimeEnv = {
  PATH: process.env.PATH ?? "",
  LANG: "C.UTF-8",
  TZ: "UTC",
  NO_COLOR: "1",
  DENO_DIR: resolve(edgeRoot, ".cache/deno"),
  DENO_NO_UPDATE_CHECK: "1",
  BUN_RUNTIME_TRANSPILER_CACHE_PATH: resolve(edgeRoot, ".cache/bun-transpiler")
};

function launch(executable, args, { input = "", timeoutMs = 10_000 } = {}) {
  // npm's Deno command wraps the native process. Terminate its process group
  // too, otherwise a surviving descendant can hold the inherited pipes open.
  const detached = process.platform !== "win32";
  const child = spawn(executable, args, { cwd: edgeRoot, env: runtimeEnv, stdio: ["pipe", "pipe", "pipe"], detached });
  let stdout = "";
  let stderr = "";
  let outputBytes = 0;
  let failure;
  let closed = false;
  let killTimer;
  const signal = (name) => {
    if (!child.pid) return;
    try {
      if (detached) process.kill(-child.pid, name);
      else child.kill(name);
    } catch (error) {
      if (error.code !== "ESRCH") failure ??= error;
    }
  };
  const stop = () => {
    if (closed || killTimer) return;
    signal("SIGTERM");
    killTimer = setTimeout(() => signal("SIGKILL"), 1_000);
  };
  const fail = (message) => {
    failure ??= new Error(message);
    stop();
  };
  const timer = setTimeout(() => fail(`Runtime process exceeded ${timeoutMs} ms.`), timeoutMs);
  const collect = (name, chunk) => {
    const remaining = Math.max(0, outputLimit - outputBytes);
    outputBytes += chunk.byteLength;
    const text = chunk.subarray(0, remaining).toString("utf8");
    if (name === "stdout") stdout += text;
    else stderr += text;
    if (outputBytes > outputLimit) fail("Runtime process exceeded its output limit.");
  };
  child.stdout.on("data", (chunk) => collect("stdout", chunk));
  child.stderr.on("data", (chunk) => collect("stderr", chunk));
  child.on("error", (error) => { failure ??= error; });
  child.stdin.on("error", (error) => {
    if (error.code !== "EPIPE") fail(`Runtime input failed: ${error.message}`);
  });
  child.stdin.end(input);
  const done = new Promise((fulfill) => {
    child.once("close", (code, signal) => {
      closed = true;
      clearTimeout(timer);
      clearTimeout(killTimer);
      activeChildren.delete(stop);
      fulfill({ code, signal, stdout, stderr, failure });
    });
  });
  activeChildren.add(stop);
  const ensureAlive = () => {
    if (interrupted) throw interrupted;
    if (failure) throw failure;
    assert(!closed, `Runtime server exited unexpectedly. ${stderr.trim()}`);
  };
  return {
    done,
    stop,
    ensureAlive,
    async ready() {
      let startupTimer;
      let onData;
      try {
        await Promise.race([
          new Promise((fulfill, reject) => {
            onData = () => {
              if (stdout.split(/\r?\n/).includes(startupMarker)) fulfill();
            };
            child.stdout.on("data", onData);
            onData();
            startupTimer = setTimeout(() => reject(new Error("Runtime did not announce its listener within 10000 ms.")), 10_000);
          }),
          done.then(({ code, signal, failure, stderr }) => {
            throw failure ?? new Error(`Runtime exited before listening (${code ?? signal}). ${stderr.trim()}`);
          })
        ]);
        ensureAlive();
      } finally {
        clearTimeout(startupTimer);
        child.stdout.off("data", onData);
      }
    }
  };
}

async function run(executable, args, options) {
  const child = launch(executable, args, options);
  const result = await child.done;
  if (interrupted) throw interrupted;
  if (result.failure) throw result.failure;
  assert.equal(result.code, 0, `Runtime command failed (${result.code ?? result.signal}). ${result.stderr.trim()}`);
  return result;
}

function http({ path = "/chart", method = "POST", body, headers = {}, chunked = false } = {}) {
  // node:http talks directly to this loopback address and never follows redirects.
  return new Promise((fulfill, reject) => {
    const bytes = body === undefined ? undefined : Buffer.from(body);
    const req = request(origin + path, {
      method,
      agent: false,
      headers: {
        "Content-Type": "application/json",
        ...(bytes && !chunked ? { "Content-Length": bytes.byteLength } : {}),
        ...headers
      }
    });
    const timer = setTimeout(() => req.destroy(new Error("HTTP case exceeded 10000 ms.")), 10_000);
    req.once("error", reject);
    req.once("close", () => clearTimeout(timer));
    req.once("response", (response) => {
      const chunks = [];
      let size = 0;
      response.on("data", (chunk) => {
        size += chunk.byteLength;
        if (size > responseLimit) req.destroy(new Error("HTTP response exceeded its byte limit."));
        else chunks.push(chunk);
      });
      response.once("error", reject);
      response.once("end", () => fulfill({
        status: response.statusCode,
        headers: response.headers,
        text: Buffer.concat(chunks).toString("utf8")
      }));
    });
    if (bytes) {
      // write() before end() makes the runtime receive chunked framing when
      // Content-Length is omitted, independently of client Fetch buffering.
      if (chunked) {
        req.write(bytes.subarray(0, Math.floor(bytes.length / 2)));
        req.end(bytes.subarray(Math.floor(bytes.length / 2)));
      } else req.end(bytes);
    } else req.end();
  });
}

function checkHeaders(response) {
  assert.match(response.headers["content-type"], /^application\/json;\s*charset=utf-8$/i);
  assert.equal(response.headers["cache-control"], "no-store");
  assert.equal(response.headers["x-content-type-options"], "nosniff");
}

function checkChart(payload, input, engineVersion) {
  assert.deepEqual(Object.keys(payload).sort(), ["ok", "result"]);
  assert.equal(payload.ok, true);
  const chart = payload.result;
  assert.equal(chart.engineVersion, engineVersion);
  assert.equal(chart.input.utc, new Date(input.utc).toISOString());
  assert.equal(chart.input.timeKnown, input.timeKnown ?? true);
  assert.equal(chart.input.houseSystem, input.houseSystem ?? "whole");
  assert.equal(chart.timeScale.input, input.timeScale ?? "utc");
  assert(Number.isFinite(chart.deltaT.seconds));
  assert(Array.isArray(chart.flags));
  assert(Array.isArray(chart.aspects));
  assert(Array.isArray(chart.bodies) && chart.bodies.length === 12);
  assert.equal(new Set(chart.bodies.map(({ body }) => body)).size, 12);
  for (const row of chart.bodies) {
    assert.equal(typeof row.body, "string");
    assert(Number.isFinite(row.lon) && row.lon >= 0 && row.lon < 360);
    assert(Number.isFinite(row.lat) && row.lat >= -90 && row.lat <= 90);
    assert(Number.isFinite(row.speed));
    assert(Number.isFinite(row.degree) && row.degree >= 0 && row.degree < 30);
    assert.equal(typeof row.retrograde, "boolean");
  }
  if (input.timeKnown === false || input.latitude === undefined) {
    assert.equal(chart.angles, null);
    assert.equal(chart.houses, null);
    if (input.timeKnown === false) assert(chart.flags.includes("no-time"));
  } else {
    for (const angle of ["asc", "mc", "dsc", "ic"]) {
      assert(Number.isFinite(chart.angles[angle]) && chart.angles[angle] >= 0 && chart.angles[angle] < 360);
    }
    assert.equal(chart.houses.system, input.latitude === 78 ? "whole" : (input.houseSystem ?? "whole"));
    assert.equal(chart.houses.cusps.length, 12);
    assert(chart.houses.cusps.every((value) => Number.isFinite(value) && value >= 0 && value < 360));
    assert.equal(chart.flags.includes("polar-fallback"), input.latitude === 78);
  }
}

async function checkHttp(server, manifest) {
  const checked = [];
  const check = async (id, options, status, verify) => {
    server.ensureAlive();
    const response = await http(options);
    server.ensureAlive();
    assert.equal(response.status, status, id);
    checkHeaders(response);
    verify(response);
    checked.push(id);
  };
  const synthetic = { utc: "2000-03-20T12:34:56Z", latitude: 35.25, longitude: -110.75 };
  const success = async (id, input, options = {}) => check(id, { body: JSON.stringify(input), ...options }, 200,
    ({ text }) => checkChart(JSON.parse(text), input, manifest.engineVersion));
  const error = async (id, options, status, code, field) => check(id, options, status, (response) => {
    const payload = JSON.parse(response.text);
    assert.deepEqual(Object.keys(payload).sort(), ["error", "ok"]);
    assert.equal(payload.ok, false);
    assert.equal(payload.error.code, code);
    assert.equal(payload.error.field, field);
    assert.equal(typeof payload.error.message, "string");
    assert(payload.error.message.length > 0);
    assert.deepEqual(Object.keys(payload.error).sort(), field === undefined ? ["code", "message"] : ["code", "field", "message"]);
    if (status === 405) assert.equal(response.headers.allow, "POST");
  });

  await success("whole", { ...synthetic, houseSystem: "whole" });
  await success("southern-placidus", { utc: "1987-08-14T03:21:00Z", latitude: -33.5, longitude: 151.25, houseSystem: "placidus" });
  await success("unknown-time", { ...synthetic, utc: "2001-02-03T08:30:00Z", timeKnown: false });
  await success("polar-fallback", { utc: "2024-12-03T07:08:09Z", latitude: 78, longitude: 16, houseSystem: "koch" });
  await success("date-only", { utc: "2000-03-20" });
  await success("explicit-offset-ut1", { ...synthetic, utc: "2000-03-20T14:34:56+02:00", timeScale: "ut1" });
  await success("tt", { ...synthetic, timeScale: "tt" });
  await success("json-charset", synthetic, { headers: { "Content-Type": 'application/json; charset="utf-8"', "Content-Encoding": "identity" } });
  await success("chunked-valid", synthetic, { chunked: true });
  const padded = JSON.stringify(synthetic).padEnd(4096, " ");
  await success("body-at-limit", synthetic, { body: padded });
  await error("unknown-route", { path: "/missing", method: "GET" }, 404, "not-found");
  await error("wrong-method", { method: "GET" }, 405, "method-not-allowed");
  await check("head", { method: "HEAD" }, 405, (response) => {
    assert.equal(response.text, "");
    assert.equal(response.headers.allow, "POST");
  });
  await error("query", { path: "/chart?input=synthetic", body: JSON.stringify(synthetic) }, 400, "invalid-request");
  await error("media-type", { body: "{}", headers: { "Content-Type": "text/plain" } }, 415, "unsupported-media-type");
  await error("encoding", { body: "{}", headers: { "Content-Encoding": "gzip" } }, 415, "unsupported-content-encoding");
  await error("malformed-json", { body: "{" }, 400, "invalid-json");
  await error("malformed-utf8", { body: Buffer.from([0xc3, 0x28]) }, 400, "invalid-json");
  await error("missing-body", {}, 400, "invalid-json");
  await error("unknown-field", { body: JSON.stringify({ ...synthetic, inventedField: "synthetic" }) }, 400, "invalid-input");
  await error("missing-coordinate", { body: JSON.stringify({ utc: synthetic.utc, latitude: 1 }) }, 400, "invalid-input", "coordinates");
  await error("latitude-range", { body: JSON.stringify({ ...synthetic, latitude: 91 }) }, 400, "invalid-input", "latitude");
  await error("unsupported-house", { body: JSON.stringify({ ...synthetic, houseSystem: "synthetic" }) }, 400, "invalid-input", "houseSystem");
  await error("invalid-date", { body: JSON.stringify({ utc: "2000-02-30T12:00:00Z" }) }, 422, "calculation-rejected");
  await error("outside-ephemeris", { body: JSON.stringify({ utc: "9999-01-01T00:00:00Z" }) }, 422, "calculation-rejected");
  await error("body-over-limit", { body: padded + " " }, 413, "body-too-large");
  await error("chunked-over-limit", { body: padded + " ", chunked: true }, 413, "body-too-large");
  await success("after-errors", synthetic);
  return checked;
}

async function main() {
  requireNode22();
  const [target, givenExecutable, ...extra] = process.argv.slice(2);
  assert(["deno", "bun"].includes(target) && extra.length === 0,
    "Usage: node edge/scripts/check-http-runtime.mjs deno|bun [executable]");
  const executable = givenExecutable?.includes("/") ? resolve(givenExecutable) : (givenExecutable ?? target);
  const { manifest } = await buildTarget(target);
  const entry = resolve(edgeRoot, ".generated", target, `${target}.mjs`);
  await mkdir(runtimeEnv.DENO_DIR, { recursive: true });
  await mkdir(runtimeEnv.BUN_RUNTIME_TRANSPILER_CACHE_PATH, { recursive: true });
  const version = (await run(executable, ["--version"])).stdout.trim();
  assert(version.length > 0, "Runtime did not report a version.");
  const flags = target === "deno"
    ? ["run", "--no-config", "--no-lock", "--no-npm", "--no-remote", "--no-prompt"]
    : ["--no-env-file", "--no-install"];
  const facts = target === "deno"
    ? '{ name: "deno", version: Deno.version.deno, v8: Deno.version.v8 }'
    : '{ name: "bun", version: Bun.version, revision: Bun.revision }';
  const probe = `import { handleRequest } from ${JSON.stringify(pathToFileURL(entry).href)};\n`
    + `if (typeof handleRequest !== "function") throw new Error("Missing handleRequest export");\n`
    + `console.log(JSON.stringify(${facts}));\n`;
  // Importing the bundle must exit naturally. Deno gets no network permission.
  const imported = await run(executable, target === "deno" ? [...flags, "-"] : [...flags, "--eval", probe],
    target === "deno" ? { input: probe } : undefined);
  const runtime = JSON.parse(imported.stdout.trim());
  assert.equal(runtime.name, target);
  assert.equal(typeof runtime.version, "string");
  const server = launch(executable,
    [...flags, ...(target === "deno" ? ["--allow-net=127.0.0.1:8787"] : []), entry],
    { timeoutMs: 60_000 });
  let checkedCases;
  let stopped;
  try {
    // Only this child's marker authorizes HTTP checks. A pre-existing service
    // cannot make a failed bind look like a successful native runtime check.
    await server.ready();
    checkedCases = await checkHttp(server, manifest);
  } finally {
    server.stop();
    stopped = await server.done;
  }
  if (interrupted) throw interrupted;
  if (stopped.failure) throw stopped.failure;
  assert(stopped.code === 0 || (stopped.code === null && ["SIGTERM", "SIGKILL"].includes(stopped.signal)),
    `Runtime server failed during shutdown (${stopped.code ?? stopped.signal}). ${stopped.stderr.trim()}`);
  console.log(JSON.stringify({
    schema: "edge-http-runtime/1",
    passed: true,
    node: process.version,
    runtime,
    versionOutput: version.split(/\r?\n/),
    engineVersion: manifest.engineVersion,
    sourceDigest: manifest.sourceDigest,
    output: manifest.outputs.find(({ path }) => path === `${target}.mjs`),
    importWithoutListener: true,
    checkedCases,
    scope: "Native HTTP contract and JSON structure; no exact cross-runtime comparison."
  }, null, 2));
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    interrupted = new Error(`HTTP runtime check interrupted by ${signal}.`);
    for (const stop of activeChildren) stop();
  });
}

try {
  await main();
} catch (error) {
  console.error(`HTTP runtime check failed: ${error.message}`);
  process.exitCode = 1;
}
