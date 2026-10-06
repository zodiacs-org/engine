// Tables a bundler can leave out. A table built where it is declared,
// `export const X = Object.freeze([...])`, stays in a program that loads its
// module but never reads X if anything its initializer does when the module
// loads might have an effect: a bundler keeps that, and with it the table.
// What the bundlers tried keep (docs/evidence/1.0.0-rc.2-20261006/,
// tools/bundler-probe.mjs): esbuild keeps the whole declaration for an
// unmarked call, an operator, a property read, a template with a substitution
// or a spread, but of an array literal into an array. Rolldown keeps an
// unmarked call. Rollup knows that Object.freeze has no effect, but not
// Array.from, a `map` over an array it cannot see or whose callback reads a
// property, a Set of a table's entries, a spread of a name or a property
// read. All three keep a table that a value computed when its module loads
// reads, and esbuild and Rolldown a table frozen outside its declaration.
// 1.0.0-rc.1 froze the exported tables without saying so, and a site's chart
// bundle grew by tables it never reads.
//
// So a table's initializer holds only what none of them takes for an effect:
// literals; names the module declares, but with `declare`, or imports, and the
// globals in GLOBALS; array and object literals of these; functions; and calls
// and `new`s marked `/*#__PURE__*/`, whose callee is a name, a property of a
// name or of a call in the callee, or a function. Arguments are held to the
// same rule; a function's body is not, since the marked call that runs it is
// what a bundler drops. A class is held to it in the parts that run when it is
// defined: what it extends, its computed names and its static fields. A
// spread, but of an array literal into an array, an operator, a property
// read, a template with a substitution, a tagged template, a conditional, a
// computed key but a literal or a well-known symbol (WELL_KNOWN_SYMBOLS), a
// decorator, a static block with statements, any other name and a
// destructuring declaration are breaches: write the value as a literal, or
// build it in a marked call.
//
// A table is a variable a module declares at its top level, or its default
// export, whose initializer, when the module loads, makes a table: calls
// Object.freeze (or a name bound to it), calls, constructs or tags a template
// with a function of the same module that makes one, or builds a Set or a Map
// from data (`new Set([...])`; an empty one is the module's state, not a
// table), itself or in a function it runs. A function makes a table when its
// code does any of these, its parameters' defaults and the parts of a class in
// it that run when the class is defined among it, with the functions it runs:
// those it declares and calls, calls or constructs in place, or passes,
// written there or by name, Object.freeze among them, to an array's iteration
// method or to a function that calls it, and the default of a parameter it
// calls. A generator's body is taken to run where the generator is called,
// since what calls it may run it. A function passed to any other function, or
// in an object literal, is not taken to run.
//
// A table is kept, too, by whatever else in its module is kept and reads it.
// So the same rule holds for every other top-level declaration that reads a
// table, its module's own or one it imports, by name, as a default or through
// a namespace, directly or through a name that does. Any other statement that
// runs when its module loads, a namespace's among them, may neither read a
// table nor make one, nor may the parts of a class that run when it is
// defined make one; and a class its module keeps for those parts, a
// decorator, a static block, a computed name or a breach among them, may not
// read a table: a freeze belongs in a table's declaration, where it can be
// marked. A name is read where no local of that name hides it.
//
// The mark says that the call may be dropped when its result is not used, so
// it is sound only where the call does nothing else a program could see:
// building a fresh array, object, Set or Map, or freezing one, or computing a
// number, or, as in createAspectPolicy, also remembering the value it returns
// in a WeakSet of the module's own, which nothing can ask about once the value
// is gone (its regular expression test also sets RegExp's legacy statics, as
// any does). That is for a reader to check, not this script. What it does
// check, in every module, is whether a marked call may freeze a value that
// exists before it, which a bundler that drops the call would leave unfrozen:
// with a freeze of its own, in a function it calls or constructs, or in one it
// runs from what it is given, as far as it reads them (below). It is an aid
// to that reader, not a proof: it refuses the forms its tests pin, and a mark
// it accepts in a form it does not read may still leave a value unfrozen. In
// a table, a call that may freeze such a value is a breach marked or not,
// since no mark mends it. Nor does a call whose value is discarded carry the
// mark. A value is discarded when, through operators, conditionals, and array
// and object literals, their keys and spreads among them, it reaches only a
// statement of its own, `void`, the left of a comma, or a `for` loop's
// initializer or update.
//
// A value is new, so that a freeze of it freezes nothing older, only where the
// check sees it made (originJudge): a literal, a function, or an operator's or
// template's result; a class, but where a freeze may reach inside it; an
// array or object literal, and, where a freeze may reach inside it, only one
// whose values are new in turn and that has no getter or setter; a `new`, or
// what Object.create or a method named in FRESH_METHODS returns, the last two
// on trust, since a constructor can return an object that exists before it,
// and so can a method of one of those names, whatever it is called on. Where
// a freeze may reach inside what one of these returns, that holds what it
// copies: what Object.values, Object.entries, Array.of, or Array.from without
// a function are given; the array, and what they are given, of an array's
// slice, filter, concat and the others in COPYING, and of keys; strings, for
// Object.keys and split; and what a map's function returns, or what a spread
// gives any of these, which may exist before the call. A part of a value,
// read from it or destructured, is new only when the value is new throughout,
// and a part it may inherit, such as `[].constructor`, the global Array, is
// not. A name is as new as what it is bound to in the code that runs, when
// nothing assigns it: a `const`'s or a `let`'s initializer; the elements of
// what a `for...of` loop runs over; a `for...in` loop's key, a string; for a
// parameter of a function given to an array's iteration method, written there
// or by name, an element of what the method is called on, and its default;
// for one of a function written in place and called there, its argument and
// its default; and for one of the function whose call is judged, the
// argument, which the call must give new throughout wherever the function may
// freeze it, and its default, wherever the call may give `undefined`: leave
// the argument out, or give anything but a literal, an array or object
// literal, a function, a class, a `new` or a template (neverUndefined). Where
// a freeze may reach inside the value, what the code puts into it counts too:
// what it assigns to a property of it, what it gives its push, unshift,
// splice, fill, set or add, and what Object.assign copies into it; and a
// write in a destructuring's or a loop's target, or by Object.defineProperty
// and the like, may put in a value that exists before the call. Any other name
// may hold a value that exists before the call: a `var`, a catch binding, a
// function's name that a `var` of the same name holds the place of, or that
// is assigned, a parameter of a function passed to anything but an array's
// iteration method, reduce's accumulator, a name of the module. So may what
// any other call returns.
//
// The check reads a function where it is called, constructed or given by
// name: a function of the module or one the code declares, or one a `const`,
// or a `let` that nothing assigns, is bound to, or a `var` of the module that
// nothing assigns; and where it is written in place, through wrappers and
// commas. It reads a function that calls itself until what it is found to
// freeze holds, and takes one that calls a function that calls it to freeze
// any argument it gives that function. It does not read a function of
// another module, a class's constructor, an object's methods, a function run
// through `call`, `apply` or `bind`, one reached through a local `var` or a
// `let` that is assigned, or one passed to any function but an array's
// iteration method or one it reads, a string's replace among them. It does
// not see a write into a value through another name that holds it, or by a
// function the value is given to; nor, where a key is not written as a name
// or a string, whether a property read reads an inherited part. It takes a
// method named as an array's iteration method to run the function it is
// given, whatever it is called on, so it may ask for a mark on a call of an
// object's own `map` that stores the function instead. Code some hundreds of
// calls deep may exhaust the stack it runs on.
//
// UNMARKED_SOURCE names the modules the rule leaves out, those that only the
// ./calc and ./vedic entries reach through their static imports, which the
// export smoke test checks. Their marks, 16 bytes each in the built files,
// would put those two entries over their budgets in
// scripts/verify-package-contents.mjs, which count every byte; a budget is
// raised only with the owner's approval, and until it is given, these tables,
// and what those modules read of the others' when they load, stay as
// 1.0.0-rc.1 had them. Marks are checked there too.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, posix, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

/** The modules whose tables only ./calc and ./vedic load, which the rule leaves out (above). */
export const UNMARKED_SOURCE = /^src\/(?:calc\.ts|vedic\/(?:ayanamsa|dasha|kp|nakshatra|varga)\.ts)$/u;

/** The globals a table may name: those the three bundlers read without taking it for an effect. */
export const GLOBALS = new Set([
  "Array", "BigInt", "Boolean", "Date", "Error", "Float64Array", "Infinity", "JSON", "Map", "Math", "NaN", "Number", "Object",
  "RangeError", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet", "undefined"
]);
/** The methods of an array that call the function they are passed before they return. */
export const ITERATING = new Set([
  "every", "filter", "find", "findIndex", "findLast", "findLastIndex", "flatMap", "forEach", "from", "map", "reduce",
  "reduceRight", "some", "sort", "toSorted"
]);
/** The well-known symbols, `Symbol.iterator` and the others: as a computed key, the three bundlers read each without taking it for an effect. */
export const WELL_KNOWN_SYMBOLS = new Set([
  "asyncDispose", "asyncIterator", "dispose", "hasInstance", "isConcatSpreadable", "iterator", "match", "matchAll", "replace",
  "search", "species", "split", "toPrimitive", "toStringTag", "unscopables"
]);
/** The methods that return a new array or object, which a freeze of what they return freezes, and nothing older. */
export const FRESH_METHODS = new Set([
  "concat", "entries", "filter", "flat", "flatMap", "from", "fromEntries", "keys", "map", "of", "slice", "split",
  "toReversed", "toSorted", "toSpliced", "values", "with"
]);
/** The methods of an array whose result holds what the array holds and what they are given: FRESH_METHODS but map and flatMap. */
const COPYING = new Set(["concat", "entries", "filter", "flat", "slice", "toReversed", "toSorted", "toSpliced", "values", "with"]);
const WRAPPERS = new Set([
  ts.SyntaxKind.ParenthesizedExpression, ts.SyntaxKind.AsExpression, ts.SyntaxKind.SatisfiesExpression,
  ts.SyntaxKind.TypeAssertionExpression, ts.SyntaxKind.NonNullExpression
]);
const unwrap = (node) => (WRAPPERS.has(node.kind) ? unwrap(node.expression) : node);
/** The outermost wrapper around a node, or the node. */
const wrapped = (node) => (node.parent && WRAPPERS.has(node.parent.kind) ? wrapped(node.parent) : node);
/** An expression through wrappers and the right of a comma: what a call of it calls. */
const rightmost = (node) => {
  node = unwrap(node);
  while (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.CommaToken) node = unwrap(node.right);
  return node;
};
/** The key a property read names when it is written as a name or a string, `x.p` or `x["p"]`; null for any other. */
const keyOf = (node) => {
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  const key = unwrap(node.argumentExpression);
  return ts.isStringLiteralLike(key) ? key.text : null;
};
const isFunction = (node) => ts.isArrowFunction(node) || ts.isFunctionExpression(node);
/** A function of any kind, whose parameters and body are its own scope. */
const isFunctionLike = (node) =>
  isFunction(node) || ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) || ts.isGetAccessorDeclaration(node) ||
  ts.isSetAccessorDeclaration(node) || ts.isConstructorDeclaration(node);
