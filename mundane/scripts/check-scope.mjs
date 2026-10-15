import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { lstat, readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = fileURLToPath(new URL("../../", import.meta.url));
const project = fileURLToPath(new URL("../", import.meta.url));
const git = (args, input) => execFileSync("git", ["--no-optional-locks", ...args], { cwd: root, encoding: "utf8", input });
const paths = output => output.split("\0").filter(Boolean);
const changed = new Set([
  ...paths(git(["diff", "--name-only", "-z", "HEAD"])),
  ...paths(git(["ls-files", "--others", "--exclude-standard", "-z"]))
]);
assert([...changed].every(path => path.startsWith("mundane/")), "session changes must stay inside mundane/");
console.log("PASS: current changes are confined to mundane/; git metadata was read only.");

const files = new Set(paths(git(["ls-files", "--cached", "--others", "--exclude-standard", "-z", "--", "mundane/"])));
let largest = { path: "", bytes: 0 };
async function checkSize(path) {
  const info = await lstat(resolve(root, path));
  assert(info.isFile(), `${path} must be a regular file`);
  assert(info.size < 2_000_000, `${path} must stay below 2,000,000 bytes`);
  if (info.size > largest.bytes) largest = { path, bytes: info.size };
}
for (const path of files) {
  await checkSize(path);
  if (path.endsWith(".md") || path.startsWith("mundane/docs/")) {
    assert(!(await readFile(resolve(root, path), "utf8")).includes("\u2014"), `${path} contains an em dash`);
  }
}
console.log(`PASS: ${files.size} nonignored mundane files below 2,000,000 bytes; documentation has no em dash.`);
console.log(`Largest nonignored file: ${largest.path}, ${largest.bytes} bytes.`);

// Check generated workbench output without following links into engine sources
// or counting third-party dependencies. The CLI must already have been built.
await checkSize("mundane/build/cli.mjs");
async function checkGenerated(directory) {
  for (const entry of await readdir(resolve(root, directory), { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) await checkGenerated(path);
    else if (entry.isFile()) await checkSize(path);
    else assert(entry.isSymbolicLink(), `unexpected generated file type: ${path}`);
  }
}
await checkGenerated("mundane/generated");
const ignored = paths(git(["check-ignore", "--stdin", "-z"],
  "mundane/build/cli.mjs\0mundane/generated/audit-probe\0mundane/node_modules/audit-probe\0"));
assert.equal(ignored.length, 3, "build output, generated data and dependencies must remain ignored");
assert(![...files].some(path => /^mundane\/(?:build|generated|node_modules)\//u.test(path)),
  "generated output and dependencies must not be tracked");
console.log("PASS: local CLI and generated regular files below 2,000,000 bytes; output and dependency directories ignored.");

// A browser-targeted build rejects Node builtins. Keep the library independent
// of CLI/module-loading IO; build in memory, without touching dist/ or a bundle.
const library = await build({
  absWorkingDir: project, entryPoints: ["src/index.ts"], bundle: true,
  platform: "browser", format: "esm", target: "es2022", write: false, metafile: true,
  alias: { "astronomy-engine": resolve(project, "node_modules/astronomy-engine/esm/astronomy.js") }
});
assert(!Object.keys(library.metafile.inputs).some(path => /\/(?:cli|events-loader)\.ts$/u.test(path)),
  "pure library must not reach the CLI or Node-only loader");
assert(library.outputFiles.every(file => file.contents.length < 2_000_000), "library bundle must stay below the file limit");
console.log("PASS: library bundles for browsers without Node builtins, CLI, or events loader; in-memory output below the file limit.");

// Git's whitespace check reads only; it writes neither index nor worktree.
git(["diff", "--check", "HEAD"]);
console.log("PASS: git diff --check.");
