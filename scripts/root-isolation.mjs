// The root entry's isolation from the opt-in entry points, read from a build
// in two independent ways:
//
// - from the build's own module list, the esbuild metafile that `npm run
//   build` writes as dist/metafile-esm.json (tsup --metafile; the file is not
//   packed): the output files an entry loads through import statements,
//   transitively, with the source modules each one holds, and the source
//   modules its source file reaches through import statements, transitively;
// - from the comment esbuild writes before each module's code in an output
//   file, `// src/...`, read whatever the path's extension, spaces included.
//
// Either way, no module of an opt-in entry (timing, Vedic, geo, calc,
// window, techniques, houses or sky) and no zone history may be in the root's
// static graph. The two readings must agree:
// every marked module must be one the module list gives for that file, and
// the module list must describe the files on disk byte for byte, so that a
// stale list cannot hide a module either.
import assert from "node:assert/strict";

/**
 * Source paths of the opt-in entries' modules and of the zone histories,
 * whatever the extension: the directories and entry files of timing, Vedic,
 * geo, techniques and sky and the zone histories; the calc and window
 * entries' flat files, src/calc.ts and src/calc-*.ts, src/window.ts and
 * src/window-*.ts; and the houses entry's one file, src/houses-extra.ts
 * (src/houses.ts is the root's own).
 */
export const OPT_IN_SOURCE =
  /^src\/(?:(?:timing|vedic|geo|tzdb|techniques|sky)(?:\/|\.[^/]*$)|(?:calc|window)(?:-[^/]*)?\.[^/]*$|houses-extra\.[^/]*$)/u;

/** The source path of every module esbuild marks in an output file: `// src/...`, any extension. */
export function sourceMarkers(code) {
  return [...code.matchAll(/^\/\/ (src\/.*\S)[ \t]*$/gmu)].map((match) => match[1]);
}

/** A closure over `edges`, following import statements only (not dynamic imports) and no external module. */
function closure(start, edges, what) {
  const seen = new Set();
  const stack = [start];
  while (stack.length > 0) {
    const node = stack.pop();
    if (seen.has(node)) continue;
    const record = edges[node];
    assert(record, `${node} is not in the build's module list (${what}); rebuild with npm run build`);
    seen.add(node);
    for (const edge of record.imports ?? []) {
      if (edge.external || edge.kind !== "import-statement") continue;
      stack.push(edge.path);
    }
  }
  return seen;
}

/**
 * Checks that `metafile` (esbuild's) describes the built JavaScript `files`
 * (paths as the metafile writes them, e.g. "dist/index.js"), whose text
 * `read(path)` returns: the same files with the same bytes.
 */
export function checkModuleList({ metafile, files, read }) {
  assert(metafile && typeof metafile === "object" && metafile.outputs && metafile.inputs,
    "dist/metafile-esm.json is missing or not an esbuild metafile; rebuild with npm run build");
  const listed = Object.keys(metafile.outputs).filter((path) => path.endsWith(".js")).sort();
  assert.deepEqual(listed, [...files].sort(), "the build's module list names other files than dist/ holds; rebuild with npm run build");
  for (const path of listed) {
    assert.equal(Buffer.byteLength(read(path)), metafile.outputs[path].bytes,
      `${path} differs from the build's module list; rebuild with npm run build`);
  }
}

/**
 * An entry's static graph, read both ways: `outputs`, the files it loads
 * through import statements; `sources`, the source modules its source file
 * reaches through import statements; `held`, the source modules those files
 * hold by the module list; and `marked`, the modules they mark. A marked
 * module that the module list does not give for its file fails the check.
 */
export function staticGraph({ metafile, read, entryOutput, entrySource }) {
  const outputs = closure(entryOutput, metafile.outputs, "outputs");
  const sources = closure(entrySource, metafile.inputs, "inputs");
  const held = new Set();
  const marked = new Set();
  for (const output of outputs) {
    const inputs = Object.keys(metafile.outputs[output].inputs ?? {});
    for (const input of inputs) held.add(input);
    for (const marker of sourceMarkers(read(output))) {
      marked.add(marker);
      assert(inputs.includes(marker), `${output} marks ${marker}, which the build's module list does not give for it`);
    }
  }
  const sorted = (set) => [...set].sort();
  return { outputs: sorted(outputs), sources: sorted(sources), held: sorted(held), marked: sorted(marked) };
}

/**
 * The root entry's check: its static graph, read both ways, holds no module
 * of an opt-in entry (OPT_IN_SOURCE) and no zone history. Throws an
 * AssertionError naming the first module found; returns the graph.
 */
export function checkRootIsolation({ metafile, files, read, entryOutput = "dist/index.js", entrySource = "src/index.ts" }) {
  checkModuleList({ metafile, files, read });
  const graph = staticGraph({ metafile, read, entryOutput, entrySource });
  for (const output of graph.outputs) {
    assert(!/(?:^|\/)tzdb-[^/]*$/u.test(output), `zone-history shard ${output} in the static graph of ${entryOutput}`);
  }
  for (const source of new Set([...graph.sources, ...graph.held, ...graph.marked])) {
    assert(!OPT_IN_SOURCE.test(source), `the root entry reaches ${source}`);
  }
  return graph;
}
