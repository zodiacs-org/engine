import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";

// Dry-run only: no engine build, archive creation or lifecycle scripts.
test("the parent npm file list excludes the entire events project", () => {
  const output = execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
    cwd: new URL("../../../", import.meta.url),
    encoding: "utf8",
    env: { ...process.env, npm_config_cache: new URL("../.cache/npm/", import.meta.url).pathname }
  });
  const reports = JSON.parse(output) as { files: { path: string }[] }[];
  assert.equal(reports.length, 1);
  const files = reports[0]!.files;
  assert.ok(files.some(file => file.path === "package.json"));
  assert.ok(files.every(file => !file.path.startsWith("events/")));
});

test("runnable examples cover event queries and retain explicit clocks", () => {
  const output = execFileSync(process.execPath, ['examples.mjs'], {
    cwd: new URL('../../', import.meta.url), encoding: 'utf8'
  });
  const lines = output.trim().split('\n').map(line => JSON.parse(line) as {
    query: string; result: { status: string; events: { clock: string }[]; window: { clock: string } }
  });
  assert.equal(lines.length, 6);
  for (const { result } of lines) {
    assert.equal(result.status, 'complete');
    assert.equal(result.window.clock, 'tt');
    assert.ok(result.events.length > 0);
    assert.ok(result.events.every(e => e.clock === 'tt'));
  }
});
