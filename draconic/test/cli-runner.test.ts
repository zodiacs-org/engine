import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseNatalEnvelope } from "../../src/receipt.js";

const runner = fileURLToPath(new URL("../bin/draconic.mjs", import.meta.url));

describe("source-checkout CLI runner", () => {
  it("runs from outside the checkout with local dependencies and no engine build", () => {
    const birth = { utc: "2000-04-05T06:07:00Z", timeKnown: false };
    const result = spawnSync(process.execPath, [runner, "chart", "--input", "-", "--node", "mean"], {
      cwd: tmpdir(), input: JSON.stringify({ synthetic: true, birth }), encoding: "utf8", timeout: 20000
    });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    const chart = JSON.parse(result.stdout);
    expect(chart.draconic.node.kind).toBe("mean");
    expect(chart.draconic.angles).toBeNull();
    expect(chart.draconic.houses).toBeNull();
    expect(chart.natal.receipt.resultFlags).toContain("no-time");
    expect(chart.conventions.northNode).toEqual(chart.draconic.node);
    expect(parseNatalEnvelope(JSON.stringify(chart.natal)).ok).toBe(true);
  }, 25000);

  it("reads local files with spaces in the path and reports file failures without JSON", () => {
    const root = mkdtempSync(fileURLToPath(new URL("../.cache/cli-test-", import.meta.url)));
    try {
      const file = join(root, "synthetic chart.json");
      const directory = join(root, "directory");
      writeFileSync(file, JSON.stringify({ synthetic: true, birth: { utc: "2000-04-05" } }));
      mkdirSync(directory);
      for (const [input, code, message] of [
        [file, 0, ""], [join(root, "missing.json"), 1, "Input file does not exist."],
        [directory, 1, "Input must be a file, not a directory."]
      ] as const) {
        const result = spawnSync(process.execPath, [runner, "chart", "--input", input], {
          cwd: tmpdir(), encoding: "utf8", timeout: 20000
        });
        expect(result.error).toBeUndefined();
        expect(result.status).toBe(code);
        if (code === 0) {
          expect(result.stderr).toBe("");
          expect(JSON.parse(result.stdout).draconic.node.kind).toBe("true");
        } else {
          expect(result.stdout).toBe("");
          expect(result.stderr).toBe(`draconic: ${message}\n`);
        }
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 65000);

  it("stops oversized input streams without printing a partial result", () => {
    const result = spawnSync(process.execPath, [runner, "chart", "--input", "-"], {
      cwd: tmpdir(), input: " ".repeat(64 * 1024 + 1), encoding: "utf8", timeout: 20000
    });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("draconic: Input exceeds the 64 KiB limit.\n");
  }, 25000);
});
