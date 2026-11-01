// Check C7 of ../PREREGISTRATION.md (section 6), with its controls: the API
// reports only grow. `api/*.api.md`, as `npm run api:report` writes them, are
// compared with those of each base revision: every declaration of the base is
// still declared, with its lines in the same order and only lines added among
// them (the band types and fields, timeBands, the ./time entry); a
// `// exported by` line may only gain entry points; nothing else changes. The
// counts in the two headings follow the declarations, and are checked to
// equal them.
//
//   node api-grows.mjs --repo <checkout> --base a253973 --base <commit before the band commits> [--controls <work dir>] --out <c7.json>
//
// A base report is read from the engine's git objects by name, never by
// walking a tree: `git cat-file -p <base>:api` lists the folder, and
// `git cat-file -p <base>:api/<name>` gives each file, with lazy fetching
// off. --controls copies the current reports into the work directory (outside
// the checkout) twice, once with one existing declaration line removed and
// once with a `// exported by` line that loses an entry point, and each copy
// must be reported.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { finish, options } from "./load.mjs";

const args = options();
const bases = process.argv.slice(2).reduce((list, value, k, all) => (all[k - 1] === "--base" ? [...list, value] : list), []);
if (!args.repo || bases.length === 0) throw new Error("usage: node api-grows.mjs --repo <checkout> --base <rev> [--base <rev>] [--controls <dir>] --out <file>");

const git = (...argv) => execFileSync("git", ["-C", args.repo, ...argv], { encoding: "utf8", env: { ...process.env, GIT_NO_LAZY_FETCH: "1" }, maxBuffer: 1 << 26 });

/** A report's declarations: name and section to its lines, and the counts its headings give. */
function parse(text) {
  const declarations = new Map();
  const counts = {};
  for (const section of text.split(/^## /mu).slice(1)) {
    const heading = /^(Exported|Referenced, not exported here) \((\d+)\)/u.exec(section);
    if (!heading) continue;
    const block = /```ts\n([\s\S]*?)\n```/u.exec(section);
    // A declaration starts with its "exported by" line (or "not exported by any entry point"), its release
    // tags (/** @deprecated */) or its keyword.
    const blocks = block ? block[1].split(/\n\n(?=\/\/ |\/\*\* @|declare |interface |type )/u) : [];
    counts[heading[1]] = { stated: Number(heading[2]), declared: blocks.length };
    for (const lines of blocks.map((b) => b.split("\n"))) {
      const exportedBy = lines[0].startsWith("// ") ? lines.shift() : null;
      const first = lines.find((line) => !line.startsWith("/** @")) ?? lines[0];
      const name = /^(?:declare (?:const|function|class|enum|namespace) |interface |type )([A-Za-z_$][\w$]*)/u.exec(first)?.[1] ?? first;
      const key = `${heading[1]}: ${name}`;
      // Overloads of one function are one declaration.
      const earlier = declarations.get(key);
      declarations.set(key, earlier ? { lines: [...earlier.lines, "", ...lines], exportedBy } : { lines, exportedBy });
    }
  }
  return { declarations, counts };
}

const entryPoints = (line) => new Set([...line.matchAll(/@zodiacs\/engine(?:\/[a-z/-]+)? \(([^)]*)\)/gu)].map((m) => m[0]));

/** Whether `before`'s lines appear in `after` in order, with lines only added among them. */
function grown(before, after) {
  let k = 0;
  for (const line of after) if (k < before.length && line === before[k]) k += 1;
  return k === before.length;
}

function compare(baseText, currentText, file) {
  const problems = [];
  const before = parse(baseText);
  const after = parse(currentText);
  for (const [section, count] of Object.entries(after.counts)) {
    if (count.stated !== count.declared) problems.push({ file, problem: `the ${section} heading says ${count.stated}, the block declares ${count.declared}` });
  }
  const added = [];
  const grew = [];
  const gained = [];
  for (const [key, declaration] of before.declarations) {
    const now = after.declarations.get(key);
    if (!now) {
      problems.push({ file, problem: `${key} is no longer declared` });
      continue;
    }
    if (!grown(declaration.lines, now.lines)) problems.push({ file, problem: `${key}: a declaration line was removed or changed` });
    else if (now.lines.length > declaration.lines.length) grew.push(key);
    if (declaration.exportedBy !== now.exportedBy) {
      const was = entryPoints(declaration.exportedBy ?? "");
      const is = entryPoints(now.exportedBy ?? "");
      if ([...was].some((e) => !is.has(e))) problems.push({ file, problem: `${key}: its "exported by" line lost an entry point` });
      else gained.push(key);
    }
  }
  for (const key of after.declarations.keys()) if (!before.declarations.has(key)) added.push(key);
  return { problems, added, grew, gained };
}

const current = join(args.repo, "api");
const files = readdirSync(current).filter((name) => name.endsWith(".api.md")).sort();
const results = {};
const problems = [];
for (const base of bases) {
  const listed = git("cat-file", "-p", `${base}:api`).split("\n").filter(Boolean).map((line) => line.split("\t")[1]).filter((name) => name.endsWith(".api.md"));
  const out = { files: listed.length, added: [], grew: [], gained: [], newFiles: files.filter((name) => !listed.includes(name)) };
  for (const name of listed) {
    if (!files.includes(name)) {
      problems.push({ base, file: name, problem: "the report was removed" });
      continue;
    }
    const found = compare(git("cat-file", "-p", `${base}:api/${name}`), readFileSync(join(current, name), "utf8"), name);
    for (const p of found.problems) problems.push({ base, ...p });
    out.added.push(...found.added.map((k) => `${name}: ${k}`));
    out.grew.push(...found.grew.map((k) => `${name}: ${k}`));
    out.gained.push(...found.gained.map((k) => `${name}: ${k}`));
  }
  results[base] = out;
}

const report = { check: "C7", pass: problems.length === 0, records: files.length, bases: results, problems };
if (args.controls) {
  // Each control changes a copy of the current reports and must be reported against the first base.
  const base = bases[0];
  const run = (mutate) => {
    const found = [];
    const listed = git("cat-file", "-p", `${base}:api`).split("\n").filter(Boolean).map((line) => line.split("\t")[1]).filter((n) => n.endsWith(".api.md"));
    let changed = false;
    for (const name of listed) {
      const text = readFileSync(join(current, name), "utf8");
      const copy = changed ? text : mutate(text);
      if (copy !== text) changed = true;
      found.push(...compare(git("cat-file", "-p", `${base}:api/${name}`), copy, name).problems);
    }
    return { changed, found };
  };
  rmSync(args.controls, { recursive: true, force: true });
  mkdirSync(args.controls, { recursive: true });
  const removed = run((text) => text.replace(/^( {4}readonly receipt: CalcReceipt<CalcRequest>;\n)/mu, ""));
  const lost = run((text) => text.replace(/^(\/\/ exported by @zodiacs\/engine \(BodyName\)), @zodiacs\/engine\/crossings \(BodyName\)$/mu, "$1"));
  writeFileSync(join(args.controls, "controls.json"), `${JSON.stringify({ removed, lost }, null, 1)}\n`);
  report.controls = {
    "a declaration line removed": { failed: removed.changed && removed.found.length > 0, problems: removed.found.length },
    "an exported-by line that loses an entry point": { failed: lost.changed && lost.found.length > 0, problems: lost.found.length }
  };
}
finish(report, args.out);
