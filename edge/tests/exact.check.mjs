import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { requireNode22 } from "../scripts/build-support.mjs";

requireNode22();
const compiled = await build({
  entryPoints: [fileURLToPath(new URL("../src/exact.ts", import.meta.url))],
  bundle: true,
  format: "esm",
  platform: "neutral",
  target: "es2022",
  write: false,
  logLevel: "silent"
});
const {
  serializeExact, parseExact, compareExact, EXACT_SCHEMA, EXACT_LIMITS, ExactProtocolError
} = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].contents).toString("base64")}`);

const wire = (node) => JSON.stringify([EXACT_SCHEMA, node]);
const compare = (expected, actual) => compareExact(serializeExact(expected), serializeExact(actual));
const fromBits = (hex) => Buffer.from(hex, "hex").readDoubleBE();
const bits = (number) => {
  const bytes = Buffer.alloc(8);
  bytes.writeDoubleBE(number);
  return bytes.toString("hex");
};
const rejects = (operation, path = undefined, pattern = undefined) => assert.throws(operation, (error) => {
  assert.ok(error instanceof ExactProtocolError, error?.stack);
  assert.equal(error.name, "ExactProtocolError");
  if (path !== undefined) assert.equal(error.path, path);
  if (pattern !== undefined) assert.match(error.message, pattern);
  return true;
});

test("protocol has a versioned canonical envelope and explicit primitive tags", () => {
  assert.equal(EXACT_SCHEMA, "edge-exact/1");
  for (const [value, node] of [
    [null, ["null"]], [undefined, ["undefined"]],
    [false, ["boolean", false]], [true, ["boolean", true]],
    ["", ["string", ""]], ["null", ["string", "null"]],
    ["quotes\"\\\n😀\ud800", ["string", "quotes\"\\\n😀\ud800"]]
  ]) {
    const text = serializeExact(value);
    assert.equal(text, wire(node));
    assert.deepEqual(parseExact(text), [EXACT_SCHEMA, node]);
    assert.equal(compareExact(text, text), null);
  }
});

test("binary64 encoding retains signed zero, subnormals, limits and adjacent doubles", () => {
  for (const [value, expectedBits] of [
    [0, "0000000000000000"], [-0, "8000000000000000"],
    [1, "3ff0000000000000"], [-1, "bff0000000000000"],
    [1 + Number.EPSILON, "3ff0000000000001"],
    [Number.MIN_VALUE, "0000000000000001"], [-Number.MIN_VALUE, "8000000000000001"],
    [2 ** -1022, "0010000000000000"],
    [Number.MAX_VALUE, "7fefffffffffffff"], [-Number.MAX_VALUE, "ffefffffffffffff"],
    [Number.MAX_SAFE_INTEGER, "433fffffffffffff"],
    [Infinity, "7ff0000000000000"], [-Infinity, "fff0000000000000"]
  ]) {
    const text = serializeExact(value);
    assert.equal(text, wire(["number", expectedBits]));
    assert.equal(compareExact(text, wire(["number", expectedBits])), null);
  }
  for (const hex of ["7ff8000000000001", "7ff8000000000002", "fff8000000000001"]) {
    assert.equal(serializeExact(fromBits(hex)), wire(["number", hex]));
  }
  assert.deepEqual(compare(1, 1 + Number.EPSILON), {
    path: "$", reason: "value", expected: "binary64:3ff0000000000000", actual: "binary64:3ff0000000000001"
  });
  assert.equal(compareExact(wire(["number", "7ff8000000000001"]), wire(["number", "7ff8000000000002"])).reason, "value");
  // Arbitrary valid number bit patterns stay encoded during validation; no
  // Number conversion is allowed to quiet a signaling NaN in the transport.
  for (const hex of ["7ff0000000000001", "fff0000000000001"]) {
    assert.deepEqual(parseExact(wire(["number", hex])), [EXACT_SCHEMA, ["number", hex]]);
  }
});

test("differences hidden by ordinary JSON remain unequal", () => {
  const pairs = [
    [0, -0],
    [{ value: undefined }, {}],
    [[undefined], [null]],
    [new Array(1), [undefined]],
    [new Array(1), [null]],
    [NaN, null], [Infinity, null], [-Infinity, null], [NaN, Infinity],
    [new Date(0), "1970-01-01T00:00:00.000Z"],
    [new Date(NaN), null],
    [Object.assign(Object.create(null), { value: 1 }), { value: 1 }]
  ];
  for (const [left, right] of pairs) {
    assert.equal(JSON.stringify(left), JSON.stringify(right));
    assert.notEqual(compare(left, right), null);
  }
});

test("Date tags retain valid epoch milliseconds and distinguish invalid dates", () => {
  for (const milliseconds of [-8_640_000_000_000_000, -1, 0, 1, 8_640_000_000_000_000]) {
    const text = serializeExact(new Date(milliseconds));
    assert.equal(text, wire(["date", bits(milliseconds)]));
    assert.deepEqual(parseExact(text), [EXACT_SCHEMA, ["date", bits(milliseconds)]]);
    assert.equal(compareExact(text, serializeExact(new Date(milliseconds))), null);
  }
  assert.equal(serializeExact(new Date(NaN)), wire(["date", "invalid"]));
  assert.equal(compare(new Date(NaN), new Date(NaN)), null);
  assert.equal(compare(new Date(0), new Date(1)).reason, "value");
  for (const milliseconds of [-0, 0.5, -0.5, 8_640_000_000_000_001, -8_640_000_000_000_001, NaN, Infinity, -Infinity]) {
    rejects(() => parseExact(wire(["date", bits(milliseconds)])), "$", /Date timestamp/);
  }
});

test("sparse arrays preserve leading, middle and trailing holes without confusing undefined", () => {
  const input = new Array(5);
  input[1] = undefined;
  input[3] = [null];
  assert.deepEqual(parseExact(serializeExact(input))[1], ["array", [
    ["hole"], ["undefined"], ["hole"], ["array", [["null"]]], ["hole"]
  ]]);
  const dense = [...input];
  assert.deepEqual(compare(input, dense), {
    path: "$[0]", reason: "type", expected: "hole", actual: "undefined"
  });
  assert.equal(compare([], new Array(1)).reason, "length");
  rejects(() => parseExact(wire(["hole"])), "$", /outside an array slot/);
  rejects(() => parseExact(wire(["object", "ordinary", [["value", ["hole"]]]])), '$["value"]', /outside an array slot/);
});

test("record order is canonical and prototype-like keys are ordinary data", () => {
  const left = Object.fromEntries([
    ["z", 0], ["10", 10], ["2", 2], ["", null], ["__proto__", { retained: true }],
    ["constructor", "data"], ["toJSON", "data"], ["😀", "astral"], ["\uffff", "BMP"]
  ]);
  const right = Object.fromEntries(Object.entries(left).reverse());
  assert.equal(serializeExact(left), serializeExact(right));
  const node = parseExact(serializeExact(left))[1];
  assert.deepEqual(node[2].map(([key]) => key), ["", "10", "2", "__proto__", "constructor", "toJSON", "z", "😀", "\uffff"]);
  assert.deepEqual(node[2].find(([key]) => key === "__proto__")[1], ["object", "ordinary", [["retained", ["boolean", true]]]]);
  assert.equal(Object.getPrototypeOf(left), Object.prototype);
  assert.equal(Object.prototype.retained, undefined);
  assert.equal(compare(left, Object.freeze(right)), null, "Mutation permissions are outside value parity");
  assert.deepEqual(compare({}, Object.create(null)), {
    path: "$", reason: "prototype", expected: "object(prototype=ordinary)", actual: "object(prototype=null)"
  });
});

test("mismatches name the complete result path and first sorted property", () => {
  const key = 'quote"\\\n]';
  const left = { rows: [{ [key]: 0 }] };
  const right = { rows: [{ [key]: -0 }] };
  assert.deepEqual(compare(left, right), {
    path: '$["rows"][0]["quote\\\"\\\\\\n]"]',
    reason: "value", expected: "binary64:0000000000000000", actual: "binary64:8000000000000000"
  });
  assert.equal(compare({ z: 1, a: 1 }, { a: 2, z: 2 }).path, '$["a"]');
  assert.deepEqual(compare({ a: undefined }, {}), {
    path: '$["a"]', reason: "missing", expected: "undefined", actual: "absent"
  });
  assert.deepEqual(compare({}, { a: undefined }), {
    path: '$["a"]', reason: "unexpected", expected: "absent", actual: "undefined"
  });
  assert.equal(compare({ values: [] }, { values: [1] }).path, '$["values"]');
  assert.equal(compare({ values: [] }, { values: [1] }).reason, "length");
  assert.equal(compare({ a: [1] }, { a: { 0: 1 } }).reason, "type");
  assert.equal(compare({ a: false }, { a: true }).reason, "value");
  assert.equal(compare({ a: "x" }, { a: "y" }).reason, "value");
});

test("shared references expand by occurrence while cycles reject at their data path", () => {
  const shared = { angle: 12, epoch: new Date(0) };
  assert.equal(compare({ first: shared, second: shared }, {
    first: { angle: 12, epoch: new Date(0) }, second: { angle: 12, epoch: new Date(0) }
  }), null);
  const self = {};
  self.self = self;
  rejects(() => serializeExact(self), '$["self"]', /Cyclic/);
  const array = [];
  array.push({ array });
  rejects(() => serializeExact(array), '$[0]["array"]', /Cyclic/);
});

test("unsupported value types and prototypes fail rather than disappear", () => {
  for (const value of [
    () => 1, Symbol("value"), 1n, new Map(), new Set(), /a/, new Error("error"),
    new Uint8Array([1]), new Number(1), new String("x"), new Boolean(true),
    Object.create({ inherited: true }), Object.create(Date.prototype), new (class Example {})(),
    new (class extends Array {})(), new (class extends Date {})()
  ]) rejects(() => serializeExact({ value }), '$["value"]', /Unsupported/);
  const hidden = Object.defineProperty({}, "hidden", { value: 1 });
  rejects(() => serializeExact(hidden), '$["hidden"]', /Non-enumerable/);
  const hiddenSlot = Object.defineProperty([], "0", { value: 1 });
  rejects(() => serializeExact(hiddenSlot), '$["0"]', /Non-enumerable/);
  for (const object of [{ [Symbol("hidden")]: 1 }, Object.assign([], { [Symbol("hidden")]: 1 }), Object.assign(new Date(0), { [Symbol("hidden")]: 1 })]) {
    rejects(() => serializeExact(object), "$", /Symbol keys/);
  }
  for (const key of ["extra", "01", "-1", "4294967295", "__proto__", "0\n", "0\r", "0\u2028", "0\u2029"]) {
    const array = [true];
    Object.defineProperty(array, key, { value: true, enumerable: true });
    rejects(() => serializeExact(array), `$[${JSON.stringify(key)}]`, /Extra array properties/);
  }
  rejects(() => serializeExact(Object.assign(new Date(0), { extra: 1 })), "$", /Date properties/);
});

test("getters and toJSON methods never execute during serialization", () => {
  let calls = 0;
  const getter = { enumerable: true, get() { calls++; throw new Error("Getter executed"); } };
  for (const [object, key] of [[{}, "value"], [[], "0"], [new Date(0), "value"]]) {
    Object.defineProperty(object, key, getter);
    rejects(() => serializeExact(object));
  }
  const toJSON = () => { calls++; return "replacement"; };
  rejects(() => serializeExact({ toJSON }), '$["toJSON"]', /Unsupported/);
  rejects(() => serializeExact(Object.assign(new Date(0), { toJSON })), "$", /Date properties/);
  assert.equal(calls, 0);
});

test("malformed envelopes and tagged nodes reject without partial acceptance", () => {
  for (const value of [null, 1, {}, [], [EXACT_SCHEMA], [EXACT_SCHEMA, ["null"], "extra"], ["edge-exact/unknown", ["null"]]]) {
    rejects(() => parseExact(JSON.stringify(value)), "$", /envelope/);
  }
  for (const node of [
    null, {}, [], ["unknown", 1], [1, 1], ["null", 1], ["undefined", 1],
    ["number"], ["number", "0000000000000000", "extra"],
    ["boolean", 0], ["boolean", "false"], ["string", null],
    ["number", 0], ["number", "000000000000000"], ["number", "00000000000000000"],
    ["number", "3FF0000000000000"], ["number", "gff0000000000000"],
    ["number", "invalid"], ["date", "1970-01-01"],
    ...["\n", "\r", "\u2028", "\u2029"].flatMap((suffix) => [
      ["number", "0000000000000000" + suffix], ["date", "0000000000000000" + suffix]
    ]),
    ["array", null], ["array", {}], ["array", [null]],
    ["object", "custom", []], ["object", "ordinary", {}],
    ["object", "ordinary", [[1, ["null"]]]],
    ["object", "ordinary", [["a"]]],
    ["object", "ordinary", [["a", ["null"], "extra"]]],
    ["object", "ordinary", [["b", ["null"]], ["a", ["null"]]]],
    ["object", "ordinary", [["", ["null"]], ["", ["null"]]]]
  ]) rejects(() => parseExact(wire(node)));
  for (const text of ["", "{", "undefined", `${wire(["null"])}garbage`]) {
    rejects(() => parseExact(text), "$", /JSON/);
  }
  for (const value of [null, {}, 1, undefined]) rejects(() => parseExact(value), "$", /protocol text/);
});

test("only canonical JSON spelling is accepted and both reports validate fully", () => {
  const text = serializeExact({ x: "a" });
  for (const variant of [` ${text}`, `${text}\n`, JSON.stringify(JSON.parse(text), null, 2), text.replace('"a"', '"\\u0061"')]) {
    rejects(() => parseExact(variant), "$", /Noncanonical/);
  }
  const malformed = wire(["array", [["boolean", true], ["not-a-tag", 0]]]);
  rejects(() => compareExact(malformed, malformed), "$[1]", /Unknown value tag/);
  rejects(() => compareExact(serializeExact(false), malformed), "$[1]", /Unknown value tag/);
  rejects(() => compareExact(malformed, serializeExact(false)), "$[1]", /Unknown value tag/);
});

test("the same depth and occurrence budgets apply to writing and parsing", () => {
  assert.deepEqual(EXACT_LIMITS, { depth: 128, nodes: 100_000, bytes: 1_999_999 });
  let value = null;
  let node = ["null"];
  for (let depth = 0; depth < EXACT_LIMITS.depth; depth++) {
    value = [value];
    node = ["array", [node]];
  }
  assert.equal(serializeExact(value), wire(node));
  assert.doesNotThrow(() => parseExact(wire(node)));
  rejects(() => serializeExact([value]), undefined, /Depth limit/);
  rejects(() => parseExact(wire(["array", [node]])), undefined, /Depth limit/);
  const allowed = Array(EXACT_LIMITS.nodes - 1).fill(null);
  const allowedText = serializeExact(allowed);
  assert.doesNotThrow(() => parseExact(allowedText));
  rejects(() => serializeExact([...allowed, null]), "$", /Node limit/);
  rejects(() => parseExact(wire(["array", Array(EXACT_LIMITS.nodes).fill(["null"])])), undefined, /Node limit/);
  const shared = [null];
  rejects(() => serializeExact(Array(EXACT_LIMITS.nodes / 2).fill(shared)), undefined, /Node limit/);
});

test("transport size is bounded in UTF-8 bytes with the exact boundary included", () => {
  const overhead = Buffer.byteLength(serializeExact(""));
  const largest = "a".repeat(EXACT_LIMITS.bytes - overhead);
  const text = serializeExact(largest);
  assert.equal(Buffer.byteLength(text), EXACT_LIMITS.bytes);
  assert.doesNotThrow(() => parseExact(text));
  rejects(() => serializeExact(largest + "a"), "$", /UTF-8 byte limit/);
  rejects(() => parseExact(text + " "), "$", /UTF-8 byte limit/);
  const multibyte = "é".repeat(Math.floor((EXACT_LIMITS.bytes - overhead) / 2) + 1);
  const multibyteText = wire(["string", multibyte]);
  assert.ok(multibyteText.length < EXACT_LIMITS.bytes);
  assert.ok(Buffer.byteLength(multibyteText) > EXACT_LIMITS.bytes);
  rejects(() => serializeExact(multibyte), "$", /UTF-8 byte limit/);
  rejects(() => parseExact(multibyteText), "$", /UTF-8 byte limit/);
});
