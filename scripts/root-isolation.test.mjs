// Cases for scripts/root-isolation.mjs, the export smoke test's check that the
// root entry's static graph holds no module of an opt-in entry and no zone
// history. Each case is a synthetic build: an esbuild metafile and the files
// it describes. The 0.1.1-rc.15 check read only `// src/<path>.ts` markers; a
// review defeated it by renaming src/timing/rulers.ts to rulers.mts, which the
// root then imported unseen. These cases fail on such builds whichever reading
// sees them first, and the last one runs the check on this checkout's build.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { OPT_IN_SOURCE, checkRootIsolation, sourceMarkers, staticGraph } from "./root-isolation.mjs";

/** A build: output files with their source modules, and the source import graph. */
function build({ chunkModules = ["src/api.ts", "src/ephemeris.ts"], markers, rootImports = [], extraFiles = {} } = {}) {
  const code = {
    "dist/index.js": 'import { a } from "./chunk-A.js";\nimport "astronomy-engine";\nexport { a };\n',
    "dist/chunk-A.js": `${(markers ?? chunkModules).map((path) => `// ${path}\nvar x${path.length} = 1;\n`).join("")}export { a };\n`,
    "dist/timing.js": '// src/timing/rulers.ts\nvar r = 1;\nimport { a } from "./chunk-A.js";\nexport { r };\n',
    "dist/tzdb-2025c-00-X.js": "// src/tzdb/shard-00.ts\nexport const z = 1;\n",
    ...extraFiles
  };
  const outputs = {
    "dist/index.js": {
      bytes: 0, entryPoint: "src/index.ts", inputs: { "src/index.ts": {} },
      imports: [{ path: "dist/chunk-A.js", kind: "import-statement" }, { path: "astronomy-engine", kind: "import-statement", external: true }]
    },
    "dist/chunk-A.js": { bytes: 0, inputs: Object.fromEntries(chunkModules.map((path) => [path, {}])), imports: [] },
    "dist/timing.js": {
      bytes: 0, entryPoint: "src/timing.ts", inputs: { "src/timing/rulers.ts": {} },
      imports: [{ path: "dist/chunk-A.js", kind: "import-statement" }, { path: "dist/tzdb-2025c-00-X.js", kind: "dynamic-import" }]
    },
    "dist/tzdb-2025c-00-X.js": { bytes: 0, inputs: { "src/tzdb/shard-00.ts": {} }, imports: [] }
  };
  for (const [path, text] of Object.entries(code)) {
    outputs[path] ??= { bytes: 0, inputs: {}, imports: [] };
    outputs[path].bytes = Buffer.byteLength(text);
  }
  const inputs = {
    "src/index.ts": { imports: [{ path: "src/api.ts", kind: "import-statement" }, ...rootImports.map((path) => ({ path, kind: "import-statement" }))] },
    "src/api.ts": { imports: [{ path: "src/ephemeris.ts", kind: "import-statement" }, { path: "astronomy-engine", kind: "import-statement", external: true }] },
    "src/ephemeris.ts": { imports: [] },
    "src/timing.ts": { imports: [{ path: "src/timing/rulers.ts", kind: "import-statement" }] },
    "src/timing/rulers.ts": { imports: [] },
    "src/timing/rulers.mts": { imports: [] },
    "src/vedic/my dasha.ts": { imports: [] },
    "src/tzdb/shard-00.ts": { imports: [] }
  };
  for (const path of chunkModules) inputs[path] ??= { imports: [] };
  return { metafile: { inputs, outputs }, files: Object.keys(code), read: (path) => code[path] };
}

