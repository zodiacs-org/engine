// Cases for scripts/dist-purity.mjs: the bare chunk imports esbuild's code
// splitting writes and the build step that takes them out
// (scripts/build-chunk-imports.mjs), and the checks
// scripts/verify-dist-purity.mjs makes of dist/. The first cases build a
// package of pure functions with esbuild, the version the build runs, to show
// where the bare imports come from and that a bundler warns of each under
// "sideEffects": false; the others are synthetic module lists.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "esbuild";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { bareImports, bundleOf, dropBareChunkImports, hasTopLevelAwait } from "./dist-purity.mjs";

/** Three entries over two pure modules: a and b take x, which takes y; c takes y. */
const SOURCES = {
  "src/y.js": "export function y(n) { return n * 2; }\n",
  "src/x.js": 'import { y } from "./y.js";\nexport function x(n) { return y(n) + 1; }\n',
  "src/a.js": 'export { x } from "./x.js";\n',
  "src/b.js": 'export { x } from "./x.js";\nexport const onlyB = 1;\n',
  "src/c.js": 'export { y } from "./y.js";\n'
};

let folder;
let built;
beforeAll(async () => {
  folder = mkdtempSync(join(tmpdir(), "dist-purity-"));
  for (const [path, text] of Object.entries(SOURCES)) {
    mkdirSync(join(folder, path, ".."), { recursive: true });
    writeFileSync(join(folder, path), text);
  }
  writeFileSync(join(folder, "package.json"), JSON.stringify({ name: "pure", type: "module", sideEffects: false }));
  const result = await build({
    absWorkingDir: folder,
    entryPoints: ["src/a.js", "src/b.js", "src/c.js"],
    bundle: true,
    splitting: true,
    format: "esm",
    outdir: "out",
    metafile: true,
    write: false,
    logLevel: "silent"
  });
  const texts = new Map(result.outputFiles.map((file) => [`out/${file.path.split(/[/\\]/u).at(-1)}`, file.text]));
  built = { metafile: result.metafile, texts, read: (path) => texts.get(path) };
}, 60_000);

afterAll(() => {
  if (folder) rmSync(folder, { recursive: true, force: true });
});

/** Writes a build's files into the package folder. */
function write(texts) {
  mkdirSync(join(folder, "out"), { recursive: true });
  for (const [path, text] of texts) writeFileSync(join(folder, path), text);
}

describe("esbuild's code splitting", () => {
  it("imports bare, from each entry that takes no name from it, a chunk of pure functions", () => {
    const chunkOfY = Object.keys(built.metafile.outputs).find((path) => built.metafile.outputs[path].inputs["src/y.js"]);
    expect(chunkOfY).toMatch(/^out\/chunk-[A-Z0-9]+\.js$/u);
    const specifier = `./${chunkOfY.slice("out/".length)}`;
    expect(bareImports(built.read("out/a.js"))).toEqual([specifier]);
    expect(bareImports(built.read("out/b.js"))).toEqual([specifier]);
    expect(bareImports(built.read("out/c.js"))).toEqual([]);
  });

  it("gives an application a bare import its bundler drops with an ignored-bare-import warning, and none once the step has run", async () => {
    const application = 'import { x } from "./out/a.js";\nglobalThis.x = x;\n';
    write(built.texts);
    const before = await bundleOf({ root: folder, contents: application });
    expect(before.errors).toHaveLength(1);
    expect(before.errors[0]).toMatch(/^Ignoring this import because "out\/chunk-[A-Z0-9]+\.js" was marked as having no side effects/u);
    const { texts, metafile, dropped } = dropBareChunkImports(built);
    expect(dropped.map(([file]) => file).sort()).toEqual(["out/a.js", "out/b.js"]);
    write(texts);
    const after = await bundleOf({ root: folder, contents: application });
    expect([...after.errors, ...after.warnings]).toEqual([]);
    expect(after.text).toMatch(/\*\s*2/u);
    for (const [path, text] of texts) {
      expect(bareImports(text)).toEqual([]);
      expect(metafile.outputs[path].bytes).toBe(Buffer.byteLength(text));
      expect(metafile.outputs[path].imports.map((edge) => edge.path)).toEqual(
        built.metafile.outputs[path].imports.map((edge) => edge.path).filter((target) => !dropped.some(([file, chunk]) => file === path && chunk === target))
      );
    }
    expect(metafile.outputs["out/c.js"]).toEqual(built.metafile.outputs["out/c.js"]);
    expect(built.metafile.outputs["out/a.js"].bytes).toBe(Buffer.byteLength(built.read("out/a.js")));
  });
});

