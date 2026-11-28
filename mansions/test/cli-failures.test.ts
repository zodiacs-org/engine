import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runCli } from "../src/cli.js";
import * as engine from "../src/engine.js";

const TABLE = ["--table", "equal28-aries-v1"];
const AT = ["at", "2001-02-03", ...TABLE];
const RANGE = ["range", "2001-02-03", "2001-02-06", ...TABLE];
const FAILURE = { exitCode: 1, stdout: "", stderr: "mansions: calculation failed.\n" };

afterEach(() => vi.restoreAllMocks());

describe("CLI failure boundaries", () => {
  it("treats internal RangeErrors and non-Error throws as calculation failures without revealing their contents", () => {
    for (const error of [new RangeError("Synthetic private engine diagnostic"), new Error("Synthetic engine failure"), "Synthetic thrown string", null]) {
      const sample = vi.spyOn(engine, "tropicalMoon").mockImplementation(() => { throw error; });
      for (const args of [AT, RANGE]) {
        for (const format of ["json", "text"]) expect(runCli([...args, "--format", format])).toEqual(FAILURE);
      }
      sample.mockRestore();
    }
  });

  it("does not print partial JSON or text when a later sidereal evaluation fails", () => {
    const original = engine.siderealMoon;
    for (const format of ["json", "text"]) {
      let calls = 0;
      const sample = vi.spyOn(engine, "siderealMoon").mockImplementation((...args) => {
        calls += 1;
        if (calls === 10) throw new RangeError("Synthetic late engine diagnostic");
        return original(...args);
      });
      expect(runCli([...RANGE, "--zodiac", "sidereal", "--ayanamsa", "lahiri", "--format", format])).toEqual(FAILURE);
      expect(sample).toHaveBeenCalledTimes(10);
      sample.mockRestore();
    }
  });

  it("prints only the original typed refusal when a later sidereal evaluation is refused", () => {
    const original = engine.siderealMoon;
    const refusal = { status: "refused", reason: "unsupported-combination", detail: "Synthetic late refusal" } as const;
    for (const format of ["json", "text"]) {
      let calls = 0;
      const sample = vi.spyOn(engine, "siderealMoon").mockImplementation((...args) => {
        calls += 1;
        return calls === 10 ? refusal : original(...args);
      });
      const result = runCli([...RANGE, "--zodiac", "sidereal", "--ayanamsa", "lahiri", "--format", format]);
      expect(result).toEqual({ exitCode: 3, stderr: "",
        stdout: `${format === "text" ? "Refused: " : ""}${JSON.stringify(refusal)}\n` });
      expect(sample).toHaveBeenCalledTimes(10);
      sample.mockRestore();
    }
  });

  it("still labels invalid instants and windows as argument errors before calling the engine", () => {
    const sample = vi.spyOn(engine, "tropicalMoon");
    for (const args of [
      ["at", "2001-02-30", ...TABLE],
      ["range", "2001-02-03", "2001-02-30", ...TABLE],
      ["range", "2001-02-06", "2001-02-03", ...TABLE],
      ["range", "2001-01-01", "2003-01-01", ...TABLE]
    ]) {
      expect(runCli(args)).toMatchObject({ exitCode: 2, stdout: "", stderr: expect.stringContaining("mansions:") });
    }
    expect(sample).not.toHaveBeenCalled();
  });

  it("catches launcher dependency-import failures with a bounded diagnostic and no stack", () => {
    // Everything written by this test stays under the project's ignored cache.
    const cache = fileURLToPath(new URL("../.cache", import.meta.url));
    mkdirSync(cache, { recursive: true });
    const sandbox = mkdtempSync(join(cache, "cli-startup-"));
    try {
      mkdirSync(join(sandbox, "node_modules/esbuild"), { recursive: true });
      const launcher = join(sandbox, "mansions.mjs");
      copyFileSync(fileURLToPath(new URL("../scripts/mansions.mjs", import.meta.url)), launcher);
      writeFileSync(join(sandbox, "node_modules/esbuild/package.json"), JSON.stringify({
        name: "esbuild", type: "module", exports: "./index.js"
      }));
      writeFileSync(join(sandbox, "node_modules/esbuild/index.js"), 'export function build() {}\nthrow new Error("Synthetic dependency-import failure");\n');
      const child = spawnSync(process.execPath, [launcher, "--help"], {
        cwd: sandbox, encoding: "utf8", timeout: 30000
      });
      expect(child.error).toBeUndefined();
      expect(child.status).toBe(1);
      expect(child.stdout).toBe("");
      expect(child.stderr).toBe("mansions: CLI startup failed; run npm ci --ignore-scripts inside mansions/.\n");
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  });
});
