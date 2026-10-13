import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, readdir, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import test from "node:test";

const project = fileURLToPath(new URL("..", import.meta.url));
const repository = fileURLToPath(new URL("../..", import.meta.url));
const localOnly = new Set(["node_modules", ".cache", "generated", "reports", "coverage", "scratch"]);

test("npm's actual dry-run inventory excludes evals without running a build", () => {
  const output = execFileSync("npm", [
    "pack", "--dry-run", "--json", "--ignore-scripts", "--offline",
    "--cache", join(project, ".cache", "npm")
  ], { cwd: repository, encoding: "utf8", timeout: 30000 });
  const reports = JSON.parse(output);
  assert.equal(reports.length, 1);
  assert.equal(reports[0].name, "@zodiacs/engine");
  const paths = reports[0].files.map(({ path }) => path);
  assert.ok(paths.includes("package.json"));
  assert.ok(!paths.some((path) => path === "evals" || path.startsWith("evals/")));
});

test("project files respect size, prose and test-runner isolation constraints", async () => {
  async function check(directory) {
    for (const item of await readdir(directory, { withFileTypes: true })) {
      if (directory === project && localOnly.has(item.name)) continue;
      const path = join(directory, item.name);
      if (item.isDirectory()) {
        await check(path);
        continue;
      }
      assert.ok(item.isFile(), `expected a regular project file: ${path}`);
      assert.ok((await stat(path)).size < 2_000_000, `project file exceeds size limit: ${path}`);
      assert.ok(!/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(item.name),
        `root Vitest would collect this file: ${path}`);
      if (/\.(?:md|txt)$/.test(item.name)) {
        assert.ok(!(await readFile(path, "utf8")).includes("\u2014"),
          `documentation contains an em dash: ${path}`);
      }
    }
  }
  await check(project);
});
