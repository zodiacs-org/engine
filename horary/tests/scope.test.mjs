import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { assertChangedPaths, assertSourceFiles, assertPackageExclusion } from "../scripts/scope-checks.mjs";

describe("horary isolation gate", () => {
  it("rejects changed paths outside the project, including rename origins", () => {
    expect(() => assertChangedPaths(["horary/src/index.ts", "horary/README.md"])).not.toThrow();
    for (const path of ["src/api.ts", "dist/index.js", "package.json", "README.md", "artifacts/archive.tgz",
      "horary/../src/api.ts", "horary//src/a.ts", "/horary/src/a.ts"]) {
      expect(() => assertChangedPaths(["horary/src/index.ts", path])).toThrow();
    }
  });

  it("checks byte boundaries, docs, regular files and ignored material without writing git metadata", () => {
    const cache = fileURLToPath(new URL("../.cache/", import.meta.url));
    mkdirSync(cache, { recursive: true });
    const repository = mkdtempSync(join(cache, "scope-"));
    mkdirSync(join(repository, "horary"));
    const path = "horary/fixture.txt", file = join(repository, path);
    try {
      expect(() => assertSourceFiles([], repository)).toThrow(/no horary/);
      writeFileSync(file, "x".repeat(1_999_999));
      expect(() => assertSourceFiles([path], repository)).not.toThrow();
      writeFileSync(file, "x".repeat(2_000_000));
      expect(() => assertSourceFiles([path], repository)).toThrow(/file-size limit/);
      writeFileSync(file, "Synthetic documentation \u2014 invalid punctuation.");
      expect(() => assertSourceFiles([path], repository)).toThrow(/em-dash/);
      // Count bytes, not UTF-16 code units.
      writeFileSync(file, "é".repeat(1_000_000));
      expect(() => assertSourceFiles([path], repository)).toThrow(/file-size limit/);
      symlinkSync("missing-target", join(repository, "horary/link.md"));
      expect(() => assertSourceFiles(["horary/link.md"], repository)).toThrow(/regular file/);
      expect(() => assertSourceFiles(["horary"], repository)).toThrow(/outside/);
      for (const dir of ["node_modules", ".cache", "coverage", "generated", "output"]) {
        expect(() => assertSourceFiles([`horary/${dir}/file.json`], repository)).toThrow(/generated or installed/);
        expect(() => assertSourceFiles([`horary/tests/${dir}/file.json`], repository)).toThrow(/generated or installed/);
      }
      expect(() => assertSourceFiles(["horary/state.tsbuildinfo"], repository)).toThrow(/generated or installed/);
    } finally { rmSync(repository, { recursive: true, force: true }); }
  });

  it("requires an npm file list and rejects any horary package leakage", () => {
    expect(() => assertPackageExclusion({ files: [{ path: "package.json" }, { path: "dist/index.js" }] })).not.toThrow();
    for (const report of [null, {}, { files: [] }, { files: [{ path: null }] },
      { files: [{ path: "horary" }] }, { files: [{ path: "horary/src/index.ts" }] }]) {
      expect(() => assertPackageExclusion(report)).toThrow();
    }
  });
});
