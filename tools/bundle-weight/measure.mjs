// What a packed @zodiacs/engine archive costs a browser bundle.
//
// Extends docs/evidence/1.0.0-rc.2-20261006/tools/bundles.mjs (esbuild, bytes
// and gzip) and bundler-probe.mjs (Rollup and Vite) beside it: the same idea,
// bundling small programs against the package as a consumer installs it, now
// against a packed archive, with webpack added, brotli added, every output
// file measured, and an optional browser timing step.
//
// For each archive given it:
//   1. extracts the archive into node_modules/@zodiacs/engine of a new
//      temporary project outside the checkout, beside this folder's pinned
//      astronomy-engine, so that every bundle is made from what a user gets;
//   2. finds the archive's DE440 pack chunk (the dist file holding a run of
//      base64 longer than 1,000,000 characters) and measures it;
//   3. bundles each app in apps/ with esbuild, Rollup (node-resolve and
//      terser), Vite and webpack, all in production mode and minified, ES
//      module output, code splitting on;
//   4. measures every JavaScript output file: raw bytes (the file's length,
//      as `wc -c` counts it), `gzip -9` bytes (the gzip program, `-9 -n`)
//      and brotli quality 11 bytes (the brotli program if it is on PATH,
//      otherwise Node's zlib at quality 11 with a 24-bit window, which is the
//      brotli program's default window; results.json says which);
//   5. runs each bundle once in Node, to show it computes (and on what);
//   6. times a cold `import()` of the root in Node, ten times;
//   7. with --browser, loads each bundle in Chromium through Playwright with
//      4x CPU throttling and DevTools' "Fast 4G" network emulation, cold
//      cache, ten times, and records time to first chart and script
//      evaluation time. Without --browser those fields say they were not
//      measured, and why.
//
//   node measure.mjs --archive <label>=<path.tgz> [--archive ...] --out <dir>
//     [--apps a,b,c,d,e,a-namespace,a-core] [--bundlers esbuild,rollup,vite,webpack]
//     [--node-runs 10] [--browser <chromium executable>] [--browser-runs 10]
//     [--no-browser-reason <text>] [--json results.json]
//
// An app an archive cannot build (an entry it does not have, a function it
// does not export) is recorded with the bundler's error, not dropped.
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { cpus, tmpdir } from "node:os";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { brotliCompressSync, constants as zlib, gzipSync } from "node:zlib";

const HERE = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// ---------------------------------------------------------------- arguments
function argList(name) {
  const values = [];
  for (let i = 2; i < process.argv.length; i += 1) if (process.argv[i] === `--${name}`) values.push(process.argv[i + 1]);
  return values;
}
const arg = (name, fallback) => argList(name).at(-1) ?? fallback;
const archives = argList("archive").map((entry) => {
  const at = entry.indexOf("=");
  return at === -1 ? { label: basename(entry, ".tgz"), path: resolve(entry) } : { label: entry.slice(0, at), path: resolve(entry.slice(at + 1)) };
});
const outDir = arg("out");
if (archives.length === 0 || !outDir) {
  console.error("usage: node measure.mjs --archive <label>=<path.tgz> [--archive ...] --out <dir> [--apps ...] [--bundlers ...] [--node-runs 10] [--browser <chromium>] [--browser-runs 10]");
  process.exit(2);
}
const APPS = {
  a: "a-root.js",
  b: "b-root-astronomy-engine.js",
  c: "c-lite.js",
  d: "d-time.js",
  e: "e-dynamic.js",
  "a-namespace": "a-namespace.js",
  "a-core": "a-core.js"
};
const apps = arg("apps", Object.keys(APPS).join(",")).split(",");
for (const app of apps) if (!APPS[app]) throw new Error(`unknown app ${app}`);
const bundlerNames = arg("bundlers", "esbuild,rollup,vite,webpack").split(",");
const nodeRuns = Number(arg("node-runs", "10"));
const browserExecutable = arg("browser");
const browserRuns = Number(arg("browser-runs", "10"));
const noBrowserReason = arg("no-browser-reason", "no --browser executable was given");
const jsonName = arg("json", "results.json");

// ------------------------------------------------------------- compression
const which = (program) => spawnSync("sh", ["-c", `command -v ${program}`], { encoding: "utf8" }).stdout.trim();
const GZIP = which("gzip");
const BROTLI = which("brotli");
const gzipTool = GZIP
  ? `${execFileSync(GZIP, ["--version"], { encoding: "utf8" }).split("\n")[0]} (gzip -9 -n)`
  : `Node ${process.version} zlib gzip level 9 (no gzip program on PATH)`;
