// The record's reading of each marked call in src/ (not tests): where it is, what it calls, and what it freezes or makes.
//   node marks-read.mjs <engine checkout>
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { createRequire } from "node:module";
const root = process.argv[2];
const ts = createRequire(join(root, "package.json"))("typescript");
const unwrap = (node) => (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isNonNullExpression(node) ? unwrap(node.expression) : node);
// The readings of the marks whose callee or argument is not a literal, by place and callee.
const READ = {
  "src/configured-aspects.ts:239 createAspectPolicy": "copies what it is given into objects and arrays it makes (dataObject, dataArray); freezes the arrays map makes of those, an object literal for each rule, the object literals orbLimits returns, bodyOrbs, which Object.create(null) makes, and the policy; adds the policy to the module's WeakSet POLICIES; and, testing each rule's type with a regular expression, sets RegExp's legacy statics",
  "src/geo/calendar.ts:72 Object.freeze": "freezes the array the map below makes",
  "src/geo/calendar.ts:73 map": "its callback, given the strings split makes, freezes the object literal it returns and the array a map of a string's characters makes; civilDateOf, format, julianDayNumber and parseCalendarDate, of src/civil-calendar.ts, freeze nothing, and parseCalendarDate's exec sets RegExp's legacy statics",
  "src/geo/calendar.ts:73 split": "makes an array of strings",
  "src/receipt.ts:140 (in place)": "freezes the object literal it writes, which a spread fills with CONVENTIONS_RC3's properties; a freeze does not reach what the object holds",
  "src/receipt.ts:152 (in place)": "the same, with CONVENTIONS_RC7's",
  "src/receipt.ts:165 (in place)": "the same, with CONVENTIONS_RC8's",
  "src/receipt.ts:178 (in place)": "the same, with CONVENTIONS_RC15's",
  "src/signs.ts:107 Object.freeze": "freezes the array the map makes",
  "src/signs.ts:107 map": "its callback returns a string",
  "src/techniques/dignities.ts:69 terms": "freezes each row of the array literals the call writes, the arrays map makes of them, and the object Object.fromEntries makes",
  "src/techniques/dignities.ts:85 Object.freeze": "freezes the array Array.from makes",
  "src/techniques/dignities.ts:86 Array.from": "its callback returns a string",
  "src/time-scale-data.ts:13 Object.freeze": "freezes the array the map makes",
  "src/time-scale-data.ts:13 map": "called on an array literal of array literals written there, its callback freezes each of those",
  "src/timing/releasing.ts:92 Object.freeze": "freezes the array the map makes",
  "src/timing/releasing.ts:92 map": "its callback returns a number",
  "src/window.ts:111 (in place)": "returns Date.parse of a string, a number",
  "src/window.ts:112 (in place)": "the same",
  "src/window.ts:144 map": "its callback returns a number",
  "src/window.ts:156 orbEdges": "flatMap and filter make arrays of numbers",
  "src/window.ts:157 orbEdges": "the same"
};
const files = [];
const walk = (d) => { for (const n of readdirSync(d).sort()) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (n.endsWith(".ts") && !n.endsWith(".test.ts") && !n.endsWith(".d.ts")) files.push(p); } };
walk(join(root, "src"));
const lines = [];
const used = new Set();
for (const file of files) {
  const code = readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true);
  const visit = (node) => {
    if ((ts.isCallExpression(node) || ts.isNewExpression(node)) && /[#@]__PURE__/u.test(code.slice(node.getFullStart(), node.getStart(sf)))) {
      const place = `${relative(root, file)}:${sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1}`;
      const callee = unwrap(node.expression);
      const shape = ts.isNewExpression(node) ? `new ${callee.getText(sf)}`
        : ts.isArrowFunction(callee) || ts.isFunctionExpression(callee) ? "(in place)"
        : ts.isPropertyAccessExpression(callee) && ["Object", "Array"].includes(callee.expression.getText(sf)) ? callee.getText(sf)
        : ts.isPropertyAccessExpression(callee) ? callee.name.text : callee.getText(sf);
      const argument = node.arguments?.[0] && unwrap(node.arguments[0]);
      let reading = READ[`${place} ${shape}`];
      if (reading) used.add(`${place} ${shape}`);
      else if (shape === "Object.freeze" && argument && (ts.isArrayLiteralExpression(argument) || ts.isObjectLiteralExpression(argument))) reading = `freezes the ${ts.isArrayLiteralExpression(argument) ? "array" : "object"} literal written there`;
      else if (shape === "new Set" || shape === "new Map") reading = `makes a ${shape.slice(4)}${node.arguments?.length ? " of what it is given" : ""}`;
      else reading = "NOT READ";
      lines.push(`${place}  ${shape}: ${reading}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}
console.log(lines.join("\n"));
for (const key of Object.keys(READ)) if (!used.has(key)) console.log(`UNUSED READING ${key}`);