/** Code whose body runs only when it is called or constructed. */
const isDeferred = (node) => isFunctionLike(node) || ts.isClassDeclaration(node) || ts.isClassExpression(node);
/** Whether an expression is Object.freeze, `Object.freeze` or `Object["freeze"]`, through wrappers and the right of a comma. */
const isObjectFreeze = (node) => {
  node = rightmost(node);
  return (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) && ts.isIdentifier(unwrap(node.expression)) &&
    unwrap(node.expression).text === "Object" && keyOf(node) === "freeze";
};
const isLiteral = (node) =>
  ts.isStringLiteral(node) || ts.isNumericLiteral(node) || ts.isBigIntLiteral(node) ||
  ts.isNoSubstitutionTemplateLiteral(node) || ts.isRegularExpressionLiteral(node) ||
  node.kind === ts.SyntaxKind.TrueKeyword || node.kind === ts.SyntaxKind.FalseKeyword ||
  node.kind === ts.SyntaxKind.NullKeyword ||
  (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(node.operand));
const isDataCollection = (node) =>
  ts.isNewExpression(node) && ts.isIdentifier(node.expression) &&
  (node.expression.text === "Set" || node.expression.text === "Map") && (node.arguments?.length ?? 0) > 0;
const isAssignment = (kind) => kind >= ts.SyntaxKind.FirstAssignment && kind <= ts.SyntaxKind.LastAssignment;
/** A statement `declare` makes ambient: it declares what exists elsewhere, and TypeScript writes no code for it. */
const isDeclared = (statement) => (ts.getCombinedModifierFlags(statement) & ts.ModifierFlags.Ambient) !== 0;
const isExported = (statement) => (ts.getCombinedModifierFlags(statement) & ts.ModifierFlags.Export) !== 0;
const isDefault = (statement) => (ts.getCombinedModifierFlags(statement) & ts.ModifierFlags.Default) !== 0;
/** A computed key that is no effect: a literal, or a well-known symbol of the global Symbol. */
const isPlainKey = (node, context) => {
  node = unwrap(node);
  return isLiteral(node) || (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) &&
    node.expression.text === "Symbol" && !context.declared.has("Symbol") && WELL_KNOWN_SYMBOLS.has(node.name.text));
};
/** A node whose names (scopeNames, below) hide the same names outside it. */
const isScope = (node) =>
  isFunctionLike(node) || ts.isBlock(node) || ts.isModuleBlock(node) || ts.isCaseBlock(node) || ts.isForStatement(node) ||
  ts.isForInStatement(node) || ts.isForOfStatement(node) || ts.isCatchClause(node) || ts.isClassExpression(node) ||
  ts.isClassDeclaration(node) || ts.isEnumDeclaration(node);
/** The prototypes of the values the check takes for made where they are written: literals, array and object literals, functions. */
const PROTOTYPES = [
  Object.prototype, Array.prototype, Function.prototype, String.prototype, Number.prototype, Boolean.prototype, BigInt.prototype,
  Symbol.prototype, RegExp.prototype
];
/**
 * Whether a property read may read what a value inherits, which exists before
 * it: a key one of PROTOTYPES has, but `length`, which is a number where it
 * is inherited, or a well-known symbol, such as `Symbol.iterator`. A key not
 * written as a name or a string is not known, and not taken to.
 */
const mayInherit = (node) => {
  if (ts.isElementAccessExpression(node)) {
    const key = unwrap(node.argumentExpression);
    if (ts.isPropertyAccessExpression(key) && ts.isIdentifier(key.expression) && key.expression.text === "Symbol") return true;
  }
  const key = keyOf(node);
  return key !== null && key !== "length" && PROTOTYPES.some((prototype) => key in prototype);
};
/** Whether a call returns what is new, on trust: what Object.create, or a method named in FRESH_METHODS, returns. */
const returnsNew = (node) => {
  const callee = unwrap(node.expression);
  return ts.isPropertyAccessExpression(callee) && (FRESH_METHODS.has(callee.name.text) ||
    (ts.isIdentifier(callee.expression) && callee.expression.text === "Object" && callee.name.text === "create"));
};

/** Whether a call or `new` carries the mark: in its own leading comments or a wrapper's around it. */
function marked(node, code, source) {
  for (let at = node; ; at = at.parent) {
    if (/[#@]__PURE__/u.test(code.slice(at.getFullStart(), at.getStart(source)))) return true;
    if (!at.parent || !WRAPPERS.has(at.parent.kind)) return false;
  }
}

/** Adds the names a binding name or pattern declares. */
function bindNames(name, into) {
  if (ts.isIdentifier(name)) into.add(name.text);
  else for (const element of name.elements) if (!ts.isOmittedExpression(element)) bindNames(element.name, into);
}

/** The names a module declares at its top level, its imports among them, but not what it declares ambient. */
function declaredNames(statements) {
  const names = new Set();
  for (const statement of statements) {
    if (isDeclared(statement)) continue;
    if (ts.isVariableStatement(statement)) for (const declaration of statement.declarationList.declarations) bindNames(declaration.name, names);
    else if ((ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement) || ts.isEnumDeclaration(statement) ||
      ts.isModuleDeclaration(statement)) && statement.name && ts.isIdentifier(statement.name)) names.add(statement.name.text);
    else if (ts.isImportDeclaration(statement) && statement.importClause) {
      const clause = statement.importClause;
      if (clause.name) names.add(clause.name.text);
      if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings)) names.add(clause.namedBindings.name.text);
      if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) for (const element of clause.namedBindings.elements) names.add(element.name.text);
    } else if (ts.isImportEqualsDeclaration(statement)) names.add(statement.name.text);
  }
  return names;
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

/** A function's parameters, but TypeScript's `this`, which no argument gives. */
const parametersOf = (fn) => fn.parameters.filter((parameter) => !(ts.isIdentifier(parameter.name) && parameter.name.text === "this"));
/** A call, a `new` or a tagged template. */
const isCallLike = (node) => ts.isCallExpression(node) || ts.isNewExpression(node) || ts.isTaggedTemplateExpression(node);
/** What a call calls: its callee, through wrappers and the right of a comma. */
const calleeOf = (node) => rightmost(ts.isTaggedTemplateExpression(node) ? node.tag : node.expression);
/** What a call gives the function it calls, in order: a tagged template gives its strings, then its substitutions. */
const argumentsOf = (node) => (ts.isTaggedTemplateExpression(node)
  ? [node.template, ...(ts.isTemplateExpression(node.template) ? node.template.templateSpans.map((span) => span.expression) : [])]
  : [...(node.arguments ?? [])]);
/** The call that calls a function written in place, through wrappers and the right of a comma, or null. */
function callingInPlace(fn) {
  let at = fn;
  while (at.parent && (WRAPPERS.has(at.parent.kind) ||
    (ts.isBinaryExpression(at.parent) && at.parent.operatorToken.kind === ts.SyntaxKind.CommaToken && at.parent.right === at))) at = at.parent;
  const call = at.parent;
  return call && isCallLike(call) && (ts.isTaggedTemplateExpression(call) ? call.tag : call.expression) === at ? call : null;
}

/** The binding elements on the way from a binding name to `name`, outer first: [] for the name itself, null if it does not declare it. */
function pathTo(binding, name) {
  if (ts.isIdentifier(binding)) return binding.text === name ? [] : null;
  for (const element of binding.elements) {
    if (ts.isOmittedExpression(element)) continue;
    const inner = pathTo(element.name, name);
    if (inner) return [element, ...inner];
  }
  return null;
}
/** The identifier a binding name declares `name` with. */
const declaringIdentifier = (binding, path) => (path.length ? path[path.length - 1].name : binding);
const kindOf = (list) => (list.flags & ts.NodeFlags.Const ? "const" : list.flags & ts.NodeFlags.Let ? "let" : "other");

/**
 * What declares a name in a scope (scopeNames, below): `kind`, one of
 * "parameter", "const", "let", "for-of", "for-in", "function", "enum" and
 * "other" (a var, a catch binding, a class's or function's own name, a
 * namespace); `id`, the identifier that declares it; and what the kind needs:
 * a parameter's function, index (but `this`) and node, a variable's
 * declaration, a loop's statement, a function's node, and `path`, the binding
 * elements on the way to a destructured name.
 */
