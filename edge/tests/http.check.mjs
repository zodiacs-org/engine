import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import { resolve } from "node:path";
import test from "node:test";
import { build } from "esbuild";
import { buildTarget } from "../scripts/build-bundles.mjs";
import { edgeRoot, readToolchain } from "../scripts/build-support.mjs";

const importBytes = (bytes) => import(`data:text/javascript;base64,${Buffer.from(bytes).toString("base64")}`);
const { alias } = await readToolchain();
const referenceBuild = await build({
  absWorkingDir: edgeRoot,
  entryPoints: { http: "src/http.ts", engine: "../src/index.ts", workloads: "src/workloads.ts" },
  outdir: resolve(edgeRoot, ".generated/http-test-reference"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "es2022",
  alias,
  tsconfig: resolve(edgeRoot, "tsconfig.json"),
  minify: false,
  legalComments: "inline",
  write: false,
  logLevel: "silent"
});
const modules = Object.fromEntries(await Promise.all(referenceBuild.outputFiles.map(async (file) => [
  file.path.split("/").at(-1).replace(/\.js$/, ""), await importBytes(file.contents)
])));
const { createHandler, HTTP_LIMITS } = modules.http;
const { natalChart, HOUSE_SYSTEMS } = modules.engine;
const { CHART_CASES } = modules.workloads;
const workerBuild = await buildTarget("workers", { write: false });
const worker = (await importBytes(workerBuild.files.get("worker.mjs"))).default;
const handlers = [["Worker", worker.fetch]];
for (const runtime of ["deno", "bun"]) {
  const { files } = await buildTarget(runtime, { write: false });
  const { handleRequest } = await importBytes(files.get(`${runtime}.mjs`));
  handlers.push([runtime, handleRequest]);
}
const syntheticInput = { utc: "2000-03-20T12:34:56Z", latitude: 35.25, longitude: -110.75 };
const syntheticJson = JSON.stringify(syntheticInput);
const encode = (text) => new TextEncoder().encode(text);
const jsonEquivalent = (value) => JSON.parse(JSON.stringify(value));

function testHandlers(name, options, body) {
  if (typeof options === "function") [options, body] = [{}, options];
  for (const [runtime, handler] of handlers) {
    test(`${runtime}: ${name}`, options, (t) => body(t, handler));
  }
}

function request(body = syntheticJson, { path = "/chart", method = "POST", headers = {}, signal } = {}) {
  return new Request(`https://edge.example.invalid${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    ...(body === null ? {} : { body }),
    ...(body instanceof ReadableStream ? { duplex: "half" } : {}),
    ...(signal ? { signal } : {})
  });
}

function checkHeaders(response) {
  assert.match(response.headers.get("Content-Type"), /^application\/json(?:\s*;\s*charset=utf-8)?$/i);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
}

async function checkError(response, status, code) {
  assert.equal(response.status, status);
  checkHeaders(response);
  const payload = await response.json();
  assert.deepEqual(Object.keys(payload).sort(), ["error", "ok"]);
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, code);
  assert.equal(typeof payload.error.message, "string");
  assert.ok(payload.error.message.length > 0);
  assert.ok(Object.keys(payload.error).every((key) => ["code", "message", "field"].includes(key)));
  if (Object.hasOwn(payload.error, "field")) {
    assert.ok(["utc", "coordinates", "latitude", "longitude", "houseSystem", "timeKnown", "timeScale"].includes(payload.error.field));
  }
  return payload;
}

function chunked(chunks, { hang = false, cancelRejects = false } = {}) {
  const state = { reads: 0, cancelled: false };
  const stream = new ReadableStream({
    pull(controller) {
      if (state.reads < chunks.length) controller.enqueue(chunks[state.reads++]);
      else if (!hang) controller.close();
    },
    cancel() {
      state.cancelled = true;
      if (cancelRejects) return Promise.reject(new Error("synthetic-cancellation-detail"));
    }
  }, { highWaterMark: 0 });
  return { stream, state };
}

test("HTTP limits and module Worker entry are explicit", () => {
  assert.deepEqual(HTTP_LIMITS, { bodyBytes: 4096, bodyChunks: 4096, bodyTimeoutMs: 5000, utcCharacters: 64 });
  assert.deepEqual(Object.keys(worker), ["fetch"]);
  assert.equal(typeof worker.fetch, "function");
});

testHandlers("returns full synthetic charts equal to direct Node calculation without fetching", async (t, handler) => {
  const outbound = t.mock.method(globalThis, "fetch", () => {
    throw new Error("Unexpected outbound request");
  });
  const cases = [
    ...CHART_CASES.map(({ input }) => input),
    { utc: "2000-03-20" },
    { utc: "2000-03-20T14:34:56+02:00", latitude: 0, longitude: 0, timeScale: "ut1" },
    { ...syntheticInput, timeScale: "tt" },
    { ...syntheticInput, timeKnown: false },
    ...HOUSE_SYSTEMS.map((houseSystem) => ({ ...syntheticInput, houseSystem }))
  ];
  for (const input of cases) {
    const response = await handler(request(JSON.stringify(input)));
    assert.equal(response.status, 200);
    checkHeaders(response);
    assert.deepStrictEqual(await response.json(), { ok: true, result: jsonEquivalent(natalChart(input)) });
  }
  assert.equal(outbound.mock.callCount(), 0);
});

testHandlers("routing refuses unknown paths, queries and unsupported methods", async (_t, handler) => {
  for (const path of ["/", "/charts", "/chart/", "/%63hart"]) {
    await checkError(await handler(request(syntheticJson, { path })), 404, "not-found");
  }
  await checkError(await handler(request(syntheticJson, { path: "/chart?utc=synthetic-private-value" })), 400, "invalid-request");
  for (const method of ["GET", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
    const response = await handler(request(null, { method }));
    assert.equal(response.headers.get("Allow"), "POST");
    await checkError(response, 405, "method-not-allowed");
  }
  const head = await handler(request(null, { method: "HEAD" }));
  assert.equal(head.status, 405);
  assert.equal(head.headers.get("Allow"), "POST");
  checkHeaders(head);
  assert.equal(head.body, null);
});

testHandlers("validates request data through the production adapter", async (_t, handler) => {
  const cases = [
    [request("{"), 400, "invalid-json"],
    [request("[]"), 400, "invalid-input"],
    [request(JSON.stringify({ ...syntheticInput, extra: "synthetic-private-value" })), 400, "invalid-input"],
    [request(JSON.stringify({ utc: syntheticInput.utc, latitude: 0 })), 400, "invalid-input"],
    [request(syntheticJson, { headers: { "Content-Type": "text/plain" } }), 415, "unsupported-media-type"],
    [request(syntheticJson, { headers: { "Content-Encoding": "gzip" } }), 415, "unsupported-content-encoding"],
    [request(syntheticJson, { headers: { "Content-Length": "-1" } }), 400, "invalid-content-length"],
    [request(syntheticJson.padEnd(4097, " ")), 413, "body-too-large"]
  ];
  for (const [input, status, code] of cases) {
    const payload = await checkError(await handler(input), status, code);
    assert.ok(!JSON.stringify(payload).includes("synthetic-private-value"));
  }
});

test("media type accepts JSON and UTF-8 spellings and refuses other formats", async () => {
  const handler = createHandler(() => ({ accepted: true }));
  for (const contentType of ["application/json", "APPLICATION/JSON", "application/json;charset=utf-8", "Application/Json ; charset = UTF-8", 'application/json; charset="utf-8"']) {
    assert.equal((await handler(request(syntheticJson, { headers: { "Content-Type": contentType } }))).status, 200);
  }
  for (const contentType of ["", "text/plain", "application/problem+json", "application/json;charset=ascii", "application/json;version=1", "application/json, text/plain", "application/json;charset=utf-8;charset=utf-8"]) {
    await checkError(await handler(request(syntheticJson, { headers: { "Content-Type": contentType } })), 415, "unsupported-media-type");
  }
  const missing = request();
  missing.headers.delete("Content-Type");
  await checkError(await handler(missing), 415, "unsupported-media-type");
});

test("only an absent or identity content encoding is accepted", async () => {
  const handler = createHandler(() => ({}));
  assert.equal((await handler(request())).status, 200);
  assert.equal((await handler(request(syntheticJson, { headers: { "Content-Encoding": "identity" } }))).status, 200);
  for (const encoding of ["gzip", "br", "deflate", "identity, gzip"]) {
    await checkError(await handler(request(syntheticJson, { headers: { "Content-Encoding": encoding } })), 415, "unsupported-content-encoding");
  }
});

test("input validation accepts only the bounded BirthInput subset", async () => {
  const calls = [];
  const handler = createHandler((input) => { calls.push(input); return { accepted: true }; });
  const accepted = [
    { utc: "u".repeat(64) },
    ...[-90, 90].flatMap((latitude) => [-180, 180].map((longitude) => ({ ...syntheticInput, latitude, longitude }))),
    ...HOUSE_SYSTEMS.map((houseSystem) => ({ ...syntheticInput, houseSystem })),
    ...[true, false].map((timeKnown) => ({ ...syntheticInput, timeKnown })),
    ...["utc", "ut1", "tt"].map((timeScale) => ({ ...syntheticInput, timeScale }))
  ];
  for (const input of accepted) {
    assert.equal((await handler(request(JSON.stringify(input)))).status, 200);
    assert.deepEqual(calls.at(-1), input);
  }
  const before = calls.length;
  const invalid = [
    null, [], [syntheticInput], true, 42, "synthetic-private-value", {},
    { utc: null }, { utc: 0 }, { utc: true }, { utc: {} }, { utc: "" }, { utc: "u".repeat(65) },
    { ...syntheticInput, latitude: null }, { ...syntheticInput, latitude: "35.25" },
    { ...syntheticInput, latitude: -90.0001 }, { ...syntheticInput, latitude: 90.0001 },
    { ...syntheticInput, longitude: null }, { ...syntheticInput, longitude: "-110.75" },
    { ...syntheticInput, longitude: -180.0001 }, { ...syntheticInput, longitude: 180.0001 },
    { utc: syntheticInput.utc, latitude: 0 }, { utc: syntheticInput.utc, longitude: 0 },
    ...[null, 0, "Whole", "synthetic-private-value", "toString"].map((houseSystem) => ({ ...syntheticInput, houseSystem })),
    ...[null, 0, "false", {}].map((timeKnown) => ({ ...syntheticInput, timeKnown })),
    ...[null, "UTC", "tai", 0].map((timeScale) => ({ ...syntheticInput, timeScale })),
    { ...syntheticInput, deltaT: 64 }, { ...syntheticInput, flags: [] },
    { ...syntheticInput, extra: "synthetic-private-value" },
    { ...syntheticInput, "synthetic-private-key": "synthetic-private-value" }
  ];
  for (const input of invalid) {
    const payload = await checkError(await handler(request(JSON.stringify(input))), 400, "invalid-input");
    assert.ok(!JSON.stringify(payload).includes("synthetic-private"));
  }
  for (const body of [
    '{"utc":"2000-03-20","latitude":1e309,"longitude":0}',
    '{"utc":"2000-03-20","latitude":0,"longitude":-1e309}',
    '{"utc":"2000-03-20","__proto__":{"syntheticPrivate":true}}',
    '{"utc":"2000-03-20","constructor":{"syntheticPrivate":true}}'
  ]) await checkError(await handler(request(body)), 400, "invalid-input");
  assert.equal(calls.length, before, "Rejected data must never reach calculation");
  assert.equal({}.syntheticPrivate, undefined);
});

testHandlers("the engine parses date strings and exposes a fixed rejection response", async (_t, handler) => {
  let expected;
  for (const utc of ["synthetic-private-value", "2000-02-30", "2000-03-20T12:34:56", "9000-01-01"]) {
    const payload = await checkError(await handler(request(JSON.stringify({ utc }))), 422, "calculation-rejected");
    if (expected) assert.deepEqual(payload, expected);
    expected = payload;
    assert.ok(!JSON.stringify(payload).includes(utc));
  }
});

test("malformed JSON and invalid UTF-8 are refused before calculation", async () => {
  let calls = 0;
  const handler = createHandler(() => { calls++; return {}; });
  for (const body of [null, "", "{", '{"utc":"synthetic-private-value",}', '{} {}', new Uint8Array([0xff]), new Uint8Array([0x22, 0xc3, 0x28, 0x22])]) {
    const payload = await checkError(await handler(request(body)), 400, "invalid-json");
    assert.ok(!JSON.stringify(payload).includes("synthetic-private-value"));
  }
  assert.equal(calls, 0);
});

test("Content-Length is validated but cannot bypass the actual byte bound", async () => {
  const handler = createHandler(() => ({}));
  for (const length of ["", "-1", "+1", "1.5", "1e3", "NaN", "10, 10", "9007199254740992"]) {
    await checkError(await handler(request(syntheticJson, { headers: { "Content-Length": length } })), 400, "invalid-content-length");
  }
  const atLimit = syntheticJson.padEnd(4096, " ");
  assert.equal(encode(atLimit).byteLength, 4096);
  for (const headers of [{}, { "Content-Length": "4096" }]) {
    assert.equal((await handler(request(atLimit, { headers }))).status, 200);
  }
  const overLimit = atLimit + " ";
  for (const headers of [{}, { "Content-Length": "0" }, { "Content-Length": "1" }, { "Content-Length": "4096" }, { "Content-Length": "4097" }]) {
    await checkError(await handler(request(overLimit, { headers })), 413, "body-too-large");
  }
  const { stream, state } = chunked([encode(syntheticJson)]);
  await checkError(await handler(request(stream, { headers: { "Content-Length": "4097" } })), 413, "body-too-large");
  assert.equal(state.reads, 0, "An oversized declared body should be refused before reading");
  assert.equal(state.cancelled, true);
});

test("body bounds count UTF-8 bytes and stop reading oversized streams", async () => {
  const handler = createHandler(() => ({}));
  const multibyte = JSON.stringify({ utc: "é".repeat(2044) });
  assert.ok(multibyte.length < 4096 && encode(multibyte).byteLength > 4096);
  await checkError(await handler(request(multibyte)), 413, "body-too-large");
  for (const cancelRejects of [false, true]) {
    const { stream, state } = chunked([encode(" ".repeat(2048)), encode(" ".repeat(2049)), encode(syntheticJson)], { hang: true, cancelRejects });
    await checkError(await handler(request(stream)), 413, "body-too-large");
    assert.equal(state.cancelled, true);
    assert.equal(state.reads, 2, "No body chunks should be read after the limit is exceeded");
  }
  const raw = encode(JSON.stringify({ utc: "é" }));
  const split = raw.indexOf(0xc3) + 1;
  const { stream } = chunked([raw.slice(0, split), raw.slice(split)]);
  assert.equal((await handler(request(stream))).status, 200, "A split UTF-8 code point must decode correctly");
});

testHandlers("body stream failures, reused bodies and locked bodies are safe errors", async (_t, handler) => {
  const failing = new ReadableStream({ pull() { throw new Error("synthetic-private-stream-detail"); } });
  const payload = await checkError(await handler(request(failing)), 400, "unreadable-body");
  assert.ok(!JSON.stringify(payload).includes("synthetic-private-stream-detail"));
  const used = request();
  await used.text();
  await checkError(await handler(used), 400, "unreadable-body");
  const locked = request();
  const reader = locked.body.getReader();
  try {
    await checkError(await handler(locked), 400, "unreadable-body");
  } finally {
    reader.releaseLock();
  }
});

test("an always-ready empty stream cannot starve the body deadline", async () => {
  let pulls = 0;
  let cancelled = false;
  let calculations = 0;
  const handler = createHandler(() => { calculations++; return {}; });
  const stream = new ReadableStream({
    pull(controller) {
      pulls++;
      controller.enqueue(new Uint8Array());
    },
    cancel() { cancelled = true; }
  }, { highWaterMark: 0 });
  await checkError(await handler(request(stream)), 413, "body-too-fragmented");
  assert.equal(pulls, 4097);
  assert.equal(cancelled, true);
  assert.equal(calculations, 0);
});

test("the chunk limit accepts exactly the allowed number of chunks", async () => {
  const bytes = encode(syntheticJson.padEnd(4096, " "));
  const { stream, state } = chunked(Array.from(bytes, (byte) => new Uint8Array([byte])));
  const handler = createHandler(() => ({}));
  assert.equal((await handler(request(stream))).status, 200);
  assert.equal(state.reads, 4096);
});

testHandlers("failure responses do not wait for stream cancellation to settle", { timeout: 3000 }, async (_t, handler) => {
  let cancelled = false;
  const stream = new ReadableStream({
    pull(controller) { controller.enqueue(new Uint8Array(4097)); },
    cancel() {
      cancelled = true;
      return new Promise(() => {});
    }
  }, { highWaterMark: 0 });
  await checkError(await handler(request(stream)), 413, "body-too-large");
  assert.equal(cancelled, true);
});

testHandlers("aborted requests are refused before or while reading the body", async (_t, handler) => {
  for (const abortBefore of [true, false]) {
    const controller = new AbortController();
    const { stream, state } = chunked([], { hang: true });
    if (abortBefore) controller.abort(new Error("synthetic-private-abort-detail"));
    const pending = handler(request(stream, { signal: controller.signal }));
    if (!abortBefore) {
      await setImmediate();
      controller.abort(new Error("synthetic-private-abort-detail"));
    }
    const payload = await checkError(await pending, 400, "unreadable-body");
    assert.ok(!JSON.stringify(payload).includes("synthetic-private-abort-detail"));
    assert.equal(state.cancelled, true);
  }
});

testHandlers("the body deadline cancels a stream after exactly five seconds", async (t, handler) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { stream, state } = chunked([encode("{")], { hang: true });
  let settled = false;
  const pending = handler(request(stream)).then((response) => { settled = true; return response; });
  await setImmediate();
  t.mock.timers.tick(4999);
  await setImmediate();
  assert.equal(settled, false);
  t.mock.timers.tick(1);
  await checkError(await pending, 408, "body-timeout");
  assert.equal(state.cancelled, true);
});

test("calculation and serialization failures never expose raw error details", async () => {
  let internalError;
  for (const thrown of [new Error("synthetic-private-detail"), "synthetic-private-detail", null, { detail: "synthetic-private-detail" }]) {
    const handler = createHandler(() => { throw thrown; });
    const payload = await checkError(await handler(request()), 500, "calculation-failed");
    assert.ok(!JSON.stringify(payload).includes("synthetic-private-detail"));
    if (internalError) assert.deepEqual(payload, internalError);
    internalError = payload;
  }
  const rejected = createHandler(() => { throw new RangeError("synthetic-private-detail"); });
  const payload = await checkError(await rejected(request()), 422, "calculation-rejected");
  assert.ok(!JSON.stringify(payload).includes("synthetic-private-detail"));
  const circular = {};
  circular.self = circular;
  let serializationError;
  for (const value of [circular, { value: 1n }, { toJSON() { throw new RangeError("synthetic-private-detail"); } }]) {
    const handler = createHandler(() => value);
    const payload = await checkError(await handler(request()), 500, "calculation-failed");
    assert.ok(!JSON.stringify(payload).includes("synthetic-private-detail"));
    if (serializationError) assert.deepEqual(payload, serializationError);
    serializationError = payload;
  }
});
