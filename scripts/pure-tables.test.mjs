// Cases for scripts/pure-tables.mjs, the check that a bundler can leave out a
// table nothing reads. Each case is a synthetic module or built file; the last
// two read this checkout's source. The build is checked by the export smoke
// test (scripts/module-resolution-smoke.mjs), after `npm run build`.
import { mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  FRESH_METHODS, GLOBALS, ITERATING, UNMARKED_SOURCE, WELL_KNOWN_SYMBOLS, checkBuild, checkSource, tables, unmarkedTables
} from "./pure-tables.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const found = (code, options) => unmarkedTables(code, options).map(({ name, call }) => `${name ?? "(no table)"}: ${call}`);
const atLines = (code, options) => unmarkedTables(code, options).map(({ line, name, call }) => `${line} ${name ?? "(no table)"}: ${call}`);

describe("unmarkedTables", () => {
  it("accepts tables made of literals, names, functions and marked calls", () => {
    expect(found(`
const SIGNS = /*#__PURE__*/ Object.freeze([
  /*#__PURE__*/ Object.freeze({ slug: "aries", day: true } as const),
  /*#__PURE__*/ Object.freeze({ slug: "taurus", day: false } as const)
]);
const TEXT = "a|1\\nb|2";
export const SLUGS = /*#__PURE__*/ Object.freeze(/*#__PURE__*/ SIGNS.map((sign) => sign.slug)) as readonly string[];
export const ROWS = /*#__PURE__*/ Object.freeze(/*#__PURE__*/ TEXT.split("\\n").map((line) => line.split("|")));
export const KINDS = /* @__PURE__ */ Object.freeze(["x", \`y\`, -1, 2n, null, true, /a+/u, undefined, Infinity] as const) satisfies readonly unknown[];
export const KEYS = /*#__PURE__*/ Object.freeze(/*#__PURE__*/ Object.keys({ a: 1 }));
export const BY_SLUG = /*#__PURE__*/ new Map(/*#__PURE__*/ SIGNS.map((sign) => [sign.slug, sign]));
export const WRAPPED = /*#__PURE__*/ (Object.freeze({ inner: { a: 1, b: [...[2]] } }) as object);
export const ASSERTED = (/*#__PURE__*/ Object.freeze([1]))!;
export const CAST = <readonly number[]>/*#__PURE__*/ Object.freeze([1]);
export const SHORT = /*#__PURE__*/ Object.freeze({ SIGNS, TEXT });
export const CLASSES = /*#__PURE__*/ Object.freeze([class extends Error { static kind = "row"; ["literal"]() { return SIGNS; } static {} }]);
enum Kind { A }
namespace Space { export const a = 1; }
import Alias = Space.a;
export const NAMED = /*#__PURE__*/ Object.freeze([Kind, Space, Alias]);
export const SYMBOL_KEYS = /*#__PURE__*/ Object.freeze([{ [Symbol.iterator]: 1 }, class { static [Symbol.hasInstance]() { return false; } }]);
export default /*#__PURE__*/ Object.freeze({ SIGNS, ["literal key"]: 1, method() { return SIGNS; }, get size() { return 2; } });
`)).toEqual([]);
  });

  it("names each unmarked call, outer or nested, and only the outer of a callee's chain", () => {
    expect(found(`
const T = "a\\nb";
export const A = Object.freeze(["x"]);
export const B = /*#__PURE__*/ Object.freeze([Object.freeze({ k: 1 }), /*#__PURE__*/ Object.freeze({ k: 2 })]);
export const C = /*#__PURE__*/ Object.freeze(T.split("\\n").map((line) => line));
export const D = /*#__PURE__*/ Object.freeze(Array.from({ length: 2 }, (_, index) => index));
export const E = /* note */ Object.freeze([]), F = Object.freeze([1]);
export const G = /*#__PURE__*/ Object.freeze(/*#__PURE__*/ T.split(T + "x").map((line) => line));
export const H = /*#__PURE__*/ Object.freeze({ inner: Object.freeze([1, 2]) });
export const I = <readonly number[]>Object.freeze([1]);
export const J = Object.freeze([1]) /*#__PURE__*/;
export const K = Object.freeze(/*#__PURE__*/ [1]);
export const L = Object.freeze([1])!;
export const M = /*#__PURE__*/ Object.freeze([...[Object.freeze([1])]]);
export default Object.freeze([1]);
`)).toEqual([
      'A: unmarked: Object.freeze(["x"])',
      "B: unmarked: Object.freeze({ k: 1 })",
      'C: unmarked: T.split("\\n").map((line) => line)',
      "D: unmarked: Array.from({ length: 2 }, (_, index) => index)",
      "E: unmarked: Object.freeze([])",
      "F: unmarked: Object.freeze([1])",
      'G: the operator +: T + "x"',
      "H: unmarked: Object.freeze([1, 2])",
      "I: unmarked: Object.freeze([1])",
      "J: unmarked: Object.freeze([1])",
      "K: unmarked: Object.freeze(/*#__PURE__*/ [1])",
      "L: unmarked: Object.freeze([1])",
      "M: unmarked: Object.freeze([1])",
      "default: unmarked: Object.freeze([1])"
    ]);
  });

  it("names what a bundler keeps although every call is marked", () => {
    expect(found(`
const BASE = /*#__PURE__*/ Object.freeze({ a: 1 });
const LIST = /*#__PURE__*/ Object.freeze([1]);
const KEY = "k";
const COUNT = 2;
function mixin(base: object) { return class {}; }
export const SPREAD = /*#__PURE__*/ Object.freeze({ ...BASE, b: 2 });
export const SPREAD_LITERAL = /*#__PURE__*/ Object.freeze({ ...{ a: 1 } });
export const SPREAD_CALL = /*#__PURE__*/ Object.freeze({ ...Object.keys(BASE) });
export const SPREAD_LIST = /*#__PURE__*/ Object.freeze([...LIST, 2]);
export const SPREAD_ARGUMENT = /*#__PURE__*/ Object.freeze([/*#__PURE__*/ Math.max(...LIST)]);
export const SPREAD_LITERAL_ARGUMENT = /*#__PURE__*/ Object.freeze([/*#__PURE__*/ Math.max(...[1, 2])]);
export const DIVIDED = /*#__PURE__*/ Object.freeze([5 / 24]);
export const NEGATED = /*#__PURE__*/ Object.freeze([-COUNT]);
export const TYPED = /*#__PURE__*/ Object.freeze([typeof KEY]);
export const READ = /*#__PURE__*/ Object.freeze([Math.PI]);
export const INDEXED = /*#__PURE__*/ Object.freeze([LIST[0]]);
export const TEMPLATE = /*#__PURE__*/ Object.freeze([\`\${KEY}s\`]);
export const TAGGED = /*#__PURE__*/ Object.freeze([String.raw\`a\${Object.keys(BASE)}\`]);
export const CHOSEN = /*#__PURE__*/ Object.freeze([KEY ? 1 : 2]);
export const COMPUTED = /*#__PURE__*/ Object.freeze({ [KEY]: 1 });
export const COMPUTED_METHOD = /*#__PURE__*/ Object.freeze({ [KEY]() { return 1; } });
export const CLASS_KEY = /*#__PURE__*/ Object.freeze([class { [KEY]() { return 1; } }]);
export const CLASS_STATIC_KEY = /*#__PURE__*/ Object.freeze([class { static [KEY] = 1; }]);
export const CLASS_EXTENDS = /*#__PURE__*/ Object.freeze([class extends mixin(BASE) {}]);
export const STATIC_BLOCK = /*#__PURE__*/ Object.freeze([class { static { BASE.a; } }]);
export const STATIC_CALL = /*#__PURE__*/ Object.freeze([class { static all = Array.from(LIST); }]);
export const UNDECLARED = /*#__PURE__*/ Object.freeze(["x", someGlobal]);
export const SHORTHAND = /*#__PURE__*/ Object.freeze({ someOtherGlobal });
declare const ambientGlobal: string;
function tagged<V>(value: V, context: unknown) { return value; }
export const AMBIENT = /*#__PURE__*/ Object.freeze(["x", ambientGlobal]);
export const PROCESS = /*#__PURE__*/ Object.freeze([process]);
export const DECORATED = /*#__PURE__*/ Object.freeze([@tagged class {}]);
export const ODD_KEY = /*#__PURE__*/ Object.freeze({ [Symbol.notWellKnown]: 1 });
export const { x } = /*#__PURE__*/ Object.freeze({ x: 1 });
const Other = { iterator: "k" };
export const OTHER_OBJECT_KEY = /*#__PURE__*/ Object.freeze({ [Other.iterator]: 1 });
export const GLOBAL_OBJECT_KEY = /*#__PURE__*/ Object.freeze({ [Math.iterator]: 1 });
`)).toEqual([
      "SPREAD: a spread: ...BASE",
      "SPREAD_LITERAL: a spread: ...{ a: 1 }",
      "SPREAD_CALL: unmarked: Object.keys(BASE)",
      "SPREAD_CALL: a spread: ...Object.keys(BASE)",
      "SPREAD_LIST: a spread: ...LIST",
      "SPREAD_ARGUMENT: a spread: ...LIST",
      "SPREAD_LITERAL_ARGUMENT: a spread: ...[1, 2]",
      "DIVIDED: the operator /: 5 / 24",
      "NEGATED: the operator -: -COUNT",
      "TYPED: the operator typeof: typeof KEY",
      "READ: a property read: Math.PI",
      "INDEXED: a property read: LIST[0]",
      "TEMPLATE: a template with a substitution: `${KEY}s`",
      "TAGGED: unmarked: Object.keys(BASE)",
      "TAGGED: a tagged template: String.raw`a${Object.keys(BASE)}`",
      "CHOSEN: a conditional: KEY ? 1 : 2",
      "COMPUTED: a computed key: [KEY]",
      "COMPUTED_METHOD: a computed key: [KEY]",
      "CLASS_KEY: a computed key: [KEY]",
      "CLASS_STATIC_KEY: a computed key: [KEY]",
      "CLASS_EXTENDS: unmarked: mixin(BASE)",
      "STATIC_BLOCK: a static block: static { BASE.a; }",
      "STATIC_CALL: unmarked: Array.from(LIST)",
      "UNDECLARED: a name the module does not declare: someGlobal",
      "SHORTHAND: a name the module does not declare: someOtherGlobal",
      "AMBIENT: a name the module does not declare: ambientGlobal",
      "PROCESS: a name the module does not declare: process",
      "DECORATED: a decorator: @tagged",
      "ODD_KEY: a computed key: [Symbol.notWellKnown]",
      "ODD_KEY: a property read: Symbol.notWellKnown",
      "{ x }: a destructuring declaration",
      "OTHER_OBJECT_KEY: a computed key: [Other.iterator]",
      "OTHER_OBJECT_KEY: a property read: Other.iterator",
      "GLOBAL_OBJECT_KEY: a computed key: [Math.iterator]",
      "GLOBAL_OBJECT_KEY: a property read: Math.iterator"
    ]);
    // A Symbol the module declares is not the global one, nor its keys well-known symbols.
    expect(found(`
const Symbol = { iterator: "k" };
export const OWN_SYMBOL = /*#__PURE__*/ Object.freeze({ [Symbol.iterator]: 1 });
`)).toEqual(["OWN_SYMBOL: a computed key: [Symbol.iterator]", "OWN_SYMBOL: a property read: Symbol.iterator"]);
  });

  it("takes for a table what a function of the module makes, run when it loads, and a Set or Map of data", () => {
    expect(found(`
import { subscribe } from "./events.js";
function make() { return Object.freeze({ a: 1 }); }
const build = (n: number) => Object.freeze([n]);
function plain() { return [1]; }
function outer() { return inner(); }
function inner() { return Object.freeze([2]); }
function makeSet() { return new Set([1]); }
function viaCallback() { return [1].map((value) => Object.freeze([value])); }
function viaLocal() { const freezeOne = () => Object.freeze([3]); return freezeOne(); }
function viaDeclaration() { function freezeTwo() { return Object.freeze([9]); } return freezeTwo(); }
function viaBlock(flag: boolean) { if (flag) { const freezeThree = () => Object.freeze([13]); return freezeThree(); } return []; }
function viaPlace() { return (() => Object.freeze([10]))(); }
function apply(f: () => unknown) { return f(); }
function viaModule() { return apply(() => Object.freeze([12])); }
function viaSubscribe() { return subscribe(() => Object.freeze([11])); }
function handler() { return () => Object.freeze([4]); }
const { freeze } = Object;
const freezing = Object.freeze;
const wrappedFreeze = (Object.freeze);
const { keys } = Object;
export const MADE = make();
export const BUILT = build(1);
export const PLAIN = plain();
export const NESTED = outer();
export const SET_MADE = makeSet();
export const CALLBACK = viaCallback();
export const LOCAL = viaLocal();
export const DECLARED = viaDeclaration();
export const BLOCK = viaBlock(true);
export const IN_PLACE = viaPlace();
export const THROUGH_MODULE = viaModule();
export const SUBSCRIBED = viaSubscribe();
export const HANDLER = handler();
export const ALIASED = freeze([5]);
export const ALIASED_TOO = freezing([6]);
export const ALIASED_WRAPPED = wrappedFreeze([14]);
export const KEYED = keys({ a: 1 });
export const PLACED = (() => Object.freeze({ ...MADE }))();
export const PLACED_PLAIN = (() => [7])();
export const EITHER = PLAIN || Object.freeze([8]);
export const SET = new Set(["a"]);
export const MAP = new Map([["a", 1]]);
export const STATE = new Map<string, number>();
export const MARKED = /*#__PURE__*/ make();
export const MARKED_PLACED = /*#__PURE__*/ (() => Object.freeze({ ...MADE }))();
export const LIB = Math.freeze([1]);
const handlers: (() => unknown)[] = [];
function register(handler: () => unknown) { handlers.push(handler); return handlers.length; }
function viaRegister() { return register(() => Object.freeze([15])); }
function invokeCall(f: () => unknown) { return f.call(null); }
function viaCall() { return invokeCall(() => Object.freeze([16])); }
function passOn(f: () => unknown) { return apply(f); }
function viaPassOn() { return passOn(() => Object.freeze([17])); }
function iterate(f: (value: number) => unknown) { return [1].map(f); }
function viaIterate() { return iterate((value) => Object.freeze([value])); }
function rest(...fs: (() => unknown)[]) { return fs.map((f) => f()); }
function viaRest() { return rest(() => Object.freeze([18])); }
function viaNew() { return new (function () { Object.freeze([19]); })(); }
function viaRecursion() {
  function ping(n: number): unknown { return n > 0 ? pong(n - 1) : Object.freeze([20]); }
  function pong(n: number): unknown { return ping(n); }
  return ping(2);
}
function viaOuterLocal() { const freezeIt = () => Object.freeze([21]); return [1].map(() => freezeIt()); }
function describe(f: () => unknown) { return f.toString(); }
function viaDescribe() { return describe(() => Object.freeze([22])); }
function shadow(f: () => unknown) { return [() => 1].map((f) => f()); }
function viaShadow() { return shadow(() => Object.freeze([23])); }
export const OUTER_LOCAL = viaOuterLocal();
export const DESCRIBED = viaDescribe();
export const SHADOWED_CALL = viaShadow();
export const REGISTERED = viaRegister();
export const CALLED = viaCall();
export const PASSED_ON = viaPassOn();
export const ITERATED = viaIterate();
export const RESTED = viaRest();
export const CONSTRUCTED = viaNew();
export const RECURSIVE = viaRecursion();
function construct(F: new () => unknown) { return new F(); }
function viaConstruct() { return construct(function () { Object.freeze([24]); } as unknown as new () => unknown); }
function second(first: number, f: () => unknown) { return first ? f() : 0; }
function viaSecond() { return second(1, () => Object.freeze([25])); }
function viaLocalPassOn() { const run = (f: () => unknown) => f(); return run(() => Object.freeze([26])); }
function viaWrapped() { return apply((() => Object.freeze([27])) as () => unknown); }
function viaWrappedMap() { return [1].map(((value: number) => Object.freeze([value])) as (value: number) => unknown); }
function viaLocalNew() { function Make() { Object.freeze([28]); } return new (Make as unknown as new () => object)(); }
export const CONSTRUCTED_PARAMETER = viaConstruct();
export const SECOND_PARAMETER = viaSecond();
export const LOCAL_PASSED_ON = viaLocalPassOn();
export const WRAPPED = viaWrapped();
export const WRAPPED_MAP = viaWrappedMap();
export const LOCAL_NEW = viaLocalNew();
function made() { return Object.freeze([29]); }
export const NEW_AT_LOAD = new made();
export const MAPPED_AT_LOAD = [1, 2].map((value) => Object.freeze({ value }));
export const BUILT_AT_LOAD = buildWith(() => Object.freeze([30]));
export const SETS_AT_LOAD = [["a"]].map((list) => new Set(list));
function buildWith(make: () => unknown) { return make(); }
function recur(f: () => unknown, n: number): unknown { return n ? recur(f, n - 1) : f(); }
function relay(f: () => unknown, n: number): unknown { return n ? relay(f, n - 1) : 0; }
function viaRecur() { return recur(() => Object.freeze([31]), 2); }
function viaRelay() { return relay(() => Object.freeze([32]), 2); }
export const RECURRED = viaRecur();
export const RELAYED = viaRelay();
`)).toEqual([
      "MADE: unmarked: make()",
      "BUILT: unmarked: build(1)",
      "NESTED: unmarked: outer()",
      "SET_MADE: unmarked: makeSet()",
      "CALLBACK: unmarked: viaCallback()",
      "LOCAL: unmarked: viaLocal()",
      "DECLARED: unmarked: viaDeclaration()",
      "BLOCK: unmarked: viaBlock(true)",
      "IN_PLACE: unmarked: viaPlace()",
      "THROUGH_MODULE: unmarked: viaModule()",
      "ALIASED: unmarked: freeze([5])",
      "ALIASED_TOO: unmarked: freezing([6])",
      "ALIASED_WRAPPED: unmarked: wrappedFreeze([14])",
      "PLACED: unmarked: (() => Object.freeze({ ...MADE }))()",
      "EITHER: unmarked: Object.freeze([8])",
      "EITHER: the operator ||: PLAIN || Object.freeze([8])",
      'SET: unmarked: new Set(["a"])',
      'MAP: unmarked: new Map([["a", 1]])',
      "OUTER_LOCAL: unmarked: viaOuterLocal()",
      "CALLED: unmarked: viaCall()",
      "PASSED_ON: unmarked: viaPassOn()",
      "ITERATED: unmarked: viaIterate()",
      "CONSTRUCTED: unmarked: viaNew()",
      "RECURSIVE: unmarked: viaRecursion()",
      "CONSTRUCTED_PARAMETER: unmarked: viaConstruct()",
      "SECOND_PARAMETER: unmarked: viaSecond()",
      "LOCAL_PASSED_ON: unmarked: viaLocalPassOn()",
      "WRAPPED: unmarked: viaWrapped()",
      "WRAPPED_MAP: unmarked: viaWrappedMap()",
      "LOCAL_NEW: unmarked: viaLocalNew()",
      "NEW_AT_LOAD: unmarked: new made()",
      "MAPPED_AT_LOAD: unmarked: [1, 2].map((value) => Object.freeze({ value }))",
      "BUILT_AT_LOAD: unmarked: buildWith(() => Object.freeze([30]))",
      'SETS_AT_LOAD: unmarked: [["a"]].map((list) => new Set(list))',
      "RECURRED: unmarked: viaRecur()"
    ]);
  });

  it("holds a call of a function of the module that makes a table to a freeze's rule: it freezes only values made where they are written", () => {
    expect(found(`
const STATE = { a: 1 };
const RAW = { signs: ["aries"] };
function deepFreeze<V extends object>(value: V): V {
  for (const inner of Object.values(value)) if (typeof inner === "object" && inner !== null) deepFreeze(inner);
  return Object.freeze(value);
}
function lockState() { return Object.freeze(STATE); }
function lockEither(flag: boolean) { return Object.freeze(flag ? STATE : {}); }
function lockAgain(value: object) { return Object.freeze(value); }
function lockVia() { return lockAgain(STATE); }
// Object.assign returns its first argument, here a new object; the rule takes any call but those of FRESH_METHODS for one that may not be.
function lockAssigned() { return Object.freeze(Object.assign({}, STATE)); }
function lockMapped() { return Object.freeze(RAW.signs.map((sign) => sign)); }
function lockDefault(value?: object) { return Object.freeze(value ?? STATE); }
// lockOuter makes a table by itself, before lockInner is found to freeze STATE.
function lockOuter() { Object.freeze([1]); return lockInner(); }
function lockInner() { return Object.freeze(STATE); }
const KEY = "k";
export const DEEP = /*#__PURE__*/ deepFreeze({ list: [1, "a", null, undefined, ...[2]], method() { return 1; }, handler: () => 1 });
export const DEEP_KEYED = /*#__PURE__*/ deepFreeze({ [KEY]: 1 });
export const DEEP_RAW = /*#__PURE__*/ deepFreeze(RAW);
export const DEEP_NAMED = /*#__PURE__*/ deepFreeze({ list: [RAW] });
export const DEEP_SPREAD = /*#__PURE__*/ deepFreeze([...RAW.signs]);
export const UNMARKED_RAW = deepFreeze(RAW);
export const LOCKED = /*#__PURE__*/ lockState();
export const EITHER = /*#__PURE__*/ lockEither(true);
export const VIA = /*#__PURE__*/ lockVia();
export const ASSIGNED = /*#__PURE__*/ lockAssigned();
export const MAPPED = /*#__PURE__*/ lockMapped();
export const DEFAULTED = /*#__PURE__*/ lockDefault();
export const OUTER = /*#__PURE__*/ lockOuter();
export const FROZEN_MAP = /*#__PURE__*/ Object.freeze(/*#__PURE__*/ RAW.signs.map((sign) => sign));
export const FROZEN_ASSIGN = /*#__PURE__*/ Object.freeze(Object.assign(RAW, { b: 2 }));
export default /*#__PURE__*/ lockState();
`)).toEqual([
      // A computed key is no value a freeze reaches; the table keeps it all the same.
      "DEEP_KEYED: a computed key: [KEY]",
      "DEEP_RAW: a mark on a call that may freeze a value that exists before it: deepFreeze(RAW)",
      "DEEP_NAMED: a mark on a call that may freeze a value that exists before it: deepFreeze({ list: [RAW] })",
      "DEEP_SPREAD: a spread: ...RAW.signs",
      "DEEP_SPREAD: a property read: RAW.signs",
      "DEEP_SPREAD: a mark on a call that may freeze a value that exists before it: deepFreeze([...RAW.signs])",
      "UNMARKED_RAW: a call that may freeze a value that exists before it: deepFreeze(RAW)",
      "LOCKED: a mark on a call that may freeze a value that exists before it: lockState()",
      "EITHER: a mark on a call that may freeze a value that exists before it: lockEither(true)",
      "VIA: a mark on a call that may freeze a value that exists before it: lockVia()",
      "ASSIGNED: a mark on a call that may freeze a value that exists before it: lockAssigned()",
      "DEFAULTED: a mark on a call that may freeze a value that exists before it: lockDefault()",
      "OUTER: a mark on a call that may freeze a value that exists before it: lockOuter()",
      "FROZEN_ASSIGN: unmarked: Object.assign(RAW, { b: 2 })",
      "FROZEN_ASSIGN: a mark on a freeze of a value that may exist before it: Object.freeze(Object.assign(RAW, { b: 2 }))",
      "default: a mark on a call that may freeze a value that exists before it: lockState()"
    ]);
  });

  it("follows what a call freezes into functions in place, defaults, callbacks and the names a function declares", () => {
    expect(atLines(`
const STATE = { a: 1 };
const ROWS = [{ r: 1 }];
function lock(value: object = STATE) { return Object.freeze(value); }
function each(f: () => unknown) { return f(); }
function lockRows() { each(() => 0); return each(() => Object.freeze(ROWS)); }
function helper(g: () => unknown) { return g(); }
function applyIt(f: () => unknown) { return helper(f); }
function withLocalHelper() { const helper = (x: unknown) => x; void helper; return applyIt(() => Object.freeze(ROWS)); }
function lockAlias() { const alias = STATE; return Object.freeze(alias); }
function lockLoop() { for (const row of ROWS) Object.freeze(row); return 1; }
function lockEach() { ROWS.forEach((row) => Object.freeze(row)); return 1; }
function lockAssigned() { let held: object; return Object.freeze(held = STATE); }
function lockAnd(flag: boolean) { return Object.freeze(flag && STATE); }
function lockComma() { return Object.freeze((0, STATE)); }
function lockOr(value?: object) { return Object.freeze(value || STATE); }
function lockNullish() { return Object.freeze(STATE ?? {}); }
function lockRow() { return Object.freeze(ROWS[0]); }
function lockElement({ inner = STATE }: { inner?: object } = {}) { return Object.freeze(inner); }
function shape(value: { a: number }) { return Object.freeze({ a: value.a }); }
function lockAll(...rows: object[]) { return rows.map((row) => Object.freeze(row)); }
function lockCalled(make: () => object) { return Object.freeze(make()); }
export const IN_PLACE = /*#__PURE__*/ (() => Object.freeze(STATE))();
export const IN_PLACE_GIVEN = /*#__PURE__*/ ((value: object) => Object.freeze(value))(STATE);
export const IN_PLACE_NEW = /*#__PURE__*/ ((value: object) => Object.freeze(value))({ a: 1 });
export const DEFAULTED = /*#__PURE__*/ lock();
export const DEFAULT_GIVEN = /*#__PURE__*/ lock({ a: 1 });
export const DEFAULT_UNDEFINED = /*#__PURE__*/ lock(undefined);
export const CONSTRUCTED = /*#__PURE__*/ new lock(STATE);
export const MAPPED = /*#__PURE__*/ Object.freeze(/*#__PURE__*/ ROWS.map((row) => Object.freeze(row)));
export const LITERAL_ROWS = /*#__PURE__*/ Object.freeze(/*#__PURE__*/ [[1], [2]].map((row) => Object.freeze(row)));
export const FROM_ROWS = /*#__PURE__*/ Object.freeze(/*#__PURE__*/ Array.from(ROWS, (row) => Object.freeze(row)));
export const SECOND = /*#__PURE__*/ lockRows();
export const LOCAL_HELPER = /*#__PURE__*/ withLocalHelper();
export const ALIAS = /*#__PURE__*/ lockAlias();
export const LOOP = /*#__PURE__*/ lockLoop();
export const EACH = /*#__PURE__*/ lockEach();
export const ASSIGNED = /*#__PURE__*/ lockAssigned();
export const AND = /*#__PURE__*/ lockAnd(true);
export const COMMA = /*#__PURE__*/ lockComma();
export const OR = /*#__PURE__*/ lockOr();
export const NULLISH = /*#__PURE__*/ lockNullish();
export const ROW = /*#__PURE__*/ lockRow();
export const ELEMENT = /*#__PURE__*/ lockElement({});
export const SHAPED = /*#__PURE__*/ shape(STATE);
export const ALL = /*#__PURE__*/ lockAll({ a: 1 }, [2]);
export const ALL_STATE = /*#__PURE__*/ lockAll({ a: 1 }, STATE);
export const CALLED = /*#__PURE__*/ lockCalled(() => ({ a: 1 }));
export const GETTER = /*#__PURE__*/ lock({ get a() { return STATE; } });
export const SHORTHAND = /*#__PURE__*/ lock({ STATE });
export const SPREAD = /*#__PURE__*/ lock({ ...STATE });
export const HOLES = /*#__PURE__*/ lock([1, , 2]);
export const SYMBOL_KEY = /*#__PURE__*/ lock({ [Symbol.iterator]: 1 });
export const OTHER_KEY = /*#__PURE__*/ lock({ [STATE.a]: 1 });
const Pool = { item: { a: 1 }, create() { return this.item; } };
function eachRow(rows: object[], f: (row: object) => unknown) { return rows.map(f); }
function lockDefaultVia() { return lock(); }
function lockInPlace() { return ((value: object) => Object.freeze(value))(STATE); }
function second(first: unknown, f: () => unknown) { return f(); }
function relayTwice(f: () => unknown) { return second(f, f); }
function relayWrapped(f: () => unknown) { return each((f)); }
function lockTwice() { return relayTwice(() => Object.freeze(ROWS)); }
function lockWrapped() { return relayWrapped(() => Object.freeze(ROWS)); }
export const POOLED = /*#__PURE__*/ Object.freeze(/*#__PURE__*/ Pool.create());
export const CREATED = /*#__PURE__*/ Object.freeze(/*#__PURE__*/ Object.create(null));
export const LITERAL_FROM = /*#__PURE__*/ Object.freeze(/*#__PURE__*/ Array.from([[1], [2]], (row) => Object.freeze(row)));
export const VIA_EACH = /*#__PURE__*/ eachRow(ROWS, (row) => Object.freeze(row));
export const VIA_DEFAULT = /*#__PURE__*/ lockDefaultVia();
export const IN_PLACE_INSIDE = /*#__PURE__*/ lockInPlace();
export const TWICE = /*#__PURE__*/ lockTwice();
export const WRAPPED = /*#__PURE__*/ lockWrapped();
`)).toEqual([
      "23 IN_PLACE: a mark on a call that may freeze a value that exists before it: (() => Object.freeze(STATE))()",
      "24 IN_PLACE_GIVEN: a mark on a call that may freeze a value that exists before it: ((value: object) => Object.freeze(value))(STATE)",
      "26 DEFAULTED: a mark on a call that may freeze a value that exists before it: lock()",
      "28 DEFAULT_UNDEFINED: a mark on a call that may freeze a value that exists before it: lock(undefined)",
      "29 CONSTRUCTED: a mark on a call that may freeze a value that exists before it: new lock(STATE)",
      "30 MAPPED: a mark on a call that may freeze a value that exists before it: ROWS.map((row) => Object.freeze(row))",
      "32 FROM_ROWS: a mark on a call that may freeze a value that exists before it: Array.from(ROWS, (row) => Object.freeze(row))",
      "33 SECOND: a mark on a call that may freeze a value that exists before it: lockRows()",
      "34 LOCAL_HELPER: a mark on a call that may freeze a value that exists before it: withLocalHelper()",
      "35 ALIAS: a mark on a call that may freeze a value that exists before it: lockAlias()",
      "36 LOOP: a mark on a call that may freeze a value that exists before it: lockLoop()",
      "37 EACH: a mark on a call that may freeze a value that exists before it: lockEach()",
      "38 ASSIGNED: a mark on a call that may freeze a value that exists before it: lockAssigned()",
      "39 AND: a mark on a call that may freeze a value that exists before it: lockAnd(true)",
      "40 COMMA: a mark on a call that may freeze a value that exists before it: lockComma()",
      "41 OR: a mark on a call that may freeze a value that exists before it: lockOr()",
      "42 NULLISH: a mark on a call that may freeze a value that exists before it: lockNullish()",
      "43 ROW: a mark on a call that may freeze a value that exists before it: lockRow()",
      "44 ELEMENT: a mark on a call that may freeze a value that exists before it: lockElement({})",
      "47 ALL_STATE: a mark on a call that may freeze a value that exists before it: lockAll({ a: 1 }, STATE)",
      // What a call returns is not known to be new, a callback's among them.
      "48 CALLED: a mark on a call that may freeze a value that exists before it: lockCalled(() => ({ a: 1 }))",
      "49 GETTER: a mark on a call that may freeze a value that exists before it: lock({ get a() { return STATE; } })",
      "50 SHORTHAND: a mark on a call that may freeze a value that exists before it: lock({ STATE })",
      "51 SPREAD: a spread: ...STATE",
      "51 SPREAD: a mark on a call that may freeze a value that exists before it: lock({ ...STATE })",
      "54 OTHER_KEY: a computed key: [STATE.a]",
      "54 OTHER_KEY: a property read: STATE.a",
      // A method named create is no Object.create, nor known to return what is new.
      "64 POOLED: a mark on a freeze of a value that may exist before it: Object.freeze(/*#__PURE__*/ Pool.create())",
      "67 VIA_EACH: a mark on a call that may freeze a value that exists before it: eachRow(ROWS, (row) => Object.freeze(row))",
      "68 VIA_DEFAULT: a mark on a call that may freeze a value that exists before it: lockDefaultVia()",
      "69 IN_PLACE_INSIDE: a mark on a call that may freeze a value that exists before it: lockInPlace()",
      "70 TWICE: a mark on a call that may freeze a value that exists before it: lockTwice()",
      "71 WRAPPED: a mark on a call that may freeze a value that exists before it: lockWrapped()"
    ]);
  });

  it("takes what a freeze may reach for a value that exists before the call unless it is made where it is written", () => {
    // The marks the list leaves out freeze only what is made where it is written: LOCAL_FRESH, CONST_OF_NEW,
    // LITERAL_BY_NAME, PASSED_ROWS, THIS_DEFAULT_GIVEN, KEYS, LET_NEW, SHORTHAND_NEW, SPREAD_NEW, COPIES, FROZEN_LITERALS,
    // SORTED, INDEXED, KEYS_GIVEN and SPLIT_GIVEN. LET_ASSIGNED's is left as it is because a function reached through a
    // `let` that is assigned is not read. GENERATED's generator does not run here, but a generator's body is taken to run
    // where it is called, since what calls it may run it.
    expect(atLines(`
const STATE = { a: 1 };
const ROWS = [{ r: 1 }];
const TABLES = { one: { t: 1 } };
function lockRow(row: object) { return Object.freeze(row); }
function lockAny(value: object) { return Object.freeze(value); }
function lockState() { return Object.freeze(STATE); }
function each(f: (value: object) => unknown) { return f(STATE); }
function call(f: () => unknown) { return f(); }
function viaValues() { for (const value of Object.values(STATE)) Object.freeze(value); return 1; }
function viaEntries() { for (const [, value] of Object.entries(TABLES)) Object.freeze(value); return 1; }
function viaCopy() { ROWS.slice().forEach((row) => Object.freeze(row)); return 1; }
function viaSpreadCopy() { for (const row of [...ROWS]) Object.freeze(row); return 1; }
function viaIterator() { return Array.from(ROWS.values(), (row) => Object.freeze(row)); }
function viaElement() { return Object.freeze([STATE][0]); }
function viaCopiedElement() { return Object.freeze(ROWS.slice()[0]); }
function viaProperty() { const held = { held: STATE }.held; return Object.freeze(held); }
function viaDestructuredDefault({ inner }: { inner: object } = { inner: STATE }) { return Object.freeze(inner); }
function viaArrayDefault([first]: object[] = [STATE]) { return Object.freeze(first); }
function viaDestructuredLocal() { const { inner } = { inner: STATE }; return Object.freeze(inner); }
function viaLocalFunction() { const freezeIt = (value: object) => Object.freeze(value); return freezeIt(STATE); }
function viaLocalFresh() { const freezeIt = (value: object) => Object.freeze(value); return freezeIt({ a: 1 }); }
function viaGivenCallback() { return each((value) => Object.freeze(value)); }
function viaCatch() { try { throw STATE; } catch (error) { return Object.freeze(error as object); } }
function viaVarLoop() { for (var row of ROWS) Object.freeze(row); return 1; }
function viaReassigned(value: object) { value = STATE; return Object.freeze(value); }
function viaLet() { let held = {}; held = STATE; return Object.freeze(held); }
function viaConstOfNew() { const rows = [[1], [2]].map((row) => row); return Object.freeze(rows); }
function viaNamedCallback() { return ROWS.map(lockRow); }
function viaLocalCallback() { const lockOne = (row: object) => Object.freeze(row); return ROWS.map(lockOne); }
function viaOwnFreeze() { const { freeze } = Object; return freeze(STATE); }
function viaBlocks() { { const f = () => Object.freeze(ROWS); f(); } { const f = () => 0; return f(); } }
const lockAlias = lockAny;
function lockThis(this: void, value: object) { return Object.freeze(value); }
function callThis(this: void, f: () => unknown) { return f(); }
function lockThisDefault(this: void, value: object = STATE) { return Object.freeze(value); }
function A(f: () => unknown, n: number): unknown { if (n > 0) B(f, n - 1); return f(); }
function B(g: () => unknown, n: number): unknown { return A(g, n); }
function viaMemo() { A(() => 0, 1); return B(() => Object.freeze(ROWS), 0); }
function* generate() { yield Object.freeze(STATE); }
function localMarks() { const lockIt = () => Object.freeze(STATE); const kept = /*#__PURE__*/ lockIt(); return kept; }
function viaKeyAssigned() { for (let key in TABLES) { key = STATE as never; Object.freeze(key); } return 1; }
function viaKeys() { for (const key in TABLES) Object.freeze(key); return 1; }
function viaCounted() { let held: any = {}; held++; return Object.freeze(held); }
function viaLetFreeze() { let freeze = Object.freeze; return freeze(STATE); }
function viaConstFreeze() { const freeze = Object.freeze; return freeze(STATE); }
function viaArrayAssigned() { let held: object = {}; [held] = [STATE]; return Object.freeze(held); }
function viaObjectAssigned() { let held: object = {}; ({ held } = { held: STATE }); return Object.freeze(held); }
function viaLoopTarget() { let held: object = {}; for (held of ROWS) void 0; return Object.freeze(held); }
function viaLetNew() { let held = { a: 1 }; return Object.freeze(held); }
function viaClosure() { const shared = {}; const lockShared = () => Object.freeze(shared); return lockShared(); }
function viaSpreadInPlace() { return ((first: object, second: object) => Object.freeze(second))(...([{}, STATE] as [object, object])); }
function viaAssignedProperty() { const box: { v: object } = { v: {} }; return Object.freeze(box.v = STATE); }
function viaShorthandNew() { const inner = { a: 1 }; return lockAny({ inner }); }
function viaSpreadNew() { const base = { a: 1 }; return lockAny({ ...base }); }
function viaInnerDefault() { return [undefined].map((row: object = STATE) => Object.freeze(row)); }
function lockTag(strings: TemplateStringsArray, value: object) { return Object.freeze(value); }
function viaTag() { return lockTag\`\${STATE}\`; }
function viaThisFreeze(this: unknown) { return Object.freeze(this as object); }
function viaRestInPlace() { return ((...rest: object[]) => Object.freeze(rest))({ a: 1 }); }
function lockSecond(first: object, second: object) { return Object.freeze(second); }
function viaCopies() { [[1]].slice().forEach((row) => Object.freeze(row)); return 1; }
function viaLetFreezeAssigned() { let freeze = Object.freeze; freeze = (value: object) => value; return freeze(STATE); }
function viaLetAssigned() { let lock = lockAny; lock = (value: object) => value; return lock(STATE); }
function lockSelf() { return Object.freeze(lockSelf); }
function lockDeep(value: object, n: number): object { return n ? lockDeep(STATE, n - 1) : Object.freeze(value); }
function outerLate() { Object.freeze([0]); const inner = () => late(STATE); return inner(); }
function late(value: object) { return lockLate(value); }
function lockLate(value: object) { return Object.freeze(value); }
export const VALUES = /*#__PURE__*/ viaValues();
export const ENTRIES = /*#__PURE__*/ viaEntries();
export const COPY = /*#__PURE__*/ viaCopy();
export const SPREAD_COPY = /*#__PURE__*/ viaSpreadCopy();
export const ITERATOR = /*#__PURE__*/ viaIterator();
export const ELEMENT = /*#__PURE__*/ viaElement();
export const COPIED_ELEMENT = /*#__PURE__*/ viaCopiedElement();
export const PROPERTY = /*#__PURE__*/ viaProperty();
export const DESTRUCTURED_DEFAULT = /*#__PURE__*/ viaDestructuredDefault();
export const ARRAY_DEFAULT = /*#__PURE__*/ viaArrayDefault();
export const DESTRUCTURED_LOCAL = /*#__PURE__*/ viaDestructuredLocal();
export const LOCAL_FUNCTION = /*#__PURE__*/ viaLocalFunction();
export const LOCAL_FRESH = /*#__PURE__*/ viaLocalFresh();
export const GIVEN_CALLBACK = /*#__PURE__*/ viaGivenCallback();
export const CAUGHT = /*#__PURE__*/ viaCatch();
export const VAR_LOOP = /*#__PURE__*/ viaVarLoop();
export const REASSIGNED = /*#__PURE__*/ viaReassigned({});
export const LET = /*#__PURE__*/ viaLet();
export const CONST_OF_NEW = /*#__PURE__*/ viaConstOfNew();
export const NAMED_CALLBACK = /*#__PURE__*/ viaNamedCallback();
export const LOCAL_CALLBACK = /*#__PURE__*/ viaLocalCallback();
export const OWN_FREEZE = /*#__PURE__*/ viaOwnFreeze();
export const BLOCKS = /*#__PURE__*/ viaBlocks();
export const MAPPED_BY_NAME = /*#__PURE__*/ Object.freeze(/*#__PURE__*/ ROWS.map(lockRow));
export const LITERAL_BY_NAME = /*#__PURE__*/ Object.freeze(/*#__PURE__*/ [{ a: 1 }].map(lockRow));
export const PASSED_ROWS = /*#__PURE__*/ Object.freeze(/*#__PURE__*/ [{ a: 1 }, { a: 2 }].map((row) => lockRow(row)));
export const CALLED_BY_NAME = /*#__PURE__*/ call(lockState);
export const REDUCED = /*#__PURE__*/ [{}].reduce((sum) => Object.freeze(sum), STATE);
export const DEFAULTED_ROW = /*#__PURE__*/ [undefined].map((row = STATE) => Object.freeze(row));
export const FROM_HOLE = /*#__PURE__*/ Array.from([,], (row = STATE) => Object.freeze(row));
export const COMMA = /*#__PURE__*/ (0, lockAny)(STATE);
export const COMMA_IN_PLACE = /*#__PURE__*/ (0, () => Object.freeze(STATE))();
export const ALIASED = /*#__PURE__*/ lockAlias(STATE);
export const THIS_PARAMETER = /*#__PURE__*/ lockThis(STATE);
export const THIS_NEW = /*#__PURE__*/ new (lockThis as any)(STATE);
export const THIS_CALLBACK = /*#__PURE__*/ callThis(() => Object.freeze(ROWS));
export const THIS_DEFAULT = /*#__PURE__*/ lockThisDefault();
export const THIS_DEFAULT_GIVEN = /*#__PURE__*/ lockThisDefault({ a: 1 });
export const MEMO = /*#__PURE__*/ viaMemo();
export const GENERATED = /*#__PURE__*/ generate();
export const LOCAL_MARKS = localMarks();
export const KEY_ASSIGNED = /*#__PURE__*/ viaKeyAssigned();
export const KEYS = /*#__PURE__*/ viaKeys();
export const COUNTED = /*#__PURE__*/ viaCounted();
export const LET_FREEZE = /*#__PURE__*/ viaLetFreeze();
export const CONST_FREEZE = /*#__PURE__*/ viaConstFreeze();
export const ARRAY_ASSIGNED = /*#__PURE__*/ viaArrayAssigned();
export const OBJECT_ASSIGNED = /*#__PURE__*/ viaObjectAssigned();
export const LOOP_TARGET = /*#__PURE__*/ viaLoopTarget();
export const LET_NEW = /*#__PURE__*/ viaLetNew();
export const CLOSURE = /*#__PURE__*/ viaClosure();
export const SPREAD_IN_PLACE = /*#__PURE__*/ viaSpreadInPlace();
export const ASSIGNED_PROPERTY = /*#__PURE__*/ viaAssignedProperty();
export const SHORTHAND_NEW = /*#__PURE__*/ viaShorthandNew();
export const SPREAD_NEW = /*#__PURE__*/ viaSpreadNew();
export const INNER_DEFAULT = /*#__PURE__*/ viaInnerDefault();
export const TAGGED = /*#__PURE__*/ viaTag();
export const THIS_FROZEN = /*#__PURE__*/ viaThisFreeze();
export const REST_IN_PLACE = /*#__PURE__*/ viaRestInPlace();
export const SPREAD_ARGUMENTS = /*#__PURE__*/ lockSecond(...([{}, STATE] as [object, object]));
export const NEW_GIVEN = /*#__PURE__*/ lockAny(new Map());
export const COPIES = /*#__PURE__*/ viaCopies();
export const FROZEN_ROWS = /*#__PURE__*/ ROWS.map(Object.freeze);
export const FROZEN_LITERALS = /*#__PURE__*/ [{ a: 1 }].map(Object.freeze);
export const SORTED = /*#__PURE__*/ [{ a: 1 }, { a: 2 }].sort((first, second) => (Object.freeze(second), 0));
export const INDEXED = /*#__PURE__*/ ROWS.map((row, index) => Object.freeze(index));
export const KEYS_GIVEN = /*#__PURE__*/ lockAny(Object.keys(STATE));
export const SPLIT_GIVEN = /*#__PURE__*/ lockAny("a|b".split("|"));
export const MAPPED_GIVEN = /*#__PURE__*/ lockAny([{ a: 1 }].map(() => STATE));
export const FROM_MAPPED = /*#__PURE__*/ lockAny(Array.from([{ a: 1 }], () => STATE));
export const LET_FREEZE_ASSIGNED = /*#__PURE__*/ viaLetFreezeAssigned();
export const LET_ASSIGNED = /*#__PURE__*/ viaLetAssigned();
export const SELF = /*#__PURE__*/ lockSelf();
export const DEEP_RECURSION = /*#__PURE__*/ lockDeep({}, 1);
export const LATE = /*#__PURE__*/ outerLate();
`)).toEqual([
      // A mark inside a function, of a function it declares.
      "41 (no table): a mark on a call that may freeze a value that exists before it: lockIt()",
      "70 VALUES: a mark on a call that may freeze a value that exists before it: viaValues()",
      "71 ENTRIES: a mark on a call that may freeze a value that exists before it: viaEntries()",
      "72 COPY: a mark on a call that may freeze a value that exists before it: viaCopy()",
      "73 SPREAD_COPY: a mark on a call that may freeze a value that exists before it: viaSpreadCopy()",
      "74 ITERATOR: a mark on a call that may freeze a value that exists before it: viaIterator()",
      "75 ELEMENT: a mark on a call that may freeze a value that exists before it: viaElement()",
      "76 COPIED_ELEMENT: a mark on a call that may freeze a value that exists before it: viaCopiedElement()",
      "77 PROPERTY: a mark on a call that may freeze a value that exists before it: viaProperty()",
      "78 DESTRUCTURED_DEFAULT: a mark on a call that may freeze a value that exists before it: viaDestructuredDefault()",
      "79 ARRAY_DEFAULT: a mark on a call that may freeze a value that exists before it: viaArrayDefault()",
      "80 DESTRUCTURED_LOCAL: a mark on a call that may freeze a value that exists before it: viaDestructuredLocal()",
      "81 LOCAL_FUNCTION: a mark on a call that may freeze a value that exists before it: viaLocalFunction()",
      "83 GIVEN_CALLBACK: a mark on a call that may freeze a value that exists before it: viaGivenCallback()",
      "84 CAUGHT: a mark on a call that may freeze a value that exists before it: viaCatch()",
      "85 VAR_LOOP: a mark on a call that may freeze a value that exists before it: viaVarLoop()",
      "86 REASSIGNED: a mark on a call that may freeze a value that exists before it: viaReassigned({})",
      "87 LET: a mark on a call that may freeze a value that exists before it: viaLet()",
      "89 NAMED_CALLBACK: a mark on a call that may freeze a value that exists before it: viaNamedCallback()",
      "90 LOCAL_CALLBACK: a mark on a call that may freeze a value that exists before it: viaLocalCallback()",
      "91 OWN_FREEZE: a mark on a call that may freeze a value that exists before it: viaOwnFreeze()",
      "92 BLOCKS: a mark on a call that may freeze a value that exists before it: viaBlocks()",
      "93 MAPPED_BY_NAME: a mark on a call that may freeze a value that exists before it: ROWS.map(lockRow)",
      "96 CALLED_BY_NAME: a mark on a call that may freeze a value that exists before it: call(lockState)",
      "97 REDUCED: a mark on a call that may freeze a value that exists before it: [{}].reduce((sum) => Object.freeze(sum), STATE)",
      "98 DEFAULTED_ROW: a mark on a call that may freeze a value that exists before it: [undefined].map((row = STATE) => Object.freeze(row))",
      "99 FROM_HOLE: a mark on a call that may freeze a value that exists before it: Array.from([,], (row = STATE) => Object.freeze(row))",
      "100 COMMA: the operator ,: 0, lockAny",
      "100 COMMA: a mark on a call that may freeze a value that exists before it: (0, lockAny)(STATE)",
      "101 COMMA_IN_PLACE: the operator ,: 0, () => Object.freeze(STATE)",
      "101 COMMA_IN_PLACE: a mark on a call that may freeze a value that exists before it: (0, () => Object.freeze(STATE))()",
      "102 ALIASED: a mark on a call that may freeze a value that exists before it: lockAlias(STATE)",
      "103 THIS_PARAMETER: a mark on a call that may freeze a value that exists before it: lockThis(STATE)",
      "104 THIS_NEW: a mark on a call that may freeze a value that exists before it: new (lockThis as any)(STATE)",
      "105 THIS_CALLBACK: a mark on a call that may freeze a value that exists before it: callThis(() => Object.freeze(ROWS))",
      "106 THIS_DEFAULT: a mark on a call that may freeze a value that exists before it: lockThisDefault()",
      "108 MEMO: a mark on a call that may freeze a value that exists before it: viaMemo()",
      "109 GENERATED: a mark on a call that may freeze a value that exists before it: generate()",
      "110 LOCAL_MARKS: a call that may freeze a value that exists before it: localMarks()",
      "111 KEY_ASSIGNED: a mark on a call that may freeze a value that exists before it: viaKeyAssigned()",
      "113 COUNTED: a mark on a call that may freeze a value that exists before it: viaCounted()",
      "114 LET_FREEZE: a mark on a call that may freeze a value that exists before it: viaLetFreeze()",
      "115 CONST_FREEZE: a mark on a call that may freeze a value that exists before it: viaConstFreeze()",
      "116 ARRAY_ASSIGNED: a mark on a call that may freeze a value that exists before it: viaArrayAssigned()",
      "117 OBJECT_ASSIGNED: a mark on a call that may freeze a value that exists before it: viaObjectAssigned()",
      "118 LOOP_TARGET: a mark on a call that may freeze a value that exists before it: viaLoopTarget()",
      // A function's own profile does not follow names declared around it: refused, though `shared` is new here.
      "120 CLOSURE: a mark on a call that may freeze a value that exists before it: viaClosure()",
      "121 SPREAD_IN_PLACE: a mark on a call that may freeze a value that exists before it: viaSpreadInPlace()",
      "122 ASSIGNED_PROPERTY: a mark on a call that may freeze a value that exists before it: viaAssignedProperty()",
      "125 INNER_DEFAULT: a mark on a call that may freeze a value that exists before it: viaInnerDefault()",
      "126 TAGGED: a mark on a call that may freeze a value that exists before it: viaTag()",
      "127 THIS_FROZEN: a mark on a call that may freeze a value that exists before it: viaThisFreeze()",
      // A parameter gathered with `...` is not followed: refused, though what it gathers is new.
      "128 REST_IN_PLACE: a mark on a call that may freeze a value that exists before it: viaRestInPlace()",
      "129 SPREAD_ARGUMENTS: a spread: ...([{}, STATE] as [object, object])",
      "129 SPREAD_ARGUMENTS: a mark on a call that may freeze a value that exists before it: lockSecond(...([{}, STATE] as [object, object]))",
      "130 NEW_GIVEN: unmarked: new Map()",
      // What a `new` holds is not known.
      "130 NEW_GIVEN: a mark on a call that may freeze a value that exists before it: lockAny(new Map())",
      "132 FROZEN_ROWS: a property read: Object.freeze",
      "132 FROZEN_ROWS: a mark on a call that may freeze a value that exists before it: ROWS.map(Object.freeze)",
      "133 FROZEN_LITERALS: a property read: Object.freeze",
      "136 KEYS_GIVEN: unmarked: Object.keys(STATE)",
      "137 SPLIT_GIVEN: unmarked: \"a|b\".split(\"|\")",
      "138 MAPPED_GIVEN: unmarked: [{ a: 1 }].map(() => STATE)",
      // What a map's function returns is not followed.
      "138 MAPPED_GIVEN: a mark on a call that may freeze a value that exists before it: lockAny([{ a: 1 }].map(() => STATE))",
      "139 FROM_MAPPED: unmarked: Array.from([{ a: 1 }], () => STATE)",
      "139 FROM_MAPPED: a mark on a call that may freeze a value that exists before it: lockAny(Array.from([{ a: 1 }], () => STATE))",
      "140 LET_FREEZE_ASSIGNED: a mark on a call that may freeze a value that exists before it: viaLetFreezeAssigned()",
      "142 SELF: a mark on a call that may freeze a value that exists before it: lockSelf()",
      "143 DEEP_RECURSION: a mark on a call that may freeze a value that exists before it: lockDeep({}, 1)",
      "144 LATE: a mark on a call that may freeze a value that exists before it: outerLate()"
    ]);
  });

  it("counts what code puts into a value, a generator's body, a class's static parts, a default that a given argument may leave to apply, and recursion", () => {
    // The marks the list leaves out freeze only what is made where it is written: FILLED_NEW, PUSHED_NEW, COUNTED,
    // SHALLOW_FILLED, ASSIGNED_NEW, DEFAULT_GIVEN, CONDITIONAL_GIVEN, OR_GIVEN, COMMA_GIVEN, LITERAL_GIVEN, MUTUAL_NEW,
    // LOCAL_DEEP, SELF_LOOKUP, ARRAY_KEYS, OWN_LENGTH and OBJECT_KEYS. MODULE_LET_ASSIGNED's is left as it is because a function reached through a
    // `let` that is assigned is not read. AND_GIVEN's is refused although it freezes a new object, since `&&` may give
    // `undefined`, and DEFINED's since Object.defineProperty is not judged.
    expect(atLines(`
const STATE = { a: 1 };
const ROWS = [{ a: 1 }];
const INDEX = /*#__PURE__*/ new Map([[STATE, 1]]);
function deepFreeze(value: any): any { for (const inner of Object.values(value)) if (typeof inner === "object" && inner !== null) deepFreeze(inner); return Object.freeze(value); }
function lock(value: object = STATE) { return Object.freeze(value); }
function viaFilled() { const index: Record<string, object> = {}; for (const row of ROWS) index[String(row.a)] = row; return deepFreeze(index); }
function viaFilledNew() { const index: Record<string, object> = {}; for (const key of ["a", "b"]) index[key] = { key }; return deepFreeze(index); }
function viaBox() { const box: { v?: object } = {}; box.v = STATE; return Object.freeze(box.v); }
function viaPushed() { const rows: object[] = []; rows.push(...ROWS); rows.forEach((row) => Object.freeze(row)); return rows.length; }
function viaPushedNew() { const rows: object[] = []; rows.push({ a: 1 }); for (const row of rows) Object.freeze(row); return 1; }
function viaAssign() { const target = {}; Object.assign(target, { inner: STATE }); return deepFreeze(target); }
function viaDefine() { const target = {}; Object.defineProperty(target, "inner", { value: { a: 1 } }); return deepFreeze(target); }
function viaPart() { const held: { inner: object[] } = { inner: [] }; held.inner.push(STATE); return deepFreeze(held); }
function viaPattern() { const box = { v: {} }; [box.v] = [STATE]; return deepFreeze(box); }
function viaCounted() { const box = { n: 0 }; box.n += ROWS.length; box.n++; return deepFreeze(box); }
function viaOrAssigned() { const box: { v?: object } = {}; box.v ||= STATE; return deepFreeze(box); }
function viaLoopTargetPart() { const box: { v?: object } = {}; for (box.v of ROWS) void 0; return deepFreeze(box); }
function viaSpliced() { const rows: object[] = []; rows.splice(0, 0, STATE); return deepFreeze(rows); }
function viaShallowFilled() { const rows: object[] = []; rows.push(STATE); return Object.freeze(rows); }
function viaAssignedNew() { const box: { v: object } = { v: STATE }; return Object.freeze(box.v = { a: 1 }); }
function viaBoxedDeep() { const box: { v?: object } = {}; box.v = { inner: STATE }; return deepFreeze(box); }
function fill(box: { v?: object }) { box.v = STATE; return deepFreeze(box); }
function viaMaybe(flag: boolean) { return lock(flag ? { a: 1 } : undefined); }
function viaOptions(options: { overrides?: object }) { return lock(options.overrides); }
function viaUndefinedName() { const nothing = undefined; return lock(nothing); }
function viaSpreadGiven(rest: object[]) { return lock(...(rest as [object])); }
function* generate() { yield Object.freeze(STATE); }
function viaGenerator() { return [...generate()].length; }
function viaClassField() { class Held { static held = Object.freeze(STATE); } return Held; }
function viaClassBlock() { const Held = class { static { Object.freeze(STATE); } }; return Held; }
function viaClassDeep() { return deepFreeze({ Kind: class { static state = STATE; } }); }
function viaDefaultFreeze(value = Object.freeze(STATE)) { return value; }
function viaRecursion() { const lockDeep = (value: object, n: number): object => (n ? lockDeep(STATE, n - 1) : Object.freeze(value)); return lockDeep({}, 1); }
function viaMutualNew() { const f = (n: number, value: object = { a: 1 }): object => { if (n) g(n - 1); return Object.freeze(value); }; const g = (n: number): object => f(n); return f(1, {}); }
function viaMutualDefault() { const f = (n: number, value: object = STATE): object => { if (n) g(n - 1); return Object.freeze(value); }; const g = (n: number): object => f(n); return f(1, {}); }
function viaMutual() { const f = (value: object, n: number): object => { if (n) g(n - 1); return Object.freeze(value); }; const g = (n: number): object => f(STATE, n); f({}, 0); return g(0); }
function viaSelfLookup() { const walk = (table: object, n: number): object => (n ? walk(STATE, n - 1) : Object.freeze({ n })); return walk({}, 2); }
function viaLocalDeep() { const deep = (value: any): any => { for (const key of Object.keys(value)) deep(value[key]); return Object.freeze(value); }; return deep({ a: { b: 1 } }); }
function viaArrayKeys() { for (const key of [{ a: 1 }].keys()) Object.freeze(key); return 1; }
function viaKeys() { for (const key of INDEX.keys()) Object.freeze(key); return 1; }
function viaForEachKey() { new Map([[STATE, 1]]).forEach((value, key) => Object.freeze(key)); return 1; }
function viaCommaConst() { const freezeIt = (0, Object.freeze); return freezeIt(STATE); }
function viaInherited() { return Object.freeze([].constructor); }
function viaInheritedMethod() { return Object.freeze([].push); }
function viaIterator() { return Object.freeze([][Symbol.iterator]); }
function viaOwnLength() { return Object.freeze({ length: { a: 1 } }.length); }
function viaSpreadFrom() { return deepFreeze(Array.from(...([[1], () => STATE] as [number[], () => object]))); }
function viaObjectKeys() { return deepFreeze(Object.keys(STATE)); }
function callDefault(f: () => unknown, x = f()) { return x; }
let lockAlias = lock;
function shadowsAlias() { let lockAlias = 0; lockAlias = 1; return lockAlias; }
let lockLet = lock;
lockLet = (value: object) => value;
const freezeIt = Object.freeze;
export const FILLED = /*#__PURE__*/ viaFilled();
export const FILLED_NEW = /*#__PURE__*/ viaFilledNew();
export const BOX = /*#__PURE__*/ viaBox();
export const PUSHED = /*#__PURE__*/ viaPushed();
export const PUSHED_NEW = /*#__PURE__*/ viaPushedNew();
export const ASSIGNED = /*#__PURE__*/ viaAssign();
export const DEFINED = /*#__PURE__*/ viaDefine();
export const PART = /*#__PURE__*/ viaPart();
export const PATTERN = /*#__PURE__*/ viaPattern();
export const COUNTED = /*#__PURE__*/ viaCounted();
export const OR_ASSIGNED = /*#__PURE__*/ viaOrAssigned();
export const LOOP_TARGET_PART = /*#__PURE__*/ viaLoopTargetPart();
export const SPLICED = /*#__PURE__*/ viaSpliced();
export const SHALLOW_FILLED = /*#__PURE__*/ viaShallowFilled();
export const BOXED_DEEP = /*#__PURE__*/ viaBoxedDeep();
export const ASSIGNED_NEW = /*#__PURE__*/ viaAssignedNew();
export const FILLED_GIVEN = /*#__PURE__*/ fill({});
export const MAYBE = /*#__PURE__*/ viaMaybe(false);
export const OPTIONS = /*#__PURE__*/ viaOptions({});
export const UNDEFINED_NAME = /*#__PURE__*/ viaUndefinedName();
export const SPREAD_GIVEN = /*#__PURE__*/ viaSpreadGiven([{}]);
export const DEFAULT_GIVEN = /*#__PURE__*/ lock({ a: 1 });
export const CONDITIONAL_GIVEN = /*#__PURE__*/ lock(true ? { a: 1 } : { b: 2 });
export const OR_GIVEN = /*#__PURE__*/ lock(null || { a: 1 });
export const AND_GIVEN = /*#__PURE__*/ lock(true && { a: 1 });
export const COMMA_UNDEFINED = /*#__PURE__*/ lock((0, undefined));
export const COMMA_GIVEN = /*#__PURE__*/ lock((0, { a: 1 }));
export const LITERAL_GIVEN = /*#__PURE__*/ lock(null as never);
export const GENERATED = /*#__PURE__*/ viaGenerator();
export const CLASS_FIELD = /*#__PURE__*/ viaClassField();
export const CLASS_BLOCK = /*#__PURE__*/ viaClassBlock();
export const CLASS_DEEP = /*#__PURE__*/ viaClassDeep();
export const DEFAULT_FREEZE = /*#__PURE__*/ viaDefaultFreeze({});
export const RECURSION = /*#__PURE__*/ viaRecursion();
export const MUTUAL = /*#__PURE__*/ viaMutual();
export const MUTUAL_NEW = /*#__PURE__*/ viaMutualNew();
export const MUTUAL_DEFAULT = /*#__PURE__*/ viaMutualDefault();
export const LOCAL_DEEP = /*#__PURE__*/ viaLocalDeep();
export const SELF_LOOKUP = /*#__PURE__*/ viaSelfLookup();
export const ARRAY_KEYS = /*#__PURE__*/ viaArrayKeys();
export const KEYS = /*#__PURE__*/ viaKeys();
export const FOR_EACH_KEY = /*#__PURE__*/ viaForEachKey();
export const INHERITED = /*#__PURE__*/ viaInherited();
export const INHERITED_METHOD = /*#__PURE__*/ viaInheritedMethod();
export const ITERATOR = /*#__PURE__*/ viaIterator();
export const OWN_LENGTH = /*#__PURE__*/ viaOwnLength();
export const SPREAD_FROM = /*#__PURE__*/ viaSpreadFrom();
export const OBJECT_KEYS = /*#__PURE__*/ viaObjectKeys();
export const LET_ALIAS = /*#__PURE__*/ lockAlias(STATE);
export const MODULE_LET_ASSIGNED = /*#__PURE__*/ lockLet(STATE);
export const CALLED_IN_DEFAULT = /*#__PURE__*/ callDefault(() => Object.freeze(STATE));
export const COMMA_ALIAS = /*#__PURE__*/ (0, freezeIt)(STATE);
export const COMMA_CONST = /*#__PURE__*/ viaCommaConst();
export const SHADOWED_ALIAS = shadowsAlias();
export const COMMA_FREEZE = /*#__PURE__*/ (0, Object.freeze)(STATE);
export const KEYED_FREEZE = /*#__PURE__*/ Object["freeze"](STATE);
`)).toEqual([
      "56 FILLED: a mark on a call that may freeze a value that exists before it: viaFilled()",
      "58 BOX: a mark on a call that may freeze a value that exists before it: viaBox()",
      "59 PUSHED: a mark on a call that may freeze a value that exists before it: viaPushed()",
      "61 ASSIGNED: a mark on a call that may freeze a value that exists before it: viaAssign()",
      "62 DEFINED: a mark on a call that may freeze a value that exists before it: viaDefine()",
      "63 PART: a mark on a call that may freeze a value that exists before it: viaPart()",
      "64 PATTERN: a mark on a call that may freeze a value that exists before it: viaPattern()",
      "66 OR_ASSIGNED: a mark on a call that may freeze a value that exists before it: viaOrAssigned()",
      "67 LOOP_TARGET_PART: a mark on a call that may freeze a value that exists before it: viaLoopTargetPart()",
      "68 SPLICED: a mark on a call that may freeze a value that exists before it: viaSpliced()",
      "70 BOXED_DEEP: a mark on a call that may freeze a value that exists before it: viaBoxedDeep()",
      "72 FILLED_GIVEN: a mark on a call that may freeze a value that exists before it: fill({})",
      "73 MAYBE: a mark on a call that may freeze a value that exists before it: viaMaybe(false)",
      "74 OPTIONS: a mark on a call that may freeze a value that exists before it: viaOptions({})",
      "75 UNDEFINED_NAME: a mark on a call that may freeze a value that exists before it: viaUndefinedName()",
      "76 SPREAD_GIVEN: a mark on a call that may freeze a value that exists before it: viaSpreadGiven([{}])",
      "78 CONDITIONAL_GIVEN: a conditional: true ? { a: 1 } : { b: 2 }",
      "79 OR_GIVEN: the operator ||: null || { a: 1 }",
      "80 AND_GIVEN: the operator &&: true && { a: 1 }",
      "80 AND_GIVEN: a mark on a call that may freeze a value that exists before it: lock(true && { a: 1 })",
      "81 COMMA_UNDEFINED: the operator ,: 0, undefined",
      "81 COMMA_UNDEFINED: a mark on a call that may freeze a value that exists before it: lock((0, undefined))",
      "82 COMMA_GIVEN: the operator ,: 0, { a: 1 }",
      "84 GENERATED: a mark on a call that may freeze a value that exists before it: viaGenerator()",
      "85 CLASS_FIELD: a mark on a call that may freeze a value that exists before it: viaClassField()",
      "86 CLASS_BLOCK: a mark on a call that may freeze a value that exists before it: viaClassBlock()",
      "87 CLASS_DEEP: a mark on a call that may freeze a value that exists before it: viaClassDeep()",
      "88 DEFAULT_FREEZE: a mark on a call that may freeze a value that exists before it: viaDefaultFreeze({})",
      "89 RECURSION: a mark on a call that may freeze a value that exists before it: viaRecursion()",
      "90 MUTUAL: a mark on a call that may freeze a value that exists before it: viaMutual()",
      "92 MUTUAL_DEFAULT: a mark on a call that may freeze a value that exists before it: viaMutualDefault()",
      "96 KEYS: a mark on a call that may freeze a value that exists before it: viaKeys()",
      "97 FOR_EACH_KEY: a mark on a call that may freeze a value that exists before it: viaForEachKey()",
      "98 INHERITED: a mark on a call that may freeze a value that exists before it: viaInherited()",
      "99 INHERITED_METHOD: a mark on a call that may freeze a value that exists before it: viaInheritedMethod()",
      "100 ITERATOR: a mark on a call that may freeze a value that exists before it: viaIterator()",
      "102 SPREAD_FROM: a mark on a call that may freeze a value that exists before it: viaSpreadFrom()",
      "104 LET_ALIAS: a mark on a call that may freeze a value that exists before it: lockAlias(STATE)",
      "106 CALLED_IN_DEFAULT: a mark on a call that may freeze a value that exists before it: callDefault(() => Object.freeze(STATE))",
      "107 COMMA_ALIAS: the operator ,: 0, freezeIt",
      "107 COMMA_ALIAS: a mark on a freeze of a value that may exist before it: (0, freezeIt)(STATE)",
      "108 COMMA_CONST: a mark on a call that may freeze a value that exists before it: viaCommaConst()",
      "110 COMMA_FREEZE: the operator ,: 0, Object.freeze",
      "110 COMMA_FREEZE: a property read: Object.freeze",
      "110 COMMA_FREEZE: a mark on a freeze of a value that may exist before it: (0, Object.freeze)(STATE)",
      "111 KEYED_FREEZE: a property read: Object[\"freeze\"]",
      "111 KEYED_FREEZE: a mark on a freeze of a value that may exist before it: Object[\"freeze\"](STATE)"
    ]);
  });

  it("takes for a table what a generator, a class's static parts or a parameter's default make in a function, or a module's `let` names", () => {
    // WALKED and VISITED pass a function to forEach that passes itself on, and make no table.
    expect(atLines(`
function* rows() { yield Object.freeze(["one"]); }
function withClass() { class Held { static held = Object.freeze(["two"]); } return Held; }
function withBlock() { return class { static { Object.freeze(["three"]); } }; }
function withDefault(value = Object.freeze(["four"])) { return value; }
function make() { return Object.freeze(["five"]); }
let alias = make;
const walk = (value: unknown): unknown => (Array.isArray(value) ? value.forEach(walk) : value);
function viaLocalDefaultByName() { const one = (value = Object.freeze(["eight"])) => value; return [1].map(one); }
function viaLocalDefault() { const one = (value = Object.freeze(["eleven"])) => value; return one(); }
function viaLocalGenerator() { function* local() { yield Object.freeze(["twelve"]); } return [...local()]; }
function viaWalk() { const visit = (value: unknown): void => { if (Array.isArray(value)) value.forEach(visit); }; visit([[1]]); return 1; }
export const FROM_GENERATOR = Array.from(rows());
export const CLASS_FIELD = withClass();
export const CLASS_BLOCK = withBlock();
export const DEFAULTED = withDefault();
export const LET_ALIAS = alias();
export const COMMA_FREEZE = (0, Object.freeze)(["six"]);
export const KEYED_FREEZE = Object["freeze"](["seven"]);
export const LOCAL_DEFAULT_BY_NAME = viaLocalDefaultByName();
export const IN_PLACE_DEFAULT = ((value = Object.freeze(["nine"])) => value)();
export const CALLBACK_DEFAULT = [1].map((value: number, index: number, all: number[], made = Object.freeze(["ten"])) => made);
export const LOCAL_DEFAULT = viaLocalDefault();
export const LOCAL_GENERATOR = viaLocalGenerator();
export const WALKED = walk([[1]]);
export const VISITED = viaWalk();
`)).toEqual([
      "13 FROM_GENERATOR: unmarked: Array.from(rows())",
      "13 FROM_GENERATOR: unmarked: rows()",
      "14 CLASS_FIELD: unmarked: withClass()",
      "15 CLASS_BLOCK: unmarked: withBlock()",
      "16 DEFAULTED: unmarked: withDefault()",
      "17 LET_ALIAS: unmarked: alias()",
      "18 COMMA_FREEZE: unmarked: (0, Object.freeze)([\"six\"])",
      "18 COMMA_FREEZE: the operator ,: 0, Object.freeze",
      "18 COMMA_FREEZE: a property read: Object.freeze",
      "19 KEYED_FREEZE: unmarked: Object[\"freeze\"]([\"seven\"])",
      "19 KEYED_FREEZE: a property read: Object[\"freeze\"]",
      "20 LOCAL_DEFAULT_BY_NAME: unmarked: viaLocalDefaultByName()",
      "21 IN_PLACE_DEFAULT: unmarked: ((value = Object.freeze([\"nine\"])) => value)()",
      "22 CALLBACK_DEFAULT: unmarked: [1].map((value: number, index: number, all: number[], made = Object.freeze([\"ten",
      "23 LOCAL_DEFAULT: unmarked: viaLocalDefault()",
      "24 LOCAL_GENERATOR: unmarked: viaLocalGenerator()"
    ]);
  });

  it("reads destructured inherited parts, writes into what a call or a conditional gives, decorators given by name and a freeze a conditional chooses", () => {
    // The marks the list leaves out freeze only what is made where it is written: OWN_KEY, ARRAY_NAME, REST_NAME,
    // GROUPS_NEW, GROUPS_DEEP_NEW, KEY_ONLY, CHOSEN_TARGET_NEW, CHOSEN_ASSIGN_NEW, ASSIGNED_NEW and KEPT_DECORATOR. RETURNED's and HELD's are left as they are because a function a call returns, or
    // one held in an array, is not read. PAIR's two marks pin a profile that rests on an unfinished one, which is not kept: kept, it
    // would let g(1) through. THIS_ARG pins that a parameter of a function an iteration method is given but not to call, the
    // `this` of the function it calls, may hold a value that exists before the call.
    expect(atLines(`
const STATE = { a: 1 };
const ROWS = [{ a: 1 }, { a: 2 }];
function deepFreeze(value: any): any { for (const inner of Object.values(value)) if (typeof inner === "object" && inner !== null) deepFreeze(inner); return Object.freeze(value); }
function lockState(value: any, context: unknown): any { Object.freeze(STATE); return value; }
function keep(value: any, context: unknown): any { return value; }
function lockAny(value: object) { return Object.freeze(value); }
function noop(value: object) { return value; }
function viaPair() {
  const f = (n: number): number => { if (n) { Object.freeze(STATE); g(n - 1); } return 1; };
  const g = (n: number): number => (n ? f(n) : 0);
  const a = /*#__PURE__*/ f(0);
  const b = /*#__PURE__*/ g(1);
  return a + b;
}
function viaConstructor() { const { constructor } = []; return Object.freeze(constructor); }
function viaToString() { const { toString: method } = {}; return Object.freeze(method); }
function viaOwnKey() { const { inner } = { inner: { a: 1 } }; return Object.freeze(inner); }
function viaArrayName() { const [toString] = [{ a: 1 }]; return Object.freeze(toString); }
function viaRestName() { const { ...toString } = { a: 1 }; return Object.freeze(toString); }
function viaComputedKey() { const { ["constructor"]: made } = []; return Object.freeze(made); }
function viaCallbackKey() { [[]].forEach(({ constructor }) => Object.freeze(constructor)); return 1; }
function viaLoopKey() { for (const { hasOwnProperty } of [{}]) Object.freeze(hasOwnProperty); return 1; }
function viaGroups() { const groups: object[][] = [[]]; for (const row of ROWS) { if (row.a > 1) groups.push([]); groups.at(-1)!.push(row); } return deepFreeze(groups); }
function viaGroupsNew() { const groups: object[][] = [[]]; for (const key of ["a", "b"]) groups.at(-1)!.push({ key }); return Object.freeze(groups); }
function viaGroupsDeepNew() { const groups: object[][] = [[]]; for (const key of ["a", "b"]) groups.at(-1)!.push({ key }); return deepFreeze(groups); }
function viaKeyOnly() { const box: Record<string, object> = {}; const other: Record<string, object> = {}; other[String(Object.keys(box).length)] = STATE; return deepFreeze(box); }
function viaChosen(flag: boolean) { const a: object[] = []; const b: object[] = []; (flag ? a : b).push(STATE); return deepFreeze([a, b]); }
function viaChosenTarget(flag: boolean) { const a: { v?: object } = {}; const b: { v?: object } = {}; (flag ? a : b).v = STATE; return deepFreeze([a, b]); }
function viaChosenTargetNew(flag: boolean) { const a: { v?: object } = {}; const b: { v?: object } = {}; (flag ? a : b).v = { k: 1 }; return deepFreeze([a, b]); }
function viaChosenAssignNew(flag: boolean) { const a = {}; const b = {}; Object.assign(flag ? a : b, { inner: { k: 1 } }); return deepFreeze([a, b]); }
function viaChosenAssign(flag: boolean) { const a = {}; const b = {}; Object.assign(flag ? a : b, { inner: STATE }); return deepFreeze([a, b]); }
function viaAssignedNew() { const target = {}; Object.assign(target, { inner: { a: 1 } }); return deepFreeze(target); }
function viaNext() { return Object.freeze([].values().next); }
function viaChosenFreeze(flag: boolean) { return (flag ? Object.freeze : (value: object) => value)(STATE); }
function viaChosenCallback(flag: boolean) { return ROWS.map(flag ? Object.freeze : (row) => row); }
function viaChosenLate(flag: boolean) { return ROWS.map(flag ? (row) => row : Object.freeze); }
function viaAndCallback(flag: boolean) { ROWS.forEach(flag && Object.freeze || noop); return 1; }
function viaOrCallback() { ROWS.forEach(Object.freeze || noop); return 1; }
function viaDecorated() { @lockState class Held {} return Held; }
function viaKeptDecorator() { @keep class Held {} return Held; }
function viaReturned() { const makeLocker = () => lockAny; return makeLocker()(STATE); }
function viaHeld() { return [lockAny][0](STATE); }
function viaThisArg() { const acc: object[] = []; [{ a: 1 }].forEach(function (this: (row: object) => void) { this(STATE); }, function (row: object) { acc.push(row); }); return deepFreeze(acc); }
export const PAIR = viaPair();
export const CONSTRUCTOR = /*#__PURE__*/ viaConstructor();
export const TO_STRING = /*#__PURE__*/ viaToString();
export const OWN_KEY = /*#__PURE__*/ viaOwnKey();
export const ARRAY_NAME = /*#__PURE__*/ viaArrayName();
export const REST_NAME = /*#__PURE__*/ viaRestName();
export const COMPUTED_KEY = /*#__PURE__*/ viaComputedKey();
export const CALLBACK_KEY = /*#__PURE__*/ viaCallbackKey();
export const LOOP_KEY = /*#__PURE__*/ viaLoopKey();
export const GROUPS = /*#__PURE__*/ viaGroups();
export const GROUPS_NEW = /*#__PURE__*/ viaGroupsNew();
export const GROUPS_DEEP_NEW = /*#__PURE__*/ viaGroupsDeepNew();
export const KEY_ONLY = /*#__PURE__*/ viaKeyOnly();
export const CHOSEN = /*#__PURE__*/ viaChosen(true);
export const CHOSEN_TARGET = /*#__PURE__*/ viaChosenTarget(true);
export const CHOSEN_TARGET_NEW = /*#__PURE__*/ viaChosenTargetNew(true);
export const CHOSEN_ASSIGN_NEW = /*#__PURE__*/ viaChosenAssignNew(true);
export const CHOSEN_ASSIGN = /*#__PURE__*/ viaChosenAssign(true);
export const ASSIGNED_NEW = /*#__PURE__*/ viaAssignedNew();
export const NEXT = /*#__PURE__*/ viaNext();
export const CHOSEN_FREEZE = /*#__PURE__*/ viaChosenFreeze(true);
export const CHOSEN_CALLBACK = /*#__PURE__*/ viaChosenCallback(true);
export const CHOSEN_LATE = /*#__PURE__*/ viaChosenLate(true);
export const AND_CALLBACK = /*#__PURE__*/ viaAndCallback(true);
export const OR_CALLBACK = /*#__PURE__*/ viaOrCallback();
export const DECORATED = /*#__PURE__*/ viaDecorated();
export const KEPT_DECORATOR = /*#__PURE__*/ viaKeptDecorator();
export const RETURNED = /*#__PURE__*/ viaReturned();
export const HELD = /*#__PURE__*/ viaHeld();
export const THIS_ARG = /*#__PURE__*/ viaThisArg();
`)).toEqual([
      "12 (no table): a mark on a call that may freeze a value that exists before it: f(0)",
      "13 (no table): a mark on a call that may freeze a value that exists before it: g(1)",
      "45 PAIR: a call that may freeze a value that exists before it: viaPair()",
      "46 CONSTRUCTOR: a mark on a call that may freeze a value that exists before it: viaConstructor()",
      "47 TO_STRING: a mark on a call that may freeze a value that exists before it: viaToString()",
      "51 COMPUTED_KEY: a mark on a call that may freeze a value that exists before it: viaComputedKey()",
      "52 CALLBACK_KEY: a mark on a call that may freeze a value that exists before it: viaCallbackKey()",
      "53 LOOP_KEY: a mark on a call that may freeze a value that exists before it: viaLoopKey()",
      "54 GROUPS: a mark on a call that may freeze a value that exists before it: viaGroups()",
      "58 CHOSEN: a mark on a call that may freeze a value that exists before it: viaChosen(true)",
      "59 CHOSEN_TARGET: a mark on a call that may freeze a value that exists before it: viaChosenTarget(true)",
      "62 CHOSEN_ASSIGN: a mark on a call that may freeze a value that exists before it: viaChosenAssign(true)",
      "64 NEXT: a mark on a call that may freeze a value that exists before it: viaNext()",
      "65 CHOSEN_FREEZE: a mark on a call that may freeze a value that exists before it: viaChosenFreeze(true)",
      "66 CHOSEN_CALLBACK: a mark on a call that may freeze a value that exists before it: viaChosenCallback(true)",
      "67 CHOSEN_LATE: a mark on a call that may freeze a value that exists before it: viaChosenLate(true)",
      "68 AND_CALLBACK: a mark on a call that may freeze a value that exists before it: viaAndCallback(true)",
      "69 OR_CALLBACK: a mark on a call that may freeze a value that exists before it: viaOrCallback()",
      "70 DECORATED: a mark on a call that may freeze a value that exists before it: viaDecorated()",
      "74 THIS_ARG: a mark on a call that may freeze a value that exists before it: viaThisArg()"
    ]);
    expect(atLines(`
function makeTable(value: any, context: unknown): any { Object.freeze(["one"]); return value; }
function withDecorated() { @makeTable class Held {} return Held; }
function chosen(flag: boolean) { return (flag ? Object.freeze : (value: string[]) => value)(["two"]); }
export const DECORATED = withDecorated();
export const CHOSEN = chosen(true);
export const CHOSEN_HERE = (true ? Object.freeze : (value: string[]) => value)(["three"]);
`)).toEqual([
      "5 DECORATED: unmarked: withDecorated()",
      "6 CHOSEN: unmarked: chosen(true)",
      "7 CHOSEN_HERE: unmarked: (true ? Object.freeze : (value: string[]) => value)([\"three\"])",
      "7 CHOSEN_HERE: a conditional: true ? Object.freeze : (value: string[]) => value",
      "7 CHOSEN_HERE: a property read: Object.freeze"
    ]);
  });

  it("reads Object.freeze through a name or an assignment, with what else a choice gives, a decorator that names a parameter or makes a table when its module loads, an overloaded function, a part under a well-known symbol and a decorated class", () => {
    // CHOSEN_NEW's and ASSIGNED_NEW's marks freeze only what is made where it is written: keep freezes nothing. KEY_NAME's
    // key is not written as a name or a string, so the check does not ask whether it reads an inherited part; here it
    // reads an own one.
    expect(atLines(`
const STATE = { a: 1 };
const ROWS = [{ a: 1 }, { a: 2 }];
class Base {}
function deepFreeze(value: any): any { for (const inner of Object.values(value)) if (typeof inner === "object" && inner !== null) deepFreeze(inner); return Object.freeze(value); }
function keep<T>(value: T): T { return value; }
function lockState(value: any, context: unknown): any { Object.freeze(STATE); return value; }
function swap(value: any, context: unknown): any { return Base; }
function lockAny(value: object): object { Object.freeze(STATE); return value; }
const chooseDeep = true ? Object.freeze : deepFreeze;
const KEYS = { inner: "inner" } as const;
function viaChosenName(flag: boolean) { const lock = flag ? Object.freeze : keep; return lock(STATE); }
function viaChosenLet(flag: boolean) { let lock = flag ? Object.freeze : keep; return lock(STATE); }
function viaChosenCallback() { const lock = Object.freeze || keep; ROWS.forEach(lock); return 1; }
function viaAssigned() { let lock: (value: object) => object = keep; return (lock = Object.freeze)(STATE); }
function viaAssignedIfUnset() { let lock: ((value: object) => object) | undefined; return (lock ??= Object.freeze)(STATE); }
function viaChosenDeep(flag: boolean) { return (flag ? Object.freeze : deepFreeze)({ inner: STATE }); }
function viaChosenNew(flag: boolean) { return (flag ? Object.freeze : keep)({ a: 1 }); }
function viaChosenOperator(flag: boolean) { const lock = flag ? lockAny : undefined; return (lock ?? Object.freeze)({ a: 1 }); }
function viaAssignedNew() { let lock: (value: object) => object; return (lock = Object.freeze)({ a: 1 }); }
function viaAssignedChoice(flag: boolean) { let lock: (value: object) => object; return (lock = flag ? Object.freeze : deepFreeze)({ inner: STATE }); }
function viaModuleChoice() { return chooseDeep({ inner: STATE }); }
function viaLocalChoice(flag: boolean) { const lock = flag ? Object.freeze : deepFreeze; return lock({ inner: STATE }); }
function viaChosenInline(flag: boolean) { return (flag ? Object.freeze : (value: object) => { Object.freeze(STATE); return value; })({ a: 1 }); }
function viaKeyName() { const { [KEYS.inner]: inner } = { inner: { a: 1 } }; return Object.freeze(inner); }
function viaChosenUnknown(flag: boolean, other: (value: object) => object) { return (flag ? Object.freeze : other)({ a: 1 }); }
function viaChosenMap(flag: boolean) { return [{ a: 1 }].map(flag ? Object.freeze : lockAny); }
function viaChosenMapUnknown(flag: boolean, other: (value: object) => object) { return [{ a: 1 }].map(flag ? Object.freeze : other); }
function viaDecoratorParameter(decorate: (value: any, context: unknown) => any) { @decorate class Held {} return Held; }
function viaOverload() {
  function lock(value: object): object;
  function lock(value: any) { return Object.freeze(value); }
  return lock(STATE);
}
function viaSymbolKey() { const { [Symbol.iterator]: values } = [] as number[]; return Object.freeze(values); }
function viaSymbolParameter() { [[1]].forEach(({ [Symbol.iterator]: values }) => Object.freeze(values)); return 1; }
function viaSwapped() { const Held = @swap class {}; return Object.freeze(Held); }
export const CHOSEN_NAME = /*#__PURE__*/ viaChosenName(true);
export const CHOSEN_LET = /*#__PURE__*/ viaChosenLet(true);
export const CHOSEN_CALLBACK = /*#__PURE__*/ viaChosenCallback();
export const ASSIGNED = /*#__PURE__*/ viaAssigned();
export const ASSIGNED_IF_UNSET = /*#__PURE__*/ viaAssignedIfUnset();
export const CHOSEN_DEEP = /*#__PURE__*/ viaChosenDeep(false);
export const CHOSEN_NEW = /*#__PURE__*/ viaChosenNew(true);
export const CHOSEN_OPERATOR = /*#__PURE__*/ viaChosenOperator(true);
export const ASSIGNED_NEW = /*#__PURE__*/ viaAssignedNew();
export const ASSIGNED_CHOICE = /*#__PURE__*/ viaAssignedChoice(false);
export const MODULE_CHOICE = /*#__PURE__*/ viaModuleChoice();
export const LOCAL_CHOICE = /*#__PURE__*/ viaLocalChoice(false);
export const CHOSEN_INLINE = /*#__PURE__*/ viaChosenInline(false);
export const KEY_NAME = /*#__PURE__*/ viaKeyName();
export const CHOSEN_UNKNOWN = /*#__PURE__*/ viaChosenUnknown(true, keep);
export const CHOSEN_MAP = /*#__PURE__*/ viaChosenMap(false);
export const CHOSEN_MAP_UNKNOWN = /*#__PURE__*/ viaChosenMapUnknown(true, keep);
export const DECORATOR_PARAMETER = /*#__PURE__*/ viaDecoratorParameter(lockState);
export const OVERLOAD = /*#__PURE__*/ viaOverload();
export const SYMBOL_KEY = /*#__PURE__*/ viaSymbolKey();
export const SYMBOL_PARAMETER = /*#__PURE__*/ viaSymbolParameter();
export const SWAPPED = /*#__PURE__*/ viaSwapped();
`)).toEqual([
      "38 CHOSEN_NAME: a mark on a call that may freeze a value that exists before it: viaChosenName(true)",
      "39 CHOSEN_LET: a mark on a call that may freeze a value that exists before it: viaChosenLet(true)",
      "40 CHOSEN_CALLBACK: a mark on a call that may freeze a value that exists before it: viaChosenCallback()",
      "41 ASSIGNED: a mark on a call that may freeze a value that exists before it: viaAssigned()",
      "42 ASSIGNED_IF_UNSET: a mark on a call that may freeze a value that exists before it: viaAssignedIfUnset()",
      "43 CHOSEN_DEEP: a mark on a call that may freeze a value that exists before it: viaChosenDeep(false)",
      "45 CHOSEN_OPERATOR: a mark on a call that may freeze a value that exists before it: viaChosenOperator(true)",
      "47 ASSIGNED_CHOICE: a mark on a call that may freeze a value that exists before it: viaAssignedChoice(false)",
      "48 MODULE_CHOICE: a mark on a call that may freeze a value that exists before it: viaModuleChoice()",
      "49 LOCAL_CHOICE: a mark on a call that may freeze a value that exists before it: viaLocalChoice(false)",
      "50 CHOSEN_INLINE: a mark on a call that may freeze a value that exists before it: viaChosenInline(false)",
      "52 CHOSEN_UNKNOWN: a mark on a call that may freeze a value that exists before it: viaChosenUnknown(true, keep)",
      "53 CHOSEN_MAP: a mark on a call that may freeze a value that exists before it: viaChosenMap(false)",
      "54 CHOSEN_MAP_UNKNOWN: a mark on a call that may freeze a value that exists before it: viaChosenMapUnknown(true, keep)",
      "55 DECORATOR_PARAMETER: a mark on a call that may freeze a value that exists before it: viaDecoratorParameter(lockState)",
      "56 OVERLOAD: a mark on a call that may freeze a value that exists before it: viaOverload()",
      "57 SYMBOL_KEY: a mark on a call that may freeze a value that exists before it: viaSymbolKey()",
      "58 SYMBOL_PARAMETER: a mark on a call that may freeze a value that exists before it: viaSymbolParameter()",
      "59 SWAPPED: a mark on a call that may freeze a value that exists before it: viaSwapped()"
    ]);
    expect(atLines(`
const STATE = { a: 1 };
function deepFreeze(value: any): any { for (const inner of Object.values(value)) if (typeof inner === "object" && inner !== null) deepFreeze(inner); return Object.freeze(value); }
function makeTable(value: any, context: unknown): any { Object.freeze(["one"]); return value; }
function keep<T>(value: T): T { return value; }
const choose = true ? Object.freeze : keep;
@makeTable export class Decorated {}
export class WithMethod { @makeTable method() { return 1; } }
export const HELD = @makeTable class {};
export const CHOSEN = choose(["two"]);
export const OVERLOADED = (() => { function make(): readonly string[]; function make() { return Object.freeze(["three"]); } return make(); })();
export const DEEP_CHOICE = /*#__PURE__*/ (true ? Object.freeze : deepFreeze)({ inner: STATE });
`)).toEqual([
      "7 Decorated: a freeze when its module loads, outside a declaration: makeTable",
      "8 WithMethod: a freeze when its module loads, outside a declaration: makeTable",
      "9 HELD: a decorator: @makeTable",
      "10 CHOSEN: unmarked: choose([\"two\"])",
      "11 OVERLOADED: unmarked: (() => { function make(): readonly string[]; function make() { return Object.fre",
      "12 DEEP_CHOICE: a conditional: true ? Object.freeze : deepFreeze",
      "12 DEEP_CHOICE: a property read: Object.freeze",
      "12 DEEP_CHOICE: a mark on a freeze of a value that may exist before it: (true ? Object.freeze : deepFreeze)({ inner: STATE })"
    ]);
  });

  it("reads what else a callee that may be Object.freeze may be when its name is assigned or it runs what it is given, Object.freeze as a default, what `=` assigns, a parameter a const holds, and a class expression's static block", () => {
    // lock and lockPure, names of the module that its code assigns, and ASSIGNED_LOCAL's and LET_OBJECT_ASSIGNED's
    // `let`s may hold anything when they are called; so may a parameter whose default is Object.freeze, whatever the
    // call gives it. The check refuses ASSIGNED_PURE's, DEFAULT_NEW's and DESTRUCTURED_NEW's marks so, though as
    // written their calls freeze only what is made where it is written. LET_OBJECT's `let` holds Object.freeze.
    // LOCAL_KEEP's, LET_KEEP's and KEEP_CALLBACK's callees are Object.freeze or keep, which freezes nothing and calls
    // nothing; OWN_FREEZE_NEW's freezes a new object; OBJECT_KEYS's keys and LOCAL_OBJECT's freeze are not
    // Object.freeze. ASSIGNED_CHAIN's callee is lockAny, through two assignments, and WRAPPED_ALIAS's g is its
    // parameter.
    expect(atLines(`
const STATE = { a: 1 };
function deepFreeze(value: any): any { for (const inner of Object.values(value)) if (typeof inner === "object" && inner !== null) deepFreeze(inner); return Object.freeze(value); }
function keep<T>(value: T): T { return value; }
function lockAny(value: object): object { Object.freeze(STATE); return value; }
function runIt(callback: () => void): any { callback(); return 1; }
let lock: <T>(value: T) => T = Math.PI > 3 ? deepFreeze : Object.freeze;
export function setLock(next: <T>(value: T) => T) { lock = next; }
function viaAssignedModule() { return lock({ inner: STATE }); }
function viaAssignedLocal(flag: boolean) { let chosen: (value: object) => object = Object.freeze; if (!flag) chosen = lockAny; return chosen({ a: 1 }); }
function viaRunner(flag: boolean) { return (flag ? Object.freeze : runIt)(() => { Object.freeze(STATE); }); }
function viaRunnerName(flag: boolean) { function freezeState() { Object.freeze(STATE); } const chosen = flag ? Object.freeze : runIt; return chosen(freezeState); }
function viaDefault(chosen: <T>(value: T) => T = Object.freeze) { return chosen(STATE); }
function viaDefaultChoice(chosen = Math.PI > 3 ? Object.freeze : keep) { return chosen(STATE); }
function viaDestructuredDefault({ chosen = Object.freeze }: { chosen?: <T>(value: T) => T } = {}) { return chosen(STATE); }
function viaAssignedCallee() { let chosen: (value: object) => object; return (chosen = lockAny)({ a: 1 }); }
function apply(f: (value: object) => object) { const g = f; return g(STATE); }
let lockPure: <T>(value: T) => T = Object.freeze;
export function setLockPure(next: <T>(value: T) => T) { lockPure = next; }
function viaAssignedPure() { return lockPure({ a: 1 }); }
function viaDefaultNew(chosen: <T>(value: T) => T = Object.freeze) { return chosen({ a: 1 }); }
function viaDestructuredNew({ chosen = Object.freeze }: { chosen?: <T>(value: T) => T } = {}) { return chosen({ a: 1 }); }
function viaLetObject() { let { freeze } = Object; return freeze(STATE); }
function viaLetObjectAssigned(flag: boolean) { let { freeze: lock }: { freeze: (value: object) => object } = Object; if (flag) lock = lockAny; return lock({ a: 1 }); }
function viaLocalKeep(flag: boolean) { const lock = flag ? Object.freeze : keep; return lock({ a: 1 }); }
function viaLetKeep(flag: boolean) { let lock = flag ? Object.freeze : keep; return lock({ a: 1 }); }
function viaKeepCallback(flag: boolean) { return (flag ? Object.freeze : keep)(() => { Object.freeze(STATE); }); }
function viaOwnFreezeNew() { const { freeze } = Object; return freeze({ a: 1 }); }
function viaObjectKeys() { const { keys } = Object; return keys(STATE); }
function viaLocalObject() { const Object = { freeze: <T>(value: T): T => value }; const { freeze } = Object; return freeze(STATE); }
function viaAssignedChain() { let first: (value: object) => object; let second: (value: object) => object; return (first = (second = lockAny))({ a: 1 }); }
function applyWrapped(f: (value: object) => object) { const g = (f); return g(STATE); }
export const ASSIGNED_MODULE = /*#__PURE__*/ viaAssignedModule();
export const ASSIGNED_LOCAL = /*#__PURE__*/ viaAssignedLocal(false);
export const RUNNER = /*#__PURE__*/ viaRunner(false);
export const RUNNER_NAME = /*#__PURE__*/ viaRunnerName(false);
export const DEFAULT = /*#__PURE__*/ viaDefault();
export const DEFAULT_CHOICE = /*#__PURE__*/ viaDefaultChoice();
export const DESTRUCTURED_DEFAULT = /*#__PURE__*/ viaDestructuredDefault();
export const ASSIGNED_CALLEE = /*#__PURE__*/ viaAssignedCallee();
export const ALIASED_PARAMETER = /*#__PURE__*/ apply(Object.freeze);
export const ASSIGNED_PURE = /*#__PURE__*/ viaAssignedPure();
export const DEFAULT_NEW = /*#__PURE__*/ viaDefaultNew();
export const DESTRUCTURED_NEW = /*#__PURE__*/ viaDestructuredNew();
export const LET_OBJECT = /*#__PURE__*/ viaLetObject();
export const LET_OBJECT_ASSIGNED = /*#__PURE__*/ viaLetObjectAssigned(true);
export const LOCAL_KEEP = /*#__PURE__*/ viaLocalKeep(true);
export const LET_KEEP = /*#__PURE__*/ viaLetKeep(true);
export const KEEP_CALLBACK = /*#__PURE__*/ viaKeepCallback(false);
export const OWN_FREEZE_NEW = /*#__PURE__*/ viaOwnFreezeNew();
export const OBJECT_KEYS = /*#__PURE__*/ viaObjectKeys();
export const LOCAL_OBJECT = /*#__PURE__*/ viaLocalObject();
export const ASSIGNED_CHAIN = /*#__PURE__*/ viaAssignedChain();
export const WRAPPED_ALIAS = /*#__PURE__*/ applyWrapped(Object.freeze);
`)).toEqual([
      "33 ASSIGNED_MODULE: a mark on a call that may freeze a value that exists before it: viaAssignedModule()",
      "34 ASSIGNED_LOCAL: a mark on a call that may freeze a value that exists before it: viaAssignedLocal(false)",
      "35 RUNNER: a mark on a call that may freeze a value that exists before it: viaRunner(false)",
      "36 RUNNER_NAME: a mark on a call that may freeze a value that exists before it: viaRunnerName(false)",
      "37 DEFAULT: a mark on a call that may freeze a value that exists before it: viaDefault()",
      "38 DEFAULT_CHOICE: a mark on a call that may freeze a value that exists before it: viaDefaultChoice()",
      "39 DESTRUCTURED_DEFAULT: a mark on a call that may freeze a value that exists before it: viaDestructuredDefault()",
      "40 ASSIGNED_CALLEE: a mark on a call that may freeze a value that exists before it: viaAssignedCallee()",
      "41 ALIASED_PARAMETER: a property read: Object.freeze",
      "41 ALIASED_PARAMETER: a mark on a call that may freeze a value that exists before it: apply(Object.freeze)",
      "42 ASSIGNED_PURE: a mark on a call that may freeze a value that exists before it: viaAssignedPure()",
      "43 DEFAULT_NEW: a mark on a call that may freeze a value that exists before it: viaDefaultNew()",
      "44 DESTRUCTURED_NEW: a mark on a call that may freeze a value that exists before it: viaDestructuredNew()",
      "45 LET_OBJECT: a mark on a call that may freeze a value that exists before it: viaLetObject()",
      "46 LET_OBJECT_ASSIGNED: a mark on a call that may freeze a value that exists before it: viaLetObjectAssigned(true)",
      "53 ASSIGNED_CHAIN: a mark on a call that may freeze a value that exists before it: viaAssignedChain()",
      "54 WRAPPED_ALIAS: a property read: Object.freeze",
      "54 WRAPPED_ALIAS: a mark on a call that may freeze a value that exists before it: applyWrapped(Object.freeze)"
    ]);
    expect(atLines(`
let list: () => readonly string[];
function makeList() { return Object.freeze(["five"]); }
function make(chosen: <T>(value: T) => T = Object.freeze) { return chosen(["six"]); }
export const HELD_BLOCK = class { static held: readonly string[]; static { this.held = Object.freeze(["four"]); } };
export const LISTED = (list = makeList)();
export const DEFAULTED = make();
`)).toEqual([
      "5 HELD_BLOCK: a static block: static { this.held = Object.freeze([\"four\"]); }",
      "6 LISTED: unmarked: (list = makeList)()",
      "6 LISTED: the operator =: list = makeList",
      "7 DEFAULTED: a call that may freeze a value that exists before it: make()"
    ]);
    // VAR_TWICE's and VAR_LOOPED's names are given a value by a `var` twice, or declared in a loop's head, so they may
    // hold anything when they are called. VAR_ONCE's, VAR_KEPT's, VAR_BLOCK's and VAR_SPACED's are given one,
    // Object.freeze: VAR_ONCE's second `var` gives it none, and the others' second declarations are another function's,
    // a block's and a namespace's own names. IN_PLACE's, GIVEN's and DECORATED_ASSIGNED's functions call their
    // parameter through what `=` assigns, and MADE_IN_PLACE's makes a table through it.
    expect(atLines(`
const STATE = { a: 1 };
function deepFreeze<T>(value: T): T { if (typeof value === "object" && value !== null) for (const inner of Object.values(value)) deepFreeze(inner); return Object.freeze(value); }
function runWith(callback: (value: object) => object): object { return callback(STATE); }
function lockState(value: any, context: unknown): any { Object.freeze(STATE); return value; }
var ran: <T>(value: T) => T = function <T>(callback: T): T { if (typeof callback === "function") callback(); return callback; };
export const VAR_TWICE = /*#__PURE__*/ ran(() => { Object.freeze(STATE); });
var ran: <T>(value: T) => T = Object.freeze;
var looped: <T>(value: T) => T = Object.freeze;
for (var looped of [deepFreeze]);
export const VAR_LOOPED = /*#__PURE__*/ looped({ inner: STATE });
var once: <T>(value: T) => T = Object.freeze;
var once: <T>(value: T) => T;
export const VAR_ONCE = /*#__PURE__*/ once({ a: 1 });
var kept: <T>(value: T) => T = Object.freeze;
function shadow() { var kept = 1; return kept; }
export const VAR_KEPT = /*#__PURE__*/ kept({ a: 1 });
var single: <T>(value: T) => T = Object.freeze;
{ const single = 1; void single; }
export const VAR_BLOCK = /*#__PURE__*/ single({ a: 1 });
var spaced: <T>(value: T) => T = Object.freeze;
namespace Inner { export var spaced = 1; }
export const VAR_SPACED = /*#__PURE__*/ spaced({ a: 1 });
function applyInPlace(f: (value: object) => object) { let x: () => object; return (x = () => f(STATE))(); }
function applyGiven(f: (value: object) => object) { let x: (value: object) => object; return runWith((x = f)); }
function decorateAssigned(decorate: (value: any, context: any) => any) { let x: any; @(x = decorate) class Held {} return Held; }
function makeInPlace() { let x: () => readonly string[]; return (x = () => Object.freeze(["seven"]))(); }
export const IN_PLACE = /*#__PURE__*/ applyInPlace(Object.freeze);
export const GIVEN = /*#__PURE__*/ applyGiven(Object.freeze);
export const DECORATED_ASSIGNED = /*#__PURE__*/ decorateAssigned(lockState);
export const MADE_IN_PLACE = makeInPlace();
`)).toEqual([
      "7 VAR_TWICE: a mark on a freeze of a value that may exist before it: ran(() => { Object.freeze(STATE); })",
      "11 VAR_LOOPED: a mark on a freeze of a value that may exist before it: looped({ inner: STATE })",
      "28 IN_PLACE: a property read: Object.freeze",
      "28 IN_PLACE: a mark on a call that may freeze a value that exists before it: applyInPlace(Object.freeze)",
      "29 GIVEN: a property read: Object.freeze",
      "29 GIVEN: a mark on a call that may freeze a value that exists before it: applyGiven(Object.freeze)",
      "30 DECORATED_ASSIGNED: a mark on a call that may freeze a value that exists before it: decorateAssigned(lockState)",
      "31 MADE_IN_PLACE: unmarked: makeInPlace()"
    ]);
  });

  it("takes a function's name that a `var` of it may replace, or an assignment does, and a module's own `undefined`, for values that may exist before the call", () => {
    // TypeScript refuses all of these. DECLARED's function is made where it is declared. UNSET_VAR's and LOOP_VAR's
    // calls read the function, which a `var` given no value, or never given one, leaves in place. A `var` of a
    // function's name at the top of a module is an error in a module. CYCLE's and LOOPED's names are bound to each
    // other. The check takes CYCLE's for one that may be Object.freeze and refuses its mark, though its call freezes
    // nothing: given true it throws first, and given false it calls keepIt. LOOPED's mark freezes only what is made
    // where it is written. FREEZE_AND's callee, `Object.freeze && lockState`, is lockState. COMMA_DECORATOR's decorator
    // is its parameter, and TWICE's call runs the second of its function's two declarations of lock. ALIAS_CYCLE's g
    // and h are bound to each other, so its call throws before it calls f; the check takes f, Object.freeze, to be
    // called with STATE. COMMA_CALL's and COMMA_ARGUMENT's f is called through a comma: with `call`, and by runWith;
    // LEFT_OF_COMMA's function written in place is not called, but keepIt.
    expect(atLines(`
const STATE = { a: 1 };
const undefined = { a: 1 };
function lockIt(value) { return Object.freeze(value); }
function viaVar() { var held = STATE; function held() {} return Object.freeze(held); }
function viaReassigned() { function held() {} held = STATE; return Object.freeze(held); }
function viaDeclared() { function held() {} return Object.freeze(held); }
function viaUnsetVar() { var lock; function lock(value) { return Object.freeze(value); } return lock(STATE); }
function viaLoopVar() { for (var lock of []) void lock; function lock(value) { return Object.freeze(value); } return lock(STATE); }
function viaUndefined() { return Object.freeze(undefined); }
function keepIt(value) { return value; }
function lockState(value) { Object.freeze(STATE); return value; }
function viaFreezeAnd() { return (Object.freeze && lockState)({ a: 1 }); }
function viaCommaDecorator(decorate) { @(0, decorate) class Held {} return Held; }
function viaTwice() { function lock(value) { return value; } function lock(value) { return Object.freeze(value); } return lock(STATE); }
function viaCycle(flag) { const a = flag ? b : Object.freeze; const b = flag ? a : keepIt; return b(STATE); }
function viaAliasCycle(f) { const g = h; const h = g; g(STATE); return f(STATE); }
function runWith(callback) { return callback(STATE); }
function viaCommaCall(f) { return (0, f).call(null, STATE); }
function viaAssignedCall(f) { let x; return (x = f).call(null, STATE); }
function viaLeftOfComma() { return ((() => Object.freeze(STATE)), keepIt)({ a: 1 }); }
function viaCommaArgument(f) { return runWith((0, f)); }
const LOOP_A = false ? LOOP_B : Object.freeze;
const LOOP_B = false ? LOOP_A : keepIt;
export const VAR = /*#__PURE__*/ viaVar();
export const REASSIGNED = /*#__PURE__*/ viaReassigned();
export const DECLARED = /*#__PURE__*/ viaDeclared();
export const UNSET_VAR = /*#__PURE__*/ viaUnsetVar();
export const LOOP_VAR = /*#__PURE__*/ viaLoopVar();
export const UNDEFINED = /*#__PURE__*/ viaUndefined();
export const FREEZE_AND = /*#__PURE__*/ viaFreezeAnd();
export const COMMA_DECORATOR = /*#__PURE__*/ viaCommaDecorator(lockState);
export const TWICE = /*#__PURE__*/ viaTwice();
export const CYCLE = /*#__PURE__*/ viaCycle(true);
export const LOOPED = /*#__PURE__*/ LOOP_B(["x"]);
export const ALIAS_CYCLE = /*#__PURE__*/ viaAliasCycle(Object.freeze);
export const COMMA_CALL = /*#__PURE__*/ viaCommaCall(Object.freeze);
export const COMMA_ARGUMENT = /*#__PURE__*/ viaCommaArgument(Object.freeze);
export const ASSIGNED_CALL = /*#__PURE__*/ viaAssignedCall(Object.freeze);
export const LEFT_OF_COMMA = /*#__PURE__*/ viaLeftOfComma();
`, { fileName: "module.js" })).toEqual([
      "25 VAR: a mark on a call that may freeze a value that exists before it: viaVar()",
      "26 REASSIGNED: a mark on a call that may freeze a value that exists before it: viaReassigned()",
      "28 UNSET_VAR: a mark on a call that may freeze a value that exists before it: viaUnsetVar()",
      "29 LOOP_VAR: a mark on a call that may freeze a value that exists before it: viaLoopVar()",
      "30 UNDEFINED: a mark on a call that may freeze a value that exists before it: viaUndefined()",
      "31 FREEZE_AND: a mark on a call that may freeze a value that exists before it: viaFreezeAnd()",
      "32 COMMA_DECORATOR: a mark on a call that may freeze a value that exists before it: viaCommaDecorator(lockState)",
      "33 TWICE: a mark on a call that may freeze a value that exists before it: viaTwice()",
      "34 CYCLE: a mark on a call that may freeze a value that exists before it: viaCycle(true)",
      "36 ALIAS_CYCLE: a property read: Object.freeze",
      "36 ALIAS_CYCLE: a mark on a call that may freeze a value that exists before it: viaAliasCycle(Object.freeze)",
      "37 COMMA_CALL: a property read: Object.freeze",
      "37 COMMA_CALL: a mark on a call that may freeze a value that exists before it: viaCommaCall(Object.freeze)",
      "38 COMMA_ARGUMENT: a property read: Object.freeze",
      "38 COMMA_ARGUMENT: a mark on a call that may freeze a value that exists before it: viaCommaArgument(Object.freeze)",
      "39 ASSIGNED_CALL: a property read: Object.freeze",
      "39 ASSIGNED_CALL: a mark on a call that may freeze a value that exists before it: viaAssignedCall(Object.freeze)"
    ]);
  });

  it("reads a ring and a long chain of functions in a time that grows slowly with their length", () => {
    // 44dea9e took about 8 s on the ring and 6 s on the chain: it asked of every argument of a call whether the call runs
    // it, and each answer followed the chain again. The time is measured, since vitest cannot stop a test that does not
    // yield before its timeout.
    const ring = `const STATE = { a: 1 };\nfunction host() {\n${[...Array(80).keys()].map((i) =>
      `  const l${i} = (v: object, k: number): object => (k ? l${(i + 1) % 80}(v, k - 1) : Object.freeze(v));`).join("\n")}\n  return l0({ a: 1 }, 3);\n}\nexport const T = /*#__PURE__*/ host();\n`;
    const chain = `const STATE = { a: 1 };\nfunction host() {\n${[...Array(200).keys()].map((i) =>
      `  const l${i} = (v: object): object => l${i + 1}(v);`).join("\n")}\n  const l200 = (v: object) => Object.freeze(v);\n  return l0({ a: 1 });\n}\nexport const T = /*#__PURE__*/ host();\n`;
    // Asked of each function of this chain whether it calls its destructured first parameter, the check answers at once.
    const destructured = `${[...Array(100).keys()].map((i) => `function f${i}({ k }: any, v: object): object { return f${i + 1}((x: object) => x, v); }`).join("\n")}\nfunction f100({ k }: any, v: object): object { return Object.freeze(v); }\nexport const T = /*#__PURE__*/ f0((x: object) => x, { a: 1 });\n`;
    const started = performance.now();
    expect(found(ring)).toEqual([]);
    expect(found(chain)).toEqual([]);
    expect(found(destructured)).toEqual([]);
    expect(performance.now() - started).toBeLessThan(2000);
  });

  it("takes for a table what a function given by name, a const bound to one, a tagged template, a parameter's default or a generator makes", () => {
    // HIDDEN calls a local, not the module's makeOne; RELAYED never calls its callback; KEPT_ONLY's keep returns the
    // function it is given; forEach's second argument does not run. A generator's body is taken to run where it is
    // called, since what calls it may run it: LAZY's and GENERATORS' do not run here. CHAIN's chainC is asked while
    // chainA's answer is pending.
    expect(atLines(`
function makeOne() { return Object.freeze(["one"]); }
function buildFrom(make: () => unknown) { return make(); }
function viaLocalByName() { const one = () => Object.freeze(["two"]); return [1].map(one); }
const makeAlias = makeOne;
function first(f: () => unknown, n: number): unknown { if (n > 0) second(f, n - 1); return f(); }
function second(g: () => unknown, n: number): unknown { return first(g, n); }
function viaMemo() { first(() => 0, 1); return second(() => Object.freeze(["three"]), 0); }
function rows(strings: TemplateStringsArray) { return Object.freeze(strings.raw[0].split("|")); }
function withDefault(make = () => Object.freeze(["four"])) { return make(); }
function* lazily() { yield Object.freeze(["five"]); }
function chainA(f: () => unknown, n: number): unknown { if (n > 0) chainC(f); return f(); }
function chainC(h: () => unknown): unknown { return chainB(h, 0); }
function chainB(g: () => unknown, n: number): unknown { return chainA(g, n); }
function makeChain() { chainA(() => 0, 1); return chainC(() => Object.freeze(["eleven"])); }
function keep(f: () => unknown) { return f; }
function viaKept() { const one = () => Object.freeze(["twelve"]); return keep(one); }
function hiddenMaker() { const makeOne = () => 1; return makeOne(); }
function callThrough(f: () => unknown) { const go = () => f(); return [1].map(go); }
function relay(f: () => unknown, n: number): unknown { return n ? relay(f, n - 1) : 0; }
export const BY_NAME = [1].map(makeOne);
export const GIVEN_BY_NAME = buildFrom(makeOne);
export const LOCAL_BY_NAME = viaLocalByName();
export const ALIASED = makeAlias();
export const MEMO = viaMemo();
export const TAGGED = rows\`a|b\`;
export const DEFAULTED = withDefault();
export const LAZY = lazily();
export const COMMA = (0, () => Object.freeze(["six"]))();
export const FROZEN_BY_NAME = [{}].map(Object.freeze);
export const HIDDEN = hiddenMaker();
export const THROUGH = callThrough(() => Object.freeze(["seven"]));
export const RELAYED = relay(() => Object.freeze(["eight"]), 2);
export const GENERATORS = [1].map(function* () { yield Object.freeze(["nine"]); });
export const THIS_ARGUMENT = [1].forEach(() => 0, () => Object.freeze(["ten"]));
export const CHAIN = makeChain();
export const KEPT_ONLY = viaKept();
`)).toEqual([
      "21 BY_NAME: unmarked: [1].map(makeOne)",
      "22 GIVEN_BY_NAME: unmarked: buildFrom(makeOne)",
      "23 LOCAL_BY_NAME: unmarked: viaLocalByName()",
      "24 ALIASED: unmarked: makeAlias()",
      "25 MEMO: unmarked: viaMemo()",
      "26 TAGGED: a tagged template: rows`a|b`",
      "27 DEFAULTED: unmarked: withDefault()",
      "28 LAZY: unmarked: lazily()",
      "29 COMMA: unmarked: (0, () => Object.freeze([\"six\"]))()",
      "29 COMMA: the operator ,: 0, () => Object.freeze([\"six\"])",
      "30 FROZEN_BY_NAME: unmarked: [{}].map(Object.freeze)",
      "30 FROZEN_BY_NAME: a property read: Object.freeze",
      "32 THROUGH: unmarked: callThrough(() => Object.freeze([\"seven\"]))",
      "34 GENERATORS: unmarked: [1].map(function* () { yield Object.freeze([\"nine\"]); })",
      "36 CHAIN: unmarked: makeChain()"
    ]);
  });

  it("reads a name only where no local of that name hides it, as each scope declares its names", () => {
    expect(found(`
const T = /*#__PURE__*/ Object.freeze({ from: 1 });
function mixinOf(base: unknown) { return class {}; }
function tag<V>(value: V, context: unknown) { return value; }
try { void 0; } catch (T) { console.log(T); }
for (const T of [1]) console.log(T);
for (let T = 0; T < 1; T += 1) console.log(T);
for (const [T] of [[1]]) console.log(T);
for (const { T } of [{ T: 1 }]) console.log(T);
T: for (;;) { if (Math.random()) continue T; break T; }
function pick(x: number) { switch (x) { case 1: const T = x; return T; default: return 0; } }
export const PICKED = pick(1);
export enum Members { T = 1, U = T * 2 }
export enum Quoted { "T" = 1, U = T * 2 }
export enum Computed { ["T"] = 1, U = T * 2 }
export enum Templated { [\`T\`] = 1, U = T * 2 }
// TypeScript reads T in a computed name it refuses, and binds no member by it.
export enum ComputedName { [T] = 1 }
export class Methods { static made = Array.of(1); T() { return 1; } }
export class Impl implements T { static made = Array.of(1); }
export class FromTable extends mixinOf(T) {}
@tag export class Tagged { read() { return T; } }
export class Logged { @tag read() { return T; } }
export class Parameters { constructor(@tag value: unknown) { void T; } }
const meta = /*#__PURE__*/ Object.freeze([1]);
console.log(import.meta.url);
var VT = /*#__PURE__*/ Object.freeze(["v"]);
{ var VT: readonly string[]; console.log(VT); }
{ { var VT: readonly string[]; } console.log(VT); }
for (var VT: readonly string[]; ;) { console.log(VT); break; }
for (var VT in { k: 1 }) { console.log(VT); }
function chosen(x: number) { switch (x) { case 1: function T() { return 1; } return T(); default: return 0; } }
export const CHOSEN = chosen(1);
export default class { static made = Array.of(1); read() { return T; } }
`)).toEqual([
      "(no table): a statement that reads T when its module loads: export enum ComputedName { [T] = 1 }",
      "FromTable: a class its module keeps, which reads T",
      "Tagged: a class its module keeps, which reads T",
      "Logged: a class its module keeps, which reads T",
      "Parameters: a class its module keeps, which reads T",
      // A var in a block is the module's own, the table.
      "(no table): a statement that reads VT when its module loads: { var VT: readonly string[]; console.log(VT); }",
      "(no table): a statement that reads VT when its module loads: { { var VT: readonly string[]; } console.log(VT); }",
      "(no table): a statement that reads VT when its module loads: for (var VT: readonly string[]; ;) { console.log(VT); break; }",
      "(no table): a statement that reads VT when its module loads: for (var VT in { k: 1 }) { console.log(VT); }",
      "default: a class its module keeps, which reads T"
    ]);
  });

  it("does not read calls in function bodies, or declarations that build no table", () => {
    expect(found(`
export const BUILT = /*#__PURE__*/ Object.freeze(/*#__PURE__*/ [1, 2].map((value) => Object.freeze({ value })));
export function make(value: number) {
  const row = Object.freeze({ value });
  return Object.freeze([row]);
}
export const later = () => Object.freeze({ at: Date.now() });
export const DEG = Math.PI / 180;
export class Table { rows = Object.freeze([1]); read() { return Object.freeze([2]); } }
`)).toEqual([]);
  });

  it("names a freeze when its module loads outside a declaration", () => {
    const code = [
      "const TABLE = [1, 2];",
      "Object.freeze(TABLE);",
      "if (TABLE.length) Object.freeze(TABLE);",
      "export class Rows { static all = Object.freeze([1]); }",
      "export class Later { all = Object.freeze([1]); }",
      "export class Block { static { Object.freeze(TABLE); } }",
      "TABLE.forEach((value) => Object.freeze([value]));",
      "export const register = () => Object.freeze(TABLE);",
      "if (TABLE.length) { const freezeIt = () => Object.freeze(TABLE); freezeIt(); }",
      "export namespace Frozen { export const rows = Object.freeze([1]); }",
      "declare namespace Ambient { const rows: readonly number[]; }"
    ].join("\n");
    expect(atLines(code)).toEqual([
      "2 (no table): a freeze when its module loads, outside a declaration: Object.freeze(TABLE);",
      "3 (no table): a freeze when its module loads, outside a declaration: if (TABLE.length) Object.freeze(TABLE);",
      "4 Rows: a freeze when its module loads, outside a declaration: Object.freeze([1])",
      "6 Block: a freeze when its module loads, outside a declaration: { Object.freeze(TABLE); }",
      "7 (no table): a freeze when its module loads, outside a declaration: TABLE.forEach((value) => Object.freeze([value]));",
      "9 (no table): a freeze when its module loads, outside a declaration: if (TABLE.length) { const freezeIt = () => Object.freeze(TABLE); freezeIt(); }",
      "10 (no table): a freeze when its module loads, outside a declaration: export namespace Frozen { export const rows = Object.freeze([1]); }"
    ]);
  });

  it("holds what reads a table, its module's or an import, to the same rule", () => {
    const code = `
import { REMOTE, other, REMOTE as RENAMED } from "./remote.js";
import type { REMOTE as TYPED } from "./remote.js";
import { type REMOTE as TYPED_TOO } from "./remote.js";
import REMOTE_DEFAULT from "./remote-default.js";
import * as REMOTE_ALL from "./remote-all.js";
const T = /*#__PURE__*/ Object.freeze({ from: 1, list: [1] });
const KEY_NAME = "k";
const FROM = T.from * 2;
const ALIAS = T;
const VIA_ALIAS = ALIAS.from;
const READER = () => T.from;
const LATER = READER();
const MARKED = /*#__PURE__*/ READER();
const PLACED = /*#__PURE__*/ (() => T.from)();
const REMOTE_COUNT = REMOTE.length;
const RENAMED_COUNT = RENAMED.length;
const TYPED_COUNT = TYPED.length + TYPED_TOO.length;
const DEFAULT_COUNT = REMOTE_DEFAULT.length;
const ALL_COUNT = REMOTE_ALL.length;
const OTHER_COUNT = other.length;
const UNRELATED = 1 + 2;
function register(read: (table: object) => number) { return read; }
export const id = register((T) => T.from);
const hidden = () => { const T = 1; return T; };
export const HIDDEN = hidden();
const blocky = () => { { const T = 1; void T; } return T; };
export const BLOCKY = blocky();
export const CHAIN = first();
function first() { return second(); }
function second() { return T; }
console.log(T);
Object.freeze(T);
export class Uses { static first = T.list[0]; }
export class Fine { read() { return T; } }
export class OnlyBlock { static { OnlyBlock.size = 1; } read() { return T; } }
export class OnlyCall { static made = Array.of(1); read() { return T; } }
export class EmptyBlock { static {} read() { return T; } }
export class Computed { [KEY_NAME]() { return T; } }
export class Literal { ["k"]() { return T; } }
export class Extended extends register(() => 1) { read() { return T; } }
declare class Ambient { static [T.from]: number; }
console.log({ T: 1 });
function pick({ T: picked }: { T: number }) { return picked; }
console.log(pick);
const hoisted = () => { if (UNRELATED) { var T = 1; } return T; };
export const HOISTED = hoisted();
{ const T = 1; console.log(T); }
function shadowed(read = T) { const T = 1; return [read, T]; }
export const SHADOWED = shadowed();
function shadowedVar(read = T) { var T = 1; return [read, T]; }
export const SHADOWED_VAR = shadowedVar();
const outer = () => { const inner = () => { var T = 1; return T; }; return [inner, T]; };
export const OUTER = outer();
export class StaticVar { static { if (UNRELATED) { var T = 1; } StaticVar.size = T; } }
export namespace Hoisting { if (UNRELATED) { var T = 1; } export const size = T; }
export namespace Outer { export namespace Inner { var T = 1; } export const size = T; }
const blockFunction = () => { if (UNRELATED) { function T() { return 1; } return T(); } return 0; };
export const BLOCK_FUNCTION = blockFunction();
{ class T {} console.log(T); }
const enumerated = () => { enum T { A } return T.A; };
export const ENUMERATED = enumerated();
export namespace Holder { export namespace T { export const a = 1; } export const first = T.a; }
const named = function T() { return T; };
export const NAMED = named();
const typed = () => { interface T { a: number } return 1; };
export const TYPED_LOCAL = typed();
const aliasedType = () => { type T = number; return 1; };
export const ALIASED_LOCAL = aliasedType();
export enum Sized { A = T.from }
`;
    const importsTable = (specifier, name) =>
      (specifier === "./remote.js" && name === "REMOTE") || (specifier === "./remote-default.js" && name === "default") ||
      (specifier === "./remote-all.js" && name === "*");
    expect(found(code, { importsTable })).toEqual([
      "FROM, which reads T: the operator *: T.from * 2",
      "FROM, which reads T: a property read: T.from",
      "VIA_ALIAS, which reads ALIAS (T): a property read: ALIAS.from",
      "LATER, which reads READER (T): unmarked: READER()",
      "REMOTE_COUNT, which reads REMOTE: a property read: REMOTE.length",
      "RENAMED_COUNT, which reads RENAMED (REMOTE): a property read: RENAMED.length",
      "DEFAULT_COUNT, which reads REMOTE_DEFAULT (default): a property read: REMOTE_DEFAULT.length",
      "ALL_COUNT, which reads REMOTE_ALL (*): a property read: REMOTE_ALL.length",
      "BLOCKY, which reads blocky (T): unmarked: blocky()",
      "CHAIN, which reads first (T): unmarked: first()",
      "(no table): a statement that reads T when its module loads: console.log(T);",
      "(no table): a freeze when its module loads, outside a declaration: Object.freeze(T);",
      "Uses: a class its module keeps, which reads T",
      "OnlyBlock: a class its module keeps, which reads T",
      "OnlyCall: a class its module keeps, which reads T",
      "Computed: a class its module keeps, which reads T",
      "Extended: a class its module keeps, which reads T",
      "SHADOWED, which reads shadowed (T): unmarked: shadowed()",
      "SHADOWED_VAR, which reads shadowedVar (T): unmarked: shadowedVar()",
      "OUTER, which reads outer (T): unmarked: outer()",
      "(no table): a statement that reads T when its module loads: export namespace Outer { export namespace Inner { var T = 1; } export const size",
      "(no table): a statement that reads T when its module loads: export enum Sized { A = T.from }"
    ]);
  });

  it("reads ES modules only: `export =` is no table", () => {
    expect(found("export = Object.freeze([1]);\n")).toEqual([]);
    expect(tables("export = Object.freeze([1]);\n")).toEqual([]);
  });

  it("leaves out the tables and readers of an exempt module, but not its misplaced marks", () => {
    const code = "const T = Object.freeze([1]);\nconst N = T.length;\n/*#__PURE__*/ Object.freeze(T);\nexport const frozen = (row: object) => /*#__PURE__*/ Object.freeze(row);\n";
    expect(found(code, { exempt: () => true })).toEqual([
      "(no table): a mark on a discarded value: Object.freeze(T)",
      "(no table): a mark on a freeze of a value that may exist before it: Object.freeze(row)"
    ]);
  });

  it("names a mark on a call whose value is discarded, or on a freeze of a value that may exist before it", () => {
    expect(found(`
const TABLE = [1, 2];
const ok = TABLE.length > 0;
const { freeze } = Object;
class Holder { constructor(readonly row: object) {} }
/*#__PURE__*/ Object.freeze(TABLE);
export function f(row: object, use: (value: unknown) => void, rows: object[]) {
  /*#__PURE__*/ Object.freeze(row);
  void /*#__PURE__*/ g(row);
  (/*#__PURE__*/ g(row)) as unknown;
  ok && /*#__PURE__*/ g(row);
  ok || /*#__PURE__*/ g(row);
  ok ?? /*#__PURE__*/ g(row);
  ok ? /*#__PURE__*/ g(row) : null;
  (/*#__PURE__*/ g(row)) ? 1 : 2;
  /*#__PURE__*/ g(row) && 0;
  (0, /*#__PURE__*/ g(row));
  !/*#__PURE__*/ g(row);
  typeof /*#__PURE__*/ g(row);
  [/*#__PURE__*/ g(row)];
  ({ a: /*#__PURE__*/ g(row) });
  /*#__PURE__*/ g(row) === row;
  \`\${/*#__PURE__*/ g(row)}\`;
  /*#__PURE__*/ new Holder(row);
  for (/*#__PURE__*/ g(row); ;) break;
  for (let i = 0; i < 1; i += 1, /*#__PURE__*/ g(row));
  const kept = ok && /*#__PURE__*/ g(row);
  const last = (row, /*#__PURE__*/ g(row));
  const unused = /*#__PURE__*/ Object.freeze(row);
  const aliased = /*#__PURE__*/ freeze(row);
  const fresh = [/*#__PURE__*/ Object.freeze(new Holder(row)), /*#__PURE__*/ Object.freeze(() => row), /*#__PURE__*/ Object.freeze(class {}),
    /*#__PURE__*/ Object.freeze("x"), /*#__PURE__*/ Object.freeze(rows.map((each) => each)), /*#__PURE__*/ g({ a: [1] })];
  [.../*#__PURE__*/ g(row)];
  ({ .../*#__PURE__*/ g(row) });
  ({ [/*#__PURE__*/ g(row)]: 1 });
  ({ [/*#__PURE__*/ g(row)]() { return 1; } });
  ({ get [/*#__PURE__*/ g(row)]() { return 1; }, set [/*#__PURE__*/ g(row)](value: number) { void value; } });
  const nothing = /*#__PURE__*/ Object.freeze();
  const held = /*#__PURE__*/ g([row]);
  use(/*#__PURE__*/ g(row));
  (row as { x?: unknown }).x = /*#__PURE__*/ g(row);
  return [kept, last, aliased, fresh, held, nothing, ok ? /*#__PURE__*/ g(row) : null, (/*#__PURE__*/ g(row), row), /*#__PURE__*/ Object.freeze({ row })];
}
export function g(row: object) { return /*#__PURE__*/ Object.freeze(row); }
`)).toEqual([
      "(no table): a freeze when its module loads, outside a declaration: Object.freeze(TABLE);",
      "(no table): a mark on a discarded value: Object.freeze(TABLE)",
      "(no table): a mark on a discarded value: Object.freeze(row)",
      ...Array(15).fill("(no table): a mark on a discarded value: g(row)"),
      "(no table): a mark on a discarded value: new Holder(row)",
      "(no table): a mark on a discarded value: g(row)",
      "(no table): a mark on a discarded value: g(row)",
      // g freezes what it is passed: a bundler that drops a marked g(row) whose value is used leaves row unfrozen too.
      "(no table): a mark on a call that may freeze a value that exists before it: g(row)",
      "(no table): a mark on a call that may freeze a value that exists before it: g(row)",
      "(no table): a mark on a freeze of a value that may exist before it: Object.freeze(row)",
      "(no table): a mark on a freeze of a value that may exist before it: freeze(row)",
      ...Array(6).fill("(no table): a mark on a discarded value: g(row)"),
      "(no table): a mark on a call that may freeze a value that exists before it: g([row])",
      ...Array(3).fill("(no table): a mark on a call that may freeze a value that exists before it: g(row)"),
      "(no table): a mark on a discarded value: g(row)",
      "(no table): a mark on a freeze of a value that may exist before it: Object.freeze(row)"
    ]);
  });
});

