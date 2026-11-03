// The controls of L1, L2 and L3 (../PREREGISTRATION.md, section 3) on real
// builds, and the control build of L5. Each broken build is made with
// esbuild, the version the package's build runs, from this checkout's
// sources as they stand (read, never written: a changed module is given to
// esbuild by a plugin), into a scratch directory outside the checkout, and
// the three checks of scripts/lite-entry.mjs run on it one by one:
// checkLiteClosure (L1), checkLiteFingerprints (L3) and checkLiteModules
// (L2). This checkout's own build must pass all three, and each broken build
// must fail the check it is the control of:
//
// - L1 a: the composite part also re-exporting compositeChart, so that esbuild
//   inlines astronomy-engine (fails L3 and L2);
// - L1 b: the same, built with astronomy-engine external (fails L1);
// - L1 c: the four parts built with splitting on (fails L1);
// - L2 a: the composite part built from src/techniques/relationship.ts, whose
//   sources then include src/api.ts (fails L2);
// - L2 b: this build's lite files with their module list one byte stale
//   (fails L2);
// - L3: this build's lite files with one part's copy holding one string that
//   comes only with the ephemeris, its module list made to match (fails L3).
//
// With --l5-control <dir>, it also writes into <dir>/dist/ a lite build whose
// declination part treats the luminaries with an orb of 1.4 in place of 1.5,
// L5's control (same-answers.mjs --lite <dir> must fail).
//
//   node broken-builds.mjs [--l5-control <dir>] [--out report.json]
//
// Run it after npm run build. It reads the checkout's sources and dist/ by
// name, and writes only under its scratch directory (removed at the end) and
// <dir>.
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { CHECKOUT, finish, options } from "./load.mjs";

const { LITE_PARTS, checkLiteClosure, checkLiteFingerprints, checkLiteModules } = await import(new URL("scripts/lite-entry.mjs", CHECKOUT).href);
const { readModuleList } = await import(new URL("scripts/root-isolation.mjs", CHECKOUT).href);
const args = options();
const checkout = fileURLToPath(CHECKOUT);
const scratch = mkdtempSync(join(tmpdir(), "lite-broken-builds-"));

/** An esbuild plugin that gives `path` (relative to the checkout) the text `change(text)` returns. */
const rewrite = (path, change) => ({
  name: `rewrite ${path}`,
  setup(context) {
    // esbuild reads the filter as a Go regular expression, which takes no flags.
    context.onLoad({ filter: /\.ts$/ }, (loaded) => {
      if (loaded.path !== join(checkout, path)) return undefined;
      return { contents: change(readFileSync(loaded.path, "utf8")), loader: "ts" };
    });
  }
});

/**
 * The four parts built into <dir>/dist/ as scripts/build-lite.mjs builds them,
 * but with `variant`'s esbuild options, and dist/lite.js beside them; returns
 * the build as the checks read it, its module list keyed "dist/<file>".
 */
async function buildLite(dir, variant = {}) {
  const outdir = join(dir, "dist");
  mkdirSync(outdir, { recursive: true });
  const result = await build({
    absWorkingDir: checkout,
    entryPoints: Object.fromEntries(LITE_PARTS.map((part) => [`lite-${part}`, `src/lite/${part}.ts`])),
    bundle: true, splitting: false, format: "esm", platform: "neutral", target: "es2022", tsconfig: "tsconfig.build.json",
    metafile: true, minify: false, outdir, write: true, logLevel: "silent", ...variant
  });
  const liteJs = LITE_PARTS.map((part) => `export * from "./lite-${part}.js";\n`).join("");
  writeFileSync(join(outdir, "lite.js"), liteJs);
  const key = (path) => `dist/${basename(path)}`;
  const metafile = { inputs: result.metafile.inputs, outputs: {} };
  for (const [path, output] of Object.entries(result.metafile.outputs)) {
    metafile.outputs[key(path)] = { ...output, imports: output.imports.map((edge) => (edge.external ? edge : { ...edge, path: key(edge.path) })) };
  }
  metafile.outputs["dist/lite.js"] = {
    bytes: Buffer.byteLength(liteJs), inputs: { "src/lite.ts": {} },
    imports: LITE_PARTS.map((part) => ({ path: `dist/lite-${part}.js`, kind: "import-statement" }))
  };
  metafile.inputs["src/lite.ts"] = { bytes: 0, imports: LITE_PARTS.map((part) => ({ path: `src/lite/${part}.ts`, kind: "import-statement" })), format: "esm" };
  return fromDirectory(outdir, metafile);
}

/** A build as the checks read it: the .js files of `outdir`, read from it, with `metafile`. */
function fromDirectory(outdir, metafile) {
  const files = readdirSync(outdir).filter((name) => name.endsWith(".js")).map((name) => `dist/${name}`);
  return { metafile, files, read: (path) => readFileSync(join(outdir, path.slice("dist/".length)), "utf8") };
}

