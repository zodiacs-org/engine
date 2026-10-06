// Tables a bundler can leave out. A table built where it is declared,
// `export const X = Object.freeze([...])`, stays in a program that loads its
// module but never reads X if anything its initializer does when the module
// loads might have an effect: a bundler keeps that, and with it the table.
// What the bundlers tried keep (docs/evidence/1.0.0-rc.2-20261006/,
// tools/bundler-probe.mjs): esbuild keeps the whole declaration for an
// unmarked call, an operator, a property read, a template with a substitution
// or a spread, but of an array literal into an array. Rolldown keeps an
// unmarked call and, unminified, a spread of a name, a property read and a
// template with a substitution. Rollup knows that Object.freeze has no
// effect, but not Array.from, a `map` over an array it cannot see, a spread
// of a name or a property read. 1.0.0-rc.1 froze the exported tables without
// saying so, and a site's chart bundle grew by tables it never reads.
//
// So a table's initializer holds only what none of them takes for an effect:
// literals, names, array and object literals of them, functions, and calls
// and `new`s marked `/*#__PURE__*/`, whose callee is a name, a property of a
// name or of a call in the callee, or a function. Arguments are held to the
// same rule; a function's body is not, since the marked call that runs it is
// what a bundler drops. A class is held to it in the parts that run when it
// is defined: what it extends, computed names and static fields. A spread,
// but of an array literal into an array, an operator, a property read, a
// template with a substitution, a tagged template, a conditional, a computed
// key, a static block and a destructuring declaration are breaches: write the
// value as a literal, or build it in a marked call.
//
// A table is a variable a module declares at its top level, or its default
// export, whose initializer, when the module loads, calls Object.freeze (or a
// name the module binds to it), or a function of the same module that makes a
// table, or builds a Set or a Map from data (`new Set([...])`; an empty one is
// the module's state, not a table). A function makes a table when its body
// does any of these, the functions it passes to a call or calls in place, or
// declares and calls by name, included; functions of other modules are not
// read.
//
// A table is kept, too, by whatever else in its module is kept and reads it.
// So the same rule holds for every other top-level declaration that reads a
// table, its module's own or one it imports, anywhere in its initializer,
// directly or through a name that does; and any other statement that runs
// when its module loads, or a class's static part, may neither read a table
// nor freeze anything: a freeze belongs in a table's declaration, where it
// can be marked.
//
// The mark says that the call may be dropped when its result is not used, so
// it is sound only where the call does nothing else a program could see:
// building a fresh array, object, Set or Map, or freezing one, or, as in
// createAspectPolicy, also remembering the value it returns in a WeakSet of
// the module's own, which nothing can ask about once the value is gone (its
// regular expression test also sets RegExp's legacy statics, as any does).
// That is for a reader to check, not this script. What it does check, in
// every module: no call whose value is discarded carries the mark, since a
// bundler would drop the call and its effect with it. A value is discarded by
// a statement of its own, `void`, the left of a comma, the right of a comma,
// `&&`, `||` or `??` whose own value is discarded, a branch of such a
// conditional, and a `for` loop's initializer and update.
//
// UNMARKED_SOURCE names the modules the rule leaves out, those that only the
// ./calc and ./vedic entries load. Their marks, 16 bytes each in the built
// files, would put those two entries over their budgets in
// scripts/verify-package-contents.mjs, which count every byte; a budget is
// raised only with the owner's approval, and until it is given, these tables,
// and what those modules read of the others' when they load, stay as
// 1.0.0-rc.1 had them. A mark on a discarded value is checked there too.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, posix, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

/** The modules whose tables only ./calc and ./vedic load, which the rule leaves out (above). */
export const UNMARKED_SOURCE = /^src\/(?:calc\.ts|vedic\/(?:ayanamsa|dasha|kp|nakshatra|varga)\.ts)$/u;