describe("tables", () => {
  it("lists the tables the rule finds, with their modules and lines", () => {
    const code = "// src/a.ts\nvar A = Object.freeze([1]);\nvar NOT = [1];\n// src/b.ts\nvar B = /* @__PURE__ */ new Set([1]);\n";
    const module = (position) => (position < code.indexOf("// src/b.ts") ? "src/a.ts" : "src/b.ts");
    expect(tables(code, { fileName: "chunk.js", module }).map(({ module: name, line, name: table }) => `${name}:${line} ${table}`))
      .toEqual(["src/a.ts:2 A", "src/b.ts:5 B"]);
  });
});

describe("checkBuild", () => {
  it("reads a built file's modules from esbuild's comments, leaves out UNMARKED_SOURCE's, and follows tables across files", () => {
    const files = {
      "dist/chunk-A.js": [
        'import { x } from "./chunk-B.js";',
        "var BEFORE = Object.freeze([\"own\"]);",
        "",
        "// src/signs.ts",
        "var ELEMENTS = Object.freeze([\"fire\", \"earth\"]);",
        "var SLUGS = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ [\"aries\"].map((slug) => slug));",
        "function make() { return Object.freeze({}); }",
        "",
        "// src/vedic/dasha.ts",
        "var DASHA_LEVELS = Object.freeze([\"maha\"]);",
        "var POLICY = make();",
        "/* @__PURE__ */ Object.freeze(DASHA_LEVELS);",
        "// a note, not a module",
        "var DASHA_EXTRA = Object.freeze([\"antar\"]);",
        "",
        "// src/houses.ts",
        "var SYSTEMS = Object.freeze([\"whole\"]);",
        "var MADE = make();",
        "export { BEFORE, ELEMENTS, SLUGS as SIGN_SLUGS, DASHA_LEVELS, POLICY, SYSTEMS, MADE };",
        ""
      ].join("\n"),
      "dist/index.js": [
        'import { SIGN_SLUGS } from "./chunk-A.js";',
        'import * as engine from "./chunk-A.js";',
        "",
        "// src/index.ts",
        "var COUNT = SIGN_SLUGS.length;",
        "var FIRST = engine.SIGN_SLUGS[0];",
        "export { COUNT, FIRST };",
        'export * as all from "./chunk-A.js";',
        ""
      ].join("\n"),
      "dist/normalized.js": [
        'import { SIGN_SLUGS } from "./sub/../chunk-A.js";',
        "",
        "// src/normalized.ts",
        "var NORMALIZED_FIRST = SIGN_SLUGS[0];",
        "export { NORMALIZED_FIRST };",
        ""
      ].join("\n"),
      "dist/reader.js": [
        'import { all } from "./index.js";',
        "",
        "// src/reader.ts",
        "var LAST = all.SIGN_SLUGS.at(-1);",
        "export { LAST };",
        ""
      ].join("\n")
    };
    const breaches = checkBuild({ files: Object.keys(files), read: (path) => files[path] });
    expect(breaches.map(({ file, line, name, call }) => `${file}:${line} ${name ?? "(no table)"}: ${call}`)).toEqual([
      'dist/chunk-A.js:2 BEFORE: unmarked: Object.freeze(["own"])',
      'dist/chunk-A.js:5 ELEMENTS: unmarked: Object.freeze(["fire", "earth"])',
      "dist/chunk-A.js:12 (no table): a mark on a discarded value: Object.freeze(DASHA_LEVELS)",
      'dist/chunk-A.js:17 SYSTEMS: unmarked: Object.freeze(["whole"])',
      "dist/index.js:5 COUNT, which reads SIGN_SLUGS (SLUGS): a property read: SIGN_SLUGS.length",
      "dist/index.js:6 FIRST, which reads engine (BEFORE, ELEMENTS, SLUGS, SYSTEMS): a property read: engine.SIGN_SLUGS[0]",
      "dist/index.js:6 FIRST, which reads engine (BEFORE, ELEMENTS, SLUGS, SYSTEMS): a property read: engine.SIGN_SLUGS",
      "dist/normalized.js:4 NORMALIZED_FIRST, which reads SIGN_SLUGS (SLUGS): a property read: SIGN_SLUGS[0]",
      "dist/reader.js:4 LAST, which reads all (BEFORE, ELEMENTS, SLUGS, SYSTEMS): unmarked: all.SIGN_SLUGS.at(-1)"
    ]);
  });
});