describe("the root entry's isolation check", () => {
  it("passes a root that reaches only core modules, and reads them both ways", () => {
    const graph = checkRootIsolation(build());
    expect(graph.outputs).toEqual(["dist/chunk-A.js", "dist/index.js"]);
    expect(graph.sources).toEqual(["src/api.ts", "src/ephemeris.ts", "src/index.ts"]);
    expect(graph.marked).toEqual(["src/api.ts", "src/ephemeris.ts"]);
  });

  it("finds a timing module whatever its extension: the review's rulers.mts", () => {
    const bypass = build({ chunkModules: ["src/api.ts", "src/ephemeris.ts", "src/timing/rulers.mts"], rootImports: ["src/timing/rulers.mts"] });
    expect(() => checkRootIsolation(bypass)).toThrow(/the root entry reaches src\/timing\/rulers\.mts/);
    // The rc.15 marker pattern could not see it; the one used now does.
    const code = bypass.read("dist/chunk-A.js");
    expect([...code.matchAll(/^\/\/ (src\/\S+\.ts)$/gmu)].map((match) => match[1])).not.toContain("src/timing/rulers.mts");
    expect(sourceMarkers(code)).toContain("src/timing/rulers.mts");
  });

  it("finds a module whose path has a space, and the opt-in entry files themselves", () => {
    for (const path of ["src/vedic/my dasha.ts", "src/geo.ts", "src/timing.mts", "src/tzdb/shard-00.ts", "src/geo/calendar.js"]) {
      expect(() => checkRootIsolation(build({ chunkModules: ["src/api.ts", "src/ephemeris.ts", path] }))).toThrow(/the root entry reaches src\//);
    }
    expect([..."// src/vedic/my dasha.ts\n".matchAll(/^\/\/ (src\/\S+\.ts)$/gmu)]).toEqual([]);
    expect(sourceMarkers("// src/vedic/my dasha.ts\n")).toEqual(["src/vedic/my dasha.ts"]);
  });

  it("finds a module from either reading alone", () => {
    // Listed for the root but not marked, as for code without a marker.
    expect(() => checkRootIsolation(build({
      chunkModules: ["src/api.ts", "src/ephemeris.ts", "src/timing/rulers.mts"], markers: ["src/api.ts", "src/ephemeris.ts"]
    }))).toThrow(/reaches src\/timing\/rulers\.mts/);
    // Imported by the root's source but held in no file of its graph.
    expect(() => checkRootIsolation(build({ rootImports: ["src/timing/rulers.ts"] }))).toThrow(/reaches src\/timing\/rulers\.ts/);
  });

  it("refuses a module list that does not describe the build", () => {
    // A marked module the list does not give for its file.
    expect(() => checkRootIsolation(build({ markers: ["src/api.ts", "src/ephemeris.ts", "src/other.ts"] })))
      .toThrow(/marks src\/other\.ts, which the build's module list does not give/);
    // A file changed since the list was written.
    const stale = build();
    const read = stale.read;
    expect(() => checkRootIsolation({ ...stale, read: (path) => (path === "dist/chunk-A.js" ? `${read(path)}// more\n` : read(path)) }))
      .toThrow(/dist\/chunk-A\.js differs from the build's module list/);
    // A file the list does not name, and a list with no outputs.
    expect(() => checkRootIsolation({ ...stale, files: [...stale.files, "dist/chunk-B.js"] })).toThrow(/names other files/);
    expect(() => checkRootIsolation({ ...stale, metafile: undefined })).toThrow(/metafile-esm\.json is missing/);
  });

  it("refuses a zone history in the root's static graph, and follows no dynamic import", () => {
    const shard = build();
    shard.metafile.outputs["dist/index.js"].imports.push({ path: "dist/tzdb-2025c-00-X.js", kind: "import-statement" });
    expect(() => checkRootIsolation(shard)).toThrow(/zone-history shard dist\/tzdb-2025c-00-X\.js/);
    const timing = staticGraph({ ...build(), entryOutput: "dist/timing.js", entrySource: "src/timing.ts" });
    expect(timing.outputs).not.toContain("dist/tzdb-2025c-00-X.js");
    expect(timing.held).toContain("src/timing/rulers.ts");
  });

  it("names the opt-in sources by directory and entry file, not by extension", () => {
    for (const path of ["src/timing.ts", "src/vedic.mts", "src/geo/timezone.ts", "src/tzdb/x.js", "src/timing/a b.cts"]) expect(OPT_IN_SOURCE.test(path)).toBe(true);
    for (const path of ["src/api.ts", "src/timing-shared.ts", "src/geometry.ts", "src/vedicx/a.ts"]) expect(OPT_IN_SOURCE.test(path)).toBe(false);
  });

  it("names the modules of the calc, window, techniques, houses and sky entries, and not the root's houses.ts", () => {
    for (const path of [
      "src/calc.ts", "src/calc-frames.ts", "src/calc-reduce.mts", "src/window.ts", "src/window-ranges.ts",
      "src/techniques.ts", "src/techniques/returns.ts", "src/sky.ts", "src/sky/riseset.ts", "src/houses-extra.ts", "src/houses-extra.mts",
      "src/equator.ts", "src/first-millisecond.ts", "src/first-millisecond.mts"
    ]) expect(OPT_IN_SOURCE.test(path), path).toBe(true);
    for (const path of [
      "src/houses.ts", "src/calculus.ts", "src/windows.ts", "src/skyline.ts", "src/techniquesx/a.ts", "src/first-milliseconds.ts",
      "src/frame.ts", "src/nutation.ts", "src/equatorial.ts"
    ]) {
      expect(OPT_IN_SOURCE.test(path), path).toBe(false);
    }
    const bypass = build({ chunkModules: ["src/api.ts", "src/ephemeris.ts", "src/window-ranges.ts"], rootImports: ["src/window-ranges.ts"] });
    expect(() => checkRootIsolation(bypass)).toThrow(/the root entry reaches src\/window-ranges\.ts/);
  });

  it.runIf(existsSync(new URL("../dist/metafile-esm.json", import.meta.url)))("passes this checkout's build", () => {
    const dist = new URL("../dist/", import.meta.url);
    const graph = checkRootIsolation({
      metafile: JSON.parse(readFileSync(new URL("metafile-esm.json", dist), "utf8")),
      files: readdirSync(dist).filter((name) => name.endsWith(".js")).map((name) => `dist/${name}`),
      read: (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8")
    });
    expect(graph.sources).toContain("src/ephemeris.ts");
  });
});
