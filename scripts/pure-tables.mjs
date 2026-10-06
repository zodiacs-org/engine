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
// Object.freeze (or a name the module binds to it), calls or constructs a
// function of the same module that makes one, or builds a Set or a Map from
// data (`new Set([...])`; an empty one is the module's state, not a table),
// itself or in a callback it runs. A function makes a table when its body
// does any of these, with the functions it declares and calls, calls or
// constructs in place, or passes to an array's iteration methods or to a
// function, of the module or its own, that calls it. A function passed to any
// other function, or in an object literal, is not taken to run; and neither
// the functions of other modules, the constructors of classes, nor the
// methods of objects are read.
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
// check, in every module, is that no marked call may freeze a value that
// exists before it, which a bundler that drops the call would leave unfrozen.
// A freeze is given only a value made where it is written: a literal, a
// function or class, what Object.create returns, a `new`, or what a method in
// FRESH_METHODS returns. The last two are taken on trust: a constructor can
// return an object that exists before it, and so can a method of one of those
// names, whatever it is called on. A function that makes a table, of the
// module or written in place, freezes no value of its module, and is given,
// where it may freeze what it is given, only values made where they are
// written throughout (freezeProfile). A callback that a marked call runs
// freezes nothing older either: the elements an iteration method gives it are
// older than the call unless what the method is called on is new throughout.
// In a table, a call that breaks this is a breach marked or not, since no
// mark mends it. Nor does a call whose value is discarded carry the mark. A
// value is discarded when, through operators, conditionals, and array and
// object literals, their keys and spreads among them, it reaches only a
// statement of its own, `void`, the left of a comma, or a `for` loop's
// initializer or update.
//
// To find what a function freezes, the check follows a name to where its
// value comes from as written: its declaration's initializer, its default,
// what its loop runs over, or, for a callback's parameter, what the iteration
// method is called on. It does not follow a value a name is given later, by
// assignment; it does not know a name a function declares for
// Object.freeze, nor a function run through `call`, `apply` or `bind`, named
// or written in place; and it takes two functions of one name, declared in
// different blocks, for one. What any other call returns is taken to be older
// than the call.
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
const WRAPPERS = new Set([
  ts.SyntaxKind.ParenthesizedExpression, ts.SyntaxKind.AsExpression, ts.SyntaxKind.SatisfiesExpression,
  ts.SyntaxKind.TypeAssertionExpression, ts.SyntaxKind.NonNullExpression
]);
const unwrap = (node) => (WRAPPERS.has(node.kind) ? unwrap(node.expression) : node);
/** The outermost wrapper around a node, or the node. */
const wrapped = (node) => (node.parent && WRAPPERS.has(node.parent.kind) ? wrapped(node.parent) : node);
const isFunction = (node) => ts.isArrowFunction(node) || ts.isFunctionExpression(node);
/** A function of any kind, whose parameters and body are its own scope. */
const isFunctionLike = (node) =>
  isFunction(node) || ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) || ts.isGetAccessorDeclaration(node) ||
  ts.isSetAccessorDeclaration(node) || ts.isConstructorDeclaration(node);
/** Code whose body runs only when it is called or constructed. */
const isDeferred = (node) => isFunctionLike(node) || ts.isClassDeclaration(node) || ts.isClassExpression(node);
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
/** The name or other expression a property read starts from: `T` for `T.list[0]`. */
const rootOf = (node) => {
  node = unwrap(node);
  return ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node) ? rootOf(node.expression) : node;
};
/**
 * Whether a value is made where it is written, so that freezing it freezes
 * nothing older: a literal, an array or object literal, a function or class,
 * a `new`, what a method in FRESH_METHODS returns, whatever it is called on,
 * or what Object.create returns.
 */
const isFresh = (node) => {
  node = unwrap(node);
  if (isLiteral(node) || ts.isArrayLiteralExpression(node) || ts.isObjectLiteralExpression(node) || isFunction(node) ||
    ts.isClassExpression(node) || ts.isNewExpression(node)) return true;
  const callee = ts.isCallExpression(node) ? unwrap(node.expression) : null;
  if (!callee || !ts.isPropertyAccessExpression(callee)) return false;
  return FRESH_METHODS.has(callee.name.text) ||
    (ts.isIdentifier(callee.expression) && callee.expression.text === "Object" && callee.name.text === "create");
};
/**
 * Whether a value and every value in it are made where they are written: a
 * literal, `undefined`, a function, or an array or object literal of such
 * values, whose keys are plain (isPlainKey) and which has no getter or
 * setter, since a getter may return what exists before it. A function that
 * makes a table may freeze what it is passed, and what that holds.
 */