function declarationIn(scope, name) {
  if (isFunctionLike(scope)) {
    const parameters = parametersOf(scope);
    for (let index = 0; index < parameters.length; index += 1) {
      const path = pathTo(parameters[index].name, name);
      if (path) return { kind: "parameter", fn: scope, index, parameter: parameters[index], path, id: declaringIdentifier(parameters[index].name, path) };
    }
    // Its own name, in its body.
    return { kind: "function", node: scope, id: scope.name };
  }
  if (ts.isEnumDeclaration(scope)) return { kind: "enum", id: scope };
  if (ts.isCatchClause(scope) || ts.isClassExpression(scope) || ts.isClassDeclaration(scope)) return { kind: "other", id: scope };
  if (ts.isForStatement(scope) || ts.isForInStatement(scope) || ts.isForOfStatement(scope)) {
    for (const declaration of scope.initializer.declarations) {
      const path = pathTo(declaration.name, name);
      if (!path) continue;
      const id = declaringIdentifier(declaration.name, path);
      const kind = kindOf(scope.initializer);
      if (ts.isForOfStatement(scope)) return { kind: kind === "other" ? "other" : "for-of", loop: scope, declaration, path, id, constant: kind === "const" };
      if (ts.isForInStatement(scope)) return { kind: kind === "other" ? "other" : "for-in", loop: scope, declaration, path, id, constant: kind === "const" };
      return { kind, declaration, path, id };
    }
  }
  const statements = ts.isCaseBlock(scope) ? scope.clauses.flatMap((clause) => [...clause.statements]) : scope.statements ?? [];
  for (const statement of statements) {
    if (ts.isVariableStatement(statement) && (statement.declarationList.flags & ts.NodeFlags.BlockScoped)) {
      for (const declaration of statement.declarationList.declarations) {
        const path = pathTo(declaration.name, name);
        if (path) return { kind: kindOf(statement.declarationList), declaration, path, id: declaringIdentifier(declaration.name, path) };
      }
    } else if (ts.isFunctionDeclaration(statement) && statement.name?.text === name) {
      // A `var` of the same name in the same function holds what it is given, once it is given it.
      if (isVarScope(scope) && varsOf(scope).has(name)) return { kind: "other", id: statement.name };
      return { kind: "function", node: statement, id: statement.name };
    } else if ((ts.isClassDeclaration(statement) || ts.isEnumDeclaration(statement) || ts.isModuleDeclaration(statement)) &&
      statement.name && ts.isIdentifier(statement.name) && statement.name.text === name) {
      return { kind: "other", id: statement.name };
    }
  }
  return { kind: "other", id: scope };
}

const bindings = new WeakMap();
/** Where a name read in code is declared (declarationIn, above), with the scope; null for a name of the module or a global. */
function bindingOf(node) {
  if (bindings.has(node)) return bindings.get(node);
  let found = null;
  for (let at = node.parent; at; at = at.parent) {
    if (isScope(at) && scopeNames(at).has(node.text)) {
      found = { scope: at, ...declarationIn(at, node.text) };
      break;
    }
  }
  bindings.set(node, found);
  return found;
}

/** A value an operator writes that is a number, a string or a boolean, which holds nothing (eachWrite, below). */
const PRIMITIVE = Symbol("primitive");
/**
 * Calls `write(target, value)` for each target code writes, anywhere in it,
 * functions inside it among them: a name or a property read. `value` is what
 * is written: what `=`, `||=`, `&&=` or `??=` assigns; PRIMITIVE, for what any
 * other assignment, or counting up or down, makes; and null for a part of a
 * destructuring, or the target of a `for...in` or `for...of` loop that
 * declares nothing.
 */
function eachWrite(root, write) {
  const target = (node, value) => {
    node = unwrap(node);
    if (ts.isArrayLiteralExpression(node)) {
      for (const element of node.elements) target(ts.isSpreadElement(element) ? element.expression : element, null);
    } else if (ts.isObjectLiteralExpression(node)) {
      for (const property of node.properties) {
        if (ts.isPropertyAssignment(property)) target(property.initializer, null);
        else if (ts.isShorthandPropertyAssignment(property)) target(property.name, null);
        else if (ts.isSpreadAssignment(property)) target(property.expression, null);
      }
    } else if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      // A default in a destructuring.
      target(node.left, null);
    } else {
      write(node, value);
    }
  };
  const visit = (node) => {
    if (ts.isBinaryExpression(node) && isAssignment(node.operatorToken.kind)) {
      const operator = node.operatorToken.kind;
      target(node.left, operator === ts.SyntaxKind.EqualsToken || operator === ts.SyntaxKind.BarBarEqualsToken ||
        operator === ts.SyntaxKind.AmpersandAmpersandEqualsToken || operator === ts.SyntaxKind.QuestionQuestionEqualsToken ? node.right : PRIMITIVE);
    } else if ((ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) &&
      (node.operator === ts.SyntaxKind.PlusPlusToken || node.operator === ts.SyntaxKind.MinusMinusToken)) {
      target(node.operand, PRIMITIVE);
    } else if ((ts.isForInStatement(node) || ts.isForOfStatement(node)) && !ts.isVariableDeclarationList(node.initializer)) {
      target(node.initializer, null);
    }
    ts.forEachChild(node, visit);
  };
  visit(root);
}

/** Whether a name a binding declares is assigned anywhere in its scope, in a function inside it too, or counted up or down. */
function assignedIn(binding) {
  let found = false;
  eachWrite(binding.scope, (node) => {
    if (ts.isIdentifier(node) && bindingOf(node)?.id === binding.id) found = true;
  });
  return found;
}

/** The name a value is read from, through wrappers and property reads: `x` for `x`, or for `x.a[0].b`; null if none. */
function readFrom(node) {
  node = unwrap(node);
  while (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) node = unwrap(node.expression);
  return ts.isIdentifier(node) ? node : null;
}

/** The methods that put what they are given into what they are called on: an array's push, unshift, splice and fill, a Map's set and a Set's add. */
const PUTTING = new Set(["add", "fill", "push", "set", "splice", "unshift"]);
const writes = new WeakMap();
/**
 * What code puts into the value a name declares holds, or into a part of it,
 * read from the name in the name's scope, functions inside it among them:
 * what it assigns to a property of it (eachWrite, above); what a call of its
 * push, unshift, splice, fill, set or add is given; and what Object.assign
 * copies into it. Null for what the check does not judge: a write as a part
 * of a destructuring or a loop's target, and Object.defineProperty,
 * defineProperties or setPrototypeOf, or Reflect's set, defineProperty or
 * setPrototypeOf, of it. Writes through another name that holds the value,
 * or by a function it is given to, are not seen.
 */
