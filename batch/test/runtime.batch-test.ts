import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

const script = new URL("../scripts/check.mjs", import.meta.url).href;
const minimumRange = ">=22.23.3 <23";

it("declares the same supported runtime in the manifest and lockfile", () => {
  const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  const lock = JSON.parse(readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"));
  expect(manifest.engines.node).toBe(minimumRange);
  expect(lock.packages[""].engines.node).toBe(minimumRange);
});

it.each([
  ["20.19.0", false],
  ["22.22.2", false],
  ["22.22.99", false],
  ["22.23.0", false],
  ["22.23.2", false],
  ["22.23.3", true],
  ["22.23.4", true],
  ["22.24.0", true],
  ["23.0.0", false],
  ["24.0.0", false],
] as const)("check runner admission for Node %s is %s", (version, accepted) => {
  // Substitute only the version string and child-process runner. This checks
  // admission without downloading other runtimes or recursively running tests.
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", `
    import childProcess from "node:child_process";
    import { syncBuiltinESMExports } from "node:module";
    Object.defineProperty(process.versions, "node", { value: process.argv[1] });
    process.argv = [process.execPath, process.argv[2]];
    childProcess.spawnSync = () => ({ status: 0 });
    syncBuiltinESMExports();
    await import(${JSON.stringify(script)});
  `, version, "scripts/check.mjs"], { encoding: "utf8", timeout: 10_000 });
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(accepted ? 0 : 1);
  if (accepted) {
    expect(result.stderr).toBe("");
    expect(result.stdout).toBe(
      "Batch check: typecheck\nBatch check: tests\nBatch check: batch build\nBatch check: repository audit\n",
    );
  } else {
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(`Run npm run check on Node ${minimumRange}, without additional arguments.\n`);
  }
});