const isFreshThroughout = (node, context) => {
  node = unwrap(node);
  if (isLiteral(node) || isFunction(node) || (ts.isIdentifier(node) && node.text === "undefined")) return true;
  if (ts.isArrayLiteralExpression(node)) {
    return node.elements.every((element) => ts.isOmittedExpression(element) ||
      (ts.isSpreadElement(element) ? ts.isArrayLiteralExpression(unwrap(element.expression)) && isFreshThroughout(element.expression, context)
        : isFreshThroughout(element, context)));
  }
  if (ts.isObjectLiteralExpression(node)) {
    return node.properties.every((property) =>
      (ts.isMethodDeclaration(property) || ts.isPropertyAssignment(property)) &&
      (!ts.isComputedPropertyName(property.name) || isPlainKey(property.name.expression, context)) &&
      (ts.isMethodDeclaration(property) || isFreshThroughout(property.initializer, context)));
  }
  return false;
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

/** Whether a call freezes: Object.freeze, or a name the module binds to it. */
function isFreeze(node, context) {
  if (!ts.isCallExpression(node)) return false;
  const callee = unwrap(node.expression);
  return isObjectFreeze(callee) || (ts.isIdentifier(callee) && context.aliases.has(callee.text));
}

/** Whether a call or `new` makes a table by itself: a freeze, a Set or Map of data, a call or `new` of a function of the module that makes one. */
function makesTableHere(node, context) {
  if (isDataCollection(node) || isFreeze(node, context)) return true;
  if (!ts.isCallExpression(node) && !ts.isNewExpression(node)) return false;
  const callee = unwrap(node.expression);
  return ts.isIdentifier(callee) && context.tableFunctions.has(callee.text);
}

/** The functions code declares by name anywhere in it, outside the bodies of functions it holds: declarations and consts bound to functions. */
function localFunctions(root) {
  const found = new Map();
  const visit = (node) => {
    if (ts.isFunctionDeclaration(node) && node.name && node.body) found.set(node.name.text, node.body);
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const value = unwrap(node.initializer);
      if (isFunction(value)) found.set(node.name.text, value.body);
    }
    if (isDeferred(node) && node !== root) return;
    ts.forEachChild(node, visit);
  };
  visit(root);
  return found;
}

/** Whether a local between a name and `outer`, `outer`'s own among them, hides it. */
function hidden(node, outer) {
  for (let at = node.parent; at && at !== outer; at = at.parent) if (isScope(at) && scopeNames(at).has(node.text)) return true;
  return false;
}

/**
 * Whether `test` holds for a node of the code that runs when `root` runs: its
 * own code, and the bodies of the functions it calls or constructs in place,
 * declares and calls by name, or passes to an array's iteration methods or to
 * a function, the module's or its own, that calls the parameter it is passed
 * as (callsParameter, below). A function it returns, stores, or passes to any
 * other function is not taken to run, nor are functions of other modules
 * read. `local` holds the functions the code around `root` declares; `asked`,
 * callsParameter's answers.
 */
function runs(root, context, test, local = new Map(), seen = new Set(), asked = new Map()) {
  const functions = new Map([...local, ...localFunctions(root)]);
  let found = false;
  const run = (body) => {
    if (found || seen.has(body)) return;
    seen.add(body);
    if (runs(body, context, test, functions, seen, asked)) found = true;
  };
  const visit = (node) => {
    if (found || ts.isTypeNode(node)) return;
    if (isDeferred(node) && node !== root) {
      const outer = wrapped(node);
      const parent = outer.parent;
      if (!isFunction(node) || !parent || !(ts.isCallExpression(parent) || ts.isNewExpression(parent))) return;
      const callee = unwrap(parent.expression);
      const index = (parent.arguments ?? []).indexOf(outer);
      if (parent.expression === outer ||
        (index >= 0 && ts.isPropertyAccessExpression(callee) && ITERATING.has(callee.name.text)) ||
        (index >= 0 && ts.isIdentifier(callee) && callsNamed(callee.text, index, context, functions, asked))) {
        run(node.body);
      }
      return;
    }
    if (test(node)) {
      found = true;
      return;
    }
    if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
      const callee = unwrap(node.expression);
      if (ts.isIdentifier(callee) && functions.has(callee.text)) run(functions.get(callee.text));
      if (found) return;
    }
    ts.forEachChild(node, visit);
  };
  visit(root);
  return found;
}

/**
 * Whether the function a name gives calls its parameter at `index`: a
 * function the code declares, read with the functions around it (`local`),
 * or else one of the module, read without them.
 */
