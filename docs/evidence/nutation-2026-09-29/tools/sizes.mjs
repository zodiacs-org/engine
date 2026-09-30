/*
 * What the full nutation adds to the build, for rc.15 as carried and this
 * tree's build (after `npm run build`):
 *
 * - the main chunk, the one holding src/ephemeris.ts (and now src/nutation.ts
 *   and src/frame.ts): its bytes and gzip -9, and the same minified by
 *   esbuild, as a site's bundler would ship it;
 * - each entry point's import graph, as scripts/verify-package-contents.mjs
 *   measures it for its budgets (its file and every chunk it imports
 *   statically, astronomy-engine not counted), beside those budgets;
 * - `./internal`, the entry the Zodiacs site imports for its engine chunk,
 *   bundled by esbuild and minified, with astronomy-engine bundled and
 *   tree-shaken and without it, gzip -9;
 * - a stand-in for the Zodiacs site's engine chunk (below), for rc.14 as
 *   carried as well, since the site recorded that chunk's size on rc.14.
 *
 *   npm run build
 *   node docs/evidence/nutation-2026-09-29/tools/sizes.mjs > results/sizes.json
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";

import { BUILD, ROOT, unpackRc15 } from "./engines.mjs";

const { build, transform, version } = await import(pathToFileURL(join(ROOT, "node_modules/esbuild/lib/main.js")).href);
const { rollup, VERSION: rollupVersion } = await import(pathToFileURL(join(ROOT, "node_modules/rollup/dist/es/rollup.js")).href);
const gzip = (bytes) => gzipSync(bytes, { level: 9 }).length;

/*
 * The site's budget "engine-chunk" (its scripts/report-bundles.mjs) is the
 * gzip -9 size of its full.*.js chunk and the chunks that chunk imports
 * statically. That chunk is the site's src/lib/engine/full.ts, which imports
 * these four functions from @zodiacs/engine/internal (site commit a9d3d9e8,
 * the rc.14 adoption record), with their closure and astronomy-engine's,
 * built by Vite 6.4.3: Rollup 4 with each package's `"sideEffects": false`,
 * then esbuild's minifier at Vite's default target. The stand-in does the
 * same with this checkout's Rollup and esbuild, less Safari 14 in the target
 * (this esbuild declines to lower astronomy-engine's destructuring for it).
 * It leaves out the site's adapter (full.ts, chart-adapter.ts), the same for
 * every engine, so its bytes are not the site's; its differences between
 * engines are the estimate. The site recorded 27,303 bytes on rc.14 against
 * its limit of 27 KiB (docs/platform/evidence/site-engine-rc14/
 * validation.json there).
 */
const SITE = {
  imports: ["bodyLongitude", "computeBodies", "computeChart", "longitudeSpeed"],
  target: ["es2020", "edge88", "firefox78", "chrome87"],
  recordedRc14: 27_303,
  limit: 27_648
};

async function siteChunk(dist) {
  const entry = "\0site-engine-chunk";
  const bundle = await rollup({
    input: entry,
    onwarn: (warning) => {
      throw new Error(`rollup: ${warning.message}`);
    },
    plugins: [{
      name: "site-resolve",
      resolveId(source, importer) {
        if (source === entry) return entry;
        if (source === "astronomy-engine") return { id: join(ROOT, "node_modules/astronomy-engine/esm/astronomy.js"), moduleSideEffects: false };
        if (source.startsWith(".")) return { id: resolve(importer === entry ? dist : dirname(importer), source), moduleSideEffects: false };
        throw new Error(`unresolved import ${source}`);
      },
      load: (id) => (id === entry ? `export { ${SITE.imports.join(", ")} } from "./internal.js";\n` : null)
    }]
  });
  const { output } = await bundle.generate({ format: "es" });
  await bundle.close();
  if (output.length !== 1) throw new Error(`expected one chunk, got ${output.length}`);
  const { code } = await transform(output[0].code, { loader: "js", format: "esm", minify: true, target: SITE.target, charset: "utf8" });
  return { bytes: Buffer.byteLength(code), gzip9: gzip(code) };
}

/** rc.14 as carried, checked against its receipt and unpacked under TMPDIR. */
function unpackRc14() {
  const archive = join(ROOT, "artifacts/zodiacs-engine-0.1.1-rc.14.tgz");
  const sha256 = createHash("sha256").update(readFileSync(archive)).digest("hex");
  if (sha256 !== readFileSync(archive.replace(/\.tgz$/, ".sha256"), "utf8").split(/\s+/)[0]) {
    throw new Error("the rc.14 archive does not match its receipt");
  }
  const scratch = mkdtempSync(join(tmpdir(), "nutation-rc14-"));
  if (spawnSync("tar", ["-xzf", archive, "-C", scratch], { stdio: "inherit" }).status !== 0) throw new Error("tar failed");
  return { dist: join(scratch, "package/dist"), sha256, cleanup: () => rmSync(scratch, { recursive: true, force: true }) };
}

