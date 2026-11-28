import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { Readable, Writable } from "node:stream";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { profile, compareNames, personalYear, personalMonth, personalDay } from "../.build/index.js";
import { run } from "../cli/run.mjs";
import { MAX_JSON_BYTES, MAX_JSON_DEPTH, MAX_JSON_TOKENS } from "../cli/json.mjs";

const cli = fileURLToPath(new URL("../cli.mjs", import.meta.url));
const project = fileURLToPath(new URL("../", import.meta.url));
const root = fileURLToPath(new URL("../../", import.meta.url));
const schema = "numerology-cli/1";
const date = "2009-11-29";
const name = "Ael Vorn";
const target = "2000-10-22";
const request = { birthDate: date, name };

function invoke(args, settings = {}) {
  const { input, cwd = root, env = process.env, script = cli, nodeArgs = [] } = settings;
  const child = spawnSync(process.execPath, [...nodeArgs, script, ...args], {
    input, cwd, env, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, timeout: 20_000
  });
  assert.ifError(child.error);
  assert.equal(child.signal, null);
  return child;
}

function success(child, command, expected) {
  assert.equal(child.status, 0, child.stderr);
  assert.equal(child.stderr, "");
  const output = JSON.parse(child.stdout);
  assert.deepEqual(output, { schema, ok: true, command, result: expected });
  assert.equal(child.stdout, JSON.stringify(output) + "\n");
  return output.result;
}

function failure(child, code, status = 2) {
  assert.equal(child.status, status, child.stdout + child.stderr);
  assert.equal(child.stdout, "");
  const output = JSON.parse(child.stderr);
  assert.deepEqual(Object.keys(output), ["schema", "ok", "error"]);
  assert.equal(output.schema, schema);
  assert.equal(output.ok, false);
  assert.deepEqual(Object.keys(output.error), ["code", "message"]);
  assert.equal(output.error.code, code);
  assert.equal(typeof output.error.message, "string");
  assert(output.error.message.length > 0);
  assert.equal(child.stderr, JSON.stringify(output) + "\n");
  return output;
}

test("CLI profile flags and JSON modes retain complete default library receipts", () => {
  const expected = profile(date, name);
  const args = ["profile", "--birth-date", date, "--name", name];
  success(invoke(args), "profile", expected);
  success(invoke(["profile", "--name=" + name, "--birth-date=" + date], { cwd: project }), "profile", expected);
  success(invoke(["profile", "--input", JSON.stringify(request)]), "profile", expected);
  success(invoke(["profile", "--input=-"], { input: JSON.stringify(request) + "\n" }), "profile", expected);
  // Unselected stdin is ignored rather than merged into a flag request.
  success(invoke(args, { input: "invalid JSON" }), "profile", expected);
});

test("CLI comparison captures all conventions and exact custom mappings in both profiles", () => {
  const options = { system: "chaldean", masterNumbers: "reduce", method: "whole-date",
    yAsVowel: "when-no-other-vowels", targetDate: target,
    transliteration: { id: "synthetic-cli/1", mappings: { 林: "LIN", 月: "YUE" } } };
  const expected = compareNames(date, "林 Ly", "月 Y", options);
  const args = ["compare", "--birth-date", date, "--before-name", "林 Ly", "--after-name", "月 Y",
    "--target-date", target, "--system", options.system, "--master-numbers", options.masterNumbers,
    "--method", options.method, "--y-as-vowel", options.yAsVowel,
    "--transliteration", JSON.stringify(options.transliteration)];
  success(invoke(args), "compare", expected);
  success(invoke(["compare", "--input", "-"], { input: JSON.stringify({ birthDate: date,
    beforeName: "林 Ly", afterName: "月 Y", options }) }), "compare", expected);
  const identity = compareNames(date, "Mi", "Mi");
  success(invoke(["compare", "--birth-date", date, "--before-name", "Mi", "--after-name", "Mi"]),
    "compare", identity);
});

