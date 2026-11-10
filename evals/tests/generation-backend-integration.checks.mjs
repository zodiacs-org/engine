import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { inspect } from "node:util";
import test from "node:test";
import { createGenerationClient, GenerationError } from "../lib/generation-backend.mjs";

const project = fileURLToPath(new URL("..", import.meta.url));
const moduleUrl = new URL("../lib/generation-backend.mjs", import.meta.url).href;
const example = {
  schemaVersion: "1.0.0", promptVersion: "integration-v1",
  system: "Compose original symbolic prose for an offline integration check.",
  prompt: "Use the supplied synthetic factor only.", seed: 17
};

function adapter(generate, overrides = {}) {
  return {
    id: "integration-adapter", model: "integration-model", version: "v1",
    mode: "offline", generate, ...overrides
  };
}

function clientFor(generate, limits = {}) {
  return createGenerationClient({
    backend: "integration-adapter", adapters: [adapter(generate)], limits
  });
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function errorCode(expected) {
  return (error) => {
    assert.ok(error instanceof GenerationError);
    assert.equal(error.code, expected);
    assert.equal(Object.hasOwn(error, "cause"), false);
    return true;
  };
}

test("fresh-process mock generation needs no application file or network operations", () => {
  const source = `
    import assert from 'node:assert/strict';
    import fs from 'node:fs';
    import fsp from 'node:fs/promises';
    import http from 'node:http';
    import https from 'node:https';
    import net from 'node:net';
    import tls from 'node:tls';
    import dgram from 'node:dgram';
    import childProcess from 'node:child_process';
    import { syncBuiltinESMExports } from 'node:module';
    const deny = () => { throw new Error('External operation unavailable'); };
    const originalOpen = fs.open;
    const originalOpenSync = fs.openSync;
    const originalPromiseOpen = fsp.open;
    const readOnly = (flags) => flags === undefined || flags === 'r' || flags === 0;
    globalThis.fetch = deny;
    for (const name of [
      'writeFile', 'writeFileSync',
      'appendFile', 'appendFileSync', 'createReadStream',
      'createWriteStream', 'mkdir', 'mkdirSync', 'mkdtemp', 'mkdtempSync',
      'rename', 'renameSync', 'unlink', 'unlinkSync', 'rm', 'rmSync',
      'copyFile', 'copyFileSync', 'readdir', 'readdirSync'
    ]) fs[name] = deny;
    for (const name of [
      'writeFile', 'appendFile', 'mkdir', 'mkdtemp',
      'rename', 'unlink', 'rm', 'copyFile', 'readdir'
    ]) fsp[name] = deny;
    fs.open = (...args) => readOnly(args[1]) ? originalOpen(...args) : deny();
    fs.openSync = (...args) => readOnly(args[1]) ? originalOpenSync(...args) : deny();
    fsp.open = (...args) => readOnly(args[1]) ? originalPromiseOpen(...args) : deny();
    for (const api of [http, https]) { api.request = deny; api.get = deny; }
    net.connect = deny;
    net.createConnection = deny;
    net.Socket.prototype.connect = deny;
    tls.connect = deny;
    dgram.createSocket = deny;
    for (const name of ['exec', 'execSync', 'execFile', 'execFileSync', 'spawn', 'spawnSync', 'fork']) {
      childProcess[name] = deny;
    }
    syncBuiltinESMExports();
    const { createGenerationClient } = await import(${JSON.stringify(moduleUrl)});
    // Node's module loader uses readFile. After loading, generation may not.
    fs.readFile = deny;
    fs.readFileSync = deny;
    fs.open = deny;
    fs.openSync = deny;
    fsp.readFile = deny;
    fsp.open = deny;
    syncBuiltinESMExports();
    const client = createGenerationClient();
    const output = await client.generate(${JSON.stringify(example)});
    assert.equal(client.backend.id, 'mock');
    assert.equal(output.backend.mode, 'offline');
    process.stdout.write(JSON.stringify(output));
  `;
  const stdout = execFileSync(process.execPath, ["--input-type=module", "--eval", source], {
    cwd: project, encoding: "utf8", timeout: 10000, maxBuffer: 200000
  });
  const output = JSON.parse(stdout);
  assert.equal(output.backend.id, "mock");
  assert.equal(output.finishReason, "stop");
  assert.match(output.text, /offline mock/i);
  const meaning = JSON.parse(output.text);
  assert.equal(meaning.epistemicStatus, "symbolic-interpretation");
  assert.ok(typeof meaning.summary === "string" && meaning.summary.length > 0);
  assert.ok(Array.isArray(meaning.themes) && meaning.themes.length > 0);
});

test("mock receipts are repeatable across processes, working directories and key order", async () => {
  const reordered = Object.fromEntries(Object.entries(example).reverse());
  const expected = JSON.stringify(await createGenerationClient().generate(example));
  for (const [cwd, request] of [[project, example], [fileURLToPath(new URL("../..", import.meta.url)), reordered]]) {
    const source = `
      const { createGenerationClient } = await import(${JSON.stringify(moduleUrl)});
      process.stdout.write(JSON.stringify(await createGenerationClient().generate(${JSON.stringify(request)})));
    `;
    const actual = execFileSync(process.execPath, ["--input-type=module", "--eval", source], {
      cwd, encoding: "utf8", timeout: 10000, maxBuffer: 200000,
      env: {
        ...process.env,
        EVALS_BACKEND: "ambient-provider-must-not-run",
        GENERATION_BACKEND: "ambient-provider-must-not-run",
        LLM_BACKEND: "ambient-provider-must-not-run"
      }
    });
    assert.equal(actual, expected);
  }
  const changed = await createGenerationClient().generate({ ...example, seed: example.seed + 1 });
  assert.notEqual(changed.requestDigest, JSON.parse(expected).requestDigest);
  assert.notEqual(changed.text, JSON.parse(expected).text);
});

test("custom backends run only by explicit id and keep all supported finish reasons", async () => {
  const outputs = [
    { text: "{invalid JSON is still transport text", finishReason: "stop" },
    { text: "An intentionally incomplete response", finishReason: "length" },
    { text: "A supplied refusal is retained", finishReason: "refusal" }
  ];
  let calls = 0;
  const custom = adapter(async () => outputs[calls++]);
  await createGenerationClient({ adapters: [custom] }).generate(example);
  assert.equal(calls, 0);
  assert.throws(() => createGenerationClient({ backend: "unknown", adapters: [custom] }),
    errorCode("invalid-backend"));
  assert.equal(calls, 0);
  const client = createGenerationClient({ backend: custom.id, adapters: [custom] });
  for (const expected of outputs) {
    const output = await client.generate(example);
    assert.equal(output.text, expected.text);
    assert.equal(output.finishReason, expected.finishReason);
    assert.deepEqual(output.backend, {
      id: custom.id, model: custom.model, version: custom.version, mode: custom.mode
    });
  }
  assert.equal(calls, outputs.length);
});

test("started failures consume the budget without retry, fallback or raw-error disclosure", async () => {
  const marker = "PRIVATE_INTEGRATION_SENTINEL_NOT_A_CREDENTIAL";
  let calls = 0;
  const client = clientFor(async () => {
    calls += 1;
    const error = new Error(marker);
    error.response = { body: marker };
    throw error;
  }, { maxCalls: 1 });
  await assert.rejects(client.generate({ ...example, prompt: marker }), (error) => {
    errorCode("backend-failure")(error);
    assert.ok(!inspect(error, { showHidden: true, depth: 10 }).includes(marker));
    assert.ok(!JSON.stringify(error).includes(marker));
    return true;
  });
  assert.equal(calls, 1);
  await assert.rejects(client.generate(example), errorCode("call-limit"));
  assert.equal(calls, 1);
});

test("invalid and pre-aborted requests leave the invocation budget available", async () => {
  let calls = 0;
  const client = clientFor(async () => {
    calls += 1;
    return { text: "ok", finishReason: "stop" };
  }, { maxCalls: 1 });
  await assert.rejects(client.generate({ ...example, seed: -1 }), errorCode("invalid-request"));
  const controller = new AbortController();
  controller.abort("PRIVATE_ABORT_REASON_NOT_A_CREDENTIAL");
  await assert.rejects(client.generate(example, { signal: controller.signal }), errorCode("aborted"));
  assert.equal(calls, 0);
  assert.equal((await client.generate(example)).text, "ok");
  assert.equal(calls, 1);
  await assert.rejects(client.generate(example), errorCode("call-limit"));
});

test("oversized requests do not consume a call, while explicit refusals do", async () => {
  let calls = 0;
  const client = clientFor(() => {
    calls += 1;
    return { text: "", finishReason: "refusal" };
  }, { maxCalls: 1, maxInputBytes: Buffer.byteLength(JSON.stringify(example)) });
  await assert.rejects(client.generate({ ...example, prompt: `${example.prompt}月` }),
    errorCode("input-limit"));
  assert.equal(calls, 0);
  const result = await client.generate(example);
  assert.equal(result.text, "");
  assert.equal(result.finishReason, "refusal");
  await assert.rejects(client.generate(example), errorCode("call-limit"));
  assert.equal(calls, 1);
});

test("busy requests do not queue, consume budget or replace an active response", async () => {
  const started = deferred();
  const pending = deferred();
  let calls = 0;
  const client = clientFor(() => {
    calls += 1;
    started.resolve();
    return pending.promise;
  }, { maxCalls: 1 });
  const first = client.generate(example);
  await started.promise;
  await assert.rejects(client.generate(example), errorCode("busy"));
  assert.equal(calls, 1);
  pending.resolve({ text: "first response", finishReason: "stop" });
  assert.equal((await first).text, "first response");
  await assert.rejects(client.generate(example), errorCode("call-limit"));
  assert.equal(calls, 1);
});

test("deadline aborts the adapter and permanently closes the client despite late rejection", async () => {
  const pending = deferred();
  let signal;
  let calls = 0;
  const client = clientFor((_request, options) => {
    calls += 1;
    signal = options.signal;
    return pending.promise;
  }, { timeoutMs: 25, maxCalls: 2 });
  await assert.rejects(client.generate(example), errorCode("timeout"));
  assert.ok(signal instanceof AbortSignal);
  assert.equal(signal.aborted, true);
  await assert.rejects(client.generate(example), errorCode("closed"));
  pending.reject(new Error("LATE_PRIVATE_ERROR_NOT_A_CREDENTIAL"));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls, 1);
});

