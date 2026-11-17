// @zodiacs/engine/core (ZOD-292): the root's names, computed on
// astronomy-engine, without the shipped DE440 pack. These run the core build
// (scripts/core-entry.mjs) in memory, so they need no `npm run build`, and
// load the bundle as an application would, beside this checkout's root
// (src/index.ts): no module of the pack in the bundle; the root's export
// names; on every distinct input of the conformance suite's L1 and L2 vectors
// (174 births), natalChart, chartPoints and chartDeclinations equal, as JSON,
// the root's after setDefaultEphemeris("astronomy-engine"), each naming
// astronomy-engine; after setDefaultEphemeris("de440") the root's results when
// its pack cannot be opened ("de440-unavailable"); and inside withEphemeris
// with a pack the caller supplies, the root's on that pack; and settings and
// aspect policies of its own, apart from the root's. The bundle's own
// checks are tried on broken builds too. The export smoke test checks the
// built dist/core.js, and its conformance verdicts.
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { conformanceBirths } from "./conformance-inputs.mjs";
import { CORE_BANNED_SOURCES, buildCore, checkCoreBuild } from "./core-entry.mjs";

const ASTRONOMY_ENGINE = { name: "astronomy-engine", version: "2.1.19" };

let folder;
let built;
let core;
beforeAll(async () => {
  built = await buildCore();
  folder = mkdtempSync(join(tmpdir(), "core-entry-"));
  const modules = join(folder, "node_modules");
  mkdirSync(join(modules, "core-entry-test"), { recursive: true });
  symlinkSync(fileURLToPath(new URL("../node_modules/astronomy-engine", import.meta.url)), join(modules, "astronomy-engine"), "dir");
  writeFileSync(join(modules, "core-entry-test", "core.js"), built.text);
  core = await import(pathToFileURL(join(modules, "core-entry-test", "core.js")).href);
}, 120_000);

afterAll(() => {
  vi.doUnmock("../src/de440/pack-data.ts");
  vi.resetModules();
  if (folder) rmSync(folder, { recursive: true, force: true });
});

/** A new copy of the root's modules, with the pack's text changed when `damage` is given. */
async function freshRoot(damage = false) {
  vi.resetModules();
  if (damage) {
    vi.doMock("../src/de440/pack-data.ts", async (original) => {
      const real = (await original()).DE440_PACK_BASE64;
      const middle = Math.floor(real.length / 2);
      return { DE440_PACK_BASE64: real.slice(0, middle) + (real[middle] === "A" ? "B" : "A") + real.slice(middle + 1) };
    });
  } else vi.doUnmock("../src/de440/pack-data.ts");
  return import("../src/index.ts");
}

/** natalChart, chartPoints and chartDeclinations at each birth, or the error it threw. */
function results(engine, births, wrap = (run) => run()) {
  return births.map(({ id, birth }) => {
    try {
      return wrap(() => {
        const chart = engine.natalChart(birth);
        return { id, chart, points: engine.chartPoints(chart), declinations: engine.chartDeclinations(chart) };
      });
    } catch (error) {
      return { id, error: error instanceof Error ? `${error.name}: ${error.message}` : String(error) };
    }
  });
}

describe("the core build", () => {
  it("holds no module of the pack and imports astronomy-engine alone", () => {
    const { inputs } = checkCoreBuild(built);
    for (const banned of CORE_BANNED_SOURCES) expect(inputs).not.toContain(banned);
    expect(inputs).toContain("src/ephemeris.ts");
    expect(inputs).toContain("src/core/ephemeris-shipped.ts");
    expect(built.text).toMatch(/^\/\/ src\/core\/ephemeris-shipped\.ts$/mu);
  });

  it("refuses a build that holds the pack, imports another module, loads lazily or did not swap", () => {
    const withInput = (path) => ({ ...built, metafile: { ...built.metafile, inputs: { ...built.metafile.inputs, [path]: { bytes: 1, imports: [] } } } });
    const output = built.metafile.outputs["dist/core.js"];
    const withImports = (imports) => ({ ...built, metafile: { ...built.metafile, outputs: { "dist/core.js": { ...output, imports } } } });
    expect(() => checkCoreBuild(withInput("src/de440/pack-data.ts"))).toThrow(/must not hold src\/de440\/pack-data\.ts/);
    expect(() => checkCoreBuild(withInput("src/ephemeris-shipped.ts"))).toThrow(/must not hold src\/ephemeris-shipped\.ts/);
    expect(() => checkCoreBuild({ ...built, text: `${built.text}\n// src/de440-pack.ts\n` })).toThrow(/marks src\/de440-pack\.ts/);
    expect(() => checkCoreBuild(withImports([...output.imports, { path: "dist/chunk-X.js", kind: "import-statement" }]))).toThrow(/astronomy-engine and nothing else/);
    expect(() => checkCoreBuild({ ...built, text: `${built.text}\nawait import("./x.js");\n` })).toThrow(/lazily/);
    expect(() => checkCoreBuild({ ...built, text: `${built.text}\nvar p = "${"QUJD".repeat(300)}";\n` })).toThrow(/base64/);
    expect(() => checkCoreBuild({ ...built, swapped: 0 })).toThrow(/once/);
  });
});