test("CLI cycles return all source receipts using only the explicit target and master policy", () => {
  for (const masterNumbers of ["preserve", "reduce"]) {
    const options = { masterNumbers };
    const expected = {
      personalYear: personalYear(date, target, options),
      personalMonth: personalMonth(date, target, options),
      personalDay: personalDay(date, target, options)
    };
    success(invoke(["cycles", "--birth-date", date, "--target-date", target,
      "--master-numbers", masterNumbers]), "cycles", expected);
    success(invoke(["cycles", "--input", JSON.stringify({ birthDate: date, targetDate: target, options })]),
      "cycles", expected);
  }
  failure(invoke(["cycles", "--birth-date", date]), "invalid-input");
});

test("CLI pretty output changes whitespace alone, remains deterministic, and preserves output order", () => {
  const args = ["profile", "--input", JSON.stringify(request), "--pretty"];
  const a = invoke(args);
  const b = invoke(args);
  assert.equal(a.status, 0, a.stderr);
  assert.equal(a.stderr, "");
  assert.equal(a.stdout, b.stdout);
  assert.equal(a.stdout, JSON.stringify(JSON.parse(a.stdout), null, 2) + "\n");
  assert.deepEqual(JSON.parse(a.stdout).result, profile(date, name));
});

test("CLI help is JSON, describes real transport limits, and needs no local build", () => {
  assert.equal(MAX_JSON_BYTES, 65_536);
  assert.equal(MAX_JSON_DEPTH, 16);
  assert.equal(MAX_JSON_TOKENS, 10_000);
  mkdirSync(new URL("../.cache/", import.meta.url), { recursive: true });
  const directory = mkdtempSync(fileURLToPath(new URL("../.cache/cli-unbuilt-", import.meta.url)));
  try {
    cpSync(cli, directory + "/cli.mjs");
    cpSync(new URL("../cli/", import.meta.url), directory + "/cli", { recursive: true });
    for (const args of [["--help"], ...["profile", "cycles", "compare"].map((command) => [command, "--help"])]) {
      const child = invoke(args, { script: directory + "/cli.mjs" });
      assert.equal(child.status, 0, child.stderr);
      assert.equal(child.stderr, "");
      const output = JSON.parse(child.stdout);
      assert.equal(output.schema, schema);
      assert.equal(output.ok, true);
      assert.deepEqual(output.help.limits, { jsonBytes: MAX_JSON_BYTES,
        jsonDepth: MAX_JSON_DEPTH, jsonTokens: MAX_JSON_TOKENS });
      assert.deepEqual(output.help.exitCodes, { success: 0, ioOrInternalError: 1, invalidArgumentsOrInput: 2 });
      assert.equal(output.help.command, args.length === 2 ? args[0] : undefined);
      assert.equal(child.stdout, JSON.stringify(output) + "\n");
    }
    failure(invoke(["profile", "--input", JSON.stringify(request)], { script: directory + "/cli.mjs" }),
      "library-unavailable", 1);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("CLI rejects unknown commands, inapplicable flags, duplicate flags, missing values, and extra arguments", () => {
  const invalid = [[], ["PROFILE"], ["__proto__"], ["constructor"], ["profile", "--help", "--pretty"],
    ["profile", "--help=true"], ["profile", "--pretty=true"], ["profile", "--pretty", "--pretty"],
    ["profile", "--name", "--birth-date", date], ["profile", "--name"], ["profile", "--name="],
    ["profile", "--name", ""], ["profile", "-n", name], ["profile", "--nmae", name],
    ["profile", name], ["profile", "--", name], ["profile", "--name", name, "extra"],
    ["profile", "--birth-date", date, "--birth-date=" + date],
    ["profile", "--input", "{}", "--input", "{}"],
    ["profile", "--input", "{}", "--name", name], ["profile", "--name", name, "--input", "{}"],
    ["profile", "--input", "{}", "--target-date", target],
    ["cycles", "--name", name], ["cycles", "--system", "chaldean"],
    ["cycles", "--method", "components"], ["cycles", "--y-as-vowel", "always"],
    ["cycles", "--transliteration", "{}"], ["compare", "--name", name]];
  for (const args of invalid) failure(invoke(args), "invalid-arguments");
});

test("CLI JSON request validation rejects unknown and inherited-looking keys, wrong types, and wrong schemas", () => {
  const invalid = [null, [], true, 7, "profile", {}, { birthDate: date }, { name },
    { ...request, extra: true }, { ...request, command: "profile" }, { ...request, targetDate: target },
    { ...request, Name: name }, { ...request, options: null }, { ...request, options: [] },
    { ...request, options: "preserve" }, { ...request, options: { system: null } },
    { ...request, options: { masterNumbers: true } }, { ...request, options: { method: "Components" } },
    { ...request, options: { yAsVowel: "sometimes" } }, { ...request, options: { targetDate: null } },
    { ...request, options: { targetDate: 20000101 } }, { ...request, options: { masterNumber: "reduce" } },
    { ...request, options: { system: "CHALDEAN" } }, { ...request, options: { transliteration: null } },
    { ...request, options: { transliteration: { id: "cli/1", mappings: { 林: "lin" } } } },
    { ...request, birthDate: { iso: date } }, { ...request, name: false }, { ...request, name: "" },
    { ...request, name: [name] }, { ...request, birthDate: "" }];
  for (const value of invalid) failure(invoke(["profile", "--input", JSON.stringify(value)]), "invalid-input");
  for (const key of ["__proto__", "constructor", "toString"]) {
    failure(invoke(["profile", "--input", JSON.stringify(request).replace(/}$/, `,"${key}":{}}`)]), "invalid-input");
    failure(invoke(["profile", "--input", JSON.stringify({ ...request, options: { [key]: {} } })]), "invalid-input");
  }
  for (const options of [{ system: "pythagorean" }, { targetDate: target }, { method: "components" }]) {
    failure(invoke(["cycles", "--input", JSON.stringify({ birthDate: date, targetDate: target, options })]), "invalid-input");
  }
  failure(invoke(["compare", "--input", JSON.stringify({ ...request, afterName: "Mi" })]), "invalid-input");
});

test("CLI delegates date, name, and table domains without coercion and reports fixed diagnostics", () => {
  const inputs = [
    { ...request, birthDate: "2001-02-29" }, { ...request, birthDate: "2000-01-01T00:00:00Z" },
    { ...request, birthDate: "0000-01-01" }, { ...request, name: "林" },
    { ...request, name: "A\u0000B" }, { ...request, name: "A\ud800B" },
    { ...request, name: "A".repeat(1025) }, { ...request, options: { targetDate: "2100-02-29" } },
    { ...request, options: { transliteration: { id: "synthetic/1", mappings: { "AB": "A" } } } }
  ];
  let diagnostic;
  for (const value of inputs) {
    const output = failure(invoke(["profile", "--input", "-"], { input: JSON.stringify(value) }), "invalid-input");
    diagnostic ??= output;
    assert.deepEqual(output, diagnostic);
    assert(!JSON.stringify(output).includes(value.birthDate));
  }
  failure(invoke(["profile", "--birth-date", date, "--name", name, "--master-numbers", "none"]), "invalid-input");
  failure(invoke(["profile", "--birth-date", date, "--name", name, "--transliteration", "bad JSON"]), "invalid-json");
});

test("CLI strict JSON rejects syntax errors, multiple values, BOMs, and duplicate decoded keys", () => {
  const invalid = ["", " ", "{", "{} {}", "null\nnull", '{"name":NaN}', '{"name":Infinity}',
    '{"name":"x",}', "/*comment*/{}", "\ufeff{}", '{"name":"\\x41"}'];
  for (const input of invalid) failure(invoke(["profile", "--input", "-"], { input }), "invalid-json");
  const duplicates = [
    '{"birthDate":"2009-11-29","name":"A","name":"B"}',
    '{"birthDate":"2009-11-29","name":"A","na\\u006de":"B"}',
    '{"birthDate":"2009-11-29","name":"A","options":{"system":"chaldean","system":"pythagorean"}}',
    '{"birthDate":"2009-11-29","name":"A","options":{"transliteration":{"id":"cli/1","mappings":{"林":"A","\\u6797":"B"}}}}'
  ];
  for (const input of duplicates) {
    failure(invoke(["profile", "--input", input]), "duplicate-key");
    failure(invoke(["profile", "--input", "-"], { input }), "duplicate-key");
  }
  const escaped = { ...request, name: 'A "name":"A","name":"B" \\ {} []' };
  // Scanner punctuation inside strings must not masquerade as keys/braces.
  failure(invoke(["profile", "--input", JSON.stringify(escaped)]), "invalid-input");
  success(invoke(["profile", "--input", '{"birthDate":"2009-11-29","name":"A", "options":{"transliteration":{"id":"cli/1","mappings":{"林":"A"}}}}']),
    "profile", profile(date, "A", { transliteration: { id: "cli/1", mappings: { 林: "A" } } }));
});

test("CLI stdin uses strict UTF-8 and transport bounds count bytes rather than UTF-16 units", () => {
  failure(invoke(["profile", "--input", "-"], { input: Buffer.from([0x7b, 0xff, 0x7d]) }), "invalid-encoding");
  failure(invoke(["profile", "--input", "-"], { input: Buffer.from([0xe2, 0x82]) }), "invalid-encoding");
  const json = JSON.stringify({ birthDate: date, name: "Ίρα Ёл" });
  success(invoke(["profile", "--input", "-"], { input: Buffer.from(json) }), "profile", profile(date, "Ίρα Ёл"));
  const boundary = JSON.stringify(request).padEnd(MAX_JSON_BYTES, " ");
  success(invoke(["profile", "--input", boundary]), "profile", profile(date, name));
  success(invoke(["profile", "--input", "-"], { input: boundary }), "profile", profile(date, name));
  failure(invoke(["profile", "--input", boundary + " "]), "input-limit");
  failure(invoke(["profile", "--input", "-"], { input: boundary + " " }), "input-limit");
  const unicode = JSON.stringify({ ...request, name: "林".repeat(22_000) });
  assert(unicode.length < MAX_JSON_BYTES && Buffer.byteLength(unicode) > MAX_JSON_BYTES);
  failure(invoke(["profile", "--input", "-"], { input: unicode }), "input-limit");
  failure(invoke(["profile", "--input", "[".repeat(MAX_JSON_DEPTH + 1) + "0" + "]".repeat(MAX_JSON_DEPTH + 1)]), "input-limit");
  failure(invoke(["profile", "--input", JSON.stringify(Array(MAX_JSON_TOKENS).fill(0))]), "input-limit");
  // Exactly the depth bound scans successfully before request-shape rejection.
  failure(invoke(["profile", "--input", "[".repeat(MAX_JSON_DEPTH) + "0" + "]".repeat(MAX_JSON_DEPTH)]), "invalid-input");
  // Valid JSON has an odd token count. These controls straddle the token cap
  // by one token while staying well below the independent byte bound.
  failure(invoke(["profile", "--input", JSON.stringify(Array(MAX_JSON_TOKENS / 2 - 1).fill(0))]), "invalid-input");
  failure(invoke(["profile", "--input", JSON.stringify(Array(MAX_JSON_TOKENS / 2).fill(0))]), "input-limit");
});

test("CLI byte chunks may split a UTF-8 scalar without corrupting a valid name", async () => {
  const input = Buffer.from(JSON.stringify({ birthDate: date, name: "Ίρα Ёл" }));
  const pieces = Array.from(input, (byte) => Buffer.from([byte]));
  const channels = streams();
  const status = await run(["profile", "--input", "-"], { ...channels, stdin: Readable.from(pieces) });
  success({ status, stdout: channels.output(), stderr: channels.error() }, "profile", profile(date, "Ίρα Ёл"));
});

function streams() {
  let output = "";
  let error = "";
  return {
    stdin: Readable.from([]),
    stdout: new Writable({ write(chunk, encoding, callback) { output += chunk.toString(); callback(); } }),
    stderr: new Writable({ write(chunk, encoding, callback) { error += chunk.toString(); callback(); } }),
    output: () => output, error: () => error
  };
}

test("CLI reports stdin and stdout IO errors, handles unavailable stderr, and refuses terminal input", async () => {
  let channels = streams();
  const tty = Readable.from([]);
  tty.isTTY = true;
  let status = await run(["profile", "--input", "-"], { ...channels, stdin: tty });
  failure({ status, stdout: channels.output(), stderr: channels.error() }, "invalid-input");
  channels = streams();
  const unreadable = new Readable({ read() { this.destroy(new Error("PRIVATE input stream failure")); } });
  status = await run(["profile", "--input", "-"], { ...channels, stdin: unreadable });
  failure({ status, stdout: channels.output(), stderr: channels.error() }, "input-io", 1);
  channels = streams();
  const broken = () => new Writable({ write(chunk, encoding, callback) {
    callback(Object.assign(new Error("PRIVATE output stream failure"), { code: "EPIPE" }));
  } });
  status = await run(["--help"], { ...channels, stdout: broken() });
  failure({ status, stdout: channels.output(), stderr: channels.error() }, "output-io", 1);
  assert.equal(await run(["no-command"], { ...streams(), stderr: broken() }), 1);
});

test("CLI reports oversized streaming stdin before EOF without waiting for more input", async () => {
  const child = spawn(process.execPath, [cli, "profile", "--input", "-"], { stdio: ["pipe", "pipe", "pipe"] });
  const result = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new Error("CLI waited for EOF after exceeding the limit")); }, 10_000);
    let stdout = "";
    let stderr = "";
    child.on("error", reject);
    child.stdin.on("error", () => { /* Reader can close while input is queued. */ });
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (status) => { clearTimeout(timer); resolve({ status, stdout, stderr }); });
    child.stdin.write(" ".repeat(MAX_JSON_BYTES + 1));
  });
  failure(result, "input-limit");
});

