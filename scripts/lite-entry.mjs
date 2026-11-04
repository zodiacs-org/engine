// The checks of @zodiacs/engine/lite's build, L1, L2, L3 and L8 of
// docs/evidence/1.1.0-rc.2-20261102/lite/PREREGISTRATION.md, section 3.
// scripts/module-resolution-smoke.mjs runs them on this checkout's build
// (npm run exports:smoke); scripts/lite-entry.test.mjs runs them on
// synthetic builds that each must fail.
//
// - L1, static closure: from dist/lite.js every specifier is relative and
//   under dist/; no file of the entry holds `import(`; dist/lite.js imports
//   exactly the four parts, and holds their four export lines and nothing
//   else; no part holds an import or export-from statement.
// - L2, module list and markers: the build's module list (esbuild's, both
//   lists merged: readModuleList in scripts/root-isolation.mjs) describes
//   every dist/*.js byte for byte; the entry's import closure over sources is
//   the pinned list below; each part's sources, and the modules it holds by
//   the list and by its `// src/...` markers, are inside its own pinned list;
//   nothing is under node_modules/.
// - L3, fingerprints: no file of the entry holds a string of
//   EPHEMERIS_FINGERPRINTS.
// - L8, one set of names: the runtime names of dist/lite.js, each part's
//   runtime names, the names dist/lite.d.ts declares (read with the
//   TypeScript checker as scripts/api-report.mjs reads them) and the names
//   src/lite.ts exports are LITE_NAMES', and no name is lost to two parts
//   exporting it.
import assert from "node:assert/strict";
import ts from "typescript";

import { checkModuleList, staticGraph } from "./root-isolation.mjs";

/** The parts, in the order src/lite.ts and dist/lite.js name them. */
export const LITE_PARTS = Object.freeze(["declinations", "sect", "composite", "dignities"]);

/**
 * L2's pin: the source modules each file of the entry may hold, from the
 * imports of the modules they are built from (type-only imports are erased).
 * `src/lite.ts` and 15 modules in all.
 */
export const LITE_SOURCES = Object.freeze({
  "dist/lite.js": Object.freeze(["src/lite.ts"]),
  "dist/lite-declinations.js": Object.freeze(["src/lite/declinations.ts", "src/declination.ts", "src/exact.ts", "src/body-label.ts"]),
  "dist/lite-sect.js": Object.freeze(["src/lite/sect.ts", "src/sect.ts", "src/points.ts", "src/signs.ts", "src/read-options.ts"]),
  "dist/lite-composite.js": Object.freeze([
    "src/lite/composite.ts", "src/techniques/composite.ts", "src/techniques/names.ts", "src/read-options.ts", "src/aspects.ts",
    "src/points.ts", "src/signs.ts"
  ]),
  "dist/lite-dignities.js": Object.freeze([
    "src/lite/dignities.ts", "src/techniques/dignities.ts", "src/techniques/names.ts", "src/read-options.ts", "src/signs.ts"
  ])
});

/** L8: the 51 names, 27 values and 24 types, by part. */
export const LITE_NAMES = Object.freeze({
  declinations: Object.freeze({
    values: Object.freeze([
      "DEFAULT_DECLINATION_ORB_POLICY", "RA_POLE_TOLERANCE", "SUN_BOUND_LATITUDE", "declinationOf", "declinationOrb",
      "declinationsForBodies", "eclipticToEquatorial", "findDeclinationAspects"
    ]),
    types: Object.freeze([
      "DeclinationAspect", "DeclinationAspectType", "DeclinationBody", "DeclinationOrbPolicy", "DeclinationRow", "Declinations",
      "EquatorialCoordinates"
    ])
  }),
  sect: Object.freeze({
    values: Object.freeze(["DIURNAL_PLANETS", "NOCTURNAL_PLANETS", "SECT_CONVENTIONS", "orientality", "sectReading"]),
    types: Object.freeze(["AltitudeSectInput", "EclipticSectInput", "Orientality", "SectConvention", "SectInput", "SectReading"])
  }),
  composite: Object.freeze({
    values: Object.freeze(["compositeAspects", "compositeMidpoints"]),
    types: Object.freeze(["CompositeAspect", "CompositePosition"])
  }),
  dignities: Object.freeze({
    values: Object.freeze([
      "CHALDEAN_FACES", "CLASSICAL_PLANETS", "DOMICILE_RULERS", "EGYPTIAN_TERMS", "EXALTATIONS", "TRIPLICITY_LORDS", "dignitiesFor",
      "dignityFor", "dignityRulersAt", "essentialDignities", "hasClassicalDignities", "mutualReceptions"
    ]),
    types: Object.freeze([
      "ClassicalPlanet", "Debility", "DignityRulers", "DignitySpan", "EssentialDignity", "MutualReception", "PlanetDignities",
      "ReceptionOptions", "SignDignity"
    ])
  })
});

