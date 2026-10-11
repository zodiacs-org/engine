// Bundles platform-probe-entry.mjs, the built package and the fixtures into
// one script with the checkout's esbuild, node:crypto replaced by
// node-crypto-shim.mjs (whose digests are checked against Node's first), and
// runs it in macOS's JavaScriptCore shell. After npm run build:
//
//   node platform-probe-jsc.mjs <engine checkout> <scratch directory> > <file>
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash as shimHash } from "./node-crypto-shim.mjs";

const [rootArg, scratchArg] = process.argv.slice(2);
if (!rootArg || !scratchArg) throw new Error("usage: node platform-probe-jsc.mjs <engine checkout> <scratch directory>");
const root = resolve(rootArg);
const scratch = resolve(scratchArg);
const here = fileURLToPath(new URL(".", import.meta.url));
const jsc = "/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc";

for (const text of ["", "abc", "ΔT ☉ ♃", JSON.stringify({ a: [1, 2.5, "x"] }), "x".repeat(1000)]) {
  if (shimHash("sha256").update(text).digest("hex") !== createHash("sha256").update(text).digest("hex")) throw new Error("node-crypto-shim disagrees with node:crypto");
}
const esbuild = createRequire(join(root, "package.json"))("esbuild");
mkdirSync(scratch, { recursive: true });
const outfile = join(scratch, "platform-probe.jsc.js");
await esbuild.build({
  entryPoints: [join(here, "platform-probe-entry.mjs")],
  bundle: true,
  format: "iife",
  platform: "neutral",
  mainFields: ["module", "main"],
  logLevel: "error",
  outfile,
  define: { "globalThis.__PROBE_ENGINE__": JSON.stringify("JavaScriptCore (macOS jsc shell)") },
  plugins: [{
    name: "node-crypto-shim",
    setup(build) {
      build.onResolve({ filter: /^node:crypto$/ }, () => ({ path: join(here, "node-crypto-shim.mjs") }));
    },
  }],
});
process.stdout.write(execFileSync(jsc, [outfile], { encoding: "utf8", maxBuffer: 1 << 28 }));
