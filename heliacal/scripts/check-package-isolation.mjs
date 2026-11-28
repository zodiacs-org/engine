// Read the carried archive; never build, pack or write root dist/.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

const project = fileURLToPath(new URL("..", import.meta.url));
const root = fileURLToPath(new URL("../..", import.meta.url));
const scratch = mkdtempSync(join(tmpdir(), "heliacal-package-"));
const env = { ...process.env, npm_config_cache: join(scratch, ".npm-cache") };

try {
  // Check the actual working tree's pack list, without lifecycle scripts.
  const report = JSON.parse(execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
    cwd: root, encoding: "utf8", env
  }))[0];
  assert(report?.files?.length, "npm returned no package file list");
  assert(!report.files.some(({ path }) => path.startsWith("heliacal/")), "heliacal leaked into the engine package");

  // The full contents checker needs dist/. Reuse the immutable carried build
  // in a disposable copy, with today's metadata and this project's files.
  // This checks packaging isolation, not source/build reproducibility.
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  for (const file of ["package.json", "README.md", "CHANGELOG.md", "LICENSE", "LICENSING.md", "NOTICE"]) {
    copyFileSync(join(root, file), join(scratch, file));
  }
  mkdirSync(join(scratch, "scripts"));
  copyFileSync(join(root, "scripts/verify-package-contents.mjs"), join(scratch, "scripts/verify-package-contents.mjs"));
  cpSync(project, join(scratch, "heliacal"), {
    recursive: true,
    filter: (source) => !["node_modules", ".cache", "generated", "coverage"].includes(basename(source))
  });
  execFileSync("tar", [
    "-xzf", join(root, "artifacts", `zodiacs-engine-${pkg.version}.tgz`),
    "-C", scratch, "--strip-components=1", "--wildcards", "package/dist/*"
  ]);
  execFileSync("npm", ["run", "package:contents"], { cwd: scratch, env, stdio: "inherit" });
  console.log("Package isolation passed: working-tree dry run excludes heliacal; full contents check used carried dist in a temporary copy.");
  console.log("The engine source was not rebuilt and root dist was not written.");
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
