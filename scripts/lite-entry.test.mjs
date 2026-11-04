// Cases for scripts/lite-entry.mjs, the export smoke test's checks of
// @zodiacs/engine/lite's build (L1, L2, L3 and L8 of
// docs/evidence/1.1.0-rc.2-20261102/lite/PREREGISTRATION.md). Each case is a
// synthetic build, an esbuild module list and the files it describes, laid
// out as scripts/build-lite.mjs lays out the real one, and each broken build
// must fail: a part that imports a chunk, a dynamic import, a fifth file, a
// string that comes only with the ephemeris, a part built from a module that
// loads the ephemeris, a stale module list, and names lost or missing. The
// last cases run the checks on this checkout's build.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { EPHEMERIS_FINGERPRINTS, LITE_NAMES, LITE_PARTS, LITE_SOURCES, checkLiteEntry, checkLiteNames, declaredNames, liteNames } from "./lite-entry.mjs";
import { readModuleList } from "./root-isolation.mjs";

/** The source modules' import edges, as the real sources have them. */
const EDGES = {
  "src/lite.ts": LITE_PARTS.map((part) => `src/lite/${part}.ts`),
  "src/lite/declinations.ts": ["src/declination.ts"],
  "src/declination.ts": ["src/body-label.ts", "src/exact.ts"],
  "src/lite/sect.ts": ["src/sect.ts"],
  "src/sect.ts": ["src/points.ts", "src/read-options.ts"],
  "src/points.ts": ["src/signs.ts"],
  "src/lite/composite.ts": ["src/techniques/composite.ts"],
  "src/techniques/composite.ts": ["src/aspects.ts", "src/points.ts", "src/techniques/names.ts"],
  "src/techniques/names.ts": ["src/read-options.ts"],
  "src/lite/dignities.ts": ["src/techniques/dignities.ts"],
  "src/techniques/dignities.ts": ["src/signs.ts", "src/techniques/names.ts"],
  "src/body-label.ts": [], "src/exact.ts": [], "src/signs.ts": [], "src/read-options.ts": [], "src/aspects.ts": [],
  // Not the entry's: what a part built from the relationship module would reach.
  "src/techniques/relationship.ts": ["src/api.ts", "src/techniques/composite.ts"],
  "src/api.ts": ["src/ephemeris.ts"], "src/ephemeris.ts": [], "src/index.ts": ["src/api.ts"]
};

/**
 * A build: the four parts, each holding its pinned modules but its own
 * re-export module, which leaves no code; dist/lite.js; and a root file.
 * `change(code, outputs, inputs)` may break it before the byte counts are
 * taken; `stale` breaks them after.
 */
function liteBuild(change = () => {}, stale = () => {}) {
  const code = {
    "dist/lite.js": LITE_PARTS.map((part) => `export * from "./lite-${part}.js";\n`).join(""),
    "dist/index.js": '// src/api.ts\nvar a = 1;\nimport "astronomy-engine";\nexport { a };\n'
  };
  const outputs = {
    "dist/lite.js": {
      inputs: { "src/lite.ts": {} },
      imports: LITE_PARTS.map((part) => ({ path: `dist/lite-${part}.js`, kind: "import-statement" }))
    },
    "dist/index.js": { inputs: { "src/api.ts": {} }, imports: [{ path: "astronomy-engine", kind: "import-statement", external: true }] }
  };
  for (const part of LITE_PARTS) {
    const file = `dist/lite-${part}.js`;
    const held = LITE_SOURCES[file].filter((path) => path !== `src/lite/${part}.ts`);
    code[file] = `${held.map((path, index) => `// ${path}\nvar v${index} = ${index};\n\n`).join("")}export {\n  v0\n};\n`;
    outputs[file] = { inputs: Object.fromEntries([...held, `src/lite/${part}.ts`].map((path) => [path, {}])), imports: [] };
  }
  const inputs = Object.fromEntries(Object.entries(EDGES).map(([path, edges]) => [path, { imports: edges.map((edge) => ({ path: edge, kind: "import-statement" })) }]));
  change(code, outputs, inputs);
  for (const [path, text] of Object.entries(code)) outputs[path] = { ...(outputs[path] ?? { inputs: {}, imports: [] }), bytes: Buffer.byteLength(text) };
  stale(code, outputs, inputs);
  return { metafile: { inputs, outputs }, files: Object.keys(code), read: (path) => code[path] };
}

