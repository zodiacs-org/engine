// Tables a bundler can leave out. A table built where it is declared,
// `export const X = Object.freeze([...])`, stays in a program that loads its
// module but never reads X if anything its initializer does when the module
// loads might have an effect: a bundler keeps that, and with it the table.
// esbuild keeps the whole declaration. Rolldown keeps what might have the
// effect: an unmarked call, a spread, an operator. Rollup knows that
// Object.freeze has none, but not Array.from, a `map` over an array it cannot
// see, or a spread. 1.0.0-rc.1 froze the exported tables without saying so,
// and a site's chart bundle grew by tables it never reads
// (docs/evidence/1.0.0-rc.2-20261006/).
//
// So a table's initializer holds only what no bundler takes for an effect:
// literals, names, array and object literals of them, functions, and calls
// and `new`s marked `/*#__PURE__*/`, whose callee is a name, a property of a
// name or of a call in the callee, or a function. Arguments are held to the
// same rule; a function's body is not, since the marked call that runs it is
// what a bundler drops. A spread of anything but a literal, an operator, a
// property read, a template with a substitution, a conditional and a
// destructuring declaration are breaches: write the value as a literal, or
// build it in a marked call.
//
// A table is a variable a module declares at its top level, or its default
// export, whose initializer, when the module loads, calls Object.freeze, or
// calls a function of the same module whose body does, or builds a Set or a
// Map from data (`new Set([...])`; an empty one is the module's state, not a
// table). Functions of other modules are not read.
//
// The mark says that the call may be dropped when its result is not used, so
// it is sound only where the call does nothing else a program could see:
// building a fresh array, object, Set or Map, or freezing one, or, as in
// createAspectPolicy, also remembering the value it returns in a WeakSet of
// the module's own, which nothing can ask about once the value is gone. That
// is for a reader to check, not this script. What it does check, in every
// module: no call whose value is discarded carries the mark, since a bundler
// would drop the call and its effect with it.
//
// UNMARKED_SOURCE names the modules whose tables the rule leaves out, those
// that only the ./calc and ./vedic entries load. Their marks, 16 bytes each in
// the built files, would put those two entries over their budgets in
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

const WRAPPERS = new Set([
  ts.SyntaxKind.ParenthesizedExpression, ts.SyntaxKind.AsExpression, ts.SyntaxKind.SatisfiesExpression,
  ts.SyntaxKind.TypeAssertionExpression, ts.SyntaxKind.NonNullExpression
]);
const unwrap = (node) => (WRAPPERS.has(node.kind) ? unwrap(node.expression) : node);
const isFunction = (node) => ts.isArrowFunction(node) || ts.isFunctionExpression(node);
const isFreeze = (node) =>
  ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
  ts.isIdentifier(node.expression.expression) && node.expression.expression.text === "Object" &&
  node.expression.name.text === "freeze";
const isDataCollection = (node) =>
  ts.isNewExpression(node) && ts.isIdentifier(node.expression) &&
  (node.expression.text === "Set" || node.expression.text === "Map") && (node.arguments?.length ?? 0) > 0;
const isLiteral = (node) =>
  ts.isStringLiteral(node) || ts.isNumericLiteral(node) || ts.isBigIntLiteral(node) ||
  ts.isNoSubstitutionTemplateLiteral(node) || ts.isRegularExpressionLiteral(node) ||
  node.kind === ts.SyntaxKind.TrueKeyword || node.kind === ts.SyntaxKind.FalseKeyword ||
  node.kind === ts.SyntaxKind.NullKeyword ||
  (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(node.operand));

/** Whether a function's body calls Object.freeze, anywhere in it. */
function bodyFreezes(fn) {
  let found = false;
  const visit = (node) => {
    if (found) return;
    if (isFreeze(node)) found = true;
    else ts.forEachChild(node, visit);
  };
  if (fn.body) visit(fn.body);
  return found;
}