function callsNamed(name, index, context, local, asked) {
  return local.has(name) ? callsParameter(local.get(name), index, context, local, asked)
    : callsParameter(context.functions.get(name), index, context, new Map(), asked);
}

/**
 * Whether the function whose body is given calls its parameter at `index`
 * when it runs: calls or constructs it, or its `call` or `apply`, or passes
 * it to an array's iteration methods or to a function that calls it in turn.
 * A parameter it gathers with `...` or destructures is not taken to be
 * called. Each answer is kept in `asked`; one asked again while it is being
 * found, as a function that calls itself asks it, is no.
 */
function callsParameter(body, index, context, local, asked) {
  const fn = body?.parent;
  const parameter = fn && isFunctionLike(fn) ? fn.parameters[index] : undefined;
  if (!parameter || parameter.dotDotDotToken || !ts.isIdentifier(parameter.name)) return false;
  if (asked.has(parameter)) return asked.get(parameter);
  asked.set(parameter, false);
  const isParameter = (node) => ts.isIdentifier(node) && node.text === parameter.name.text && !hidden(node, fn);
  const functions = new Map([...local, ...localFunctions(body)]);
  const calls = runs(body, context, (node) => {
    if (!ts.isCallExpression(node) && !ts.isNewExpression(node)) return false;
    const callee = unwrap(node.expression);
    if (isParameter(callee)) return true;
    if (ts.isPropertyAccessExpression(callee) && (callee.name.text === "call" || callee.name.text === "apply") &&
      isParameter(unwrap(callee.expression))) return true;
    const given = (node.arguments ?? []).flatMap((argument, at) => (isParameter(unwrap(argument)) ? [at] : []));
    if (!given.length) return false;
    if (ts.isPropertyAccessExpression(callee)) return ITERATING.has(callee.name.text);
    return ts.isIdentifier(callee) && given.some((at) => callsNamed(callee.text, at, context, functions, asked));
  }, local, new Set(), asked);
  asked.set(parameter, calls);
  return calls;
}

/**
 * The callbacks a call or `new` runs, each with whether what it is given is
 * made where it is written: those it passes to an array's iteration method,
 * given the elements of what the method is called on (of Array.from's first
 * argument), new when that is new throughout; and those it passes to a
 * function of the module that calls them (callsParameter), given what that
 * function chooses.
 */
function callbacksRun(node, context) {
  const callee = unwrap(node.expression);
  const args = node.arguments ?? [];
  const found = [];
  args.forEach((argument, index) => {
    const callback = unwrap(argument);
    if (!isFunction(callback)) return;
    if (ts.isPropertyAccessExpression(callee) && ITERATING.has(callee.name.text)) {
      const elements = callee.name.text === "from" ? (index > 0 ? args[0] : undefined) : callee.expression;
      found.push({ callback, fresh: Boolean(elements) && isFreshThroughout(elements, context) });
    } else if (ts.isIdentifier(callee) && callsNamed(callee.text, index, context, new Map(), new Map())) {
      found.push({ callback, fresh: false });
    }
  });
  return found;
}

/** Whether code makes a table when it runs (runs, above): a call that makes one by itself. */
const runsTableMaking = (root, context) =>
  runs(root, context, (node) => (ts.isCallExpression(node) || ts.isNewExpression(node)) && makesTableHere(node, context));

/**
 * What a function may freeze as it runs, as a freeze there, or a call or
 * `new` of a function of the module given what that function freezes, is
 * given it: `module`, a value of its module, that is, a name that nothing in
 * the function declares, a property of one, or what a call returns that may
 * not be new (isFresh); `parameters`, the indices of the parameters it may
 * freeze, or a property of one (`rest`, the index of one gathered with
 * `...`); and `defaults`, those whose default is a value of the module, which
 * a call that leaves the argument out freezes. Each branch of a conditional,
 * `??`, `||`, `&&`, a comma or an assignment is read. A name the function
 * declares is followed to where its value comes from: a default, an argument
 * of a call in place, a variable's initializer, what a `for...of` loop runs
 * over, or what an array's iteration method is called on, for the parameters
 * of the callback it is passed. A value given a name later, by assignment, is
 * not followed.
 */
