import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const project = new URL("../", import.meta.url);

test("engine npm dry run excludes this isolated project without running scripts", () => {
  const root = new URL("../../", import.meta.url);
  const env = { ...process.env, npm_config_cache: fileURLToPath(new URL(".cache/npm", project)) };
  const report = JSON.parse(execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
    cwd: root, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"]
  }))[0];
  assert(report && Array.isArray(report.files));
  assert(report.files.some((file) => file.path === "package.json"));
  assert(!report.files.some((file) => file.path.startsWith("numerology/")));
  // This checks exclusion only. It does not substitute for the engine's
  // complete package-contents gate, which requires its existing dist/ build.
});

test("authored files stay below the size limit and docs have no em dash", () => {
  const ignored = new Set(["node_modules", ".build", ".cache", ".generated"]);
  function visit(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (ignored.has(entry.name)) continue;
      const url = new URL(entry.name + (entry.isDirectory() ? "/" : ""), directory);
      if (entry.isDirectory()) visit(url);
      else {
        assert(entry.isFile(), `unexpected non-regular file: ${entry.name}`);
        assert(statSync(url).size < 2_000_000, `file exceeds limit: ${entry.name}`);
        if (entry.name.endsWith(".md") || entry.name.endsWith(".txt")) {
          assert(!readFileSync(url, "utf8").includes("\u2014"), `em dash in ${entry.name}`);
        }
      }
    }
  }
  visit(project);
});
