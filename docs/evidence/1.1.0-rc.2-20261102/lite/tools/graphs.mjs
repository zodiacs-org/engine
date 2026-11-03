// Check L11 (../PREREGISTRATION.md, section 3), the part npm run
// package:contents does not: between the build of the commit before the lite
// unit's first commit (L-a) and this one, every entry's import graph but
// ./lite's keeps its files and bytes, except ./techniques's, which grows by
// the moved modules. And its control: the package check with the ./lite
// budget one byte under its measured graph must fail.
//
//   node graphs.mjs --measure <root> --out graphs.json
//   node graphs.mjs --before graphs-before.json --after graphs-after.json [--out report.json]
//   node graphs.mjs --budget-control [--out report.json]
//
// --measure writes each entry's graph as scripts/verify-package-contents.mjs
// counts it: the dist/ files a plain import of the entry loads, statically,
// with their bytes, astronomy-engine not counted. --budget-control runs a
// copy of that script, in a scratch directory and reading this checkout,
// with ./lite's budget set one byte under the graph it measures.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { CHECKOUT, finish, manifest, options } from "./load.mjs";

const args = options();
const out = args.out;

function measure(root) {
  const graphs = {};
  for (const [name, target] of Object.entries(manifest(root).exports)) {
    const sizes = {};
    const visit = (file) => {
      if (file in sizes) return;
      const code = readFileSync(join(root, file), "utf8");
      sizes[file] = Buffer.byteLength(code);
      for (const match of code.matchAll(/^(?:import|export)\s[^;]*?\bfrom\s*["']([^"']+)["']|^import\s*["']([^"']+)["']/gmu)) {
        const specifier = match[1] ?? match[2];
        if (specifier === "astronomy-engine") continue;
        if (!specifier.startsWith("./")) throw new Error(`${file} imports ${specifier}`);
        visit(`dist/${specifier.slice(2)}`);
      }
    };
    visit(target.import.replace(/^\.\//u, ""));
    graphs[name] = { bytes: Object.values(sizes).reduce((sum, size) => sum + size, 0), files: Object.fromEntries(Object.entries(sizes).sort()) };
  }
  return { version: manifest(root).version, graphs };
}

if (args.measure) {
  const text = `${JSON.stringify(measure(args.measure), null, 1)}\n`;
  if (out) writeFileSync(out, text);
  process.stdout.write(text);
} else if (args.before && args.after) {
  const before = JSON.parse(readFileSync(args.before, "utf8")).graphs;
  const after = JSON.parse(readFileSync(args.after, "utf8")).graphs;
  const rows = Object.keys(after).map((name) => {
    if (!(name in before)) return { entry: name, before: null, after: after[name].bytes, kind: "new" };
    const same = JSON.stringify(before[name].files) === JSON.stringify(after[name].files);
    return { entry: name, before: before[name].bytes, after: after[name].bytes, change: after[name].bytes - before[name].bytes, same };
  });
  const moved = rows.filter((row) => row.kind !== "new" && !row.same).map((row) => row.entry);
  const added = rows.filter((row) => row.kind === "new").map((row) => row.entry);
  finish({
    check: "L11, graphs",
    rows,
    changed: moved,
    added,
    pass: added.length === 1 && added[0] === "./lite" && moved.every((name) => name === "./techniques")
  }, out);
} else if (args["budget-control"]) {
  const script = new URL("scripts/verify-package-contents.mjs", CHECKOUT);
  const lite = measure(fileURLToPath(CHECKOUT)).graphs["./lite"].bytes;
  const text = readFileSync(script, "utf8");
  const line = /^ {2}"\.\/lite": [\d_]+,$/mu;
  if (!line.test(text)) throw new Error("scripts/verify-package-contents.mjs has no ./lite budget line");
  const scratch = mkdtempSync(join(tmpdir(), "lite-budget-control-"));
  try {
    const copy = join(scratch, "verify-package-contents.mjs");
    writeFileSync(copy, text.replaceAll("import.meta.url", JSON.stringify(script.href)).replace(line, `  "./lite": ${lite - 1},`));
    let status = 0;
    let message = "";
    try {
      execFileSync(process.execPath, [copy], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    } catch (error) {
      status = error.status;
      message = (String(error.stderr).match(/the \.\/lite entry's import graph is \d+ bytes, over its budget of \d+/u) ?? [""])[0];
    }
    finish({ check: "L11, control", graph: lite, budget: lite - 1, status, message, pass: status !== 0 && message !== "" }, out);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
} else {
  throw new Error("usage: see the header of graphs.mjs");
}
