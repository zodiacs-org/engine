import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  createGenerationClient, GenerationError, GENERATION_LIMITS
} from "../lib/generation-backend.mjs";
import { validateEntry } from "../lib/validate-entry.mjs";

const request = (overrides = {}) => ({
  schemaVersion: "1.0.0", promptVersion: "inline-prompt-v1",
  system: "Return original symbolic prose as JSON.",
  prompt: "Use this invented factor: Sun in aries.", seed: 0, ...overrides
});
const adapter = (generate) => ({
  id: "inline-backend", model: "inline-model", version: "1.0.0", mode: "offline", generate
});
const clientFor = (generate, limits) => createGenerationClient({
  backend: "inline-backend", adapters: [adapter(generate)], ...(limits ? { limits } : {})
});
const rejects = (action, code) => assert.rejects(action, (error) => {
  assert.ok(error instanceof GenerationError);
  assert.equal(error.code, code);
  assert.equal(Object.hasOwn(error, "cause"), false);
  return true;
});
const invalidOptions = (options, code = "invalid-options") => {
  assert.throws(() => createGenerationClient(options), (error) =>
    error instanceof GenerationError && error.code === code);
};

test("generation ceilings are explicit and cannot be raised or mutated", () => {
  assert.deepEqual(GENERATION_LIMITS, {
    maxInputBytes: 65_536, maxOutputBytes: 65_536, timeoutMs: 30_000, maxCalls: 256
  });
  assert.ok(Object.isFrozen(GENERATION_LIMITS));
  for (const [key, ceiling] of Object.entries(GENERATION_LIMITS)) {
    for (const value of [null, undefined, 0, -1, 0.5, "1", true, Infinity, NaN, ceiling + 1]) {
      invalidOptions({ limits: { [key]: value } });
    }
    assert.equal(createGenerationClient({ limits: { [key]: 1 } }).limits[key], 1);
    assert.equal(createGenerationClient({ limits: { [key]: ceiling } }).limits[key], ceiling);
  }
});

test("configuration rejects unknown fields and malformed selections without invoking adapters", () => {
  for (const options of [null, [], 2, "mock", { unexpected: true }, { limits: null }, { limits: undefined },
    { limits: [] }, { limits: { unexpected: true } }, { [Symbol("extra")]: true }]) invalidOptions(options);
  for (const backend of [null, undefined, "", "unknown", "Mock", "mock\n", "./plugin.mjs", "a".repeat(101)]) {
    invalidOptions({ backend }, "invalid-backend");
  }
  for (const adapters of [null, undefined, {}, [null], [undefined], Array(1), Array(33)]) {
    invalidOptions({ adapters }, "invalid-backend");
  }
  let invoked = false;
  const value = adapter(() => { invoked = true; });
  for (const replacement of [
    { ...value, id: "mock" }, { ...value, id: "not valid" }, { ...value, model: " " },
    { ...value, model: "x\n" }, { ...value, model: "\ud800" }, { ...value, model: "x".repeat(161) },
    { ...value, version: "" }, { ...value, mode: "automatic" }, { ...value, generate: null },
    { ...value, credentials: "not a credential" }
  ]) invalidOptions({ adapters: [replacement] }, "invalid-backend");
  invalidOptions({ adapters: [value, value] }, "invalid-backend");
  assert.equal(invoked, false);
});