function freezeProfile(fn, context) {
  const profile = {
    module: false, parameters: new Set(), defaults: new Set(), rest: fn.parameters.findIndex((parameter) => parameter.dotDotDotToken)
  };
  const sources = (scope, name) => {
    const found = [];
    const bind = (binding, from) => {
      if (ts.isIdentifier(binding)) {
        if (binding.text === name) found.push(...from.filter(Boolean));
        return;
      }
      for (const element of binding.elements) if (!ts.isOmittedExpression(element)) bind(element.name, [element.initializer, ...from]);
    };
    if (isFunctionLike(scope)) {
      const outer = wrapped(scope);
      const parent = outer.parent;
      const call = parent && (ts.isCallExpression(parent) || ts.isNewExpression(parent)) ? parent : null;
      const callee = call ? unwrap(call.expression) : null;
      const inPlace = call && call.expression === outer;
      const elements = call && !inPlace && ts.isPropertyAccessExpression(callee) && ITERATING.has(callee.name.text)
        ? (callee.name.text === "from" ? call.arguments[0] : callee.expression) : undefined;
      scope.parameters.forEach((parameter, index) => {
        bind(parameter.name, [parameter.initializer, elements, inPlace ? call.arguments?.[index] : undefined]);
      });
    } else if ((ts.isForStatement(scope) || ts.isForInStatement(scope) || ts.isForOfStatement(scope)) && scope.initializer &&
      ts.isVariableDeclarationList(scope.initializer)) {
      for (const declaration of scope.initializer.declarations) {
        bind(declaration.name, [declaration.initializer, ts.isForOfStatement(scope) ? scope.expression : undefined]);
      }
    } else {
      const visit = (node) => {
        if (node !== scope && (isDeferred(node) || ts.isModuleDeclaration(node))) return;
        if (ts.isVariableDeclaration(node)) bind(node.name, [node.initializer]);
        ts.forEachChild(node, visit);
      };
      visit(scope);
    }
    return found;
  };
  // The defaults of the elements on the way to a name in a destructured parameter, which apply whether or not the argument is given.
  const elementDefaults = (binding, name) => {
    if (ts.isIdentifier(binding)) return binding.text === name ? [] : null;
    for (const element of binding.elements) {
      if (ts.isOmittedExpression(element)) continue;
      const inner = elementDefaults(element.name, name);
      if (inner) return [element.initializer, ...inner].filter(Boolean);
    }
    return null;
  };
  const followed = new Set();
  const reach = (argument, into = profile) => {
    const node = unwrap(argument);
    if (ts.isConditionalExpression(node)) {
      reach(node.whenTrue, into);
      reach(node.whenFalse, into);
      return;
    }
    if (ts.isBinaryExpression(node)) {
      const operator = node.operatorToken.kind;
      if (operator === ts.SyntaxKind.CommaToken) return reach(node.right, into);
      if (operator === ts.SyntaxKind.QuestionQuestionToken || operator === ts.SyntaxKind.BarBarToken ||
        operator === ts.SyntaxKind.AmpersandAmpersandToken || isAssignment(operator)) {
        reach(node.left, into);
        reach(node.right, into);
        return;
      }
    }
    const root = rootOf(node);
    if (!ts.isIdentifier(root)) {
      if (ts.isCallExpression(root) && !isFresh(root)) into.module = true;
      return;
    }
    const follow = (source, target) => {
      if (followed.has(source)) return;
      followed.add(source);
      reach(source, target);
    };
    for (let at = root.parent; at && at !== fn.parent; at = at.parent) {
      if (!isScope(at) || !scopeNames(at).has(root.text)) continue;
      if (at !== fn) {
        for (const source of sources(at, root.text)) follow(source, into);
        return;
      }
      // One of the function's own parameters: frozen where the call gives it, and its default where the call leaves it out.
      const index = fn.parameters.findIndex((parameter) => elementDefaults(parameter.name, root.text) !== null);
      if (index < 0) return;
      into.parameters.add(index);
      for (const initializer of elementDefaults(fn.parameters[index].name, root.text)) follow(initializer, into);
      const initializer = fn.parameters[index].initializer;
      if (initializer && !followed.has(initializer)) {
        const left = { module: false, parameters: new Set(), defaults: new Set() };
        follow(initializer, left);
        if (left.module) into.defaults.add(index);
        for (const other of left.parameters) into.parameters.add(other);
      }
      return;
    }
    into.module = true;
  };
  runs(fn.body, context, (node) => {
    if (!ts.isCallExpression(node) && !ts.isNewExpression(node)) return false;
    if (isFreeze(node, context)) {
      if (node.arguments.length > 0) reach(node.arguments[0]);
      return false;
    }
    const callee = unwrap(node.expression);
    const inner = ts.isIdentifier(callee) && context.tableFunctions.has(callee.text) ? context.profiles.get(callee.text) : undefined;
    if (inner) {
      if (inner.module || leftOut(inner, node.arguments ?? [])) profile.module = true;
      (node.arguments ?? []).forEach((argument, index) => {
        if (freezesAt(inner, index)) reach(argument);
      });
    }
    return false;
  });
  return profile;
}