function writtenInto(binding) {
  if (writes.has(binding.id)) return writes.get(binding.id);
  const written = [];
  const ours = (node) => {
    const name = readFrom(node);
    return name !== null && bindingOf(name)?.id === binding.id;
  };
  // What is assigned to the name itself is counted too, though the name is then judged older (assignedIn, above).
  eachWrite(binding.scope, (node, value) => {
    if (value !== PRIMITIVE && ours(node)) written.push(value);
  });
  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      const callee = unwrap(node.expression);
      const given = node.arguments.map((argument) => (ts.isSpreadElement(argument) ? argument.expression : argument));
      if ((ts.isPropertyAccessExpression(callee) || ts.isElementAccessExpression(callee)) && PUTTING.has(keyOf(callee)) &&
        ours(callee.expression)) {
        written.push(...(keyOf(callee) === "splice" ? given.slice(2) : given));
      } else if ((ts.isPropertyAccessExpression(callee) || ts.isElementAccessExpression(callee)) && ts.isIdentifier(unwrap(callee.expression)) &&
        given.length && ours(given[0])) {
        const owner = unwrap(callee.expression).text;
        const method = keyOf(callee);
        if (owner === "Object" && method === "assign") written.push(...given.slice(1));
        else if ((owner === "Object" && (method === "defineProperty" || method === "defineProperties" || method === "setPrototypeOf")) ||
          (owner === "Reflect" && (method === "set" || method === "defineProperty" || method === "setPrototypeOf"))) written.push(null);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(binding.scope);
  writes.set(binding.id, written);
  return written;
}

/** Whether a call freezes: Object.freeze, or a name bound to it, the module's (context.aliases) or one a function declares. */
function isFreeze(node, context) {
  return ts.isCallExpression(node) && isFreezeReference(node.expression, context);
}
/** Whether an expression is Object.freeze, or a name bound to it, through wrappers and the right of a comma. */
function isFreezeReference(node, context) {
  node = rightmost(node);
  if (isObjectFreeze(node)) return true;
  if (!ts.isIdentifier(node)) return false;
  const binding = bindingOf(node);
  if (!binding) return context.aliases.has(node.text);
  // A `let` first bound to it may still hold it when it is called.
  if (binding.kind !== "const" && (binding.kind !== "let" || !binding.declaration.initializer)) return false;
  const value = unwrap(binding.declaration.initializer);
  if (!binding.path.length) return isObjectFreeze(value);
  // `const { freeze } = Object`.
  const element = binding.path[0];
  const property = element.propertyName ?? element.name;
  return binding.path.length === 1 && ts.isIdentifier(value) && value.text === "Object" && !bindingOf(value) &&
    ts.isIdentifier(property) && property.text === "freeze";
}

/**
 * The function an expression names: one written there; a function that code
 * around it declares, or a const, or a `let` that nothing assigns, bound to
 * one; or one of the module, by its name or a name of the module bound to it
 * (tableFunctions, below). Through wrappers and the right of a comma. Null
 * for anything else, a function of another module among them.
 */
function functionOf(node, context, seen = new Set()) {
  node = rightmost(node);
  if (isFunction(node)) return node;
  if (!ts.isIdentifier(node) || seen.has(node.text)) return null;
  seen.add(node.text);
  const binding = bindingOf(node);
  if (!binding) {
    const body = context.functions.get(node.text);
    if (body) return body.parent;
    const value = context.constants.get(node.text);
    return value ? functionOf(value, context, seen) : null;
  }
  if (binding.kind === "function") return binding.node.body ? binding.node : null;
  if ((binding.kind === "const" || (binding.kind === "let" && !assignedIn(binding))) && !binding.path.length && binding.declaration.initializer) {
    return functionOf(binding.declaration.initializer, context, seen);
  }
  return null;
}
/** The function a call calls, if it is one the check reads (functionOf). */
const calledFunction = (node, context) => functionOf(ts.isTaggedTemplateExpression(node) ? node.tag : node.expression, context);

/** Whether a call or `new` makes a table by itself: a freeze, a Set or Map of data, or a call, `new` or tagged template of a function of the module that makes one. */
function makesTableHere(node, context) {
  if (isDataCollection(node) || isFreeze(node, context)) return true;
  if (!isCallLike(node)) return false;
  const callee = calleeOf(node);
  return ts.isIdentifier(callee) && !bindingOf(callee) && tableFunctionNamed(callee.text, context);
}
/** Whether a name of the module names a function of it that makes a table, directly or through a const bound to its name. */
function tableFunctionNamed(name, context, seen = new Set()) {
  if (context.tableFunctions.has(name)) return true;
  const value = context.constants.get(name);
  if (!value || seen.has(name)) return false;
  seen.add(name);
  const target = unwrap(value);
  return ts.isIdentifier(target) && tableFunctionNamed(target.text, context, seen);
}

const PENDING = Symbol("pending");
/**
 * The answers of callsParameter, below. A "no" found while another answer
 * was pending is provisional: it stands until an answer is "yes", which may
 * overturn it, and is then asked again. Answers only turn from no to yes.
 */
const newMemo = () => ({ answers: new Map(), provisional: new Set(), pendingUsed: false });

/**
 * Whether `test` holds for a node of the code that runs when `root` runs: its
 * own code, a function's parameters' defaults among it; the parts of a class
 * in it that run when the class is defined (classLoadParts, below); and the
 * functions it calls or constructs in place, those code around it declares
 * and it calls by name (unless `named` is false), the default of a parameter
 * it calls, when that is a function, and those it passes, written in place or
 * by name, to an array's iteration method or to a function that calls them
 * (callsArgument, below), with their parameters' defaults. A generator's body
 * is taken to run when it is called, since what calls it may run it. A
 * function it returns, stores, or passes to any other function is not taken
 * to run, nor is a class's constructor or method, nor are functions of other
 * modules read.
 */
function runs(root, context, test, { named = true } = {}, seen = new Set(), memo = newMemo()) {
  let found = false;
  const run = (fn) => {
    if (found || !fn || !fn.body || seen.has(fn)) return;
    seen.add(fn);
    if (runs(fn, context, test, { named }, seen, memo)) found = true;
  };
  // A class runs, when it is defined, the parts classLoadParts names.
  const visitClass = (node) => classLoadParts(node).forEach((part) => visit(part.node));
  const visit = (node) => {
    if (found || ts.isTypeNode(node)) return;
    if (isDeferred(node) && node !== root) {
      if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) return visitClass(node);
      if (!isFunction(node)) return;
      if (callingInPlace(node)) return run(node);
      const outer = wrapped(node);
      const call = outer.parent;
      if (call && (ts.isCallExpression(call) || ts.isNewExpression(call))) {
        const index = (call.arguments ?? []).indexOf(outer);
        if (index >= 0 && callsArgument(call, index, context, memo)) run(node);
      }
      return;
    }
    if (test(node)) {
      found = true;
      return;
    }
    if (isCallLike(node)) {
      const callee = calleeOf(node);
      if (named && ts.isIdentifier(callee) && bindingOf(callee)) run(functionOf(callee, context));
      // A parameter's default runs where a call leaves the argument out.
      const binding = ts.isIdentifier(callee) ? bindingOf(callee) : null;
      if (binding?.kind === "parameter" && !binding.path.length && binding.parameter.initializer) run(functionOf(binding.parameter.initializer, context));
      if (named && !ts.isTaggedTemplateExpression(node)) {
        (node.arguments ?? []).forEach((argument, index) => {
          const given = unwrap(argument);
          if (isFunction(given) || !ts.isIdentifier(given) || !bindingOf(given)) return;
          const fn = functionOf(given, context);
          if (fn && callsArgument(node, index, context, memo)) run(fn);
        });
      }
      if (found) return;
    }
    ts.forEachChild(node, visit);
  };
  // A function's parameters, with their defaults, and its body: the code that runs when it is called.
  if (isFunctionLike(root)) {
    for (const parameter of root.parameters) visit(parameter);
    if (root.body) visit(root.body);
  } else {
    visit(root);
  }
  return found;
}

/**
 * Whether a call runs the function it is given at `index`: an array's
 * iteration method, its callback (Array.from's second argument, any other's
 * first), taken by the method's name whatever it is called on; or a function
 * the check reads (functionOf) that calls the parameter there.
 */
function callsArgument(call, index, context, memo = newMemo()) {
  const callee = calleeOf(call);
  if (ts.isPropertyAccessExpression(callee) && ITERATING.has(callee.name.text)) return index === (callee.name.text === "from" ? 1 : 0);
  return callsParameter(functionOf(callee, context), index, context, memo);
}

/**
 * Whether a function calls its parameter at `index` when it runs: calls or
 * constructs it, or its `call` or `apply`, or passes it to a call that runs
 * it (callsArgument). A parameter it gathers with `...` or destructures is
 * not taken to be called. A question asked again while it is being answered,
 * as a function that calls itself asks it, is answered no for the while, and
 * a "no" that rests on such an answer is provisional (newMemo, above).
 */
function callsParameter(fn, index, context, memo) {
  if (!fn || !fn.body) return false;
  const parameter = parametersOf(fn)[index];
  if (!parameter || parameter.dotDotDotToken || !ts.isIdentifier(parameter.name)) return false;
  if (memo.answers.has(parameter)) {
    const answer = memo.answers.get(parameter);
    if (answer === PENDING || memo.provisional.has(parameter)) memo.pendingUsed = true;
    return answer === true;
  }
  memo.answers.set(parameter, PENDING);
  const usedBefore = memo.pendingUsed;
  memo.pendingUsed = false;
  const isParameter = (node) => ts.isIdentifier(node) && bindingOf(node)?.id === parameter.name;
  const calls = runs(fn, context, (node) => {
    if (!ts.isCallExpression(node) && !ts.isNewExpression(node)) return false;
    const callee = calleeOf(node);
    if (isParameter(callee)) return true;
    if (ts.isPropertyAccessExpression(callee) && (callee.name.text === "call" || callee.name.text === "apply") &&
      isParameter(unwrap(callee.expression))) return true;
    return (node.arguments ?? []).some((argument, at) => isParameter(unwrap(argument)) && callsArgument(node, at, context, memo));
  }, {}, new Set(), memo);
  memo.answers.set(parameter, calls);
  if (calls) {
    for (const overturned of memo.provisional) memo.answers.delete(overturned);
    memo.provisional.clear();
  } else if (memo.pendingUsed) {
    memo.provisional.add(parameter);
  }
  memo.pendingUsed = usedBefore || (!calls && memo.pendingUsed);
  return calls;
}

/**
 * The functions a call or `new` runs from what it is given (callsArgument):
 * each with its index among the arguments and, but for Object.freeze given
 * itself (`freeze`), the function (functionOf) and whether it is written
 * there (`inPlace`).
 */
function callbacksRun(node, context) {
  if (ts.isTaggedTemplateExpression(node)) return [];
  const found = [];
  (node.arguments ?? []).forEach((argument, index) => {
    if (ts.isSpreadElement(argument)) return;
    // Only what is a function, or Object.freeze, is asked about: a call's other arguments are not followed.
    const freeze = isFreezeReference(argument, context);
    const fn = freeze ? null : functionOf(argument, context);
    if ((!freeze && !fn) || !callsArgument(node, index, context)) return;
    found.push(freeze ? { index, freeze: true } : { index, fn, inPlace: isFunction(unwrap(argument)) });
  });
  return found;
}

/**
 * Whether code makes a table when it runs (runs, above): a call that makes
 * one by itself, or that runs, given by name, Object.freeze or a function
 * that makes one. `seen` holds the functions this question has looked at.
 */
const runsTableMaking = (root, context, seen = new Set()) => runs(root, context, (node) => isCallLike(node) &&
  (makesTableHere(node, context) ||
    callbacksRun(node, context).some(({ freeze, fn, inPlace }) => freeze || (!inPlace && makesTableFunction(fn, context, seen)))), {}, seen);
/**
 * Whether a function given by name makes a table when it runs: one of the
 * module by its name, or one code declares, looked at once in a question.
 */
function makesTableFunction(fn, context, seen = new Set()) {
  for (const [name, body] of context.functions) if (body.parent === fn) return context.tableFunctions.has(name);
  if (seen.has(fn)) return false;
  seen.add(fn);
  return runsTableMaking(fn, context, seen);
}

/**
 * The part a parameter of a function written in place plays: given by the
 * call that calls it in place ("argument", with the argument, if any); or,
 * passed to an array's iteration method, an element of what the method is
 * called on, or of Array.from's first argument ("element", with what it is
 * an element of), an index ("index"), or that array itself ("array"); and
 * "unknown" otherwise: reduce's accumulator, or a parameter of a function
 * passed to any other function, or of one not written in place. forEach's
 * second parameter is taken for an element, since a Map's forEach gives it a
 * key and a Set's a value.
 */