const brotliTool = BROTLI
  ? `${execFileSync(BROTLI, ["--version"], { encoding: "utf8" }).trim()} (brotli -q 11)`
  : `Node ${process.version} zlib brotli, quality 11, window 24 bits, size hint set (no brotli program on PATH)`;
function gzipBytes(buffer) {
  if (!GZIP) return gzipSync(buffer, { level: 9 }).length;
  const run = spawnSync(GZIP, ["-9", "-c", "-n"], { input: buffer, maxBuffer: 1 << 30 });
  if (run.status !== 0) throw new Error(`gzip failed: ${run.stderr}`);
  return run.stdout.length;
}
function brotliBytes(buffer) {
  if (BROTLI) {
    const run = spawnSync(BROTLI, ["-q", "11", "-c"], { input: buffer, maxBuffer: 1 << 30 });
    if (run.status !== 0) throw new Error(`brotli failed: ${run.stderr}`);
    return run.stdout.length;
  }
  return brotliCompressSync(buffer, {
    params: {
      [zlib.BROTLI_PARAM_QUALITY]: 11,
      [zlib.BROTLI_PARAM_LGWIN]: 24,
      [zlib.BROTLI_PARAM_MODE]: zlib.BROTLI_MODE_GENERIC,
      [zlib.BROTLI_PARAM_SIZE_HINT]: buffer.length
    }
  }).length;
}
/** The longest run of base64 characters in a text: the pack is one such run of over 3,000,000. */
function longestBase64Run(text) {
  let best = 0;
  for (const match of text.matchAll(/[A-Za-z0-9+/]{100000,}={0,2}/g)) best = Math.max(best, match[0].length);
  return best;
}
const PACK_RUN = 1_000_000;
function measureFile(path) {
  const buffer = readFileSync(path);
  return {
    raw: buffer.length,
    gzip: gzipBytes(buffer),
    brotli: brotliBytes(buffer),
    holdsPack: longestBase64Run(buffer.toString("latin1")) >= PACK_RUN
  };
}
/** The first lines of an error, each cut to 300 characters (a minified bundle's line can be megabytes). */
const shortError = (text) => String(text).replace(/\u001b\[[0-9;]*m/g, "").split("\n").filter((line) => line.trim()).slice(0, 4).map((line) => line.slice(0, 300)).join(" | ");
const sha256 = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
const median = (values) => {
  const sorted = [...values].sort((x, y) => x - y);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
const summary = (samples) => ({
  samples: samples.length,
  median: Number(median(samples).toFixed(2)),
  min: Number(Math.min(...samples).toFixed(2)),
  max: Number(Math.max(...samples).toFixed(2)),
  all: samples.map((value) => Number(value.toFixed(2)))
});

// ----------------------------------------------------------------- bundlers
const esbuild = require("esbuild");
const { rollup, VERSION: rollupVersion } = await import("rollup");
const { nodeResolve } = await import("@rollup/plugin-node-resolve");
const terser = (await import("@rollup/plugin-terser")).default;
const vite = await import("vite");
const webpack = require("webpack");
const versionOf = (name) => JSON.parse(readFileSync(join(HERE, "node_modules", name, "package.json"), "utf8")).version;
const TOOLS = {
  node: process.version,
  machine: `${process.platform} ${process.arch}, ${cpus().length} x ${cpus()[0]?.model ?? "unknown CPU"}`,
  esbuild: esbuild.version,
  rollup: rollupVersion,
  "@rollup/plugin-node-resolve": versionOf("@rollup/plugin-node-resolve"),
  "@rollup/plugin-terser": versionOf("@rollup/plugin-terser"),
  vite: vite.version,
  webpack: webpack.version,
  "playwright-core": versionOf("playwright-core"),
  "astronomy-engine": versionOf("astronomy-engine"),
  gzip: gzipTool,
  brotli: brotliTool
};

/** Each returns { entry, files } with paths relative to `out`, the entry being the file a page loads first. */
const BUNDLERS = {
  async esbuild({ dir: project, packFile }, app, out) {
    const result = await esbuild.build({
      absWorkingDir: project,
      entryPoints: { [app]: join(project, "src", APPS[app]) },
      bundle: true, splitting: true, format: "esm", platform: "browser", target: "es2022",
      minify: true, metafile: true, outdir: out, entryNames: "[name]", chunkNames: "chunk-[hash]",
      logLevel: "silent"
    });
    const packInOutput = {};
    for (const [file, output] of Object.entries(result.metafile.outputs)) {
      for (const [input, detail] of Object.entries(output.inputs)) {
        if (packFile && input.endsWith(`node_modules/@zodiacs/engine/dist/${packFile}`)) {
          packInOutput[relative(out, resolve(project, file))] = detail.bytesInOutput;
        }
      }
    }
    return { entry: `${app}.js`, packInOutput };
  },
  async rollup({ dir: project }, app, out) {
    const bundle = await rollup({
      input: { [app]: join(project, "src", APPS[app]) },
      plugins: [nodeResolve({ browser: true, rootDir: project }), terser()],
      // Rollup leaves an import it cannot resolve as an external one, with
      // only a warning; here that is a failure to build, as it is for the others.
      onwarn(warning) {
        if (warning.code === "UNRESOLVED_IMPORT" || warning.code === "MISSING_EXPORT") throw new Error(warning.message);
      }
    });
    await bundle.write({ dir: out, format: "es", entryFileNames: "[name].js", chunkFileNames: "chunk-[hash].js" });
    await bundle.close();
    return { entry: `${app}.js` };
  },
  async vite({ dir: project }, app, out) {
    const html = join(project, "src", `${app}.html`);
    writeFileSync(html, `<!doctype html><html><head><meta charset="utf-8"><title>${app}</title></head><body><script type="module" src="./${APPS[app]}"></script></body></html>\n`);
    const result = await vite.build({
      configFile: false, root: join(project, "src"), publicDir: false, logLevel: "silent", mode: "production",
      build: {
        outDir: out, emptyOutDir: true, minify: true, target: "es2022", modulePreload: { polyfill: false },
        chunkSizeWarningLimit: 100_000, reportCompressedSize: false,
        rolldownOptions: { input: html }
      }
    });
    const outputs = (Array.isArray(result) ? result : [result]).flatMap((output) => output.output);
    const entry = outputs.find((chunk) => chunk.type === "chunk" && chunk.isEntry);
    return { entry: entry.fileName, html: `${app}.html` };
  },
  async webpack({ dir: project }, app, out) {
    const compiler = webpack({
      mode: "production", context: join(project, "src"), devtool: false,
      entry: { [app]: `./${APPS[app]}` },
      target: ["web", "es2022"],
      experiments: { outputModule: true },
      output: { path: out, filename: "[name].js", chunkFilename: "chunk-[contenthash].js", module: true, clean: true },
      resolve: { modules: [join(project, "node_modules")] },
      performance: { hints: false },
      infrastructureLogging: { level: "none" }
    });
    const stats = await new Promise((done, fail) => compiler.run((error, value) => (error ? fail(error) : done(value))));
    await new Promise((done) => compiler.close(done));
    if (stats.hasErrors()) throw new Error(stats.toJson({ all: false, errors: true }).errors.map((e) => e.message).join("\n"));
    return { entry: `${app}.js` };
  }
};
for (const name of bundlerNames) if (!BUNDLERS[name]) throw new Error(`unknown bundler ${name}`);

function listJs(directory) {
  const found = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if ([".js", ".mjs"].includes(extname(name))) found.push(relative(directory, path));
    }
  };
  walk(directory);
  return found.sort();
}