const WRAPPERS = new Set([
  ts.SyntaxKind.ParenthesizedExpression, ts.SyntaxKind.AsExpression, ts.SyntaxKind.SatisfiesExpression,
  ts.SyntaxKind.TypeAssertionExpression, ts.SyntaxKind.NonNullExpression
]);
const unwrap = (node) => (WRAPPERS.has(node.kind) ? unwrap(node.expression) : node);
/** The outermost wrapper around a node, or the node. */
const wrapped = (node) => (node.parent && WRAPPERS.has(node.parent.kind) ? wrapped(node.parent) : node);
const isFunction = (node) => ts.isArrowFunction(node) || ts.isFunctionExpression(node);
/** Code whose body runs only when it is called or constructed. */
const isDeferred = (node) =>
  isFunction(node) || ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) || ts.isGetAccessorDeclaration(node) ||
  ts.isSetAccessorDeclaration(node) || ts.isConstructorDeclaration(node) || ts.isClassDeclaration(node) || ts.isClassExpression(node);
const isObjectFreeze = (node) =>
  ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "Object" &&
  node.name.text === "freeze";
const isLiteral = (node) =>
  ts.isStringLiteral(node) || ts.isNumericLiteral(node) || ts.isBigIntLiteral(node) ||
  ts.isNoSubstitutionTemplateLiteral(node) || ts.isRegularExpressionLiteral(node) ||
  node.kind === ts.SyntaxKind.TrueKeyword || node.kind === ts.SyntaxKind.FalseKeyword ||
  node.kind === ts.SyntaxKind.NullKeyword ||
  (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(node.operand));
const isDataCollection = (node) =>
  ts.isNewExpression(node) && ts.isIdentifier(node.expression) &&
  (node.expression.text === "Set" || node.expression.text === "Map") && (node.arguments?.length ?? 0) > 0;

