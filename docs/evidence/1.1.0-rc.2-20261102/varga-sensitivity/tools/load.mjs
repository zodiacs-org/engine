/*
 * Shared by run.mjs, checker.mjs and the control tools of the varga
 * sensitivity check (PREREGISTRATION.md beside this folder): the package
 * under test, the corpora and the calls they make. Synthetic births only.
 *
 * The package is the build in the repository's dist/ (npm run build), or the
 * dist/ directory ZODIACS_ENGINE_DIST names. Only its public entry points are
 * used: the root (index.js) and @zodiacs/engine/vedic (vedic.js).
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const HERE = fileURLToPath(new URL(".", import.meta.url));
/** The evidence folder, beside this tools folder. */
export const FOLDER = resolve(HERE, "..");
export const ROOT = resolve(HERE, "../../../../..");

export const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

/** The package under test: its two entry points, its dist/ directory, version and a digest of its JavaScript files. */
export async function loadEngine() {
  const dist = resolve(process.env.ZODIACS_ENGINE_DIST ?? resolve(ROOT, "dist"));
  const root = await import(pathToFileURL(resolve(dist, "index.js")).href);
  const vedic = await import(pathToFileURL(resolve(dist, "vedic.js")).href);
  const hash = createHash("sha256");
  const files = readdirSync(dist).filter((name) => name.endsWith(".js")).sort();
  for (const name of files) hash.update(`${name}\n`).update(readFileSync(resolve(dist, name)));
  return { root, vedic, dist, version: root.ENGINE_VERSION, jsFiles: files.length, jsDigest: hash.digest("hex") };
}

/**
 * The calls of a corpus, in its order: F2 or F4 (births.json, births-erfa.json,
 * or a development corpus written by generate.mjs with another seed), each
 * birth a BirthInput with the corpus's shared input, an ayanamsa (a name, or
 * a userAyanamsa input) and the corpus's options with the birth's points; or
 * F3 (seams.json), each case with its own input, ayanamsa and options.
 */
export function callsOf(corpus, name) {
  if (Array.isArray(corpus.cases)) {
    return corpus.cases.map((entry) => ({
      corpus: name, id: entry.id, birth: entry.input, ayanamsa: entry.ayanamsa, options: entry.options,
      expected: entry.expected ?? null
    }));
  }
  return corpus.births.map(({ id, ayanamsa, points, ...fields }) => ({
    corpus: name, id, birth: { ...corpus.input, ...fields }, ayanamsa, options: { ...corpus.options, points }, expected: null
  }));
}

/** The ayanamsa a call names: a built-in name, or a definition made by userAyanamsa from its input. */
export const ayanamsaOf = (vedic, ayanamsa) => (typeof ayanamsa === "string" ? ayanamsa : vedic.userAyanamsa(ayanamsa));

/** The 18 keys' change boundaries of F1 (src/vedic/fixtures/varga-changes.json): key → Map(T → [below, at, change]). */
export function changeRows(path = resolve(ROOT, "src/vedic/fixtures/varga-changes.json")) {
  const fixture = readJson(path);
  return new Map(Object.entries(fixture.varga).map(([key, rows]) => [key, new Map(rows.map(([t, below, at, change]) => [t, [below, at, change]]))]));
}

/** A row's key in F1: "D9", or "D2cyclic". */
export const keyOf = (row) => (row.scheme === "cyclic" ? `${row.varga}cyclic` : row.varga);

/** Command-line options as a Map of "--name" to value; a flag without a value maps to true. */
export function options(argv, known) {
  const out = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    if (!known.includes(name)) throw new Error(`Unknown option ${name}; known: ${known.join(", ")}.`);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) out.set(name, true);
    else {
      out.set(name, value);
      index += 1;
    }
  }
  return out;
}