function roleOf(fn, index) {
  const call = callingInPlace(fn);
  if (call) {
    const given = argumentsOf(call);
    const spread = given.findIndex((argument) => ts.isSpreadElement(argument));
    return spread >= 0 && index >= spread ? { kind: "unknown" } : { kind: "argument", node: given[index] };
  }
  const outer = wrapped(fn);
  const parent = outer.parent;
  if (!parent || !(ts.isCallExpression(parent) || ts.isNewExpression(parent))) return { kind: "unknown" };
  return roleAt(parent, (parent.arguments ?? []).indexOf(outer), index);
}
/** The part the parameter at `index` of a function given at `at` to an array's iteration method plays (roleOf, above). */
function roleAt(call, at, index) {
  const callee = calleeOf(call);
  if (!ts.isPropertyAccessExpression(callee) || !ITERATING.has(callee.name.text)) return { kind: "unknown" };
  const method = callee.name.text;
  const given = call.arguments ?? [];
  if (method === "from") return at !== 1 ? { kind: "unknown" } : index === 0 ? { kind: "element", of: given[0] } : index === 1 ? { kind: "index" } : { kind: "unknown" };
  if (at !== 0) return { kind: "unknown" };
  const array = callee.expression;
  if (method === "reduce" || method === "reduceRight") {
    return index === 1 ? { kind: "element", of: array } : index === 2 ? { kind: "index" } : index === 3 ? { kind: "array", of: array } : { kind: "unknown" };
  }
  if (method === "sort" || method === "toSorted") return index <= 1 ? { kind: "element", of: array } : { kind: "unknown" };
  if (index === 1) return method === "forEach" ? { kind: "element", of: array } : { kind: "index" };
  return index === 0 ? { kind: "element", of: array } : index === 2 ? { kind: "array", of: array } : { kind: "unknown" };
}

/**
 * Judges what a value may hold, as code that runs when `root` runs (null: a
 * call outside any function the check follows) gives it to a freeze. It
 * writes into `into`: `older`, that the value, or with `deep` anything in it,
 * may exist before the call; `parameters`, the indices of `root`'s
 * parameters it may come from; `defaults`, those whose default may exist
 * before it, which a call that leaves the argument out gives.
 *
 * A value is made where it is written, and so not older, when it is a
 * literal, a function, or an operator's or template's result; a class, but
 * with `deep`; an array or object literal, with `deep` only when what it
 * holds is new throughout and it has no getter or setter; a `new`, or what
 * Object.create or a method named in FRESH_METHODS returns, with `deep` only a
 * copy of what is new throughout in turn (judgeCall). A part of a value, a
 * property or element read from it, or a name destructured from it, is new
 * only when the value is new throughout and the part is not one it may
 * inherit (mayInherit). A name that nothing assigns is followed to its
 * declaration in the code that runs: a `const`'s or `let`'s initializer; the
 * elements of what a `for...of` loop runs over; a `for...in` loop's key; a
 * parameter of `root`, to the argument, which the call must give new
 * throughout where it may be frozen, and to its default; a parameter of a
 * function written in place, to its part (roleOf, above) and its default; a
 * function declared there, made when it runs. With `deep`, what the code
 * puts into the value counts too (writtenInto). Every other name, a `var`, a
 * catch binding, a name declared outside the code that runs, a name of the
 * module, and any other call's value may exist before the call.
 */
function originJudge(root, context) {
  const following = new Set();
  const inRoot = (node) => {
    for (let at = node; at; at = at.parent) if (at === root) return true;
    return false;
  };
  const judge = (node, deep, into) => {
    node = unwrap(node);
    if (ts.isConditionalExpression(node)) {
      judge(node.whenTrue, deep, into);
      judge(node.whenFalse, deep, into);
      return;
    }
    if (ts.isBinaryExpression(node)) {
      const operator = node.operatorToken.kind;
      if (operator === ts.SyntaxKind.CommaToken) return judge(node.right, deep, into);
      if (operator === ts.SyntaxKind.QuestionQuestionToken || operator === ts.SyntaxKind.BarBarToken ||
        operator === ts.SyntaxKind.AmpersandAmpersandToken || (isAssignment(operator) && operator !== ts.SyntaxKind.EqualsToken)) {
        judge(node.left, deep, into);
        judge(node.right, deep, into);
        return;
      }
      if (operator === ts.SyntaxKind.EqualsToken) return judge(node.right, deep, into);
      return;
    }
    if (isLiteral(node) || ts.isTemplateExpression(node) || ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node) ||
      ts.isTypeOfExpression(node) || ts.isVoidExpression(node) || ts.isDeleteExpression(node) || isFunction(node)) return;
    // A class is made where it is written, but what its static fields hold, or what it extends, may exist before it.
    if (ts.isClassExpression(node)) {
      if (deep) into.older = true;
      return;
    }
    if (ts.isArrayLiteralExpression(node)) {
      if (deep) for (const element of node.elements) if (!ts.isOmittedExpression(element)) judge(ts.isSpreadElement(element) ? element.expression : element, true, into);
      return;
    }
    if (ts.isObjectLiteralExpression(node)) {
      if (!deep) return;
      for (const property of node.properties) {
        if (ts.isPropertyAssignment(property)) judge(property.initializer, true, into);
        else if (ts.isShorthandPropertyAssignment(property)) judge(property.name, true, into);
        else if (ts.isSpreadAssignment(property)) judge(property.expression, true, into);
        else if (!ts.isMethodDeclaration(property)) into.older = true;
      }
      return;
    }
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      // `[].constructor` is the global Array: a part a value may inherit exists before it.
      if (mayInherit(node)) {
        into.older = true;
        return;
      }
      return judge(node.expression, true, into);
    }
    if (ts.isCallExpression(node)) return judgeCall(node, deep, into);
    if (ts.isNewExpression(node)) {
      if (deep) into.older = true;
      return;
    }
    if (ts.isIdentifier(node)) return judgeName(node, deep, into);
    into.older = true;
  };
  // What a copy holds is what it copies, on the trust FRESH_METHODS has: Object.values or entries, Array.from without a
  // function, or of, of what they are given; an array's slice, filter, concat and the like, or keys, of it and what they
  // are given. A string's split and Object.keys hold strings. What a map's function returns is not followed, nor what a
  // spread gives a call: judge takes a spread for a value that may exist before it.
  const judgeCall = (node, deep, into) => {
    if (!deep) {
      if (!returnsNew(node)) into.older = true;
      return;
    }
    const callee = unwrap(node.expression);
    const given = node.arguments;
    if (ts.isPropertyAccessExpression(callee)) {
      const method = callee.name.text;
      const target = unwrap(callee.expression);
      const global = ts.isIdentifier(target) && !bindingOf(target) && !context.declared.has(target.text) ? target.text : null;
      if (method === "split" || (global === "Object" && method === "keys")) return;
      if ((global === "Object" && (method === "values" || method === "entries" || method === "fromEntries")) ||
        (global === "Array" && (method === "of" || (method === "from" && given.length < 2)))) {
        for (const argument of given) judge(argument, true, into);
        return;
      }
      if (!global && (COPYING.has(method) || method === "keys")) {
        judge(callee.expression, true, into);
        for (const argument of given) judge(argument, true, into);
        return;
      }
    }
    into.older = true;
  };
  const judgeName = (node, deep, into) => {
    const binding = bindingOf(node);
    if (!binding) {
      if (node.text !== "undefined") into.older = true;
      return;
    }
    if (!root || !inRoot(binding.scope)) {
      into.older = true;
      return;
    }
    const part = deep || (binding.path?.length ?? 0) > 0;
    // The defaults of the elements on the way to a destructured name apply whatever the value.
    for (const element of binding.path ?? []) if (element.initializer) judge(element.initializer, deep, into);
    if (binding.kind === "enum") return;
    // A function declared in the code that runs is made when it runs; the one that runs, read by its own name, is not.
    if (following.has(binding.id) || (binding.kind === "function" && binding.node === root) ||
      (binding.kind !== "const" && assignedIn(binding))) {
      into.older = true;
      return;
    }
    following.add(binding.id);
    if (binding.kind === "parameter") {
      judgeParameter(binding, part, into);
    } else if (binding.kind === "const" || binding.kind === "let") {
      if (binding.declaration.initializer) judge(binding.declaration.initializer, part, into);
    } else if (binding.kind === "for-of") {
      judge(binding.loop.expression, true, into);
    } else if (binding.kind !== "for-in" && binding.kind !== "function") {
      into.older = true;
    }
    // Where a freeze may reach inside the value, what code puts into it counts too.
    if (part && binding.kind !== "other") {
      for (const value of writtenInto(binding)) {
        if (value === null) into.older = true;
        else judge(value, true, into);
      }
    }
    following.delete(binding.id);
  };
  const judgeParameter = (binding, deep, into) => {
    const { fn, index, parameter } = binding;
    if (fn === root) {
      into.parameters.add(index);
      if (parameter.initializer) {
        const left = { older: false, parameters: new Set(), defaults: new Set() };
        judge(parameter.initializer, deep, left);
        if (left.older) into.defaults.add(index);
        for (const other of left.parameters) into.parameters.add(other);
      }
      return;
    }
    // A default applies where the part is left out or undefined.
    if (parameter.initializer) judge(parameter.initializer, deep, into);
    if (parameter.dotDotDotToken) {
      into.older = true;
      return;
    }
    const role = roleOf(fn, index);
    if (role.kind === "argument") {
      if (role.node) judge(role.node, deep, into);
    } else if (role.kind === "element") {
      judge(role.of, true, into);
    } else if (role.kind === "array") {
      judge(role.of, deep, into);
    } else if (role.kind !== "index") {
      into.older = true;
    }
  };
  return judge;
}

/** A blank judgement (originJudge, above). */
const blank = () => ({ older: false, parameters: new Set(), defaults: new Set() });

/**
 * What a call's callee, a function the check reads, freezes of what the call
 * gives it (freezeProfile, below), judged into `into` with `use`.
 */
function applyProfile(profile, given, use, into) {
  if (profile.module || leftOut(profile, given)) into.older = true;
  const spread = given.findIndex((argument) => ts.isSpreadElement(argument));
  given.forEach((argument, index) => {
    if (spread >= 0 && index >= spread) {
      if (profile.parameters.size) into.older = true;
    } else if (freezesAt(profile, index)) {
      use(argument, true);
    }
  });
}

