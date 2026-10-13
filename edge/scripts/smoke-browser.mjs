import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, mkdir, mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { constants } from "node:fs";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { build } from "esbuild";
import { buildTarget } from "./build-bundles.mjs";
import { edgeRoot, requireNode22 } from "./build-support.mjs";
import { runRuntimeProcess } from "./runtime-process.mjs";

export const BROWSER_PATHS = Object.freeze(["/", "/engine.mjs", "/workloads.mjs", "/exact.mjs"]);
const limit = 1_999_999;
const failure = (code, message) => Object.assign(new Error(message), { code });

// Only captured bundle bytes are served. No URL is resolved against disk.
export async function startBrowserServer({ engine, workloads, exact }) {
  const assets = new Map([
    ["/", { type: "text/html", body: '<!doctype html><meta charset="utf-8"><link rel="icon" href="data:,"><title>Edge ESM smoke</title>' }],
    ["/engine.mjs", { type: "text/javascript", body: engine }],
    ["/workloads.mjs", { type: "text/javascript", body: workloads }],
    ["/exact.mjs", { type: "text/javascript", body: exact }]
  ]);
  for (const { body } of assets.values()) {
    assert(typeof body === "string" && Buffer.byteLength(body) < limit, "Invalid browser asset.");
  }
  const requests = [];
  const server = createServer((request, response) => {
    if (requests.length < 100) requests.push({ method: request.method, path: request.url?.slice(0, 200) });
    const asset = assets.get(request.url);
    if (request.method !== "GET" || !asset) {
      response.writeHead(404, { "content-type": "text/plain", "connection": "close" });
      response.end("Not found");
      return;
    }
    response.writeHead(200, {
      "content-type": `${asset.type}; charset=utf-8`, "cache-control": "no-store",
      "x-content-type-options": "nosniff", "connection": "close"
    });
    response.end(asset.body);
  });
  server.requestTimeout = 5_000;
  server.headersTimeout = 5_000;
  await new Promise((fulfill, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", fulfill);
  });
  return {
    origin: `http://127.0.0.1:${server.address().port}`, requests,
    close: () => new Promise((fulfill, reject) => {
      server.close((error) => error ? reject(error) : fulfill());
      server.closeAllConnections();
    })
  };
}

export function browserRequestPolicy(origin) {
  assert.match(origin, /^http:\/\/127\.0\.0\.1:\d+$/);
  const remaining = new Set(BROWSER_PATHS);
  let bootstrap = true;
  return {
    allow(url, method, resourceType) {
      let parsed;
      try { parsed = new URL(url); } catch { return false; }
      const expectedType = parsed.pathname === "/" ? "document" : "script";
      if (!bootstrap || method !== "GET" || parsed.origin !== origin || parsed.search || parsed.hash
        || parsed.username || parsed.password || url !== origin + parsed.pathname
        || resourceType !== expectedType || !remaining.has(parsed.pathname)) return false;
      remaining.delete(parsed.pathname);
      return true;
    },
    finish() {
      assert.equal(remaining.size, 0, "Browser did not import all required local ESM modules.");
      bootstrap = false;
    }
  };
}

// Controlled modules let failure tests exercise the same browser driver as the
// real smoke, without changing the engine or the generated browser bundles.
export async function checkBrowserModules({ engine, workloads, executable, signal, timeoutMs = 30_000 }) {
  requireNode22();
  if (signal?.aborted) throw failure("interrupted", "Browser smoke interrupted.");
  if (typeof executable !== "string" || !executable) throw failure("missing-runtime", "Specify a Chromium executable with --browser.");
  try { await access(executable, constants.X_OK); }
  catch { throw failure("missing-runtime", "Chromium executable is missing or is not executable."); }
  const [manifest, lock, installed] = await Promise.all([
    "package.json", "package-lock.json", "node_modules/playwright-core/package.json"
  ].map(async (path) => JSON.parse(await readFile(resolve(edgeRoot, path), "utf8"))));
  const version = installed.version;
  assert.equal(manifest.devDependencies["playwright-core"], version, "Installed Playwright differs from its exact pin.");
  assert.equal(lock.packages[""].devDependencies["playwright-core"], version, "Stale Playwright lockfile pin.");
  assert.equal(lock.packages["node_modules/playwright-core"].version, version, "Stale Playwright lockfile entry.");
  const protocol = await build({
    absWorkingDir: edgeRoot, entryPoints: ["src/exact.ts"], bundle: true,
    format: "esm", target: "es2022", platform: "browser", write: false, logLevel: "silent"
  });
  assert.equal(protocol.warnings.length, 0);
  const exact = Buffer.from(protocol.outputFiles[0].contents).toString("utf8");
  for (const source of [engine, workloads, exact]) assert(typeof source === "string" && Buffer.byteLength(source) < limit, "Invalid browser module.");
  const cacheRoot = resolve(edgeRoot, ".cache/browser");
  let ancestor = cacheRoot;
  while (true) {
    try {
      assert.equal(await realpath(ancestor), ancestor, "Browser cache must not use symlink ancestors.");
      break;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      ancestor = resolve(ancestor, "..");
    }
  }
  await mkdir(cacheRoot, { recursive: true });
  const temporary = await mkdtemp(resolve(cacheRoot, "run-"));
  try {
    const input = JSON.stringify({ engine, workloads, exact, executable });
    assert(Buffer.byteLength(input) < limit, "Browser driver input exceeds its byte limit.");
    const processResult = await runRuntimeProcess(process.execPath, ["scripts/browser-driver.mjs"], {
      input, signal, timeoutMs, tempDirectory: temporary
    });
    const output = JSON.parse(processResult.stdout);
    assert.equal(JSON.stringify(output) + "\n", processResult.stdout, "Expected one canonical browser report line.");
    assert.deepEqual(Object.keys(output).sort(), ["exact", "report"]);
    assert.equal(output.report.runtime.name, "browser");
    assert.equal(output.report.repeatable, true);
    const validator = await import(`data:text/javascript;base64,${Buffer.from(exact).toString("base64")}`);
    validator.parseExact(output.exact);
    output.report.toolchain = { playwright: version };
    output.report.protocolBuild = {
      path: "exact.mjs", bytes: Buffer.byteLength(exact), sha256: createHash("sha256").update(exact).digest("hex")
    };
    return output;
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

export async function runBrowserSmoke({ executable, signal } = {}) {
  const { files, manifest, metafile } = await buildTarget("browser", { write: false });
  const output = await checkBrowserModules({
    executable, signal,
    engine: files.get("engine.mjs").toString("utf8"),
    workloads: files.get("workloads.mjs").toString("utf8")
  });
  assert.deepEqual(output.report.engineExports, [...metafile.outputs[".generated/browser/engine.mjs"].exports].sort(),
    "Browser engine export names differ from the built public entry point.");
  output.report.build = {
    target: "browser", sourceDigest: manifest.sourceDigest,
    outputs: manifest.outputs.filter(({ path }) => path === "engine.mjs" || path === "workloads.mjs")
  };
  return output;
}