/** Runs a built bundle once in Node (no document) and returns what it reported. */
function runInNode(file) {
  const script = `await import(${JSON.stringify(pathToFileURL(file).href)}); process.stdout.write(JSON.stringify(globalThis.__bundleWeight ?? null));`;
  const run = spawnSync(process.execPath, ["--input-type=module", "-e", script], { encoding: "utf8", timeout: 120_000 });
  if (run.status !== 0) return { ran: false, error: shortError(run.stderr || run.error || "") };
  return { ran: true, reported: JSON.parse(run.stdout).value };
}

// ------------------------------------------------------------ node import
function nodeImport(project, specifier) {
  const script = [
    "const t0 = performance.now();",
    `const m = await import(${JSON.stringify(specifier)});`,
    "const t1 = performance.now();",
    "let chart = null;",
    "if (typeof m.natalChart === 'function') chart = m.natalChart({ utc: '2000-01-01T12:00:00Z', latitude: 51.5, longitude: -0.1 });",
    "const t2 = performance.now();",
    "process.stdout.write(JSON.stringify({ importMs: t1 - t0, firstChartMs: chart ? t2 - t1 : null, ephemeris: chart?.ephemeris?.name ?? null }));"
  ].join("\n");
  const importMs = [];
  const firstChartMs = [];
  const processMs = [];
  let ephemeris = null;
  for (let i = 0; i < nodeRuns; i += 1) {
    const start = process.hrtime.bigint();
    const run = spawnSync(process.execPath, ["--input-type=module", "-e", script], { cwd: project, encoding: "utf8" });
    const end = process.hrtime.bigint();
    if (run.status !== 0) return { specifier, error: shortError(run.stderr) };
    const value = JSON.parse(run.stdout);
    importMs.push(value.importMs);
    if (value.firstChartMs !== null) firstChartMs.push(value.firstChartMs);
    processMs.push(Number(end - start) / 1e6);
    ephemeris = value.ephemeris;
  }
  return {
    specifier,
    command: "node --input-type=module -e \"await import(specifier); natalChart(...)\", a new process each run",
    importMs: summary(importMs),
    firstChartMs: firstChartMs.length ? summary(firstChartMs) : null,
    processMs: summary(processMs),
    ephemeris
  };
}