/**
 * What the functions a call runs from what it is given (callbacksRun, above)
 * freeze of their parameters, judged into `into` with `use`: an element, or
 * the array, of what an iteration method is called on, new throughout; an
 * index, a number; anything else, reduce's accumulator and the parameters of
 * a function passed to any other function among them, may exist before it.
 */
function applyCallbacks(node, context, use, into, { inPlace = true } = {}) {
  for (const callback of callbacksRun(node, context)) {
    if (callback.freeze) {
      const role = roleAt(node, callback.index, 0);
      if (role.kind === "element") use(role.of, true);
      else into.older = true;
      continue;
    }
    if (!inPlace && callback.inPlace) continue;
    const profile = profileOf(callback.fn, context);
    if (profile.module || profile.defaults.size || profile.rest >= 0 && profile.parameters.has(profile.rest)) into.older = true;
    for (const index of profile.parameters) {
      const role = roleAt(node, callback.index, index);
      if (role.kind === "element" || role.kind === "array") use(role.of, true);
      else if (role.kind !== "index") into.older = true;
    }
  }
}

/** A profile (freezeProfile, below) that freezes nothing. */
const noProfile = (fn) => ({
  module: false, parameters: new Set(), defaults: new Set(), rest: parametersOf(fn).findIndex((parameter) => parameter.dotDotDotToken)
});
/**
 * Whether a profile freezes a parameter, or applies a default, that another
 * does not: what a function's call of itself passes on (profileOf, below). A
 * value of the module it freezes there it freezes in any case.
 */
const grows = (after, before) => [...after.parameters].some((index) => !before.parameters.has(index)) ||
  [...after.defaults].some((index) => !before.defaults.has(index));
/** What either of two profiles freezes. */
const joined = (one, other) => ({
  module: one.module || other.module, parameters: new Set([...one.parameters, ...other.parameters]),
  defaults: new Set([...one.defaults, ...other.defaults]), rest: other.rest
});

/**
 * The most a function may freeze, for a function that calls it while its own
 * profile is being found (profileOf, below): what it is given, at any index,
 * and the defaults that may exist before the call. What it freezes besides is
 * in its own profile.
 */
function everyArgument(fn, context) {
  const profile = noProfile(fn);
  const judge = originJudge(fn, context);
  parametersOf(fn).forEach((parameter, index) => {
    profile.parameters.add(index);
    if (!parameter.initializer) return;
    const into = blank();
    judge(parameter.initializer, true, into);
    if (into.older) profile.defaults.add(index);
  });
  return profile;
}

/**
 * What a function freezes (freezeProfile, below): a table function of the
 * module's from the module's own (tableFunctions), any other's found once
 * for each state of those, in `context.found`. A function that calls itself
 * is taken, there, to freeze what it has been found to so far, and its
 * profile is found again until that holds. A function asked about by another
 * while its own profile is being found is taken to freeze what everyArgument
 * says, and what the other is found to freeze, which rests on that, is not
 * kept (`context.low`, the lowest such function's place in `context.stack`).
 */
function profileOf(fn, context) {
  for (const [name, body] of context.functions) if (body.parent === fn && context.profiles.has(name)) return context.profiles.get(name);
  if (context.found.has(fn)) return context.found.get(fn);
  const { stack } = context;
  const at = stack.findIndex((entry) => entry.fn === fn);
  if (at >= 0 && at === stack.length - 1) {
    stack[at].recursed = true;
    return stack[at].profile;
  }
  if (at >= 0) {
    context.low = Math.min(context.low, at);
    return everyArgument(fn, context);
  }
  const entry = { fn, profile: noProfile(fn), recursed: false };
  const place = stack.length;
  const outer = context.low;
  context.low = Infinity;
  stack.push(entry);
  try {
    for (;;) {
      entry.recursed = false;
      const found = freezeProfile(fn, context);
      const again = entry.recursed && grows(found, entry.profile);
      entry.profile = joined(entry.profile, found);
      if (!again) break;
    }
  } finally {
    stack.pop();
  }
  const resting = context.low < place;
  context.low = Math.min(outer, context.low);
  if (!resting) context.found.set(fn, entry.profile);
  return entry.profile;
}

/**
 * What a function may freeze as it runs, judged by originJudge (above) with
 * the function as its root: `module`, a value that may exist before the call;
 * `parameters`, the indices of the parameters it may freeze, or a part of
 * (`rest`, the index of one gathered with `...`); and `defaults`, those
 * whose default may exist before it. It looks at every freeze the function
 * runs, the functions written in place it runs among them (runs, above, but
 * not those it calls by name), every call of a function it calls by name,
 * given what that function freezes, and every function it gives a call that
 * runs it by name.
 */
function freezeProfile(fn, context) {
  const profile = noProfile(fn);
  if (!fn.body) return profile;
  const judge = originJudge(fn, context);
  const into = { older: false, parameters: profile.parameters, defaults: profile.defaults };
  const use = (node, deep) => judge(node, deep, into);
  runs(fn, context, (node) => {
    if (!isCallLike(node)) return false;
    if (isFreeze(node, context)) {
      if (node.arguments.length) use(node.arguments[0], false);
      return false;
    }
    const callee = calledFunction(node, context);
    if (callee && !callingInPlace(callee)) applyProfile(profileOf(callee, context), argumentsOf(node), use, into);
    applyCallbacks(node, context, use, into, { inPlace: false });
    return false;
  }, { named: false });
  profile.module = into.older;
  return profile;
}

/** Whether a function with the given profile (freezeProfile, above) may freeze its argument at `index`. */
const freezesAt = (profile, index) =>
  profile.parameters.has(profile.rest >= 0 && index >= profile.rest ? profile.rest : index);
/**
 * Whether an argument is never `undefined`, so that its parameter's default
 * never applies: a literal, `null` among them, an array or object literal, a
 * function or class, a `new`, a template, or what a prefix operator or typeof
 * makes; and a conditional whose two values are none, or a `||`, `??` or
 * comma whose right is none.
 */
const neverUndefined = (node) => {
  node = unwrap(node);
  if (ts.isConditionalExpression(node)) return neverUndefined(node.whenTrue) && neverUndefined(node.whenFalse);
  if (ts.isBinaryExpression(node)) {
    const operator = node.operatorToken.kind;
    return (operator === ts.SyntaxKind.BarBarToken || operator === ts.SyntaxKind.QuestionQuestionToken ||
      operator === ts.SyntaxKind.CommaToken) && neverUndefined(node.right);
  }
  return isLiteral(node) || ts.isArrayLiteralExpression(node) || ts.isObjectLiteralExpression(node) || isFunction(node) ||
    ts.isClassExpression(node) || ts.isNewExpression(node) || ts.isTemplateExpression(node) || ts.isPrefixUnaryExpression(node) ||
    ts.isTypeOfExpression(node);
};
/**
 * Whether a call may leave out, or give `undefined` for, an argument whose
 * default, a value that may exist before it, the function freezes: one it
 * does not give, or one it gives that may be `undefined` (neverUndefined,
 * above), a spread among them.
 */
const leftOut = (profile, given) => [...profile.defaults].some((index) => !given[index] || !neverUndefined(given[index]));

/**
 * The module's own functions, but one that a `var` of the same name holds
 * the place of once it is given a value; the names it binds to another value
 * with a `const`, or with a `let` or `var` that its code does not assign;
 * those of its functions that make a table; and the profile of each of these
 * (freezeProfile, above). Each by name, to a fixed point.
 */
function tableFunctions(statements, context) {
  const assigned = new Set();
  for (const statement of statements) eachWrite(statement, (node) => {
    if (ts.isIdentifier(node) && !bindingOf(node)) assigned.add(node.text);
  });
  const vars = new Set();
  for (const statement of statements) {
    if (!ts.isVariableStatement(statement) || (statement.declarationList.flags & ts.NodeFlags.BlockScoped)) continue;
    for (const declaration of statement.declarationList.declarations) bindNames(declaration.name, vars);
  }
  for (const statement of statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name && statement.body && !vars.has(statement.name.text)) {
      context.functions.set(statement.name.text, statement.body);
    }
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        const value = declaration.initializer && unwrap(declaration.initializer);
        if (!ts.isIdentifier(declaration.name) || !value) continue;
        if (isFunction(value)) context.functions.set(declaration.name.text, value.body);
        else if ((statement.declarationList.flags & ts.NodeFlags.Const) || !assigned.has(declaration.name.text)) {
          context.constants.set(declaration.name.text, declaration.initializer);
        }
      }
    }
  }
  for (let grew = true; grew;) {
    grew = false;
    for (const [name, body] of context.functions) {
      if (!context.tableFunctions.has(name) && runsTableMaking(body.parent, context)) {
        context.tableFunctions.add(name);
        grew = true;
      }
    }
  }
  for (const name of context.tableFunctions) context.profiles.set(name, { module: false, parameters: new Set(), defaults: new Set(), rest: -1 });
  for (let grew = true; grew;) {
    grew = false;
    for (const name of context.tableFunctions) {
      const before = context.profiles.get(name);
      const after = freezeProfile(context.functions.get(name).parent, context);
      const added = (key) => [...after[key]].some((index) => !before[key].has(index));
      if ((after.module && !before.module) || added("parameters") || added("defaults") || after.rest !== before.rest) {
        context.profiles.set(name, {
          module: before.module || after.module, parameters: new Set([...before.parameters, ...after.parameters]),
          defaults: new Set([...before.defaults, ...after.defaults]), rest: after.rest
        });
        context.found.clear();
        grew = true;
      }
    }
  }
}

/**
 * Whether a call or `new` may freeze a value that exists before it, which a
 * bundler that drops the call leaves unfrozen: a freeze of a value not made
 * where it is written; a call of a function the check reads (functionOf,
 * above) that freezes a value that may exist before it, or is given, where
 * it may freeze what it is given, a value not new throughout; and a function
 * the call runs from what it is given that does either (applyCallbacks).
 * Judged as originJudge judges with no root: every name may exist before it.
 */
