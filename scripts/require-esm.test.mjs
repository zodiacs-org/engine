// require() of @zodiacs/engine, from 3.0.0. Until 2.1.0 every entry point's
// "require" condition named a CommonJS stub that threw ERR_ZODIACS_ESM_ONLY.
// From 3.0.0 there is no stub and no "require" condition: each entry point
// names its one ES module under "default", and require() loads it, as Node
// does unflagged from 20.19.0 and 22.12.0 (require(esm)), the package's
// engines range. That needs no file under dist/ to await at its top level,
// which require() of an ES module refuses.
//
// The first case reads package.json, and needs no build. The others load this
// checkout's build through Node's own require() (createRequire), as a CommonJS
// caller would, so they run once `npm run build` has written dist/; the export
// smoke test and the packed-consumer check make the same calls on the built
// and the packed package.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

import { hasTopLevelAwait } from "./dist-purity.mjs";

const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const dist = new URL("../dist/", import.meta.url);
const built = existsSync(new URL("index.js", dist));
const nameOf = (subpath) => (subpath === "." ? "@zodiacs/engine" : `@zodiacs/engine/${subpath.slice(2)}`);

describe("the package's exports", () => {
  it("send every entry point, imported or required, to its one ES module, and carry no CommonJS file", () => {
    const entries = Object.entries(manifest.exports);
    expect(entries.length).toBeGreaterThan(0);
    for (const [subpath, target] of entries) {
      expect(Object.keys(target), subpath).toEqual(["types", "default"]);
      expect(target.default, subpath).toMatch(/^\.\/dist\/[a-z0-9-]+\.js$/u);
      expect(target.types, subpath).toBe(target.default.replace(/\.js$/u, ".d.ts"));
    }
    expect(manifest.type).toBe("module");
    expect(manifest.files.filter((file) => /\.c[jt]s$/u.test(file))).toEqual([]);
    expect(manifest.scripts.build).not.toMatch(/esm-only/u);
    expect(manifest.engines.node).toBe("^20.19.0 || >=22.12.0");
  });
});

describe.runIf(built)("require() of this checkout's build", () => {
  const require = createRequire(import.meta.url);

  it("loads every entry point, each with the names its declarations give", () => {
    for (const subpath of Object.keys(manifest.exports)) {
      const entry = require(nameOf(subpath));
      expect(typeof entry, subpath).toBe("object");
      expect(Object.keys(entry).length, subpath).toBeGreaterThan(0);
      expect(Object.values(entry).every((value) => value !== undefined), subpath).toBe(true);
    }
  });

  it("loads the root and the pack's entry into one module state, which useDe440() switches for both", () => {
    const root = require("@zodiacs/engine");
    const pack = require("@zodiacs/engine/de440/pack");
    const calc = require("@zodiacs/engine/calc");
    expect(require("@zodiacs/engine/core").natalChart).toBe(root.natalChart);
    const birth = { utc: "2000-01-01T12:00:00Z", timeKnown: false };
    expect(root.defaultEphemeris().name).toBe("astronomy-engine");
    expect(root.natalChart(birth).ephemeris).toEqual({ name: "astronomy-engine", version: "2.1.19" });
    try {
      const source = pack.useDe440();
      expect(source).toBe(pack.shippedDe440Source());
      expect(pack.useDe440()).toBe(source);
      expect(root.defaultEphemeris()).toMatchObject({ name: "de440", de440: { opened: true, version: pack.DE440_PACK.sha256 } });
      expect(root.natalChart(birth).ephemeris).toEqual(source.ephemeris);
      expect(calc.calc({ body: "Sun", time: birth.utc }).receipt.engine.ephemeris).toEqual(source.ephemeris);
    } finally {
      root.setDefaultEphemeris("astronomy-engine");
    }
  });

  it("finds no top-level await in any JavaScript file under dist/", async () => {
    const files = readdirSync(dist).filter((name) => name.endsWith(".js"));
    expect(files).toContain("index.js");
    for (const name of files) expect(await hasTopLevelAwait(readFileSync(new URL(name, dist), "utf8")), name).toBe(false);
  });
});