// ---------------------------------------------------------------- browser
// DevTools' "Fast 4G" preset as its source defines it (9 Mbit/s down and
// 1.5 Mbit/s up, each times 0.9, and 60 ms times 2.75 of latency), in the
// units Network.emulateNetworkConditions takes: bytes per second and ms.
const FAST_4G = { offline: false, latency: 60 * 2.75, downloadThroughput: (9 * 1000 * 1000) / 8 * 0.9, uploadThroughput: (1.5 * 1000 * 1000) / 8 * 0.9 };
const CPU_SLOWDOWN = 4;
const BROWSER_CONDITIONS = { cpuThrottlingRate: CPU_SLOWDOWN, network: { preset: "Fast 4G (DevTools)", ...FAST_4G }, cache: "cold: a new browser context and the cache disabled on every run" };
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8" };

function serve(root) {
  const server = createServer((request, response) => {
    const path = resolve(root, `.${decodeURIComponent(new URL(request.url, "http://x").pathname)}`);
    if (!path.startsWith(root) || !existsSync(path) || statSync(path).isDirectory()) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { "content-type": TYPES[extname(path)] ?? "application/octet-stream", "cache-control": "no-store" });
    response.end(readFileSync(path));
  });
  return new Promise((done) => server.listen(0, "127.0.0.1", () => done(server)));
}

async function browserTimings(browser, out, built, app) {
  const html = built.html ?? "__page.html";
  if (!built.html) writeFileSync(join(out, html), `<!doctype html><html><head><meta charset="utf-8"><title>${app}</title></head><body><script type="module" src="./${built.entry}"></script></body></html>\n`);
  const server = await serve(out);
  const url = `http://127.0.0.1:${server.address().port}/${html}`;
  const firstChart = [];
  const fromClick = [];
  const scriptSeconds = [];
  try {
    for (let i = 0; i < browserRuns; i += 1) {
      const context = await browser.newContext();
      const page = await context.newPage();
      const cdp = await context.newCDPSession(page);
      await cdp.send("Network.enable");
      await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
      await cdp.send("Network.emulateNetworkConditions", FAST_4G);
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU_SLOWDOWN });
      await cdp.send("Performance.enable");
      await page.goto(url, { waitUntil: "load", timeout: 300_000 });
      if (app === "e") await page.click("#draw");
      await page.waitForSelector("#result", { timeout: 300_000 });
      const marks = await page.evaluate(() => ({
        chart: performance.getEntriesByName("first-chart")[0]?.startTime ?? null,
        click: performance.getEntriesByName("click")[0]?.startTime ?? null
      }));
      const { metrics } = await cdp.send("Performance.getMetrics");
      firstChart.push(marks.chart);
      if (marks.click !== null) fromClick.push(marks.chart - marks.click);
      scriptSeconds.push(metrics.find((metric) => metric.name === "ScriptDuration").value * 1000);
      await context.close();
    }
  } finally {
    server.close();
  }
  return {
    measured: true,
    timeToFirstChartMs: summary(firstChart),
    ...(fromClick.length ? { clickToChartMs: summary(fromClick) } : {}),
    scriptEvaluationMs: summary(scriptSeconds)
  };
}

