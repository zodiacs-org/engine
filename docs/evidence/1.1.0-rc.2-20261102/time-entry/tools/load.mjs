// Loads the package under test for the time entry's checks. `root` is the
// directory that holds its package.json and dist/: the candidate installed in
// a scratch consumer (node_modules/@zodiacs/engine), or a build. Entries are
// imported by the file the package's "exports" names, and astronomy-engine as
// a module of that package would resolve it, so that the checks and the
// engine share one astronomy-engine module and its ΔT setting. Reads only
// the files it names.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

/** The package's manifest. */
export function manifest(root) {
  return JSON.parse(readFileSync(join(resolve(root), "package.json"), "utf8"));
}

/** The module an entry (".", "./time", ...) of the package at `root` gives. */
export async function entry(root, subpath) {
  const target = manifest(root).exports[subpath];
  if (!target) throw new Error(`the package at ${root} exports no ${subpath}`);
  return import(pathToFileURL(join(resolve(root), target.import)).href);
}

/** astronomy-engine's ESM build, as resolved from the package at `root`. */
export async function astronomy(root) {
  const require = createRequire(join(resolve(root), "package.json"));
  // Its CommonJS main, then the directory of the package.json that names it.
  let directory = dirname(require.resolve("astronomy-engine"));
  const named = (dir) => {
    try {
      return JSON.parse(readFileSync(join(dir, "package.json"), "utf8")).name === "astronomy-engine";
    } catch {
      return false;
    }
  };
  while (!named(directory)) {
    if (dirname(directory) === directory) throw new Error("astronomy-engine's package.json was not found");
    directory = dirname(directory);
  }
  const own = JSON.parse(readFileSync(join(directory, "package.json"), "utf8"));
  return { module: await import(pathToFileURL(join(directory, own.exports["."].import)).href), version: own.version };
}

/** `--name value` arguments as an object; a flag without a value is true. */
export function options(argv = process.argv.slice(2)) {
  const out = {};
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    if (!name.startsWith("--")) throw new Error(`unexpected argument ${name}`);
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) out[name.slice(2)] = true;
    else {
      out[name.slice(2)] = next;
      index += 1;
    }
  }
  return out;
}

/** Writes a check's report to `out` (if given) and stdout; exits 1 when it did not pass. */
export async function finish(report, out) {
  const text = `${JSON.stringify(report, null, 1)}\n`;
  if (out) (await import("node:fs")).writeFileSync(out, text);
  process.stdout.write(text);
  process.exitCode = report.pass ? 0 : 1;
}
