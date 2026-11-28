import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

it("imports core and optional entries without I/O, and resolves timed queries offline", () => {
  const result = spawnSync(process.execPath, [
    fileURLToPath(new URL("../evidence/check-m12-imports.mjs", import.meta.url))
  ], {
    cwd: fileURLToPath(new URL("../", import.meta.url)), encoding: "utf8", timeout: 30_000,
    env: { ...process.env, NODE_OPTIONS: "", TSX_DISABLE_CACHE: "1" }
  });
  expect(result.error).toBeUndefined();
  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
  expect(JSON.parse(result.stdout)).toMatchObject({ passed: true, runtime: { node: process.version } });
}, 35_000);
