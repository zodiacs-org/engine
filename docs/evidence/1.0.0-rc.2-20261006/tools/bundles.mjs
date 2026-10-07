// Bundles six small programs against each package given, as a consumer's
// bundler would: esbuild (the engine's own, from its node_modules), ESM for
// the browser, minified, with astronomy-engine from the engine's
// node_modules. Prints, for each program and package, the bundle's bytes,
// its bytes gzipped at level 9, its Object.freeze calls, and which of five
// things it holds: the tables ELEMENTS and MODALITIES, and createAspectPolicy,
// which builds the default aspect policy when the root loads, none of which
// any program reads; and the time-scale tables UT1_DATA and
// LEAP_SECOND_LIST, which the programs that compute a chart read and
// outsideReferenceSpan does not.
//
//   node bundles.mjs <engine checkout> <label>=<package directory> ...
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { gzipSync } from "node:zlib";

const [checkout, ...packages] = process.argv.slice(2);
if (!checkout || packages.length === 0) {
  console.error("usage: node bundles.mjs <engine checkout> <label>=<package directory> ...");
  process.exit(2);
}
const esbuild = createRequire(join(resolve(checkout), "package.json"))("esbuild");
const astronomy = join(resolve(checkout), "node_modules/astronomy-engine/esm/astronomy.js");

const PROGRAMS = {
  "normalizeLongitude (root)": 'import { normalizeLongitude } from "@zodiacs/engine"; console.log(normalizeLongitude(370));',
  "signForLongitude (root)": 'import { signForLongitude } from "@zodiacs/engine"; console.log(signForLongitude(100).slug);',
  "natalChart (root)": 'import { natalChart } from "@zodiacs/engine"; console.log(natalChart({ date: new Date(Date.UTC(1990, 0, 1, 12)), latitude: 51.5, longitude: 0 }).bodies.length);',
  "computeChart (./internal)": 'import { computeChart } from "@zodiacs/engine/internal"; console.log(computeChart({ date: new Date(Date.UTC(1990, 0, 1, 12)), latitude: 51.5, longitude: 0, houseSystem: "placidus" }).bodies.length);',
  "createNatalEnvelope (./receipt)": 'import { createNatalEnvelope } from "@zodiacs/engine/receipt"; console.log(typeof createNatalEnvelope);',
  "outsideReferenceSpan (root)": 'import { outsideReferenceSpan } from "@zodiacs/engine"; console.log(outsideReferenceSpan(new Date(Date.UTC(1990, 0, 1))));'
};
// The five, as esbuild writes them minified: two tables, a message only
// createAspectPolicy's code holds, and a string each time-scale table holds.
const MARKERS = {
  ELEMENTS: '["fire","earth","air","water"]',
  MODALITIES: '["cardinal","fixed","mutable"]',
  createAspectPolicy: "Aspect type must be a lowercase identifier",
  UT1_DATA: "IERS finals2000A.all",
  LEAP_SECOND_LIST: "IERS leap-seconds.list"
};

for (const [name, source] of Object.entries(PROGRAMS)) {
  for (const entry of packages) {
    const [label, directory] = entry.split("=");
    const root = resolve(directory);
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    const result = await esbuild.build({
      stdin: { contents: source, resolveDir: root, loader: "js" },
      bundle: true, format: "esm", platform: "browser", minify: true, write: false, logLevel: "silent",
      plugins: [{
        name: "package",
        setup(build) {
          build.onResolve({ filter: /^astronomy-engine$/ }, () => ({ path: astronomy }));
          build.onResolve({ filter: /^@zodiacs\/engine(?:\/.*)?$/ }, ({ path }) => {
            const key = path === "@zodiacs/engine" ? "." : `.${path.slice("@zodiacs/engine".length)}`;
            return { path: join(root, pkg.exports[key].import) };
          });
        }
      }]
    });
    const code = result.outputFiles[0].contents;
    const text = Buffer.from(code).toString("utf8");
    const held = Object.entries(MARKERS).filter(([, marker]) => text.includes(marker)).map(([table]) => table);
    console.log(JSON.stringify({
      program: name, package: label, version: pkg.version,
      bytes: code.length, gzip: gzipSync(code, { level: 9 }).length,
      freezeCalls: (text.match(/Object\.freeze\(/g) ?? []).length,
      held
    }));
  }
}