test("backend metadata and callable are snapshots, with detached immutable requests", async () => {
  let received;
  const plugin = adapter((input, context) => {
    received = input;
    assert.ok(Object.isFrozen(input));
    assert.ok(Object.isFrozen(context));
    assert.ok(context.signal instanceof AbortSignal);
    assert.equal(context.maxOutputBytes, GENERATION_LIMITS.maxOutputBytes);
    assert.throws(() => { input.prompt = "changed"; }, TypeError);
    return { text: "Original inline test output.", finishReason: "stop" };
  });
  const limits = { maxCalls: 2 };
  const client = createGenerationClient({ backend: plugin.id, adapters: [plugin], limits });
  plugin.model = "changed";
  plugin.generate = () => { throw new Error("must not run"); };
  limits.maxCalls = 1;
  const input = Object.freeze(request());
  const result = await client.generate(input);
  assert.notEqual(received, input);
  assert.deepEqual(received, input);
  assert.equal(result.backend.model, "inline-model");
  assert.equal(result.limits.maxCalls, 2);
  for (const value of [client, client.backend, client.limits, result, result.backend, result.limits]) {
    assert.ok(Object.isFrozen(value));
  }
  assert.deepEqual(result, JSON.parse(JSON.stringify(result)));
  assert.deepEqual(await client.generate(input), result);
});

test("input validation rejects unsupported request fields and values before dispatch", async () => {
  let calls = 0;
  const client = clientFor(() => { calls += 1; return { text: "ok", finishReason: "stop" }; }, { maxCalls: 1 });
  for (const value of [null, [], 42, true, "prompt", ...Object.keys(request()).map((key) => {
    const value = request(); delete value[key]; return value;
  }), request({ extra: true }), request({ schemaVersion: "2.0.0" }),
  request({ promptVersion: "Prompt v1" }), request({ promptVersion: "inline-prompt-v1\n" }),
  ...["system", "prompt"].flatMap((key) => ["", " \t\n", 3, null, "\ud800"].map((value) => request({ [key]: value }))),
  ...[-1, 0.1, 4_294_967_296, Infinity, NaN, "0", null].map((seed) => request({ seed }))]) {
    await rejects(() => client.generate(value), "invalid-request");
  }
  assert.equal(calls, 0);
  await client.generate(request({ seed: 4_294_967_295 }));
  assert.equal(calls, 1);
});

test("own data properties are required without executing supplied accessors", async () => {
  const fail = () => { throw new Error("accessor was evaluated"); };
  invalidOptions(Object.defineProperty({}, "backend", { get: fail }));
  invalidOptions(Object.assign(Object.create({ backend: "mock" }), {}));
  const client = createGenerationClient();
  const input = request();
  Object.defineProperty(input, "prompt", { get: fail });
  await rejects(() => client.generate(input), "invalid-request");
  await rejects(() => client.generate(request(), { signal: {} }), "invalid-options");
  await rejects(() => client.generate(request(), { extra: true }), "invalid-options");
  const response = Object.defineProperty({ finishReason: "stop" }, "text", { get: fail });
  await rejects(() => clientFor(() => response).generate(request()), "invalid-response");
});

test("input bytes count fixed-order UTF-8 JSON including escapes and metadata", async () => {
  for (const prompt of ["x", "a😀é\n\t\u0000", "\\\"\\\""]) {
    const input = request({ prompt });
    const bytes = Buffer.byteLength(JSON.stringify(input));
    let calls = 0;
    const generate = () => { calls += 1; return { text: "ok", finishReason: "stop" }; };
    await clientFor(generate, { maxInputBytes: bytes }).generate(input);
    await rejects(() => clientFor(generate, { maxInputBytes: bytes - 1 }).generate(input), "input-limit");
    assert.equal(calls, 1);
  }
  const overhead = Buffer.byteLength(JSON.stringify(request({ prompt: "" })));
  const input = request({ prompt: "a".repeat(GENERATION_LIMITS.maxInputBytes - overhead) });
  await createGenerationClient().generate(input);
  await rejects(() => createGenerationClient().generate({ ...input, prompt: `${input.prompt}a` }), "input-limit");
  await rejects(() => createGenerationClient().generate(request({ prompt: "a".repeat(65_537) })), "input-limit");
});