describe("checkSource", () => {
  it("reads src/ but its tests and declaration files, leaves out UNMARKED_SOURCE's tables and readers but not their misplaced marks, and follows imports and exports", () => {
    const tree = mkdtempSync(join(tmpdir(), "pure-tables-"));
    try {
      mkdirSync(join(tree, "src/vedic"), { recursive: true });
      const write = (path, text) => writeFileSync(join(tree, path), text);
      write("src/vedic/dasha.ts", 'import { SLUGS } from "../signs.js";\nexport const A = Object.freeze([1]);\n/*#__PURE__*/ Object.freeze(A);\nconst N = SLUGS.length;\n');
      write("src/signs.ts", "export const B = Object.freeze([1]);\nexport const SLUGS = /*#__PURE__*/ Object.freeze([\"aries\"]);\n");
      write("src/defaults.ts", "export default /*#__PURE__*/ Object.freeze([\"default\"]);\n");
      write("src/index.ts", 'export { SLUGS as SIGN_SLUGS } from "./signs.js";\nexport * from "./signs.js";\nexport * from "./defaults.js";\nexport * as signs from "./signs.js";\n');
      write("src/reader.ts", [
        'import { SIGN_SLUGS, SLUGS, signs } from "./index.js";',
        'import DEFAULTS from "./defaults.js";',
        'import { default as NOT_REEXPORTED } from "./index.js";',
        'import { A } from "./vedic/dasha.js";',
        "export const FIRST = SIGN_SLUGS[0];",
        "export const ALL = SLUGS;",
        "export const LAST = SLUGS[0];",
        "export const COUNT = signs.SLUGS.length;",
        "export const DEFAULT_FIRST = DEFAULTS[0];",
        "export const NOT_FIRST = NOT_REEXPORTED[0];",
        "export const EXEMPT_FIRST = A[0];",
        ""
      ].join("\n"));
      write("src/anonymous.ts", 'import { SLUGS } from "./signs.js";\nexport default function () { return SLUGS; }\n');
      write("src/named.ts", 'import { SLUGS } from "./signs.js";\nexport default function named() { return SLUGS; }\n');
      write("src/types.ts", 'export type { SLUGS as TYPED } from "./signs.js";\nexport { type SLUGS as TYPED_TOO } from "./signs.js";\n');
      write("src/defaults.reader.ts", [
        'import anonymous from "./anonymous.js";',
        'import namedDefault from "./named.js";',
        'import { TYPED, TYPED_TOO } from "./types.js";',
        "export const ANONYMOUS = anonymous();",
        "export const NAMED_DEFAULT = namedDefault();",
        "export const TYPED_COUNT = TYPED.length + TYPED_TOO.length;",
        ""
      ].join("\n"));
      write("src/signs.test.ts", "export const C = Object.freeze([1]);\n");
      write("src/signs.d.ts", "export const D = Object.freeze([1]);\n");
      expect(checkSource(tree).map(({ file, line, name, call }) => `${file}:${line} ${name ?? "(no table)"}: ${call}`)).toEqual([
        "src/defaults.reader.ts:4 ANONYMOUS, which reads anonymous (SLUGS): unmarked: anonymous()",
        "src/defaults.reader.ts:5 NAMED_DEFAULT, which reads namedDefault (SLUGS): unmarked: namedDefault()",
        "src/reader.ts:5 FIRST, which reads SIGN_SLUGS (SLUGS): a property read: SIGN_SLUGS[0]",
        "src/reader.ts:7 LAST, which reads SLUGS: a property read: SLUGS[0]",
        "src/reader.ts:8 COUNT, which reads signs (B, SLUGS): a property read: signs.SLUGS.length",
        "src/reader.ts:8 COUNT, which reads signs (B, SLUGS): a property read: signs.SLUGS",
        "src/reader.ts:9 DEFAULT_FIRST, which reads DEFAULTS (default): a property read: DEFAULTS[0]",
        "src/signs.ts:1 B: unmarked: Object.freeze([1])",
        "src/vedic/dasha.ts:3 (no table): a mark on a discarded value: Object.freeze(A)"
      ]);
    } finally {
      rmSync(tree, { recursive: true, force: true });
    }
  });
});