test("CLI subprocess returns a structured output failure when the downstream pipe closes", async () => {
  const child = spawn(process.execPath, [cli, "profile", "--input", "-"], { stdio: ["pipe", "pipe", "pipe"] });
  const result = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new Error("CLI did not finish after a broken stdout pipe")); }, 10_000);
    let stderr = "";
    child.on("error", reject);
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (status) => { clearTimeout(timer); resolve({ status, stdout: "", stderr }); });
    // Close the reader before supplying the request so the first output write
    // encounters EPIPE in the real process, beyond the stream-unit controls.
    child.stdout.destroy();
    child.stdin.end(JSON.stringify(request));
  });
  failure(result, "output-io", 1);
});

test("CLI output is independent of host timezone and works with clock/network entry points disabled", () => {
  const expected = profile(date, "Ίρα Ёл", { targetDate: target });
  const input = JSON.stringify({ birthDate: date, name: "Ίρα Ёл", options: { targetDate: target } });
  const preload = "data:text/javascript," + encodeURIComponent(`
    globalThis.Date = class { constructor() { throw Error('clock disabled'); } static now() { throw Error('clock disabled'); } };
    globalThis.fetch = () => { throw Error('network disabled'); };
    for (const name of ['node:http', 'node:https']) {
      const module = (await import(name)).default;
      module.request = module.get = () => { throw Error('network disabled'); };
    }
  `);
  let output;
  for (const TZ of ["UTC", "America/New_York", "Asia/Bangkok"]) {
    const child = invoke(["profile", "--input", "-"], { input, env: { ...process.env, TZ },
      nodeArgs: ["--import", preload] });
    success(child, "profile", expected);
    output ??= child.stdout;
    assert.equal(child.stdout, output);
  }
});