/** Whether a call or `new` carries the mark: in its own leading comments or a wrapper's around it. */
function marked(node, code, source) {
  for (let at = node; ; at = at.parent) {
    if (/[#@]__PURE__/u.test(code.slice(at.getFullStart(), at.getStart(source)))) return true;
    if (!at.parent || !WRAPPERS.has(at.parent.kind)) return false;
  }
}

/** The names a module binds to Object.freeze: `const freeze = Object.freeze` and `const { freeze } = Object`. */
function freezeAliases(statements) {
  const names = new Set();
  for (const statement of statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      const value = declaration.initializer && unwrap(declaration.initializer);
      if (!value) continue;
      if (ts.isIdentifier(declaration.name) && isObjectFreeze(value)) names.add(declaration.name.text);
      if (ts.isObjectBindingPattern(declaration.name) && ts.isIdentifier(value) && value.text === "Object") {
        for (const element of declaration.name.elements) {
          const property = element.propertyName ?? element.name;
          if (ts.isIdentifier(property) && property.text === "freeze" && ts.isIdentifier(element.name)) names.add(element.name.text);
        }
      }
    }
  }
  return names;
}

/** Whether a call or `new` makes a table by itself: a freeze, a Set or Map of data, a call of a function of the module that makes one. */
function makesTableHere(node, context) {
  if (isDataCollection(node)) return true;
  if (!ts.isCallExpression(node)) return false;
  const callee = unwrap(node.expression);
  if (isObjectFreeze(callee)) return true;
  return ts.isIdentifier(callee) && (context.aliases.has(callee.text) || context.tableFunctions.has(callee.text));
}

/**
 * Whether code makes a table when it runs: a call that makes one by itself
 * (above), in the code or in the functions it passes to a call, calls in place
 * or, for a function's body, declares and calls by name. A function it returns
 * or stores is not run.
 */
function runsTableMaking(root, context, seen = new Set()) {
  const local = new Map();
  if (ts.isBlock(root)) {
    for (const statement of root.statements) {
      if (ts.isFunctionDeclaration(statement) && statement.name && statement.body) local.set(statement.name.text, statement.body);
      if (ts.isVariableStatement(statement)) {
        for (const declaration of statement.declarationList.declarations) {
          const value = declaration.initializer && unwrap(declaration.initializer);
          if (ts.isIdentifier(declaration.name) && value && isFunction(value)) local.set(declaration.name.text, value.body);
        }
      }
    }
  }
  let found = false;
  const visit = (node) => {
    if (found || ts.isTypeNode(node)) return;
    if (isDeferred(node) && node !== root) {
      const outer = wrapped(node);
      const parent = outer.parent;
      const passed = parent && (ts.isCallExpression(parent) || ts.isNewExpression(parent)) &&
        (parent.arguments?.includes(outer) || (ts.isCallExpression(parent) && parent.expression === outer));
      if (passed && isFunction(node) && !seen.has(node.body)) {
        seen.add(node.body);
        visit(node.body);
      }
      return;
    }
    if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
      if (makesTableHere(node, context)) {
        found = true;
        return;
      }
      const callee = unwrap(node.expression);
      if (ts.isIdentifier(callee) && local.has(callee.text) && !seen.has(local.get(callee.text))) {
        const body = local.get(callee.text);
        seen.add(body);
        if (runsTableMaking(body, context, seen)) {
          found = true;
          return;
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(root);
  return found;
}

/** The module's own functions that make a table, by name: declarations and consts bound to functions, to a fixed point. */
function tableFunctions(statements, context) {
  const functions = new Map();
  for (const statement of statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name && statement.body) functions.set(statement.name.text, statement.body);
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        const value = declaration.initializer && unwrap(declaration.initializer);
        if (ts.isIdentifier(declaration.name) && value && isFunction(value)) functions.set(declaration.name.text, value.body);
      }
    }
  }
  for (let grew = true; grew;) {
    grew = false;
    for (const [name, body] of functions) {
      if (!context.tableFunctions.has(name) && runsTableMaking(body, context)) {
        context.tableFunctions.add(name);
        grew = true;
      }
    }
  }
}

/**
 * What an initializer does when its module loads: `calls`, every call and
 * `new` outside a function body but those in another's callee; `problems`,
 * what the rule allows in no table (above), with the node each is found at;
 * and `makes`, whether it makes a table.
 */
function loadTime(initializer, context) {
  const calls = [];
  const problems = [];
  let makes = false;
  const visit = (node, inCallee) => {
    node = unwrap(node);
    if (isLiteral(node) || ts.isIdentifier(node) || isFunction(node)) return;
    if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
      if (!inCallee) calls.push(node);
      const callee = unwrap(node.expression);
      if (makesTableHere(node, context) || (isFunction(callee) && runsTableMaking(callee.body, context))) makes = true;
      if (!isFunction(callee)) visit(callee, true);
      for (const argument of node.arguments ?? []) visit(argument, false);
      return;
    }
    if (ts.isSpreadElement(node)) {
      if (!ts.isArrayLiteralExpression(wrapped(node).parent) || !ts.isArrayLiteralExpression(unwrap(node.expression))) {
        problems.push({ node, what: "a spread" });
      }
      return visit(node.expression, false);
    }
    if (ts.isPropertyAccessExpression(node)) {
      if (!inCallee) problems.push({ node, what: "a property read" });
      return visit(node.expression, inCallee);
    }
    if (ts.isArrayLiteralExpression(node)) {
      for (const element of node.elements) if (!ts.isOmittedExpression(element)) visit(element, false);
      return;
    }
    if (ts.isObjectLiteralExpression(node)) {
      for (const property of node.properties) {
        if (property.name && ts.isComputedPropertyName(property.name) && !isLiteral(unwrap(property.name.expression))) {
          problems.push({ node: property.name, what: "a computed key" });
          visit(property.name.expression, false);
        }
        if (ts.isSpreadAssignment(property)) {
          problems.push({ node: property, what: "a spread" });
          visit(property.expression, false);
        } else if (ts.isPropertyAssignment(property)) {
          visit(property.initializer, false);
        } else if (!ts.isShorthandPropertyAssignment(property) && !ts.isMethodDeclaration(property) &&
          !ts.isGetAccessorDeclaration(property) && !ts.isSetAccessorDeclaration(property)) {
          problems.push({ node: property, what: "a property of another kind" });
        }
      }
      return;
    }
    if (ts.isClassExpression(node)) {
      // A class's body runs when it is constructed, but for the parts that run when it is defined.
      for (const part of classLoadParts(node)) {
        if (ts.isBlock(part)) problems.push({ node: part.parent, what: "a static block" });
        else visit(part, false);
      }
      return;
    }
    if (ts.isTaggedTemplateExpression(node)) {
      problems.push({ node, what: "a tagged template" });
      visit(node.tag, true);
      if (ts.isTemplateExpression(node.template)) for (const span of node.template.templateSpans) visit(span.expression, false);
      return;
    }
    const what = ts.isElementAccessExpression(node) ? "a property read"
      : ts.isBinaryExpression(node) ? `the operator ${ts.tokenToString(node.operatorToken.kind)}`
        : ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node) ? `the operator ${ts.tokenToString(node.operator)}`
          : ts.isTypeOfExpression(node) ? "the operator typeof"
            : ts.isVoidExpression(node) ? "the operator void"
              : ts.isDeleteExpression(node) ? "the operator delete"
                : ts.isTemplateExpression(node) ? "a template with a substitution"
                  : ts.isConditionalExpression(node) ? "a conditional"
                    : `${ts.SyntaxKind[node.kind]}`;
    problems.push({ node, what });
    // Calls inside are found too, so that what they make is known.
    ts.forEachChild(node, (child) => {
      if (ts.isExpression(child) || ts.isTemplateSpan(child)) visit(ts.isTemplateSpan(child) ? child.expression : child, false);
    });
  };
  visit(initializer, false);
  return { calls, problems, makes };
}