/**
 * L3: astronomy-engine's name, the two strings of its code that zodiacs.org's
 * bundle report looks for, and the id of the ΔT model that comes with the
 * engine's ephemeris.
 */
export const EPHEMERIS_FINGERPRINTS = Object.freeze([
  "astronomy-engine", "Value is not boolean:", "Light-travel time solver did not converge", "zodiacs-deltat/1"
]);

/** Import and export-from statements as the build writes them, at the start of a line. */
const STATEMENTS = /^(?:import|export)\s[^;]*?\bfrom\s*["']([^"']+)["']|^import\s*["']([^"']+)["']/gmu;
const sorted = (list) => [...list].sort();

const PART_FILES = LITE_PARTS.map((part) => `dist/lite-${part}.js`);
const ENTRY_FILES = ["dist/lite.js", ...PART_FILES];

/** The entry's files must all be in the build. */
function present(files) {
  for (const file of ENTRY_FILES) assert(files.includes(file), `${file} is not in the build`);
}

/**
 * L1: no file of the entry holds a dynamic import; dist/lite.js imports the
 * four parts and holds nothing else; no part imports or re-exports a module.
 * `files` are the dist/*.js paths ("dist/lite.js" and the like) and
 * `read(path)` gives a file's text. Throws an AssertionError.
 */