describe("the lists the rule rests on", () => {
  it("are what docs/evidence/1.0.0-rc.2-20261006/tools/globals-probe.mjs finds the bundlers leave out, and what the language defines", () => {
    expect([...GLOBALS]).toEqual([
      "Array", "BigInt", "Boolean", "Date", "Error", "Float64Array", "Infinity", "JSON", "Map", "Math", "NaN", "Number", "Object",
      "RangeError", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet", "undefined"
    ]);
    expect([...WELL_KNOWN_SYMBOLS]).toEqual([
      "asyncDispose", "asyncIterator", "dispose", "hasInstance", "isConcatSpreadable", "iterator", "match", "matchAll", "replace",
      "search", "species", "split", "toPrimitive", "toStringTag", "unscopables"
    ]);
    expect([...ITERATING]).toEqual([
      "every", "filter", "find", "findIndex", "findLast", "findLastIndex", "flatMap", "forEach", "from", "map", "reduce",
      "reduceRight", "some", "sort", "toSorted"
    ]);
    expect([...FRESH_METHODS]).toEqual([
      "concat", "entries", "filter", "flat", "flatMap", "from", "fromEntries", "keys", "map", "of", "slice", "split",
      "toReversed", "toSorted", "toSpliced", "values", "with"
    ]);
  });
});

describe("this checkout", () => {
  it("leaves out the tables of the modules only ./calc and ./vedic load, and no other", () => {
    const modules = [];
    const walk = (directory) => {
      for (const name of readdirSync(directory)) {
        const path = join(directory, name);
        if (statSync(path).isDirectory()) walk(path);
        else modules.push(relative(root, path).split("\\").join("/"));
      }
    };
    walk(join(root, "src"));
    expect(modules.filter((path) => UNMARKED_SOURCE.test(path)).sort()).toEqual([
      "src/calc.ts", "src/vedic/ayanamsa.ts", "src/vedic/dasha.ts", "src/vedic/kp.ts", "src/vedic/nakshatra.ts", "src/vedic/varga.ts"
    ]);
    expect(UNMARKED_SOURCE.test("lib/src/calc.ts")).toBe(false);
  });

  it("has no table in src/ that a bundler cannot leave out but those, nothing that keeps one, and no misplaced mark", () => {
    expect(checkSource(root)).toEqual([]);
  });
});