function freezesExisting(node, context) {
  if (!ts.isCallExpression(node) && !ts.isNewExpression(node)) return false;
  const into = blank();
  const judge = originJudge(null, context);
  const use = (value, deep) => judge(value, deep, into);
  if (isFreeze(node, context)) {
    if (node.arguments.length) use(node.arguments[0], false);
  } else {
    const callee = calledFunction(node, context);
    if (callee) applyProfile(profileOf(callee, context), argumentsOf(node), use, into);
  }
  applyCallbacks(node, context, use, into);
  return into.older;
}

/**
 * The parts of a class that run when it is defined: its decorators and its
 * members' and their parameters', what it extends, its computed names, its
 * static fields and its static blocks with statements, each with its kind.
 */
function classLoadParts(node) {
  const parts = [];
  const decorate = (decorated) => {
    for (const decorator of (ts.canHaveDecorators(decorated) && ts.getDecorators(decorated)) || []) {
      parts.push({ kind: "decorator", node: decorator.expression });
    }
  };
  decorate(node);
  for (const clause of node.heritageClauses ?? []) {
    if (clause.token === ts.SyntaxKind.ExtendsKeyword) for (const type of clause.types) parts.push({ kind: "extends", node: type.expression });
  }
  for (const member of node.members) {
    decorate(member);
    for (const parameter of isFunctionLike(member) ? member.parameters : []) decorate(parameter);
    if (member.name && ts.isComputedPropertyName(member.name)) parts.push({ kind: "name", node: member.name.expression });
    const isStatic = ts.getCombinedModifierFlags(member) & ts.ModifierFlags.Static;
    if (ts.isPropertyDeclaration(member) && isStatic && member.initializer) parts.push({ kind: "static", node: member.initializer });
    if (ts.isClassStaticBlockDeclaration(member) && member.body.statements.length) parts.push({ kind: "block", node: member.body });
  }
  return parts;
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
    if (isLiteral(node) || isFunction(node)) return;
    if (ts.isIdentifier(node)) {
      if (!context.declared.has(node.text) && !GLOBALS.has(node.text)) problems.push({ node, what: "a name the module does not declare" });
      return;
    }
    if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
      if (!inCallee) calls.push(node);
      const callee = unwrap(node.expression);
      const inPlace = calledFunction(node, context);
      if (makesTableHere(node, context) || (inPlace && callingInPlace(inPlace) && runsTableMaking(inPlace, context)) ||
        callbacksRun(node, context).some(({ freeze, fn }) => freeze || runsTableMaking(fn, context, new Set([fn])))) makes = true;
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
        if (property.name && ts.isComputedPropertyName(property.name) && !isPlainKey(property.name.expression, context)) {
          problems.push({ node: property.name, what: "a computed key" });
          visit(property.name.expression, false);
        }
        if (ts.isSpreadAssignment(property)) {
          problems.push({ node: property, what: "a spread" });
          visit(property.expression, false);
        } else if (ts.isPropertyAssignment(property)) {
          visit(property.initializer, false);
        } else if (ts.isShorthandPropertyAssignment(property)) {
          visit(property.name, false);
        }
      }
      return;
    }
    if (ts.isClassExpression(node)) {
      // A class's body runs when it is constructed, but for the parts that run when it is defined.
      for (const part of classLoadParts(node)) {
        if (part.kind === "block") problems.push({ node: part.node.parent, what: "a static block" });
        else if (part.kind === "decorator") problems.push({ node: part.node.parent, what: "a decorator" });
        else if (part.kind === "name" && !isPlainKey(part.node, context)) problems.push({ node: part.node.parent, what: "a computed key" });
        if (part.kind !== "block" && !(part.kind === "name" && isPlainKey(part.node, context))) visit(part.node, false);
      }
      return;
    }
    if (ts.isTaggedTemplateExpression(node)) {
      problems.push({ node, what: "a tagged template" });
      if (makesTableHere(node, context)) makes = true;
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

/**
 * The names a scope declares for the code inside it: a function's own name
 * and its parameters, which its parameters' default values see too; what a
 * block or a `switch`'s cases declare with `let`, `const`, `using`, or as a
 * function, class, enum or namespace, and, in a function's body, a static
 * block's or a namespace's, the `var`s anywhere in it; what a `for` loop's
 * initializer or a `catch` declares; a class's own name, inside it; and an
 * enum's members, inside it.
 */
const scopes = new WeakMap();
function scopeNames(node) {
  if (!scopes.has(node)) scopes.set(node, namesOf(node));
  return scopes.get(node);
}
/** Whether a block is a function's body, a static block's or a namespace's, where a `var` anywhere in it is declared. */
const isVarScope = (node) => ts.isModuleBlock(node) ||
  (ts.isBlock(node) && (isFunctionLike(node.parent) || ts.isClassStaticBlockDeclaration(node.parent)) && node.parent.body === node);
const varScopes = new WeakMap();
/** The names a `var` declares in such a block (isVarScope, above), but in the functions, classes and namespaces inside it. */
function varsOf(block) {
  if (!varScopes.has(block)) {
    const names = new Set();
    const visit = (child) => {
      if (isDeferred(child) || ts.isModuleDeclaration(child)) return;
      if (ts.isVariableDeclarationList(child) && !(child.flags & ts.NodeFlags.BlockScoped)) {
        for (const declaration of child.declarations) bindNames(declaration.name, names);
      }
      ts.forEachChild(child, visit);
    };
    ts.forEachChild(block, visit);
    varScopes.set(block, names);
  }
  return varScopes.get(block);
}
function namesOf(node) {
  const names = new Set();
  const lexical = (statements) => {
    for (const statement of statements) {
      if (ts.isVariableStatement(statement)) {
        if (statement.declarationList.flags & ts.NodeFlags.BlockScoped) {
          for (const declaration of statement.declarationList.declarations) bindNames(declaration.name, names);
        }
      } else if ((ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement) || ts.isEnumDeclaration(statement) ||
        ts.isModuleDeclaration(statement)) && statement.name && ts.isIdentifier(statement.name)) {
        names.add(statement.name.text);
      }
    }
  };
  if (isFunctionLike(node)) {
    if ((ts.isFunctionExpression(node) || ts.isFunctionDeclaration(node)) && node.name) names.add(node.name.text);
    for (const parameter of node.parameters) bindNames(parameter.name, names);
  } else if (ts.isBlock(node) || ts.isModuleBlock(node)) {
    lexical(node.statements);
    if (isVarScope(node)) for (const name of varsOf(node)) names.add(name);
  } else if (ts.isCaseBlock(node)) {
    for (const clause of node.clauses) lexical(clause.statements);
  } else if ((ts.isForStatement(node) || ts.isForInStatement(node) || ts.isForOfStatement(node)) && node.initializer &&
    ts.isVariableDeclarationList(node.initializer) && (node.initializer.flags & ts.NodeFlags.BlockScoped)) {
    for (const declaration of node.initializer.declarations) bindNames(declaration.name, names);
  } else if (ts.isCatchClause(node) && node.variableDeclaration) {
    bindNames(node.variableDeclaration.name, names);
  } else if ((ts.isClassExpression(node) || ts.isClassDeclaration(node)) && node.name) {
    names.add(node.name.text);
  } else if (ts.isEnumDeclaration(node)) {
    // TypeScript binds a member named by a string, `"T"` or `["T"]`, by that name, as it does one named `T`.
    for (const member of node.members) {
      if (ts.isIdentifier(member.name) || ts.isStringLiteralLike(member.name)) names.add(member.name.text);
      else if (ts.isComputedPropertyName(member.name) && ts.isStringLiteralLike(member.name.expression)) names.add(member.name.expression.text);
    }
  }
  return names;
}

/** The names code reads, anywhere in it, functions' bodies included, but where a local of the same name hides them. */
function namesRead(root) {
  const names = new Set();
  const visit = (node, hidden) => {
    if (ts.isExpressionWithTypeArguments(node)) return visit(node.expression, hidden);
    if (ts.isTypeNode(node) || ts.isTypeParameterDeclaration(node) || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node) ||
      (ts.isHeritageClause(node) && node.token === ts.SyntaxKind.ImplementsKeyword)) return;
    if (ts.isIdentifier(node)) {
      const parent = node.parent;
      const declared =
        (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
        ((ts.isPropertyAssignment(parent) || ts.isMethodDeclaration(parent) || ts.isGetAccessorDeclaration(parent) ||
          ts.isSetAccessorDeclaration(parent) || ts.isPropertyDeclaration(parent) || ts.isVariableDeclaration(parent) ||
          ts.isParameter(parent) || ts.isFunctionDeclaration(parent) || ts.isFunctionExpression(parent) ||
          ts.isClassDeclaration(parent) || ts.isClassExpression(parent) || ts.isEnumDeclaration(parent) || ts.isEnumMember(parent) ||
          ts.isModuleDeclaration(parent) || ts.isMetaProperty(parent)) && parent.name === node) ||
        (ts.isBindingElement(parent) && (parent.name === node || parent.propertyName === node)) ||
        ((ts.isLabeledStatement(parent) || ts.isBreakStatement(parent) || ts.isContinueStatement(parent)) && parent.label === node);
      if (!declared && !hidden.has(node.text)) names.add(node.text);
      return;
    }
    const scope = isScope(node) ? scopeNames(node) : null;
    const inner = scope && scope.size ? new Set([...hidden, ...scope]) : hidden;
    ts.forEachChild(node, (child) => visit(child, inner));
  };
  visit(root, new Set());
  return names;
}

/**
 * Every call or `new` in the source that carries the mark but should not: one
 * whose value is discarded, and one that may freeze a value that exists before
 * it (freezesExisting, above), with what is wrong. `contextAt(node)` gives the
 * module's context of a node.
 */