test("synchronous late output cannot bypass a deadline whose timer has not run", async () => {
  let signal;
  const client = clientFor((_request, options) => {
    signal = options.signal;
    // Deliberately block this test process so the timer cannot fire first.
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 30);
    return { text: "late synchronous response", finishReason: "stop" };
  }, { timeoutMs: 5 });
  await assert.rejects(client.generate(example), errorCode("timeout"));
  assert.equal(signal.aborted, true);
  await assert.rejects(client.generate(example), errorCode("closed"));
});

test("caller cancellation closes an active client and discards its later response", async () => {
  const started = deferred();
  const pending = deferred();
  let backendSignal;
  const client = clientFor((_request, { signal }) => {
    backendSignal = signal;
    started.resolve();
    return pending.promise;
  });
  const controller = new AbortController();
  const result = client.generate(example, { signal: controller.signal });
  const rejection = assert.rejects(result, (error) => {
    errorCode("aborted")(error);
    assert.ok(!inspect(error, { showHidden: true }).includes("PRIVATE_CANCEL_REASON"));
    return true;
  });
  await started.promise;
  controller.abort(new Error("PRIVATE_CANCEL_REASON"));
  await rejection;
  assert.equal(backendSignal.aborted, true);
  pending.resolve({ text: "too late", finishReason: "stop" });
  await new Promise((resolve) => setImmediate(resolve));
  await assert.rejects(client.generate(example), errorCode("closed"));
});

