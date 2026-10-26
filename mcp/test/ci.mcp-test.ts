import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const project = fileURLToPath(new URL("../", import.meta.url));
const root = dirname(project);

describe("CI installation environment", () => {
  it("uses the same local npm cache for setup from the checkout root and installation in mcp", () => {
    const workflow = readFileSync(join(root, ".github/workflows/mcp.yml"), "utf8");
    const cacheTemplate = /^      npm_config_cache: (.+)$/m.exec(workflow)?.[1];
    expect(cacheTemplate).toBeDefined();
    const cache = cacheTemplate!.replace("${{ github.workspace }}", root);
    for (const cwd of [root, project]) {
      const configured = execFileSync("npm", ["config", "get", "cache"], {
        cwd, encoding: "utf8", timeout: 15_000,
        env: { ...process.env, npm_config_cache: cache }
      }).trim();
      expect(configured).toBe(join(project, ".cache/npm"));
    }
  });
});
