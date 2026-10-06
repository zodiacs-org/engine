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
export const BUILT_AT_LOAD = build(() => Object.freeze([30]));
export const SETS_AT_LOAD = [["a"]].map((list) => new Set(list));
function build(make: () => unknown) { return make(); }
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
      "BUILT_AT_LOAD: unmarked: build(() => Object.freeze([30]))",
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
      "DEEP_KEYED: a computed key: [KEY]",
      "DEEP_KEYED: a mark on a call that may freeze a value that exists before it: deepFreeze({ [KEY]: 1 })",
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
      "54 OTHER_KEY: a mark on a call that may freeze a value that exists before it: lock({ [STATE.a]: 1 })",
      // A method named create is no Object.create, nor known to return what is new.
      "64 POOLED: a mark on a freeze of a value that may exist before it: Object.freeze(/*#__PURE__*/ Pool.create())",
      "67 VIA_EACH: a mark on a call that may freeze a value that exists before it: eachRow(ROWS, (row) => Object.freeze(row))",
      "68 VIA_DEFAULT: a mark on a call that may freeze a value that exists before it: lockDefaultVia()",
      "69 IN_PLACE_INSIDE: a mark on a call that may freeze a value that exists before it: lockInPlace()",
      "70 TWICE: a mark on a call that may freeze a value that exists before it: lockTwice()",
      "71 WRAPPED: a mark on a call that may freeze a value that exists before it: lockWrapped()"
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