/** Whether a call or `new` carries the mark: in its own leading comments or a wrapper's around it. */
function marked(node, code, source) {
  for (let at = node; ; at = at.parent) {
    if (/[#@]__PURE__/u.test(code.slice(at.getFullStart(), at.getStart(source)))) return true;
    if (!at.parent || !WRAPPERS.has(at.parent.kind) || at.parent.expression !== at) return false;
  }
}

/**
 * What an initializer does when its module loads: `calls`, every call and
 * `new` but those in another's callee, and `problems`, what the rule allows in
 * no table (above), with the node each is found at.
 */
function loadTime(initializer) {
  const calls = [];
  const problems = [];
  const visit = (node, inCallee) => {
    node = unwrap(node);
    if (isLiteral(node) || ts.isIdentifier(node) || isFunction(node)) return;
    if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
      if (!inCallee) calls.push(node);
      const callee = unwrap(node.expression);
      if (!isFunction(callee)) visit(callee, true);
      for (const argument of node.arguments ?? []) visit(argument, false);
      return;
    }
    if (ts.isPropertyAccessExpression(node) && inCallee) return visit(node.expression, true);
    if (ts.isArrayLiteralExpression(node)) {
      for (const element of node.elements) {
        if (ts.isSpreadElement(element)) {
          if (!ts.isArrayLiteralExpression(unwrap(element.expression))) problems.push({ node: element, what: "a spread" });
          visit(element.expression, false);
        } else if (!ts.isOmittedExpression(element)) visit(element, false);
      }
      return;
    }
    if (ts.isObjectLiteralExpression(node)) {
      for (const property of node.properties) {
        if (ts.isSpreadAssignment(property)) {
          if (!ts.isObjectLiteralExpression(unwrap(property.expression))) problems.push({ node: property, what: "a spread" });
          visit(property.expression, false);
        } else if (ts.isPropertyAssignment(property)) {
          if (ts.isComputedPropertyName(property.name) && !isLiteral(property.name.expression)) {
            problems.push({ node: property.name, what: "a computed key" });
          }
          visit(property.initializer, false);
        } else if (!ts.isShorthandPropertyAssignment(property) && !ts.isMethodDeclaration(property) &&
          !ts.isGetAccessorDeclaration(property) && !ts.isSetAccessorDeclaration(property)) {
          problems.push({ node: property, what: "a property of another kind" });
        }
      }
      return;
    }
    const what = ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node) ? "a property read"
      : ts.isBinaryExpression(node) ? `the operator ${ts.tokenToString(node.operatorToken.kind)}`
        : ts.isTemplateExpression(node) ? "a template with a substitution"
          : ts.isTaggedTemplateExpression(node) ? "a tagged template"
            : ts.isConditionalExpression(node) ? "a conditional"
              : ts.isClassExpression(node) ? "a class"
                : `${ts.SyntaxKind[node.kind]}`;
    problems.push({ node, what });
  };
  visit(initializer, false);
  return { calls, problems };
}

/** The module's own functions whose bodies freeze, by name: declarations and consts bound to functions. */
function freezingFunctions(statements) {
  const names = new Set();
  for (const statement of statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name && bodyFreezes(statement)) names.add(statement.name.text);
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        const value = declaration.initializer && unwrap(declaration.initializer);
        if (ts.isIdentifier(declaration.name) && value && isFunction(value) && bodyFreezes(value)) names.add(declaration.name.text);
      }
    }
  }
  return names;
}

/** Whether a load-time call makes its initializer a table's: a freeze, a freezing function of the module, a Set or Map of data. */
function makesTable(call, freezing) {
  if (isFreeze(call) || isDataCollection(call)) return true;
  const callee = unwrap(call.expression);
  if (isFunction(callee)) return bodyFreezes(callee);
  return ts.isIdentifier(callee) && freezing.has(callee.text);
}

