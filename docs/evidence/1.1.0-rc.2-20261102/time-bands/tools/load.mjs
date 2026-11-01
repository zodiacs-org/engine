// Loads the package under test for the time bands' checks. `root` is the
// directory that holds its package.json and dist/: a build (the checkout, or a
// sparse clone at the source commit) or the candidate installed in a scratch
// consumer. Entries are imported by the file the package's "exports" names.
// Reads only the files it names.
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

/** The package's manifest. */
export function manifest(root) {
  return JSON.parse(readFileSync(join(resolve(root), "package.json"), "utf8"));
}

/** The module an entry (".", "./calc", "./time", ...) of the package at `root` gives. */
export async function entry(root, subpath) {
  const target = manifest(root).exports[subpath];
  if (!target) throw new Error(`the package at ${root} exports no ${subpath}`);
  return import(pathToFileURL(join(resolve(root), target.import)).href);
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

/** Writes a check's report to `out` (if given) and a one-line summary to stdout; exits 1 unless it passed and every control failed. */
export function finish(report, out) {
  if (out) writeFileSync(out, `${JSON.stringify(report, null, 1)}\n`);
  const controls = Object.entries(report.controls ?? {}).map(([name, c]) => `${name} ${c.failed ? "failed" : "PASSED"}`);
  process.stdout.write(`${report.check}: ${report.pass ? "pass" : "FAIL"} (${report.records} records)${controls.length ? `; controls: ${controls.join(", ")}` : ""}\n`);
  process.exitCode = report.pass && Object.values(report.controls ?? {}).every((c) => c.failed) ? 0 : 1;
}