/** A synthetic build: an entry with a named import of chunk-A and a bare import of chunk-B, and chunk-A's imports. */
function synthetic({ chunkAImports = ["dist/chunk-B.js"], listBare = true } = {}) {
  const code = {
    "dist/index.js": 'import { a } from "./chunk-A.js";\nimport "./chunk-B.js";\nimport "astronomy-engine";\nexport { a };\n',
    "dist/chunk-A.js": `${chunkAImports.map((path) => `import { b } from "./${path.slice("dist/".length)}";\n`).join("")}var a = 1;\nexport { a };\n`,
    "dist/chunk-B.js": "var b = 2;\nexport { b };\n"
  };
  const edges = (paths) => paths.map((path) => ({ path, kind: "import-statement" }));
  const metafile = {
    inputs: {},
    outputs: {
      "dist/index.js": {
        bytes: Buffer.byteLength(code["dist/index.js"]), entryPoint: "src/index.ts", inputs: {},
        imports: [...edges(listBare ? ["dist/chunk-A.js", "dist/chunk-B.js"] : ["dist/chunk-A.js"]), { path: "astronomy-engine", kind: "import-statement", external: true }]
      },
      "dist/chunk-A.js": { bytes: Buffer.byteLength(code["dist/chunk-A.js"]), inputs: {}, imports: edges(chunkAImports) },
      "dist/chunk-B.js": { bytes: Buffer.byteLength(code["dist/chunk-B.js"]), inputs: {}, imports: [] }
    }
  };
  return { metafile, read: (path) => code[path] };
}

describe("dropBareChunkImports", () => {
  it("takes out a bare import of a chunk the file loads through a named import, and keeps the rest of the file", () => {
    const { texts, metafile, dropped } = dropBareChunkImports(synthetic());
    expect(dropped).toEqual([["dist/index.js", "dist/chunk-B.js"]]);
    expect(texts.get("dist/index.js")).toBe('import { a } from "./chunk-A.js";\nimport "astronomy-engine";\nexport { a };\n');
    expect(metafile.outputs["dist/index.js"].imports.map((edge) => edge.path)).toEqual(["dist/chunk-A.js", "astronomy-engine"]);
    expect([...texts.keys()]).toEqual(["dist/index.js"]);
  });

  it("refuses a bare import of a chunk no named import loads, which a bundler would drop", () => {
    expect(() => dropBareChunkImports(synthetic({ chunkAImports: [] }))).toThrow(
      /dist\/index\.js imports dist\/chunk-B\.js only for what its code does when it is evaluated/u
    );
  });

  it("refuses a bare import the module list does not give the file", () => {
    expect(() => dropBareChunkImports(synthetic({ listBare: false }))).toThrow(/does not list once among its imports/u);
  });

  it("leaves a build without bare imports as it is", () => {
    const plain = synthetic();
    const { texts, metafile } = dropBareChunkImports(plain);
    const again = dropBareChunkImports({ metafile, read: (path) => texts.get(path) ?? plain.read(path) });
    expect(again.dropped).toEqual([]);
    expect(again.texts.size).toBe(0);
    expect(again.metafile).toEqual(metafile);
  });
});

describe("the checks of dist/", () => {
  it("reads bare imports of the package's own files only", () => {
    expect(bareImports('import "./chunk-X.js";\nimport \'../y.js\'\nimport { a } from "./chunk-A.js";\nimport "astronomy-engine";\nexport * from "./z.js";\n'))
      .toEqual(["./chunk-X.js", "../y.js"]);
  });

  it("finds an await at the top level and not one inside a function", async () => {
    for (const code of ["await 1;\n", "for await (const a of b) {}\n", "export default await Promise.resolve(1);\n", "if (x) { await y; }\n"]) {
      expect(await hasTopLevelAwait(code), code).toBe(true);
    }
    for (const code of ["export const x = async () => { await 1; };\n", 'export function f() { return import("./x.js"); }\n', "const awaitable = 1;\n"]) {
      expect(await hasTopLevelAwait(code), code).toBe(false);
    }
    await expect(hasTopLevelAwait("export const = ;\n")).rejects.toThrow();
  });
});