test("settled calls release cancellation wiring and return immutable data snapshots", async () => {
  const request = structuredClone(example);
  const before = structuredClone(request);
  const controller = new AbortController();
  let adapterSignal;
  const client = clientFor((received, { signal, maxOutputBytes }) => {
    assert.deepEqual(received, before);
    assert.equal(maxOutputBytes, 1024);
    adapterSignal = signal;
    return { text: "complete", finishReason: "stop" };
  }, { maxOutputBytes: 1024, maxCalls: 2 });
  const result = await client.generate(request, { signal: controller.signal });
  assert.deepEqual(request, before);
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.backend));
  assert.ok(Object.isFrozen(result.limits));
  assert.ok(Object.isFrozen(client.backend));
  assert.ok(Object.isFrozen(client.limits));
  assert.throws(() => { result.backend.model = "modified"; }, TypeError);
  assert.throws(() => { result.limits.maxCalls = 100; }, TypeError);
  assert.throws(() => { result.text = "modified"; }, TypeError);
  controller.abort();
  assert.equal(adapterSignal.aborted, false);
  assert.equal((await client.generate(example)).text, "complete");
});

test("response violations fail once and a later explicitly requested call can recover", async () => {
  for (const [bad, expected] of [
    [{ text: "PRIVATE_BAD_OUTPUT_NOT_A_CREDENTIAL", finishReason: "other" }, "invalid-response"],
    [{ text: "PRIVATE_BAD_OUTPUT_NOT_A_CREDENTIAL", finishReason: "stop", extra: true }, "invalid-response"],
    [{ text: "月月月", finishReason: "stop" }, "output-limit"]
  ]) {
    let calls = 0;
    const client = clientFor(() => ++calls === 1 ? bad : { text: "ok", finishReason: "stop" },
      { maxCalls: 2, maxOutputBytes: 8 });
    await assert.rejects(client.generate(example), (error) => {
      errorCode(expected)(error);
      assert.ok(!inspect(error, { showHidden: true }).includes("PRIVATE_BAD_OUTPUT"));
      return true;
    });
    assert.equal(calls, 1);
    assert.equal((await client.generate(example)).text, "ok");
    assert.equal(calls, 2);
    await assert.rejects(client.generate(example), errorCode("call-limit"));
  }
});