describe("@zodiacs/engine/core, loaded as an application loads it", () => {
  it("exports every name the root exports, each of the same kind", async () => {
    const root = await freshRoot();
    expect(Object.keys(core).sort().map((name) => [name, typeof core[name]])).toEqual(Object.keys(root).sort().map((name) => [name, typeof root[name]]));
  });

  it("keeps its own settings and its own policies, apart from the root's", async () => {
    const root = await freshRoot();
    root.setDefaultEphemeris("de440");
    expect(core.defaultEphemeris().name).toBe("astronomy-engine");
    core.setDefaultEphemeris("de440");
    expect(root.defaultEphemeris().name).toBe("de440");
    root.setDefaultEphemeris("astronomy-engine");
    expect(core.defaultEphemeris().name).toBe("de440");
    core.setDefaultEphemeris("astronomy-engine");
    const bodies = core.natalChart({ utc: "2000-01-01T12:00:00Z", timeKnown: false }).bodies;
    expect(() => core.findConfiguredAspects(bodies, root.createAspectPolicy({}))).toThrow(/createAspectPolicy/);
    expect(() => root.findConfiguredAspects(bodies, core.createAspectPolicy({}))).toThrow(/createAspectPolicy/);
    expect(core.findConfiguredAspects(bodies, core.createAspectPolicy({}))).toEqual(root.findConfiguredAspects(bodies, root.createAspectPolicy({})));
  });

  it("computes on astronomy-engine by default and has no pack to open", () => {
    const source = core.defaultEphemeris();
    expect(source.name).toBe("astronomy-engine");
    expect(source.de440.opened).toBe(false);
    expect(source.de440.error).toMatch(/@zodiacs\/engine\/core carries no DE440 pack/);
  });

  it("equals the root after setDefaultEphemeris(\"astronomy-engine\") at every conformance input, and names astronomy-engine", async () => {
    const root = await freshRoot();
    root.setDefaultEphemeris("astronomy-engine");
    const births = conformanceBirths(core.HOUSE_SYSTEMS);
    expect(births).toHaveLength(174);
    const fromCore = results(core, births);
    const fromRoot = results(root, births);
    expect(fromCore.filter((entry) => entry.error)).toEqual([]);
    for (const entry of fromCore) {
      expect(entry.chart.ephemeris).toEqual(ASTRONOMY_ENGINE);
      expect(entry.chart.flags).not.toContain("de440-unavailable");
      expect(entry.chart.bodies.every((row) => row.ephemeris === "astronomy-engine")).toBe(true);
    }
    expect(JSON.stringify(fromCore) === JSON.stringify(fromRoot), "core's results differ from the root's on astronomy-engine").toBe(true);
  });

  it("after setDefaultEphemeris(\"de440\"), equals the root whose pack cannot be opened", async () => {
    const root = await freshRoot(true);
    expect(root.defaultEphemeris().de440.opened).toBe(false);
    const births = conformanceBirths(core.HOUSE_SYSTEMS).slice(0, 40);
    core.setDefaultEphemeris("de440");
    try {
      const fromCore = results(core, births);
      expect(fromCore.every((entry) => entry.chart.flags.includes("de440-unavailable") && entry.chart.ephemeris.name === "astronomy-engine")).toBe(true);
      expect(JSON.stringify(fromCore) === JSON.stringify(results(root, births)), "core's de440-unavailable results differ from the root's").toBe(true);
    } finally {
      core.setDefaultEphemeris("astronomy-engine");
    }
  });

  it("computes on a pack the caller supplies, inside withEphemeris, as the root does", async () => {
    vi.resetModules();
    vi.doUnmock("../src/de440/pack-data.ts");
    const { shippedDe440Source } = await import("../src/de440-pack.ts");
    const root = await freshRoot();
    const supplied = shippedDe440Source();
    const births = conformanceBirths(core.HOUSE_SYSTEMS).slice(0, 40);
    const fromCore = results(core, births, (run) => core.withEphemeris(supplied, run));
    expect(fromCore.every((entry) => entry.chart.ephemeris.name === "jpl-de440")).toBe(true);
    expect(JSON.stringify(fromCore) === JSON.stringify(results(root, births, (run) => root.withEphemeris(supplied, run)))).toBe(true);
    expect(core.defaultEphemeris().name).toBe("astronomy-engine");
  });
});
