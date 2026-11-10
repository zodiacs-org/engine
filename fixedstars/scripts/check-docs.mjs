import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import ts from "typescript";

const project = fileURLToPath(new URL("../", import.meta.url));
const ignored = new Set(["node_modules", ".cache", "generated", "coverage"]);

function markdownFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (ignored.has(entry.name)) return [];
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? markdownFiles(path) : entry.name.endsWith(".md") ? [path] : [];
  });
}

// Check local inline links only. External sources retain their pinned retrieval
// records; this offline check does not claim that remote links are reachable.
for (const file of markdownFiles(project)) {
  const content = readFileSync(file, "utf8");
  for (const [, link] of content.matchAll(/\[[^\]\n]*\]\(([^)\s]+)\)/gu)) {
    if (/^[a-z][a-z0-9+.-]*:/iu.test(link)) continue;
    const [path, fragment] = link.split("#");
    const target = path ? resolve(dirname(file), decodeURIComponent(path)) : file;
    assert(statSync(target).isFile(), `missing documentation target: ${link} in ${file}`);
    if (fragment && target.endsWith(".md")) {
      const anchors = Array.from(readFileSync(target, "utf8").matchAll(/^#{1,6} (.+)$/gmu), ([, title]) =>
        title.toLowerCase().replace(/[^\p{L}\p{N}_ -]/gu, "").replaceAll(" ", "-"));
      assert(anchors.includes(decodeURIComponent(fragment)), `missing documentation heading: ${link} in ${file}`);
    }
  }
}

// Treat every README TypeScript fence as a separate module located at the
// project root, as documented. Virtual files keep all checks out of dist/.
const readme = readFileSync(resolve(project, "README.md"), "utf8");
const examples = Array.from(readme.matchAll(/^```ts\n([\s\S]*?)^```$/gmu), ([, source], i) =>
  [resolve(project, `readme-example-${i + 1}.mts`), source]);
assert(examples.length > 0, "README contains no TypeScript examples");
const virtual = new Map(examples);
const config = ts.readConfigFile(resolve(project, "tsconfig.json"), ts.sys.readFile);
assert(!config.error, "cannot read the project TypeScript configuration");
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, project);
assert.equal(parsed.errors.length, 0, "invalid project TypeScript configuration");
const host = ts.createCompilerHost(parsed.options);
host.getCurrentDirectory = () => project;
const read = host.readFile.bind(host), exists = host.fileExists.bind(host), sourceFile = host.getSourceFile.bind(host);
host.readFile = (path) => virtual.get(path) ?? read(path);
host.fileExists = (path) => virtual.has(path) || exists(path);
host.getSourceFile = (path, version, onError, createNew) => virtual.has(path)
  ? ts.createSourceFile(path, virtual.get(path), version, true, ts.ScriptKind.TS)
  : sourceFile(path, version, onError, createNew);
const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram([...virtual.keys()], parsed.options, host));
assert.equal(diagnostics.length, 0, ts.formatDiagnostics(diagnostics, {
  getCanonicalFileName: (path) => path, getCurrentDirectory: () => project, getNewLine: () => "\n"
}));

for (const [path, source] of examples) {
  const bundled = await build({
    stdin: { contents: source, resolveDir: project, sourcefile: path, loader: "ts" },
    bundle: true, format: "esm", platform: "node", target: "node22", write: false, logLevel: "silent",
    plugins: [{ name: "documented-checkout-imports", setup(builder) {
      builder.onResolve({ filter: /^astronomy-engine$/u }, () => ({
        path: new URL("../node_modules/astronomy-engine/esm/astronomy.js", import.meta.url).href, external: true
      }));
      builder.onResolve({ filter: /^\.\/node\.mjs$/u }, () => ({
        path: new URL("../node.mjs", import.meta.url).href, external: true
      }));
    } }]
  });
  const code = bundled.outputFiles[0].text;
  assert(Buffer.byteLength(code) < 2_000_000, "documentation example exceeds the artifact size limit");
  // Supply code on stdin, avoiding command-line length limits. Catch inside
  // the module loader so a failure reports its message without a data-URL stack.
  const url = `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
  const child = spawnSync(process.execPath, ["--input-type=module"], {
    cwd: project, input: `import(${JSON.stringify(url)}).catch(error => { console.error(error.message); process.exitCode = 1; });`,
    encoding: "utf8", timeout: 30_000, maxBuffer: 2_000_000, stdio: ["pipe", "ignore", "pipe"]
  });
  if (child.error) throw child.error;
  assert.equal(child.status, 0, `README example ${path} failed: ${child.stderr}`);
}

console.log(`Documentation passed: local inline links checked; ${examples.length} README TypeScript examples type-checked and executed in memory.`);