/** Whether a function with the given profile (freezeProfile, above) may freeze its argument at `index`. */
const freezesAt = (profile, index) =>
  profile.parameters.has(profile.rest >= 0 && index >= profile.rest ? profile.rest : index);
/** Whether a call leaves out, or gives `undefined` for, an argument whose default, a value of the module, the function freezes. */
const leftOut = (profile, given) => [...profile.defaults].some((index) => {
  const argument = given[index] && unwrap(given[index]);
  return !argument || (ts.isIdentifier(argument) && argument.text === "undefined") || ts.isVoidExpression(argument);
});

/**
 * The module's own functions; those that make a table; and the profile of
 * each of these (freezeProfile, above). Each by name, to a fixed point.
 */
function tableFunctions(statements, context) {
  for (const statement of statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name && statement.body) context.functions.set(statement.name.text, statement.body);
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        const value = declaration.initializer && unwrap(declaration.initializer);
        if (ts.isIdentifier(declaration.name) && value && isFunction(value)) context.functions.set(declaration.name.text, value.body);
      }
    }
  }
  for (let grew = true; grew;) {
    grew = false;
    for (const [name, body] of context.functions) {
      if (!context.tableFunctions.has(name) && runsTableMaking(body, context)) {
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
        grew = true;
      }
    }
  }
}

/**
 * Whether a call or `new` itself may freeze a value that exists before it,
 * which a bundler that drops the call leaves unfrozen: a freeze of what is not
 * made where it is written (isFresh); and a call or `new` of a function that
 * makes a table, of the module or written in place, that freezes a value of
 * the module, or is given, where it may freeze what it is given, a value not
 * made where it is written throughout (isFreshThroughout).
 */
function freezesExistingHere(node, context) {
  if (!ts.isCallExpression(node) && !ts.isNewExpression(node)) return false;
  if (isFreeze(node, context)) return node.arguments.length > 0 && !isFresh(node.arguments[0]);
  const callee = unwrap(node.expression);
  const profile = isFunction(callee) ? (runsTableMaking(callee.body, context) ? freezeProfile(callee, context) : undefined)
    : ts.isIdentifier(callee) && context.tableFunctions.has(callee.text) ? context.profiles.get(callee.text) : undefined;
  const given = node.arguments ?? [];
  return Boolean(profile) && (profile.module || leftOut(profile, given) ||
    given.some((argument, index) => freezesAt(profile, index) && !isFreshThroughout(argument, context)));
}

/**
 * Whether a call or `new` may freeze a value that exists before it: by
 * itself (freezesExistingHere, above), or in a callback it runs
 * (callbacksRun), there given what exists before the call unless it is new,
 * when the callback may still freeze its own parameters.
 */
function freezesExisting(node, context) {
  if (freezesExistingHere(node, context)) return true;
  if (!ts.isCallExpression(node) && !ts.isNewExpression(node)) return false;
  return callbacksRun(node, context).some(({ callback, fresh }) => runs(callback.body, context, (inner) => {
    if (!freezesExistingHere(inner, context)) return false;
    if (!fresh || !isFreeze(inner, context)) return true;
    const frozen = unwrap(inner.arguments[0]);
    return !(ts.isIdentifier(frozen) && !hidden(frozen, callback) &&
      callback.parameters.some((parameter) => ts.isIdentifier(parameter.name) && parameter.name.text === frozen.text));
  }));
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
      if (makesTableHere(node, context) || (isFunction(callee) && runsTableMaking(callee.body, context)) ||
        callbacksRun(node, context).some(({ callback }) => runsTableMaking(callback.body, context))) makes = true;
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
function scopeNames(node) {
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
    const parent = node.parent;
    if (ts.isModuleBlock(node) || ((isFunctionLike(parent) || ts.isClassStaticBlockDeclaration(parent)) && parent.body === node)) {
      const vars = (child) => {
        if (isDeferred(child) || ts.isModuleDeclaration(child)) return;
        if (ts.isVariableDeclarationList(child) && !(child.flags & ts.NodeFlags.BlockScoped)) {
          for (const declaration of child.declarations) bindNames(declaration.name, names);
        }
        ts.forEachChild(child, vars);
      };
      ts.forEachChild(node, vars);
    }
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
      const key = ts.isComputedPropertyName(member.name) ? member.name.expression : member.name;
      if (ts.isIdentifier(key) || ts.isStringLiteralLike(key)) names.add(key.text);
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
    const context = { aliases: freezeAliases(statements), functions: new Map(), tableFunctions: new Set(), profiles: new Map(), declared };
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
