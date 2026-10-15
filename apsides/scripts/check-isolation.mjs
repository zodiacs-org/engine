import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const project = fileURLToPath(new URL("../", import.meta.url));
const root = resolve(project, "..");
const generated = join(project, ".generated");
const ignored = new Set(["node_modules", ".cache", ".generated", "coverage"]);

// Check only authored files and small frozen fixtures, not installed tools or caches.
function checkFiles(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const path = join(directory, entry.name);
    assert(!entry.isSymbolicLink(), `Unexpected symlink: ${path}`);
    if (entry.isDirectory()) checkFiles(path);
    else {
      assert(statSync(path).size < 2_000_000, `File is too large: ${path}`);
      if (/\.(md|txt)$/u.test(path)) {
        assert(!readFileSync(path, "utf8").includes("\u2014"), `Em dash in documentation: ${path}`);
      }
    }
  }
}
checkFiles(project);

const command = (file, args, cwd) => execFileSync(file, args, {
  cwd,
  encoding: "utf8",
  timeout: 60_000,
  maxBuffer: 2_000_000,
  env: { ...process.env, npm_config_cache: join(project, ".cache/npm") }
});

// A dry run reads the real checkout's file selection and cannot run prepack.
const dryRun = JSON.parse(command("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], root))[0];
assert(dryRun?.files?.length > 0, "No npm file-selection report");
assert(dryRun.files.every(({ path }) => !path.startsWith("apsides/")), "apsides leaked into the engine package");

// The checkout may deliberately have no dist/. Exercise the repository's full
// package gate in an isolated copy using the authenticated carried dist/.
// This checks contents and budgets, not a rebuild or archive-binding history.
const manifest = JSON.parse(readFileSync(join(project, "package.json"), "utf8"));
const relativeArchive = manifest.dependencies["@zodiacs/engine"];
assert(relativeArchive.startsWith("file:../artifacts/"), "Engine must be a carried local archive");
const archive = resolve(project, relativeArchive.slice("file:".length));
const digest = createHash("sha256").update(readFileSync(archive)).digest("hex");
const receipt = readFileSync(archive.replace(/\.tgz$/u, ".sha256"), "utf8").split(/\s+/u)[0];
assert.equal(digest, receipt, "Carried archive digest mismatch");

mkdirSync(generated, { recursive: true });
const work = mkdtempSync(join(generated, "package-check-"));
try {
  command("tar", ["-xzf", archive, "--strip-components=1", "-C", work], project);
  for (const name of ["package.json", "README.md", "CHANGELOG.md", "LICENSE", "LICENSING.md", "NOTICE"]) {
    copyFileSync(join(root, name), join(work, name));
  }
  mkdirSync(join(work, "scripts"));
  copyFileSync(join(root, "scripts/verify-package-contents.mjs"), join(work, "scripts/verify-package-contents.mjs"));
  process.stdout.write(command("npm", ["run", "package:contents"], work));
  console.log("Apsides isolation passed: excluded from root npm selection; package gate used carried dist in an isolated copy.");
} finally {
  rmSync(work, { recursive: true, force: true });
}
