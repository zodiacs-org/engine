// T11 (../PREREGISTRATION.md, section 6): src/time.ts adds no module state.
// Its TypeScript syntax tree must have no top-level `let` or `var`, no
// top-level binding to a mutable array, object, Map or Set, and no
// assignment to an imported binding. TypeScript is the checkout's own
// (package-lock.json: 5.9.3).
//
// Control: `--control` scans a copy of the text with `let cache = new Map();`
// at the top, which must fail.
//
//   node state-scan.mjs --repo <engine checkout> [--control] [--out <file>]
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { finish, options } from "./load.mjs";

const opts = options();
if (!opts.repo) throw new Error("--repo is required");
const ts = createRequire(join(opts.repo, "package.json"))("typescript");
let text = readFileSync(join(opts.repo, "src/time.ts"), "utf8");
if (opts.control) text = `let cache = new Map();\n${text}`;
const source = ts.createSourceFile("src/time.ts", text, ts.ScriptTarget.Latest, true);

const imported = new Set();
for (const statement of source.statements) {
  const clause = ts.isImportDeclaration(statement) ? statement.importClause : undefined;
  if (clause?.name) imported.add(clause.name.text);
  const bindings = clause?.namedBindings;
  if (bindings && ts.isNamedImports(bindings)) for (const element of bindings.elements) imported.add(element.name.text);
  if (bindings && ts.isNamespaceImport(bindings)) imported.add(bindings.name.text);
}
const MUTABLE = /^(?:Map|Set|WeakMap|WeakSet|Array|Object)$/u;
const findings = [];
for (const statement of source.statements) {
  if (!ts.isVariableStatement(statement)) continue;
  if (!(statement.declarationList.flags & ts.NodeFlags.Const)) findings.push(`top-level let or var: ${statement.getText()}`);
  for (const { initializer } of statement.declarationList.declarations) {
    if (initializer && (ts.isArrayLiteralExpression(initializer) || ts.isObjectLiteralExpression(initializer) ||
      (ts.isNewExpression(initializer) && MUTABLE.test(initializer.expression.getText())))) {
      findings.push(`top-level binding to a mutable value: ${statement.getText()}`);
    }
  }
}
const visit = (node) => {
  let target;
  if (ts.isBinaryExpression(node) && node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && node.operatorToken.kind <= ts.SyntaxKind.LastAssignment) {
    target = node.left;
  } else if ((ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) &&
    (node.operator === ts.SyntaxKind.PlusPlusToken || node.operator === ts.SyntaxKind.MinusMinusToken)) {
    target = node.operand;
  }
  if (target && ts.isIdentifier(target) && imported.has(target.text)) findings.push(`assignment to the imported binding ${target.text}`);
  ts.forEachChild(node, visit);
};
visit(source);
const pass = findings.length === 0 && imported.size > 0;
await finish({
  check: "T11",
  tool: "state-scan.mjs",
  typescript: ts.version,
  control: Boolean(opts.control),
  controlBehaved: opts.control ? !pass : null,
  topLevelStatements: source.statements.length,
  importedBindings: [...imported].sort(),
  findings,
  node: process.version,
  pass
}, opts.out);