/** The lite files of this checkout's build, copied into <dir>/dist/, with their part of the module list. */
function copyOwnBuild(dir) {
  const outdir = join(dir, "dist");
  mkdirSync(outdir, { recursive: true });
  const names = ["lite.js", ...LITE_PARTS.map((part) => `lite-${part}.js`)];
  for (const name of names) copyFileSync(join(checkout, "dist", name), join(outdir, name));
  const own = JSON.parse(readFileSync(join(checkout, "dist/metafile-lite.json"), "utf8"));
  return { outdir, metafile: structuredClone(own) };
}

/** Each check's verdict on a build: "pass" or the first fault it names. */
function verdicts(built) {
  const out = {};
  for (const [check, run] of [["L1", checkLiteClosure], ["L3", checkLiteFingerprints], ["L2", checkLiteModules]]) {
    try {
      run(built);
      out[check] = "pass";
    } catch (error) {
      out[check] = `fail: ${String(error.message).split("\n")[0]}`;
    }
  }
  return out;
}

const relationshipComposite = (text) => text.replace("../techniques/composite.js", "../techniques/relationship.js").replace("../techniques/composite.js", "../techniques/relationship.js");
const withCompositeChart = (text) => `${text}export { compositeChart } from "../techniques/relationship.js";\n`;
const controls = [];
try {
  // This checkout's own build, read as the export smoke test reads it.
  const distUrl = new URL("dist/", CHECKOUT);
  const own = {
    metafile: readModuleList(distUrl),
    files: readdirSync(new URL("dist/", CHECKOUT)).filter((name) => name.endsWith(".js")).map((name) => `dist/${name}`),
    read: (path) => readFileSync(new URL(path, CHECKOUT), "utf8")
  };
  const baseline = verdicts(own);

  const cases = [
    ["L1 a: composite part re-exporting compositeChart, astronomy-engine inlined", ["L3", "L2"],
      () => buildLite(join(scratch, "l1a"), { plugins: [rewrite("src/lite/composite.ts", withCompositeChart)] })],
    ["L1 b: the same, astronomy-engine external", ["L1"],
      () => buildLite(join(scratch, "l1b"), { plugins: [rewrite("src/lite/composite.ts", withCompositeChart)], external: ["astronomy-engine"] })],
    ["L1 c: the four parts built with splitting on", ["L1"], () => buildLite(join(scratch, "l1c"), { splitting: true })],
    ["L2 a: composite part built from src/techniques/relationship.ts", ["L2"],
      () => buildLite(join(scratch, "l2a"), { plugins: [rewrite("src/lite/composite.ts", relationshipComposite)] })],
    ["L2 b: module list one byte stale", ["L2"], () => {
      const { outdir, metafile } = copyOwnBuild(join(scratch, "l2b"));
      metafile.outputs["dist/lite-composite.js"].bytes += 1;
      return fromDirectory(outdir, metafile);
    }],
    ["L3: a part's copy holding a string that only the ephemeris holds", ["L3"], () => {
      const { outdir, metafile } = copyOwnBuild(join(scratch, "l3"));
      const file = join(outdir, "lite-dignities.js");
      writeFileSync(file, `${readFileSync(file, "utf8")}// Light-travel time solver did not converge\n`);
      metafile.outputs["dist/lite-dignities.js"].bytes = Buffer.byteLength(readFileSync(file, "utf8"));
      return fromDirectory(outdir, metafile);
    }]
  ];
  for (const [name, mustFail, make] of cases) {
    const built = await make();
    const result = verdicts(built);
    const bytes = Object.fromEntries(built.files.map((file) => [file, Buffer.byteLength(built.read(file))]));
    controls.push({ name, mustFail, verdicts: result, files: bytes, behaved: mustFail.every((check) => result[check] !== "pass") });
  }

  let l5 = null;
  if (args["l5-control"]) {
    const built = await buildLite(args["l5-control"], {
      plugins: [rewrite("src/declination.ts", (text) => {
        const from = "export const DECLINATION_ORB_LUMINARY = 1.5;";
        if (!text.includes(from)) throw new Error("src/declination.ts no longer declares DECLINATION_ORB_LUMINARY = 1.5");
        return text.replace(from, "export const DECLINATION_ORB_LUMINARY = 1.4;");
      })]
    });
    l5 = { dir: args["l5-control"], files: built.files, verdicts: verdicts(built) };
  }

  finish({
    checks: "L1, L2 and L3 controls on real builds",
    ownBuild: baseline,
    controls,
    l5Control: l5,
    node: process.version,
    pass: Object.values(baseline).every((verdict) => verdict === "pass") && controls.every((control) => control.behaved)
  }, args.out);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