/** The names code reads, anywhere in it, functions' bodies included. */
function namesRead(root) {
  const names = new Set();
  const visit = (node) => {
    if (ts.isExpressionWithTypeArguments(node)) return visit(node.expression);
    if (ts.isTypeNode(node) || ts.isTypeParameterDeclaration(node) || (ts.isHeritageClause(node) && node.token === ts.SyntaxKind.ImplementsKeyword)) return;
    if (ts.isIdentifier(node)) {
      const parent = node.parent;
      const declared =
        (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
        ((ts.isPropertyAssignment(parent) || ts.isMethodDeclaration(parent) || ts.isGetAccessorDeclaration(parent) ||
          ts.isSetAccessorDeclaration(parent) || ts.isPropertyDeclaration(parent) || ts.isVariableDeclaration(parent) ||
          ts.isParameter(parent) || ts.isFunctionDeclaration(parent) || ts.isFunctionExpression(parent) ||
          ts.isClassDeclaration(parent) || ts.isClassExpression(parent) || ts.isLabeledStatement(parent)) && parent.name === node) ||
        (ts.isBindingElement(parent) && (parent.name === node || parent.propertyName === node)) ||
        ((ts.isBreakStatement(parent) || ts.isContinueStatement(parent)) && parent.label === node);
      if (!declared) names.add(node.text);
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(root);
  return names;
}

/** The parts of a class that run when it is defined: its heritage, computed names, static fields and static blocks. */
function classLoadParts(node) {
  const parts = [];
  for (const clause of node.heritageClauses ?? []) {
    if (clause.token === ts.SyntaxKind.ExtendsKeyword) for (const type of clause.types) parts.push(type.expression);
  }
  for (const member of node.members) {
    if (member.name && ts.isComputedPropertyName(member.name)) parts.push(member.name.expression);
    const isStatic = ts.getCombinedModifierFlags(member) & ts.ModifierFlags.Static;
    if (ts.isPropertyDeclaration(member) && isStatic && member.initializer) parts.push(member.initializer);
    if (ts.isClassStaticBlockDeclaration(member) && member.body.statements.length) parts.push(member.body);
  }
  return parts;
}

/** Every call or `new` in the source whose value is discarded and that carries the mark. */
function discardedMarks(source, code) {
  const found = [];
  const discarded = (node) => {
    const outer = wrapped(node);
    const parent = outer.parent;
    if (!parent) return false;
    if (ts.isExpressionStatement(parent) || ts.isVoidExpression(parent)) return true;
    if (ts.isForStatement(parent)) return parent.initializer === outer || parent.incrementor === outer;
    if (ts.isBinaryExpression(parent)) {
      const operator = parent.operatorToken.kind;
      if (operator === ts.SyntaxKind.CommaToken) return parent.left === outer || discarded(parent);
      const shortCircuit = operator === ts.SyntaxKind.AmpersandAmpersandToken || operator === ts.SyntaxKind.BarBarToken ||
        operator === ts.SyntaxKind.QuestionQuestionToken;
      return shortCircuit && parent.right === outer && discarded(parent);
    }
    if (ts.isConditionalExpression(parent)) return parent.condition !== outer && discarded(parent);
    return false;
  };
  const visit = (node) => {
    if ((ts.isCallExpression(node) || ts.isNewExpression(node)) && marked(node, code, source) && discarded(node)) found.push(node);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

const INERT = new Set([
  ts.SyntaxKind.FunctionDeclaration, ts.SyntaxKind.InterfaceDeclaration, ts.SyntaxKind.TypeAliasDeclaration,
  ts.SyntaxKind.ImportDeclaration, ts.SyntaxKind.ImportEqualsDeclaration, ts.SyntaxKind.ExportDeclaration,
  ts.SyntaxKind.EmptyStatement, ts.SyntaxKind.ModuleDeclaration
]);
const isDeclared = (statement) => (ts.getCombinedModifierFlags(statement) & ts.ModifierFlags.Ambient) !== 0;
const isExported = (statement) => (ts.getCombinedModifierFlags(statement) & ts.ModifierFlags.Export) !== 0;

/**
 * One module's or built file's text, read: its statements by the module each
 * belongs to (`module(position)`, the built files' modules, below), each
 * module's tables and other declarations with what their initializers do at
 * load, its other statements, its imports and exports, and its bindings: each
 * top-level name with the code that gives it its value, an initializer or a
 * function's or a class's declaration.
 */
function analyze(code, fileName, module) {
  const kind = fileName.endsWith(".ts") ? ts.ScriptKind.TS : ts.ScriptKind.JS;
  const source = ts.createSourceFile(fileName, code, ts.ScriptTarget.Latest, true, kind);
  const byModule = new Map();
  for (const statement of source.statements) {
    const name = module(statement.getStart(source));
    if (!byModule.has(name)) byModule.set(name, []);
    byModule.get(name).push(statement);
  }
  const contexts = new Map();
  for (const [name, statements] of byModule) {
    const context = { aliases: freezeAliases(statements), tableFunctions: new Set() };
    tableFunctions(statements, context);
    contexts.set(name, context);
  }
  const tables = [];
  const others = [];
  const statements = [];
  const bindings = [];
  const imports = new Map();
  const exports = [];
  const exportBinding = (statement, name) => {
    if (!isExported(statement)) return;
    const isDefault = (ts.getCombinedModifierFlags(statement) & ts.ModifierFlags.Default) !== 0;
    exports.push({ exported: isDefault ? "default" : name, local: name });
  };
  for (const statement of source.statements) {
    const start = statement.getStart(source);
    const name = module(start);
    const context = contexts.get(name);
    if (isDeclared(statement)) continue;
    if (ts.isVariableStatement(statement) || ts.isExportAssignment(statement)) {
      const declarations = ts.isVariableStatement(statement)
        ? statement.declarationList.declarations.filter((declaration) => declaration.initializer)
          .map((declaration) => ({ name: declaration.name, initializer: declaration.initializer }))
        : statement.isExportEquals ? [] : [{ name: null, initializer: statement.expression }];
      for (const declaration of declarations) {
        const found = { start, module: name, statement, ...declaration, ...loadTime(declaration.initializer, context) };
        (found.makes ? tables : others).push(found);
        if (ts.isExportAssignment(statement)) {
          bindings.push({ name: "default", node: declaration.initializer });
          exports.push({ exported: "default", local: "default" });
        } else if (ts.isIdentifier(declaration.name)) {
          bindings.push({ name: declaration.name.text, node: declaration.initializer });
          exportBinding(statement, declaration.name.text);
        }
      }
    } else if ((ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) && statement.name) {
      bindings.push({ name: statement.name.text, node: statement });
      exportBinding(statement, statement.name.text);
      if (ts.isClassDeclaration(statement)) statements.push({ start, module: name, statement });
    } else if (ts.isImportDeclaration(statement)) {
      const clause = statement.importClause;
      if (!clause || clause.isTypeOnly || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
      const specifier = statement.moduleSpecifier.text;
      if (clause.name) imports.set(clause.name.text, { specifier, imported: "default" });
      if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
        for (const element of clause.namedBindings.elements) {
          if (!element.isTypeOnly) imports.set(element.name.text, { specifier, imported: (element.propertyName ?? element.name).text });
        }
      }
    } else if (ts.isExportDeclaration(statement)) {
      if (statement.isTypeOnly) continue;
      const specifier = statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier) ? statement.moduleSpecifier.text : null;
      if (!statement.exportClause) {
        if (specifier) exports.push({ star: specifier });
      } else if (ts.isNamedExports(statement.exportClause)) {
        for (const element of statement.exportClause.elements) {
          if (element.isTypeOnly) continue;
          const local = (element.propertyName ?? element.name).text;
          exports.push(specifier ? { exported: element.name.text, specifier, imported: local } : { exported: element.name.text, local });
        }
      }
    } else if (!INERT.has(statement.kind)) {
      statements.push({ start, module: name, statement });
    }
  }
  const reads = new Map();
  const readsOf = (node) => {
    if (!reads.has(node)) reads.set(node, namesRead(node));
    return reads.get(node);
  };
  const line = (node) => source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
  const text = (node) => node.getText(source).replace(/\s+/gu, " ").slice(0, 80);
  return { code, source, line, text, contexts, tables, others, statements, bindings, imports, exports, readsOf };
}

/**
 * Which of a read file's top-level names carry tables, and which: a table, but
 * one of a module `exempt` names, carries itself; an import carries what
 * `imported(specifier, name)` says it does; and a name whose value's code
 * reads a name that carries tables carries those too, to a fixed point.
 */
function carriers(analysis, exempt, imported) {
  const carried = new Map();
  const into = (name) => {
    if (!carried.has(name)) carried.set(name, new Set());
    return carried.get(name);
  };
  for (const table of analysis.tables) {
    if (!exempt(table.module) && table.name && ts.isIdentifier(table.name)) into(table.name.text).add(table.name.text);
  }
  for (const [local, { specifier, imported: name }] of analysis.imports) {
    const tables = imported(specifier, name);
    if (tables.size) for (const table of tables) into(local).add(table);
  }
  const reads = analysis.bindings.map(({ name, node }) => ({ name, read: analysis.readsOf(node) }));
  for (let grew = true; grew;) {
    grew = false;
    for (const { name, read } of reads) {
      for (const other of read) {
        if (other === name || !carried.has(other)) continue;
        const target = into(name);
        for (const table of carried.get(other)) {
          if (!target.has(table)) {
            target.add(table);
            grew = true;
          }
        }
      }
    }
  }
  return carried;
}

/**
 * The breaches in a read file: for each, its line, what it is in (a table, or
 * a declaration that reads one; null for a statement or a mark on a discarded
 * value) and what is wrong. `exempt(module)` says whether a module is left out
 * of the rule; `carried`, which names carry tables (carriers, above).
 */
function breachesIn(analysis, { exempt, carried }) {
  const { code, source, line, text, contexts, tables, others, statements, readsOf } = analysis;
  /** The names a node reads that carry tables, each with them unless it is one: "UT1_DATA", "decode (UT1_DATA)". */
  const carriedIn = (node) => [...readsOf(node)].filter((name) => carried.has(name)).sort().map((name) => {
    const tablesOf = [...carried.get(name)].sort();
    return tablesOf.length === 1 && tablesOf[0] === name ? name : `${name} (${tablesOf.join(", ")})`;
  });
  const breaches = [];
  const held = (found, name) => {
    if (found.name && !ts.isIdentifier(found.name)) breaches.push({ line: line(found.name), name, call: "a destructuring declaration" });
    for (const call of found.calls) {
      if (!marked(call, code, source)) breaches.push({ line: line(call), name, call: `unmarked: ${text(call)}` });
    }
    for (const { node, what } of found.problems) breaches.push({ line: line(node), name, call: `${what}: ${text(node)}` });
  };
  for (const table of tables) if (!exempt(table.module)) held(table, table.name ? text(table.name) : "default");
  for (const other of others) {
    if (exempt(other.module)) continue;
    const names = carriedIn(other.initializer);
    if (names.length) held(other, `${other.name ? text(other.name) : "default"}, which reads ${names.join(", ")}`);
  }
  for (const { module, statement } of statements) {
    if (exempt(module)) continue;
    const context = contexts.get(module);
    if (ts.isClassDeclaration(statement)) {
      const parts = classLoadParts(statement);
      const name = statement.name?.text ?? "default";
      for (const part of parts) {
        if (runsTableMaking(part, context)) breaches.push({ line: line(part), name, call: `a freeze when its module loads, outside a declaration: ${text(part)}` });
      }
      const kept = parts.some((part) => {
        if (ts.isBlock(part)) return true;
        const { calls, problems } = loadTime(part, context);
        return problems.length > 0 || calls.some((call) => !marked(call, code, source));
      });
      const names = kept ? carriedIn(statement) : [];
      if (names.length) breaches.push({ line: line(statement), name, call: `a class its module keeps, which reads ${names.join(", ")}` });
      continue;
    }
    if (runsTableMaking(statement, context)) {
      breaches.push({ line: line(statement), name: null, call: `a freeze when its module loads, outside a declaration: ${text(statement)}` });
      continue;
    }
    const names = carriedIn(statement);
    if (names.length) breaches.push({ line: line(statement), name: null, call: `a statement that reads ${names.join(", ")} when its module loads: ${text(statement)}` });
  }
  for (const node of discardedMarks(source, code)) {
    breaches.push({ line: line(node), name: null, call: `a mark on a discarded value: ${text(node)}` });
  }
  return breaches.sort((a, b) => a.line - b.line);
}

const NONE = new Set();

/**
 * The rule's breaches in one module's or built file's text. `module(position)`
 * names the module a statement belongs to, so that a call is matched to the
 * functions of its own module (the built files' modules, below);
 * `exempt(module)` says whether a module is left out of the rule, as
 * UNMARKED_SOURCE's are, but for its marks on discarded values; and
 * `importsTable(specifier, name)` whether an import carries a table.
 */
export function unmarkedTables(code, { fileName = "module.ts", module = () => "", exempt = () => false, importsTable = () => false } = {}) {
  const analysis = analyze(code, fileName, module);
  const carried = carriers(analysis, exempt, (specifier, name) => (importsTable(specifier, name) ? new Set([name]) : NONE));
  return breachesIn(analysis, { exempt, carried });
}

/**
 * The tables in one module's or built file's text, as the rule finds them:
 * for each, the module it is in (`module(position)`, as for unmarkedTables),
 * its line, its name (null for a default export) and its statement's text.
 */
export function tables(code, { fileName = "module.ts", module = () => "" } = {}) {
  const { line, source, tables: found } = analyze(code, fileName, module);
  return found.map(({ start, statement, name }) => ({
    module: module(start), line: line(statement), name: name ? name.getText(source) : null, statement: statement.getText(source)
  }));
}

/**
 * The rule's breaches in a set of read files that import one another, by
 * path, with `exempt(module)` as above and `resolveSpecifier(path,
 * specifier)`, the path an import names, or null. What each file's exports
 * carry, its own tables and the names that read them, or what it imports and
 * exports again, is followed to a fixed point, so that a declaration or a
 * statement that reads what another file exports is held to the rule too.
 */
function checkFiles(files, exempt, resolveSpecifier) {
  const exported = new Map([...files.keys()].map((path) => [path, new Map()]));
  const importedBy = (path) => (specifier, name) => {
    const target = resolveSpecifier(path, specifier);
    return (target !== null && exported.get(target)?.get(name)) || NONE;
  };
  const carriedBy = new Map();
  for (let grew = true; grew;) {
    grew = false;
    for (const [path, analysis] of files) {
      const carried = carriers(analysis, exempt, importedBy(path));
      carriedBy.set(path, carried);
      const own = exported.get(path);
      const add = (name, tablesOf) => {
        if (!tablesOf || !tablesOf.size) return;
        if (!own.has(name)) own.set(name, new Set());
        for (const table of tablesOf) {
          if (!own.get(name).has(table)) {
            own.get(name).add(table);
            grew = true;
          }
        }
      };
      for (const entry of analysis.exports) {
        if (entry.star) {
          const target = resolveSpecifier(path, entry.star);
          for (const [name, tablesOf] of (target && exported.get(target)) || []) if (name !== "default") add(name, tablesOf);
        } else if (entry.specifier) {
          add(entry.exported, importedBy(path)(entry.specifier, entry.imported));
        } else {
          add(entry.exported, carried.get(entry.local));
        }
      }
    }
  }
  const breaches = [];
  for (const [path, analysis] of files) {
    for (const breach of breachesIn(analysis, { exempt, carried: carriedBy.get(path) })) breaches.push({ file: path, ...breach });
  }
  return breaches;
}

/**
 * The rule's breaches in the source: every src/ module but tests and
 * declarations. UNMARKED_SOURCE's modules are left out, but for their marks
 * on discarded values.
 */
export function checkSource(root) {
  const files = new Map();
  const walk = (directory) => {
    for (const name of readdirSync(directory).sort()) {
      const path = join(directory, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (name.endsWith(".ts") && !name.endsWith(".test.ts") && !name.endsWith(".d.ts")) {
        const file = relative(root, path).split("\\").join("/");
        files.set(file, analyze(readFileSync(path, "utf8"), file, () => file));
      }
    }
  };
  walk(join(root, "src"));
  const resolveSpecifier = (path, specifier) => {
    if (!specifier.startsWith(".")) return null;
    const target = posix.normalize(posix.join(posix.dirname(path), specifier)).replace(/\.js$/u, ".ts");
    return files.has(target) ? target : null;
  };
  return checkFiles(files, (module) => UNMARKED_SOURCE.test(module), resolveSpecifier);
}

/**
 * The rule's breaches in the built files `files` (as "dist/index.js"), whose
 * text `read(path)` returns. esbuild writes `// src/...` before each module's
 * code, so each statement is the module's whose comment comes last before it;
 * statements before any comment are the file's own, and are checked.
 */
export function checkBuild({ files, read }) {
  const analyses = new Map();
  const modules = new Map();
  for (const file of files) {
    const code = read(file);
    const starts = [...code.matchAll(/^\/\/ (src\/.*\S)[ \t]*$/gmu)].map((match) => ({ at: match.index, module: match[1] }));
    const module = (position) => {
      let found = "";
      for (const start of starts) if (start.at < position) found = start.module;
      return found;
    };
    modules.set(file, module);
    analyses.set(file, analyze(code, file, module));
  }
  const resolveSpecifier = (path, specifier) => {
    if (!specifier.startsWith(".")) return null;
    const target = posix.normalize(posix.join(posix.dirname(path), specifier));
    return analyses.has(target) ? target : null;
  };
  return checkFiles(analyses, (module) => UNMARKED_SOURCE.test(module), resolveSpecifier);
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
  console.log("pure-tables: every table in src/ is one a bundler can leave out, and nothing it loads keeps one, but in UNMARKED_SOURCE");
}
