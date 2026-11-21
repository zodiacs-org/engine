import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

// The package is ES modules only. require() of any entry point resolves the
// "require" condition to src/esm-only.cjs as built (dist/esm-only.cjs), which
// throws this error; scripts/build-esm-only.mjs says why. The message and the
// code are part of the package's documented behaviour (README, Install), so
// they are pinned here word for word.
const ESM_ONLY_MESSAGE =
  '@zodiacs/engine is ESM-only: require() cannot load it or any of its entry points. ' +
  'Use import { natalChart } from "@zodiacs/engine", or from CommonJS await import("@zodiacs/engine").';
const ESM_ONLY_CODE = "ERR_ZODIACS_ESM_ONLY";

const require = createRequire(import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

function thrownBy(load) {
  try {
    load();
  } catch (error) {
    return error;
  }
  throw new Error("expected a throw");
}

describe("require() of @zodiacs/engine", () => {
  it("the stub throws one stable Error with a code, on every load", () => {
    const path = require.resolve("../src/esm-only.cjs");
    for (let i = 0; i < 2; i += 1) {
      delete require.cache[path];
      const error = thrownBy(() => require(path));
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe(ESM_ONLY_MESSAGE);
      expect(error.code).toBe(ESM_ONLY_CODE);
    }
  });

  it("the message has no em or en dash", () => {
    expect(ESM_ONLY_MESSAGE).not.toMatch(/[\u2013\u2014]/u);
    expect(readFileSync(new URL("../src/esm-only.cjs", import.meta.url), "utf8")).not.toMatch(/[\u2013\u2014]/u);
  });

  it("every entry point sends require to the stub and import to its ES module, and no entry has a default condition", () => {
    const entries = Object.entries(manifest.exports);
    expect(entries.length).toBeGreaterThan(0);
    for (const [subpath, target] of entries) {
      expect(Object.keys(target), subpath).toEqual(["types", "import", "require"]);
      expect(target.import, subpath).toMatch(/^\.\/dist\/[a-z0-9-]+\.js$/u);
      expect(target.require, subpath).toBe("./dist/esm-only.cjs");
    }
  });

  it("the build writes the stub and the package carries it", () => {
    expect(manifest.scripts.build).toMatch(/&& node scripts\/build-esm-only\.mjs$/u);
    expect(manifest.files).toContain("dist/esm-only.cjs");
    expect(manifest.type).toBe("module");
  });
});