function wrongMarks(source, code, contextAt) {
  const found = [];
  const discarded = (node) => {
    for (let outer = wrapped(node); ;) {
      const parent = outer.parent;
      if (!parent) return false;
      if (ts.isExpressionStatement(parent) || ts.isVoidExpression(parent)) return true;
      if (ts.isForStatement(parent)) return parent.initializer === outer || parent.incrementor === outer;
      if (ts.isBinaryExpression(parent)) {
        if (parent.operatorToken.kind === ts.SyntaxKind.CommaToken && parent.left === outer) return true;
        if (isAssignment(parent.operatorToken.kind)) return false;
      } else if (!(ts.isPrefixUnaryExpression(parent) || ts.isTypeOfExpression(parent) || ts.isConditionalExpression(parent) ||
        ts.isArrayLiteralExpression(parent) || ts.isSpreadElement(parent) || ts.isObjectLiteralExpression(parent) ||
        ts.isPropertyAssignment(parent) || ts.isSpreadAssignment(parent) || ts.isComputedPropertyName(parent) ||
        ((ts.isMethodDeclaration(parent) || ts.isGetAccessorDeclaration(parent) || ts.isSetAccessorDeclaration(parent)) &&
          parent.name === outer && ts.isObjectLiteralExpression(parent.parent)) ||
        ts.isTemplateSpan(parent) || ts.isTemplateExpression(parent))) {
        return false;
      }
      outer = wrapped(parent);
    }
  };
  const visit = (node) => {
    if ((ts.isCallExpression(node) || ts.isNewExpression(node)) && marked(node, code, source)) {
      const context = contextAt(node);
      if (discarded(node)) found.push({ node, what: "a mark on a discarded value" });
      else if (freezesExisting(node, context)) {
        found.push({ node, what: isFreeze(node, context) ? "a mark on a freeze of a value that may exist before it"
          : "a mark on a call that may freeze a value that exists before it" });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

const INERT = new Set([
  ts.SyntaxKind.FunctionDeclaration, ts.SyntaxKind.InterfaceDeclaration, ts.SyntaxKind.TypeAliasDeclaration,
  ts.SyntaxKind.ImportDeclaration, ts.SyntaxKind.ImportEqualsDeclaration, ts.SyntaxKind.ExportDeclaration,
  ts.SyntaxKind.EmptyStatement
]);

/**
 * One module's or built file's text, read: its statements by the module each
 * belongs to (`module(position)`, the built files' modules, below), each
 * module's tables and other declarations with what their initializers do at
 * load, its other statements, its imports and exports, and its bindings: each
 * top-level name with the code that gives it its value, an initializer or a
 * function's, class's, enum's or namespace's declaration.
 */
function analyze(code, fileName, module) {
  const kind = fileName.endsWith(".ts") ? ts.ScriptKind.TS : ts.ScriptKind.JS;
  const source = ts.createSourceFile(fileName, code, ts.ScriptTarget.Latest, true, kind);
  const declared = declaredNames(source.statements);
  const byModule = new Map();
  for (const statement of source.statements) {
    const name = module(statement.getStart(source));
    if (!byModule.has(name)) byModule.set(name, []);
    byModule.get(name).push(statement);
  }
  const contexts = new Map();
  for (const [name, statements] of byModule) {
    const context = {
      aliases: freezeAliases(statements), functions: new Map(), constants: new Map(), tableFunctions: new Set(), profiles: new Map(),
      stack: [], low: Infinity, found: new Map(), declared
    };
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
    exports.push({ exported: isDefault(statement) ? "default" : name, local: name });
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
    } else if ((ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement) || ts.isEnumDeclaration(statement) ||
      ts.isModuleDeclaration(statement)) && (statement.name ? ts.isIdentifier(statement.name) : isDefault(statement))) {
      // `export default function () {}` and `export default class {}` are bound as "default".
      const bound = statement.name?.text ?? "default";
      bindings.push({ name: bound, node: statement });
      exportBinding(statement, bound);
      if (!ts.isFunctionDeclaration(statement)) statements.push({ start, module: name, statement });
    } else if (ts.isImportDeclaration(statement)) {
      const clause = statement.importClause;
      if (!clause || clause.isTypeOnly || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
      const specifier = statement.moduleSpecifier.text;
      if (clause.name) imports.set(clause.name.text, { specifier, imported: "default" });
      if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings)) imports.set(clause.namedBindings.name.text, { specifier, imported: "*" });
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
      } else if (ts.isNamespaceExport(statement.exportClause)) {
        if (specifier) exports.push({ exported: statement.exportClause.name.text, specifier, imported: "*" });
      } else {
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
  const contextAt = (node) => contexts.get(module(node.getStart(source)));
  return { code, source, line, text, contexts, contextAt, tables, others, statements, bindings, imports, exports, readsOf };
}

/**
 * Which of a read file's top-level names carry tables, and which: a table, but
 * one of a module `exempt` names, carries itself, a default export as
 * "default"; an import carries what `imported(specifier, name)` says it does,
 * a namespace's name `*`; and a name whose value's code reads a name that
 * carries tables carries those too, to a fixed point.
 */
function carriers(analysis, exempt, imported) {
  const carried = new Map();
  const into = (name) => {
    if (!carried.has(name)) carried.set(name, new Set());
    return carried.get(name);
  };
  for (const table of analysis.tables) {
    if (exempt(table.module)) continue;
    const name = table.name === null ? "default" : ts.isIdentifier(table.name) ? table.name.text : null;
    if (name) into(name).add(name);
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
        if (!carried.has(other)) continue;
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
 * a declaration that reads one; null for a statement, or for a misplaced mark
 * outside a table) and what is wrong. `exempt(module)` says whether a module
 * is left out of the rule; `carried`, which names carry tables (carriers,
 * above).
 */
function breachesIn(analysis, { exempt, carried }) {
  const { code, source, line, text, contexts, contextAt, tables, others, statements, readsOf } = analysis;
  /** The names a node reads that carry tables, each with them unless it is one: "UT1_DATA", "decode (UT1_DATA)". */
  const carriedIn = (node) => [...readsOf(node)].filter((name) => carried.has(name)).sort().map((name) => {
    const tablesOf = [...carried.get(name)].sort();
    return tablesOf.length === 1 && tablesOf[0] === name ? name : `${name} (${tablesOf.join(", ")})`;
  });
  const breaches = [];
  const held = (found, name) => {
    if (found.name && !ts.isIdentifier(found.name)) breaches.push({ line: line(found.name), name, call: "a destructuring declaration" });
    const context = contexts.get(found.module);
    for (const call of found.calls) {
      if (marked(call, code, source)) continue;
      // A mark would let a bundler drop such a call and leave the value unfrozen (wrongMarks, above).
      const what = !freezesExisting(call, context) ? "unmarked" : isFreeze(call, context)
        ? "a freeze of a value that may exist before it" : "a call that may freeze a value that exists before it";
      breaches.push({ line: line(call), name, call: `${what}: ${text(call)}` });
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
        if (runsTableMaking(part.node, context)) {
          breaches.push({ line: line(part.node), name, call: `a freeze when its module loads, outside a declaration: ${text(part.node)}` });
        }
      }
      const kept = parts.some((part) => {
        if (part.kind === "block" || part.kind === "decorator") return true;
        if (part.kind === "name") return !isPlainKey(part.node, context);
        const { calls, problems } = loadTime(part.node, context);
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
  for (const { node, what } of wrongMarks(source, code, contextAt)) {
    const table = tables.find(({ initializer }) => initializer.pos <= node.pos && node.end <= initializer.end);
    breaches.push({ line: line(node), name: table ? (table.name ? text(table.name) : "default") : null, call: `${what}: ${text(node)}` });
  }
  return breaches.sort((a, b) => a.line - b.line);
}

const NONE = new Set();

/**
 * The rule's breaches in one module's or built file's text. `module(position)`
 * names the module a statement belongs to, so that a call is matched to the
 * functions of its own module (the built files' modules, below);
 * `exempt(module)` says whether a module is left out of the rule, as
 * UNMARKED_SOURCE's are, but for its misplaced marks; and
 * `importsTable(specifier, name)` whether an import carries a table (`*` for
 * a namespace).
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
    const map = target === null ? undefined : exported.get(target);
    if (!map) return NONE;
    if (name !== "*") return map.get(name) || NONE;
    const all = new Set();
    for (const tablesOf of map.values()) for (const table of tablesOf) all.add(table);
    return all;
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
 * declarations. UNMARKED_SOURCE's modules are left out, but for their
 * misplaced marks.
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
    const target = posix.join(posix.dirname(path), specifier).replace(/\.js$/u, ".ts");
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
  for (const file of files) {
    const code = read(file);
    const starts = [...code.matchAll(/^\/\/ (src\/.*\S)[ \t]*$/gmu)].map((match) => ({ at: match.index, module: match[1] }));
    const module = (position) => {
      let found = "";
      for (const start of starts) if (start.at < position) found = start.module;
      return found;
    };
    analyses.set(file, analyze(code, file, module));
  }
  const resolveSpecifier = (path, specifier) => {
    if (!specifier.startsWith(".")) return null;
    const target = posix.join(posix.dirname(path), specifier);
    return analyses.has(target) ? target : null;
  };
  return checkFiles(analyses, (module) => UNMARKED_SOURCE.test(module), resolveSpecifier);
}

/** Throws an AssertionError listing every breach, if there are any. */
export function assertNoBreaches(breaches, where) {
  assert.deepEqual(
    breaches.map(({ file, line, name, call }) => `${file}:${line} ${name ?? "(no table)"}: ${call}`),
    [],
    `tables in ${where} that a bundler cannot leave out, or misplaced marks (scripts/pure-tables.mjs)`
  );
}

const direct = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (direct) {
  assertNoBreaches(checkSource(resolve(dirname(fileURLToPath(import.meta.url)), "..")), "src/");
  console.log("pure-tables: every table in src/ is one a bundler can leave out, and nothing it loads keeps one, but in UNMARKED_SOURCE");
}