function graph(dist, entry) {
  const sizes = new Map();
  const visit = (file) => {
    if (sizes.has(file)) return;
    const code = readFileSync(join(dist, file), "utf8");
    sizes.set(file, Buffer.byteLength(code));
    for (const match of code.matchAll(/^(?:import|export)\s[^;]*?\bfrom\s*["']([^"']+)["']|^import\s*["']([^"']+)["']/gmu)) {
      const specifier = match[1] ?? match[2];
      if (specifier !== "astronomy-engine") visit(specifier.slice(2));
    }
  };
  visit(entry);
  return [...sizes.values()].reduce((sum, size) => sum + size, 0);
}

async function measure(dist) {
  const main = readdirSync(dist).find((file) => file.startsWith("chunk-") && readFileSync(join(dist, file), "utf8").includes("function gastHours"));
  const source = readFileSync(join(dist, main));
  const minified = (await build({ stdin: { contents: source.toString(), loader: "js" }, minify: true, write: false, format: "esm", logLevel: "silent" })).outputFiles[0].contents;
  const bundled = async (external) => {
    const result = await build({
      entryPoints: [join(dist, "internal.js")], bundle: true, minify: true, format: "esm", write: false, logLevel: "silent",
      external: external ? ["astronomy-engine"] : [], nodePaths: [join(ROOT, "node_modules")]
    });
    const code = result.outputFiles[0].contents;
    return { bytes: code.length, gzip9: gzip(code) };
  };
  const entries = { ".": "index.js", "./internal": "internal.js", "./internal/math": "internal-math.js", "./timing": "timing.js", "./vedic": "vedic.js", "./receipt": "receipt.js", "./crossings": "crossings.js", "./deltat": "deltat.js", "./geo": "geo.js" };
  return {
    mainChunk: { bytes: source.length, gzip9: gzip(source), minifiedBytes: minified.length, minifiedGzip9: gzip(minified) },
    importGraphs: Object.fromEntries(Object.entries(entries).map(([name, file]) => [name, graph(dist, file)])),
    internalBundled: { withAstronomyEngine: await bundled(false), astronomyEngineExternal: await bundled(true) }
  };
}

const rc15 = unpackRc15();
const rc14 = unpackRc14();
try {
  const before = await measure(rc15.dist);
  const after = await measure(BUILD);
  const site = { rc14: await siteChunk(rc14.dist), rc15: await siteChunk(rc15.dist), build: await siteChunk(BUILD) };
  const estimate = SITE.recordedRc14 + site.build.gzip9 - site.rc14.gzip9;
  const budgets = Object.fromEntries(
    [...readFileSync(join(ROOT, "scripts/verify-package-contents.mjs"), "utf8").matchAll(/^\s+"(\.[^"]*)": ([\d_]+),?/gmu)]
      .map(([, name, value]) => [name, Number(value.replaceAll("_", ""))])
  );
  const growth = (a, b) => (typeof a === "number" ? b - a : Object.fromEntries(Object.keys(a).map((key) => [key, growth(a[key], b[key])])));
  process.stdout.write(`${JSON.stringify({
    node: process.version,
    esbuild: version,
    rc15Archive: rc15.sha256,
    unit: "bytes",
    rc15: before,
    build: after,
    growth: growth(before, after),
    packageBudgets: budgets,
    overBudget: Object.fromEntries(Object.entries(after.importGraphs).filter(([name, bytes]) => bytes > budgets[name]).map(([name, bytes]) => [name, bytes - budgets[name]])),
    siteEngineChunkStandIn: {
      rollup: rollupVersion,
      imports: SITE.imports,
      target: SITE.target,
      rc14Archive: rc14.sha256,
      ...site,
      gzip9Growth: { rc14ToRc15: site.rc15.gzip9 - site.rc14.gzip9, rc15ToBuild: site.build.gzip9 - site.rc15.gzip9 },
      siteRecordedRc14: SITE.recordedRc14,
      siteLimit: SITE.limit,
      estimateForThisBuild: estimate,
      estimateOverLimit: estimate - SITE.limit
    }
  }, null, 1)}\n`);
} finally {
  rc15.cleanup();
  rc14.cleanup();
}