// ------------------------------------------------------------------- main
let browser = null;
if (browserExecutable) {
  const { chromium } = await import("playwright-core");
  browser = await chromium.launch({ executablePath: browserExecutable, headless: true });
  TOOLS.chromium = browser.version();
}
const notMeasured = { measured: false, reason: noBrowserReason };

const results = {
  generatedAt: new Date().toISOString(),
  tools: TOOLS,
  method: {
    apps: Object.fromEntries(apps.map((app) => [app, `apps/${APPS[app]}`])),
    bundlers: {
      esbuild: "bundle, splitting, format esm, platform browser, target es2022, minify",
      rollup: "@rollup/plugin-node-resolve (browser: true), @rollup/plugin-terser, format es",
      vite: "vite build (production mode, its default minifier), one HTML page per app as input, target es2022; production build only, dev-mode dependency pre-bundling is out of scope",
      webpack: "mode production (its default terser minifier), target web and es2022, ES module output (experiments.outputModule)"
    },
    sizes: "raw: the file's bytes; gzip: the gzip program at -9 -n; brotli: see tools.brotli. Totals add every JavaScript file the bundler wrote.",
    browser: BROWSER_CONDITIONS,
    nodeRuns,
    browserRuns
  },
  archives: []
};

for (const { label, path } of archives) {
  const project = mkdtempSync(join(tmpdir(), "bundle-weight-"));
  try {
    console.error(`[${label}] ${path}`);
    const unpack = join(project, "unpack");
    mkdirSync(unpack);
    execFileSync("tar", ["-xzf", path, "-C", unpack]);
    mkdirSync(join(project, "node_modules", "@zodiacs"), { recursive: true });
    renameSync(join(unpack, "package"), join(project, "node_modules", "@zodiacs", "engine"));
    rmSync(unpack, { recursive: true });
    cpSync(join(HERE, "node_modules", "astronomy-engine"), join(project, "node_modules", "astronomy-engine"), { recursive: true });
    writeFileSync(join(project, "package.json"), JSON.stringify({ name: "bundle-weight-app", private: true, type: "module" }) + "\n");
    cpSync(join(HERE, "apps"), join(project, "src"), { recursive: true });
    const pkg = JSON.parse(readFileSync(join(project, "node_modules/@zodiacs/engine/package.json"), "utf8"));
    const dist = join(project, "node_modules/@zodiacs/engine/dist");

    // The pack chunk: the dist file holding the pack's base64.
    let packChunk = null;
    for (const name of readdirSync(dist).filter((file) => file.endsWith(".js"))) {
      const text = readFileSync(join(dist, name), "latin1");
      const run = longestBase64Run(text);
      if (run >= PACK_RUN) packChunk = { file: `dist/${name}`, base64Characters: run, ...measureFile(join(dist, name)) };
    }
    const packFile = packChunk ? basename(packChunk.file) : null;
    if (packChunk) delete packChunk.holdsPack;

    const record = {
      label,
      archive: basename(path),
      sha256: sha256(path),
      bytes: statSync(path).size,
      version: pkg.version,
      astronomyEngine: { dependency: pkg.dependencies?.["astronomy-engine"] ?? null, installed: TOOLS["astronomy-engine"] },
      packChunk,
      hasCore: Boolean(pkg.exports?.["./core"]),
      apps: {},
      nodeImport: []
    };
    for (const app of apps) {
      record.apps[app] = {};
      for (const bundler of bundlerNames) {
        const out = join(project, "out", app, bundler);
        mkdirSync(out, { recursive: true });
        let built;
        try {
          built = await BUNDLERS[bundler]({ dir: project, packFile }, app, out);
        } catch (error) {
          record.apps[app][bundler] = { built: false, error: shortError(error.message ?? error) };
          console.error(`  ${app} ${bundler}: did not build`);
          continue;
        }
        const files = listJs(out).map((file) => ({ file, ...measureFile(join(out, file)) }));
        const total = files.reduce((sum, file) => ({ raw: sum.raw + file.raw, gzip: sum.gzip + file.gzip, brotli: sum.brotli + file.brotli }), { raw: 0, gzip: 0, brotli: 0 });
        const entry = files.find((file) => file.file === built.entry);
        const largest = files.reduce((big, file) => (file.raw > big.raw ? file : big), files[0]);
        const entry_ = {
          built: true,
          entry: { file: built.entry, raw: entry.raw, gzip: entry.gzip, brotli: entry.brotli, holdsPack: entry.holdsPack },
          files,
          total,
          largest: { file: largest.file, raw: largest.raw },
          holdsPack: files.some((file) => file.holdsPack),
          ...(built.packInOutput && Object.keys(built.packInOutput).length ? { packModuleBytesInOutput: built.packInOutput } : {}),
          ...(app === "e" ? { split: !entry.holdsPack && files.some((file) => file.holdsPack) ? "split: the pack is in a chunk loaded on click" : entry.holdsPack ? "not split" : "no pack" } : {}),
          node: runInNode(join(out, built.entry)),
          browser: notMeasured
        };
        if (browser) entry_.browser = await browserTimings(browser, out, built, app);
        record.apps[app][bundler] = entry_;
        console.error(`  ${app} ${bundler}: ${total.raw} raw, ${total.gzip} gzip, ${total.brotli} brotli${entry_.holdsPack ? ", holds the pack" : ""}`);
      }
    }
    const specifiers = ["@zodiacs/engine", ...(pkg.exports?.["./core"] ? ["@zodiacs/engine/core"] : [])];
    for (const specifier of specifiers) record.nodeImport.push(nodeImport(project, specifier));
    results.archives.push(record);
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
}
if (browser) await browser.close();

// ------------------------------------------------------------------ checks
// The ticket's properties and sanity checks, recorded beside the numbers.
const checks = [];
const check = (name, pass, detail) => checks.push({ name, pass, detail });
for (const archive of results.archives) {
  for (const [app, byBundler] of Object.entries(archive.apps)) {
    for (const [bundler, value] of Object.entries(byBundler)) {
      if (!value.built) continue;
      const bad = value.files.filter((file) => !(file.gzip <= file.raw && file.brotli <= file.gzip));
      check(`${archive.label} ${app} ${bundler}: brotli <= gzip <= raw for every file`, bad.length === 0, bad.map((file) => file.file));
    }
  }
  for (const app of ["c", "d"]) {
    for (const [bundler, value] of Object.entries(archive.apps[app] ?? {})) {
      if (!value.built) continue;
      check(`${archive.label} ${app} ${bundler}: no pack, largest file under 100,000 bytes raw`, !value.holdsPack && value.largest.raw < 100_000, `${value.largest.file} ${value.largest.raw}`);
    }
  }
  // An archive with @zodiacs/engine/core (ZOD-292): app (a) against it must
  // build under every bundler, carry no pack, and compute on astronomy-engine.
  if (archive.hasCore) {
    for (const bundler of Object.keys(archive.apps["a-core"] ?? {})) {
      const value = archive.apps["a-core"][bundler];
      check(`${archive.label} a-core ${bundler}: builds, holds no pack, and computes on astronomy-engine`,
        value.built && !value.holdsPack && value.node.ran && value.node.reported?.ephemeris === "astronomy-engine",
        value.built ? `${value.total.raw} raw, largest ${value.largest.file} ${value.largest.raw}, ephemeris ${value.node.reported?.ephemeris ?? value.node.error}` : value.error);
    }
  }
  const esbuildA = archive.apps.a?.esbuild;
  if (archive.packChunk && esbuildA?.packModuleBytesInOutput) {
    const inOutput = Object.values(esbuildA.packModuleBytesInOutput).reduce((sum, bytes) => sum + bytes, 0);
    const off = Math.abs(inOutput - archive.packChunk.raw) / archive.packChunk.raw;
    check(`${archive.label} a esbuild: the pack chunk's bytes in the output within 1 per cent of the archive's ${archive.packChunk.file} (${archive.packChunk.raw})`, off <= 0.01, `${inOutput} bytes, ${(off * 100).toFixed(3)} per cent off`);
  }
  if (!archive.packChunk) {
    for (const [bundler, value] of Object.entries(archive.apps.a ?? {})) {
      if (!value.built) continue;
      check(`${archive.label} a ${bundler}: an archive with no pack gives app (a) under 400,000 bytes raw`, value.total.raw < 400_000, value.total.raw);
    }
  }
}
results.checks = checks;
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, jsonName), JSON.stringify(results, null, 2) + "\n");
const failed = checks.filter((entry) => !entry.pass);
console.error(`${checks.length} checks, ${failed.length} failed${failed.length ? `: ${failed.map((entry) => entry.name).join("; ")}` : ""}`);
process.exit(failed.length ? 1 : 0);
