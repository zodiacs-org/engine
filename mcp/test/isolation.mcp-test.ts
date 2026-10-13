import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("parent package isolation", () => {
  it("excludes the MCP project from the engine's pack manifest", () => {
    const output = execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
      cwd: fileURLToPath(new URL("../../", import.meta.url)),
      encoding: "utf8",
      env: {
        ...process.env,
        npm_config_cache: fileURLToPath(new URL("../.cache/npm", import.meta.url))
      }
    });
    const report = JSON.parse(output) as Array<{ files: Array<{ path: string }> }>;
    const paths = report[0]?.files.map(({ path }) => path);
    expect(paths).toBeDefined();
    expect(paths).toContain("package.json");
    expect(paths?.filter((path) => path === "mcp" || path.startsWith("mcp/"))).toEqual([]);
  });
});