test("output limits count UTF-8 bytes without silent truncation", async () => {
  for (const text of ["x", "😀é", "line\n\u0000", "a".repeat(GENERATION_LIMITS.maxOutputBytes)]) {
    const bytes = Buffer.byteLength(text);
    const generate = () => ({ text, finishReason: "stop" });
    assert.equal((await clientFor(generate, { maxOutputBytes: bytes }).generate(request())).text, text);
    if (bytes > 1) {
      await rejects(() => clientFor(generate, { maxOutputBytes: bytes - 1 }).generate(request()), "output-limit");
    }
  }
  await rejects(() => clientFor(() => ({ text: "a".repeat(65_537), finishReason: "stop" }))
    .generate(request()), "output-limit");
});

test("malformed completions reject, while refusal and length remain explicit", async () => {
  for (const response of [undefined, null, "ok", [], {}, { text: "ok" }, { finishReason: "stop" },
    { text: 1, finishReason: "stop" }, { text: "ok", finishReason: "complete" },
    { text: "ok", finishReason: "stop", extra: true }, { text: "", finishReason: "stop" },
    { text: " \t", finishReason: "stop" }, { text: "\udfff", finishReason: "refusal" }]) {
    await rejects(() => clientFor(() => response).generate(request()), "invalid-response");
  }
  for (const finishReason of ["length", "refusal"]) {
    for (const text of ["", "partial response"]) {
      const result = await clientFor(() => ({ text, finishReason })).generate(request());
      assert.equal(result.finishReason, finishReason);
      assert.equal(result.text, text);
    }
  }
});

test("request identity binds metadata, limits and exact canonical input bytes", async () => {
  const client = createGenerationClient();
  const input = request();
  const first = await client.generate(input);
  const serialized = JSON.stringify({ schemaVersion: "1.0.0", backend: client.backend, limits: client.limits, request: input });
  const expected = `sha256:${createHash("sha256").update(serialized).digest("hex")}`;
  assert.equal(first.requestDigest, expected);
  assert.equal(first.promptVersion, input.promptVersion);
  assert.equal((await client.generate(request({ seed: -0 }))).requestDigest, expected);
  for (const changes of [{ system: "Other instruction." }, { prompt: `${input.prompt} ` },
    { promptVersion: "inline-prompt-v2" }, { seed: 1 }]) {
    assert.notEqual((await client.generate(request(changes))).requestDigest, expected);
  }
  assert.notEqual((await createGenerationClient({ limits: { maxCalls: 1 } }).generate(input)).requestDigest, expected);
  const generate = () => ({ text: "ok", finishReason: "stop" });
  const plugin = adapter(generate);
  const one = await createGenerationClient({ backend: plugin.id, adapters: [plugin] }).generate(input);
  for (const changes of [{ model: "other-model" }, { version: "1.0.1" }, { mode: "network" }, { id: "other-id" }]) {
    const changed = { ...plugin, ...changes };
    const two = await createGenerationClient({ backend: changed.id, adapters: [changed] }).generate(input);
    assert.notEqual(one.requestDigest, two.requestDigest);
  }
});

test("mock produces a deterministic meaning draft, without inventing entry provenance or rights", async () => {
  const result = await createGenerationClient().generate(request());
  assert.deepEqual(await createGenerationClient({ backend: "mock" }).generate(request()), result);
  const meaning = JSON.parse(result.text);
  assert.match(meaning.summary, /^Offline mock /);
  assert.deepEqual(Object.keys(meaning), ["summary", "themes", "epistemicStatus"]);
  assert.deepEqual(validateEntry({
    schemaVersion: "1.0.0", id: "inline-generated", language: "en", tradition: "western-tropical",
    factor: { kind: "placement", body: "Sun", sign: "aries" }, meaning,
    provenance: {
      kind: "generated", backend: result.backend.id, model: result.backend.model,
      promptVersion: result.promptVersion, inputDigest: result.requestDigest,
      sourceEntryIds: ["inline-source"], reviewStatus: "unreviewed"
    },
    license: { spdxId: "MIT", attribution: "Original inline test assembly by evals contributors." }
  }), { valid: true, errors: [] });
});