describe("the lite entry's checks (L1 to L3)", () => {
  it("pass a build laid out as the entry's, and give its graph", () => {
    const graph = checkLiteEntry(liteBuild());
    expect(graph.outputs).toEqual(["dist/lite-composite.js", "dist/lite-declinations.js", "dist/lite-dignities.js", "dist/lite-sect.js", "dist/lite.js"]);
    expect(graph.sources).toHaveLength(16);
    expect(graph.sources).toContain("src/lite.ts");
  });

  it("refuse a part that imports a chunk, in any form (L1)", () => {
    for (const statement of ['import { x } from "./chunk-A.js";\n', 'export * from "./chunk-A.js";\n', 'import "./chunk-A.js";\n', 'export { y } from "./lite-sect.js";\n']) {
      const broken = liteBuild((code) => {
        code["dist/lite-sect.js"] = statement + code["dist/lite-sect.js"];
      });
      expect(() => checkLiteEntry(broken), statement).toThrow(/dist\/lite-sect\.js imports or re-exports .*; a lite part must import nothing/);
    }
  });

  it("refuses a dynamic import in any file of the entry (L1)", () => {
    for (const file of ["dist/lite.js", "dist/lite-dignities.js"]) {
      const broken = liteBuild((code) => {
        code[file] += 'const later = () => import("./chunk-A.js");\n';
      });
      expect(() => checkLiteEntry(broken), file).toThrow(new RegExp(`dynamic import in ${file.replace(/[\\^$.*+?()[\]{}|/]/gu, "\\$&")}`));
    }
  });

  it("refuses a dist/lite.js that imports a fifth file, misses a part, or holds anything else (L1)", () => {
    const fifth = liteBuild((code, outputs) => {
      code["dist/lite.js"] += 'export * from "./lite-extra.js";\n';
      code["dist/lite-extra.js"] = "export {};\n";
      outputs["dist/lite.js"].imports.push({ path: "dist/lite-extra.js", kind: "import-statement" });
    });
    expect(() => checkLiteEntry(fifth)).toThrow(/must import exactly the four lite parts/);
    const missing = liteBuild((code) => {
      code["dist/lite.js"] = code["dist/lite.js"].replace('export * from "./lite-sect.js";\n', "");
    });
    expect(() => checkLiteEntry(missing)).toThrow(/must import exactly the four lite parts/);
    const more = liteBuild((code) => {
      code["dist/lite.js"] += "export const extra = 1;\n";
    });
    expect(() => checkLiteEntry(more)).toThrow(/must hold the four export lines of its parts and nothing else/);
    const outside = liteBuild((code) => {
      code["dist/lite.js"] = code["dist/lite.js"].replace("./lite-sect.js", "../src/lite/sect.js");
    });
    expect(() => checkLiteEntry(outside)).toThrow(/must import exactly the four lite parts/);
  });

  it("refuses each string that comes only with the ephemeris, in any file of the entry (L3)", () => {
    for (const print of EPHEMERIS_FINGERPRINTS) {
      for (const file of ["dist/lite.js", "dist/lite-composite.js"]) {
        const broken = liteBuild((code) => {
          code[file] += `// ${print}\n`;
        });
        expect(() => checkLiteEntry(broken), `${file} ${print}`).toThrow(new RegExp(`${file.replace(/[\\^$.*+?()[\]{}|/]/gu, "\\$&")} holds`));
      }
    }
  });

  it("refuses a composite part built from the relationship module, whose sources reach the ephemeris (L2)", () => {
    const broken = liteBuild((code, outputs, inputs) => {
      inputs["src/lite/composite.ts"].imports = [{ path: "src/techniques/relationship.ts", kind: "import-statement" }];
      code["dist/lite-composite.js"] = `// src/ephemeris.ts\nvar e = 1;\n\n// src/api.ts\nvar a = 1;\n\n${code["dist/lite-composite.js"]}`;
      Object.assign(outputs["dist/lite-composite.js"].inputs, { "src/ephemeris.ts": {}, "src/api.ts": {}, "src/techniques/relationship.ts": {} });
    });
    expect(() => checkLiteEntry(broken)).toThrow(/the lite entry's source graph is not the pinned one/);
  });

  it("refuses a part that holds a module outside its pin, by the module list or by its markers (L2)", () => {
    const listed = liteBuild((code, outputs) => {
      outputs["dist/lite-sect.js"].inputs["src/declination.ts"] = {};
    });
    expect(() => checkLiteEntry(listed)).toThrow(/dist\/lite-sect\.js holds src\/declination\.ts, which is not among its pinned modules/);
    const marked = liteBuild((code, outputs) => {
      code["dist/lite-dignities.js"] = `// src/aspects.ts\nvar x = 1;\n\n${code["dist/lite-dignities.js"]}`;
      outputs["dist/lite-dignities.js"].inputs["src/aspects.ts"] = {};
    });
    expect(() => checkLiteEntry(marked)).toThrow(/dist\/lite-dignities\.js holds src\/aspects\.ts/);
    const unlisted = liteBuild((code) => {
      code["dist/lite-declinations.js"] = `// src/signs.ts\nvar s = 1;\n\n${code["dist/lite-declinations.js"]}`;
    });
    expect(() => checkLiteEntry(unlisted)).toThrow(/marks src\/signs\.ts, which the build's module list does not give/);
  });

  it("refuses a module list one byte stale, or one that leaves a file out (L2)", () => {
    const stale = liteBuild(() => {}, (code, outputs) => {
      outputs["dist/lite-composite.js"].bytes += 1;
    });
    expect(() => checkLiteEntry(stale)).toThrow(/dist\/lite-composite\.js differs from the build's module list/);
    const unlisted = liteBuild(() => {}, (code, outputs) => {
      delete outputs["dist/lite-sect.js"];
    });
    expect(() => checkLiteEntry(unlisted)).toThrow(/names other files than dist\/ holds/);
  });
});

describe("the lite entry's names (L8)", () => {
  const values = Object.fromEntries(LITE_PARTS.map((part) => [part, [...LITE_NAMES[part].values]]));
  const all = liteNames();

  it("are 51, 27 values and 24 types, and pass when every reading gives them", () => {
    expect([all.values.length, all.types.length]).toEqual([27, 24]);
    expect(new Set([...all.values, ...all.types]).size).toBe(51);
    expect(() => checkLiteNames({ runtime: all.values, parts: values, declared: all, source: all })).not.toThrow();
  });

  it("refuse a lite.d.ts or a source that misses a name, or declares a value as a type", () => {
    expect(() => checkLiteNames({ declared: { values: all.values.filter((name) => name !== "sectReading"), types: all.types } })).toThrow(/dist\/lite\.d\.ts declares other values/);
    expect(() => checkLiteNames({ declared: { values: all.values, types: all.types.filter((name) => name !== "Declinations") } })).toThrow(/dist\/lite\.d\.ts declares other types/);
    expect(() => checkLiteNames({ source: { values: all.values.filter((name) => name !== "dignityFor"), types: [...all.types, "dignityFor"].sort() } })).toThrow(/src\/lite\.ts declares other values/);
  });

  it("refuse two parts exporting one name, which dist/lite.js then loses", () => {
    const twice = { ...values, composite: [...values.composite, "dignityFor"] };
    expect(() => checkLiteNames({ parts: twice })).toThrow(/dignityFor is exported by two parts, composite and dignities/);
    expect(() => checkLiteNames({ runtime: all.values.filter((name) => name !== "dignityFor") })).toThrow(/dist\/lite\.js gives other names/);
    expect(() => checkLiteNames({ parts: { ...values, sect: values.sect.filter((name) => name !== "orientality") } })).toThrow(/dist\/lite-sect\.js exports other names/);
  });
});

const dist = new URL("../dist/", import.meta.url);
describe.runIf(existsSync(new URL("metafile-lite.json", dist)) && existsSync(new URL("lite.d.ts", dist)))("this checkout's build of the lite entry", () => {
  it("passes L1 to L3", () => {
    const graph = checkLiteEntry({
      metafile: readModuleList(dist),
      files: readdirSync(dist).filter((name) => name.endsWith(".js")).map((name) => `dist/${name}`),
      read: (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8")
    });
    expect(graph.sources).toHaveLength(16);
  });

  it("passes L8 at run time and in its declarations", async () => {
    const parts = {};
    for (const part of LITE_PARTS) parts[part] = Object.keys(await import(new URL(`lite-${part}.js`, dist).href));
    const runtime = Object.keys(await import(new URL("lite.js", dist).href));
    expect(() => checkLiteNames({ runtime, parts, declared: declaredNames(fileURLToPath(new URL("lite.d.ts", dist))) })).not.toThrow();
  });
});