/** Every call or `new` in the module whose value is discarded and that carries the mark. */
function discardedMarks(source, code) {
  const found = [];
  const discarded = (node) => {
    const parent = node.parent;
    if (ts.isExpressionStatement(parent)) return true;
    if (ts.isVoidExpression(parent)) return true;
    if (ts.isBinaryExpression(parent) && parent.operatorToken.kind === ts.SyntaxKind.CommaToken && parent.left === node) return true;
    if (WRAPPERS.has(parent.kind) && parent.expression === node) return discarded(parent);
    return false;
  };
  const visit = (node) => {
    if ((ts.isCallExpression(node) || ts.isNewExpression(node)) && marked(node, code, source) && discarded(node)) found.push(node);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

/**
 * The rule's breaches in one module's or built file's text: for each, its
 * line, the table it is in (null for a mark on a discarded value) and what is
 * wrong. `include(position)` says whether the statement at that offset is
 * checked; `module(position)` names the module a statement belongs to, so that
 * a call is matched to the functions of its own module (the built files'
 * modules, below).
 */
export function unmarkedTables(code, { fileName = "module.ts", include = () => true, module = () => "" } = {}) {
  const { source, line, text, tables } = parse(code, fileName, module);
  const breaches = [];
  for (const { start, name, initializer, calls, problems } of tables) {
    if (!include(start)) continue;
    const table = name ? text(name) : "default";
    if (name && !ts.isIdentifier(name)) breaches.push({ line: line(name), name: table, call: "a destructuring declaration" });
    for (const call of calls) {
      if (!marked(call, code, source)) breaches.push({ line: line(call), name: table, call: `unmarked: ${text(call)}` });
    }
    for (const { node, what } of problems) breaches.push({ line: line(node), name: table, call: `${what}: ${text(node)}` });
  }
  for (const node of discardedMarks(source, code)) {
    if (include(node.getStart(source))) breaches.push({ line: line(node), name: null, call: `a mark on a discarded value: ${text(node)}` });
  }
  return breaches.sort((a, b) => a.line - b.line);
}

/**
 * The tables in one module's or built file's text, as the rule finds them:
 * for each, the module it is in (`module(position)`, as for unmarkedTables),
 * its line, its name (null for a default export) and its statement's text.
 */
export function tables(code, { fileName = "module.ts", module = () => "" } = {}) {
  const { source, line, tables: found } = parse(code, fileName, module);
  return found.map(({ start, statement, name }) => ({
    module: module(start), line: line(statement), name: name ? name.getText(source) : null, statement: statement.getText(source)
  }));
}

/** The source file, two formatters, and each table with what its initializer does at load. */
function parse(code, fileName, module) {
  const kind = fileName.endsWith(".ts") ? ts.ScriptKind.TS : ts.ScriptKind.JS;
  const source = ts.createSourceFile(fileName, code, ts.ScriptTarget.Latest, true, kind);
  const line = (node) => source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
  const text = (node) => node.getText(source).replace(/\s+/gu, " ").slice(0, 80);
  const byModule = new Map();
  for (const statement of source.statements) {
    const name = module(statement.getStart(source));
    if (!byModule.has(name)) byModule.set(name, []);
    byModule.get(name).push(statement);
  }
  const freezing = new Map([...byModule].map(([name, statements]) => [name, freezingFunctions(statements)]));
  const found = [];
  for (const statement of source.statements) {
    const start = statement.getStart(source);
    const declarations = ts.isVariableStatement(statement)
      ? statement.declarationList.declarations.filter((declaration) => declaration.initializer)
        .map((declaration) => ({ name: declaration.name, initializer: declaration.initializer }))
      : ts.isExportAssignment(statement) ? [{ name: null, initializer: statement.expression }] : [];
    for (const { name, initializer } of declarations) {
      const { calls, problems } = loadTime(initializer);
      if (!calls.some((call) => makesTable(call, freezing.get(module(start)) ?? new Set()))) continue;
      found.push({ start, statement, name, initializer, calls, problems });
    }
  }
  return { source, line, text, tables: found };
}

/**
 * The rule's breaches in the source: every src/ module but tests and
 * declarations. The tables of UNMARKED_SOURCE's modules are not checked; a
 * mark on a discarded value is, there too.
 */
export function checkSource(root) {
  const breaches = [];
  const walk = (directory) => {
    for (const name of readdirSync(directory).sort()) {
      const path = join(directory, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (name.endsWith(".ts") && !name.endsWith(".test.ts") && !name.endsWith(".d.ts")) {
        const file = relative(root, path).split("\\").join("/");
        for (const breach of unmarkedTables(readFileSync(path, "utf8"), { fileName: file })) {
          if (UNMARKED_SOURCE.test(file) && breach.name !== null) continue;
          breaches.push({ file, ...breach });
        }
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
    const module = (position) => {
      let found = "";
      for (const start of starts) if (start.at < position) found = start.module;
      return found;
    };
    const lineStarts = [0];
    for (let at = code.indexOf("\n"); at !== -1; at = code.indexOf("\n", at + 1)) lineStarts.push(at + 1);
    for (const breach of unmarkedTables(code, { fileName: file, module })) {
      if (breach.name !== null && UNMARKED_SOURCE.test(module(lineStarts[breach.line - 1]))) continue;
      breaches.push({ file, ...breach });
    }
  }
  return breaches;
}

/** Throws an AssertionError listing every breach, if there are any. */
export function assertNoBreaches(breaches, where) {
  assert.deepEqual(
    breaches.map(({ file, line, name, call }) => `${file}:${line} ${name ?? "(no table)"}: ${call}`),
    [],
    `tables in ${where} that a bundler cannot leave out, or marks on discarded values (scripts/pure-tables.mjs)`
  );
}

const direct = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (direct) {
  assertNoBreaches(checkSource(resolve(dirname(fileURLToPath(import.meta.url)), "..")), "src/");
  console.log("pure-tables: every table in src/ is one a bundler can leave out, but those of UNMARKED_SOURCE");
}
