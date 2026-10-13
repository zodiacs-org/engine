import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { expect, it } from "vitest";

it("keeps authored and generated calendar files outside parent compilation and npm selection", async () => {
  const result = await promisify(execFile)(process.execPath,
    [new URL("../scripts/verify-isolation.mjs", import.meta.url).pathname], { timeout: 30_000 });
  expect(result.stderr).toBe("");
  expect(result.stdout).toContain("npm dry-run exclusion");
}, 35_000);
