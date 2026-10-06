// Frozen tables a bundler can leave out. A table frozen where it is declared,
// `export const X = Object.freeze([...])`, stays in a program that loads its
// module but never reads X unless every call its initializer makes when the
// module loads is marked `/*#__PURE__*/`: a bundler keeps an unmarked call,
// which may have effects, and with it the table. esbuild keeps the whole
// declaration; Rollup and Rolldown keep the unmarked calls. 1.0.0-rc.1 froze
// the exported tables without the mark, and a site's chart bundle grew by
// tables it never reads (docs/evidence/1.0.0-rc.2-20261006/).
//
// The rule, for every variable a module declares at its top level whose
// initializer calls Object.freeze when the module loads: each call and `new`
// the initializer makes then, outside function bodies, carries the mark,
// but a call in the callee of another (`ROWS.split("\n")` in
// `ROWS.split("\n").map(...)`), which a bundler drops with the outer one. And
// a module calls Object.freeze at its top level only in such a declaration:
// `Object.freeze(TABLE);` on its own is a statement no bundler can drop.
//
// The mark says that the call may be dropped when its result is not used, so
// it is sound only where the call does nothing else a program could see: a
// freeze of a fresh array or object, or a `map` or `Array.from` that builds
// one. Calls in function bodies and in classes' instance fields are not
// checked: they run later, and a mark there changes nothing.
//
// UNMARKED_SOURCE names the modules the rule leaves out, those whose tables
// only the ./calc and ./vedic entries load. Their marks, 16 bytes each in the
// built files, would put those two entries over their budgets in
// scripts/verify-package-contents.mjs, which count every byte; a budget is
// raised only with the owner's approval, and until it is given, these tables
// stay as 1.0.0-rc.1 had them.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

/** The modules whose tables only ./calc and ./vedic load, which the rule leaves out (above). */
export const UNMARKED_SOURCE = /^src\/(?:calc\.ts|vedic\/(?:ayanamsa|dasha|kp|nakshatra|varga)\.ts)$/u;

const isFreeze = (node) =>
  ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
  ts.isIdentifier(node.expression.expression) && node.expression.expression.text === "Object" &&
  node.expression.name.text === "freeze";

/** Code that does not run when its module loads: a function's body, or a class's instance field. */
const runsLater = (node) =>
  ts.isFunctionLike(node) ||
  (ts.isPropertyDeclaration(node) && (ts.getCombinedModifierFlags(node) & ts.ModifierFlags.Static) === 0);

/** The calls and `new`s an initializer makes when its module loads, but those in another's callee. */
function loadTimeCalls(initializer) {
  const calls = [];
  const visit = (node, inCallee) => {
    if (runsLater(node)) return;
    if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
      if (!inCallee) calls.push(node);
      visit(node.expression, true);
      for (const argument of node.arguments ?? []) visit(argument, false);
      return;
    }
    if (ts.isPropertyAccessExpression(node)) return visit(node.expression, inCallee);
    if (ts.isElementAccessExpression(node)) {
      visit(node.expression, inCallee);
      return visit(node.argumentExpression, false);
    }
    ts.forEachChild(node, (child) => visit(child, false));
  };
  visit(initializer, false);
  return calls;
}

/** Whether a statement calls Object.freeze when its module loads. */
function freezesAtLoad(statement) {
  let found = false;
  const visit = (node) => {
    if (found || runsLater(node)) return;
    if (isFreeze(node)) found = true;
    else ts.forEachChild(node, visit);
  };
  visit(statement);
  return found;
}

/**
 * The rule's breaches in one module's or built file's text: for each, its
 * line, the variable it declares (or null for a bare statement) and the
 * unmarked call. `include(position)`, when given, says whether the statement
 * at that offset is checked (the built files' modules, below).
 */
export function unmarkedTables(code, { fileName = "module.ts", include = () => true } = {}) {
  const kind = fileName.endsWith(".ts") ? ts.ScriptKind.TS : ts.ScriptKind.JS;
  const source = ts.createSourceFile(fileName, code, ts.ScriptTarget.Latest, true, kind);
  const line = (node) => source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
  const breaches = [];
  for (const statement of source.statements) {
    if (!include(statement.getStart(source)) || runsLater(statement)) continue;
    if (!ts.isVariableStatement(statement)) {
      if (freezesAtLoad(statement)) breaches.push({ line: line(statement), name: null, call: statement.getText(source).slice(0, 80) });
      continue;
    }
    for (const declaration of statement.declarationList.declarations) {
      if (!declaration.initializer) continue;
      const calls = loadTimeCalls(declaration.initializer);
      if (!calls.some(isFreeze)) continue;
      for (const call of calls) {
        const comments = code.slice(call.getFullStart(), call.getStart(source));
        if (/[#@]__PURE__/u.test(comments)) continue;
        breaches.push({ line: line(call), name: declaration.name.getText(source), call: call.getText(source).replace(/\s+/gu, " ").slice(0, 80) });
      }
    }
  }
  return breaches;
}

/** The rule's breaches in the source: every src/ module but tests, declarations and UNMARKED_SOURCE. */
export function checkSource(root) {
  const breaches = [];
  const walk = (directory) => {
    for (const name of readdirSync(directory).sort()) {
      const path = join(directory, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (name.endsWith(".ts") && !name.endsWith(".test.ts") && !name.endsWith(".d.ts")) {
        const file = relative(root, path).split("\\").join("/");
        if (UNMARKED_SOURCE.test(file)) continue;
        for (const breach of unmarkedTables(readFileSync(path, "utf8"), { fileName: file })) breaches.push({ file, ...breach });
      }
    }
  };
  walk(join(root, "src"));
  return breaches;
}

/**
 * The rule's breaches in the built files `files` (as "dist/index.js"), whose
 * text `read(path)` returns. esbuild writes `// src/...` before each module's
 * code, so each statement is the module's whose comment comes last before it;
 * statements before any comment are the file's own, and are checked.
 */
export function checkBuild({ files, read }) {
  const breaches = [];
  for (const file of files) {
    const code = read(file);
    const starts = [...code.matchAll(/^\/\/ (src\/.*\S)[ \t]*$/gmu)].map((match) => ({ at: match.index, module: match[1] }));
    const moduleAt = (position) => {
      let module = null;
      for (const start of starts) if (start.at < position) module = start.module;
      return module;
    };
    const include = (position) => {
      const module = moduleAt(position);
      return module === null || !UNMARKED_SOURCE.test(module);
    };
    for (const breach of unmarkedTables(code, { fileName: file, include })) breaches.push({ file, ...breach });
  }
  return breaches;
}

/** Throws an AssertionError listing every breach, if there are any. */
export function assertNoBreaches(breaches, where) {
  assert.deepEqual(
    breaches.map(({ file, line, name, call }) => `${file}:${line} ${name ?? "(statement)"}: ${call}`),
    [],
    `frozen tables in ${where} that a bundler cannot drop: mark each call above /*#__PURE__*/ (scripts/pure-tables.mjs)`
  );
}

const direct = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (direct) {
  assertNoBreaches(checkSource(resolve(dirname(fileURLToPath(import.meta.url)), "..")), "src/");
  console.log("pure-tables: every frozen table in src/ is marked, but those of UNMARKED_SOURCE");
}