export function checkLiteClosure({ files, read }) {
  present(files);
  for (const file of ENTRY_FILES) assert(!/\bimport\s*\(/u.test(read(file)), `dynamic import in ${file}`);
  const entry = read("dist/lite.js");
  const specifiers = [...entry.matchAll(STATEMENTS)].map((match) => match[1] ?? match[2]);
  assert.deepEqual(specifiers, LITE_PARTS.map((part) => `./lite-${part}.js`),
    "dist/lite.js must import exactly the four lite parts, declinations, sect, composite and dignities, in that order");
  assert.equal(entry, LITE_PARTS.map((part) => `export * from "./lite-${part}.js";\n`).join(""),
    "dist/lite.js must hold the four export lines of its parts and nothing else");
  for (const file of PART_FILES) {
    for (const specifier of [...read(file).matchAll(STATEMENTS)].map((match) => match[1] ?? match[2])) {
      assert.fail(`${file} imports or re-exports ${specifier}; a lite part must import nothing`);
    }
  }
}

/** L3: no file of the entry holds a string of EPHEMERIS_FINGERPRINTS. Throws an AssertionError. */
export function checkLiteFingerprints({ files, read }) {
  present(files);
  for (const file of ENTRY_FILES) {
    const code = read(file);
    for (const print of EPHEMERIS_FINGERPRINTS) assert(!code.includes(print), `${file} holds ${JSON.stringify(print)}`);
  }
}

/**
 * L2: `metafile`, the build's merged module list, describes every dist/*.js
 * file byte for byte; the entry's sources are the pinned ones; each part's
 * sources, held modules and marked modules are inside its own pin; nothing
 * is under node_modules/. Throws an AssertionError; returns the entry's
 * static graph.
 */
export function checkLiteModules({ metafile, files, read }) {
  present(files);
  checkModuleList({ metafile, files, read });
  const graph = staticGraph({ metafile, read, entryOutput: "dist/lite.js", entrySource: "src/lite.ts" });
  assert.deepEqual(graph.outputs, sorted(ENTRY_FILES), "the lite entry's static graph must be dist/lite.js and its four parts");
  assert.deepEqual(graph.sources, sorted(new Set(Object.values(LITE_SOURCES).flat())), "the lite entry's source graph is not the pinned one");
  for (const reading of [graph.sources, graph.held, graph.marked]) {
    for (const source of reading) assert(!source.includes("node_modules/"), `the lite entry holds ${source}`);
  }
  assert.deepEqual(Object.keys(metafile.outputs["dist/lite.js"].inputs ?? {}), ["src/lite.ts"], "dist/lite.js holds a module but src/lite.ts");
  for (const [index, file] of PART_FILES.entries()) {
    const pinned = LITE_SOURCES[file];
    const part = staticGraph({ metafile, read, entryOutput: file, entrySource: `src/lite/${LITE_PARTS[index]}.ts` });
    assert.deepEqual(part.outputs, [file], `${file} loads another file`);
    for (const source of new Set([...part.sources, ...part.held, ...part.marked])) {
      assert(pinned.includes(source), `${file} holds ${source}, which is not among its pinned modules`);
    }
  }
  return graph;
}

/**
 * The checks of the built entry, L3, L1 and L2 in that order, so that a
 * build that fails one of them names its own fault first. Throws an
 * AssertionError naming the first fault; returns the entry's static graph.
 */
export function checkLiteEntry({ metafile, files, read }) {
  checkLiteFingerprints({ files, read });
  checkLiteClosure({ files, read });
  return checkLiteModules({ metafile, files, read });
}

/** Every name of LITE_NAMES, values and types, sorted. */
export function liteNames() {
  return {
    values: sorted(LITE_PARTS.flatMap((part) => LITE_NAMES[part].values)),
    types: sorted(LITE_PARTS.flatMap((part) => LITE_NAMES[part].types))
  };
}

/**
 * The names a module exports, read with the TypeScript checker as
 * scripts/api-report.mjs reads a declaration file: `values`, those with a
 * value, and `types`, the rest, each sorted. `file` is a path to a .d.ts or
 * .ts file.
 */
export function declaredNames(file) {
  const program = ts.createProgram([file], {
    strict: true,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    target: ts.ScriptTarget.ES2022,
    types: [],
    noEmit: true
  });
  const checker = program.getTypeChecker();
  const source = program.getSourceFile(file);
  assert(source, `no source file at ${file}`);
  const values = [];
  const types = [];
  for (const symbol of checker.getExportsOfModule(checker.getSymbolAtLocation(source))) {
    const target = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
    (target.flags & ts.SymbolFlags.Value ? values : types).push(symbol.name);
  }
  return { values: sorted(values), types: sorted(types) };
}

/**
 * L8. `runtime` is the names dist/lite.js gives at run time; `parts`, each
 * part's file's names by part; `declared`, declaredNames of dist/lite.d.ts;
 * `source`, declaredNames of src/lite.ts. Any of them may be left out.
 */
export function checkLiteNames({ runtime, parts, declared, source }) {
  const all = liteNames();
  if (parts) {
    assert.deepEqual(Object.keys(parts), [...LITE_PARTS], "the parts' names must be read for each of the four parts");
    const seen = new Map();
    for (const part of LITE_PARTS) {
      for (const name of parts[part]) {
        assert(!seen.has(name), `${name} is exported by two parts, ${seen.get(name)} and ${part}, and so by neither through dist/lite.js`);
        seen.set(name, part);
      }
    }
    for (const part of LITE_PARTS) {
      assert.deepEqual(sorted(parts[part]), sorted(LITE_NAMES[part].values), `dist/lite-${part}.js exports other names than its part's`);
    }
  }
  if (runtime) assert.deepEqual(sorted(runtime), all.values, "dist/lite.js gives other names at run time than the lite entry's 27 values");
  for (const [what, names] of [["dist/lite.d.ts", declared], ["src/lite.ts", source]]) {
    if (!names) continue;
    assert.deepEqual(names.values, all.values, `${what} declares other values than the lite entry's 27`);
    assert.deepEqual(names.types, all.types, `${what} declares other types than the lite entry's 24`);
  }
}
