import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, relative } from "node:path";
import { build } from "esbuild";

const root = fileURLToPath(new URL("../", import.meta.url));
const repo = resolve(root, "..");
const args = process.argv.slice(2);
if (process.versions.node.split(".")[0] !== "22") throw new Error("Use Node 22 for this benchmark.");
if (args.length !== 4 || args[0] !== "--profile" || !["smoke", "scaling"].includes(args[1]) || args[2] !== "--output") {
  throw new Error("Usage: node scripts/benchmark.mjs --profile smoke|scaling --output .generated/report.json");
}
const output = resolve(root, args[3]);
const generated = resolve(root, ".generated");
const outputRelative = relative(generated, output);
if (outputRelative.startsWith("..") || outputRelative.startsWith("/") || !outputRelative.endsWith(".json")) {
  throw new Error("Benchmark output must be a JSON file under batch/.generated/.");
}
// A separate build prevents tests or the CLI from replacing a running benchmark.
const outdir = resolve(generated, "benchmark-build");
mkdirSync(outdir, { recursive: true });
const result = await build({
  absWorkingDir: root,
  entryPoints: { runner: "benchmark/runner.ts", "worker-entry": "src/worker-entry.ts" },
  outdir, bundle: true, platform: "node", format: "esm", target: "node22",
  sourcemap: false, metafile: true,
  alias: { "astronomy-engine": fileURLToPath(import.meta.resolve("astronomy-engine")) },
});
const sha256 = (data) => createHash("sha256").update(data).digest("hex");
const sources = [...new Set([
  ...Object.keys(result.metafile.inputs), "scripts/benchmark.mjs", "package.json", "package-lock.json", "../package.json",
])].map((path) => ({
  path: relative(repo, resolve(root, path)), sha256: sha256(readFileSync(resolve(root, path))),
})).sort((a, b) => a.path.localeCompare(b.path, "en"));
const identity = {
  gitHead: execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim(),
  // HEAD can predate the new runner; content hashes identify what was measured.
  sourceManifestSha256: sha256(JSON.stringify(sources)), sources,
  bundles: ["runner.js", "worker-entry.js"].map((name) => ({ name, sha256: sha256(readFileSync(resolve(outdir, name))) })),
  enginePackageVersion: JSON.parse(readFileSync(resolve(repo, "package.json"), "utf8")).version,
  ephemerisVersion: JSON.parse(readFileSync(resolve(root, "node_modules/astronomy-engine/package.json"), "utf8")).version,
};
writeFileSync(resolve(outdir, "identity.json"), JSON.stringify(identity, null, 2) + "\n");
const child = spawnSync(process.execPath, [resolve(outdir, "runner.js"), args[1], output], { cwd: root, stdio: "inherit" });
process.exitCode = child.status ?? 1;
